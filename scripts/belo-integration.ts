import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomBytes, createHmac, createHash } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { formatInTimeZone } from 'date-fns-tz';
import { TZ } from '../lib/finance';
const connectionString = process.env.TEST_DATABASE_URL;
if (!connectionString)
  throw new Error(
    'Configurá TEST_DATABASE_URL con una base exclusiva de pruebas y sus migraciones aplicadas.',
  );
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
const secret = randomBytes(48).toString('base64');
const suffix = randomBytes(8).toString('hex');
const messageId = `<boostify-integration-${suffix}@example.test>`;
const importId = createHash('sha256').update(messageId).digest('hex');
const child = spawn(
  process.execPath,
  ['node_modules/next/dist/bin/next', 'start', '-H', '127.0.0.1', '-p', '3102'],
  {
    env: {
      ...process.env,
      DATABASE_URL: connectionString,
      BELO_IMPORT_ENABLED: 'true',
      BELO_IMPORT_CURRENCY: 'ARS',
      BELO_IMPORT_START_AT: new Date(Date.now() - 300000).toISOString(),
      BELO_WEBHOOK_SECRET: secret,
    },
    stdio: 'ignore',
  },
);
const transactionIds: string[] = [];
let previousSync: Awaited<
  ReturnType<typeof db.integrationSyncState.findUnique>
> = null;
let syncTouched = false;
const base = 'http://127.0.0.1:3102';
async function post(payload: unknown, signed = true) {
  const body = JSON.stringify(payload);
  const timestamp = String(Date.now());
  return fetch(base + '/api/integrations/belo', {
    method: 'POST',
    body,
    headers: {
      'Content-Type': 'application/json',
      ...(signed
        ? {
            'x-belo-timestamp': timestamp,
            'x-belo-signature': createHmac('sha256', secret)
              .update(timestamp + '.' + body)
              .digest('hex'),
          }
        : {}),
    },
  });
}
try {
  let ready = false;
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(base + '/login')).ok) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 250));
  }
  assert(ready, 'Servidor de pruebas no disponible');
  previousSync = await db.integrationSyncState.findUnique({
    where: { id: 'belo' },
  });
  const countBefore = await db.transaction.count();
  const report = { kind: 'sync', complete: true, pendingReviewCount: 0 };
  assert.equal((await post(report, false)).status, 401);
  assert.equal((await post({ ...report, pendingReviewCount: -1 })).status, 422);
  syncTouched = true;
  const checkStarted = Date.now();
  assert.equal((await post(report)).status, 200);
  const sync = await db.integrationSyncState.findUniqueOrThrow({
    where: { id: 'belo' },
  });
  assert(sync.lastCheckedAt.getTime() >= checkStarted);
  assert.equal(sync.complete, true);
  assert.equal(sync.pendingReviewCount, 0);
  assert.equal(await db.transaction.count(), countBefore);
  assert.equal(
    (await post({ ...report, complete: false, pendingReviewCount: 2 })).status,
    200,
  );
  assert.equal(
    (await db.integrationSyncState.findUniqueOrThrow({ where: { id: 'belo' } }))
      .complete,
    false,
  );
  const payload = {
    gmailMessageId: suffix,
    messageId,
    sender: 'transaction@belo.app',
    subject:
      'Aviso de operación - ' +
      formatInTimeZone(new Date(), TZ, 'dd/MM/yyyy HH:mm:ss'),
    text: 'Depósito exitoso\nTu cuenta de belo recibió un depósito de $990',
    receivedAt: new Date().toISOString(),
    authenticated: true,
  };
  assert.equal((await post(payload, false)).status, 401);
  assert.equal(
    (await post({ ...payload, text: 'Retiro exitoso' })).status,
    422,
  );
  assert.equal(
    (await post({ ...payload, text: 'x'.repeat(31000) })).status,
    413,
  );
  const results = await Promise.all([post(payload), post(payload)]);
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 201]);
  const receipt = await db.beloImport.findUniqueOrThrow({
    where: { id: importId },
    include: { transaction: true },
  });
  assert(receipt.transaction);
  transactionIds.push(receipt.transaction.id);
  assert.equal(receipt.transaction.amountCents, 99000);
  assert.equal(receipt.transaction.category, 'Otros');
  await db.transaction.update({
    where: { id: receipt.transaction.id },
    data: { amountCents: 100000 },
  });
  assert.equal((await post(payload)).status, 200);
  assert.equal(
    (
      await db.transaction.findUniqueOrThrow({
        where: { id: receipt.transaction.id },
      })
    ).amountCents,
    100000,
  );
  await db.transaction.delete({ where: { id: receipt.transaction.id } });
  assert.equal(
    (await db.beloImport.findUniqueOrThrow({ where: { id: importId } }))
      .transactionId,
    null,
  );
  assert.equal((await post(payload)).status, 200);
  assert.equal(
    await db.transaction.count({ where: { id: receipt.transaction.id } }),
    0,
  );
  console.log(
    'PASS: fecha de revisión persistida incluso sin cobros, reporte protegido, endpoint firmado, rechazo 401/413/422, concurrencia sin duplicados, edición conservada y eliminación sin reimportación.',
  );
} finally {
  child.kill('SIGTERM');
  await db.beloImport.deleteMany({ where: { id: importId } });
  await db.transaction.deleteMany({ where: { id: { in: transactionIds } } });
  if (syncTouched) {
    if (previousSync)
      await db.integrationSyncState.upsert({
        where: { id: 'belo' },
        create: previousSync,
        update: previousSync,
      });
    else await db.integrationSyncState.deleteMany({ where: { id: 'belo' } });
  }
  await db.$disconnect();
}
