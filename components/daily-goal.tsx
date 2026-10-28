import Link from 'next/link';
import { Flag, CheckCircle2 } from 'lucide-react';
import { money } from '@/lib/finance';
import type { dailyGoalProgress } from '@/lib/statistics';
export function DailyGoal({
  progress,
  available,
  date,
}: {
  progress: ReturnType<typeof dailyGoalProgress> | null;
  available: boolean;
  date: string;
}) {
  return (
    <section
      className={
        'card daily-goal ' + (progress?.achieved ? 'daily-goal-complete' : '')
      }
      aria-label="Objetivo diario de ganancia"
    >
      <div className="section-heading">
        <div>
          <p className="eyebrow">
            PASO A PASO · {date.split('-').reverse().join('/')}
          </p>
          <h2 className="flex gap-2 items-center">
            {progress?.achieved ? (
              <CheckCircle2 size={20} />
            ) : (
              <Flag size={20} />
            )}{' '}
            Objetivo diario
          </h2>
        </div>
        <Link className="button" href="#monthly-goal">
          {progress ? 'Editar meta mensual' : 'Definir meta mensual'}
        </Link>
      </div>
      {!available ? (
        <p className="muted">
          La meta no está disponible en este momento. Tus estadísticas siguen
          funcionando.
        </p>
      ) : !progress ? (
        <p className="muted">
          Definí tu meta mensual de ganancia para activar esta barra. El
          objetivo de hoy se calcula automáticamente según lo pendiente y los
          días que quedan.
        </p>
      ) : (
        <>
          <div className="daily-goal-head">
            <div>
              <span className="muted text-xs">Ganancia neta de hoy</span>
              <strong className={progress.profitToday >= 0 ? 'green' : 'red'}>
                {money(progress.profitToday)}
              </strong>
            </div>
            <div>
              <span className="muted text-xs">Objetivo de ganancia de hoy</span>
              <strong>{money(progress.dailyTargetCents)}</strong>
            </div>
            <span className="goal-percent">
              {progress.percent.toLocaleString('es-AR', {
                maximumFractionDigits: 1,
              })}
              %
            </span>
          </div>
          <div
            className="goal-progress daily-goal-track"
            role="progressbar"
            aria-label="Avance del objetivo diario de ganancia"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.min(100, progress.percent)}
            aria-valuetext={`${money(progress.profitToday)} de ${money(progress.dailyTargetCents)}; ${progress.achieved ? 'objetivo alcanzado' : 'faltan ' + money(progress.remainingCents)}`}
          >
            <span style={{ width: `${Math.min(100, progress.percent)}%` }} />
          </div>
          <div className="daily-goal-message">
            {progress.achieved ? (
              <h3 className="green">¡Objetivo de hoy alcanzado!</h3>
            ) : (
              <h3>
                Faltan{' '}
                <span className="purple">{money(progress.remainingCents)}</span>{' '}
                de ganancia para hoy.
              </h3>
            )}
            {!progress.achieved && (
              <p className="muted mt-2">
                {progress.additionalPayments === null ? (
                  'Todavía no hay cobros suficientes para estimar cuántos necesitás.'
                ) : (
                  <>
                    Aproximadamente{' '}
                    <strong>
                      {progress.additionalPayments} cobro
                      {progress.additionalPayments === 1 ? '' : 's'} adicional
                      {progress.additionalPayments === 1 ? '' : 'es'}
                    </strong>{' '}
                    al importe promedio registrado de{' '}
                    {money(progress.averageCents ?? 0)}.
                  </>
                )}
              </p>
            )}
          </div>
          <details className="insight-details">
            <summary>Cómo se calcula el objetivo diario</summary>
            <p className="mt-3">
              Se resta de la meta mensual la ganancia acumulada hasta ayer y se
              divide lo pendiente entre los {progress.remainingDays} días
              restantes, incluido hoy. Los cobros y gastos de hoy mueven el
              avance, pero no la referencia del día. Editar movimientos
              anteriores o la meta mensual sí puede cambiarla.
            </p>
            <p className="mt-3">
              El avance usa ingresos menos gastos registrados de hoy, en horario
              argentino y sin filtros. La estimación de cobros usa el importe
              promedio del mes actual y supone que los nuevos cobros no agregan
              gastos; es orientativa, no una promesa. La cobertura parcial y los
              gastos sin registrar pueden afectar el resultado.
            </p>
          </details>
        </>
      )}
      <p className="muted text-xs mt-5">
        Se actualiza con el panel y vuelve a calcularse al cambiar el día en
        Argentina.
      </p>
    </section>
  );
}
