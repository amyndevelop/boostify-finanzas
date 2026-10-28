import { day } from './finance';
import { nextDay, type InsightRow, coverageStart } from './insights';
import { dateSchema } from './finance';
import { subMonths } from 'date-fns';
export type Bounds = { a: string; b: string };
export function comparisonBounds(
  start: string | undefined,
  end: string | undefined,
  fallback: Bounds,
): Bounds {
  if (!start && !end) return fallback;
  const a = dateSchema.parse(start),
    b = dateSchema.parse(end);
  if (a > b || (+new Date(b) - +new Date(a)) / 86400000 > 730)
    throw new Error('La comparación admite fechas válidas y hasta dos años.');
  return { a, b };
}
export function sameMonthHeight(now = new Date()) {
  const today = day(now);
  const yesterday = nextDay(today, -1);
  const currentStart = today.slice(0, 7) + '-01';
  if (yesterday < currentStart) return null;
  const date = new Date(yesterday + 'T12:00:00Z');
  const priorEnd = subMonths(date, 1).toISOString().slice(0, 10);
  const equalDays = Number(priorEnd.slice(8));
  return {
    current: { a: currentStart, b: nextDay(currentStart, equalDays - 1) },
    previous: { a: priorEnd.slice(0, 7) + '-01', b: priorEnd },
    days: equalDays,
  };
}
export function dailySeries(
  rows: InsightRow[],
  bounds: Bounds,
  coverage: ReturnType<typeof coverageStart>,
  now = new Date(),
) {
  const today = day(now),
    stop = bounds.b < today ? bounds.b : today;
  const sums = new Map<
    string,
    { income: number; expense: number; count: number }
  >();
  for (const r of rows) {
    const date = day(r.occurredAt);
    if (date < bounds.a || date > stop) continue;
    const s = sums.get(date) ?? { income: 0, expense: 0, count: 0 };
    if (r.type === 'INCOME') {
      s.income += r.amountCents;
      s.count++;
    } else s.expense += r.amountCents;
    sums.set(date, s);
  }
  const result = [];
  for (let d = bounds.a; d <= stop; d = nextDay(d)) {
    const s = sums.get(d) ?? { income: 0, expense: 0, count: 0 };
    result.push({
      date: d,
      ...s,
      complete: Boolean(coverage && d >= coverage.completeFrom && d < today),
      observed: Boolean(coverage && d >= coverage.date),
    });
  }
  return result;
}
export function distribution(rows: InsightRow[]) {
  const values = rows
    .filter((r) => r.type === 'INCOME')
    .map((r) => r.amountCents)
    .sort((a, b) => a - b);
  const n = values.length;
  const total = values.reduce((a, b) => a + b, 0);
  const top = values.slice(-5).reduce((a, b) => a + b, 0);
  return {
    count: n,
    total,
    medianCents: n
      ? n % 2
        ? values[Math.floor(n / 2)]
        : Math.round((values[n / 2 - 1] + values[n / 2]) / 2)
      : null,
    minCents: n ? values[0] : null,
    maxCents: n ? values[n - 1] : null,
    topCount: Math.min(5, n),
    topCents: top,
    topShare: total ? (top / total) * 100 : 0,
    largestShare: total ? (values[n - 1] / total) * 100 : 0,
    averageCents: n ? Math.round(total / n) : null,
  };
}
export function growthAnalysis(
  a: ReturnType<typeof dailySeries>,
  b: ReturnType<typeof dailySeries>,
) {
  // Compare equally sized prefixes ending before today; never turn missing coverage into zero.
  const trim = (series: typeof a) => {
    const copy = [...series];
    while (copy.length && !copy.at(-1)!.complete) copy.pop();
    return copy;
  };
  const aa = trim(a),
    bb = trim(b);
  const n = Math.min(aa.length, bb.length);
  if (
    !n ||
    !aa.slice(0, n).every((d) => d.complete) ||
    !bb.slice(0, n).every((d) => d.complete)
  )
    return null;
  const left = aa.slice(0, n),
    right = bb.slice(0, n);
  const sum = (v: typeof a) => ({
    income: v.reduce((s, d) => s + d.income, 0),
    count: v.reduce((s, d) => s + d.count, 0),
  });
  const current = sum(left),
    previous = sum(right);
  if (!current.count || !previous.count)
    return {
      days: n,
      current,
      previous,
      volumeCents: null,
      ticketCents: null,
      delta: current.income - previous.income,
      a: { a: left[0].date, b: left.at(-1)!.date },
      b: { a: right[0].date, b: right.at(-1)!.date },
    };
  // Symmetric decomposition splits the interaction equally; effects sum exactly to revenue change.
  const meanA = current.income / current.count,
    meanB = previous.income / previous.count;
  const volumeCents = Math.round(
    ((current.count - previous.count) * (meanA + meanB)) / 2,
  );
  return {
    days: n,
    current,
    previous,
    volumeCents,
    ticketCents: current.income - previous.income - volumeCents,
    delta: current.income - previous.income,
    a: { a: left[0].date, b: left.at(-1)!.date },
    b: { a: right[0].date, b: right.at(-1)!.date },
  };
}
export function regularity(series: ReturnType<typeof dailySeries>) {
  let longest = 0,
    longestZero = 0,
    run = 0,
    zero = 0,
    completeDays = 0,
    activeDays = 0,
    sum = 0;
  const values: number[] = [];
  for (const d of series) {
    if (!d.complete) {
      run = 0;
      zero = 0;
      continue;
    }
    completeDays++;
    values.push(d.income);
    sum += d.income;
    if (d.count) {
      activeDays++;
      run++;
      zero = 0;
    } else {
      zero++;
      run = 0;
    }
    longest = Math.max(longest, run);
    longestZero = Math.max(longestZero, zero);
  }
  const mean = completeDays ? sum / completeDays : 0;
  const variance = completeDays
    ? values.reduce((s, v) => s + (v - mean) ** 2, 0) / completeDays
    : 0;
  const tail = [...series];
  while (tail.length && !tail.at(-1)!.complete) tail.pop();
  let latestRun = 0,
    latestZero = 0;
  for (let i = tail.length - 1; i >= 0 && tail[i].complete; i--) {
    if (tail[i].count) {
      if (latestZero) break;
      latestRun++;
    } else {
      if (latestRun) break;
      latestZero++;
    }
  }
  return {
    completeDays,
    activeDays,
    inactiveDays: completeDays - activeDays,
    activePercent: completeDays ? (activeDays / completeDays) * 100 : null,
    longest,
    longestZero,
    latestRun,
    latestZero,
    meanCents: completeDays ? Math.round(mean) : null,
    deviationCents: completeDays >= 2 ? Math.round(Math.sqrt(variance)) : null,
    coefficient:
      completeDays >= 2 && mean > 0 ? (Math.sqrt(variance) / mean) * 100 : null,
  };
}
export function deepStatistics(
  rows: InsightRow[],
  a: Bounds,
  b: Bounds,
  coverage: ReturnType<typeof coverageStart>,
  now = new Date(),
) {
  const today = day(now);
  const selected = rows.filter((r) => {
    const date = day(r.occurredAt);
    return date >= a.a && date <= a.b && date <= today;
  });
  const left = dailySeries(rows, a, coverage, now),
    right = dailySeries(rows, b, coverage, now);
  let cumA = 0,
    cumB = 0,
    coveredA = true,
    coveredB = true;
  const overlay = Array.from(
    { length: Math.max(left.length, right.length) },
    (_, i) => {
      const aa = left[i],
        bb = right[i];
      if (aa) {
        cumA += aa.income;
        coveredA = coveredA && aa.observed;
      }
      if (bb) {
        cumB += bb.income;
        coveredB = coveredB && bb.observed;
      }
      return {
        index: i + 1,
        dateA: aa?.date ?? null,
        dateB: bb?.date ?? null,
        dailyA: aa && (aa.observed || aa.income > 0) ? aa.income : null,
        dailyB: bb && (bb.observed || bb.income > 0) ? bb.income : null,
        totalA: aa && coveredA ? cumA : null,
        totalB: bb && coveredB ? cumB : null,
      };
    },
  );
  const height = sameMonthHeight(now);
  return {
    a,
    b,
    distribution: distribution(selected),
    growth: growthAnalysis(left, right),
    regularity: regularity(left),
    overlay,
    partialA: left.some((d) => !d.complete),
    partialB: right.some((d) => !d.complete),
    sameHeight: height
      ? {
          ...height,
          growth: growthAnalysis(
            dailySeries(rows, height.current, coverage, now),
            dailySeries(rows, height.previous, coverage, now),
          ),
        }
      : null,
  };
}
