import { prisma, connectWithRetry } from '../lib/db.js';
import { collectAll } from '../lib/collect.js';
import { clusterNewItems } from '../lib/cluster.js';
import { writeDraft } from '../lib/draft.js';
import {
  sendDraft,
  sendPlan,
  sendUrgentHeader,
  sendUnconfirmedAlert,
  sendMessage,
} from '../lib/telegram.js';

/**
 * Два режима работы:
 *
 *   collect — раз в три часа. Забирает свежее, разбирает на инфоповоды и
 *             сразу отправляет только то, что горит. Остальное копится.
 *   digest  — три раза в день. Берёт накопленное, выстраивает план и
 *             присылает пачку карточек: суть, источники, фотография.
 *
 * Агент не пишет готовые посты — он приносит материал, а текст редактор
 * пишет сам.
 */

/** Насколько срочной должна быть новость, чтобы уйти вне дайджеста. */
const URGENT_MIN_URGENCY = 4;
const URGENT_MIN_IMPORTANCE = 3;

/** Громкая неподтверждённая новость — присылаем сигналом. */
const ALERT_MIN_IMPORTANCE = 4;

/**
 * Сколько карточек максимум в одном дайджесте.
 *
 * Ограничивать было ошибкой: агент не умеет угадать, что именно захочется
 * опубликовать, и отсекал заодно хорошее. Присылаем всё подходящее — выбирает
 * редактор, ему это дешевле, чем недополучить тему.
 */
const DIGEST_SIZE = 8;

/**
 * Ниже этой важности новость не отправляем вовсе.
 *
 * Канал должен быть про то, что обсуждают, а не про всё подряд. Двойки и
 * единицы — это заметки для узкого круга поклонников, из-за них выдача
 * выглядела мусорной.
 */
const MIN_IMPORTANCE = 2;

/** Через сколько дней неразобранный сюжет перестаёт быть актуальным. */
const STORY_TTL_DAYS = 3;

/**
 * Статусы сюжетов, которые ещё ждут отправки.
 *
 * DRAFTED обязательно должен быть здесь: если отправка сорвалась уже после
 * того, как текст написан, сюжет остаётся в этом статусе. Пока сюда смотрел
 * только SCORED, такие сюжеты выпадали из конвейера навсегда.
 */
const PENDING: ('SCORED' | 'DRAFTED')[] = ['SCORED', 'DRAFTED'];

/**
 * Сколько материалов разбираем за раз в каждом режиме.
 *
 * У Groq потолок 200 тысяч токенов в сутки на модель. Сбор идёт восемь раз
 * в день, дайджест — трижды, и вместе они должны укладываться в лимит.
 */
const COLLECT_BATCH = 45;
const DIGEST_BATCH = 80;

/**
 * Сколько сюжетов одной темы пускаем в одну выдачу.
 *
 * Ленты наполняются очень неравномерно: ArchDaily выкладывает по два десятка
 * карточек проектов в день, спортивные ленты — матчи каждый день, а показы и
 * релизы случаются реже. Без квоты одна такая лента забирает всю подборку:
 * в первом дайджесте семь черновиков из восьми оказались архитектурой.
 */
const CATEGORY_LIMIT = 3;

/** Спорта в канале должно быть особенно мало. */
const SPORT_LIMIT = 2;

/**
 * Злободневные новости про запреты и блокировки идут отдельной квотой.
 *
 * Они нужны, чтобы разбавлять ленту модных новостей, но лента про моду не
 * должна превратиться в ленту про запреты — поэтому не больше одной за раз.
 */
const TOPICAL_LIMIT = 1;

type StoryWithItems = Awaited<ReturnType<typeof loadStories>>[number];

async function loadStories(where: object, take: number) {
  // Берём с запасом: окончательный порядок считаем в коде, с учётом веса
  // источника, а он в запрос не выражается.
  return prisma.story.findMany({
    where,
    include: { items: { include: { source: true } } },
    orderBy: [{ importance: 'desc' }, { urgency: 'desc' }, { createdAt: 'desc' }],
    take: take * 4,
  });
}

