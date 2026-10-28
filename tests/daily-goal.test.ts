import { describe, it, expect } from 'vitest';
import { dailyGoalProgress } from '../lib/statistics';
const now = new Date('2026-10-28T15:00:00Z');
describe('barra de objetivo diario', () => {
  it('calcula la referencia con la ganancia de hasta ayer y los días restantes', () => {
    const p = dailyGoalProgress(
      100000,
      60000,
      10000,
      6,
      { income: 10000, expense: 0 },
      now,
    );
    expect(p.profitBeforeToday).toBe(40000);
    expect(p.remainingDays).toBe(4);
    expect(p.dailyTargetCents).toBe(15000);
    expect(p.remainingCents).toBe(5000);
    expect(p.percent).toBeCloseTo((10000 / 15000) * 100);
    expect(p.additionalPayments).toBe(1);
  });
  it('no baja la referencia al llegar un cobro de hoy', () => {
    const before = dailyGoalProgress(
      100000,
      60000,
      10000,
      6,
      { income: 10000, expense: 0 },
      now,
    );
    const after = dailyGoalProgress(
      100000,
      70000,
      10000,
      7,
      { income: 20000, expense: 0 },
      now,
    );
    expect(after.dailyTargetCents).toBe(before.dailyTargetCents);
    expect(after.achieved).toBe(true);
    expect(after.remainingCents).toBe(0);
    expect(after.percent).toBeGreaterThan(100);
  });
  it('los gastos de hoy modifican el avance pero no la referencia', () => {
    const a = dailyGoalProgress(
      100000,
      60000,
      10000,
      6,
      { income: 10000, expense: 0 },
      now,
    );
    const b = dailyGoalProgress(
      100000,
      60000,
      15000,
      6,
      { income: 10000, expense: 5000 },
      now,
    );
    expect(b.dailyTargetCents).toBe(a.dailyTargetCents);
    expect(b.profitToday).toBe(5000);
    expect(b.remainingCents).toBe(10000);
  });
  it('contempla pérdidas sin porcentajes negativos ni valores infinitos', () => {
    const p = dailyGoalProgress(
      10000,
      0,
      1000,
      0,
      { income: 0, expense: 1000 },
      now,
    );
    expect(p.percent).toBe(0);
    expect(p.additionalPayments).toBe(null);
    expect(p.dailyTargetCents).toBe(2500);
    expect(p.remainingCents).toBe(3500);
  });
  it('usa el promedio exacto al estimar cantidad y redondea cobros hacia arriba', () => {
    const p = dailyGoalProgress(
      202,
      201,
      0,
      2,
      { income: 201, expense: 0 },
      new Date('2026-10-31T15:00:00Z'),
    );
    expect(p.additionalPayments).toBe(1);
    const q = dailyGoalProgress(
      403,
      201,
      0,
      2,
      { income: 201, expense: 0 },
      new Date('2026-10-31T15:00:00Z'),
    );
    expect(q.remainingCents).toBe(202);
    expect(q.additionalPayments).toBe(3);
  });
  it('contempla una meta mensual ya alcanzada y no divide por cero', () => {
    const p = dailyGoalProgress(
      10000,
      20000,
      0,
      2,
      { income: 0, expense: 0 },
      now,
    );
    expect(p.dailyTargetCents).toBe(0);
    expect(p.percent).toBe(100);
    expect(p.additionalPayments).toBe(0);
    expect(p.achieved).toBe(true);
  });
  it('exige recuperar una pérdida de hoy si la referencia es cero', () => {
    const p = dailyGoalProgress(
      10000,
      20000,
      500,
      2,
      { income: 0, expense: 500 },
      now,
    );
    expect(p.dailyTargetCents).toBe(0);
    expect(p.percent).toBe(0);
    expect(p.remainingCents).toBe(500);
    expect(p.achieved).toBe(false);
  });
  it('maneja el último día, el bisiesto y el cambio de fecha argentino', () => {
    expect(
      dailyGoalProgress(
        10000,
        0,
        0,
        0,
        { income: 0, expense: 0 },
        new Date('2026-10-31T15:00:00Z'),
      ).dailyTargetCents,
    ).toBe(10000);
    expect(
      dailyGoalProgress(
        10000,
        0,
        0,
        0,
        { income: 0, expense: 0 },
        new Date('2024-02-29T15:00:00Z'),
      ).remainingDays,
    ).toBe(1);
    expect(
      dailyGoalProgress(
        10000,
        0,
        0,
        0,
        { income: 0, expense: 0 },
        new Date('2026-03-01T01:00:00Z'),
      ).remainingDays,
    ).toBe(1);
  });
});
