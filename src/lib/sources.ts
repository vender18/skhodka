/**
 * Источники, из которых агент собирает инфоповоды.
 *
 * Профиль канала — молодёжная культура: хип-хоп, стритвир и кроссовки, показы
 * и модные дома, баскетбол и футбол как часть той же тусовки.
 *
 * Список намеренно КОРОТКИЙ и состоит только из крупных изданий. Раньше лент
 * было 37, включая нишевые, и через них в выдачу лезли проходные новости,
 * о которых никто не говорит. Мелкое издание пишет обо всём подряд, крупное
 * — только о том, что действительно заметно, и это лучший фильтр качества,
 * чем любые правила отбора.
 *
 * Архитектуры и «высокой» культуры здесь нет: каналы-ориентиры такого не
 * публикуют, а архитектурные ленты вдобавок забивали выдачу карточками
 * частных домов.
 *
 * ВАЖНО: каждая лента проверена вручную и на момент добавления отдавала
 * рабочий RSS. Перед добавлением новой прогоняй `npm run check-feeds` —
 * мёртвая лента молча съедает время каждого запуска.
 *
 * tier — насколько источнику можно верить в одиночку:
 *   1 — авторитетное издание. Ссылки на него достаточно для громкой новости.
 *   2 — профильное издание. Для своей темы его хватает, но громкую новость
 *       в одиночку не подтверждает.
 *   3 — агрегатор, инсайдер, слухи. Сам по себе не подтверждает ничего.
 *
 * weight — насколько охотно берём отсюда темы (0–10). Влияет на отбор, но
 *   не на проверку фактов.
 */

export type Category = 'CINEMA' | 'MUSIC' | 'FASHION' | 'SPORT' | 'GENERAL';

export type Region = 'RU' | 'WORLD';

export interface SourceDef {
  slug: string;
  name: string;
  /** 'rss' — обычная лента; 'telegram' — публичный канал, feedUrl это его имя */
  kind?: 'rss' | 'telegram';
  feedUrl: string;
  siteUrl: string;
  category: Category;
  region: Region;
  tier: 1 | 2 | 3;
  weight: number;
}

