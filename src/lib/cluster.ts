import { prisma } from './db.js';
import { completeJson } from './llm.js';
import { env } from './env.js';
import { checkFame } from './fame.js';
import { CHANNEL_BRIEF } from './style.js';
import type { Category, Confidence } from '@prisma/client';

/**
 * Разбирает накопившиеся Item: склеивает материалы про одно и то же событие
 * в Story, оценивает срочность и важность и решает, подтверждена новость или нет.
 *
 * Решение о подтверждении принимает код, а не модель: подтверждённость зависит
 * от того, какие издания написали о событии, и это можно посчитать точно.
 * Модель, если её спросить, охотно назовёт подтверждённым что угодно.
 */

/**
 * Сколько материалов отдаём модели за раз.
 *
 * Пачки нарезаются по категориям, а не подряд: материалы про одно событие
 * приходят из разных изданий, и если резать общий список подряд, они попадают
 * в разные пачки и никогда не встречаются. Из-за этого сверка по нескольким
 * источникам не работала вовсе — у каждого сюжета был ровно один источник.
 */
const BATCH_SIZE = 18;

/**
 * Сколько материалов разбираем за один запуск по умолчанию.
 *
 * Ограничений два, и оба жёсткие: 8000 токенов в минуту (отсюда паузы между
 * пачками) и 200 тысяч токенов в сутки на модель. Почасовой сбор при большой
 * порции выбирает суточный лимит к обеду, поэтому там порция меньше — её
 * задаёт вызывающий код.
 */
const MAX_PER_RUN = 80;

/**
 * Пауза между обращениями к модели.
 *
 * Лимит считается за минуту, и одна пачка съедает заметную его часть.
 * Без паузы вторая же пачка упирается в 429 и запуск наполовину простаивает
 * на повторных попытках.
 */
const PAUSE_BETWEEN_BATCHES_MS = 13_000;

/** Сколько дней ищем существующий сюжет, чтобы дописать в него новые материалы. */
const MERGE_WINDOW_DAYS = 3;

interface ClusterResponse {
  clusters: {
    slug: string;
    title: string;
    gist: string;
    category: string;
    urgency: number;
    importance: number;
    subject?: string;
    items: number[];
    skip?: boolean;
    skipReason?: string;
  }[];
}

// CULTURE и ARCHITECTURE остались в схеме базы, но из профиля канала убраны:
// каналы-ориентиры такого не публикуют. Всё, что модель попробует так
// разметить, попадёт в GENERAL и почти наверняка отсеется как неподходящее.
const VALID_CATEGORIES: Category[] = ['CINEMA', 'MUSIC', 'FASHION', 'SPORT', 'GENERAL'];

function normalizeCategory(raw: string): Category {
  const upper = raw?.toUpperCase?.() ?? '';
  return (VALID_CATEGORIES as string[]).includes(upper) ? (upper as Category) : 'GENERAL';
}

function clamp(value: unknown, min: number, max: number, fallback: number): number {
  const num = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(max, Math.max(min, Math.round(num)));
}

/** Значимые слова заголовка — по ним ловим сюжеты про одно и то же. */
function keywords(title: string): Set<string> {
  return new Set(
    title
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .split(/\s+/)
      .filter((word) => word.length > 3),
  );
}

/** Доля общих слов относительно более короткого заголовка. */
function similarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let common = 0;
  for (const word of a) if (b.has(word)) common += 1;
  return common / Math.min(a.size, b.size);
}

/** Насколько заголовки должны совпадать, чтобы считать это одним сюжетом. */
const SAME_STORY_THRESHOLD = 0.6;

