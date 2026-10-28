import { z } from 'zod';
import { TZ } from './finance';
export const syncReportSchema = z
  .object({
    kind: z.literal('sync'),
    complete: z.boolean(),
    pendingReviewCount: z.number().int().min(0).max(50),
  })
  .strict();
export function syncStatus(
  state: {
    lastCheckedAt: Date;
    complete: boolean;
    pendingReviewCount: number;
  } | null,
  now = new Date(),
) {
  if (!state)
    return {
      label: 'Todavía no se recibió un reporte de revisión',
      tone: 'muted',
      time: null,
    };
  const time = new Intl.DateTimeFormat('es-AR', {
    timeZone: TZ,
    dateStyle: 'short',
    timeStyle: 'medium',
    hourCycle: 'h23',
  }).format(state.lastCheckedAt);
  if (now.getTime() - state.lastCheckedAt.getTime() > 15 * 60000)
    return {
      label: 'Sin novedades de la sincronización hace más de 15 minutos',
      tone: 'warning',
      time,
    };
  if (!state.complete)
    return {
      label: 'Revisión en curso: quedan más correos por recorrer',
      tone: 'muted',
      time,
    };
  if (state.pendingReviewCount)
    return {
      label: `${state.pendingReviewCount} aviso${state.pendingReviewCount === 1 ? '' : 's'} pendiente${state.pendingReviewCount === 1 ? '' : 's'} de revisión`,
      tone: 'warning',
      time,
    };
  return { label: 'Revisión completada', tone: 'green', time };
}
