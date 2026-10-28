import Link from 'next/link';
import { money } from '@/lib/finance';
import type { deepStatistics } from '@/lib/deep-statistics';
import { PeriodOverlay } from './period-overlay';
import type { Params } from '@/lib/query';
type Data = ReturnType<typeof deepStatistics>;
const date = (v: string) => v.split('-').reverse().join('/');
const signed = (v: number) => (v >= 0 ? '+' : '−') + money(Math.abs(v));
export function DeepInsights({ data, params }: { data: Data; params: Params }) {
  const d = data.distribution,
    r = data.regularity,
    g = data.growth;
  return (
    <section className="deep-insights">
      <div className="section-heading">
        <div>
          <p className="eyebrow">LO QUE EXPLICA TUS NÚMEROS</p>
          <h2>Calidad y evolución de los ingresos</h2>
        </div>
      </div>
      <p className="insight-note">
        Usa todos los tipos y categorías del período A seleccionado arriba. Los
        cobros son movimientos de ingreso, no clientes ni pedidos identificados.
      </p>
      <article className="card">
        <div className="section-heading">
          <div>
            <p className="eyebrow">ELEGÍ CON QUÉ COMPARAR</p>
            <h2>Dos períodos, una misma perspectiva</h2>
          </div>
        </div>
        <p className="muted text-xs mb-5">
          A: {date(data.a.a)} — {date(data.a.b)} · B: {date(data.b.a)} —{' '}
          {date(data.b.b)}
        </p>
        <form className="comparison-form">
          {Object.entries(params)
            .filter(
              ([k, v]) =>
                v && !['compareStart', 'compareEnd', 'page'].includes(k),
            )
            .map(([k, v]) => (
              <input key={k} type="hidden" name={k} value={v} />
            ))}
          <label>
            Inicio del período B
            <input
              type="date"
              name="compareStart"
              required
              defaultValue={data.b.a}
            />
          </label>
          <label>
            Fin del período B
            <input
              type="date"
              name="compareEnd"
              required
              defaultValue={data.b.b}
            />
          </label>
          <button className="button primary">Comparar períodos</button>
          <Link
            className="button"
            href={
              '/?' +
              new URLSearchParams(
                Object.entries(params).filter(
                  (item): item is [string, string] =>
                    typeof item[1] === 'string' &&
                    !['compareStart', 'compareEnd', 'page'].includes(item[0]),
                ),
              )
            }
          >
            Usar período anterior
          </Link>
        </form>
        <PeriodOverlay data={data.overlay} />
        <p className="muted text-xs mt-5">
          Se alinean por número de día, no por fecha calendario. Los días sin
          cobertura dejan huecos; los días adicionales no tienen contraparte.{' '}
          {data.partialA || data.partialB
            ? 'Hay días parciales o sin cobertura; las curvas muestran solo lo registrado y no prueban crecimiento comparable.'
            : ''}
        </p>
        <details className="insight-details">
          <summary>Ver importes diarios y acumulados</summary>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Día</th>
                  <th>Fecha A</th>
                  <th>Ingreso A</th>
                  <th>Acumulado A</th>
                  <th>Fecha B</th>
                  <th>Ingreso B</th>
                  <th>Acumulado B</th>
                </tr>
              </thead>
              <tbody>
                {data.overlay.map((p) => (
                  <tr key={p.index}>
                    <td>{p.index}</td>
                    <td>{p.dateA ? date(p.dateA) : '—'}</td>
                    <td>
                      {p.dailyA === null ? 'Sin cobertura' : money(p.dailyA)}
                    </td>
                    <td>
                      {p.totalA === null
                        ? 'Sin base completa'
                        : money(p.totalA)}
                    </td>
                    <td>{p.dateB ? date(p.dateB) : '—'}</td>
                    <td>
                      {p.dailyB === null ? 'Sin cobertura' : money(p.dailyB)}
                    </td>
                    <td>
                      {p.totalB === null
                        ? 'Sin base completa'
                        : money(p.totalB)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </article>
      <div className="stats-grid">
        <article id="growth-analysis" className="card">
          <p className="eyebrow">DESCOMPOSICIÓN DEL CAMBIO</p>
          <h2 className="mt-2 mb-5">¿Más cobros o mayor importe?</h2>
          {g ? (
            <>
              <p className="muted text-xs">
                Primeros {g.days} días completos comparables · A: {date(g.a.a)}{' '}
                — {date(g.a.b)} · B: {date(g.b.a)} — {date(g.b.b)}
              </p>
              <strong className="projection-value block mt-5">
                {signed(g.delta)}
              </strong>
              <p className="muted text-xs mt-2 mb-6">
                Diferencia total de ingresos
              </p>
              <div className="projection-facts">
                <p>
                  Cantidad de cobros{' '}
                  <strong>
                    {g.previous.count} → {g.current.count}
                  </strong>
                </p>
                {g.volumeCents !== null && g.ticketCents !== null ? (
                  <>
                    <p>
                      Efecto cantidad <strong>{signed(g.volumeCents)}</strong>
                    </p>
                    <p>
                      Efecto importe promedio{' '}
                      <strong>{signed(g.ticketCents)}</strong>
                    </p>
                  </>
                ) : (
                  <p className="muted">
                    Uno de los períodos no tiene cobros; se muestra el cambio
                    total sin atribuir causas.
                  </p>
                )}
              </div>
              <p className="muted text-xs">
                Descomposición matemática simétrica: reparte la interacción
                entre cantidad e importe promedio. Ambos efectos suman el cambio
                total, pero no demuestran causalidad comercial.
              </p>
            </>
          ) : (
            <p className="muted">
              Necesitamos días completos con cobertura desde el inicio de ambos
              períodos. Probá dos rangos posteriores al inicio del registro; no
              sustituimos historial faltante por ceros.
            </p>
          )}
        </article>
        <article className="card">
          <p className="eyebrow">MISMA ALTURA DEL MES</p>
          <h2 className="mt-2 mb-5">Mes contra mes, sin adelantos</h2>
          {data.sameHeight ? (
            <>
              <p className="muted text-xs mb-5">
                {data.sameHeight.days} días por mes, excluyendo hoy. A:{' '}
                {date(data.sameHeight.current.a)} —{' '}
                {date(data.sameHeight.current.b)} · B:{' '}
                {date(data.sameHeight.previous.a)} —{' '}
                {date(data.sameHeight.previous.b)}
              </p>
              {data.sameHeight.growth ? (
                <>
                  <div className="projection-facts">
                    <p>
                      Mes actual{' '}
                      <strong>
                        {money(data.sameHeight.growth.current.income)}
                      </strong>
                    </p>
                    <p>
                      Mes anterior{' '}
                      <strong>
                        {money(data.sameHeight.growth.previous.income)}
                      </strong>
                    </p>
                    <p>
                      Diferencia{' '}
                      <strong>{signed(data.sameHeight.growth.delta)}</strong>
                    </p>
                  </div>
                </>
              ) : (
                <p className="muted">
                  No hay cobertura completa de ambos rangos. Esta comparación se
                  habilitará cuando los dos tengan una base comparable.
                </p>
              )}
            </>
          ) : (
            <p className="muted">
              Hoy es el primer día del mes. La comparación estará disponible
              cuando haya al menos un día completo.
            </p>
          )}
          <p className="muted text-xs mt-5">
            Usa siempre el mes actual y el anterior. Si tienen distinta
            duración, toma la misma cantidad de días del inicio de cada mes.
          </p>
        </article>
      </div>
      <div className="stats-grid">
        <article id="payment-quality" className="card">
          <p className="eyebrow">UN COBRO TÍPICO, SIN DISTORSIONES</p>
          <h2 className="mt-2 mb-5">Mediana e importe promedio</h2>
          <div className="record-grid compact-records">
            <div>
              <p>Mediana</p>
              <strong>
                {d.medianCents === null ? 'Sin cobros' : money(d.medianCents)}
              </strong>
            </div>
            <div>
              <p>Promedio</p>
              <strong>
                {d.averageCents === null ? 'Sin cobros' : money(d.averageCents)}
              </strong>
            </div>
          </div>
          <div className="projection-facts">
            <p>
              Cobro mínimo{' '}
              <strong>{d.minCents === null ? '—' : money(d.minCents)}</strong>
            </p>
            <p>
              Cobro máximo{' '}
              <strong>{d.maxCents === null ? '—' : money(d.maxCents)}</strong>
            </p>
            <p>
              Base <strong>{d.count} cobros</strong>
            </p>
          </div>
          <p className="muted text-xs">
            La mediana divide los cobros ordenados en dos mitades. Con una
            cantidad par, promedia los dos valores centrales y redondea al
            centavo.
          </p>
        </article>
        <article id="revenue-concentration" className="card">
          <p className="eyebrow">CONCENTRACIÓN DE INGRESOS</p>
          <h2 className="mt-2 mb-5">¿Cuánto pesan los mayores cobros?</h2>
          <strong className="projection-value">
            {d.topShare.toLocaleString('es-AR', { maximumFractionDigits: 1 })}%
          </strong>
          <p className="muted mt-3">
            del ingreso corresponde a los {d.topCount} mayores cobros
          </p>
          <div className="progress mt-5 mb-5">
            <span style={{ width: `${d.topShare}%`, background: '#ad8afa' }} />
          </div>
          <div className="projection-facts">
            <p>
              Importe de los mayores cobros <strong>{money(d.topCents)}</strong>
            </p>
            <p>
              Peso del mayor cobro{' '}
              <strong>
                {d.largestShare.toLocaleString('es-AR', {
                  maximumFractionDigits: 1,
                })}
                %
              </strong>
            </p>
          </div>
          <p className="muted text-xs">
            Si hay menos de cinco cobros, incluye todos. Mide dependencia de
            operaciones grandes, no concentración por cliente: no identificamos
            personas.
          </p>
        </article>
      </div>
      <article className="card">
        <p className="eyebrow">RACHAS Y REGULARIDAD</p>
        <h2 className="mt-2 mb-6">Qué tan constante es la actividad</h2>
        <div className="regularity-grid">
          {[
            {
              label: 'Días completos registrados',
              value: String(r.completeDays),
            },
            { label: 'Días con cobros', value: String(r.activeDays) },
            { label: 'Días sin cobros', value: String(r.inactiveDays) },
            {
              label: 'Actividad sobre días completos',
              value:
                r.activePercent === null
                  ? 'Sin base'
                  : r.activePercent.toLocaleString('es-AR', {
                      maximumFractionDigits: 1,
                    }) + '%',
            },
            { label: 'Mayor racha con cobros', value: r.longest + ' días' },
            { label: 'Mayor racha sin cobros', value: r.longestZero + ' días' },
            {
              label: 'Racha al último día completo',
              value: r.completeDays
                ? r.latestRun
                  ? r.latestRun + ' días con cobros'
                  : r.latestZero + ' días sin cobros'
                : 'Sin base',
            },
            {
              label: 'Variación diaria relativa',
              value:
                r.coefficient === null
                  ? 'Sin base'
                  : r.coefficient.toLocaleString('es-AR', {
                      maximumFractionDigits: 1,
                    }) + '%',
            },
          ].map((v) => (
            <div key={v.label}>
              <p>{v.label}</p>
              <strong>{v.value}</strong>
            </div>
          ))}
        </div>
        <p className="muted text-xs mt-6">
          Excluye hoy, días parciales y días sin cobertura. Las rachas se
          limitan al período seleccionado. La variación relativa es la
          desviación estándar dividida por el ingreso diario promedio: requiere
          al menos dos días completos y promedio positivo; un valor mayor indica
          mayor dispersión, no necesariamente un mal resultado.
        </p>
        <p className="muted text-xs mt-3">
          Ingreso diario promedio:{' '}
          {r.meanCents === null ? 'sin base' : money(r.meanCents)} · Desviación
          estándar diaria:{' '}
          {r.deviationCents === null ? 'sin base' : money(r.deviationCents)}.
        </p>
      </article>
    </section>
  );
}
