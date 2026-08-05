/**
 * Источники, из которых агент собирает инфоповоды.
 *
 * ВАЖНО: каждая лента в этом списке проверена вручную и на момент добавления
 * отдавала рабочий RSS. Прежде чем добавлять новый источник, прогони
 * `npm run check-feeds` — мёртвая лента молча съедает время каждого запуска.
 *
 * tier — насколько источнику можно верить в одиночку:
 *   1 — авторитетное СМИ или официальный сайт. Ссылки на такой источник
 *       достаточно, чтобы выпустить серьёзную новость.
 *   2 — профильное издание. Для нишевой темы (мода, дизайн) его хватает,
 *       но громкую новость в одиночку не подтверждает.
 *   3 — агрегатор, инсайдер, слухи. Никогда не подтверждает новость сам по себе.
 *
 * weight — насколько охотно берём отсюда темы в канал (0–10).
 *   Влияет на отбор тем, но не на проверку фактов.
 */

export type Category =
  | 'CULTURE'
  | 'ARCHITECTURE'
  | 'CINEMA'
  | 'MUSIC'
  | 'FASHION'
  | 'SPORT'
  | 'GENERAL';

export type Region = 'RU' | 'WORLD';

export interface SourceDef {
  slug: string;
  name: string;
  feedUrl: string;
  siteUrl: string;
  category: Category;
  region: Region;
  tier: 1 | 2 | 3;
  weight: number;
}

