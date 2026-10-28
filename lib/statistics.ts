import { addDays, subMonths } from 'date-fns';
import { z } from 'zod';
import { range, day, totals, transactionSchema, dateSchema } from './finance';
export function previousRange(
  period: string | undefined,
  selected: ReturnType<typeof range>,
) {
  const a = new Date(selected.a + 'T12:00:00Z'),
    b = new Date(selected.b + 'T12:00:00Z');
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  if (period === 'month' || !period)
    return range('custom', iso(subMonths(a, 1)), iso(subMonths(b, 1)));
  if (period === 'previous') {
    const start = subMonths(a, 1);
    return range('custom', iso(start), iso(addDays(a, -1)));
  }
  const length = Math.round((+b - +a) / 86400000) + 1;
  return range('custom', iso(addDays(a, -length)), iso(addDays(a, -1)));
}
export function paymentStats(rows: { type: string; amountCents: number }[]) {
  const count = rows.filter((r) => r.type === 'INCOME').length;
  return {
    count,
    averageCents: count ? Math.round(totals(rows).income / count) : 0,
  };
}
export function variation(current: number, previous: number) {
  return {
    delta: current - previous,
    percent: previous > 0 ? ((current - previous) / previous) * 100 : null,
  };
}
export const goalSchema = z.object({
  month: z
    .string()
    .regex(/^\d{4}-\d{2}$/)
    .refine((v) => dateSchema.safeParse(v + '-01').success),
  amount: transactionSchema.shape.amount,
});
export function goalProgress(target: number, profit: number, now = new Date()) {
  const today = day(now);
  const local = new Date(today + 'T12:00:00Z');
  const last = new Date(
    Date.UTC(local.getUTCFullYear(), local.getUTCMonth() + 1, 0, 12),
  );
  const remainingDays = last.getUTCDate() - local.getUTCDate() + 1;
  const remainingCents = Math.max(0, target - profit);
  return {
    remainingCents,
    remainingDays,
    dailyCents: Math.ceil(remainingCents / remainingDays),
    percent: target > 0 ? Math.max(0, (profit / target) * 100) : 0,
  };
}

export function todayStats(
  rows: { type: string; amountCents: number; occurredAt: Date }[],
  now = new Date(),
) {
  const dates = range('today', undefined, undefined, now);
  const todayRows = rows.filter(
    (row) => row.occurredAt >= dates.start && row.occurredAt < dates.end,
  );
  return { date: dates.a, ...totals(todayRows), ...paymentStats(todayRows) };
}
