import { prisma } from './db.js';
import { complete } from './llm.js';
import { findPhoto } from './photo.js';
import { normalize, findIssues, rewriteInstruction } from './quality.js';

/**
 * Готовит справку по инфоповоду: краткий пересказ, ссылки на источники
 * и фотографию.
 *
 * Это НЕ готовый пост. Раньше агент писал текст в стиле канала, но подбирать
 * чужой голос машиной выходило плохо, поэтому пост редактор пишет сам —
 * от агента нужно понять, о чём новость, и получить материал к ней.
 *
 * Ключевое ограничение осталось прежним: модель пересказывает только то, что
 * есть в собранных материалах. Добавлять факты «из головы» запрещено.
 */

/** Сколько знаков исходников отдаём модели на один инфоповод. */
const MAX_SOURCE_CHARS = 4000;

const SUMMARY_SYSTEM =
  'Ты — новостной редактор. Пересказываешь новости коротко, точно и без ' +
  'украшательств. Никогда не добавляешь фактов, которых нет в исходных ' +
  'материалах. ВСЕГДА отвечаешь на русском языке, даже если исходники ' +
  'на английском: твоя задача — перевести и сжать, а не пересказать дословно.';

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
    'Перескажи новость по материалам ниже — коротко и по делу.',
    '',
    'Это НЕ пост для публикации, а справка для редактора: он прочитает её,',
    'решит, брать тему или нет, и напишет пост сам. Поэтому важна не',
    'красота формулировок, а точность и полнота фактов.',
    '',
    'Правила:',
    '— 2–3 предложения, до 350 знаков. Это справка, а не пересказ статьи.',
    '— Только факты из материалов. Ничего не додумывай.',
    '— Главное: кто, что и когда. Дату выхода и цену указывай, если они есть,\n      но не перечисляй все позиции коллекции и все цены подряд.',
    '— Без оценок, без рекламных оборотов, без markdown и эмодзи.',
    '— Не пиши заголовок, только сам пересказ.',
    '— Пиши ПО-РУССКИ. Латиницей оставляй только имена и названия.',
    story.confidence === 'UNCONFIRMED'
      ? '— Новость пока не подтверждена вторым источником. Не утверждай её как факт: пиши «сообщает», «по данным».'
      : '',
    '',
    `Суть события: ${story.gist}`,
    '',
    'Материалы:',
    material,
  ]
    .filter(Boolean)
    .join('\n');

  // Стиль канала здесь намеренно не применяется: это справка редактору,
  // а не готовый пост. Пост он пишет сам, своим голосом.
  let text = normalize(
    await complete(prompt, { system: SUMMARY_SYSTEM, temperature: 0.4, maxTokens: 700 }),
  );

  // Одна попытка исправиться с конкретным замечанием. Второй заход не делаем:
  // если модель не поняла с первого раза, дальше она обычно ломает текст сильнее,
  // а редактор всё равно вычитывает черновик перед публикацией.
  const issues = findIssues(text);
  if (issues.length > 0) {
    console.log(`Переписываю «${story.title}»: ${issues.map((i) => i.detail).join('; ')}`);
    try {
      const retry = normalize(
        await complete([prompt, '', 'Твой вариант:', text, '', rewriteInstruction(issues)].join('\n'), {
          system: SUMMARY_SYSTEM,
          temperature: 0.3,
          maxTokens: 700,
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