/**
 * Итоговый вес сюжета. Кроме важности и срочности учитывает, насколько мы
 * ценим издание: новость из Hypebeast каналу интереснее такой же новости
 * из ленты общего профиля.
 */
function score(story: StoryWithItems): number {
  const bestSource = Math.max(0, ...story.items.map((i) => i.source.weight));
  const manySources = story.items.length > 1 ? 2 : 0;
  return story.importance * 3 + story.urgency * 2 + bestSource + manySources;
}

/** Выстраивает сюжеты по значимости и следит, чтобы одна тема не заняла всё. */
function rank(stories: StoryWithItems[], limit: number): StoryWithItems[] {
  const sorted = [...stories].sort((a, b) => score(b) - score(a));
  const picked: StoryWithItems[] = [];
  const taken = new Map<string, number>();

  for (const story of sorted) {
    if (picked.length >= limit) break;

    const bucket = story.topical ? 'TOPICAL' : story.category;
    const quota = story.topical
      ? TOPICAL_LIMIT
      : story.category === 'SPORT'
        ? SPORT_LIMIT
        : CATEGORY_LIMIT;

    const used = taken.get(bucket) ?? 0;
    if (used >= quota) continue;

    taken.set(bucket, used + 1);
    picked.push(story);
  }

  return picked;
}

function sourcesOf(story: StoryWithItems) {
  return [...new Map(story.items.map((i) => [i.source.slug, i])).values()].map((i) => ({
    name: i.source.name,
    url: i.url,
  }));
}

/** Отправляет один сюжет: готовым черновиком либо сигналом, если не подтверждён. */
async function deliver(story: StoryWithItems): Promise<'draft' | 'alert' | 'skip'> {
  if (story.confidence === 'UNCONFIRMED') {
    if (story.importance < ALERT_MIN_IMPORTANCE) return 'skip';

    await sendUnconfirmedAlert({
      title: story.title,
      gist: story.gist,
      confidenceNote: story.confidenceNote,
      importance: story.importance,
      sources: sourcesOf(story),
    });
    await prisma.story.update({ where: { id: story.id }, data: { status: 'SENT' } });
    return 'alert';
  }

  const draft = await writeDraft(story.id);
  if (!draft) return 'skip';

  const messageId = await sendDraft(draft);
  await prisma.$transaction([
    prisma.story.update({ where: { id: story.id }, data: { status: 'SENT' } }),
    prisma.draft.update({
      where: { storyId: story.id },
      data: { sentAt: new Date(), tgMessageId: messageId },
    }),
  ]);
  return 'draft';
}

/** Убирает из очереди сюжеты, которые так и не подтвердились и уже неактуальны. */
async function expireStale(): Promise<number> {
  const cutoff = new Date(Date.now() - STORY_TTL_DAYS * 24 * 60 * 60 * 1000);
  const result = await prisma.story.updateMany({
    where: { status: { in: PENDING }, createdAt: { lt: cutoff } },
    data: { status: 'SKIPPED' },
  });
  return result.count;
}

async function runCollect(): Promise<void> {
  const run = await prisma.run.create({ data: { kind: 'collect' } });

  const collected = await collectAll();
  console.log(`Собрано новых материалов: ${collected.added}`);
  for (const failure of collected.failed) {
    console.warn(`Лента не ответила — ${failure.source}: ${failure.error}`);
  }

  const clustered = await clusterNewItems(COLLECT_BATCH);
  console.log(
    `Инфоповодов: новых ${clustered.created}, дополнено ${clustered.merged}, отсеяно материалов ${clustered.skipped}`,
  );

  // Из свежесобранного отправляем только то, что действительно горит
  const urgent = rank(
    await loadStories(
      {
        status: { in: PENDING },
        urgency: { gte: URGENT_MIN_URGENCY },
        importance: { gte: URGENT_MIN_IMPORTANCE },
      },
      2,
    ),
    2,
  );

  let sent = 0;
  if (urgent.length > 0) {
    await sendUrgentHeader(urgent.length);
    for (const story of urgent) {
      try {
        const outcome = await deliver(story);
        if (outcome !== 'skip') sent += 1;
      } catch (error) {
        console.error(`Не удалось отправить «${story.title}»:`, error);
      }
    }
  }

  const expired = await expireStale();
  if (expired > 0) console.log(`Просрочено и снято с очереди: ${expired}`);

  await prisma.run.update({
    where: { id: run.id },
    data: {
      finishedAt: new Date(),
      itemsAdded: collected.added,
      storiesMade: clustered.created,
      draftsSent: sent,
    },
  });

  console.log(`Отправлено срочных: ${sent}`);
}

