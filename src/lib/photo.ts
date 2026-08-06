import * as cheerio from 'cheerio';
import { complete } from './llm.js';
import { boardPhotos } from './pinterest.js';
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

/**
 * Опознаёт картинку независимо от размера и параметров ссылки.
 * «photo-e1785954683838.webp?w=1024» и «photo.jpg?w=640&fm=jpg» — это одно
 * и то же изображение, и в подборке оно должно быть один раз.
 */
function fingerprint(url: string): string {
  try {
    const path = new URL(url).pathname.toLowerCase();
    return path
      .replace(/\.[a-z]{3,4}$/, '')
      .replace(/[-_]?(?:\d{2,4}x\d{2,4}|scaled|thumb|large|small|medium)$/g, '')
      .replace(/-e\d{10,}$/, '');
  } catch {
    return url;
  }
}

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

/**
 * Определяет, кто или что является героем новости — человек, группа или бренд.
 * Именно по нему потом ищется фотография, если своей у новости нет.
 */
async function mainSubject(story: Story): Promise<string> {
  try {
    const answer = await complete(
      `Новость: ${story.title}\n${story.gist}\n\n` +
        'Назови главного героя этой новости: имя человека, название группы или бренда. ' +
        'Пиши на английском и ровно так, как это принято писать в оригинале ' +
        '(например Max Verstappen, Playboi Carti, Balenciaga). ' +
        'Ответь только именем, без кавычек, пояснений и лишних слов.',
      { temperature: 0.1, maxTokens: 40 },
    );
    return answer.trim().replace(/["'.\n]/g, '').slice(0, 60);
  } catch {
    return '';
  }
}

/**
 * Фотография героя новости из Википедии.
 *
 * Это главный запасной вариант: если про Ферстаппена вышла новость без
 * иллюстрации, к ней логично приложить просто его фотографию. Фотостоки
 * так не умеют — они отдадут безликого «гонщика в шлеме».
 */
async function wikipediaPhoto(subject: string): Promise<Photo | null> {
  if (!subject) return null;

  for (const lang of ['en', 'ru']) {
    try {
      const title = encodeURIComponent(subject.replace(/\s+/g, '_'));
      const response = await fetch(
        `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${title}`,
        { headers: { 'User-Agent': 'skhodka-bot/1.0' }, signal: AbortSignal.timeout(12_000) },
      );
      if (!response.ok) continue;

      const data = (await response.json()) as {
        originalimage?: { source?: string };
        thumbnail?: { source?: string };
        type?: string;
      };
      if (data.type === 'disambiguation') continue;

      const url = data.originalimage?.source ?? data.thumbnail?.source;
      if (!url) continue;

      // Логотипы и подписи в векторе как иллюстрация не годятся: у Travis Scott
      // первой картинкой идёт svg с автографом.
      if (/\.svg(\?|$)/i.test(url)) continue;

      return { url, credit: `Wikimedia Commons — ${subject}` };
    } catch {
      /* пробуем следующий язык */
    }
  }
  return null;
}

/** Несколько эстетичных вариантов со стока. Нужен бесплатный ключ Unsplash. */
async function searchUnsplashMany(query: string, key: string, count: number): Promise<Photo[]> {
  if (count <= 0) return [];
  try {
    const url = new URL('https://api.unsplash.com/search/photos');
    url.searchParams.set('query', query);
    url.searchParams.set('per_page', String(Math.min(8, count + 3)));
    url.searchParams.set('orientation', 'landscape');

    const response = await fetch(url, {
      headers: { Authorization: `Client-ID ${key}` },
      signal: AbortSignal.timeout(12_000),
    });
    if (!response.ok) return [];

    const data = (await response.json()) as {
      results?: { urls?: { regular?: string }; user?: { name?: string } }[];
    };
    return (data.results ?? [])
      .filter((r) => r.urls?.regular)
      .map((r) => ({
        url: r.urls!.regular!,
        credit: `Unsplash${r.user?.name ? `, ${r.user.name}` : ''} — «${query}»`,
      }));
  } catch {
    return [];
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

/**
 * Собирает НЕСКОЛЬКО вариантов фотографии, чтобы редактор выбрал сам.
 *
 * Одна картинка — это лотерея: агент не знает, какая подойдёт по настроению.
 * Пять вариантов решают это за одну отправку.
 *
 * Pinterest, о котором просил заказчик, подключить не вышло: поиск отдаёт
 * пустую страницу (всё рисуется скриптами), а внутренний api отвечает 403.
 * Без браузера и логина оттуда качать нечего.
 */
export async function findPhotos(
  story: Story,
  items: ItemWithSource[],
  limit = 5,
): Promise<Photo[]> {
  const found: Photo[] = [];
  const seen = new Set<string>();

  const add = async (photo: Photo | null): Promise<void> => {
    if (!photo || found.length >= limit) return;

    // Одна и та же картинка приходит под разными ссылками: в ленте с одним
    // размером, в og:image — с другим, плюс хвост параметров. Поэтому
    // сравниваем по имени файла без размеров и параметров, иначе в альбом
    // попадают дубли — так и случилось с туром J. Cole.
    const key = fingerprint(photo.url);
    if (seen.has(key)) return;
    if (!(await isUsableImage(photo.url))) return;

    seen.add(key);
    found.push(photo);
  };

  // Сначала всё, что пришло с самой новостью — оно всегда по теме
  for (const item of items) {
    if (item.imageUrl) await add({ url: item.imageUrl, credit: item.source.name });
  }
  for (const item of items.slice(0, 3)) {
    if (found.length >= limit) break;
    const og = await ogImage(item.url);
    if (og) await add({ url: og, credit: item.source.name });
  }

  if (found.length >= limit) return found;

  // Кадры из твоей доски Pinterest по теме новости. Идут раньше стоков:
  // это отобранная вручную эстетика, а не выдача поисковика.
  const about = `${story.title} ${story.subject ?? ''} ${story.gist}`;
  for (const photo of await boardPhotos(story.category, about, limit - found.length)) {
    await add(photo);
  }

  if (found.length >= limit) return found;

  // Дальше — фотографии героя новости
  const subject = story.subject || (await mainSubject(story));
  if (subject) {
    await add(await wikipediaPhoto(subject));

    const unsplashKey = process.env.UNSPLASH_ACCESS_KEY;
    if (unsplashKey) {
      for (const photo of await searchUnsplashMany(subject, unsplashKey, limit - found.length)) {
        await add(photo);
      }
    }

  }

  return found;
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

  // 3. Своей картинки нет — ищем фото самого героя новости.
  // Википедия работает без ключа и даёт настоящие фото людей.
  const subject = await mainSubject(story);

  const fromWiki = await wikipediaPhoto(subject);
  if (fromWiki && (await isUsableImage(fromWiki.url))) return fromWiki;

  const unsplashKey = process.env.UNSPLASH_ACCESS_KEY;
  const pexelsKey = process.env.PEXELS_API_KEY;
  if (unsplashKey) {
    const photo = await searchUnsplash(subject || story.title, unsplashKey);
    if (photo) return photo;
  }
  if (pexelsKey) {
    const photo = await searchPexels(subject || story.title, pexelsKey);
    if (photo) return photo;
  }

  return null;
}
