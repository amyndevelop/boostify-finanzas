import { describe, it, expect } from 'vitest';
import {
  coverageStart,
  insights,
  nextDay,
  type InsightRow,
} from '../lib/insights';
const now = new Date('2026-10-28T15:00:00Z');
const row = (
  date: string,
  amountCents = 10000,
  type = 'INCOME',
): InsightRow => ({
  type,
  amountCents,
  occurredAt: new Date(date.length === 10 ? date + 'T15:00:00Z' : date),
});
const coverage = coverageStart('2026-10-01T03:00:00Z', null);
describe('cobertura del registro', () => {
  it('excluye del promedio el primer día cuando es parcial', () => {
    expect(coverageStart('2026-10-28T13:00:00Z', null)).toMatchObject({
      date: '2026-10-28',
      completeFrom: '2026-10-29',
      confirmed: true,
    });
  });
  it('admite inicio exacto a medianoche e infiere de forma explícita', () => {
    expect(coverage?.completeFrom).toBe('2026-10-01');
    expect(coverageStart(undefined, new Date('2026-10-28T02:00:00Z'))).toEqual({
      date: '2026-10-27',
      completeFrom: '2026-10-28',
      confirmed: false,
    });
    expect(coverageStart(undefined, null)).toBe(null);
  });
});
describe('calendario y promedios móviles', () => {
  it('no convierte falta de cobertura en ceros observados y marca hoy parcial', () => {
    const r = insights(
      [],
      '2026-10-25',
      '2026-10-30',
      coverageStart('2026-10-27T13:00:00Z', null),
      now,
    );
    expect(r.days).toHaveLength(4);
    expect(r.days[0].observed).toBe(false);
    expect(r.days[2].partial).toBe(true);
    expect(r.days[3].partial).toBe(true);
    expect(r.days.every((d) => d.moving7 === null)).toBe(true);
  });
  it('cuenta días observados sin cobros dentro del promedio', () => {
    const r = insights(
      [row('2026-10-01', 70000)],
      '2026-10-07',
      '2026-10-07',
      coverage,
      now,
    );
    expect(r.days[0].moving7).toBe(10000);
    expect(r.days[0].moving30).toBe(null);
  });
  it('exige treinta días completos y usa datos anteriores al rango como calentamiento', () => {
    const cov = coverageStart('2026-09-01T03:00:00Z', null);
    const rows = Array.from({ length: 30 }, (_, i) =>
      row(nextDay('2026-09-01', i), 100),
    );
    const r = insights(rows, '2026-09-30', '2026-09-30', cov, now);
    expect(r.days[0].moving30).toBe(100);
    expect(r.days[0].moving7).toBe(100);
  });
  it('no dibuja un promedio para el día en curso', () => {
    expect(
      insights([row('2026-10-28')], '2026-10-28', '2026-10-28', coverage, now)
        .days[0].moving7,
    ).toBe(null);
  });
});
describe('actividad y distribución', () => {
  it('convierte horas UTC a Argentina y no cuenta gastos como cobros', () => {
    const r = insights(
      [
        row('2026-10-28T02:30:00Z'),
        row('2026-10-28T03:30:00Z'),
        row('2026-10-28T03:30:00Z', 999, 'EXPENSE'),
      ],
      '2026-10-27',
      '2026-10-28',
      coverage,
      now,
    );
    expect(r.hours[23].count).toBe(1);
    expect(r.hours[0].count).toBe(1);
    expect(r.count).toBe(2);
  });
  it('usa días completos incluyendo días sin cobros para comparar días de semana', () => {
    const r = insights(
      [row('2026-10-05', 20000)],
      '2026-10-01',
      '2026-10-14',
      coverage,
      now,
    );
    expect(r.week[0].days).toBe(2);
    expect(r.week[0].average).toBe(10000);
  });
  it('separa límites de importes sin solapamiento y detecta empates de moda', () => {
    const r = insights(
      [
        99999, 100000, 249999, 250000, 499999, 500000, 999999, 1000000, 100000,
        250000,
      ].map((v) => row('2026-10-20', v)),
      '2026-10-20',
      '2026-10-20',
      coverage,
      now,
    );
    expect(r.bins.map((b) => b.count)).toEqual([1, 3, 3, 2, 1]);
    expect(r.modes).toEqual([100000, 250000]);
    expect(r.maxFrequency).toBe(2);
    expect(r.bins.reduce((a, b) => a + b.count, 0)).toBe(r.count);
  });
  it('no declara moda cuando ningún importe se repite', () =>
    expect(
      insights(
        [row('2026-10-20', 100), row('2026-10-20', 200)],
        '2026-10-20',
        '2026-10-20',
        coverage,
        now,
      ).modes,
    ).toEqual([]));
});
describe('proyección y récords', () => {
  it('no proyecta con menos de siete días completos ni sin cobertura', () => {
    expect(
      insights(
        [],
        '2026-10-01',
        '2026-10-28',
        coverageStart('2026-10-25T15:00:00Z', null),
        now,
      ).projection,
    ).toBe(null);
    const r = insights([], '2026-10-01', '2026-10-28', null, now);
    expect(r.projection).toBe(null);
    expect(r.fullDays).toBe(0);
  });
  it('usa siete días completos y no duplica lo cobrado hoy', () => {
    const cov = coverageStart('2026-10-21T03:00:00Z', null);
    const rows = Array.from({ length: 7 }, (_, i) =>
      row(nextDay('2026-10-21', i), 10000),
    );
    rows.push(row('2026-10-28', 5000));
    const p = insights(rows, '2026-10-01', '2026-10-28', cov, now).projection!;
    expect(p.fullDays).toBe(7);
    expect(p.monthIncome).toBe(75000);
    expect(p.estimate).toBe(110000);
  });
  it('conserva el cobro real de hoy cuando ya supera el promedio', () => {
    const cov = coverageStart('2026-10-21T03:00:00Z', null);
    const rows = Array.from({ length: 7 }, (_, i) =>
      row(nextDay('2026-10-21', i), 10000),
    );
    rows.push(row('2026-10-28', 20000));
    expect(
      insights(rows, '2026-10-01', '2026-10-28', cov, now).projection?.estimate,
    ).toBe(120000);
  });
  it('mantiene la proyección del mes actual aunque se consulte otro mes', () => {
    const rows = Array.from({ length: 27 }, (_, i) =>
      row(nextDay('2026-10-01', i), 10000),
    );
    const r = insights(rows, '2026-09-01', '2026-09-30', coverage, now);
    expect(r.projection?.monthIncome).toBe(270000);
    expect(r.count).toBe(0);
  });
  it('los récords usan días con movimientos y contemplan pérdidas', () => {
    const r = insights(
      [row('2026-10-02', 200, 'EXPENSE'), row('2026-10-03', 100, 'EXPENSE')],
      '2026-10-01',
      '2026-10-05',
      coverage,
      now,
    );
    expect(r.records.income).toBe(null);
    expect(r.records.count).toBe(null);
    expect(r.records.profit?.date).toBe('2026-10-03');
    expect(r.records.profit?.profit).toBe(-100);
  });
  it('resuelve empates por primer día y no inventa récords vacíos', () => {
    const r = insights(
      [row('2026-10-02'), row('2026-10-03')],
      '2026-10-01',
      '2026-10-05',
      coverage,
      now,
    );
    expect(r.records.income?.date).toBe('2026-10-02');
    expect(
      insights([], '2026-10-01', '2026-10-05', coverage, now).records.profit,
    ).toBe(null);
  });
});
