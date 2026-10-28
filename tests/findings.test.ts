import { describe, it, expect } from 'vitest';
import {
  buildFindings,
  monthlyReportBounds,
  reportSummary,
} from '../lib/findings';
import { coverageStart, nextDay, type InsightRow } from '../lib/insights';
import { deepStatistics } from '../lib/deep-statistics';
const now = new Date('2026-10-28T15:00:00Z');
const coverage = coverageStart('2026-01-01T03:00:00Z', null);
const a = { a: '2026-10-20', b: '2026-10-21' },
  b = { a: '2026-10-10', b: '2026-10-11' };
const row = (
  date: string,
  amountCents: number,
  type = 'INCOME',
): InsightRow => ({
  type,
  amountCents,
  occurredAt: new Date(date + 'T15:00:00Z'),
});
const make = (rows: InsightRow[], cov = coverage) =>
  buildFindings(deepStatistics(rows, a, b, cov, now), rows, cov, now);
describe('hallazgos deterministas', () => {
  it('describe crecimiento verificado sin inventar causas comerciales', () => {
    const r = make([row(a.a, 100), row(a.b, 100), row(b.a, 100)]);
    const growth = r.find((f) => f.id === 'growth')!;
    expect(growth.title).toContain('100%');
    expect(growth.detail).toContain('1 → 2');
    expect(growth.href).toBe('#growth-analysis');
    expect(growth.detail).not.toMatch(/publicidad|clientes nuevos|causado/);
  });
  it('no calcula crecimiento con historia faltante y lo advierte', () => {
    const cov = coverageStart('2026-10-20T15:00:00Z', null);
    const r = make([row(a.a, 100)], cov);
    expect(r.some((f) => f.id === 'growth')).toBe(false);
    expect(r.find((f) => f.id === 'coverage')?.tone).toBe('attention');
  });
  it('no inventa porcentajes con ingresos anteriores cero', () => {
    const r = make([row(a.a, 100)]);
    const growth = r.find((f) => f.id === 'growth')!;
    expect(growth.title).not.toContain('%');
    expect(growth.detail).toContain('no atribuimos');
    expect(JSON.stringify(r)).not.toMatch(/Infinity|NaN/);
  });
  it('distingue una baja de un ingreso estable', () => {
    expect(
      make([row(a.a, 100), row(b.a, 200)]).find((f) => f.id === 'growth')
        ?.title,
    ).toContain('bajaron un 50%');
    expect(
      make([row(a.a, 100), row(b.a, 100)]).find((f) => f.id === 'growth')
        ?.title,
    ).toContain('se mantuvieron');
  });
  it('evita conclusiones triviales de concentración con cinco o menos cobros', () => {
    expect(
      make(Array.from({ length: 5 }, () => row(a.a, 100))).some(
        (f) => f.id === 'concentration',
      ),
    ).toBe(false);
    const r = make([1, 2, 3, 4, 5, 6].map((v) => row(a.a, v * 100)));
    expect(r.find((f) => f.id === 'concentration')?.title).toContain('95,2%');
    expect(r.find((f) => f.id === 'concentration')?.detail).toContain(
      'no por cliente',
    );
  });
  it('muestra mediana solo con tres cobros y excluye gastos', () => {
    expect(
      make([row(a.a, 100), row(a.a, 200)]).some((f) => f.id === 'median'),
    ).toBe(false);
    const r = make([
      row(a.a, 100),
      row(a.a, 200),
      row(a.a, 10000),
      row(a.a, 999999, 'EXPENSE'),
    ]);
    expect(r.find((f) => f.id === 'median')?.title).toContain('2,00');
  });
  it('compara dos semanas completas reales, incluyendo días sin cobros', () => {
    const rows = Array.from({ length: 14 }, (_, i) =>
      row(nextDay('2026-10-14', i), i < 7 ? 100 : 200),
    );
    rows.push(row('2026-10-28', 999999));
    const trend = make(rows).find((f) => f.id === 'trend')!;
    expect(trend.title).toContain('más ingreso');
    expect(trend.detail).toContain('100%');
    expect(trend.detail).toContain('21/10/2026 — 27/10/2026');
    expect(trend.detail).toContain('independiente del período A');
  });
  it('omite la tendencia si falta una sola fecha completa de cobertura', () => {
    const cov = coverageStart('2026-10-14T15:00:00Z', null);
    expect(make([], cov).some((f) => f.id === 'trend')).toBe(false);
  });
  it('ofrece un estado vacío y mantiene resultados deterministas', () => {
    const r = make([]);
    expect(r.some((f) => f.id === 'empty')).toBe(true);
    expect(make([])).toEqual(r);
  });
});
describe('informe mensual', () => {
  it('incluye el último día de un mes histórico y contempla bisiestos', () => {
    expect(monthlyReportBounds('2024-02', now)).toEqual({
      a: '2024-02-01',
      b: '2024-02-29',
    });
    expect(monthlyReportBounds('2026-10', now).b).toBe('2026-10-28');
  });
  it('no permite meses inválidos, muy antiguos ni futuros', () => {
    for (const m of ['2026-00', '2026-13', '1999-12', '2026-11', '<script>'])
      expect(() => monthlyReportBounds(m, now)).toThrow();
  });
  it('respeta el mes local cuando UTC ya cambió de mes', () => {
    const local = new Date('2026-11-01T01:00:00Z');
    expect(monthlyReportBounds('2026-10', local).b).toBe('2026-10-31');
    expect(() => monthlyReportBounds('2026-11', local)).toThrow();
  });
  it('no mezcla meses y marca el actual parcial, sin tocar datos', () => {
    const rows = [
      row('2026-09-30', 99999),
      row(a.a, 10000),
      row(a.b, 2500, 'EXPENSE'),
    ];
    const original = JSON.stringify(rows);
    const r = reportSummary(
      rows,
      monthlyReportBounds('2026-10', now),
      coverage,
      now,
    );
    expect(r.total.income).toBe(10000);
    expect(r.total.expense).toBe(2500);
    expect(r.total.profit).toBe(7500);
    expect(r.count).toBe(1);
    expect(r.partial).toBe(true);
    expect(JSON.stringify(rows)).toBe(original);
  });
  it('solo marca cobertura mensual completa con mes terminado y referencia configurada', () => {
    const end = new Date('2026-11-01T15:00:00Z');
    expect(
      reportSummary([], { a: '2026-10-01', b: '2026-10-31' }, coverage, end)
        .partial,
    ).toBe(false);
    expect(
      reportSummary(
        [],
        { a: '2026-10-01', b: '2026-10-31' },
        coverageStart(undefined, new Date('2026-01-01T00:00:00Z')),
        end,
      ).partial,
    ).toBe(true);
  });
});
