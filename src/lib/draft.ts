import { prisma } from './db.js';
import { complete } from './llm.js';
import { findPhotos } from './photo.js';
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
  'Ты — редактор телеграм-канала про хип-хоп, стритвир и нба. Пересказываешь ' +
  'новости коротко и живым разговорным языком, как рассказал бы приятелю, ' +
  'который в теме. Никогда не добавляешь фактов, которых нет в исходных ' +
  'материалах. ВСЕГДА отвечаешь по-русски, но термины тусовки (tunnel fit, ' +
  'дроп, коллаба, сниппет, биф) оставляешь как есть — их так и говорят.';

export interface DraftPayload {
  storyId: string;
  title: string;
  text: string;
  imageUrl: string | null;
  imageCredit: string | null;
  /** Все найденные варианты — уходят альбомом, редактор выбирает нужный. */
  imageOptions: { url: string; credit: string }[];
  sources: { name: string; url: string; tier: number }[];
  confidence: 'CONFIRMED' | 'UNCONFIRMED';
  confidenceNote: string | null;
  urgency: number;
  importance: number;
  category: string;
  /** Когда новость вышла у источника — редактору важно понимать свежесть. */
  publishedAt: Date;
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
    '— 3–4 предложения, до 450 знаков.',
    '— Только факты из материалов. Ничего не додумывай.',
    '— Главное: кто, что и когда. Дату выхода и цену указывай, если они есть,\n      но не перечисляй все позиции коллекции и все цены подряд.',
    '— Без оценок, без рекламных оборотов, без markdown и эмодзи.',
    '— Не пиши заголовок, только сам пересказ.',
    '— Пиши ПО-РУССКИ, но живо и разговорно — как рассказал бы приятелю.',
    '— Тусовочные словечки НЕ переводи: tunnel fit, дроп, фит, коллаба,\n'
      + '      сниппет, релиз, биф, мерч, лук — так и оставляй. «Образ перед\n'
      + '      игрой» вместо «tunnel fit» звучит казённо и не годится.',
    '— Можно лёгкий сленг в речи: «выкатил», «завёз», «типа», «зашло».\n'
      + '      Одного-двух оборотов на текст достаточно, перебор — кринж.',
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

  const photos = await findPhotos(story, story.items, 5);
  const photo = photos[0] ?? null;

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
    imageOptions: photos,
    sources,
    confidence: story.confidence,
    confidenceNote: story.confidenceNote,
    urgency: story.urgency,
    importance: story.importance,
    category: story.category,
    publishedAt: story.items[0]?.publishedAt ?? story.createdAt,
  };
}