export const SOURCES: SourceDef[] = [
  // ─── Хип-хоп и музыка ────────────────────────────────────────────────────
  {
    slug: 'xxl',
    name: 'XXL',
    feedUrl: 'https://www.xxlmag.com/feed/',
    siteUrl: 'https://www.xxlmag.com',
    category: 'MUSIC',
    region: 'WORLD',
    tier: 2,
    weight: 10,
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
    slug: 'rolling-stone',
    name: 'Rolling Stone',
    feedUrl: 'https://www.rollingstone.com/feed/',
    siteUrl: 'https://www.rollingstone.com',
    category: 'MUSIC',
    region: 'WORLD',
    tier: 1,
    weight: 7,
  },
  {
    slug: 'pitchfork',
    name: 'Pitchfork',
    feedUrl: 'https://pitchfork.com/feed/feed-news/rss',
    siteUrl: 'https://pitchfork.com',
    category: 'MUSIC',
    region: 'WORLD',
    tier: 2,
    weight: 6,
  },

  // ─── Стритвир, кроссовки, мода ───────────────────────────────────────────
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
    slug: 'blueprint',
    name: 'The Blueprint',
    feedUrl: 'https://theblueprint.ru/rss',
    siteUrl: 'https://theblueprint.ru',
    category: 'FASHION',
    region: 'RU',
    tier: 2,
    weight: 9,
  },
  {
    slug: 'dazed',
    name: 'Dazed',
    feedUrl: 'https://www.dazeddigital.com/rss',
    siteUrl: 'https://www.dazeddigital.com',
    category: 'FASHION',
    region: 'WORLD',
    tier: 2,
    weight: 8,
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
    slug: 'gq',
    name: 'GQ',
    feedUrl: 'https://www.gq.com/feed/rss',
    siteUrl: 'https://www.gq.com',
    category: 'FASHION',
    region: 'WORLD',
    tier: 2,
    weight: 6,
  },
  {
    slug: 'vogue',
    name: 'Vogue',
    feedUrl: 'https://www.vogue.com/feed/rss',
    siteUrl: 'https://www.vogue.com',
    category: 'FASHION',
    region: 'WORLD',
    tier: 1,
    weight: 6,
  },
  {
    slug: 'harpers-bazaar',
    name: "Harper's Bazaar",
    feedUrl: 'https://www.harpersbazaar.com/rss/all.xml',
    siteUrl: 'https://www.harpersbazaar.com',
    category: 'FASHION',
    region: 'WORLD',
    tier: 2,
    weight: 5,
  },

  // ─── Баскетбол и футбол ──────────────────────────────────────────────────
  // Нас интересует спорт как часть той же тусовки: форма, кроссовки, образы
  // игроков, переходы уровня «об этом говорят все». Счета матчей — нет.
  {
    slug: 'guardian-nba',
    name: 'The Guardian NBA',
    feedUrl: 'https://www.theguardian.com/sport/nba/rss',
    siteUrl: 'https://www.theguardian.com/sport/nba',
    category: 'SPORT',
    region: 'WORLD',
    tier: 1,
    weight: 5,
  },
  {
    slug: 'guardian-football',
    name: 'The Guardian Football',
    feedUrl: 'https://www.theguardian.com/football/rss',
    siteUrl: 'https://www.theguardian.com/football',
    category: 'SPORT',
    region: 'WORLD',
    tier: 1,
    weight: 4,
  },

  // ─── Кино: только громкое ────────────────────────────────────────────────
  {
    slug: 'variety',
    name: 'Variety',
    feedUrl: 'https://variety.com/feed/',
    siteUrl: 'https://variety.com',
    category: 'CINEMA',
    region: 'WORLD',
    tier: 1,
    weight: 6,
  },

  // ─── Рэп-новости: релизы, бифы, что происходит с артистами ───────────────
  {
    slug: 'hotnewhiphop',
    name: 'HotNewHipHop',
    feedUrl: 'https://www.hotnewhiphop.com/feed',
    siteUrl: 'https://www.hotnewhiphop.com',
    category: 'MUSIC',
    region: 'WORLD',
    tier: 2,
    weight: 9,
  },
  {
    slug: 'the-source',
    name: 'The Source',
    feedUrl: 'https://thesource.com/feed/',
    siteUrl: 'https://thesource.com',
    category: 'MUSIC',
    region: 'WORLD',
    tier: 2,
    weight: 7,
  },
  {
    slug: 'vibe',
    name: 'Vibe',
    feedUrl: 'https://www.vibe.com/feed/',
    siteUrl: 'https://www.vibe.com',
    category: 'MUSIC',
    region: 'WORLD',
    tier: 2,
    weight: 7,
  },
  {
    slug: 'allhiphop',
    name: 'AllHipHop',
    feedUrl: 'https://allhiphop.com/feed/',
    siteUrl: 'https://allhiphop.com',
    category: 'MUSIC',
    region: 'WORLD',
    tier: 2,
    weight: 6,
  },

  // ─── Кроссовки и спорт как стиль ─────────────────────────────────────────
  {
    slug: 'sneaker-freaker',
    name: 'Sneaker Freaker',
    feedUrl: 'https://www.sneakerfreaker.com/rss.xml',
    siteUrl: 'https://www.sneakerfreaker.com',
    category: 'FASHION',
    region: 'WORLD',
    tier: 2,
    weight: 8,
  },
  {
    slug: 'boardroom',
    name: 'Boardroom',
    feedUrl: 'https://boardroom.tv/feed/',
    siteUrl: 'https://boardroom.tv',
    category: 'SPORT',
    region: 'WORLD',
    tier: 2,
    weight: 6,
  },

  // ─── Телеграм-каналы: радар повестки ─────────────────────────────────────
  // Все третьего уровня и с низким весом. Они показывают, о чём СЕЙЧАС
  // говорят — особенно на русской сцене, которой в RSS почти нет, — но
  // новость сами не подтверждают: для этого нужен нормальный источник.
  {
    slug: 'tg-nocap',
    name: 'No Cap',
    kind: 'telegram',
    feedUrl: 'nocap',
    siteUrl: 'https://t.me/nocap',
    category: 'MUSIC',
    region: 'RU',
    tier: 3,
    weight: 6,
  },
  {
    slug: 'tg-theflow',
    name: 'The Flow',
    kind: 'telegram',
    feedUrl: 'superslowflow',
    siteUrl: 'https://t.me/superslowflow',
    category: 'MUSIC',
    region: 'RU',
    tier: 3,
    weight: 6,
  },
  {
    slug: 'tg-fmlmatters',
    name: 'FML MATTERS',
    kind: 'telegram',
    feedUrl: 'fmlmttrs',
    siteUrl: 'https://t.me/fmlmttrs',
    category: 'MUSIC',
    region: 'RU',
    tier: 3,
    weight: 5,
  },
  {
    slug: 'tg-musiccore',
    name: 'Music Core',
    kind: 'telegram',
    feedUrl: 'themusiccore',
    siteUrl: 'https://t.me/themusiccore',
    category: 'MUSIC',
    region: 'RU',
    tier: 3,
    weight: 5,
  },
  {
    slug: 'tg-sportcore',
    name: 'Sport Core',
    kind: 'telegram',
    feedUrl: 'thesportcore',
    siteUrl: 'https://t.me/thesportcore',
    category: 'SPORT',
    region: 'RU',
    tier: 3,
    weight: 6,
  },
  {
    slug: 'tg-ame',
    name: 'ame',
    kind: 'telegram',
    feedUrl: 'amemagazine',
    siteUrl: 'https://t.me/amemagazine',
    category: 'FASHION',
    region: 'RU',
    tier: 3,
    weight: 5,
  },
];