export const SOURCES: SourceDef[] = [
  // ─── Россия: культура, стиль, общее ──────────────────────────────────────
  {
    slug: 'blueprint',
    name: 'The Blueprint',
    feedUrl: 'https://theblueprint.ru/rss',
    siteUrl: 'https://theblueprint.ru',
    category: 'FASHION',
    region: 'RU',
    tier: 2,
    weight: 10,
  },
  {
    slug: 'afisha-daily',
    name: 'Афиша Daily',
    feedUrl: 'https://daily.afisha.ru/rss/',
    siteUrl: 'https://daily.afisha.ru',
    category: 'CULTURE',
    region: 'RU',
    tier: 2,
    weight: 9,
  },
  {
    slug: 'snob',
    name: 'Сноб',
    feedUrl: 'https://snob.ru/rss/',
    siteUrl: 'https://snob.ru',
    category: 'CULTURE',
    region: 'RU',
    tier: 2,
    weight: 6,
  },
  {
    slug: 'kommersant-style',
    name: 'Коммерсантъ Стиль',
    feedUrl: 'https://www.kommersant.ru/RSS/section-style.xml',
    siteUrl: 'https://www.kommersant.ru/style',
    category: 'CULTURE',
    region: 'RU',
    tier: 1,
    weight: 6,
  },
  {
    slug: 'lenta-culture',
    name: 'Лента.ру Культура',
    feedUrl: 'https://lenta.ru/rss/news/culture',
    siteUrl: 'https://lenta.ru/rubrics/culture/',
    category: 'CULTURE',
    region: 'RU',
    tier: 1,
    weight: 5,
  },
  {
    slug: 'forbes-ru',
    name: 'Forbes Russia',
    feedUrl: 'https://www.forbes.ru/newrss.xml',
    siteUrl: 'https://www.forbes.ru',
    category: 'GENERAL',
    region: 'RU',
    tier: 1,
    weight: 5,
  },
  {
    slug: 'meduza',
    name: 'Медуза',
    feedUrl: 'https://meduza.io/rss/all',
    siteUrl: 'https://meduza.io',
    category: 'GENERAL',
    region: 'RU',
    tier: 1,
    weight: 5,
  },
  {
    slug: 'interfax',
    name: 'Интерфакс',
    feedUrl: 'https://www.interfax.ru/rss.asp',
    siteUrl: 'https://www.interfax.ru',
    category: 'GENERAL',
    region: 'RU',
    tier: 1,
    weight: 3,
  },
  {
    slug: 'tass',
    name: 'ТАСС',
    feedUrl: 'https://tass.ru/rss/v2.xml',
    siteUrl: 'https://tass.ru',
    category: 'GENERAL',
    region: 'RU',
    tier: 1,
    weight: 3,
  },

  // ─── Мода, мир ───────────────────────────────────────────────────────────
  {
    slug: 'hypebeast',
    name: 'Hypebeast',
    feedUrl: 'https://hypebeast.com/feed',
    siteUrl: 'https://hypebeast.com',
    category: 'FASHION',
    region: 'WORLD',
    tier: 2,
    weight: 10,
  },
  {
    slug: 'highsnobiety',
    name: 'Highsnobiety',
    feedUrl: 'https://www.highsnobiety.com/feed/',
    siteUrl: 'https://www.highsnobiety.com',
    category: 'FASHION',
    region: 'WORLD',
    tier: 2,
    weight: 10,
  },
  {
    slug: 'dazed',
    name: 'Dazed',
    feedUrl: 'https://www.dazeddigital.com/rss',
    siteUrl: 'https://www.dazeddigital.com',
    category: 'FASHION',
    region: 'WORLD',
    tier: 2,
    weight: 9,
  },
  {
    slug: 'i-d',
    name: 'i-D',
    feedUrl: 'https://i-d.co/feed/',
    siteUrl: 'https://i-d.co',
    category: 'FASHION',
    region: 'WORLD',
    tier: 2,
    weight: 8,
  },
  {
    slug: 'harpers-bazaar',
    name: "Harper's Bazaar",
    feedUrl: 'https://www.harpersbazaar.com/rss/all.xml',
    siteUrl: 'https://www.harpersbazaar.com',
    category: 'FASHION',
    region: 'WORLD',
    tier: 2,
    weight: 8,
  },
  {
    slug: 'gq',
    name: 'GQ',
    feedUrl: 'https://www.gq.com/feed/rss',
    siteUrl: 'https://www.gq.com',
    category: 'FASHION',
    region: 'WORLD',
    tier: 2,
    weight: 7,
  },
  {
    slug: 'business-of-fashion',
    name: 'Business of Fashion',
    feedUrl: 'https://www.businessoffashion.com/feed/',
    siteUrl: 'https://www.businessoffashion.com',
    category: 'FASHION',
    region: 'WORLD',
    tier: 1,
    weight: 7,
  },
  {
    slug: 'elle',
    name: 'Elle',
    feedUrl: 'https://www.elle.com/rss/all.xml',
    siteUrl: 'https://www.elle.com',
    category: 'FASHION',
    region: 'WORLD',
    tier: 2,
    weight: 6,
  },

  // ─── Музыка / хип-хоп ────────────────────────────────────────────────────
  {
    slug: 'xxl',
    name: 'XXL',
    feedUrl: 'https://www.xxlmag.com/feed/',
    siteUrl: 'https://www.xxlmag.com',
    category: 'MUSIC',
    region: 'WORLD',
    tier: 2,
    weight: 9,
  },
  {
    slug: 'pitchfork',
    name: 'Pitchfork',
    feedUrl: 'https://pitchfork.com/feed/feed-news/rss',
    siteUrl: 'https://pitchfork.com',
    category: 'MUSIC',
    region: 'WORLD',
    tier: 2,
    weight: 9,
  },
  {
    slug: 'rolling-stone',
    name: 'Rolling Stone',
    feedUrl: 'https://www.rollingstone.com/feed/',
    siteUrl: 'https://www.rollingstone.com',
    category: 'MUSIC',
    region: 'WORLD',
    tier: 1,
    weight: 8,
  },
  {
    slug: 'billboard',
    name: 'Billboard',
    feedUrl: 'https://www.billboard.com/feed/',
    siteUrl: 'https://www.billboard.com',
    category: 'MUSIC',
    region: 'WORLD',
    tier: 1,
    weight: 7,
  },
  {
    slug: 'nme',
    name: 'NME',
    feedUrl: 'https://www.nme.com/feed',
    siteUrl: 'https://www.nme.com',
    category: 'MUSIC',
    region: 'WORLD',
    tier: 2,
    weight: 7,
  },

  // ─── Кино ────────────────────────────────────────────────────────────────
  {
    slug: 'variety',
    name: 'Variety',
    feedUrl: 'https://variety.com/feed/',
    siteUrl: 'https://variety.com',
    category: 'CINEMA',
    region: 'WORLD',
    tier: 1,
    weight: 9,
  },
  {
    slug: 'hollywood-reporter',
    name: 'The Hollywood Reporter',
    feedUrl: 'https://www.hollywoodreporter.com/feed/',
    siteUrl: 'https://www.hollywoodreporter.com',
    category: 'CINEMA',
    region: 'WORLD',
    tier: 1,
    weight: 8,
  },
  {
    slug: 'deadline',
    name: 'Deadline',
    feedUrl: 'https://deadline.com/feed/',
    siteUrl: 'https://deadline.com',
    category: 'CINEMA',
    region: 'WORLD',
    tier: 1,
    weight: 8,
  },
  {
    slug: 'indiewire',
    name: 'IndieWire',
    feedUrl: 'https://www.indiewire.com/feed/',
    siteUrl: 'https://www.indiewire.com',
    category: 'CINEMA',
    region: 'WORLD',
    tier: 2,
    weight: 8,
  },

  // ─── Архитектура и дизайн ────────────────────────────────────────────────
  {
    slug: 'dezeen',
    name: 'Dezeen',
    feedUrl: 'https://www.dezeen.com/feed/',
    siteUrl: 'https://www.dezeen.com',
    category: 'ARCHITECTURE',
    region: 'WORLD',
    tier: 2,
    weight: 9,
  },
  {
    // Вес занижен намеренно: ArchDaily по большей части каталог проектов —
    // десятки описаний частных домов в день. Событий там мало, и без этого
    // ограничения лента забивает выдачу карточками портфолио.
    slug: 'archdaily',
    name: 'ArchDaily',
    feedUrl: 'https://www.archdaily.com/rss/',
    siteUrl: 'https://www.archdaily.com',
    category: 'ARCHITECTURE',
    region: 'WORLD',
    tier: 2,
    weight: 4,
  },
  {
    slug: 'designboom',
    name: 'Designboom',
    feedUrl: 'https://www.designboom.com/feed/',
    siteUrl: 'https://www.designboom.com',
    category: 'ARCHITECTURE',
    region: 'WORLD',
    tier: 2,
    weight: 7,
  },

  // ─── Спорт: намеренно низкий вес, чтобы его было мало в канале ───────────
  {
    slug: 'formula1',
    name: 'Formula 1',
    feedUrl: 'https://www.formula1.com/en/latest/all.xml',
    siteUrl: 'https://www.formula1.com',
    category: 'SPORT',
    region: 'WORLD',
    tier: 1,
    weight: 4,
  },
  {
    slug: 'autosport-f1',
    name: 'Autosport F1',
    feedUrl: 'https://www.autosport.com/rss/f1/news/',
    siteUrl: 'https://www.autosport.com/f1/',
    category: 'SPORT',
    region: 'WORLD',
    tier: 2,
    weight: 3,
  },
  {
    slug: 'guardian-nba',
    name: 'The Guardian NBA',
    feedUrl: 'https://www.theguardian.com/sport/nba/rss',
    siteUrl: 'https://www.theguardian.com/sport/nba',
    category: 'SPORT',
    region: 'WORLD',
    tier: 1,
    weight: 4,
  },
  {
    slug: 'guardian-football',
    name: 'The Guardian Football',
    feedUrl: 'https://www.theguardian.com/football/rss',
    siteUrl: 'https://www.theguardian.com/football',
    category: 'SPORT',
    region: 'WORLD',
    tier: 1,
    weight: 3,
  },
  {
    slug: 'sports-ru',
    name: 'Sports.ru',
    feedUrl: 'https://www.sports.ru/rss/main.xml',
    siteUrl: 'https://www.sports.ru',
    category: 'SPORT',
    region: 'RU',
    tier: 2,
    weight: 3,
  },
  {
    slug: 'championat',
    name: 'Чемпионат',
    feedUrl: 'https://www.championat.com/rss/news/',
    siteUrl: 'https://www.championat.com',
    category: 'SPORT',
    region: 'RU',
    tier: 2,
    weight: 3,
  },

  // ─── Авторитетные ленты для сверки ───────────────────────────────────────
  // Тем в канал дают мало, но именно на них агент опирается, когда нужно
  // подтвердить громкую новость вторым независимым источником.
  {
    slug: 'guardian-culture',
    name: 'The Guardian',
    feedUrl: 'https://www.theguardian.com/culture/rss',
    siteUrl: 'https://www.theguardian.com/culture',
    category: 'GENERAL',
    region: 'WORLD',
    tier: 1,
    weight: 5,
  },
  {
    slug: 'bbc-entertainment',
    name: 'BBC',
    feedUrl: 'https://feeds.bbci.co.uk/news/entertainment_and_arts/rss.xml',
    siteUrl: 'https://www.bbc.com/culture',
    category: 'GENERAL',
    region: 'WORLD',
    tier: 1,
    weight: 4,
  },
];

