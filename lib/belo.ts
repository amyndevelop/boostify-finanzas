import { z } from 'zod';
import { fromZonedTime } from 'date-fns-tz';
import { createHmac, timingSafeEqual, createHash } from 'node:crypto';
import { dateSchema, TZ } from './finance';
export const beloMessageSchema = z
  .object({
    gmailMessageId: z.string().regex(/^[a-f0-9]{10,40}$/),
    messageId: z.string().trim().min(5).max(500),
    sender: z.literal('transaction@belo.app'),
    subject: z.string().max(200),
    text: z.string().max(20000),
    receivedAt: z.iso.datetime(),
    authenticated: z.literal(true),
  })
  .strict();
export function verifyBeloSignature(
  body: string,
  timestamp: string | null,
  signature: string | null,
  secret: string,
  now = Date.now(),
) {
  if (
    secret.length < 32 ||
    !timestamp ||
    !/^\d{13}$/.test(timestamp) ||
    !signature ||
    !/^[a-f0-9]{64}$/.test(signature)
  )
    return false;
  if (Math.abs(now - Number(timestamp)) > 5 * 60 * 1000) return false;
  const expected = createHmac('sha256', secret)
    .update(timestamp + '.' + body)
    .digest();
  return timingSafeEqual(expected, Buffer.from(signature, 'hex'));
}
export class BeloValidationError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = 'BeloValidationError';
  }
}
export function parseBeloDeposit(
  input: unknown,
  startAt: Date,
  now = new Date(),
) {
  const parsed = beloMessageSchema.safeParse(input);
  if (!parsed.success) throw new BeloValidationError('INVALID_MESSAGE');
  const m = parsed.data;
  const received = new Date(m.receivedAt);
  if (received < startAt || received.getTime() > now.getTime() + 300000)
    throw new BeloValidationError('RECEIVED_OUTSIDE_WINDOW');
  const subject =
    /^Aviso de operaci[oó]n\s*[-–]\s*(\d{2})\/(\d{2})\/(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})$/i.exec(
      m.subject.trim(),
    );
  if (!subject) throw new BeloValidationError('SUBJECT_FORMAT');
  const [, d, mo, y, h, mi, se] = subject;
  const parsedDate = dateSchema.safeParse(`${y}-${mo}-${d}`);
  if (!parsedDate.success) throw new BeloValidationError('INVALID_DATE');
  const date = parsedDate.data;
  if (+h > 23 || +mi > 59 || +se > 59)
    throw new BeloValidationError('INVALID_TIME');
  const occurredAt = fromZonedTime(
    `${date}T${h.padStart(2, '0')}:${mi}:${se}`,
    TZ,
  );
  if (occurredAt < startAt) throw new BeloValidationError('BEFORE_ACTIVATION');
  if (
    occurredAt.getTime() > received.getTime() + 300000 ||
    received.getTime() - occurredAt.getTime() > 7 * 86400000
  )
    throw new BeloValidationError('DATE_INCONSISTENT');
  const text = m.text
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (
    !/Dep[oó]sito exitoso/i.test(text) ||
    /Retiro exitoso|Retiraste|\b(?:USD|USDT|USDC|BTC|EUR|BRL)\b/i.test(text)
  )
    throw new BeloValidationError('NOT_ARS_DEPOSIT');
  // Only the exact, confirmed Belo deposit sentence is accepted. No approximate matching.
  const matches = [
    ...text.matchAll(
      /Tu cuenta de belo recibi[oó] un dep[oó]sito de\s*\$\s*((?:\d{1,3}(?:\.\d{3})+|\d+)(?:,\d{1,2})?)(?![\d.,])/gi,
    ),
  ];
  if (matches.length !== 1) throw new BeloValidationError('AMBIGUOUS_AMOUNT');
  const [whole, fraction = ''] = matches[0][1].replaceAll('.', '').split(',');
  const amountCents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  if (
    !Number.isSafeInteger(amountCents) ||
    amountCents <= 0 ||
    amountCents > 2147483647
  )
    throw new BeloValidationError('AMOUNT_RANGE');
  return {
    importId: createHash('sha256').update(m.messageId).digest('hex'),
    gmailMessageId: m.gmailMessageId,
    amountCents,
    occurredAt,
  };
}
