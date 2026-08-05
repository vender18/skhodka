/**
 * Источники, из которых агент собирает инфоповоды.
 *
 * Профиль канала — молодёжная культура: хип-хоп, стритвир и кроссовки, показы
 * и модные дома, баскетбол и футбол как часть той же тусовки. Архитектуры и
 * «высокой» культуры (выставки, музеи, театр) здесь намеренно нет: каналы-
 * ориентиры такого не публикуют, а архитектурные ленты вдобавок забивали
 * выдачу карточками частных домов.
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
    slug: '2dopeboyz',
    name: '2DOPEBOYZ',
    feedUrl: 'https://2dopeboyz.com/feed/',
    siteUrl: 'https://2dopeboyz.com',
    category: 'MUSIC',
    region: 'WORLD',
    tier: 2,
    weight: 7,
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
  {
    slug: 'nme',
    name: 'NME',
    feedUrl: 'https://www.nme.com/feed',
    siteUrl: 'https://www.nme.com',
    category: 'MUSIC',
    region: 'WORLD',
    tier: 2,
    weight: 4,
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
    slug: 'sneaker-news',
    name: 'Sneaker News',
    feedUrl: 'https://sneakernews.com/feed/',
    siteUrl: 'https://sneakernews.com',
    category: 'FASHION',
    region: 'WORLD',
    tier: 2,
    weight: 9,
  },
  {
    slug: 'hypebae',
    name: 'Hypebae',
    feedUrl: 'https://hypebae.com/feed',
    siteUrl: 'https://hypebae.com',
    category: 'FASHION',
    region: 'WORLD',
    tier: 2,
    weight: 8,
  },
  {
    slug: 'nice-kicks',
    name: 'Nice Kicks',
    feedUrl: 'https://www.nicekicks.com/feed/',
    siteUrl: 'https://www.nicekicks.com',
    category: 'FASHION',
    region: 'WORLD',
    tier: 2,
    weight: 8,
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
    slug: 'i-d',
    name: 'i-D',
    feedUrl: 'https://i-d.co/feed/',
    siteUrl: 'https://i-d.co',
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
    slug: 'wwd',
    name: 'WWD',
    feedUrl: 'https://wwd.com/feed/',
    siteUrl: 'https://wwd.com',
    category: 'FASHION',
    region: 'WORLD',
    tier: 1,
    weight: 5,
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
  {
    slug: 'elle',
    name: 'Elle',
    feedUrl: 'https://www.elle.com/rss/all.xml',
    siteUrl: 'https://www.elle.com',
    category: 'FASHION',
    region: 'WORLD',
    tier: 2,
    weight: 4,
  },

  // ─── Баскетбол и футбол ──────────────────────────────────────────────────
  // Нас интересует спорт как часть той же тусовки: форма, кроссовки, образы
  // игроков, переходы уровня «об этом говорят все». Счета матчей — нет.
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
  {
    slug: 'yahoo-nba',
    name: 'Yahoo Sports NBA',
    feedUrl: 'https://sports.yahoo.com/nba/rss.xml',
    siteUrl: 'https://sports.yahoo.com/nba/',
    category: 'SPORT',
    region: 'WORLD',
    tier: 2,
    weight: 5,
  },
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
    slug: 'footy-headlines',
    name: 'Footy Headlines',
    feedUrl: 'https://www.footyheadlines.com/feeds/posts/default',
    siteUrl: 'https://www.footyheadlines.com',
    category: 'SPORT',
    region: 'WORLD',
    tier: 2,
    weight: 5,
  },
  {
    slug: 'cbs-nba',
    name: 'CBS Sports NBA',
    feedUrl: 'https://www.cbssports.com/rss/headlines/nba/',
    siteUrl: 'https://www.cbssports.com/nba/',
    category: 'SPORT',
    region: 'WORLD',
    tier: 2,
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
    weight: 4,
  },
  {
    slug: 'formula1',
    name: 'Formula 1',
    feedUrl: 'https://www.formula1.com/en/latest/all.xml',
    siteUrl: 'https://www.formula1.com',
    category: 'SPORT',
    region: 'WORLD',
    tier: 1,
    weight: 3,
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
  {
    slug: 'deadline',
    name: 'Deadline',
    feedUrl: 'https://deadline.com/feed/',
    siteUrl: 'https://deadline.com',
    category: 'CINEMA',
    region: 'WORLD',
    tier: 1,
    weight: 5,
  },
  {
    slug: 'hollywood-reporter',
    name: 'The Hollywood Reporter',
    feedUrl: 'https://www.hollywoodreporter.com/feed/',
    siteUrl: 'https://www.hollywoodreporter.com',
    category: 'CINEMA',
    region: 'WORLD',
    tier: 1,
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
  ['ESPN', 'режет ботов; NBA берём через Yahoo, CBS и Guardian'],
  ['Reuters', 'публичные RSS закрыты в 2020'],
] as const;
