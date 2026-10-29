import { expect, it, describe } from 'vitest';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { createHmac } from 'node:crypto';
import { parseBeloDeposit, BeloValidationError } from '../lib/belo';
import { day, range } from '../lib/finance';

const source = readFileSync(
  new URL('../integrations/belo-gmail/Code.gs', import.meta.url),
  'utf8',
);
const start = '2026-10-28T12:00:00.000Z';
const now = Date.parse('2026-10-29T04:00:00Z');
const id = 'abcdef0123456789';
const sample = {
  gmailMessageId: id,
  messageId: '<midnight-confirmed@belo.app>',
  sender: 'transaction@belo.app',
  subject: 'Aviso de operación - 29/10/2026 00:00:01',
  text: 'Depósito exitoso Tu cuenta de belo recibió un depósito de $990',
  receivedAt: '2026-10-29T03:00:02.000Z',
  authenticated: true,
};
function harness() {
  const store: Record<string, string> = {
    BOOSTIFY_URL: 'https://boostify.test',
    BELO_WEBHOOK_SECRET: 'private-test-secret-never-log-me-2026',
    BELO_IMPORT_START_AT: start,
    BELO_IMPORT_CURRENCY: 'ARS',
  };
  const queries: { q: string; pageToken?: string }[] = [];
  const logs: string[] = [];
  const receipts = new Map<string, unknown>();
  const state = {
    status: 201,
    heartbeatStatus: 200,
    failRead: false,
    invalidBody: false,
    invalidTemplate: false,
    failList: false,
    pages: 1,
    empty: false,
    lostResponse: false,
    unexpectedAck: false,
    previewStatus: 200,
    writes: 0,
    now,
  };
  const props = {
    getProperty: (k: string) => store[k] ?? null,
    setProperty: (k: string, v: string) => {
      store[k] = v;
    },
    deleteProperty: (k: string) => {
      delete store[k];
    },
  };
  const ctx = vm.createContext({
    Date: class extends Date {
      static now() {
        return state.now;
      }
    },
    console: { log: (v: string) => logs.push(v) },
    PropertiesService: { getScriptProperties: () => props },
    LockService: {
      getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} }),
    },
    Gmail: {
      Users: {
        Messages: {
          list: (_: string, opts: { q: string; pageToken?: string }) => {
            queries.push(opts);
            if (state.failList) throw new Error('private Gmail error');
            const page = Number(opts.pageToken || '0');
            return {
              messages: state.empty ? [] : [{ id }],
              ...(page + 1 < state.pages
                ? { nextPageToken: String(page + 1) }
                : {}),
            };
          },
          get: () => {
            if (state.failRead) throw new Error('private Gmail error');
            return {
              internalDate: String(Date.parse(sample.receivedAt)),
              payload: {
                mimeType: 'text/html',
                body: {
                  data: state.invalidBody
                    ? '%%%'
                    : [
                        ...Buffer.from(
                          state.invalidTemplate
                            ? '<p>Formato nuevo</p>'
                            : `<h1>${sample.text}</h1>`,
                        ),
                      ].map((b) => (b > 127 ? b - 256 : b)),
                },
                headers: [
                  { name: 'From', value: 'belo <transaction@belo.app>' },
                  { name: 'Subject', value: sample.subject },
                  { name: 'Message-ID', value: sample.messageId },
                  {
                    name: 'Authentication-Results',
                    value: 'mx.google.com; dmarc=pass header.from=belo.app;',
                  },
                ],
              },
            };
          },
        },
      },
    },
    Utilities: {
      Charset: { UTF_8: 'UTF-8' },
      base64DecodeWebSafe: (v: string) => {
        if (v.includes('%')) throw new Error('decode');
        return Buffer.from(v, 'base64url');
      },
      newBlob: (v: number[] | Buffer) => ({
        getDataAsString: () => Buffer.from(v).toString(),
      }),
      computeHmacSha256Signature: (v: string, k: string) => [
        ...createHmac('sha256', k).update(v).digest(),
      ],
    },
    UrlFetchApp: {
      fetch: (_: string, opts: { payload: string }) => {
        const body = JSON.parse(opts.payload);
        let code: number, data: unknown;
        if (body.kind === 'sync') {
          code = state.heartbeatStatus;
          data = { status: 'sync-recorded' };
        } else if (body.kind === 'preview') {
          code = state.previewStatus;
          const parsed = parseBeloDeposit(
            body.message,
            new Date(start),
            new Date(state.now),
          );
          data = {
            status: receipts.has(parsed.importId) ? 'duplicate' : 'eligible',
            importId: parsed.importId,
            amountCents: parsed.amountCents,
            occurredAt: parsed.occurredAt.toISOString(),
          };
        } else {
          code = state.status;
          if (code === 201 || code === 200) {
            const parsed = parseBeloDeposit(
              body,
              new Date(start),
              new Date(state.now),
            );
            if (receipts.has(parsed.importId)) {
              code = 200;
              data = { status: 'duplicate' };
            } else {
              receipts.set(parsed.importId, parsed);
              state.writes++;
              data = { status: 'created' };
              code = 201;
            }
            if (state.unexpectedAck) {
              code = 200;
              data = { status: 'unexpected' };
            }
            if (state.lostResponse)
              throw new Error('network response lost after commit');
          } else
            data = {
              reason: 'DATE_INCONSISTENT',
              private: 'must-not-log-response',
            };
        }
        return {
          getResponseCode: () => code,
          getContentText: () => JSON.stringify(data),
        };
      },
    },
  });
  vm.runInContext(source, ctx);
  return {
    store,
    logs,
    receipts,
    state,
    queries,
    run: (name = 'syncBelo') => vm.runInContext(`${name}()`, ctx),
  };
}

