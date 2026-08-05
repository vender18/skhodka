import * as cheerio from 'cheerio';
import { complete } from './llm.js';
import type { Item, Source, Story } from '@prisma/client';

/**
 * Подбирает картинку к посту.
 *
 * Порядок важен: сначала пытаемся взять фото из самой новости — оно всегда
 * по теме. Только если его нет, идём на сток и ищем по ключевым словам.
 * Стоковая картинка — запасной вариант, а не основной: под новость про
 * конкретного человека сток даст безликое фото «мужчина в костюме».
 */

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

export interface Photo {
  url: string;
  /** Откуда взяли — попадает в подпись черновика, чтобы автор знал права. */
  credit: string;
}

type ItemWithSource = Item & { source: Source };

/** Проверяет, что по ссылке действительно лежит картинка приемлемого размера. */
async function isUsableImage(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, {
      method: 'HEAD',
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) return false;

    const type = response.headers.get('content-type') ?? '';
    if (!type.startsWith('image/')) return false;

    // Иконки и трекинг-пиксели телеграму не нужны
    const length = Number(response.headers.get('content-length') ?? '0');
    if (length > 0 && length < 15_000) return false;

    // Telegram не принимает картинки тяжелее 10 МБ по URL
    if (length > 10_000_000) return false;

    return true;
  } catch {
    return false;
  }
}

/** Достаёт og:image со страницы новости — там обычно лежит нормальная картинка. */
async function ogImage(pageUrl: string): Promise<string | null> {
  try {
    const response = await fetch(pageUrl, {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) return null;

    const html = await response.text();
    const $ = cheerio.load(html);

    const candidate =
      $('meta[property="og:image"]').attr('content') ??
      $('meta[name="og:image"]').attr('content') ??
      $('meta[name="twitter:image"]').attr('content');

    if (!candidate) return null;
    return new URL(candidate, pageUrl).toString();
  } catch {
    return null;
  }
}

/** Просит модель придумать короткий английский запрос для стокового поиска. */
async function stockQuery(story: Story): Promise<string> {
  try {
    const answer = await complete(
      `Новость: ${story.title}\n${story.gist}\n\n` +
        'Придумай запрос из 2–4 английских слов для поиска фотографии к этой новости ' +
        'в фотостоке. Если новость про конкретного человека — просто его имя. ' +
        'Если про бренд — название бренда. Ответь только запросом, без кавычек и пояснений.',
      { temperature: 0.3 },
    );
    return answer.trim().replace(/["'\n]/g, '').slice(0, 60);
  } catch {
    return story.title.slice(0, 60);
  }
}

async function searchUnsplash(query: string, key: string): Promise<Photo | null> {
  try {
    const url = new URL('https://api.unsplash.com/search/photos');
    url.searchParams.set('query', query);
    url.searchParams.set('per_page', '1');
    url.searchParams.set('orientation', 'landscape');

    const response = await fetch(url, {
      headers: { Authorization: `Client-ID ${key}` },
      signal: AbortSignal.timeout(12_000),
    });
    if (!response.ok) return null;

    const data = (await response.json()) as {
      results?: { urls?: { regular?: string }; user?: { name?: string } }[];
    };
    const first = data.results?.[0];
    if (!first?.urls?.regular) return null;

    return {
      url: first.urls.regular,
      credit: `Unsplash${first.user?.name ? `, фото ${first.user.name}` : ''} (по запросу «${query}»)`,
    };
  } catch {
    return null;
  }
}

async function searchPexels(query: string, key: string): Promise<Photo | null> {
  try {
    const url = new URL('https://api.pexels.com/v1/search');
    url.searchParams.set('query', query);
    url.searchParams.set('per_page', '1');
    url.searchParams.set('orientation', 'landscape');

    const response = await fetch(url, {
      headers: { Authorization: key },
      signal: AbortSignal.timeout(12_000),
    });
    if (!response.ok) return null;

    const data = (await response.json()) as {
      photos?: { src?: { large?: string }; photographer?: string }[];
    };
    const first = data.photos?.[0];
    if (!first?.src?.large) return null;

    return {
      url: first.src.large,
      credit: `Pexels${first.photographer ? `, фото ${first.photographer}` : ''} (по запросу «${query}»)`,
    };
  } catch {
    return null;
  }
}

export async function findPhoto(story: Story, items: ItemWithSource[]): Promise<Photo | null> {
  // 1. Картинка, пришедшая прямо в ленте
  for (const item of items) {
    if (item.imageUrl && (await isUsableImage(item.imageUrl))) {
      return { url: item.imageUrl, credit: item.source.name };
    }
  }

  // 2. og:image со страницы новости
  for (const item of items.slice(0, 3)) {
    const found = await ogImage(item.url);
    if (found && (await isUsableImage(found))) {
      return { url: found, credit: item.source.name };
    }
  }

  // 3. Сток по теме — только если ключи заданы
  const unsplashKey = process.env.UNSPLASH_ACCESS_KEY;
  const pexelsKey = process.env.PEXELS_API_KEY;
  if (!unsplashKey && !pexelsKey) return null;

  const query = await stockQuery(story);

  if (unsplashKey) {
    const photo = await searchUnsplash(query, unsplashKey);
    if (photo) return photo;
  }
  if (pexelsKey) {
    const photo = await searchPexels(query, pexelsKey);
    if (photo) return photo;
  }

  return null;
}
