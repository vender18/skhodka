import Parser from 'rss-parser';
import { prisma } from './db.js';
import { prefilterReason } from './prefilter.js';
import { fetchTelegramChannel } from './telegram-source.js';
import type { Source } from '@prisma/client';

/**
 * Забирает свежие материалы из всех включённых лент и складывает в Item.
 * Ленты опрашиваются параллельно, но небольшими группами — иначе на медленных
 * источниках запуск растягивается, а на быстрых мы упираемся в их rate limit.
 */

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

const parser = new Parser({
  timeout: 20_000,
  headers: {
    'User-Agent': USER_AGENT,
    // Без явного Accept Коммерсантъ отвечает 406
    Accept: 'application/rss+xml, application/xml, text/xml, */*',
    'Accept-Language': 'ru,en;q=0.9',
  },
  customFields: {
    item: [
      ['media:content', 'mediaContent', { keepArray: true }],
      ['media:thumbnail', 'mediaThumbnail'],
      ['content:encoded', 'contentEncoded'],
    ],
  },
});

/** Насколько старые материалы ещё интересны. Всё старше — мимо. */
const MAX_AGE_HOURS = 36;

/**
 * Сколько материалов берём из одной ленты за раз.
 *
 * У общих лент выдача огромная: у Коммерсанта в ленте 705 записей, у ТАСС 100.
 * Без ограничения одна такая лента вытесняет из разбора всё остальное, а
 * бесплатного лимита модели хватает на считанные десятки материалов в минуту.
 */
const MAX_ITEMS_PER_SOURCE = 12;

/** Сколько лент опрашиваем одновременно. */
const CONCURRENCY = 6;

export interface CollectResult {
  added: number;
  failed: { source: string; error: string }[];
}

/** Достаёт картинку из тех полей, куда её кладут разные CMS. */
function extractImage(item: Record<string, unknown>): string | null {
  const media = item.mediaContent as { $?: { url?: string } }[] | undefined;
  if (Array.isArray(media)) {
    const url = media.find((m) => m?.$?.url)?.$?.url;
    if (url) return url;
  }

  const thumb = item.mediaThumbnail as { $?: { url?: string } } | undefined;
  if (thumb?.$?.url) return thumb.$.url;

  const enclosure = item.enclosure as { url?: string; type?: string } | undefined;
  if (enclosure?.url && (!enclosure.type || enclosure.type.startsWith('image'))) {
    return enclosure.url;
  }

  // Последняя попытка — первая картинка в HTML описания
  const html = (item['content:encoded'] as string) ?? (item.content as string) ?? '';
  const match = html.match(/<img[^>]+src=["']([^"']+)["']/i);
  return match?.[1] ?? null;
}

/**
 * Все картинки из полного текста материала.
 *
 * Страницы изданий всё чаще рисуются скриптами и картинок в html не содержат
 * вовсе — у Sneaker News их ноль. Зато в самой ленте лежит полный текст, а в
 * нём тридцать фотографий кроссовок. Оттуда и берём.
 */
function extractAllImages(item: Record<string, unknown>): string[] {
  const html =
    ((item.contentEncoded as string) ?? '') + ((item['content:encoded'] as string) ?? '');
  const found = [...html.matchAll(/<img[^>]+src=["']([^"']+)["']/gi)].map((m) => m[1]!);

  return [...new Set(found)]
    .filter((url) => /^https?:/i.test(url))
    .filter((url) => !/logo|avatar|icon|sprite|pixel|badge|emoji/i.test(url))
    .slice(0, 15);
}

/** Убирает utm-метки, чтобы одна и та же ссылка не считалась двумя разными. */
function canonicalUrl(raw: string): string {
  try {
    const url = new URL(raw);
    for (const key of [...url.searchParams.keys()]) {
      if (key.startsWith('utm_') || key === 'fbclid' || key === 'ref') {
        url.searchParams.delete(key);
      }
    }
    url.hash = '';
    return url.toString();
  } catch {
    return raw;
  }
}