describe('medianoche argentina y consulta absoluta', () => {
  it.each([
    ['28/10/2026 23:59:59', '2026-10-29T02:59:59.000Z', '2026-10-28'],
    ['29/10/2026 00:00:00', '2026-10-29T03:00:00.000Z', '2026-10-29'],
    ['29/10/2026 00:00:01', '2026-10-29T03:00:01.000Z', '2026-10-29'],
  ])('asigna %s al día correcto', (local, utc, localDay) => {
    const result = parseBeloDeposit(
      { ...sample, subject: 'Aviso de operación - ' + local },
      new Date(start),
      new Date(now),
    );
    expect(result.occurredAt.toISOString()).toBe(utc);
    expect(day(result.occurredAt)).toBe(localDay);
    const bounds = range(
      'today',
      undefined,
      undefined,
      new Date('2026-10-29T03:30:00Z'),
    );
    expect(
      result.occurredAt >= bounds.start && result.occurredAt < bounds.end,
    ).toBe(localDay === '2026-10-29');
  });
  it.each([
    ['0:00:00', '2026-10-29T03:00:00.000Z'],
    ['0:03:38', '2026-10-29T03:03:38.000Z'],
    ['2:26:58', '2026-10-29T05:26:58.000Z'],
    ['0:50:52', '2026-10-29T03:50:52.000Z'],
    ['1:05:00', '2026-10-29T04:05:00.000Z'],
    ['9:59:59', '2026-10-29T12:59:59.000Z'],
  ])('acepta hora de Belo sin cero inicial %s', (hour, utc) => {
    const result = parseBeloDeposit(
      {
        ...sample,
        subject: 'Aviso de operación - 29/10/2026 ' + hour,
        receivedAt: new Date(Date.parse(utc) + 1000).toISOString(),
      },
      new Date(start),
      new Date('2026-10-29T15:00:00Z'),
    );
    expect(result.occurredAt.toISOString()).toBe(utc);
  });
  it.each(['24:00:00', '000:01:00', '0:1:00', '0:00:0', '-1:00:00'])(
    'sigue rechazando hora inválida %s',
    (hour) => {
      expect(() =>
        parseBeloDeposit(
          { ...sample, subject: 'Aviso de operación - 29/10/2026 ' + hour },
          new Date(start),
          new Date(now),
        ),
      ).toThrow();
    },
  );
  it('no depende del huso horario de Gmail ni del cambio de fecha UTC', () => {
    const h = harness();
    h.run();
    expect(h.queries[0].q).toBe(
      `from:transaction@belo.app after:${Date.parse(start) / 1000 - 1} before:${now / 1000}`,
    );
    expect(h.receipts.size).toBe(1);
  });
  it('no fuerza aceptar un asunto que trate UTC como hora argentina', () => {
    expect(() =>
      parseBeloDeposit(
        { ...sample, subject: 'Aviso de operación - 29/10/2026 03:00:01' },
        new Date(start),
        new Date(now),
      ),
    ).toThrow('DATE_INCONSISTENT');
  });
  it('identifica un formato ambiguo sin devolver el correo', () => {
    try {
      parseBeloDeposit(
        { ...sample, text: sample.text + sample.text },
        new Date(start),
        new Date(now),
      );
      throw new Error('not rejected');
    } catch (e) {
      expect(e).toBeInstanceOf(BeloValidationError);
      expect((e as BeloValidationError).code).toBe('AMBIGUOUS_AMOUNT');
    }
  });
});

