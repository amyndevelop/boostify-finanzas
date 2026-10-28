import { addDays } from 'date-fns';
import { formatInTimeZone } from 'date-fns-tz';
import { day, TZ } from './finance';
export type InsightRow = {
  type: string;
  amountCents: number;
  occurredAt: Date;
};
export const nextDay = (v: string, offset = 1) =>
  addDays(new Date(v + 'T12:00:00Z'), offset)
    .toISOString()
    .slice(0, 10);
export function coverageStart(
  configured: string | undefined,
  first: Date | null,
) {
  const instant = configured ? new Date(configured) : null;
  if (instant && !isNaN(+instant)) {
    const date = day(instant);
    return {
      date,
      completeFrom:
        formatInTimeZone(instant, TZ, 'HH:mm:ss.SSS') === '00:00:00.000'
          ? date
          : nextDay(date),
      confirmed: true,
    };
  }
  if (first) {
    const date = day(first);
    return { date, completeFrom: nextDay(date), confirmed: false };
  }
  return null;
}
export function insights(
  rows: InsightRow[],
  start: string,
  end: string,
  coverage: ReturnType<typeof coverageStart>,
  now = new Date(),
) {
  const today = day(now);
  const stop = end < today ? end : today;
  const daily = new Map<
    string,
    {
      date: string;
      income: number;
      expense: number;
      count: number;
      active: boolean;
    }
  >();
  const begin = nextDay(start, -29);
  for (let d = begin; d <= stop; d = nextDay(d))
    daily.set(d, { date: d, income: 0, expense: 0, count: 0, active: false });
  const selected: InsightRow[] = [];
  for (const row of rows) {
    const date = day(row.occurredAt);
    const d = daily.get(date);
    if (d) {
      d.active = true;
      if (row.type === 'INCOME') {
        d.income += row.amountCents;
        d.count++;
      } else d.expense += row.amountCents;
    }
    if (date >= start && date <= stop) selected.push(row);
  }
  const isObserved = (date: string) =>
    Boolean(coverage && date >= coverage.date);
  const isComplete = (date: string) =>
    Boolean(coverage && date >= coverage.completeFrom && date < today);
  const days = [...daily.values()]
    .filter((d) => d.date >= start)
    .map((d) => {
      function moving(n: number) {
        const window = Array.from({ length: n }, (_, i) =>
          daily.get(nextDay(d.date, -i)),
        );
        if (window.some((v) => !v || !isComplete(v.date))) return null;
        return Math.round(window.reduce((s, v) => s + v!.income, 0) / n);
      }
      return {
        ...d,
        profit: d.income - d.expense,
        observed: isObserved(d.date),
        partial: !isComplete(d.date),
        moving7: moving(7),
        moving30: moving(30),
      };
    });
  const weekdayNames = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
  const week = weekdayNames.map((label, index) => ({
    label,
    index,
    count: 0,
    income: 0,
    days: 0,
    average: 0,
  }));
  const hours = Array.from({ length: 24 }, (_, hour) => ({
    label: String(hour).padStart(2, '0') + ':00',
    count: 0,
    income: 0,
  }));
  const bins = [
    { label: 'Menos de $1.000', min: 0, max: 100000, count: 0, total: 0 },
    {
      label: '$1.000 a $2.499,99',
      min: 100000,
      max: 250000,
      count: 0,
      total: 0,
    },
    {
      label: '$2.500 a $4.999,99',
      min: 250000,
      max: 500000,
      count: 0,
      total: 0,
    },
    {
      label: '$5.000 a $9.999,99',
      min: 500000,
      max: 1000000,
      count: 0,
      total: 0,
    },
    { label: '$10.000 o más', min: 1000000, max: Infinity, count: 0, total: 0 },
  ];
  const exact = new Map<number, number>();
  let count = 0;
  for (const d of days)
    if (isComplete(d.date)) {
      const wd = (new Date(d.date + 'T12:00:00Z').getUTCDay() + 6) % 7;
      week[wd].days++;
    }
  for (const r of selected) {
    if (r.type !== 'INCOME') continue;
    count++;
    const date = day(r.occurredAt);
    const wd = (new Date(date + 'T12:00:00Z').getUTCDay() + 6) % 7;
    week[wd].count++;
    week[wd].income += r.amountCents;
    const hour = +formatInTimeZone(r.occurredAt, TZ, 'HH');
    hours[hour].count++;
    hours[hour].income += r.amountCents;
    const bin = bins.find(
      (b) => r.amountCents >= b.min && r.amountCents < b.max,
    )!;
    bin.count++;
    bin.total += r.amountCents;
    exact.set(r.amountCents, (exact.get(r.amountCents) ?? 0) + 1);
  }
  // Weekday averages only use full observed days, including those with zero payments.
  for (const w of week) {
    const sum = days
      .filter(
        (d) =>
          isComplete(d.date) &&
          (new Date(d.date + 'T12:00:00Z').getUTCDay() + 6) % 7 === w.index,
      )
      .reduce((a, d) => a + d.income, 0);
    w.average = w.days ? Math.round(sum / w.days) : 0;
  }
  const maxFrequency = Math.max(0, ...exact.values());
  const modes =
    maxFrequency > 1
      ? [...exact.entries()]
          .filter(([, frequency]) => frequency === maxFrequency)
          .map(([amount]) => amount)
          .sort((a, b) => a - b)
      : [];
  const active = days.filter((d) => d.active);
  function record(key: 'income' | 'profit' | 'count') {
    const candidates =
      key === 'profit' ? active : active.filter((d) => d.count > 0);
    return candidates.reduce<(typeof days)[number] | null>(
      (best, d) => (!best || d[key] > best[key] ? d : best),
      null,
    );
  }
  const currentMonth = today.slice(0, 7);
  const monthRows = rows.filter(
    (r) =>
      day(r.occurredAt).startsWith(currentMonth) && day(r.occurredAt) <= today,
  );
  const monthIncome = monthRows
    .filter((r) => r.type === 'INCOME')
    .reduce((a, r) => a + r.amountCents, 0);
  const monthStart = currentMonth + '-01';
  const completeStart =
    coverage && coverage.completeFrom > monthStart
      ? coverage.completeFrom
      : monthStart;
  let fullDays = 0,
    fullIncome = 0;
  const incomeByDate = new Map<string, number>();
  for (const row of monthRows)
    if (row.type === 'INCOME') {
      const date = day(row.occurredAt);
      incomeByDate.set(date, (incomeByDate.get(date) ?? 0) + row.amountCents);
    }
  for (let d = completeStart; coverage && d < today; d = nextDay(d)) {
    fullDays++;
    fullIncome += incomeByDate.get(d) ?? 0;
  }
  const local = new Date(today + 'T12:00:00Z');
  const last = new Date(
    Date.UTC(local.getUTCFullYear(), local.getUTCMonth() + 1, 0, 12),
  ).getUTCDate();
  const remaining = last - local.getUTCDate() + 1;
  const projection =
    coverage && fullDays >= 7
      ? {
          estimate:
            monthIncome +
            Math.round(
              Math.max(
                0,
                fullIncome / fullDays - (incomeByDate.get(today) ?? 0),
              ) +
                (fullIncome / fullDays) * (remaining - 1),
            ),
          average: Math.round(fullIncome / fullDays),
          fullDays,
          remaining,
          monthIncome,
        }
      : null;
  return {
    days,
    week,
    hours,
    bins,
    count,
    modes,
    maxFrequency,
    records: {
      income: record('income'),
      count: record('count'),
      profit: record('profit'),
    },
    projection,
    monthIncome,
    monthStart,
    fullDays,
    coverage,
  };
}