export const SOURCES_BY_SLUG = new Map(SOURCES.map((s) => [s.slug, s]));

/**
 * Источники, которые пробовали подключить и сознательно не стали.
 * Держим списком, чтобы не проверять их заново каждые пару месяцев.
 */
export const REJECTED_SOURCES = [
  ['Dezeen, ArchDaily, Designboom', 'архитектура убрана из профиля канала; ArchDaily вдобавок каталог частных домов, забивал выдачу'],
  ['Афиша Daily, Сноб, Коммерсантъ Стиль, Лента, Медуза, ТАСС, Интерфакс, Forbes', '«высокая» культура и общие новости убраны из профиля'],
  ['Sports.ru, Чемпионат, Autosport', 'рутинные результаты матчей, каналу не нужны'],
  ['The Flow', 'домен не отвечает — русского хип-хоп издания с рабочим RSS найти не удалось'],
  ['Complex', 'RSS выключен, сайт рендерится через JS'],
  ['SLAM, HipHopDX, Sole Collector, SoccerBible', 'режут ботов или отдают 404/410'],
  ['The Village', 'домен не отвечает вообще'],
  ['Wonderzine', 'сайт отдаёт 502'],
  ['Vogue Business', 'блокирует ботов + пейволл'],
  ['Buro 24/7, Правила жизни, Собака.ru, The Face', 'RSS нет, сайты рендерятся через JS'],
  ['Кинопоиск', 'публичный RSS закрыт'],
  ['IMDb', 'RSS нет и режет ботов; его новости — перепечатки Variety/THR/Deadline'],
  ['ESPN', 'режет ботов; NBA берём через Guardian'],
  ['Reuters', 'публичные RSS закрыты, api отдаёт 401 — подключить нельзя'],
  ['AP News', 'RSS-хаба больше нет, отдаёт 404'],
  ['People, Entertainment Weekly', 'лента за платной стеной, отдаёт 402'],
  ['HotNewHipHop, 2DOPEBOYZ, Sneaker News, Nice Kicks, Hypebae, Footy Headlines, Boardroom, Yahoo NBA, CBS NBA, WWD, Elle, i-D, NME',
   'работают, но нишевые: через них лезли проходные новости. Список сокращён до крупных изданий сознательно'],
] as const;
