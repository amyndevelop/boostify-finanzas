import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { totals } from '../lib/finance';
import assert from 'node:assert/strict';
const url = process.env.TEST_DATABASE_URL;
if (!url)
  throw new Error(
    'Configurá TEST_DATABASE_URL con una base exclusiva de pruebas.',
  );
const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: url }),
});
const ids: string[] = [];
try {
  const income = await db.transaction.create({
    data: {
      type: 'INCOME',
      amountCents: 10000,
      category: 'Otros',
      description: 'Integration test',
      occurredAt: new Date('2026-10-28T15:00:00Z'),
    },
  });
  ids.push(income.id);
  const expense = await db.transaction.create({
    data: {
      type: 'EXPENSE',
      amountCents: 2500,
      category: 'Herramientas',
      occurredAt: income.occurredAt,
    },
  });
  ids.push(expense.id);
  let rows = await db.transaction.findMany({
    where: { id: { in: ids } },
    orderBy: { amountCents: 'desc' },
  });
  assert.equal(totals(rows).profit, 7500);
  await db.transaction.update({
    where: { id: expense.id },
    data: { amountCents: 3000 },
  });
  rows = await db.transaction.findMany({
    where: { id: { in: ids }, type: 'EXPENSE' },
  });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].amountCents, 3000);
  await db.transaction.delete({ where: { id: income.id } });
  assert.equal(await db.transaction.count({ where: { id: income.id } }), 0);
  console.log(
    'PASS: PostgreSQL + Prisma create/read/update/delete y cálculos.',
  );
} finally {
  await db.transaction.deleteMany({ where: { id: { in: ids } } });
  await db.$disconnect();
}
