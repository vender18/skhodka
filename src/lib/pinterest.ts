/**
 * Фотографии из твоих досок на Pinterest.
 *
 * Поиск по Pinterest подключить нельзя: официальный api умеет работать только
 * со своим аккаунтом, публичного поиска в нём нет, а внутренний api сайта
 * отвечает 403 без сессии. Зато страница ПУБЛИЧНОЙ доски отдаётся обычным
 * html, и картинки в ней лежат прямо в тегах img — без ключей и авторизации.
 *
 * Важное ограничение: подписей у пинов нет ни на странице доски, ни на
 * странице отдельного пина — проверено. Значит агент не видит, ЧТО изображено
 * на картинке, и «найти фото Ферстаппена» среди пинов не может.
 *
 * Зато он точно знает НАЗВАНИЕ доски. На этом и строится подбор: доску
 * называешь по герою или теме («kanye», «carti», «nba fits», «sneakers»), а
 * агент сверяет это название с тем, о ком новость. Новость про Канье —
 * берём из доски «kanye». Совпадения нет — берём из доски по категории,
 * а если и её нет, из общей.
 *
 * Отсюда простое правило: чем конкретнее назовёшь доску, тем точнее попадание.
 */

import type { Photo } from './photo.js';

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

/** Сколько пинов максимум берём с одной доски. */
const MAX_PINS = 40;

/** Имя доски из ссылки: .../pgeorgy18/nba-fits/ → «nba fits». */
function boardName(url: string): string {
  try {
    const parts = new URL(url).pathname.split('/').filter(Boolean);
    return (parts[parts.length - 1] ?? '').replace(/[-_]+/g, ' ').toLowerCase();
  } catch {
    return '';
  }
}

/** Доски, названные по герою или теме. Заполнять не обязательно. */
function namedBoards(): string[] {
  return (process.env.PINTEREST_BOARDS ?? '')
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter((s) => s.startsWith('http'));
}

/**
 * Выбирает доску под конкретную новость.
 *
 * Сначала ищет доску, чьё название встречается в заголовке или в имени героя:
 * доска «kanye» подойдёт новости про Канье. Если такой нет — берёт доску по
 * категории, а в последнюю очередь общую.
 */
function boardFor(category: string, about: string): string | undefined {
  const haystack = about.toLowerCase();

  let best: { url: string; score: number } | null = null;
  for (const url of namedBoards()) {
    const name = boardName(url);
    if (!name) continue;

    // Считаем слова названия доски, встретившиеся в новости. Короткие слова
    // пропускаем: «nba» ловим, а «of» и «the» дали бы ложные совпадения.
    const words = name.split(' ').filter((w) => w.length >= 3);
    if (words.length === 0) continue;

    const hits = words.filter((w) => haystack.includes(w)).length;
    if (hits === words.length && (!best || hits > best.score)) {
      best = { url, score: hits };
    }
  }
  if (best) return best.url;

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
export async function boardPhotos(
  category: string,
  about: string,
  count: number,
): Promise<Photo[]> {
  const boardUrl = boardFor(category, about);
  if (!boardUrl || count <= 0) return [];

  try {
    const all = await fetchBoardPhotos(boardUrl);
    const shuffled = [...all].sort(() => Math.random() - 0.5);
    const name = boardName(boardUrl);
    return shuffled
      .slice(0, count)
      .map((p) => ({ ...p, credit: `твоя доска Pinterest${name ? ` «${name}»` : ''}` }));
  } catch (error) {
    console.warn(`Не удалось прочитать доску Pinterest: ${error}`);
    return [];
  }
}
