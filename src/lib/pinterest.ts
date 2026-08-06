/**
 * Фотографии из твоих досок на Pinterest.
 *
 * Поиск по Pinterest подключить нельзя: официальный api умеет работать только
 * со своим аккаунтом, публичного поиска в нём нет, а внутренний api сайта
 * отвечает 403 без сессии. Зато страница ПУБЛИЧНОЙ доски отдаётся обычным
 * html, и картинки в ней лежат прямо в тегах img — без ключей и авторизации.
 *
 * Важное ограничение: подписей у пинов на странице нет. Значит агент не знает,
 * ЧТО изображено на конкретной картинке, и подобрать «фото Ферстаппена» из
 * общей доски не может. Поэтому доски заводятся по темам: музыка отдельно,
 * мода отдельно, спорт отдельно. Тогда к новости про рэп подставляется кадр
 * из рэп-доски, и попадание обеспечивает раскладка, а не угадывание.
 */

import type { Photo } from './photo.js';

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

/** Сколько пинов максимум берём с одной доски. */
const MAX_PINS = 40;

/**
 * Досок может быть несколько — по одной на тему. Заполнять не обязательно:
 * чего нет, то просто не используется.
 */
function boardFor(category: string): string | undefined {
  const byCategory: Record<string, string | undefined> = {
    MUSIC: process.env.PINTEREST_BOARD_MUSIC,
    FASHION: process.env.PINTEREST_BOARD_FASHION,
    SPORT: process.env.PINTEREST_BOARD_SPORT,
    CINEMA: process.env.PINTEREST_BOARD_CINEMA,
  };
  return byCategory[category] || process.env.PINTEREST_BOARD_URL;
}

/**
 * Увеличивает картинку до приличного размера.
 * В html доски пины отдаются превьюшками 236 пикселей — для поста это мало.
 */
function upgrade(url: string): string {
  return url.replace(/\/(?:75x75_RS|136x136|236x|474x)\//, '/736x/');
}

export async function fetchBoardPhotos(boardUrl: string): Promise<Photo[]> {
  const response = await fetch(boardUrl, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'text/html' },
    signal: AbortSignal.timeout(25_000),
  });
  if (!response.ok) throw new Error(`доска Pinterest ответила ${response.status}`);

  const html = await response.text();
  const photos: Photo[] = [];
  const seen = new Set<string>();

  for (const tag of html.match(/<img[^>]+>/g) ?? []) {
    const src = /src="(https:\/\/i\.pinimg\.com\/[^"]+)"/.exec(tag)?.[1];
    if (!src) continue;

    // Аватарки и иконки интерфейса — квадратные превью 75 пикселей
    if (src.includes('/75x75_RS/') || src.includes('/30x30/')) continue;

    const url = upgrade(src);
    if (seen.has(url)) continue;
    seen.add(url);

    photos.push({ url, credit: 'из твоей доски Pinterest' });
    if (photos.length >= MAX_PINS) break;
  }

  return photos;
}

/**
 * Несколько случайных кадров из доски, подходящей теме новости.
 *
 * Случайных — намеренно: доска пополняется, и агент не должен раз за разом
 * предлагать один и тот же верхний пин.
 */
export async function boardPhotos(category: string, count: number): Promise<Photo[]> {
  const boardUrl = boardFor(category);
  if (!boardUrl || count <= 0) return [];

  try {
    const all = await fetchBoardPhotos(boardUrl);
    const shuffled = [...all].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, count);
  } catch (error) {
    console.warn(`Не удалось прочитать доску Pinterest: ${error}`);
    return [];
  }
}