function stripHtml(input: string | undefined): string | null {
  if (!input) return null;
  const text = input
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
  return text ? text.slice(0, 1200) : null;
}

/** Общая запись материала в базу — одинаковая для лент и телеграм-каналов. */
async function saveItem(
  source: Source,
  data: {
    url: string;
    title: string;
    summary: string | null;
    imageUrl: string | null;
    extraImages?: string[];
    publishedAt: Date;
  },
): Promise<number> {
  // Очевидно неподходящее помечаем сразу: до модели такой материал не дойдёт
  // и не съест лимит токенов, но в базе останется — вдруг понадобится для сверки.
  const rejected = prefilterReason(data.title, data.summary);

  // createMany со skipDuplicates дешевле, чем сначала искать, потом писать:
  // уникальный индекс по url сам отсекает повторы между запусками.
  const result = await prisma.item.createMany({
    data: [
      {
        sourceId: source.id,
        url: data.url,
        title: data.title.slice(0, 500),
        summary: data.summary,
        imageUrl: data.imageUrl,
        extraImages: data.extraImages ?? [],
        publishedAt: data.publishedAt,
        skipped: rejected !== null,
      },
    ],
    skipDuplicates: true,
  });

  return result.count;
}

async function collectFromTelegram(source: Source): Promise<number> {
  const cutoff = Date.now() - MAX_AGE_HOURS * 60 * 60 * 1000;
  const posts = await fetchTelegramChannel(source.feedUrl);

  let added = 0;
  let taken = 0;

  for (const post of posts.reverse()) {
    if (taken >= MAX_ITEMS_PER_SOURCE) break;
    if (post.publishedAt.getTime() < cutoff) continue;
    taken += 1;
    added += await saveItem(source, post);
  }

  return added;
}

async function collectFromSource(source: Source): Promise<number> {
  if (source.kind === 'telegram') return collectFromTelegram(source);

  const feed = await parser.parseURL(source.feedUrl);
  const cutoff = Date.now() - MAX_AGE_HOURS * 60 * 60 * 1000;

  let added = 0;
  let taken = 0;

  for (const entry of feed.items ?? []) {
    if (taken >= MAX_ITEMS_PER_SOURCE) break;

    const link = entry.link?.trim();
    const title = entry.title?.trim();
    if (!link || !title) continue;

    const publishedAt = entry.isoDate
      ? new Date(entry.isoDate)
      : entry.pubDate
        ? new Date(entry.pubDate)
        : new Date();

    if (Number.isNaN(publishedAt.getTime()) || publishedAt.getTime() < cutoff) continue;

    taken += 1;

    added += await saveItem(source, {
      url: canonicalUrl(link),
      title,
      summary: stripHtml(entry.contentSnippet ?? entry.content ?? entry.summary),
      imageUrl: extractImage(entry as unknown as Record<string, unknown>),
      extraImages: extractAllImages(entry as unknown as Record<string, unknown>),
      publishedAt,
    });
  }

  return added;
}

export async function collectAll(): Promise<CollectResult> {
  const sources = await prisma.source.findMany({ where: { enabled: true } });
  const failed: { source: string; error: string }[] = [];
  let added = 0;

  for (let i = 0; i < sources.length; i += CONCURRENCY) {
    const batch = sources.slice(i, i + CONCURRENCY);

    const results = await Promise.all(
      batch.map(async (source) => {
        try {
          const count = await collectFromSource(source);
          await prisma.source.update({
            where: { id: source.id },
            data: { lastFetchedAt: new Date(), lastOkAt: new Date(), lastError: null },
          });
          return { count, error: null as string | null, source };
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          await prisma.source.update({
            where: { id: source.id },
            data: { lastFetchedAt: new Date(), lastError: message.slice(0, 500) },
          });
          return { count: 0, error: message, source };
        }
      }),
    );

    for (const result of results) {
      added += result.count;
      if (result.error) failed.push({ source: result.source.name, error: result.error });
    }
  }

  return { added, failed };
}