describe('estados, paginación y recuperación acotada', () => {
  it('consulta cuatro páginas y retoma la quinta sin reiniciar la ventana', () => {
    const h = harness();
    h.state.pages = 5;
    h.run();
    expect(h.queries).toHaveLength(4);
    expect(JSON.parse(h.store.BELO_SCAN).pageToken).toBe('4');
    expect(h.store.BELO_CURSOR).toBeUndefined();
    h.run();
    expect(h.queries[4].pageToken).toBe('4');
    expect(h.store.BELO_SCAN).toBeUndefined();
    expect(h.store.BELO_CURSOR).toBe(String(now));
    expect(h.state.writes).toBe(1);
  });
  it('un fallo al leer un correo no bloquea todos los mensajes y queda recuperable', () => {
    const h = harness();
    h.state.failRead = true;
    h.run();
    expect(JSON.parse(h.store.BELO_REVIEW)[0].reason).toBe('GMAIL_READ_FAILED');
    expect(h.store.BELO_CURSOR).toBeDefined();
    h.state.failRead = false;
    h.state.empty = true;
    h.run();
    expect(h.state.writes).toBe(1);
    expect(JSON.parse(h.store.BELO_REVIEW)).toEqual([]);
  });
  it('reintenta la cola nueva aunque el aviso ya quedó fuera del solapamiento', () => {
    const h = harness();
    h.state.invalidBody = true;
    h.run();
    h.state.invalidBody = false;
    h.state.empty = true;
    h.state.now += 3 * 86400000;
    h.run();
    expect(h.state.writes).toBe(1);
    expect(JSON.parse(h.store.BELO_REVIEW)).toEqual([]);
  });
  it('mantiene pendientes formatos nuevos en vez de ignorarlos silenciosamente', () => {
    const h = harness();
    h.state.invalidTemplate = true;
    h.run();
    expect(h.store.BELO_REVIEW).toContain('DEPOSIT_TEMPLATE');
    expect(h.state.writes).toBe(0);
  });
  it('no confirma ni avanza ante 401 o 503', () => {
    for (const status of [401, 503]) {
      const h = harness();
      h.state.status = status;
      expect(() => h.run()).toThrow(`HTTP ${status}`);
      expect(h.store.BELO_CURSOR).toBeUndefined();
      expect(h.state.writes).toBe(0);
    }
  });
  it('si se pierde la respuesta después de guardar, reintenta sin duplicar', () => {
    const h = harness();
    h.state.lostResponse = true;
    expect(() => h.run()).toThrow();
    expect(h.state.writes).toBe(1);
    expect(h.store.BELO_CURSOR).toBeUndefined();
    h.state.lostResponse = false;
    h.run();
    expect(h.state.writes).toBe(1);
    expect(h.store.BELO_CURSOR).toBeDefined();
  });
  it('conserva el motivo exacto de un rechazo y no registra el cuerpo de respuesta', () => {
    const h = harness();
    h.state.status = 422;
    h.run();
    expect(h.store.BELO_REVIEW).toContain('DATE_INCONSISTENT');
    expect(h.logs.join('')).not.toContain('must-not-log-response');
  });
  it('exige vista previa y solo recupera sus IDs sin buscar correos históricos', () => {
    const h = harness();
    h.store.BELO_REVIEW = JSON.stringify([{ id, reason: 'Legacy' }]);
    expect(() => h.run('recoverBeloReview')).toThrow('previewBeloReview');
    h.run('previewBeloReview');
    expect(h.state.writes).toBe(0);
    expect(h.queries).toHaveLength(0);
    expect(h.logs.join('')).toContain('99000');
    h.run('recoverBeloReview');
    expect(h.state.writes).toBe(1);
    expect(JSON.parse(h.store.BELO_REVIEW)).toEqual([]);
    expect(h.store.BELO_RECOVERY_PLAN).toBeUndefined();
  });
  it('preserva la cola heredada durante la sincronización hasta revisar el plan', () => {
    const h = harness();
    h.store.BELO_REVIEW = JSON.stringify([{ id, reason: 'Legacy' }]);
    h.run();
    expect(h.state.writes).toBe(0);
    expect(h.store.BELO_REVIEW).toContain('Legacy');
  });
  it('una recuperación interrumpida después del commit conserva pendiente y reintenta sin duplicar', () => {
    const h = harness();
    h.store.BELO_REVIEW = JSON.stringify([{ id, reason: 'Legacy' }]);
    h.run('previewBeloReview');
    h.state.lostResponse = true;
    expect(() => h.run('recoverBeloReview')).toThrow();
    expect(h.state.writes).toBe(1);
    expect(h.store.BELO_REVIEW).toContain(id);
    expect(h.store.BELO_RECOVERY_PLAN).toBeDefined();
    h.state.lostResponse = false;
    h.run('recoverBeloReview');
    expect(h.state.writes).toBe(1);
    expect(JSON.parse(h.store.BELO_REVIEW)).toEqual([]);
  });
  it('la vista previa de un existente y su recuperación no cambian el ingreso', () => {
    const h = harness();
    h.run();
    h.store.BELO_REVIEW = JSON.stringify([{ id, reason: 'Legacy' }]);
    h.run('previewBeloReview');
    expect(h.logs.join('')).toContain('duplicate');
    h.run('recoverBeloReview');
    expect(h.state.writes).toBe(1);
  });
  it('rechaza planes vencidos, cambiados o mayores a diez avisos', () => {
    const h = harness();
    h.store.BELO_REVIEW = JSON.stringify([{ id, reason: 'Legacy' }]);
    h.run('previewBeloReview');
    const plan = JSON.parse(h.store.BELO_RECOVERY_PLAN);
    plan.items[0].amountCents = 1;
    h.store.BELO_RECOVERY_PLAN = JSON.stringify(plan);
    expect(() => h.run('recoverBeloReview')).toThrow('validación cambió');
    expect(h.state.writes).toBe(0);
    h.state.now += 1800001;
    expect(() => h.run('recoverBeloReview')).toThrow('previewBeloReview');
    h.store.BELO_REVIEW = JSON.stringify(
      Array.from({ length: 11 }, (_, i) => ({ id: String(i) })),
    );
    expect(() => h.run('previewBeloReview')).toThrow('Más de 10');
  });
  it('un rechazo en vista previa no se incluye en el plan', () => {
    const h = harness();
    h.store.BELO_REVIEW = JSON.stringify([{ id, reason: 'Legacy' }]);
    h.state.previewStatus = 422;
    h.run('previewBeloReview');
    expect(JSON.parse(h.store.BELO_RECOVERY_PLAN).items).toEqual([]);
    expect(h.state.writes).toBe(0);
  });
  it('no descarta pendientes cuando se llena la cola', () => {
    const h = harness();
    const pending = Array.from({ length: 50 }, (_, i) => ({
      id: String(i),
      reason: 'Legacy',
    }));
    h.store.BELO_REVIEW = JSON.stringify(pending);
    h.state.invalidBody = true;
    expect(() => h.run()).toThrow('REVIEW_QUEUE_FULL');
    expect(JSON.parse(h.store.BELO_REVIEW)).toEqual(pending);
    expect(h.store.BELO_CURSOR).toBeUndefined();
  });
  it('un token inválido conserva el último cursor completo para reiniciar', () => {
    const h = harness();
    h.store.BELO_CURSOR = String(now - 60000);
    h.store.BELO_SCAN = JSON.stringify({
      after: Date.parse(start),
      before: now,
      pageToken: 'bad',
    });
    h.state.failList = true;
    expect(() => h.run()).toThrow('No se pudo leer Gmail');
    expect(h.store.BELO_SCAN).toBeUndefined();
    expect(h.store.BELO_CURSOR).toBe(String(now - 60000));
  });
  it('no acepta HTTP 200 con un resultado inesperado como ingreso guardado', () => {
    const h = harness();
    h.state.unexpectedAck = true;
    expect(() => h.run()).toThrow('HTTP 200');
    expect(h.store.BELO_CURSOR).toBeUndefined();
  });
});
