import { range, categories } from './finance';
export type Params = Record<string, string | undefined>;
export function filters(p: Params) {
  const dates = range(p.period, p.start, p.end);
  const type: 'INCOME' | 'EXPENSE' | undefined =
    p.type === 'INCOME' || p.type === 'EXPENSE' ? p.type : undefined;
  const category =
    p.category && Object.values(categories).flat().includes(p.category)
      ? p.category
      : undefined;
  return {
    dates,
    where: {
      occurredAt: { gte: dates.start, lt: dates.end },
      ...(type ? { type } : {}),
      ...(category ? { category } : {}),
    },
  };
}
