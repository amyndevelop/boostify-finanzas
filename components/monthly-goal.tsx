'use client';
import { useActionState, useState } from 'react';
import { Target } from 'lucide-react';
import { saveMonthlyGoal } from '@/app/actions';
import { money } from '@/lib/finance';
import { Dialog, DialogTrigger, DialogContent } from './ui/dialog';
import { Button } from './ui/button';
export function MonthlyGoal({
  month,
  target,
  profit,
  progress,
  available,
}: {
  month: string;
  target: number | null;
  profit: number;
  progress: {
    percent: number;
    remainingCents: number;
    remainingDays: number;
    dailyCents: number;
  } | null;
  available: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(
    async (s: { error?: string }, f: FormData) => {
      const result = await saveMonthlyGoal(s, f);
      if (!result.error) setOpen(false);
      return result;
    },
    {},
  );
  return (
    <section className="card goal-card">
      <div className="section-heading">
        <div>
          <p className="eyebrow">
            TU PRÓXIMO OBJETIVO · {month.split('-').reverse().join('/')}
          </p>
          <h2 className="flex items-center gap-2">
            <Target size={20} /> Meta de ganancia mensual
          </h2>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button disabled={!available}>
              {target ? 'Editar meta' : 'Definir meta'}
            </Button>
          </DialogTrigger>
          <DialogContent
            title="Tu objetivo de ganancia"
            description="Elegí cuánto querés ganar este mes, después de gastos. Se guarda únicamente para este mes."
          >
            <form action={action} className="flex flex-col gap-5">
              <input type="hidden" name="month" value={month} />
              <label>
                Ganancia objetivo · ARS
                <input
                  name="amount"
                  inputMode="decimal"
                  required
                  placeholder="Ej. 500000,00"
                  defaultValue={target ? (target / 100).toFixed(2) : ''}
                />
              </label>
              {state.error && (
                <p role="alert" className="error">
                  {state.error}
                </p>
              )}
              <Button className="primary" disabled={pending}>
                {pending ? 'Guardando…' : 'Guardar meta'}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>
      {!available ? (
        <p className="muted">
          La meta no está disponible en este momento. Los demás indicadores
          siguen funcionando.
        </p>
      ) : target && progress ? (
        <>
          <div className="goal-headline">
            <div>
              <span className="muted text-xs">Ganancia acumulada</span>
              <strong className={profit >= 0 ? 'green' : 'red'}>
                {money(profit)}
              </strong>
            </div>
            <span className="muted">de {money(target)}</span>
            <span className="goal-percent">
              {progress.percent.toLocaleString('es-AR', {
                maximumFractionDigits: 1,
              })}
              %
            </span>
          </div>
          <div
            className="goal-progress"
            role="progressbar"
            aria-label="Avance hacia la meta de ganancia"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.min(100, progress.percent)}
          >
            <span style={{ width: `${Math.min(100, progress.percent)}%` }} />
          </div>
          <div className="goal-details">
            <p>
              {progress.remainingCents ? (
                <>
                  Faltan <strong>{money(progress.remainingCents)}</strong>
                </>
              ) : (
                <strong className="green">Meta alcanzada</strong>
              )}
            </p>
            <p>
              {progress.remainingCents ? (
                <>
                  Necesitás <strong>{money(progress.dailyCents)}</strong> de
                  ganancia por día en los {progress.remainingDays} días
                  restantes, incluido hoy.
                </>
              ) : (
                'Todo lo que sumes desde ahora supera tu objetivo.'
              )}
            </p>
          </div>
        </>
      ) : (
        <p className="muted">
          Definí tu primera meta para ver tu avance y la ganancia diaria
          necesaria para alcanzarla.
        </p>
      )}
      <p className="muted text-xs mt-5">
        Mes actual completo hasta hoy, sin filtros de tipo ni categoría. La
        ganancia depende de que todos tus gastos estén registrados.
      </p>
    </section>
  );
}
