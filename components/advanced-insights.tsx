import Link from 'next/link';
import { money } from '@/lib/finance';
import type { insights } from '@/lib/insights';
import { HoursChart, MovingChart } from './insight-charts';
type Data = ReturnType<typeof insights>;
const date = (v: string) => v.split('-').reverse().join('/');
export function AdvancedInsights({ data }: { data: Data }) {
  const max = Math.max(1, ...data.days.map((d) => d.income));
  const maxWeek = Math.max(1, ...data.week.map((w) => w.average));
  const months = [...new Set(data.days.map((d) => d.date.slice(0, 7)))];
  return (
    <section className="advanced-insights">
      <div className="section-heading">
        <div>
          <p className="eyebrow">ENTENDÉ TU RITMO</p>
          <h2>Radiografía de los cobros</h2>
        </div>
      </div>
      <p className="insight-note">
        Usa el período seleccionado con todos los tipos y categorías. Horarios
        de Argentina.{' '}
        {data.coverage ? (
          <>
            Registro disponible desde {date(data.coverage.date)}.{' '}
            {data.coverage.confirmed
              ? 'El primer día puede ser parcial.'
              : 'Inicio inferido del primer movimiento; no garantiza que el historial esté completo.'}
          </>
        ) : (
          'Todavía no hay datos para establecer el inicio del registro.'
        )}{' '}
        Los días anteriores no cuentan como días con ingreso cero en los
        promedios.
      </p>
      <article className="card">
        <div className="section-heading">
          <div>
            <p className="eyebrow">CALENDARIO DE INGRESOS</p>
            <h2>Un día, una historia</h2>
          </div>
          <span className="muted text-xs">
            Más violeta = más ingresos · rayado = sin cobertura
          </span>
        </div>
        <div className="calendar-months">
          {months.map((month) => {
            const days = data.days.filter((d) => d.date.startsWith(month));
            const offset =
              (new Date(days[0].date + 'T12:00:00Z').getUTCDay() + 6) % 7;
            return (
              <div key={month} className="calendar-month">
                <h3>{month.split('-').reverse().join('/')}</h3>
                <div className="calendar-grid">
                  {['L', 'M', 'X', 'J', 'V', 'S', 'D'].map((label, i) => (
                    <span key={'w' + i} className="calendar-weekday">
                      {label}
                    </span>
                  ))}
                  {Array.from({ length: offset }, (_, i) => (
                    <span key={'b' + i} />
                  ))}
                  {days.map((d) => (
                    <Link
                      key={d.date}
                      href={`/?period=custom&start=${d.date}&end=${d.date}#movements`}
                      className={
                        'calendar-day ' + (!d.observed ? 'unobserved' : '')
                      }
                      style={
                        d.observed
                          ? {
                              background: `rgba(124,58,237,${0.08 + (0.85 * d.income) / max})`,
                            }
                          : undefined
                      }
                      aria-label={`${date(d.date)}: ${money(d.income)}, ${d.count} cobros${!d.observed ? ', cobertura no disponible' : d.partial ? ', día parcial' : ''}`}
                      title={`${date(d.date)} · ${money(d.income)} · ${d.count} cobros${d.partial ? ' · parcial' : ''}${!d.observed ? ' · sin cobertura' : ''}`}
                    >
                      {Number(d.date.slice(8))}
                      {d.partial && <span aria-hidden="true">*</span>}
                    </Link>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
        {!data.days.length && (
          <p className="muted">
            El rango seleccionado no contiene días transcurridos.
          </p>
        )}
        <p className="muted text-xs mt-5">
          Cada día abre sus movimientos. * Día parcial. Los importes son cobros
          registrados, no ventas identificadas.
        </p>
      </article>
      <article id="income-trend" className="card">
        <div className="section-heading">
          <div>
            <p className="eyebrow">TENDENCIA DE INGRESOS</p>
            <h2>Más allá de un buen día</h2>
          </div>
        </div>
        <MovingChart data={data.days} />
        <div className="flex gap-5 text-xs muted mt-4 flex-wrap">
          <span>● Ingreso diario</span>
          <span className="purple">● Promedio 7 días</span>
          <span className="green">● Promedio 30 días</span>
        </div>
        <p className="muted text-xs mt-4">
          Cada promedio exige 7 o 30 días completos de cobertura, incluidos los
          días sin cobros. Hoy queda excluido de los promedios porque todavía
          está en curso. Si falta historial, la línea no se dibuja.
        </p>
      </article>
      <div className="stats-grid">
        <article className="card">
          <p className="eyebrow">DÍAS DE LA SEMANA</p>
          <h2 className="mt-2 mb-6">Cuándo se mueve más</h2>
          <div className="weekday-list">
            {data.week.map((w) => (
              <div key={w.label}>
                <div className="flex justify-between gap-3">
                  <strong>{w.label}</strong>
                  <span>
                    {money(w.average)}{' '}
                    <small className="muted">/ día completo</small>
                  </span>
                </div>
                <div className="progress mt-2 mb-2">
                  <span
                    style={{
                      width: `${(w.average / maxWeek) * 100}%`,
                      background: '#9c71f2',
                    }}
                  />
                </div>
                <p className="muted text-xs">
                  {w.count} cobros · {money(w.income)} total · {w.days} días
                  completos observados
                  {w.days === 0 ? ' · promedio sin base' : ''}
                </p>
              </div>
            ))}
          </div>
        </article>
        <article className="card">
          <p className="eyebrow">HORARIO ARGENTINO</p>
          <h2 className="mt-2 mb-6">Tus horas más activas</h2>
          <HoursChart data={data.hours} />
          <p className="muted text-xs mt-5">
            Cuenta el horario de recepción del pago, no el del pedido. Los
            movimientos manuales usan las 12:00 por defecto y pueden concentrar
            actividad artificialmente al mediodía.
          </p>
          <details className="insight-details">
            <summary>Ver cantidades e ingresos por hora</summary>
            <div className="hour-table">
              {data.hours.map((h) => (
                <div key={h.label}>
                  <span>{h.label}</span>
                  <span>{h.count} cobros</span>
                  <span>{money(h.income)}</span>
                </div>
              ))}
            </div>
          </details>
        </article>
      </div>
      <div className="stats-grid">
        <article className="card">
          <p className="eyebrow">DISTRIBUCIÓN DE IMPORTES</p>
          <h2 className="mt-2 mb-6">Cómo son tus cobros</h2>
          <div className="weekday-list">
            {data.bins.map((b) => (
              <div key={b.label}>
                <div className="flex justify-between gap-3">
                  <span>{b.label}</span>
                  <strong>
                    {b.count} ·{' '}
                    {data.count
                      ? ((b.count / data.count) * 100).toFixed(1)
                      : '0'}
                    %
                  </strong>
                </div>
                <div className="progress mt-2">
                  <span
                    style={{
                      width: `${data.count ? (b.count / data.count) * 100 : 0}%`,
                      background: '#ad8afa',
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
          <p className="muted text-xs mt-6">
            {data.modes.length ? (
              <>
                Importe más frecuente{data.modes.length > 1 ? ' (empate)' : ''}:{' '}
                {data.modes.slice(0, 5).map(money).join(' · ')}
                {data.modes.length > 5 ? ` y ${data.modes.length - 5} más` : ''}
                . {data.maxFrequency} veces cada uno.
              </>
            ) : (
              'Todavía no hay un importe repetido que marque una moda.'
            )}
          </p>
        </article>
        <article className="card projection-card">
          <p className="eyebrow">ESTIMACIÓN · MES ACTUAL</p>
          <h2 className="mt-2 mb-5">Si mantenés este ritmo…</h2>
          {data.projection ? (
            <>
              <strong className="projection-value">
                {money(data.projection.estimate)}
              </strong>
              <p className="muted mt-3">Ingresos estimados al cierre del mes</p>
              <div className="projection-facts">
                <p>
                  Cobrado hasta hoy <strong>{money(data.monthIncome)}</strong>
                </p>
                <p>
                  Promedio diario observado{' '}
                  <strong>{money(data.projection.average)}</strong>
                </p>
                <p>
                  Base{' '}
                  <strong>{data.projection.fullDays} días completos</strong>
                </p>
              </div>
              <p className="muted text-xs">
                Suma a lo cobrado el promedio para los días restantes; para hoy
                agrega solo lo que falta hasta ese promedio.{' '}
                {data.coverage && data.coverage.date > data.monthStart
                  ? 'El mes tiene cobertura parcial: no reconstruye ingresos anteriores.'
                  : ''}{' '}
                No es una promesa de ingresos ni modifica tus totales reales.
              </p>
            </>
          ) : (
            <div className="empty compact">
              <h3>Primero, una base suficiente.</h3>
              <p>
                La proyección necesita al menos 7 días completos desde el inicio
                del registro. Base actual: {data.fullDays} días. No usamos días
                anteriores como ceros.
              </p>
            </div>
          )}
        </article>
      </div>
      <article className="card">
        <p className="eyebrow">RÉCORDS DEL PERÍODO SELECCIONADO</p>
        <h2 className="mt-2 mb-6">Tus mejores marcas registradas</h2>
        <div className="record-grid">
          {[
            {
              label: 'Mayor ingreso diario',
              row: data.records.income,
              key: 'income' as const,
            },
            {
              label: 'Más cobros en un día',
              row: data.records.count,
              key: 'count' as const,
            },
            {
              label: 'Mejor ganancia registrada',
              row: data.records.profit,
              key: 'profit' as const,
            },
          ].map((r) => (
            <div key={r.key}>
              <p className="muted">{r.label}</p>
              <strong>
                {r.row
                  ? r.key === 'count'
                    ? `${r.row.count} cobros`
                    : money(r.row[r.key])
                  : 'Sin movimientos'}
              </strong>
              {r.row && (
                <Link
                  href={`/?period=custom&start=${r.row.date}&end=${r.row.date}#movements`}
                >
                  {date(r.row.date)}
                  {r.row.partial ? ' · parcial' : ''} →
                </Link>
              )}
            </div>
          ))}
        </div>
        <p className="muted text-xs mt-5">
          En empates se muestra el primer día. La ganancia depende de que todos
          los gastos estén registrados. Los récords corresponden a los
          movimientos disponibles, no a períodos sin cobertura.
        </p>
      </article>
    </section>
  );
}
