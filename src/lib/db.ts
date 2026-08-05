import { PrismaClient } from '@prisma/client';

/**
 * Neon на бесплатном тарифе засыпает после нескольких минут простоя, а крон
 * ходит в базу раз в час — то есть почти всегда попадает в спящую базу.
 * Первый запрос будит её и может упасть по таймауту, поэтому подключение
 * пробуем несколько раз, прежде чем считать это настоящей ошибкой.
 */

export const prisma = new PrismaClient({
  log: ['error'],
});

export async function connectWithRetry(attempts = 4): Promise<void> {
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      await prisma.$connect();
      await prisma.$queryRaw`SELECT 1`;
      return;
    } catch (error) {
      if (attempt === attempts) throw error;
      const waitMs = attempt * 3000;
      console.warn(
        `База не ответила (попытка ${attempt}/${attempts}), ждём ${waitMs / 1000}с — Neon просыпается`,
      );
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
  }
}
