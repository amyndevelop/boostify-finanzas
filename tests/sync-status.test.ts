import { describe, it, expect } from 'vitest';
import { syncStatus, syncReportSchema } from '../lib/sync-status';
describe('última revisión de Gmail', () => {
  const now = new Date('2026-10-28T14:00:00Z');
  const fresh = { lastCheckedAt: now, complete: true, pendingReviewCount: 0 };
  it('no inventa una fecha sin reportes', () =>
    expect(syncStatus(null, now).time).toBe(null));
  it('muestra hora argentina aunque UTC sea otro día', () => {
    const result = syncStatus(
      { ...fresh, lastCheckedAt: new Date('2026-10-28T01:02:03Z') },
      new Date('2026-10-28T01:02:04Z'),
    );
    expect(result.time).toContain('27/10/26');
    expect(result.time).toContain('22:02:03');
  });
  it('distingue revisión completa, parcial y pendiente', () => {
    expect(syncStatus(fresh, now).label).toBe('Revisión completada');
    expect(syncStatus({ ...fresh, complete: false }, now).label).toContain(
      'en curso',
    );
    expect(
      syncStatus({ ...fresh, pendingReviewCount: 1 }, now).label,
    ).toContain('1 aviso pendiente');
  });
  it('señala que dejó de reportar sin atribuir una causa no comprobada', () =>
    expect(syncStatus(fresh, new Date(+now + 16 * 60000)).label).toContain(
      'más de 15 minutos',
    ));
  it('valida reportes sin aceptar datos arbitrarios', () => {
    expect(
      syncReportSchema.safeParse({
        kind: 'sync',
        complete: true,
        pendingReviewCount: 0,
      }).success,
    ).toBe(true);
    for (const pendingReviewCount of [-1, 51, 1.5])
      expect(
        syncReportSchema.safeParse({
          kind: 'sync',
          complete: true,
          pendingReviewCount,
        }).success,
      ).toBe(false);
    expect(
      syncReportSchema.safeParse({
        kind: 'sync',
        complete: true,
        pendingReviewCount: 0,
        lastCheckedAt: 'fake',
      }).success,
    ).toBe(false);
  });
});
