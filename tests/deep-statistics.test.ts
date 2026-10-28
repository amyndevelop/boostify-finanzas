import { describe, it, expect } from 'vitest';
import {
  distribution,
  regularity,
  growthAnalysis,
  dailySeries,
  deepStatistics,
  sameMonthHeight,
  comparisonBounds,
} from '../lib/deep-statistics';
import { coverageStart, type InsightRow } from '../lib/insights';
const now = new Date('2026-10-28T15:00:00Z');
const coverage = coverageStart('2026-01-01T03:00:00Z', null);
const row = (
  date: string,
  amountCents: number,
  type = 'INCOME',
): InsightRow => ({
  type,
  amountCents,
  occurredAt: new Date(date + 'T15:00:00Z'),
});
describe('mediana y concentración por cobro', () => {
  it('calcula mediana impar y limita la influencia de valores extremos', () => {
    const r = distribution([100, 200, 100000].map((v) => row('2026-10-01', v)));
    expect(r.medianCents).toBe(200);
    expect(r.averageCents).toBe(33433);
    expect(r.minCents).toBe(100);
    expect(r.maxCents).toBe(100000);
  });
  it('redondea mediana par al centavo sin mutar entradas ni contar gastos', () => {
    const rows = [
      row('2026-10-01', 101),
      row('2026-10-01', 100),
      row('2026-10-01', 9999, 'EXPENSE'),
    ];
    expect(distribution(rows).medianCents).toBe(101);
    expect(rows[0].amountCents).toBe(101);
    expect(distribution(rows).count).toBe(2);
  });
  it('usa hasta cinco mayores cobros y expresa su peso sobre ingresos', () => {
    const r = distribution(
      [100, 200, 300, 400, 500, 600].map((v) => row('2026-10-01', v)),
    );
    expect(r.topCents).toBe(2000);
    expect(r.topCount).toBe(5);
    expect(r.topShare).toBeCloseTo((2000 / 2100) * 100);
    expect(r.largestShare).toBeCloseTo((600 / 2100) * 100);
    expect(distribution([row('2026-10-01', 100)]).topShare).toBe(100);
  });
  it('no inventa mediana ni porcentajes infinitos sin cobros', () => {
    expect(distribution([])).toMatchObject({
      medianCents: null,
      averageCents: null,
      topCents: 0,
      topShare: 0,
      largestShare: 0,
      topCount: 0,
    });
  });
});
describe('comparación y explicación del crecimiento', () => {
  const a = { a: '2026-10-10', b: '2026-10-11' },
    b = { a: '2026-10-01', b: '2026-10-02' };
  it('atribuye volumen e importe promedio con efectos que suman el delta', () => {
    const rows = [row(a.a, 150), row(a.b, 150), row(b.a, 100)];
    const g = growthAnalysis(
      dailySeries(rows, a, coverage, now),
      dailySeries(rows, b, coverage, now),
    )!;
    expect(g.current.income).toBe(300);
    expect(g.previous.income).toBe(100);
    expect(g.volumeCents).toBe(125);
    expect(g.ticketCents).toBe(75);
    expect(g.volumeCents! + g.ticketCents!).toBe(g.delta);
  });
  it('no atribuye causas si uno de los períodos no tiene cobros', () => {
    const g = growthAnalysis(
      dailySeries([row(a.a, 100)], a, coverage, now),
      dailySeries([], b, coverage, now),
    )!;
    expect(g.delta).toBe(100);
    expect(g.volumeCents).toBe(null);
  });
  it('iguala la cantidad de días sin incluir la cola de un rango más largo', () => {
    const longer = { a: a.a, b: '2026-10-12' };
    const rows = [row(a.a, 100), row('2026-10-12', 9999), row(b.a, 100)];
    const g = growthAnalysis(
      dailySeries(rows, longer, coverage, now),
      dailySeries(rows, b, coverage, now),
    )!;
    expect(g.days).toBe(2);
    expect(g.delta).toBe(0);
  });
  it('rechaza crecimiento comparable con cobertura incompleta, incluso si hay movimientos', () => {
    const late = coverageStart('2026-10-02T15:00:00Z', null);
    expect(
      growthAnalysis(
        dailySeries([], a, late, now),
        dailySeries([row(b.a, 100)], b, late, now),
      ),
    ).toBe(null);
  });
  it('excluye hoy de la explicación y mantiene alineación ordinal', () => {
    const aa = { a: '2026-10-26', b: '2026-10-28' },
      bb = { a: '2026-10-20', b: '2026-10-22' };
    const rows = [
      row('2026-10-26', 100),
      row('2026-10-28', 9999),
      row('2026-10-20', 100),
    ];
    const g = growthAnalysis(
      dailySeries(rows, aa, coverage, now),
      dailySeries(rows, bb, coverage, now),
    )!;
    expect(g.days).toBe(2);
    expect(g.delta).toBe(0);
    expect(g.a.b).toBe('2026-10-27');
    expect(g.b.b).toBe('2026-10-21');
  });
  it('admite pérdidas de ingreso y conserva exactitud tras redondear los efectos', () => {
    const rows = [row(a.a, 101), row(b.a, 101), row(b.b, 102)];
    const g = growthAnalysis(
      dailySeries(rows, a, coverage, now),
      dailySeries(rows, b, coverage, now),
    )!;
    expect(g.delta).toBe(-102);
    expect(g.volumeCents! + g.ticketCents!).toBe(-102);
  });
  it('muestra huecos de cobertura y días sin contraparte en las curvas', () => {
    const late = coverageStart('2026-10-11T15:00:00Z', null);
    const d = deepStatistics([row(a.b, 100)], a, { a: b.a, b: b.a }, late, now);
    expect(d.overlay[0].totalA).toBe(null);
    expect(d.overlay[1].dateB).toBe(null);
    expect(d.overlay[1].totalB).toBe(null);
    expect(d.overlay[1].dailyA).toBe(100);
    expect(d.partialA).toBe(true);
  });
  it('valida rangos personalizados sin modificar el fallback', () => {
    expect(comparisonBounds(undefined, undefined, b)).toEqual(b);
    for (const [start, end] of [
      ['2026-02-30', '2026-03-01'],
      ['2026-10-02', '2026-10-01'],
      ['2020-01-01', '2026-01-01'],
    ])
      expect(() => comparisonBounds(start, end, b)).toThrow();
  });
});
describe('comparación a igual altura mensual', () => {
  it('usa hasta ayer y limita ambos meses a igual cantidad de días', () => {
    expect(sameMonthHeight(new Date('2026-03-31T15:00:00Z'))).toEqual({
      current: { a: '2026-03-01', b: '2026-03-28' },
      previous: { a: '2026-02-01', b: '2026-02-28' },
      days: 28,
    });
  });
  it('maneja bisiestos y cambio de año', () => {
    expect(sameMonthHeight(new Date('2024-03-31T15:00:00Z'))?.days).toBe(29);
    expect(sameMonthHeight(new Date('2026-01-05T15:00:00Z'))?.previous).toEqual(
      { a: '2025-12-01', b: '2025-12-04' },
    );
  });
  it('no compara un mes recién iniciado ni confunde cambio de fecha UTC', () => {
    expect(sameMonthHeight(new Date('2026-03-01T15:00:00Z'))).toBe(null);
    expect(sameMonthHeight(new Date('2026-03-01T01:00:00Z'))?.current.b).toBe(
      '2026-02-27',
    );
  });
});
describe('rachas, frecuencia y dispersión', () => {
  it('incluye días sin cobros y excluye hoy de rachas y variación', () => {
    const series = dailySeries(
      [
        row('2026-10-20', 100),
        row('2026-10-21', 100),
        row('2026-10-23', 200),
        row('2026-10-28', 9999),
      ],
      { a: '2026-10-20', b: '2026-10-28' },
      coverage,
      now,
    );
    const r = regularity(series);
    expect(r.completeDays).toBe(8);
    expect(r.activeDays).toBe(3);
    expect(r.inactiveDays).toBe(5);
    expect(r.longest).toBe(2);
    expect(r.longestZero).toBe(4);
    expect(r.latestZero).toBe(4);
    expect(r.latestRun).toBe(0);
    expect(r.meanCents).toBe(50);
    expect(r.coefficient).toBeGreaterThan(0);
  });
  it('no trata días sin cobertura como días inactivos', () => {
    const late = coverageStart('2026-10-21T15:00:00Z', null);
    const r = regularity(
      dailySeries([], { a: '2026-10-20', b: '2026-10-23' }, late, now),
    );
    expect(r.completeDays).toBe(2);
    expect(r.inactiveDays).toBe(2);
    expect(r.longestZero).toBe(2);
  });
  it('maneja datos vacíos, un día, ingresos constantes y promedio cero', () => {
    expect(regularity([]).coefficient).toBe(null);
    const a = { a: '2026-10-20', b: '2026-10-21' };
    expect(regularity(dailySeries([], a, coverage, now)).coefficient).toBe(
      null,
    );
    const r = regularity(
      dailySeries([row(a.a, 100), row(a.b, 100)], a, coverage, now),
    );
    expect(r.coefficient).toBe(0);
    expect(r.latestRun).toBe(2);
    expect(r.activePercent).toBe(100);
  });
});
