import Link from 'next/link';
import { fromZonedTime, formatInTimeZone } from 'date-fns-tz';
import { requireAdmin } from '@/lib/auth';
import { db } from '@/lib/db';
import { day, TZ, money } from '@/lib/finance';
import { coverageStart, nextDay } from '@/lib/insights';
import { deepStatistics } from '@/lib/deep-statistics';
import {
  buildFindings,
  monthlyReportBounds,
  reportSummary,
} from '@/lib/findings';
import { previousRange } from '@/lib/statistics';
import { PrintReport } from '@/components/print-report';
export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const params = await searchParams;
  const month = params.month ?? day(new Date()).slice(0, 7);
  try {
    monthlyReportBounds(month);
    return { title: `BOOSTIFY Control · Informe mensual ${month}` };
  } catch {
    return { title: 'BOOSTIFY Control · Informe mensual' };
  }
}
export default async function MonthlyReport({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  await requireAdmin();
  const now = new Date(),
    params = await searchParams;
  const month = params.month ?? day(now).slice(0, 7);
  let bounds;
  try {
    bounds = monthlyReportBounds(month, now);
  } catch {
    return (
      <section className="card">
        <h1>Mes no válido</h1>
        <Link href="/reports/monthly" className="button mt-5">
          Volver al informe actual
        </Link>
      </section>
    );
  }
  const toBounds = (v: typeof bounds) => ({
    gte: fromZonedTime(v.a + 'T00:00:00', TZ),
    lt: fromZonedTime(nextDay(v.b) + 'T00:00:00', TZ),
  });
  const prev = previousRange('month', {
    ...bounds,
    start: toBounds(bounds).gte,
    end: toBounds(bounds).lt,
  });
  const [rows, first] = await Promise.all([
    db.transaction.findMany({
      where: {
        OR: [{ occurredAt: toBounds(bounds) }, { occurredAt: toBounds(prev) }],
      },
      select: {
        type: true,
        amountCents: true,
        occurredAt: true,
        category: true,
      },
    }),
    db.transaction.aggregate({ _min: { occurredAt: true } }),
  ]);
  const coverage = coverageStart(
    process.env.BELO_IMPORT_START_AT,
    first._min.occurredAt,
  );
  const summary = reportSummary(rows, bounds, coverage, now),
    stats = deepStatistics(rows, bounds, prev, coverage, now);
  const findings = buildFindings(stats, rows, coverage, now).filter(
    (f) => f.id !== 'trend',
  );
  const expenses = Object.entries(
    rows
      .filter(
        (r) =>
          r.type === 'EXPENSE' &&
          day(r.occurredAt) >= bounds.a &&
          day(r.occurredAt) <= bounds.b,
      )
      .reduce(
        (a, r) => {
          a[r.category] = (a[r.category] ?? 0) + r.amountCents;
          return a;
        },
        {} as Record<string, number>,
      ),
  ).sort((a, b) => b[1] - a[1]);
  const max = Math.max(
    1,
    ...summary.days.flatMap((d) => [d.income, d.expense]),
  );
  return (
    <article className="monthly-report">
      <div className="report-controls">
        <Link href="/" className="button">
          ← Volver al panel
        </Link>
        <form className="flex gap-3 items-end flex-wrap">
          <label>
            Mes del informe
            <input
              type="month"
              name="month"
              min="2000-01"
              max={day(now).slice(0, 7)}
              defaultValue={month}
              required
            />
          </label>
          <button className="button">Ver informe</button>
        </form>
        <PrintReport />
      </div>
      <header className="report-heading">
        <p className="eyebrow">BOOSTIFY CONTROL · INFORME PRIVADO</p>
        <h1>Informe financiero · {month.split('-').reverse().join('/')}</h1>
        <p>
          {bounds.a.split('-').reverse().join('/')} —{' '}
          {bounds.b.split('-').reverse().join('/')} · ARS · Argentina
        </p>
        <p className="muted text-xs mt-3">
          Generado el {formatInTimeZone(now, TZ, 'dd/MM/yyyy HH:mm:ss')}. Foto
          de los datos al abrir este informe; no bloquea ni modifica
          movimientos.
        </p>
      </header>
      <div className="report-warning">
        {summary.partial
          ? 'PERÍODO PARCIAL O COBERTURA NO CONFIRMADA. No representa necesariamente el resultado de todo el mes.'
          : 'Mes finalizado con cobertura configurada para todos sus días.'}{' '}
        Los resultados dependen de que todos los cobros y gastos estén
        registrados.{' '}
        {coverage
          ? `Inicio de referencia: ${coverage.date.split('-').reverse().join('/')}.`
          : ''}
      </div>
      <section className="report-metrics">
        {[
          { label: 'Ingresos cobrados', value: money(summary.total.income) },
          { label: 'Gastos registrados', value: money(summary.total.expense) },
          { label: 'Ganancia neta', value: money(summary.total.profit) },
          {
            label: 'Margen',
            value:
              summary.total.margin.toLocaleString('es-AR', {
                maximumFractionDigits: 1,
              }) + '%',
          },
          { label: 'Cantidad de cobros', value: String(summary.count) },
          {
            label: 'Cobro mediano',
            value:
              stats.distribution.medianCents === null
                ? 'Sin cobros'
                : money(stats.distribution.medianCents),
          },
        ].map((m) => (
          <div key={m.label}>
            <p>{m.label}</p>
            <strong>{m.value}</strong>
          </div>
        ))}
      </section>
      <section className="report-section">
        <h2>Ingresos y gastos por día</h2>
        <p className="muted text-xs my-3">
          Violeta: ingresos · rojo: gastos. * Día parcial o sin cobertura
          confirmada. Los importes son los efectivamente registrados.
        </p>
        <svg
          className="report-chart"
          viewBox="0 0 900 240"
          role="img"
          aria-label="Gráfico de barras de ingresos y gastos diarios"
        >
          <line x1="25" y1="200" x2="880" y2="200" stroke="currentColor" />
          {summary.days.map((d, i) => {
            const width = 840 / Math.max(1, summary.days.length);
            const x = 30 + i * width;
            return (
              <g key={d.date}>
                <rect
                  x={x}
                  y={200 - (170 * d.income) / max}
                  width={width * 0.36}
                  height={(170 * d.income) / max}
                  fill="#7c3aed"
                >
                  <title>
                    {d.date}: ingresos {money(d.income)}
                  </title>
                </rect>
                <rect
                  x={x + width * 0.4}
                  y={200 - (170 * d.expense) / max}
                  width={width * 0.36}
                  height={(170 * d.expense) / max}
                  fill="#d24b6c"
                >
                  <title>
                    {d.date}: gastos {money(d.expense)}
                  </title>
                </rect>
                <text
                  x={x + width * 0.3}
                  y="220"
                  textAnchor="middle"
                  fontSize="11"
                  fill="currentColor"
                >
                  {Number(d.date.slice(8))}
                </text>
              </g>
            );
          })}
        </svg>
      </section>
      <section className="report-section">
        <h2>Hallazgos del período</h2>
        {findings.map((f) => (
          <div key={f.id} className="report-finding">
            <h3>{f.title}</h3>
            <p>{f.detail}</p>
          </div>
        ))}
        {!findings.length && (
          <p>Sin base suficiente para destacar hallazgos.</p>
        )}
      </section>
      <section className="report-section">
        <h2>Gastos por categoría</h2>
        {expenses.length ? (
          <table>
            <thead>
              <tr>
                <th>Categoría</th>
                <th>Importe</th>
                <th>Sobre gastos</th>
              </tr>
            </thead>
            <tbody>
              {expenses.map(([name, value]) => (
                <tr key={name}>
                  <td>{name}</td>
                  <td>{money(value)}</td>
                  <td>
                    {summary.total.expense
                      ? ((value / summary.total.expense) * 100).toFixed(1)
                      : '0'}
                    %
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p>No hay gastos registrados para el mes.</p>
        )}
      </section>
      <section className="report-section">
        <h2>Detalle diario</h2>
        <table>
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Ingresos</th>
              <th>Gastos</th>
              <th>Ganancia</th>
              <th>Cobros</th>
            </tr>
          </thead>
          <tbody>
            {summary.days.map((d) => (
              <tr key={d.date}>
                <td>
                  {d.date.split('-').reverse().join('/')}
                  {!d.complete ? ' *' : ''}
                </td>
                <td>{money(d.income)}</td>
                <td>{money(d.expense)}</td>
                <td>{money(d.income - d.expense)}</td>
                <td>{d.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <p className="report-footnote">
        Documento interno. No es una factura ni certificación contable. Para
        conservarlo, usá «Guardar como PDF» en el diálogo de impresión de tu
        navegador. No se envían datos a un servicio externo.
      </p>
    </article>
  );
}
