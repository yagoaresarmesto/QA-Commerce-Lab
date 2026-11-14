/**
 * CLI seed script.
 *   npm run db:seed               → upserts/restores the reference dataset (keeps run-scoped data)
 *   npm run db:seed -- --reset    → truncates every table and seeds from scratch (deterministic IDs)
 *   node dist/prisma/seed.js --if-empty → seeds only when the database has no products (container start)
 */
import '../src/load-env';
import { PrismaClient } from '@prisma/client';
import { ReferenceSeeder } from '../src/seed/reference-seeder';

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  const reset = process.argv.includes('--reset');
  try {
    if (process.argv.includes('--if-empty') && (await prisma.product.count()) > 0) {
      console.warn('[seed] Database already contains data: skipping seed');
      return;
    }
    const seeder = new ReferenceSeeder(prisma);
    const summary = reset ? await seeder.reset() : await seeder.seed();
    console.warn(`[seed] ${reset ? 'Database reset and seeded' : 'Reference data restored'}: ${JSON.stringify(summary)}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('[seed] failed', err);
  process.exit(1);
});
