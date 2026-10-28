import { money, day, totals } from './finance';
import {
  dailySeries,
  type Bounds,
  type deepStatistics,
} from './deep-statistics';
import { coverageStart, nextDay, type InsightRow } from './insights';
export type Finding = {
  id: string;
  tone: 'neutral' | 'positive' | 'attention';
  title: string;
  detail: string;
  href: string;
};
const percent = (v: number) =>
  v.toLocaleString('es-AR', { maximumFractionDigits: 1 }) + '%';
const signed = (v: number) => (v >= 0 ? '+' : '−') + money(Math.abs(v));
const fmt = (date: string) => date.split('-').reverse().join('/');
export function buildFindings(
  data: ReturnType<typeof deepStatistics>,
  rows: InsightRow[],
  coverage: ReturnType<typeof coverageStart>,
  now = new Date(),
): Finding[] {
  const results: Finding[] = [];
  const g = data.growth,
    d = data.distribution;
  if (!coverage?.confirmed || data.partialA || data.partialB)
    results.push({
      id: 'coverage',
      tone: 'attention',
      title: 'Interpretá estos períodos con su cobertura',
      detail: g
        ? 'Hay días en curso o sin cobertura. El análisis del cambio se limita a los días completos que muestra su detalle.'
        : 'No hay una base completa comparable desde el inicio de ambos rangos. No calculamos crecimiento como si los días faltantes fueran ceros.',
      href: '#growth-analysis',
    });
  if (g) {
    const base = g.previous.income;
    const direction =
      g.delta > 0 ? 'subieron' : g.delta < 0 ? 'bajaron' : 'se mantuvieron';
    const countChange = g.current.count - g.previous.count;
    const avgA = g.current.count ? g.current.income / g.current.count : null,
      avgB = g.previous.count ? g.previous.income / g.previous.count : null;
    results.push({
      id: 'growth',
      tone: g.delta > 0 ? 'positive' : g.delta < 0 ? 'attention' : 'neutral',
      title: `Los ingresos ${direction}${base > 0 && g.delta !== 0 ? ' un ' + percent((Math.abs(g.delta) / base) * 100) : ''}`,
      detail: `Cambio: ${signed(g.delta)} en ${g.days} días completos comparables. Cobros: ${g.previous.count} → ${g.current.count} (${countChange >= 0 ? '+' : ''}${countChange}). ${avgA !== null && avgB !== null ? `Importe promedio: ${money(Math.round(avgB))} → ${money(Math.round(avgA))}.` : 'Un período no tiene cobros: no atribuimos efectos a cantidad o importe.'} A: ${fmt(g.a.a)} — ${fmt(g.a.b)}; B: ${fmt(g.b.a)} — ${fmt(g.b.b)}.`,
      href: '#growth-analysis',
    });
  }
  if (d.count >= 6)
    results.push({
      id: 'concentration',
      tone: 'neutral',
      title: `Los cinco mayores cobros reúnen el ${percent(d.topShare)}`,
      detail: `Suman ${money(d.topCents)} sobre ${money(d.total)}, con ${d.count} cobros en el período A. Mide concentración por operación, no por cliente.`,
      href: '#revenue-concentration',
    });
  if (d.count >= 3 && d.medianCents !== null && d.averageCents !== null)
    results.push({
      id: 'median',
      tone: 'neutral',
      title: `El cobro central es de ${money(d.medianCents)}`,
      detail: `Mediana de ${d.count} cobros del período A; el promedio es ${money(d.averageCents)}. Son dos formas de describir los importes, no precios de productos.`,
      href: '#payment-quality',
    });
  const end = nextDay(day(now), -1),
    start = nextDay(end, -13);
  const series = dailySeries(rows, { a: start, b: end }, coverage, now);
  if (series.length === 14 && series.every((d) => d.complete)) {
    const prior = series.slice(0, 7).reduce((s, d) => s + d.income, 0),
      recent = series.slice(7).reduce((s, d) => s + d.income, 0);
    results.push({
      id: 'trend',
      tone:
        recent > prior ? 'positive' : recent < prior ? 'attention' : 'neutral',
      title: `Últimos siete días completos: ${recent > prior ? 'más' : recent < prior ? 'menos' : 'el mismo'} ingreso que los siete anteriores`,
      detail: `${fmt(nextDay(start, 7))} — ${fmt(end)}: ${money(recent)}; ${fmt(start)} — ${fmt(nextDay(start, 6))}: ${money(prior)}. ${prior > 0 ? `Variación: ${percent(((recent - prior) / prior) * 100)}.` : 'Sin ingreso previo positivo para calcular un porcentaje.'} Comparación independiente del período A.`,
      href: '#income-trend',
    });
  }
  if (!d.count)
    results.push({
      id: 'empty',
      tone: 'neutral',
      title: 'Sin cobros registrados en el período A',
      detail:
        'No se calculan mediana ni concentración de ingresos sin movimientos de ingreso. Probá otro rango o esperá la próxima sincronización.',
      href: '#movements',
    });
  return results;
}
export function monthlyReportBounds(month: string, now = new Date()): Bounds {
  if (
    !/^\d{4}-(0[1-9]|1[0-2])$/.test(month) ||
    month < '2000-01' ||
    month > day(now).slice(0, 7)
  )
    throw new Error('Elegí un mes válido entre enero de 2000 y el mes actual.');
  const [year, m] = month.split('-').map(Number);
  const last = new Date(Date.UTC(year, m, 0, 12)).toISOString().slice(0, 10);
  return { a: month + '-01', b: last < day(now) ? last : day(now) };
}
export function reportSummary(
  rows: InsightRow[],
  bounds: Bounds,
  coverage: ReturnType<typeof coverageStart>,
  now = new Date(),
) {
  const selected = rows.filter(
    (r) => day(r.occurredAt) >= bounds.a && day(r.occurredAt) <= bounds.b,
  );
  const total = totals(selected);
  const days = dailySeries(selected, bounds, coverage, now);
  return {
    total,
    days,
    partial: !coverage?.confirmed || days.some((d) => !d.complete),
    count: selected.filter((r) => r.type === 'INCOME').length,
  };
}
