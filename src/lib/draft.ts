import { prisma } from './db.js';
import { complete } from './llm.js';
import { draftSystemPrompt } from './style.js';
import { findPhoto } from './photo.js';
import { normalize, findIssues, rewriteInstruction } from './quality.js';

/**
 * Пишет готовый текст поста по инфоповоду.
 *
 * Ключевое ограничение: модель пишет только по тем материалам, что мы собрали.
 * Ей запрещено добавлять факты «из головы» — иначе в канал уедет выдумка,
 * а отвечать за неё будет автор канала.
 */

/** Сколько знаков исходников отдаём модели на один инфоповод. */
const MAX_SOURCE_CHARS = 4000;

export interface DraftPayload {
  storyId: string;
  title: string;
  text: string;
  imageUrl: string | null;
  imageCredit: string | null;
  sources: { name: string; url: string; tier: number }[];
  confidence: 'CONFIRMED' | 'UNCONFIRMED';
  confidenceNote: string | null;
  urgency: number;
  importance: number;
  category: string;
}

export async function writeDraft(storyId: string): Promise<DraftPayload | null> {
  const story = await prisma.story.findUnique({
    where: { id: storyId },
    include: { items: { include: { source: true }, orderBy: { publishedAt: 'asc' } } },
  });

  if (!story || story.items.length === 0) return null;

  const material = story.items
    .map((item) => {
      const summary = item.summary ? `\n${item.summary}` : '';
      return `[${item.source.name}] ${item.title}${summary}\nСсылка: ${item.url}`;
    })
    .join('\n\n')
    .slice(0, MAX_SOURCE_CHARS);

  const prompt = [
    'Напиши пост для канала по материалам ниже.',
    '',
    'Правила именно для этого текста:',
    '— Всё строчными буквами, без эмодзи, без markdown.',
    '— 80–300 знаков. Одна мысль, остальное выбрось.',
    '— Пиши только то, что есть в материалах. Ничего не додумывай.',
    '— Не пиши заголовок, только сам текст поста.',
    '— Без оценок и реакций от себя, только то, что произошло.',
    story.confidence === 'UNCONFIRMED'
      ? '— Новость пока не подтверждена вторым источником. Не утверждай её как факт: используй осторожные формулировки вроде «сообщает», «по данным».'
      : '',
    '',
    `Суть события: ${story.gist}`,
    '',
    'Материалы:',
    material,
  ]
    .filter(Boolean)
    .join('\n');

  const system = draftSystemPrompt();

  let text = normalize(await complete(prompt, { system, temperature: 0.8 }));

  // Одна попытка исправиться с конкретным замечанием. Второй заход не делаем:
  // если модель не поняла с первого раза, дальше она обычно ломает текст сильнее,
  // а редактор всё равно вычитывает черновик перед публикацией.
  const issues = findIssues(text);
  if (issues.length > 0) {
    console.log(`Переписываю «${story.title}»: ${issues.map((i) => i.detail).join('; ')}`);
    try {
      const retry = normalize(
        await complete([prompt, '', 'Твой вариант:', text, '', rewriteInstruction(issues)].join('\n'), {
          system,
          temperature: 0.6,
        }),
      );
      // Берём переписанный вариант, только если он действительно чище
      if (findIssues(retry).length < issues.length) text = retry;
    } catch (error) {
      console.warn('Переписать не удалось, оставляю первый вариант:', error);
    }
  }

  const photo = await findPhoto(story, story.items);

  const sources = [...new Map(story.items.map((i) => [i.source.slug, i])).values()]
    .sort((a, b) => a.source.tier - b.source.tier)
    .map((i) => ({ name: i.source.name, url: i.url, tier: i.source.tier }));

  await prisma.draft.upsert({
    where: { storyId: story.id },
    create: {
      storyId: story.id,
      text,
      imageUrl: photo?.url ?? null,
      imageCredit: photo?.credit ?? null,
    },
    update: {
      text,
      imageUrl: photo?.url ?? null,
      imageCredit: photo?.credit ?? null,
    },
  });

  await prisma.story.update({ where: { id: story.id }, data: { status: 'DRAFTED' } });

  return {
    storyId: story.id,
    title: story.title,
    text,
    imageUrl: photo?.url ?? null,
    imageCredit: photo?.credit ?? null,
    sources,
    confidence: story.confidence,
    confidenceNote: story.confidenceNote,
    urgency: story.urgency,
    importance: story.importance,
    category: story.category,
  };
}
