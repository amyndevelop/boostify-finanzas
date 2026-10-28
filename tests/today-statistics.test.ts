import { describe, it, expect } from 'vitest';
import { todayStats } from '../lib/statistics';
const now = new Date('2026-10-28T15:00:00Z');
const row = (type: string, amountCents: number, date: string) => ({
  type,
  amountCents,
  occurredAt: new Date(date),
});
describe('estadísticas del día actual argentino', () => {
  it('incluye el inicio y excluye el día siguiente, sin mezclar movimientos anteriores', () => {
    const result = todayStats(
      [
        row('INCOME', 99999, '2026-10-28T02:59:59.999Z'),
        row('INCOME', 10000, '2026-10-28T03:00:00Z'),
        row('INCOME', 5000, '2026-10-29T02:59:59.999Z'),
        row('EXPENSE', 3000, '2026-10-28T12:00:00Z'),
        row('INCOME', 99999, '2026-10-29T03:00:00Z'),
      ],
      now,
    );
    expect(result).toEqual({
      date: '2026-10-28',
      income: 15000,
      expense: 3000,
      profit: 12000,
      margin: 80,
      count: 2,
      averageCents: 7500,
    });
  });
  it('usa el día anterior cuando UTC ya cambió de fecha', () => {
    const result = todayStats(
      [
        row('INCOME', 1000, '2026-10-28T02:00:00Z'),
        row('INCOME', 2000, '2026-10-28T04:00:00Z'),
      ],
      new Date('2026-10-28T02:30:00Z'),
    );
    expect(result.date).toBe('2026-10-27');
    expect(result.income).toBe(1000);
    expect(result.count).toBe(1);
  });
  it('muestra ceros sin ingresos ni movimientos', () => {
    expect(todayStats([], now)).toMatchObject({
      income: 0,
      expense: 0,
      profit: 0,
      margin: 0,
      count: 0,
      averageCents: 0,
    });
  });
  it('contempla gastos sin cobros y una ganancia negativa', () => {
    expect(
      todayStats([row('EXPENSE', 500, '2026-10-28T12:00:00Z')], now),
    ).toMatchObject({
      income: 0,
      expense: 500,
      profit: -500,
      margin: 0,
      count: 0,
      averageCents: 0,
    });
  });
  it('no incorpora datos del mes anterior al resumen de hoy', () => {
    expect(
      todayStats([row('INCOME', 100000, '2026-09-28T15:00:00Z')], now).income,
    ).toBe(0);
  });
});
