import Link from 'next/link';
import { Sun, ArrowUpRight } from 'lucide-react';
import { money } from '@/lib/finance';
import { todayStats } from '@/lib/statistics';
export function TodaySummary({
  stats,
}: {
  stats: ReturnType<typeof todayStats>;
}) {
  const items = [
    { label: 'Ingresos de hoy', value: money(stats.income), color: 'green' },
    { label: 'Gastos de hoy', value: money(stats.expense), color: 'red' },
    {
      label: 'Ganancia de hoy',
      value: money(stats.profit),
      color: stats.profit >= 0 ? 'purple' : 'red',
    },
    {
      label: 'Margen de hoy',
      value:
        stats.margin.toLocaleString('es-AR', { maximumFractionDigits: 1 }) +
        '%',
      color: '',
    },
    {
      label: 'Cobros de hoy',
      value: stats.count.toLocaleString('es-AR'),
      color: '',
    },
    {
      label: 'Cobro promedio de hoy',
      value: money(stats.averageCents),
      color: '',
    },
  ];
  return (
    <section
      className="card today-summary"
      aria-label="Estadísticas del día actual"
    >
      <div className="section-heading">
        <div>
          <p className="eyebrow">
            EL DÍA EN NÚMEROS · {stats.date.split('-').reverse().join('/')}
          </p>
          <h2 className="flex items-center gap-2">
            <Sun size={20} /> Hoy en BOOSTIFY
          </h2>
        </div>
        <Link className="button" href="/?period=today#movements">
          Ver movimientos de hoy <ArrowUpRight size={15} />
        </Link>
      </div>
      <dl className="today-grid">
        {items.map((item) => (
          <div key={item.label}>
            <dt>{item.label}</dt>
            <dd className={item.color}>{item.value}</dd>
          </div>
        ))}
      </dl>
      <p className="muted text-xs mt-5">
        Día completo en horario argentino, desde las 00:00. Incluye todos los
        tipos y categorías, independientemente de los filtros de abajo.{' '}
        {stats.count === 0 ? 'Todavía no hay cobros registrados hoy.' : ''}
      </p>
    </section>
  );
}
