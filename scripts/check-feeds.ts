import Parser from 'rss-parser';
import { SOURCES } from '../src/lib/sources.js';
import { fetchTelegramChannel } from '../src/lib/telegram-source.js';

/**
 * Проверяет, что все ленты из sources.ts живы.
 * Гонять перед добавлением источников и раз в пару месяцев: издания
 * периодически выключают RSS, и мёртвая лента молча выпадает из сбора.
 */

const parser = new Parser({
  timeout: 20_000,
  headers: {
    'User-Agent':
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
  },
});

async function main(): Promise<void> {
  const broken: string[] = [];

  await Promise.all(
    SOURCES.map(async (source) => {
      try {
        const count =
          source.kind === 'telegram'
            ? (await fetchTelegramChannel(source.feedUrl)).length
            : ((await parser.parseURL(source.feedUrl)).items?.length ?? 0);
        if (count === 0) {
          broken.push(source.slug);
          console.log(`ПУСТО   ${source.name} — лента открылась, но материалов нет`);
        } else {
          console.log(`ок      ${source.name} (${count})`);
        }
      } catch (error) {
        broken.push(source.slug);
        const message = error instanceof Error ? error.message : String(error);
        console.log(`УПАЛО   ${source.name} — ${message}`);
      }
    }),
  );

  console.log(`\nЖивых лент: ${SOURCES.length - broken.length} из ${SOURCES.length}`);
  if (broken.length > 0) {
    console.log(`Проблемные: ${broken.join(', ')}`);
    process.exitCode = 1;
  }
}

void main();
