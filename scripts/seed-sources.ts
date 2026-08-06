import { prisma, connectWithRetry } from '../src/lib/db.js';
import { SOURCES } from '../src/lib/sources.js';

/**
 * Заливает список источников из кода в базу.
 * Запускать после каждой правки sources.ts — скрипт идемпотентный,
 * существующие источники обновит, новые добавит.
 */

async function main(): Promise<void> {
  await connectWithRetry();

  for (const source of SOURCES) {
    await prisma.source.upsert({
      where: { slug: source.slug },
      create: {
        slug: source.slug,
        name: source.name,
        kind: source.kind ?? 'rss',
        feedUrl: source.feedUrl,
        siteUrl: source.siteUrl,
        category: source.category,
        region: source.region,
        tier: source.tier,
        weight: source.weight,
      },
      update: {
        name: source.name,
        kind: source.kind ?? 'rss',
        feedUrl: source.feedUrl,
        siteUrl: source.siteUrl,
        category: source.category,
        region: source.region,
        tier: source.tier,
        weight: source.weight,
      },
    });
  }

  // Источники, удалённые из кода, выключаем, но не стираем:
  // на них могут ссылаться уже собранные материалы.
  const slugs = SOURCES.map((s) => s.slug);
  const disabled = await prisma.source.updateMany({
    where: { slug: { notIn: slugs }, enabled: true },
    data: { enabled: false },
  });

  console.log(`Источников записано: ${SOURCES.length}`);
  if (disabled.count > 0) console.log(`Выключено убранных из кода: ${disabled.count}`);

  await prisma.$disconnect();
}

void main();