async function runDigest(): Promise<void> {
  const run = await prisma.run.create({ data: { kind: 'digest' } });

  // Перед дайджестом добираем свежее, чтобы подборка была актуальной
  const collected = await collectAll();
  const clustered = await clusterNewItems(DIGEST_BATCH);
  console.log(`Добрано материалов: ${collected.added}, инфоповодов: ${clustered.created}`);

  const stories = await loadStories(
    { status: { in: PENDING }, importance: { gte: MIN_IMPORTANCE } },
    DIGEST_SIZE,
  );

  // Подтверждённые идут черновиками, громкие неподтверждённые — сигналами.
  // Тихие неподтверждённые ждут: возможно, их подтвердят к следующему разу.
  const confirmed = rank(
    stories.filter((s) => s.confidence === 'CONFIRMED'),
    DIGEST_SIZE,
  );
  const alerts = rank(
    stories.filter(
      (s) => s.confidence === 'UNCONFIRMED' && s.importance >= ALERT_MIN_IMPORTANCE,
    ),
    3,
  );

  if (confirmed.length === 0 && alerts.length === 0) {
    console.log('Нечего отправлять — новых подходящих инфоповодов нет');
    await prisma.run.update({ where: { id: run.id }, data: { finishedAt: new Date() } });
    return;
  }

  const drafts = [];
  for (const story of confirmed) {
    try {
      const draft = await writeDraft(story.id);
      if (draft) drafts.push({ story, draft });
    } catch (error) {
      console.error(`Не удалось написать черновик «${story.title}»:`, error);
    }
  }

  // План публикаций идёт первым, черновики — в том же порядке
  await sendPlan(drafts.map((d) => d.draft));

  let sent = 0;
  for (const { story, draft } of drafts) {
    try {
      const messageId = await sendDraft(draft);
      await prisma.$transaction([
        prisma.story.update({ where: { id: story.id }, data: { status: 'SENT' } }),
        prisma.draft.update({
          where: { storyId: story.id },
          data: { sentAt: new Date(), tgMessageId: messageId, planOrder: sent + 1 },
        }),
      ]);
      sent += 1;
    } catch (error) {
      console.error(`Не удалось отправить черновик «${story.title}»:`, error);
    }
  }

  for (const story of alerts) {
    try {
      await deliver(story);
    } catch (error) {
      console.error(`Не удалось отправить сигнал «${story.title}»:`, error);
    }
  }

  const expired = await expireStale();
  if (expired > 0) console.log(`Просрочено и снято с очереди: ${expired}`);

  await prisma.run.update({
    where: { id: run.id },
    data: {
      finishedAt: new Date(),
      itemsAdded: collected.added,
      storiesMade: clustered.created,
      draftsSent: sent,
    },
  });

  console.log(`Отправлено черновиков: ${sent}, сигналов: ${alerts.length}`);
}

async function main(): Promise<void> {
  const mode = process.argv[2];
  if (mode !== 'collect' && mode !== 'digest') {
    console.error('Укажи режим: collect или digest');
    process.exit(1);
  }

  await connectWithRetry();

  try {
    if (mode === 'collect') await runCollect();
    else await runDigest();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Запуск упал:', message);

    // О поломке узнаём сразу, а не через неделю тишины в канале
    try {
      await sendMessage(`⚙️ Сбой в режиме <b>${mode}</b>:\n<code>${message.slice(0, 500)}</code>`);
    } catch {
      /* если и телеграм недоступен — остаётся лог GitHub Actions */
    }
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

void main();
