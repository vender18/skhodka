/** Чтение конфигурации из окружения с понятными ошибками вместо undefined. */

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Не задана переменная окружения ${name}. Локально — пропиши её в .env, ` +
        `в GitHub Actions — добавь в Settings → Secrets and variables → Actions.`,
    );
  }
  return value;
}

function optional(name: string): string | undefined {
  return process.env[name] || undefined;
}

export const env = {
  get telegramToken() {
    return required('TELEGRAM_BOT_TOKEN');
  },
  get editorChatId() {
    return required('TELEGRAM_EDITOR_CHAT_ID');
  },
  get geminiKey() {
    return optional('GOOGLE_GENAI_API_KEY');
  },
  get groqKey() {
    return optional('GROQ_API_KEY');
  },
  get databaseUrl() {
    return required('DATABASE_URL');
  },
  get unsplashKey() {
    return optional('UNSPLASH_ACCESS_KEY');
  },
  get pexelsKey() {
    return optional('PEXELS_API_KEY');
  },
  /** Модели можно переопределить, не трогая код. */
  get geminiModel() {
    return optional('GEMINI_MODEL') ?? 'gemini-2.5-flash';
  },
  /**
   * Модель для написания текстов. gpt-oss-120b выбрана после сравнения на
   * живых новостях: llama-3.3-70b роняет в русский текст иероглифы,
   * qwen3.6 вместо ответа выдаёт свои рассуждения на английском.
   */
  get groqModel() {
    return optional('GROQ_MODEL') ?? 'openai/gpt-oss-120b';
  },

  /**
   * Модель для разбора и группировки новостей.
   *
   * Намеренно другая: у Groq дневной потолок в 200 тысяч токенов считается
   * отдельно для каждой модели. Разбор — работа объёмная и черновая, текст
   * там не пишется, поэтому она уходит на младшую модель и не съедает
   * лимит, нужный для черновиков.
   */
  get groqClusterModel() {
    return optional('GROQ_CLUSTER_MODEL') ?? 'openai/gpt-oss-20b';
  },

  /**
   * Запасная модель на случай, когда у основной кончился суточный лимит.
   * Без неё исчерпанная к вечеру квота означает, что канал молчит до утра.
   *
   * Взята младшая модель того же семейства, а не llama-3.3-70b: последняя
   * на проверке ломала русские слова («вторая章а») и коверкала имена
   * («джим каумерон», «к(funerary) архитектуре»).
   */
  get groqFallbackModel() {
    return optional('GROQ_FALLBACK_MODEL') ?? 'openai/gpt-oss-20b';
  },
};