function normalizeSlug(raw: string): string {
  return (raw || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

const CLUSTER_PROMPT = `
${CHANNEL_BRIEF}

Ниже — заголовки материалов из разных изданий за последние сутки.
Сгруппируй их по событиям: материалы разных изданий об одном и том же событии
должны попасть в одну группу.

Для каждой группы верни:
— slug: короткий английский идентификатор события через дефис, например
  "demna-gucci-debut" или "tyler-new-album". Он должен быть одинаковым, если
  событие то же самое, поэтому опиши суть, а не формулировку заголовка.
— title: заголовок события по-русски, до 90 знаков. Имена людей, брендов и
  названия релизов оставляй ЛАТИНИЦЕЙ как в оригинале: «pooh shiesty»,
  «louis tomlinson», «all eyes on shiest». Не транслитерируй их кириллицей —
  из-за этого один и тот же артист попадает в базу дважды под разными именами.
— gist: суть в 1–2 предложениях по-русски, только факты из материалов
— subject: главный герой новости — имя артиста, спортсмена или название
  бренда, по-английски и как принято в оригинале: «Playboi Carti», «Nike»,
  «LeBron James». Если героя нет, оставь пустую строку.
— category: одно из MUSIC, FASHION, SPORT, CINEMA, GENERAL
— urgency: 1–5. 5 — надо публиковать сейчас, иначе протухнет (внезапный релиз,
  смерть, срочное объявление). 1 — можно поставить когда угодно (обзор, лонгрид).
— importance: 1–5. Оценивай строго, пятёрка должна быть редкостью.
  5 — об этом говорят далеко за пределами профильной тусовки: смерть крупной
      фигуры, распад главной группы, громкий скандал, уход легенды.
  4 — крупное событие внутри темы: назначение креативного директора большого
      дома моды, альбом артиста первой величины, покупка или закрытие бренда,
      отмена крупного фестиваля.
  3 — обычная заметная новость: коллаборация, дроп, трейлер, анонс тура,
      открытие выставки. Таких большинство, и это нормальная оценка.
  2 — рядовое сообщение, интересное поклонникам.
  1 — проходная заметка.
  Дроп кроссовок или коллаборация брендов — это 3, а не 5, даже если бренды
  известные.
— items: массив номеров материалов из списка, которые входят в эту группу
— skip: true, если материал каналу не подходит. Тогда добавь skipReason.
  Отсеивай:
  · политику, криминал, происшествия, экономику, пресс-релиз ни о чём;
  · материалы без новостного повода — подборки, обзоры и рассуждения вроде
    «10 лучших зданий», «вспоминаем карьеру», «разбираемся, почему»,
    «главные тренды сезона», рецензии, интервью, гороскопы, тесты.
    В канал идёт то, что ПРОИЗОШЛО, а не то, что кто-то написал статью;
  · торговлю: «где купить», «билеты от 35 долларов», «успей заказать»,
    скидки, промокоды, обзоры товаров — это реклама, а не новость;
  · рутинный спорт: результаты отдельных матчей, турнирные таблицы, обычные
    трансферы, региональные соревнования. Спорт берём только когда о нём
    говорят и вне спорта: уход легенды, рекорд десятилетия, громкий скандал;
  · локальные новости США без международного веса: кантри-музыка, местное ТВ;
  · награды и итоги кинофестивалей, кроме каннского, венецианского, берлинале
    и «оскара». Победа на фестивале второго ряда каналу не новость;
  · архитектуру и дизайн интерьеров целиком — канал про это не пишет;
  · «высокую» культуру: выставки в музеях, театр, оперу, классику, литературу;
  · всё, что не касается молодёжной тусовки. Если новость не про рэп, кроссовки,
    моду, нба или футбол — скорее всего, её надо отсеять;
  · артистов и бренды, которых сегодняшняя молодёжь не слушает и не носит.
    Релиз малоизвестного исполнителя — не новость, даже если о нём написало
    приличное издание. Сюда же: заслуженные группы 80–90-х, кантри, местные
    сцены. Ориентир — те, о ком реально говорят: travis scott, playboi carti,
    kanye, drake, kendrick, future, the weeknd, carti, ken carson, destroy
    lonely, nike, balenciaga, corteiz, stone island, леброн и подобные.

Ответ — строго JSON вида {"clusters":[...]}. Ничего кроме JSON.

Материалы:
`.trim();

export interface ClusterResult {
  created: number;
  merged: number;
  skipped: number;
}

export async function clusterNewItems(maxItems: number = MAX_PER_RUN): Promise<ClusterResult> {
  const pool = await prisma.item.findMany({
    where: { storyId: null, skipped: false },
    include: { source: true },
    orderBy: [{ source: { weight: 'desc' } }, { publishedAt: 'desc' }],
    take: maxItems,
  });

  if (pool.length === 0) return { created: 0, merged: 0, skipped: 0 };

  // Группируем по категории источника: так материалы про одно событие
  // попадают в одну пачку и модель видит, что это одна и та же новость.
  const byCategory = new Map<string, typeof pool>();
  for (const item of pool) {
    const list = byCategory.get(item.source.category) ?? [];
    list.push(item);
    byCategory.set(item.source.category, list);
  }

  const batches: (typeof pool)[] = [];
  for (const list of byCategory.values()) {
    for (let offset = 0; offset < list.length; offset += BATCH_SIZE) {
      batches.push(list.slice(offset, offset + BATCH_SIZE));
    }
  }

  let created = 0;
  let merged = 0;
  let skipped = 0;

  for (const [batchIndex, batch] of batches.entries()) {
    if (batchIndex > 0) {
      await new Promise((resolve) => setTimeout(resolve, PAUSE_BETWEEN_BATCHES_MS));
    }

    // Всё, что модель не отнесла ни к одному сюжету, помечаем разобранным.
    // Иначе такие материалы копятся и каждый час снова уходят в модель:
    // на первом же запуске так зависли 699 из 728 штук.
    const assigned = new Set<string>();

    // Только заголовки: описания раздувают запрос вчетверо, а для группировки
    // и оценки заголовка почти всегда достаточно. Полный текст модель увидит
    // позже, когда будет писать черновик по конкретному сюжету.
    const list = batch
      .map((item, index) => `${index}. [${item.source.name}] ${item.title}`)
      .join('\n');

    let response: ClusterResponse;
    try {
      response = await completeJson<ClusterResponse>(`${CLUSTER_PROMPT}\n${list}`, {
        model: env.groqClusterModel,
      });
    } catch (error) {
      console.error('Не удалось разобрать пачку материалов:', error);
      continue;
    }

    for (const cluster of response.clusters ?? []) {
      const indexes = (cluster.items ?? []).filter(
        (i) => Number.isInteger(i) && i >= 0 && i < batch.length,
      );
      const clusterItems = indexes.map((i) => batch[i]!).filter(Boolean);
      if (clusterItems.length === 0) continue;

      for (const item of clusterItems) assigned.add(item.id);

      if (cluster.skip) {
        // Помечаем разобранными, чтобы не гонять их через модель каждый час
        await prisma.item.updateMany({
          where: { id: { in: clusterItems.map((i) => i.id) } },
          data: { skipped: true },
        });
        skipped += clusterItems.length;
        continue;
      }

      const slug = normalizeSlug(cluster.slug) || normalizeSlug(cluster.title);
      if (!slug) continue;

      const since = new Date(Date.now() - MERGE_WINDOW_DAYS * 24 * 60 * 60 * 1000);
      const title = (cluster.title ?? '').slice(0, 200) || clusterItems[0]!.title.slice(0, 200);

      let existing = await prisma.story.findFirst({
        where: { clusterKey: slug, createdAt: { gte: since } },
      });

      // Модель придумывает разные slug для одного события («spider-man-record»
      // и «spiderman-box-office»), поэтому дополнительно сверяем заголовки.
      //
      // Сверяем по ИСХОДНЫМ заголовкам изданий, а не по русским переводам:
      // перевод один и тот же артист называет то «pooh shiesty», то «поох
      // шиести», и на такой паре похожесть не ловится. Оригинал стабилен.
      if (!existing) {
        const recent = await prisma.story.findMany({
          where: { createdAt: { gte: since }, category: normalizeCategory(cluster.category) },
          select: { id: true, title: true, items: { select: { title: true } } },
        });

        const words = keywords([title, ...clusterItems.map((i) => i.title)].join(' '));
        const twin = recent.find((story) => {
          const other = keywords([story.title, ...story.items.map((i) => i.title)].join(' '));
          return similarity(words, other) >= SAME_STORY_THRESHOLD;
        });

        if (twin) {
          existing = await prisma.story.findUnique({ where: { id: twin.id } });
        }
      }

      const story =
        existing ??
        (await prisma.story.create({
          data: {
            clusterKey: slug,
            title,
            gist: (cluster.gist ?? '').slice(0, 2000),
            category: normalizeCategory(cluster.category),
            subject: (cluster.subject ?? '').slice(0, 120) || null,
            urgency: clamp(cluster.urgency, 1, 5, 2),
            importance: clamp(cluster.importance, 1, 5, 2),
            status: 'SCORED',
          },
        }));

      if (existing) merged += 1;
      else created += 1;

      await prisma.item.updateMany({
        where: { id: { in: clusterItems.map((i) => i.id) } },
        data: { storyId: story.id },
      });

      await applyConfidence(story.id);
      if (!existing) await applyFame(story.id);
    }

    const leftover = batch.filter((item) => !assigned.has(item.id));
    if (leftover.length > 0) {
      await prisma.item.updateMany({
        where: { id: { in: leftover.map((i) => i.id) } },
        data: { skipped: true },
      });
      skipped += leftover.length;
    }
  }

  return { created, merged, skipped };
}

/**
 * Считает, можно ли считать новость подтверждённой.
 *
 * Планка зависит от того, насколько громкая новость. Требовать агентство
 * для каждого дропа кроссовок бессмысленно: про кроссовки Hypebeast и есть
 * первоисточник, агентства о них не пишут вовсе. А вот смерть, покупка дома
 * моды или назначение креативного директора одним профильным сайтом не
 * подтверждаются — такие вещи регулярно оказываются слухом.
 *
 * Поэтому:
 *   — авторитетное издание (tier 1) подтверждает всегда;
 *   — два независимых издания подтверждают, если хотя бы одно из них не
 *     телеграм-канал: два канала, перепечатавших один слух, — это не сверка;
 *   — одно профильное издание подтверждает только рядовую новость своей темы.
 */
const SERIOUS_IMPORTANCE = 4;

export async function applyConfidence(storyId: string): Promise<void> {
  const story = await prisma.story.findUnique({
    where: { id: storyId },
    include: { items: { include: { source: true } } },
  });
  if (!story) return;

  const bySource = new Map<string, { name: string; tier: number; category: string }>();
  for (const item of story.items) {
    bySource.set(item.source.slug, {
      name: item.source.name,
      tier: item.source.tier,
      category: item.source.category,
    });
  }

  const sources = [...bySource.values()];
  const tierOne = sources.filter((s) => s.tier === 1);
  const names = sources.map((s) => s.name).join(', ') || 'неизвестен';

  let confidence: Confidence;
  let note: string;

  if (tierOne.length > 0) {
    confidence = 'CONFIRMED';
    note = `Подтверждает авторитетный источник: ${tierOne.map((s) => s.name).join(', ')}`;
  } else if (sources.length >= 2 && sources.some((s) => s.tier <= 2)) {
    confidence = 'CONFIRMED';
    note = `Совпадает у нескольких изданий: ${names}`;
  } else if (
    story.importance < SERIOUS_IMPORTANCE &&
    sources[0] &&
    sources[0].tier <= 2 &&
    sources[0].category === story.category
  ) {
    confidence = 'CONFIRMED';
    note = `Профильное издание пишет о своей теме: ${names}`;
  } else {
    confidence = 'UNCONFIRMED';
    note =
      story.importance >= SERIOUS_IMPORTANCE
        ? `Новость громкая, но пока только один источник: ${names}`
        : `Пока только один источник: ${names}`;
  }

  await prisma.story.update({
    where: { id: storyId },
    data: { confidence, confidenceNote: note },
  });
}


/**
 * Проверяет, известен ли герой новости, и снимает с очереди тех, о ком
 * никто не слышал.
 *
 * Модель оценивает известность плохо: для неё «вышел альбом» одинаково
 * значимо и у Дрейка, и у артиста с четырьмя тысячами читателей в месяц.
 * Поэтому спрашиваем внешний источник — посещаемость статьи в Википедии.
 */
export async function applyFame(storyId: string): Promise<void> {
  const story = await prisma.story.findUnique({ where: { id: storyId } });
  if (!story?.subject) return;

  const fame = await checkFame(story.subject);
  if (!fame.niche) return;

  await prisma.story.update({
    where: { id: storyId },
    data: {
      status: 'SKIPPED',
      confidenceNote: `Снято: о ${fame.subject} почти никто не ищет (${fame.views} просмотров статьи за месяц)`,
    },
  });
  console.log(`Пропускаю «${story.title}» — ${fame.subject} мало кому известен (${fame.views})`);
}
