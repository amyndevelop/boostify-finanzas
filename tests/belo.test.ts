import { describe, it, expect } from 'vitest';
import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { parseBeloDeposit, verifyBeloSignature } from '../lib/belo';
function strictWebSafeDecode(value: string) {
  if (value.length % 4 !== 0 || !/^[A-Za-z0-9_-]*={0,2}$/.test(value))
    throw new Error('No se ha podido descodificar la cadena');
  return Buffer.from(value, 'base64url');
}
const start = new Date('2026-10-28T12:00:00Z');
const now = new Date('2026-10-28T14:00:00Z');
const sample = {
  gmailMessageId: 'abcdef0123456789',
  messageId: '<deposit-one@belo.app>',
  sender: 'transaction@belo.app',
  subject: 'Aviso de operación - 28/10/2026 10:09:53',
  text: 'Depósito exitoso\nTu cuenta de belo recibió un depósito de $990 💰\nVer comprobante',
  receivedAt: '2026-10-28T13:10:00.000Z',
  authenticated: true,
};
describe('avisos de depósitos Belo', () => {
  it('extrae centavos y hora argentina del ejemplo confirmado', () => {
    const r = parseBeloDeposit(sample, start, now);
    expect(r.amountCents).toBe(99000);
    expect(r.occurredAt.toISOString()).toBe('2026-10-28T13:09:53.000Z');
  });
  it.each([
    ['1.470', 147000],
    ['1.234,56', 123456],
    ['0,29', 29],
    ['100000', 10000000],
  ])('interpreta ARS %s sin floats', (amount, cents) =>
    expect(
      parseBeloDeposit(
        { ...sample, text: sample.text.replace('990', String(amount)) },
        start,
        now,
      ).amountCents,
    ).toBe(cents),
  );
  it.each(['0', '-990', '990.50', '1,001', '21.474.836,48'])(
    'rechaza importe inválido %s',
    (amount) =>
      expect(() =>
        parseBeloDeposit(
          { ...sample, text: sample.text.replace('990', amount) },
          start,
          now,
        ),
      ).toThrow(),
  );
  it('no confunde retiros con ingresos', () =>
    expect(() =>
      parseBeloDeposit(
        {
          ...sample,
          text: 'Retiro exitoso. Retiraste $990 a una cuenta propia',
        },
        start,
        now,
      ),
    ).toThrow());
  it.each(['USD', 'USDT', 'USDC', 'EUR', 'BRL', 'BTC'])(
    'rechaza moneda ajena %s',
    (currency) =>
      expect(() =>
        parseBeloDeposit(
          { ...sample, text: sample.text + ' ' + currency },
          start,
          now,
        ),
      ).toThrow(),
  );
  it('rechaza importes ambiguos', () =>
    expect(() =>
      parseBeloDeposit(
        { ...sample, text: sample.text + ' ' + sample.text },
        start,
        now,
      ),
    ).toThrow());
  it('rechaza fechas imposibles, futuras y mensajes anteriores a activación', () => {
    expect(() =>
      parseBeloDeposit(
        { ...sample, subject: 'Aviso de operación - 31/02/2026 10:09:53' },
        start,
        now,
      ),
    ).toThrow();
    expect(() =>
      parseBeloDeposit(
        { ...sample, subject: 'Aviso de operación - 28/10/2026 25:09:53' },
        start,
        now,
      ),
    ).toThrow();
    expect(() =>
      parseBeloDeposit(
        { ...sample, receivedAt: '2026-10-28T11:00:00.000Z' },
        start,
        now,
      ),
    ).toThrow();
    expect(() =>
      parseBeloDeposit(
        { ...sample, receivedAt: '2026-11-01T11:00:00.000Z' },
        start,
        now,
      ),
    ).toThrow();
  });
  it('exige remitente exacto y autenticación', () => {
    expect(() =>
      parseBeloDeposit({ ...sample, sender: 'other@belo.app' }, start, now),
    ).toThrow();
    expect(() =>
      parseBeloDeposit({ ...sample, authenticated: false }, start, now),
    ).toThrow();
  });
  it('deduplica por Message-ID sin colapsar dos cobros iguales', () => {
    expect(parseBeloDeposit(sample, start, now).importId).toBe(
      parseBeloDeposit(
        { ...sample, gmailMessageId: 'abcdef0123456790' },
        start,
        now,
      ).importId,
    );
    expect(parseBeloDeposit(sample, start, now).importId).not.toBe(
      parseBeloDeposit(
        { ...sample, messageId: '<second-deposit@belo.app>' },
        start,
        now,
      ).importId,
    );
  });
});
it('no importa cobros anteriores al inicio aunque el correo llegue después', () => {
  expect(() =>
    parseBeloDeposit(
      { ...sample, subject: 'Aviso de operación - 28/10/2026 08:59:59' },
      start,
      now,
    ),
  ).toThrow();
});
describe('firma de integración', () => {
  const secret = 'test-secret-used-only-in-unit-tests-2026';
  const body = JSON.stringify(sample);
  const timestamp = String(+now);
  const signature = createHmac('sha256', secret)
    .update(timestamp + '.' + body)
    .digest('hex');
  it('acepta la firma y rechaza cuerpo manipulado, clave errónea, firma ausente o vencida', () => {
    expect(verifyBeloSignature(body, timestamp, signature, secret, +now)).toBe(
      true,
    );
    expect(
      verifyBeloSignature(body + ' ', timestamp, signature, secret, +now),
    ).toBe(false);
    expect(
      verifyBeloSignature(body, timestamp, signature, secret + 'x', +now),
    ).toBe(false);
    expect(verifyBeloSignature(body, timestamp, null, secret, +now)).toBe(
      false,
    );
    expect(
      verifyBeloSignature(body, timestamp, signature, secret, +now + 300001),
    ).toBe(false);
  });
});
describe('agente Gmail de solo lectura', () => {
  const source = readFileSync(
    new URL('../integrations/belo-gmail/Code.gs', import.meta.url),
    'utf8',
  );
  function run(
    code: number,
    auth = 'mx.google.com; dmarc=pass header.from=belo.app;',
    text = sample.text,
    encoded?: string,
  ) {
    const store: Record<string, string> = {
      BOOSTIFY_URL: 'https://boostify.test',
      BELO_WEBHOOK_SECRET: 'test-secret-used-only-in-unit-tests-2026',
      BELO_IMPORT_START_AT: start.toISOString(),
      BELO_IMPORT_CURRENCY: 'ARS',
    };
    const posted: string[] = [];
    const props = {
      getProperty: (k: string) => store[k] ?? null,
      setProperty: (k: string, v: string) => {
        store[k] = v;
      },
      deleteProperty: (k: string) => {
        delete store[k];
      },
    };
    const context = vm.createContext({
      console: { log: () => {} },
      PropertiesService: { getScriptProperties: () => props },
      LockService: {
        getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} }),
      },
      Gmail: {
        Users: {
          Messages: {
            list: () => ({ messages: [{ id: sample.gmailMessageId }] }),
            get: () => ({
              internalDate: String(Date.parse(sample.receivedAt)),
              payload: {
                mimeType: 'text/plain',
                body: {
                  data: encoded ?? Buffer.from(text).toString('base64url'),
                },
                headers: [
                  { name: 'From', value: 'belo <transaction@belo.app>' },
                  { name: 'Subject', value: sample.subject },
                  { name: 'Message-ID', value: sample.messageId },
                  { name: 'Authentication-Results', value: auth },
                ],
              },
            }),
          },
        },
      },
      Utilities: {
        Charset: { UTF_8: 'UTF-8' },
        base64DecodeWebSafe: strictWebSafeDecode,
        newBlob: (b: Buffer) => ({ getDataAsString: () => b.toString() }),
        computeHmacSha256Signature: (message: string, key: string) => [
          ...createHmac('sha256', key).update(message).digest(),
        ],
      },
      UrlFetchApp: {
        fetch: (_url: string, options: { payload: string }) => {
          posted.push(options.payload);
          return { getResponseCode: () => code };
        },
      },
    });
    vm.runInContext(source, context);
    return {
      store,
      posted,
      sync: () => vm.runInContext('syncBelo()', context),
    };
  }
  it('manda a revisión un cuerpo dañado sin bloquear el recorrido', () => {
    const r = run(201, undefined, undefined, '%%%');
    expect(r.sync).not.toThrow();
    expect(r.posted).toHaveLength(0);
    expect(r.store.BELO_REVIEW).toContain(sample.gmailMessageId);
    expect(r.store.BELO_CURSOR).toBeDefined();
  });
  it('publica solo depósitos autenticados y avanza cursor al completarse', () => {
    const r = run(201);
    r.sync();
    expect(r.posted).toHaveLength(1);
    expect(r.store.BELO_CURSOR).toBeDefined();
  });
  it('no avanza ante fallos recuperables y acepta duplicados', () => {
    const r = run(503);
    expect(r.sync).toThrow();
    expect(r.store.BELO_CURSOR).toBeUndefined();
    const duplicate = run(200);
    duplicate.sync();
    expect(duplicate.store.BELO_CURSOR).toBeDefined();
  });
  it('no importa remitentes sin DMARC y no acepta dominios parecidos', () => {
    for (const auth of [
      'mx.google.com; dmarc=fail header.from=belo.app;',
      'mx.google.com; dmarc=pass header.from=belo.app.evil;',
    ]) {
      const r = run(201, auth);
      r.sync();
      expect(r.posted).toHaveLength(0);
      expect(r.store.BELO_REVIEW).toBeDefined();
    }
  });
  it('ignora retiros y conserva avisos rechazados para revisión', () => {
    const r = run(201, undefined, 'Retiro exitoso');
    r.sync();
    expect(r.posted).toHaveLength(0);
    const invalid = run(422);
    invalid.sync();
    expect(invalid.store.BELO_REVIEW).toContain(sample.gmailMessageId);
  });
});
describe('correo HTML de Belo', () => {
  it('convierte HTML y entidades sin ejecutar scripts ni incluir adjuntos', () => {
    const context = vm.createContext({
      Utilities: {
        base64DecodeWebSafe: strictWebSafeDecode,
        newBlob: (v: Buffer) => ({ getDataAsString: () => v.toString() }),
      },
    });
    vm.runInContext(
      readFileSync(
        new URL('../integrations/belo-gmail/Code.gs', import.meta.url),
        'utf8',
      ),
      context,
    );
    const html =
      '<h1>Dep&oacute;sito exitoso</h1><p>Tu cuenta de belo recibi&#243; un dep&oacute;sito de $990&nbsp;💰</p><script>throw new Error("Do not execute")</script>';
    context.part = {
      mimeType: 'text/html',
      body: { data: Buffer.from(html).toString('base64url') },
    };
    const text = vm.runInContext('plainText_(part)', context);
    expect(parseBeloDeposit({ ...sample, text }, start, now).amountCents).toBe(
      99000,
    );
    expect(text).not.toContain('throw');
  });
});

