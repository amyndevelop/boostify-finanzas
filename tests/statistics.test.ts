import { describe, it, expect } from 'vitest';
import {
  previousRange,
  paymentStats,
  variation,
  goalProgress,
  goalSchema,
} from '../lib/statistics';
import { range } from '../lib/finance';
describe('comparaciones entre períodos', () => {
  it('compara el mes transcurrido con fechas equivalentes y limita febrero', () => {
    const p = previousRange(
      'month',
      range('month', undefined, undefined, new Date('2026-03-31T15:00:00Z')),
    );
    expect(p.a).toBe('2026-02-01');
    expect(p.b).toBe('2026-02-28');
    expect(p.start.toISOString()).toBe('2026-02-01T03:00:00.000Z');
    expect(p.end.toISOString()).toBe('2026-03-01T03:00:00.000Z');
  });
  it('compara meses anteriores completos', () => {
    const p = previousRange(
      'previous',
      range('previous', undefined, undefined, new Date('2026-04-15T15:00:00Z')),
    );
    expect(p.a).toBe('2026-02-01');
    expect(p.b).toBe('2026-02-28');
  });
  it('compara semanas adyacentes sin solapamiento', () => {
    const selected = range(
      'week',
      undefined,
      undefined,
      new Date('2026-01-04T15:00:00Z'),
    );
    const p = previousRange('week', selected);
    expect(p.a).toBe('2025-12-22');
    expect(p.b).toBe('2025-12-28');
    expect(p.end).toEqual(selected.start);
  });
  it('respeta hoy local aunque UTC sea otro día', () => {
    const p = previousRange(
      'today',
      range('today', undefined, undefined, new Date('2026-03-01T01:00:00Z')),
    );
    expect(p.a).toBe('2026-02-27');
    expect(p.b).toBe('2026-02-27');
  });
  it('mantiene duración en rangos personalizados', () => {
    const selected = range('custom', '2026-01-01', '2026-01-03');
    const p = previousRange('custom', selected);
    expect(p.a).toBe('2025-12-29');
    expect(p.b).toBe('2025-12-31');
  });
});
describe('cobros y variaciones', () => {
  it('cuenta solo ingresos y redondea el promedio a centavos', () =>
    expect(
      paymentStats([
        { type: 'INCOME', amountCents: 100 },
        { type: 'INCOME', amountCents: 101 },
        { type: 'EXPENSE', amountCents: 999 },
      ]),
    ).toEqual({ count: 2, averageCents: 101 }));
  it('maneja períodos sin cobros', () =>
    expect(paymentStats([])).toEqual({ count: 0, averageCents: 0 }));
  it('no inventa un porcentaje con base cero o negativa', () => {
    expect(variation(100, 0)).toEqual({ delta: 100, percent: null });
    expect(variation(100, -100)).toEqual({ delta: 200, percent: null });
  });
  it('expresa aumentos y bajas con base positiva', () => {
    expect(variation(150, 100)).toEqual({ delta: 50, percent: 50 });
    expect(variation(0, 100)).toEqual({ delta: -100, percent: -100 });
  });
});
describe('metas mensuales', () => {
  it('contempla pérdidas al calcular lo que falta recuperar', () => {
    const p = goalProgress(10000, -5000, new Date('2026-10-28T15:00:00Z'));
    expect(p.remainingCents).toBe(15000);
    expect(p.remainingDays).toBe(4);
    expect(p.dailyCents).toBe(3750);
    expect(p.percent).toBe(0);
  });
  it('no divide por cero el último día e incluye hoy', () => {
    const p = goalProgress(10000, 5000, new Date('2026-10-31T15:00:00Z'));
    expect(p.remainingDays).toBe(1);
    expect(p.dailyCents).toBe(5000);
  });
  it('reconoce metas superadas', () =>
    expect(
      goalProgress(10000, 15000, new Date('2026-10-28T15:00:00Z')),
    ).toMatchObject({ remainingCents: 0, dailyCents: 0, percent: 150 }));
  it('respeta febrero bisiesto y la fecha local', () => {
    expect(
      goalProgress(10000, 0, new Date('2024-02-29T15:00:00Z')).remainingDays,
    ).toBe(1);
    expect(
      goalProgress(10000, 0, new Date('2026-03-01T01:00:00Z')).remainingDays,
    ).toBe(1);
  });
  it('valida mes y monto antes de guardar', () => {
    expect(
      goalSchema.parse({ month: '2026-10', amount: '1000,25' }).amount,
    ).toBe(100025);
    for (const month of ['2026-00', '2026-13', 'x'])
      expect(goalSchema.safeParse({ month, amount: '100' }).success).toBe(
        false,
      );
    for (const amount of ['0', '-1', '1.001', '21474836.48'])
      expect(goalSchema.safeParse({ month: '2026-10', amount }).success).toBe(
        false,
      );
  });
});
