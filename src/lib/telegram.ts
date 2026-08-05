import { env } from './env.js';
import type { DraftPayload } from './draft.js';

/**
 * Отправка черновиков редактору. Черновик приходит готовым к копированию:
 * сам текст, под ним — служебная информация (источники, статус проверки),
 * которую в канал не публикуют.
 */

const API = 'https://api.telegram.org';

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

/** Собирает служебный блок под текстом поста. */
function meta(draft: DraftPayload): string {
  const lines: string[] = [];

  const category = CATEGORY_LABELS[draft.category] ?? draft.category.toLowerCase();
  lines.push(
    `<i>${category} · важность ${draft.importance}/5 · срочность ${draft.urgency}/5</i>`,
  );

  if (draft.confidence === 'UNCONFIRMED') {
    lines.push('⚠️ <b>НЕ ПОДТВЕРЖДЕНО</b> — публиковать только на свой риск');
  }
  if (draft.confidenceNote) {
    lines.push(`<i>${escapeHtml(draft.confidenceNote)}</i>`);
  }

  const sources = draft.sources
    .slice(0, 4)
    .map((s) => `<a href="${escapeHtml(s.url)}">${escapeHtml(s.name)}</a>`)
    .join(' · ');
  if (sources) lines.push(`Источники: ${sources}`);

  if (draft.imageCredit) lines.push(`<i>Фото: ${escapeHtml(draft.imageCredit)}</i>`);

  return lines.join('\n');
}

/**
 * Присылает один черновик. Текст поста идёт отдельным сообщением без разметки,
 * чтобы его можно было скопировать целиком и сразу вставить в канал.
 */
export async function sendDraft(draft: DraftPayload): Promise<number> {
  const body = `${escapeHtml(draft.text)}\n\n${meta(draft)}`;

  if (draft.imageUrl) {
    try {
      // Если текст с подписью не влезает в лимит, шлём фото отдельно
      if (body.length <= CAPTION_LIMIT) {
        const result = await call<{ message_id: number }>('sendPhoto', {
          chat_id: env.editorChatId,
          photo: draft.imageUrl,
          caption: body,
          parse_mode: 'HTML',
        });
        return result.message_id;
      }

      await call('sendPhoto', { chat_id: env.editorChatId, photo: draft.imageUrl });
    } catch (error) {
      // Картинка не критична — если Telegram её не принял, отправим хотя бы текст
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