describe('base64 de Gmail y Apps Script', () => {
  function context() {
    const ctx = vm.createContext({
      Utilities: {
        base64DecodeWebSafe: strictWebSafeDecode,
        newBlob: (b: Buffer) => ({ getDataAsString: () => b.toString('utf8') }),
      },
    });
    vm.runInContext(
      readFileSync(
        new URL('../integrations/belo-gmail/Code.gs', import.meta.url),
        'utf8',
      ),
      ctx,
    );
    return ctx;
  }
  it.each(['a', 'ab', 'abc', 'Depósito recibido de $990 💰'])(
    'normaliza padding ausente y conserva UTF-8: %s',
    (text) => {
      const ctx = context();
      ctx.encoded = Buffer.from(text).toString('base64url');
      expect(vm.runInContext('decodeBody_(encoded)', ctx)).toBe(text);
    },
  );
  it('también admite base64 estándar, espacios y padding existente', () => {
    const ctx = context();
    const text = 'Depósito 💰';
    ctx.encoded = Buffer.from(text).toString('base64') + '\n';
    expect(vm.runInContext('decodeBody_(encoded)', ctx)).toBe(text);
  });
  it.each(['a', 'abc%', 'ab=c', '%%%'])(
    'rechaza codificación inválida: %s',
    (encoded) => {
      const ctx = context();
      ctx.encoded = encoded;
      expect(() => vm.runInContext('decodeBody_(encoded)', ctx)).toThrow();
    },
  );
});
