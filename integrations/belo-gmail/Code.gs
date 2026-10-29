/** BOOSTIFY: read-only Gmail ingestion. Secrets belong in Script Properties, never here. */
function settings_() {
  const p = PropertiesService.getScriptProperties();
  const url = p.getProperty('BOOSTIFY_URL');
  const secret = p.getProperty('BELO_WEBHOOK_SECRET');
  const start = p.getProperty('BELO_IMPORT_START_AT');
  if (!url || !/^https:\/\/[a-z0-9.-]+$/.test(url) || !secret || secret.length < 32 || !start || isNaN(Date.parse(start)) || p.getProperty('BELO_IMPORT_CURRENCY') !== 'ARS') throw new Error('Completá las propiedades URL, secreto, inicio y moneda ARS.');
  return { p: p, url: url, secret: secret, start: Date.parse(start) };
}
function setupBelo() {
  settings_();
  Gmail.Users.Messages.list('me', { maxResults: 1, q: 'from:transaction@belo.app' });
  ScriptApp.getProjectTriggers().filter(function(t) { return t.getHandlerFunction() === 'syncBelo'; }).forEach(function(t) { ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('syncBelo').timeBased().everyMinutes(5).create();
  console.log('Activado: revisión cada 5 minutos. Ejecutá syncBelo para la primera revisión.');
}
function stopBelo() {
  ScriptApp.getProjectTriggers().filter(function(t) { return t.getHandlerFunction() === 'syncBelo'; }).forEach(function(t) { ScriptApp.deleteTrigger(t); });
  console.log('Sincronización detenida. Los datos existentes se conservan.');
}
// Epoch seconds avoid Gmail's calendar-date (Pacific time) interpretation.
function scanQuery_(scan) {
  return 'from:transaction@belo.app after:' + (Math.floor(scan.after / 1000) - 1) + ' before:' + Math.ceil(scan.before / 1000);
}
function requestBelo_(s, input) {
  const body = JSON.stringify(input);
  const timestamp = String(Date.now());
  const signature = Utilities.computeHmacSha256Signature(timestamp + '.' + body, s.secret, Utilities.Charset.UTF_8).map(function(b) { return ('0' + ((b + 256) % 256).toString(16)).slice(-2); }).join('');
  const response = UrlFetchApp.fetch(s.url + '/api/integrations/belo', { method: 'post', contentType: 'application/json', payload: body, headers: { 'x-belo-timestamp': timestamp, 'x-belo-signature': signature }, muteHttpExceptions: true, followRedirects: false });
  let data = {};
  try { data = JSON.parse(response.getContentText()); } catch (error) { /* Never log remote bodies. */ }
  return { code: response.getResponseCode(), data: data };
}
function readDeposit_(s, id) {
  const m = Gmail.Users.Messages.get('me', id, { format: 'full' });
  if (!m.payload || !Number.isFinite(Number(m.internalDate))) throw new Error('MESSAGE_FORMAT');
  if (Number(m.internalDate) < s.start) return { ignored: true };
  const headers = m.payload.headers || [];
  function header(name) { const h = headers.find(function(h) { return h.name.toLowerCase() === name.toLowerCase(); }); return h ? h.value : ''; }
  if (!/^(?:[^<>]*<)?transaction@belo\.app>?$/i.test(header('From').trim())) return { ignored: true };
  if (!/^Aviso de operaci[oó]n\s*[-–]/i.test(header('Subject'))) return { ignored: true };
  let text;
  try { text = plainText_(m.payload); } catch (error) { throw new Error('BODY_DECODE'); }
  if (!/Dep[oó]sito exitoso/i.test(text)) {
    if (/Retiro exitoso|Retiraste/i.test(text)) return { ignored: true };
    throw new Error('DEPOSIT_TEMPLATE');
  }
  const auth = header('Authentication-Results');
  const authenticated = /^mx\.google\.com;/i.test(auth) && /\bdmarc=pass\b[^;]*\bheader\.from=belo\.app(?=\s|;|$)/i.test(auth);
  if (!authenticated) throw new Error('DMARC_FAILED');
  if (!header('Message-ID') || !text || text.length > 20000) throw new Error('MESSAGE_FORMAT');
  return { message: { gmailMessageId: id, messageId: header('Message-ID'), sender: 'transaction@belo.app', subject: header('Subject'), text: text, receivedAt: new Date(Number(m.internalDate)).toISOString(), authenticated: true } };
}
function safeReason_(error) {
  const code = error && error.message;
  return ['MESSAGE_FORMAT', 'BODY_DECODE', 'DEPOSIT_TEMPLATE', 'DMARC_FAILED'].indexOf(code) >= 0 ? code : 'GMAIL_READ_FAILED';
}
function sendDeposit_(s, id, message) {
  const response = requestBelo_(s, message);
  if ((response.code === 200 && response.data.status === 'duplicate') || (response.code === 201 && response.data.status === 'created')) {
    clearFailure_(s.p, id);
    return response.data.status;
  }
  if (response.code === 422) {
    const reason = rejectionReason_(response.data.reason);
    failure_(s.p, id, 'Aviso rechazado: ' + reason);
    return 'review';
  }
  throw new Error('BOOSTIFY respondió HTTP ' + response.code + '. No se avanza la página; se reintentará sin duplicar.');
}
function rejectionReason_(code) {
  return ['INVALID_MESSAGE', 'RECEIVED_OUTSIDE_WINDOW', 'SUBJECT_FORMAT', 'INVALID_TIME', 'INVALID_DATE', 'BEFORE_ACTIVATION', 'DATE_INCONSISTENT', 'NOT_ARS_DEPOSIT', 'AMBIGUOUS_AMOUNT', 'AMOUNT_RANGE'].indexOf(code) >= 0 ? code : 'UNRECOGNIZED_NOTICE';
}
function syncBelo() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) { console.log(JSON.stringify({ event: 'belo.lock_busy' })); return; }
  try {
    const s = settings_();
    const deadline = Date.now() + 180000;
    // Failed notices remain queued independently of the 24-hour scan overlap.
    // Legacy entries require the explicit preview/recovery procedure first.
    const retryQueue = JSON.parse(s.p.getProperty('BELO_REVIEW') || '[]').filter(function(x) { return x.retry === true; });
    const offset = Number(s.p.getProperty('BELO_RETRY_OFFSET') || 0) % Math.max(1, retryQueue.length);
    const retry = retryQueue.slice(offset).concat(retryQueue.slice(0, offset)).slice(0, 5);
    s.p.setProperty('BELO_RETRY_OFFSET', String((offset + retry.length) % Math.max(1, retryQueue.length)));
    retry.forEach(function(entry) {
      let candidate;
      try { candidate = readDeposit_(s, entry.id); }
      catch (error) { failure_(s.p, entry.id, safeReason_(error)); return; }
      if (!candidate.ignored) sendDeposit_(s, entry.id, candidate.message);
    });
    let pages = 0;
    let accepted = 0, ignored = 0, review = 0;
    let more = true;
    while (pages < 4 && Date.now() < deadline) {
      const prior = s.p.getProperty('BELO_SCAN');
      const scan = prior ? JSON.parse(prior) : { after: Math.max(s.start, Number(s.p.getProperty('BELO_CURSOR') || s.start) - 86400000), before: Date.now(), pageToken: null };
      if (!Number.isFinite(scan.after) || !Number.isFinite(scan.before) || scan.after < s.start || scan.before < scan.after) throw new Error('SCAN_STATE_INVALID: conservar propiedades y revisar configuración.');
      const options = { q: scanQuery_(scan), maxResults: 25 };
      if (scan.pageToken) options.pageToken = scan.pageToken;
      let page;
      try { page = Gmail.Users.Messages.list('me', options); }
      catch (error) { s.p.deleteProperty('BELO_SCAN'); throw new Error('No se pudo leer Gmail; se reintentará desde el último recorrido completo.'); }
      (page.messages || []).forEach(function(item) {
        const legacy = JSON.parse(s.p.getProperty('BELO_REVIEW') || '[]').find(function(x) { return x.id === item.id && x.retry !== true; });
        if (legacy) { review++; return; }
        let candidate;
        try { candidate = readDeposit_(s, item.id); }
        catch (error) { failure_(s.p, item.id, safeReason_(error)); review++; return; }
        if (candidate.ignored) { ignored++; return; }
        const status = sendDeposit_(s, item.id, candidate.message);
        if (status === 'review') review++; else accepted++;
      });
      more = Boolean(page.nextPageToken);
      reportBeloSync_(s, !more);
      if (more) { scan.pageToken = page.nextPageToken; s.p.setProperty('BELO_SCAN', JSON.stringify(scan)); }
      else { s.p.setProperty('BELO_CURSOR', String(scan.before)); s.p.deleteProperty('BELO_SCAN'); }
      pages++;
      if (!more) break;
    }
    console.log(JSON.stringify({ event: 'belo.scan', acceptedOrDuplicate: accepted, ignored: ignored, review: review, pages: pages, more: more, timezone: 'America/Argentina/Cordoba' }));
  } finally { lock.releaseLock(); }
}
// Only queued IDs: no mailbox-wide historical recovery, no financial writes.
function previewBeloReview() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) throw new Error('Esperá a que termine syncBelo.');
  try {
    const s = settings_();
    s.p.deleteProperty('BELO_RECOVERY_PLAN');
    const pending = JSON.parse(s.p.getProperty('BELO_REVIEW') || '[]');
    if (pending.length > 10) throw new Error('Más de 10 pendientes: revisar un lote limitado antes de recuperar.');
    const plan = [];
    pending.forEach(function(entry) {
      let candidate;
      try { candidate = readDeposit_(s, entry.id); }
      catch (error) { console.log(JSON.stringify({ id: entry.id, status: 'blocked', reason: safeReason_(error) })); return; }
      if (candidate.ignored) { console.log(JSON.stringify({ id: entry.id, status: 'blocked', reason: 'NOT_ELIGIBLE' })); return; }
      const response = requestBelo_(s, { kind: 'preview', message: candidate.message });
      if (response.code === 422) { console.log(JSON.stringify({ id: entry.id, status: 'blocked', reason: rejectionReason_(response.data.reason) })); return; }
      if (response.code !== 200 || ['eligible', 'duplicate'].indexOf(response.data.status) < 0) throw new Error('Vista previa no disponible. No se guardó ningún ingreso.');
      const row = { id: entry.id, status: response.data.status, importId: response.data.importId, amountCents: response.data.amountCents, occurredAt: response.data.occurredAt };
      plan.push(row);
      console.log(JSON.stringify(row));
    });
    s.p.setProperty('BELO_RECOVERY_PLAN', JSON.stringify({ expiresAt: Date.now() + 1800000, items: plan }));
    console.log('Vista previa: no se guardaron ingresos. Revisá fechas/importes antes de ejecutar recoverBeloReview. El plan vence en 30 minutos.');
  } finally { lock.releaseLock(); }
}
function recoverBeloReview() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) throw new Error('Esperá a que termine syncBelo.');
  try {
    const s = settings_();
    const raw = s.p.getProperty('BELO_RECOVERY_PLAN');
    const plan = raw ? JSON.parse(raw) : null;
    if (!plan || plan.expiresAt < Date.now() || !Array.isArray(plan.items) || plan.items.length > 10) throw new Error('Ejecutá y revisá previewBeloReview primero.');
    let accepted = 0;
    plan.items.forEach(function(item) {
      if (!JSON.parse(s.p.getProperty('BELO_REVIEW') || '[]').some(function(x) { return x.id === item.id; })) return;
      const candidate = readDeposit_(s, item.id);
      if (candidate.ignored) throw new Error('El aviso cambió: repetir vista previa.');
      const response = requestBelo_(s, { kind: 'preview', message: candidate.message });
      if (response.code !== 200 || ['eligible', 'duplicate'].indexOf(response.data.status) < 0 || response.data.importId !== item.importId || response.data.amountCents !== item.amountCents || response.data.occurredAt !== item.occurredAt) throw new Error('La validación cambió: repetir vista previa. No se acredita este aviso.');
      if (sendDeposit_(s, item.id, candidate.message) !== 'review') accepted++;
    });
    reportBeloSync_(s, !s.p.getProperty('BELO_SCAN'));
    s.p.deleteProperty('BELO_RECOVERY_PLAN');
    console.log(JSON.stringify({ event: 'belo.recovery', acceptedOrDuplicate: accepted }));
  } finally { lock.releaseLock(); }
}
function diagnoseBeloSchedule() {
  const handlers = ScriptApp.getProjectTriggers().filter(function(t) { return t.getHandlerFunction() === 'syncBelo'; });
  console.log(JSON.stringify({ event: 'belo.schedule', triggers: handlers.length, expectedMinutes: 5, note: 'La frecuencia real y los fallos se verifican en Ejecuciones de Apps Script.' }));
}
function plainText_(part) {
  const plain = mimeParts_(part, 'text/plain');
  if (plain.length) return plain.join('\n');
  return mimeParts_(part, 'text/html').map(function(html) {
    const entities = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', aacute: 'á', eacute: 'é', iacute: 'í', oacute: 'ó', uacute: 'ú', ntilde: 'ñ' };
    return html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]*>/g, ' ').replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, function(full, code) {
      if (code[0] === '#') { const point = code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10); return point <= 0x10ffff ? String.fromCodePoint(point) : full; }
      return entities[code.toLowerCase()] || full;
    });
  }).join('\n');
}
function mimeParts_(part, mime) {
  if (part.mimeType === 'message/rfc822') return [];
  if (part.mimeType === mime && part.body && part.body.data) return [decodeBody_(part.body.data)];
  return (part.parts || []).reduce(function(result, child) { return result.concat(mimeParts_(child, mime)); }, []);
}
// Advanced Gmail can return decoded signed byte arrays; REST returns Base64 strings.
function decodeBody_(value) {
  if (Array.isArray(value)) {
    if (!value.every(function(b) { return Number.isInteger(b) && b >= -128 && b <= 255; })) throw new Error('Bytes de correo no válidos');
    const bytes = value.map(function(b) { return b > 127 ? b - 256 : b; });
    return Utilities.newBlob(bytes).getDataAsString('UTF-8');
  }
  if (typeof value !== 'string') throw new Error('Cuerpo de correo no válido');
  const normalized = value.replace(/\s/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  if (!/^[A-Za-z0-9_-]*={0,2}$/.test(normalized)) throw new Error('Base64 no válido');
  const data = normalized.replace(/=+$/, '');
  if (data.length % 4 === 1) throw new Error('Base64 incompleto');
  const padded = data + '='.repeat((4 - data.length % 4) % 4);
  return Utilities.newBlob(Utilities.base64DecodeWebSafe(padded)).getDataAsString('UTF-8');
}
function failure_(properties, id, reason) {
  const list = JSON.parse(properties.getProperty('BELO_REVIEW') || '[]');
  const existing = list.find(function(x) { return x.id === id; });
  if (existing) existing.reason = reason;
  else {
    if (list.length >= 50) throw new Error('REVIEW_QUEUE_FULL: no se avanza el cursor; revisar pendientes.');
    list.push({ id: id, reason: reason, retry: true });
  }
  const serialized = JSON.stringify(list);
  if (serialized.length > 8000) throw new Error('REVIEW_QUEUE_FULL: no se avanza el cursor.');
  properties.setProperty('BELO_REVIEW', serialized);
}
function clearFailure_(properties, id) {
  const list = JSON.parse(properties.getProperty('BELO_REVIEW') || '[]');
  properties.setProperty('BELO_REVIEW', JSON.stringify(list.filter(function(x) { return x.id !== id; })));
}
function showBeloReview() {
  console.log(PropertiesService.getScriptProperties().getProperty('BELO_REVIEW') || '[]');
}
// Read-only diagnosis: reports format and success flags, never email contents or secrets.
function diagnoseBelo() {
  const s = settings_();
  const pending = JSON.parse(s.p.getProperty('BELO_REVIEW') || '[]').slice(-3);
  if (!pending.length) { console.log('No hay correos pendientes para diagnosticar.'); return; }
  pending.forEach(function(entry) {
    const message = Gmail.Users.Messages.get('me', entry.id, { format: 'full' });
    const report = [];
    function visit(part) {
      if (part.mimeType === 'text/plain' || part.mimeType === 'text/html') {
        const value = part.body && part.body.data;
        const row = { mime: part.mimeType, type: typeof value, array: Array.isArray(value), length: typeof value === 'string' ? value.length : null };
        if (typeof value === 'string') {
          const compact = value.replace(/\s/g, '');
          row.base64Alphabet = /^[A-Za-z0-9_+\/-]*={0,2}$/.test(compact);
          row.remainder = compact.replace(/=+$/, '').length % 4;
          row.alreadyText = /Tu cuenta de belo|Dep[oó]sito exitoso/i.test(value);
          const data = compact.replace(/=+$/, '');
          const padded = data + '='.repeat((4 - data.length % 4) % 4);
          function attempt(fn) {
            try { const bytes = fn(); const text = Utilities.newBlob(bytes).getDataAsString('UTF-8'); return { decoded: true, depositTemplate: /Tu cuenta de belo|Dep[oó]sito exitoso/i.test(text) }; }
            catch (error) { return { decoded: false }; }
          }
          row.webSafePadded = attempt(function() { return Utilities.base64DecodeWebSafe(padded.replace(/\+/g, '-').replace(/\//g, '_')); });
          row.webSafeUnpadded = attempt(function() { return Utilities.base64DecodeWebSafe(data.replace(/\+/g, '-').replace(/\//g, '_')); });
          row.standardPadded = attempt(function() { return Utilities.base64Decode(padded.replace(/-/g, '+').replace(/_/g, '/')); });
        }
        report.push(row);
      }
      (part.parts || []).forEach(visit);
    }
    visit(message.payload);
    console.log(JSON.stringify({ bodyFormats: report }));
  });
}

// Reports successful mailbox checks even when no deposit emails were found.
function reportBeloSync_(settings, complete) {
  const pending = JSON.parse(settings.p.getProperty('BELO_REVIEW') || '[]').length;
  const response = requestBelo_(settings, { kind: 'sync', complete: complete, pendingReviewCount: pending });
  if (response.code !== 200 || response.data.status !== 'sync-recorded') throw new Error('No se pudo registrar la hora de revisión (HTTP ' + response.code + '). Se reintentará sin duplicar cobros.');
}
