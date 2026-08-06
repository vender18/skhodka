/**
 * Чтение публичных телеграм-каналов как источника новостей.
 *
 * Зачем: русская сцена в RSS почти не представлена — The Flow и rap.ru лент
 * не отдают вовсе. Зато они и десяток похожих каналов публикуют всё в
 * телеграме, а у публичного канала есть веб-версия t.me/s/<имя>, которая
 * отдаёт обычный html. Ни токена, ни авторизации для неё не нужно.
 *
 * Важно: такие каналы подключены как источники ТРЕТЬЕГО уровня. Они работают
 * радаром — показывают, о чём вообще говорят, — но сами по себе новость не
 * подтверждают. Для серьёзной новости всё равно нужен нормальный источник.
 */

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

export interface TelegramPost {
  url: string;
  title: string;
  summary: string | null;
  imageUrl: string | null;
  publishedAt: Date;
}

function stripTags(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&laquo;/g, '«')
    .replace(/&raquo;/g, '»')
    .replace(/&mdash;/g, '—')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

/**
 * Первая строка поста работает заголовком: в этих каналах пост почти всегда
 * начинается с сути, а дальше идут подробности.
 */
function splitTitle(text: string): { title: string; summary: string | null } {
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  const first = lines[0] ?? '';
  const rest = lines.slice(1).join('\n').trim();

  // Если первая строка совсем короткая (эмодзи-заголовок), берём с ней следующую
  if (first.length < 25 && lines[1]) {
    return { title: `${first} ${lines[1]}`.slice(0, 300), summary: rest || null };
  }
  return { title: first.slice(0, 300), summary: rest || null };
}

export async function fetchTelegramChannel(handle: string): Promise<TelegramPost[]> {
  const response = await fetch(`https://t.me/s/${handle}`, {
    headers: { 'User-Agent': USER_AGENT },
    signal: AbortSignal.timeout(25_000),
  });
  if (!response.ok) {
    throw new Error(`t.me/s/${handle} ответил ${response.status}`);
  }

  const html = await response.text();
  const posts: TelegramPost[] = [];

  // Сообщения идут блоками; разрезаем по обёртке и разбираем каждый отдельно
  const blocks = html.split('<div class="tgme_widget_message_wrap').slice(1);

  for (const block of blocks) {
    const postId = /data-post="([^"]+)"/.exec(block)?.[1];
    const datetime = /<time[^>]+datetime="([^"]+)"/.exec(block)?.[1];
    const textHtml = /<div class="tgme_widget_message_text[^"]*"[^>]*>([\s\S]*?)<\/div>/.exec(
      block,
    )?.[1];

    if (!postId || !textHtml) continue;

    const text = stripTags(textHtml);
    // Совсем короткие подписи вроде «Сасуца» инфоповодом не считаем
    if (text.length < 30) continue;

    const publishedAt = datetime ? new Date(datetime) : new Date();
    if (Number.isNaN(publishedAt.getTime())) continue;

    // Картинка поста лежит фоном в стилях; эмодзи с telegram.org отсеиваем
    const images = [...block.matchAll(/background-image:url\('([^']+)'\)/g)].map((m) => m[1]!);
    const imageUrl =
      images.find((url) => url.includes('telesco.pe') || url.includes('cdn')) ?? null;

    const { title, summary } = splitTitle(text);

    posts.push({
      url: `https://t.me/${postId}`,
      title,
      summary,
      imageUrl,
      publishedAt,
    });
  }

  return posts;
}
