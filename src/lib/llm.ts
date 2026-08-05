import { GoogleGenAI } from '@google/genai';
import Groq from 'groq-sdk';
import { env } from './env.js';

/**
 * Обёртка над двумя моделями. Gemini основной — он заметно лучше пишет
 * по-русски. Groq — запасной: когда у Gemini кончается бесплатная квота
 * (а на почасовом кроне это происходит регулярно), цикл не должен вставать.
 */

let geminiClient: GoogleGenAI | null = null;
let groqClient: Groq | null = null;

function gemini(): GoogleGenAI | null {
  if (!env.geminiKey) return null;
  geminiClient ??= new GoogleGenAI({ apiKey: env.geminiKey });
  return geminiClient;
}

function groq(): Groq | null {
  if (!env.groqKey) return null;
  groqClient ??= new Groq({ apiKey: env.groqKey });
  return groqClient;
}

export interface CompleteOptions {
  /** Просим модель вернуть строгий JSON. */
  json?: boolean;
  /** Инструкция роли — что это за редактор и как он думает. */
  system?: string;
  temperature?: number;
  /** Потолок длины ответа. Считается в общий лимит токенов за минуту. */
  maxTokens?: number;
  /** Чем считать. По умолчанию — модель для написания текстов. */
  model?: string;
}

const RETRIABLE = /429|rate|quota|timeout|ECONNRESET|503|500|overload/i;

/**
 * Рассуждающие модели любят выдать ход мыслей вместо ответа. Вырезаем такие
 * блоки: без этого в черновик уезжает английская простыня «Here's my thinking».
 */
function stripReasoning(text: string): string {
  return text
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/<thinking>[\s\S]*?<\/thinking>/gi, '')
    // Незакрытый блок — значит модель не доехала до ответа, спасать нечего
    .replace(/<\/?think(ing)?>/gi, '')
    .trim();
}

async function tryGemini(prompt: string, options: CompleteOptions): Promise<string | null> {
  const client = gemini();
  if (!client) return null;

  const response = await client.models.generateContent({
    model: env.geminiModel,
    contents: prompt,
    config: {
      temperature: options.temperature ?? 0.7,
      ...(options.system ? { systemInstruction: options.system } : {}),
      ...(options.json ? { responseMimeType: 'application/json' } : {}),
    },
  });

  return response.text ?? null;
}

/** Кончился суточный лимит именно этой модели — другая может быть свободна. */
const DAILY_LIMIT = /tokens per day|TPD/i;

async function tryGroq(prompt: string, options: CompleteOptions): Promise<string | null> {
  const primary = options.model ?? env.groqModel;

  try {
    return await callGroq(primary, prompt, options);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (DAILY_LIMIT.test(message) && primary !== env.groqFallbackModel) {
      console.warn(`У модели ${primary} кончился суточный лимит, беру ${env.groqFallbackModel}`);
      return callGroq(env.groqFallbackModel, prompt, options);
    }
    throw error;
  }
}

async function callGroq(
  model: string,
  prompt: string,
  options: CompleteOptions,
): Promise<string | null> {
  const client = groq();
  if (!client) return null;

  const messages = [
    ...(options.system ? [{ role: 'system' as const, content: options.system }] : []),
    { role: 'user' as const, content: prompt },
  ];

  const base = {
    model,
    temperature: options.temperature ?? 0.7,
    // Лимит бесплатного Groq — 8000 токенов в минуту на весь запрос вместе
    // с ответом. Просить больше бессмысленно: запрос отбивается целиком.
    max_completion_tokens: options.maxTokens ?? 2500,
    messages,
  };

  try {
    const response = await client.chat.completions.create({
      ...base,
      ...(options.json ? { response_format: { type: 'json_object' as const } } : {}),
    });
    return response.choices[0]?.message?.content ?? null;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    // В строгом JSON-режиме Groq отбраковывает собственный ответ, если тот вышел
    // длинным, и возвращает пустоту. Свободный режим такой ответ отдаёт целиком,
    // а разобрать его мы умеем — в completeJson есть чистка обёрток.
    if (options.json && /json_validate_failed|Failed to validate JSON/i.test(message)) {
      const response = await client.chat.completions.create(base);
      return response.choices[0]?.message?.content ?? null;
    }
    throw error;
  }
}

/**
 * Спрашивает модель. Сначала Gemini, при исчерпании квоты или сбое — Groq.
 * Если обе недоступны, бросает ошибку: молча продолжать без модели нельзя,
 * иначе в канал уедет пустой черновик.
 */
export async function complete(prompt: string, options: CompleteOptions = {}): Promise<string> {
  const errors: string[] = [];

  for (const [name, run] of [
    ['Gemini', tryGemini],
    ['Groq', tryGroq],
  ] as const) {
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const raw = await run(prompt, options);
        if (raw === null) break; // ключа нет — сразу к следующей модели
        const text = stripReasoning(raw);
        if (text) return text;
        errors.push(`${name}: пустой ответ`);
        break;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        // Суточный лимит за минуту не восстановится — ждать бессмысленно.
        // К этому месту запасная модель уже пробовалась и тоже не сработала.
        if (DAILY_LIMIT.test(message)) {
          errors.push(`${name}: суточный лимит исчерпан`);
          break;
        }
        if (RETRIABLE.test(message) && attempt < 3) {
          // Лимит у Groq считается за минуту, поэтому ждать пару секунд
          // бесполезно — окно просто не успевает сдвинуться.
          const isRateLimit = /rate_limit|429|quota/i.test(message);
          await new Promise((resolve) =>
            setTimeout(resolve, isRateLimit ? attempt * 20_000 : attempt * 4000),
          );
          continue;
        }
        errors.push(`${name}: ${message}`);
        break;
      }
    }
  }

  throw new Error(`Не удалось получить ответ ни от одной модели. ${errors.join(' | ')}`);
}

/**
 * То же самое, но с разбором JSON. Модели любят обернуть ответ в ```json,
 * поэтому вырезаем обёртку перед парсингом.
 */
export async function completeJson<T>(prompt: string, options: CompleteOptions = {}): Promise<T> {
  const raw = await complete(prompt, { ...options, json: true, temperature: options.temperature ?? 0.3 });

  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();

  try {
    return JSON.parse(cleaned) as T;
  } catch {
    // Иногда модель добавляет пояснение до или после JSON — достаём первый объект/массив
    const match = cleaned.match(/[[{][\s\S]*[\]}]/);
    if (match) {
      try {
        return JSON.parse(match[0]) as T;
      } catch {
        /* падаем ниже с понятной ошибкой */
      }
    }
    throw new Error(`Модель вернула не JSON: ${cleaned.slice(0, 300)}`);
  }
}