export const SOURCES_BY_SLUG = new Map(SOURCES.map((s) => [s.slug, s]));

/**
 * Источники, которые пробовали подключить и сознательно не стали.
 * Держим списком, чтобы не проверять их заново каждые пару месяцев.
 */
export const REJECTED_SOURCES = [
  ['The Village', 'домен не отвечает вообще — ни RSS, ни сайт'],
  ['Wonderzine', 'сайт отдаёт 502'],
  ['Vogue Business', 'блокирует ботов (403) + пейволл'],
  ['Buro 24/7', 'RSS нет, сайт рендерится через JS'],
  ['Правила жизни', 'RSS нет, сайт рендерится через JS'],
  ['Собака.ru', 'RSS нет, сайт рендерится через JS'],
  ['The Face', 'RSS нет, сайт рендерится через JS'],
  ['Complex', 'RSS выключили, сайт рендерится через JS'],
  ['Кинопоиск', 'публичный RSS закрыт'],
  ['IMDb', 'RSS нет и режет ботов; новости IMDb — перепечатки Variety/THR/Deadline, которые мы и так тянем напрямую'],
  ['ESPN', 'режет ботов (пустой 202); NBA берём через Guardian'],
  ['Reuters', 'публичные RSS закрыты в 2020'],
] as const;
