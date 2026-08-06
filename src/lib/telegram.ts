import { env } from './env.js';
import type { DraftPayload } from './draft.js';

/**
 * Отправка черновиков редактору. Черновик приходит готовым к копированию:
 * сам текст, под ним — служебная информация (источники, статус проверки),
 * которую в канал не публикуют.
 */

const API = 'https://api.telegram.org';

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

/** Telegram режет подпись к фото на 1024 знаках, обычное сообщение — на 4096. */
const CAPTION_LIMIT = 1024;
const MESSAGE_LIMIT = 4096;

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

async function call<T>(method: string, payload: Record<string, unknown>): Promise<T> {
  const response = await fetch(`${API}/bot${env.telegramToken}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(30_000),
  });

  const data = (await response.json()) as { ok: boolean; result?: T; description?: string };
  if (!data.ok) {
    throw new Error(`Telegram ${method}: ${data.description ?? 'неизвестная ошибка'}`);
  }
  return data.result as T;
}

export async function sendMessage(text: string): Promise<number> {
  const result = await call<{ message_id: number }>('sendMessage', {
    chat_id: env.editorChatId,
    text: text.slice(0, MESSAGE_LIMIT),
    parse_mode: 'HTML',
    link_preview_options: { is_disabled: true },
  });
  return result.message_id;
}

const CATEGORY_LABELS: Record<string, string> = {
  CULTURE: 'культура',
  ARCHITECTURE: 'архитектура',
  CINEMA: 'кино',
  MUSIC: 'музыка',
  FASHION: 'мода',
  SPORT: 'спорт',
  GENERAL: 'разное',
};

/**
 * Собирает карточку новости: заголовок, суть, источники, подпись к фото.
 *
 * Это справка редактору, а не готовый пост: он читает суть, решает, брать
 * тему или нет, и пишет текст сам.
 */
function card(draft: DraftPayload): string {
  const lines: string[] = [];

  if (draft.confidence === 'UNCONFIRMED') {
    lines.push('⚠️ <b>НЕ ПОДТВЕРЖДЕНО</b>');
  }

  lines.push(`<b>${escapeHtml(draft.title)}</b>`, '', escapeHtml(draft.text), '');

  const sources = draft.sources
    .slice(0, 4)
    .map((s) => `<a href="${escapeHtml(s.url)}">${escapeHtml(s.name)}</a>`)
    .join(' · ');
  if (sources) lines.push(`Источники: ${sources}`);

  const category = CATEGORY_LABELS[draft.category] ?? draft.category.toLowerCase();
  const credit = draft.imageCredit ? ` · фото: ${escapeHtml(draft.imageCredit)}` : '';
  const when = draft.publishedAt.toLocaleString('ru-RU', {
    timeZone: 'Europe/Moscow',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  });
  lines.push(`<i>${when} МСК · ${category} · важность ${draft.importance}/5${credit}</i>`);

  return lines.join('\n');
}

/**
 * Присылает карточку новости с фотографией.
 *
 * Фото идёт первым и почти всегда есть: если своей картинки у новости нет,
 * подбирается фотография её героя. Пост без картинки в таком канале не нужен,
 * поэтому иллюстрация важнее текста.
 */
/**
 * Скачивает картинку и отправляет файлом.
 *
 * Передавать Telegram ссылку нельзя: он идёт за ней сам, своим качальщиком,
 * и многие сайты отвечают ему не картинкой. Highsnobiety так и ронял отправку
 * с «wrong type of the web page content», хотя по той же ссылке из браузера
 * лежит обычный png. Скачиваем сами — и отдаём уже готовые байты.
 */
async function uploadPhoto(
  imageUrl: string,
  caption: string | null,
): Promise<number> {
  let response = await fetch(imageUrl, {
    headers: { 'User-Agent': USER_AGENT },
    signal: AbortSignal.timeout(25_000),
  });
  if (!response.ok) throw new Error(`картинка не скачалась: ${response.status}`);

  // Современные CDN отдают avif — Telegram его не умеет и падает с
  // IMAGE_PROCESS_FAILED. Формат ответа плавает от запроса к запросу, поэтому
  // смотрим, что реально пришло, и при негодном просим jpeg явно: у imgix и
  // похожих CDN это параметр fm.
  if (/avif|heic|svg/i.test(response.headers.get('content-type') ?? '')) {
    const retryUrl = new URL(imageUrl);
    retryUrl.searchParams.set('fm', 'jpg');
    const retry = await fetch(retryUrl, {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(25_000),
    });
    if (retry.ok && !/avif|heic|svg/i.test(retry.headers.get('content-type') ?? '')) {
      response = retry;
    } else {
      throw new Error('картинка только в avif, Telegram такой формат не принимает');
    }
  }

  const bytes = await response.arrayBuffer();
  if (bytes.byteLength < 5_000) throw new Error('картинка подозрительно мелкая');

  const type = response.headers.get('content-type') ?? 'image/jpeg';
  const extension = type.includes('png') ? 'png' : type.includes('webp') ? 'webp' : 'jpg';

  const form = new FormData();
  form.append('chat_id', env.editorChatId);
  form.append('photo', new Blob([bytes], { type }), `photo.${extension}`);
  if (caption) {
    form.append('caption', caption);
    form.append('parse_mode', 'HTML');
  }

  const sent = await fetch(`${API}/bot${env.telegramToken}/sendPhoto`, {
    method: 'POST',
    body: form,
    signal: AbortSignal.timeout(60_000),
  });

  const data = (await sent.json()) as {
    ok: boolean;
    result?: { message_id: number };
    description?: string;
  };
  if (!data.ok) throw new Error(`Telegram sendPhoto: ${data.description ?? 'ошибка'}`);

  return data.result!.message_id;
}

export async function sendDraft(draft: DraftPayload): Promise<number> {
  const body = card(draft);

  if (draft.imageUrl) {
    try {
      // Если подпись не влезает в лимит, шлём фото без неё, а текст следом
      const caption = body.length <= CAPTION_LIMIT ? body : null;
      const messageId = await uploadPhoto(draft.imageUrl, caption);
      if (caption) return messageId;
    } catch (error) {
      // Картинка не критична настолько, чтобы терять новость целиком
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`Не удалось отправить фото (${draft.imageUrl}): ${message}`);
    }
  }

  return sendMessage(body);
}

/** Шапка дайджеста: план публикаций на ближайшее время. */
export async function sendPlan(drafts: DraftPayload[]): Promise<void> {
  if (drafts.length === 0) return;

  const lines = drafts.map((draft, index) => {
    const mark = draft.confidence === 'UNCONFIRMED' ? ' ⚠️' : '';
    const category = CATEGORY_LABELS[draft.category] ?? '';
    return `${index + 1}. ${escapeHtml(draft.title)}${mark}\n   <i>${category}, важность ${draft.importance}/5</i>`;
  });

  const now = new Date().toLocaleString('ru-RU', {
    timeZone: 'Europe/Moscow',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  });

  await sendMessage(
    `<b>План публикаций</b>\n<i>${now} МСК · ${drafts.length} материала(ов)</i>\n\n` +
      lines.join('\n') +
      '\n\n<i>Ниже — черновики в этом же порядке.</i>',
  );
}

/** Сообщение о срочной новости — уходит сразу, не дожидаясь дайджеста. */
export async function sendUrgentHeader(count: number): Promise<void> {
  await sendMessage(
    `🔴 <b>Срочное</b> — ${count} материал(ов), которые стоит поставить сейчас`,
  );
}

/**
 * Сигнал о громкой, но неподтверждённой новости.
 *
 * Готовый текст поста здесь сознательно не пишется: пока новость держится
 * на одном источнике, давать её отредактированным текстом — значит
 * подталкивать к публикации непроверенного. Присылаем факт и ссылки,
 * решение принимает человек.
 */
export async function sendUnconfirmedAlert(story: {
  title: string;
  gist: string;
  confidenceNote: string | null;
  importance: number;
  sources: { name: string; url: string }[];
}): Promise<number> {
  const sources = story.sources
    .slice(0, 4)
    .map((s) => `<a href="${escapeHtml(s.url)}">${escapeHtml(s.name)}</a>`)
    .join(' · ');

  return sendMessage(
    [
      '⚠️ <b>НЕ ПОДТВЕРЖДЕНО</b>',
      '',
      `<b>${escapeHtml(story.title)}</b>`,
      escapeHtml(story.gist),
      '',
      story.confidenceNote ? `<i>${escapeHtml(story.confidenceNote)}</i>` : '',
      sources ? `Источники: ${sources}` : '',
      '',
      '<i>Текст поста не готовился: новость пока на одном источнике. ' +
        'Если подтвердится другими изданиями — придёт готовым черновиком.</i>',
    ]
      .filter(Boolean)
      .join('\n'),
  );
}
