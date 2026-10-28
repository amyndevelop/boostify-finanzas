import Link from 'next/link';
import { AdvancedInsights } from '@/components/advanced-insights';
import { insights, coverageStart, nextDay } from '@/lib/insights';
import { TodaySummary } from '@/components/today-summary';
import { BeloSyncStatus } from '@/components/belo-sync-status';
import { syncStatus } from '@/lib/sync-status';
import { db } from '@/lib/db';
import {
  previousRange,
  paymentStats,
  variation,
  goalProgress,
  todayStats,
} from '@/lib/statistics';
import { MonthlyGoal } from '@/components/monthly-goal';
import { requireAdmin } from '@/lib/auth';
import { day, money, totals, range } from '@/lib/finance';
import { filters, Params } from '@/lib/query';
import { MovementDialog, DeleteDialog } from '@/components/movement-dialog';
import { Evolution, MonthlyChart } from '@/components/charts';
import { Filters } from '@/components/filters';
import {
  ArrowDownLeft,
  ArrowUpRight,
  Download,
  Wallet,
  TrendingUp,
  Percent,
  ArrowLeftRight,
} from 'lucide-react';
import { addDays, subMonths } from 'date-fns';
import { fromZonedTime } from 'date-fns-tz';
import { TZ } from '@/lib/finance';
export default async function Dashboard({
  searchParams,
}: {
  searchParams: Promise<Params>;
}) {
  await requireAdmin();
  const p = await searchParams;
  let selected: ReturnType<typeof filters>;
  try {
    selected = filters(p);
  } catch {
    return (
      <section className="card">
        <h1>Revisá las fechas del filtro</h1>
        <p className="muted my-4">
          Elegí fechas válidas y un rango de hasta dos años.
        </p>
        <Link className="button" href="/">
          Volver al mes actual
        </Link>
      </section>
    );
  }
  const now = new Date();
  const today = day(now);
  const monthStart = today.slice(0, 7) + '-01';
  const sixMonths = subMonths(new Date(monthStart + 'T12:00:00Z'), 5)
    .toISOString()
    .slice(0, 10);
  const previousDates = previousRange(p.period, selected.dates);
  const [rows, monthly, previousRows, goalResult, syncState] =
    await Promise.all([
      db.transaction.findMany({
        where: selected.where,
        orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }],
      }),
      db.transaction.findMany({
        where: {
          occurredAt: {
            gte: fromZonedTime(sixMonths + 'T00:00:00', TZ),
            lt: range('month', undefined, undefined, now).end,
          },
        },
        select: { type: true, amountCents: true, occurredAt: true },
      }),
      db.transaction.findMany({
        where: {
          ...selected.where,
          occurredAt: { gte: previousDates.start, lt: previousDates.end },
        },
        select: { type: true, amountCents: true },
      }),
      db.monthlyGoal
        .findUnique({ where: { month: today.slice(0, 7) } })
        .then((goal) => ({ available: true, goal }))
        .catch(() => ({ available: false, goal: null })),
      db.integrationSyncState
        .findUnique({ where: { id: 'belo' } })
        .then((state) => ({ available: true, state }))
        .catch(() => ({ available: false, state: null })),
    ]);
  const insightStart =
    nextDay(selected.dates.a, -29) < monthStart
      ? nextDay(selected.dates.a, -29)
      : monthStart;
  const [insightRows, firstRecorded] = await Promise.all([
    db.transaction.findMany({
      where: {
        occurredAt: {
          gte: fromZonedTime(insightStart + 'T00:00:00', TZ),
          lt: range('month', undefined, undefined, now).end,
        },
      },
      select: { type: true, amountCents: true, occurredAt: true },
    }),
    db.transaction.aggregate({ _min: { occurredAt: true } }),
  ]);
  const insightData = insights(
    insightRows,
    selected.dates.a,
    selected.dates.b,
    coverageStart(
      process.env.BELO_IMPORT_START_AT,
      firstRecorded._min.occurredAt,
    ),
    now,
  );
  const mailStatus = syncState.available
    ? syncStatus(syncState.state)
    : {
        time: null,
        label: 'Estado de sincronización no disponible',
        tone: 'muted',
      };
  const todaySummary = todayStats(monthly, now);
  const summary = totals(rows);
  const prior = totals(previousRows);
  const payments = paymentStats(rows),
    priorPayments = paymentStats(previousRows);
  const currentMonthProfit = totals(
    monthly.filter((r) => day(r.occurredAt).startsWith(today.slice(0, 7))),
  ).profit;
  const goal = goalResult.goal;
  const goalState = goal
    ? goalProgress(goal.amountCents, currentMonthProfit)
    : null;

  const daily = new Map<
    string,
    { date: string; income: number; expense: number; profit: number }
  >();
  for (
    let d = new Date(selected.dates.a + 'T12:00:00Z');
    d.toISOString().slice(0, 10) <= selected.dates.b;
    d = addDays(d, 1)
  ) {
    const date = d.toISOString().slice(0, 10);
    daily.set(date, { date, income: 0, expense: 0, profit: 0 });
  }
  for (const r of rows) {
    const d = daily.get(day(r.occurredAt));
    if (d) {
      if (r.type === 'INCOME') d.income += r.amountCents;
      else d.expense += r.amountCents;
      d.profit = d.income - d.expense;
    }
  }
  const monthlyData = Array.from({ length: 6 }, (_, i) => {
    const m = subMonths(new Date(monthStart + 'T12:00:00Z'), 5 - i)
      .toISOString()
      .slice(0, 7);
    return {
      month: m,
      ...totals(monthly.filter((r) => day(r.occurredAt).startsWith(m))),
    };
  });
  const expenses = Object.entries(
    rows
      .filter((r) => r.type === 'EXPENSE')
      .reduce(
        (a, r) => {
          a[r.category] = (a[r.category] ?? 0) + r.amountCents;
          return a;
        },
        {} as Record<string, number>,
      ),
  ).sort((a, b) => b[1] - a[1]);
  const exportParams = new URLSearchParams(
    Object.entries(p).filter(
      (v): v is [string, string] => typeof v[1] === 'string',
    ),
  ).toString();
  const page = Math.max(
    1,
    Math.min(Math.ceil(rows.length / 20) || 1, Math.floor(Number(p.page)) || 1),
  );
  return (
    <>
      <section id="overview" className="page-heading">
        <div>
          <p className="eyebrow">EL PULSO DE TU NEGOCIO</p>
          <h1>
            Todo en <span>control.</span>
          </h1>
          <p className="muted">
            Tus números claros. Tus próximas decisiones, más simples.
          </p>
        </div>
        <MovementDialog today={today} />
      </section>
      <BeloSyncStatus {...mailStatus} />
      <TodaySummary stats={todaySummary} />
      <div className="period-bar">
        <div>
          <span className="live-dot" />{' '}
          {selected.dates.a.split('-').reverse().join('/')} —{' '}
          {selected.dates.b.split('-').reverse().join('/')}
        </div>
        <span className="muted text-xs">ARS · Hora de Argentina</span>
      </div>
      <Filters params={p} />
      <section className="metrics" aria-label="Resumen financiero">
        {[
          {
            title: 'Ingresos cobrados',
            value: money(summary.income),
            note: 'Dinero que entró al negocio',
            change: variation(summary.income, prior.income),
            icon: ArrowDownLeft,
            color: 'green',
          },
          {
            title: 'Gastos del período',
            value: money(summary.expense),
            note: 'Tu inversión en movimiento',
            change: variation(summary.expense, prior.expense),
            icon: ArrowUpRight,
            color: 'red',
          },
          {
            title: 'Ganancia neta',
            value: money(summary.profit),
            note: 'Lo que realmente queda',
            change: variation(summary.profit, prior.profit),
            icon: Wallet,
            color: 'purple',
          },
          {
            title: 'Margen de ganancia',
            value:
              summary.margin.toLocaleString('es-AR', {
                maximumFractionDigits: 1,
              }) + '%',
            note: summary.income
              ? 'Ganancia sobre ingresos'
              : 'Sin ingresos en este período',
            icon: Percent,
            color: 'neutral',
            change: null,
          },
        ].map((m) => (
          <article key={m.title} className={'metric ' + m.color}>
            <div className="metric-label">
              {m.title}
              <span className="metric-icon">
                <m.icon size={19} />
              </span>
            </div>
            <strong>{m.value}</strong>
            <p>{m.note}</p>
            {m.change ? (
              <p className="metric-comparison">
                {m.change.delta >= 0 ? '+' : '−'}
                {money(Math.abs(m.change.delta))}
                {m.change.percent !== null
                  ? ` (${m.change.percent >= 0 ? '+' : ''}${m.change.percent.toLocaleString('es-AR', { maximumFractionDigits: 1 })}%)`
                  : ' · sin base positiva para %'}
              </p>
            ) : (
              <p className="metric-comparison">
                {(summary.margin - prior.margin).toLocaleString('es-AR', {
                  maximumFractionDigits: 1,
                  signDisplay: 'always',
                })}{' '}
                puntos porcentuales
              </p>
            )}
          </article>
        ))}
      </section>
      <p className="comparison-context">
        Comparación con {previousDates.a.split('-').reverse().join('/')} —{' '}
        {previousDates.b.split('-').reverse().join('/')} · mismos filtros. El
        mes actual se compara hasta el día equivalente del mes anterior.
      </p>
      <section className="payment-metrics" aria-label="Estadísticas de cobros">
        <article className="card">
          <p className="eyebrow">CANTIDAD DE COBROS</p>
          <strong>{payments.count.toLocaleString('es-AR')}</strong>
          <p className="muted">
            {priorPayments.count.toLocaleString('es-AR')} en el período anterior
            · {payments.count - priorPayments.count >= 0 ? '+' : ''}
            {payments.count - priorPayments.count}
          </p>
        </article>
        <article className="card">
          <p className="eyebrow">COBRO PROMEDIO</p>
          <strong>{money(payments.averageCents)}</strong>
          <p className="muted">
            Antes: {money(priorPayments.averageCents)} ·{' '}
            {payments.count
              ? 'promedio por movimiento de ingreso'
              : 'sin cobros en el período'}
          </p>
        </article>
      </section>
      <MonthlyGoal
        month={today.slice(0, 7)}
        target={goal?.amountCents ?? null}
        profit={currentMonthProfit}
        progress={goalState}
        available={goalResult.available}
      />
      <section className="card evolution">
        <div className="section-heading">
          <div>
            <p className="eyebrow">DÍA A DÍA</p>
            <h2>Así se mueve BOOSTIFY</h2>
          </div>
          <span className="badge">
            <TrendingUp size={14} /> Evolución del período
          </span>
        </div>
        {rows.length ? (
          <Evolution data={[...daily.values()]} />
        ) : (
          <div className="empty">
            <TrendingUp size={32} />
            <h3>Todo empieza con el primer movimiento.</h3>
            <p>
              Registrá un ingreso o gasto para ver la evolución de tu negocio.
            </p>
            <MovementDialog today={today} />
          </div>
        )}
      </section>
      <section id="movements" className="card">
        <div className="section-heading">
          <div>
            <p className="eyebrow">CADA MOVIMIENTO CUENTA</p>
            <h2>
              Tu historial <span className="count">{rows.length}</span>
            </h2>
          </div>
          <Link className="button" href={'/api/export?' + exportParams}>
            <Download size={16} /> Exportar CSV
          </Link>
        </div>
        {rows.length ? (
          <>
            <div className="table-scroll">
              <table>
                <caption className="sr-only">
                  Movimientos del período seleccionado
                </caption>
                <thead>
                  <tr>
                    <th>Movimiento</th>
                    <th>Fecha</th>
                    <th>Tipo</th>
                    <th className="text-right">Importe</th>
                    <th>
                      <span className="sr-only">Acciones</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.slice((page - 1) * 20, page * 20).map((r) => (
                    <tr key={r.id}>
                      <td>
                        <div className="transaction-name">
                          <span
                            className={
                              'transaction-icon ' +
                              (r.type === 'INCOME' ? 'green' : 'red')
                            }
                          >
                            {r.type === 'INCOME' ? (
                              <ArrowDownLeft size={19} />
                            ) : (
                              <ArrowUpRight size={19} />
                            )}
                          </span>
                          <span>
                            <strong>{r.category}</strong>
                            <small>{r.description || 'Sin descripción'}</small>
                          </span>
                        </div>
                      </td>
                      <td className="nowrap muted">
                        {day(r.occurredAt).split('-').reverse().join('/')}
                      </td>
                      <td>
                        <span
                          className={
                            'type-badge ' +
                            (r.type === 'INCOME' ? 'green' : 'red')
                          }
                        >
                          {r.type === 'INCOME' ? 'Ingreso' : 'Gasto'}
                        </span>
                      </td>
                      <td
                        className={
                          'amount ' + (r.type === 'INCOME' ? 'green' : 'red')
                        }
                      >
                        {r.type === 'INCOME' ? '+' : '−'}
                        {money(r.amountCents)}
                      </td>
                      <td>
                        <div className="flex">
                          <MovementDialog
                            movement={{ ...r, date: day(r.occurredAt) }}
                            today={today}
                          />
                          <DeleteDialog id={r.id} />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="pagination">
              <span>
                Página {page} de {Math.ceil(rows.length / 20)}
              </span>
              <div className="flex gap-3">
                {page > 1 && (
                  <Link
                    className="button"
                    href={
                      '/?' +
                      new URLSearchParams({
                        ...Object.fromEntries(
                          new URLSearchParams(exportParams),
                        ),
                        page: String(page - 1),
                      }) +
                      '#movements'
                    }
                  >
                    Anterior
                  </Link>
                )}
                {page * 20 < rows.length && (
                  <Link
                    className="button"
                    href={
                      '/?' +
                      new URLSearchParams({
                        ...Object.fromEntries(
                          new URLSearchParams(exportParams),
                        ),
                        page: String(page + 1),
                      }) +
                      '#movements'
                    }
                  >
                    Siguiente
                  </Link>
                )}
              </div>
            </div>
          </>
        ) : (
          <div className="empty compact">
            <ArrowLeftRight size={28} />
            <h3>No hay movimientos en este período.</h3>
            <p>Probá otro filtro o registrá un nuevo movimiento.</p>
          </div>
        )}
      </section>
      <AdvancedInsights data={insightData} />
      <section className="stats-grid">
        <article className="card">
          <div className="section-heading">
            <div>
              <p className="eyebrow">UNA MIRADA MÁS AMPLIA</p>
              <h2>Últimos seis meses</h2>
            </div>
          </div>
          <MonthlyChart data={monthlyData} />
          <div className="monthly-summary">
            {monthlyData.map((m) => (
              <div key={m.month}>
                <span>{m.month}</span>
                <strong className={m.profit >= 0 ? 'green' : 'red'}>
                  {money(m.profit)}
                </strong>
                <small>ganancia neta</small>
              </div>
            ))}
          </div>
        </article>
        <article className="card">
          <p className="eyebrow">DÓNDE INVERTÍS</p>
          <h2 className="mt-2 mb-7">Gastos por categoría</h2>
          {expenses.length ? (
            <div className="category-list">
              {expenses.map(([name, value], i) => (
                <div key={name}>
                  <div className="flex justify-between gap-3 mb-2">
                    <span>{name}</span>
                    <strong>{money(value)}</strong>
                  </div>
                  <div className="progress">
                    <span
                      style={{
                        width: `${(value / summary.expense) * 100}%`,
                        background: [
                          '#8b5cf6',
                          '#ac87ff',
                          '#d0b7ff',
                          '#6250a8',
                          '#494062',
                        ][i % 5],
                      }}
                    />
                  </div>
                  <p className="muted text-xs mt-1">
                    {((value / summary.expense) * 100).toFixed(1)}% del gasto
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty compact">
              <p>Sin gastos para los filtros seleccionados.</p>
            </div>
          )}
          <p className="muted text-xs mt-7">
            Los totales y categorías respetan tus filtros. La comparación
            mensual muestra todos los movimientos.
          </p>
        </article>
      </section>
    </>
  );
}
