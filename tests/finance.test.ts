import { describe, it, expect } from 'vitest';
import { totals, range, transactionSchema, day, csvCell } from '../lib/finance';
import { filters } from '../lib/query';
describe('cálculos financieros', () => {
  it('calcula ingresos, gastos, ganancia y margen en centavos', () =>
    expect(
      totals([
        { type: 'INCOME', amountCents: 10000 },
        { type: 'INCOME', amountCents: 5000 },
        { type: 'EXPENSE', amountCents: 3000 },
      ]),
    ).toEqual({ income: 15000, expense: 3000, profit: 12000, margin: 80 }));
  it('contempla ingresos cero y pérdidas', () => {
    expect(totals([]).margin).toBe(0);
    expect(totals([{ type: 'EXPENSE', amountCents: 100 }])).toEqual({
      income: 0,
      expense: 100,
      profit: -100,
      margin: 0,
    });
  });
});
describe('rangos de Argentina con fin exclusivo', () => {
  const now = new Date('2026-03-01T01:30:00Z');
  it('usa el día local anterior a UTC', () => {
    expect(day(now)).toBe('2026-02-28');
    const r = range('today', undefined, undefined, now);
    expect(r.start.toISOString()).toBe('2026-02-28T03:00:00.000Z');
    expect(r.end.toISOString()).toBe('2026-03-01T03:00:00.000Z');
  });
  it('incluye siete días', () =>
    expect(range('week', undefined, undefined, now).a).toBe('2026-02-22'));
  it('resuelve cambio de año', () => {
    const r = range(
      'previous',
      undefined,
      undefined,
      new Date('2026-01-15T12:00:00Z'),
    );
    expect(r.a).toBe('2025-12-01');
    expect(r.b).toBe('2025-12-31');
  });
  it('incluye último día personalizado', () =>
    expect(range('custom', '2024-02-29', '2024-02-29').end.toISOString()).toBe(
      '2024-03-01T03:00:00.000Z',
    ));
  it('rechaza fechas inexistentes, rangos invertidos y excesivos', () => {
    expect(() => range('custom', '2026-02-30', '2026-03-01')).toThrow();
    expect(() => range('custom', '2026-03-02', '2026-03-01')).toThrow();
    expect(() => range('custom', '2020-01-01', '2026-01-01')).toThrow();
  });
  it('combina filtros de tipo y categoría', () => {
    const r = filters({
      period: 'today',
      type: 'EXPENSE',
      category: 'Meta Ads',
    });
    expect(r.where.type).toBe('EXPENSE');
    expect(r.where.category).toBe('Meta Ads');
    expect(r.where.occurredAt.lt > r.where.occurredAt.gte).toBe(true);
  });
});
describe('validaciones de movimientos', () => {
  const valid = {
    type: 'INCOME',
    amount: '123,45',
    category: 'Seguidores Instagram',
    date: '2026-10-28',
    description: '',
  };
  it('convierte decimales sin errores de punto flotante', () => {
    expect(transactionSchema.parse(valid).amount).toBe(12345);
    expect(transactionSchema.parse({ ...valid, amount: '0.29' }).amount).toBe(
      29,
    );
  });
  it.each(['0', '-1', 'abc', '1.001', '21474836.48'])(
    'rechaza importe %s',
    (amount) =>
      expect(transactionSchema.safeParse({ ...valid, amount }).success).toBe(
        false,
      ),
  );
  it('rechaza categoría de otro tipo y descripción excesiva', () => {
    expect(
      transactionSchema.safeParse({ ...valid, category: 'Meta Ads' }).success,
    ).toBe(false);
    expect(
      transactionSchema.safeParse({ ...valid, description: 'x'.repeat(301) })
        .success,
    ).toBe(false);
  });
  it('escapa fórmulas y comillas en CSV', () => {
    expect(csvCell('=1+1')).toBe('"\'=1+1"');
    expect(csvCell('a"b')).toBe('"a""b"');
  });
});
