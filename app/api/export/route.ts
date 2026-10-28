import { NextRequest } from 'next/server';
import { session } from '@/lib/auth';
import { db } from '@/lib/db';
import { filters } from '@/lib/query';
import { csvCell, day } from '@/lib/finance';
export async function GET(req: NextRequest) {
  if (!(await session())) return new Response('No autorizado', { status: 401 });
  try {
    const { where } = filters(Object.fromEntries(req.nextUrl.searchParams));
    const rows = await db.transaction.findMany({
      where,
      orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }],
    });
    const csv = [
      'Fecha,Tipo,Categoría,Descripción,Importe ARS',
      ...rows.map((r) =>
        [
          day(r.occurredAt),
          r.type === 'INCOME' ? 'Ingreso' : 'Gasto',
          r.category,
          r.description ?? '',
          (r.amountCents / 100).toFixed(2),
        ]
          .map(csvCell)
          .join(','),
      ),
    ].join('\r\n');
    return new Response('\uFEFF' + csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition':
          'attachment; filename="boostify-movimientos.csv"',
        'Cache-Control': 'private, no-store',
      },
    });
  } catch {
    return new Response('No se pudo exportar. Revisá el período.', {
      status: 400,
    });
  }
}
