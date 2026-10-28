import { z } from 'zod';
import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';
import { addDays, subMonths } from 'date-fns';
export const TZ = 'America/Argentina/Cordoba';
export const categories = {
  INCOME: [
    'Seguidores Instagram',
    'Likes Instagram',
    'Vistas Instagram',
    'Seguidores Facebook',
    'Likes Facebook',
    'Seguidores TikTok',
    'Otros',
  ],
  EXPENSE: ['Proveedores', 'Meta Ads', 'Comisiones', 'Herramientas', 'Otros'],
};
export const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((v) => {
    const d = new Date(v + 'T12:00:00Z');
    return !isNaN(+d) && d.toISOString().slice(0, 10) === v;
  }, 'Fecha inválida');
export const transactionSchema = z
  .object({
    type: z.enum(['INCOME', 'EXPENSE']),
    amount: z
      .string()
      .regex(
        /^\d{1,8}([.,]\d{1,2})?$/,
        'Usá un importe positivo con hasta 2 decimales',
      )
      .transform((v) => {
        const [a, b = ''] = v.replace(',', '.').split('.');
        return Number(a) * 100 + Number(b.padEnd(2, '0'));
      })
      .refine((v) => v > 0 && v <= 2147483647, 'Importe fuera de rango'),
    category: z.string(),
    description: z.string().trim().max(300).optional(),
    date: dateSchema,
  })
  .superRefine((v, c) => {
    if (!categories[v.type].includes(v.category))
      c.addIssue({
        code: 'custom',
        path: ['category'],
        message: 'Categoría inválida',
      });
  });
export const money = (cents: number) =>
  new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 2,
  }).format(cents / 100);
export const day = (date: Date) => formatInTimeZone(date, TZ, 'yyyy-MM-dd');
export function totals(rows: { type: string; amountCents: number }[]) {
  const income = rows
    .filter((r) => r.type === 'INCOME')
    .reduce((a, r) => a + r.amountCents, 0);
  const expense = rows
    .filter((r) => r.type === 'EXPENSE')
    .reduce((a, r) => a + r.amountCents, 0);
  return {
    income,
    expense,
    profit: income - expense,
    margin: income ? ((income - expense) / income) * 100 : 0,
  };
}
export function range(
  period = 'month',
  start?: string,
  end?: string,
  now = new Date(),
) {
  const today = day(now);
  const local = new Date(today + 'T12:00:00Z');
  let a = today,
    b = today;
  if (period === 'week') a = addDays(local, -6).toISOString().slice(0, 10);
  else if (period === 'previous') {
    a = subMonths(local, 1).toISOString().slice(0, 7) + '-01';
    b = addDays(new Date(today.slice(0, 7) + '-01T12:00:00Z'), -1)
      .toISOString()
      .slice(0, 10);
  } else if (period === 'custom') {
    a = dateSchema.parse(start);
    b = dateSchema.parse(end);
    if (a > b) throw new Error('El inicio debe ser anterior al fin');
    if ((+new Date(b) - +new Date(a)) / 86400000 > 730)
      throw new Error('Elegí un rango de hasta 2 años');
  } else if (period !== 'today' && period !== 'week')
    a = today.slice(0, 7) + '-01';
  return {
    start: fromZonedTime(a + 'T00:00:00', TZ),
    end: fromZonedTime(
      addDays(new Date(b + 'T12:00:00Z'), 1)
        .toISOString()
        .slice(0, 10) + 'T00:00:00',
      TZ,
    ),
    a,
    b,
  };
}
export function csvCell(value: string) {
  return (
    '"' + value.replace(/^\s*[=+@\-\t\r]/, "'$&").replaceAll('"', '""') + '"'
  );
}
