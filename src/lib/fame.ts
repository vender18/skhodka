/**
 * Насколько герой новости вообще известен.
 *
 * Главная претензия к отбору была в том, что в подборку лезли артисты, о
 * которых никто не слышал: «Dawn Richard выпустила альбом», «Cypress Hill
 * выпустили альбом». Формально это новости из приличных изданий, но каналу
 * нужны те, о ком говорят.
 *
 * Меряем посещаемостью статьи в Википедии за последний месяц — это честный
 * внешний сигнал, который сам обновляется. Для сравнения, реальные цифры:
 *
 *   LeBron James      1 200 000
 *   Travis Scott        388 000
 *   Drake               169 000
 *   Kendrick Lamar      106 000
 *   Playboi Carti        70 000
 *   Nike                 69 000
 *   Balenciaga           21 000
 *   Dawn Richard          4 100
 *
 * Сигнал вспомогательный: если статью найти не удалось, мы НЕ считаем героя
 * неизвестным. Слишком легко промахнуться мимо нужной страницы и выбросить
 * артиста, которого аудитория прекрасно знает.
 */

const USER_AGENT = 'skhodka-bot/1.0 (telegram news agent)';

/** Ниже этого числа просмотров за месяц считаем героя нишевым. */
export const NICHE_THRESHOLD = 15_000;

export interface Fame {
  subject: string;
  views: number | null;
  niche: boolean;
}

/** Приводит имя к точному заголовку статьи — иначе счётчик вернёт ноль. */
async function resolveTitle(subject: string): Promise<string | null> {
  try {
    const url = new URL('https://en.wikipedia.org/w/api.php');
    url.searchParams.set('action', 'query');
    url.searchParams.set('list', 'search');
    url.searchParams.set('srsearch', subject);
    url.searchParams.set('srlimit', '1');
    url.searchParams.set('format', 'json');
    url.searchParams.set('origin', '*');

    const response = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) return null;

    const data = (await response.json()) as { query?: { search?: { title?: string }[] } };
    return data.query?.search?.[0]?.title ?? null;
  } catch {
    return null;
  }
}

async function monthlyViews(title: string): Promise<number | null> {
  try {
    const end = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    const start = new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);
    const fmt = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, '');

    const article = encodeURIComponent(title.replace(/\s+/g, '_'));
    const url =
      `https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia/` +
      `all-access/user/${article}/daily/${fmt(start)}/${fmt(end)}`;

    const response = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(12_000),
    });
    if (!response.ok) return null;

    const data = (await response.json()) as { items?: { views?: number }[] };
    if (!data.items?.length) return null;

    return data.items.reduce((sum, item) => sum + (item.views ?? 0), 0);
  } catch {
    return null;
  }
}

export async function checkFame(subject: string): Promise<Fame> {
  if (!subject || subject.length < 2) return { subject, views: null, niche: false };

  const title = await resolveTitle(subject);
  if (!title) return { subject, views: null, niche: false };

  const views = await monthlyViews(title);
  if (views === null) return { subject, views: null, niche: false };

  return { subject, views, niche: views < NICHE_THRESHOLD };
}
