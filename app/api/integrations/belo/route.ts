import { NextRequest } from 'next/server';
import { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { parseBeloDeposit, verifyBeloSignature } from '@/lib/belo';
import { syncReportSchema } from '@/lib/sync-status';
export const runtime = 'nodejs';
export async function POST(request: NextRequest) {
  const start = process.env.BELO_IMPORT_START_AT;
  const secret = process.env.BELO_WEBHOOK_SECRET;
  const startAt = start ? new Date(start) : null;
  if (
    process.env.BELO_IMPORT_ENABLED !== 'true' ||
    process.env.BELO_IMPORT_CURRENCY !== 'ARS' ||
    !startAt ||
    isNaN(+startAt) ||
    !secret ||
    secret.length < 32
  )
    return Response.json(
      { error: 'Integración desactivada o incompleta' },
      { status: 503 },
    );
  if (Number(request.headers.get('content-length')) > 30000)
    return Response.json(
      { error: 'Mensaje demasiado grande' },
      { status: 413 },
    );
  const reader = request.body?.getReader();
  if (!reader)
    return Response.json({ error: 'Falta el mensaje' }, { status: 400 });
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    size += chunk.value.byteLength;
    if (size > 30000) {
      await reader.cancel();
      return Response.json(
        { error: 'Mensaje demasiado grande' },
        { status: 413 },
      );
    }
    chunks.push(chunk.value);
  }
  const body = Buffer.concat(chunks).toString('utf8');
  if (
    !verifyBeloSignature(
      body,
      request.headers.get('x-belo-timestamp'),
      request.headers.get('x-belo-signature'),
      secret,
    )
  )
    return Response.json({ error: 'Firma inválida' }, { status: 401 });
  let input: unknown;
  try {
    input = JSON.parse(body);
  } catch {
    return Response.json({ error: 'Mensaje inválido' }, { status: 422 });
  }
  if (
    input &&
    typeof input === 'object' &&
    'kind' in input &&
    input.kind === 'sync'
  ) {
    const report = syncReportSchema.safeParse(input);
    if (!report.success)
      return Response.json({ error: 'Reporte inválido' }, { status: 422 });
    try {
      const data = {
        lastCheckedAt: new Date(),
        complete: report.data.complete,
        pendingReviewCount: report.data.pendingReviewCount,
      };
      await db.integrationSyncState.upsert({
        where: { id: 'belo' },
        create: { id: 'belo', ...data },
        update: data,
      });
      return Response.json({ status: 'sync-recorded' });
    } catch {
      return Response.json(
        { error: 'No se pudo guardar la revisión' },
        { status: 503 },
      );
    }
  }
  let deposit: ReturnType<typeof parseBeloDeposit>;
  try {
    deposit = parseBeloDeposit(input, startAt);
  } catch {
    return Response.json(
      { error: 'Aviso no reconocido; revisar manualmente' },
      { status: 422 },
    );
  }
  try {
    await db.beloImport.create({
      data: {
        id: deposit.importId,
        gmailMessageId: deposit.gmailMessageId,
        transaction: {
          create: {
            type: 'INCOME',
            amountCents: deposit.amountCents,
            category: 'Otros',
            description: 'Cobro Belo · importado desde Gmail',
            occurredAt: deposit.occurredAt,
          },
        },
      },
    });
    return Response.json({ status: 'created' }, { status: 201 });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    )
      return Response.json({ status: 'duplicate' });
    return Response.json(
      { error: 'No se pudo importar; reintentar' },
      { status: 503 },
    );
  }
}
