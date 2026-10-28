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
function syncBelo() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return;
  try {
    const s = settings_();
    const prior = s.p.getProperty('BELO_SCAN');
    const scan = prior ? JSON.parse(prior) : { after: Math.max(s.start, Number(s.p.getProperty('BELO_CURSOR') || s.start) - 86400000), before: Date.now(), pageToken: null };
    const query = 'from:transaction@belo.app after:' + Math.floor(scan.after / 1000) + ' before:' + Math.ceil(scan.before / 1000);
    const options = { q: query, maxResults: 25 };
    if (scan.pageToken) options.pageToken = scan.pageToken;
    let page;
    try { page = Gmail.Users.Messages.list('me', options); }
    catch (error) { s.p.deleteProperty('BELO_SCAN'); throw new Error('No se pudo leer Gmail; se reintentará desde el último recorrido completo.'); }
    let accepted = 0, ignored = 0, review = 0;
    (page.messages || []).forEach(function(item) {
      const m = Gmail.Users.Messages.get('me', item.id, { format: 'full' });
      if (Number(m.internalDate) < s.start) { ignored++; return; }
      const headers = m.payload.headers || [];
      function header(name) { const h = headers.find(function(h) { return h.name.toLowerCase() === name.toLowerCase(); }); return h ? h.value : ''; }
      const from = header('From').trim();
      if (!/^(?:[^<>]*<)?transaction@belo\.app>?$/i.test(from)) { ignored++; return; }
      const subject = header('Subject');
      if (!/^Aviso de operaci[oó]n\s*[-–]/i.test(subject)) { ignored++; return; }
      let text;
      try { text = plainText_(m.payload); }
      catch (error) { failure_(s.p, item.id, 'No se pudo decodificar el cuerpo del correo'); review++; return; }
      if (!/Dep[oó]sito exitoso/i.test(text)) { ignored++; return; }
      // Google's result, not the display name or a forwarded From line.
      const auth = header('Authentication-Results');
      const authenticated = /^mx\.google\.com;/i.test(auth) && /\bdmarc=pass\b[^;]*\bheader\.from=belo\.app(?=\s|;|$)/i.test(auth);
      if (!authenticated || !header('Message-ID') || !text || text.length > 20000) { failure_(s.p, item.id, 'Autenticación o formato no reconocido'); review++; return; }
      const body = JSON.stringify({ gmailMessageId: item.id, messageId: header('Message-ID'), sender: 'transaction@belo.app', subject: subject, text: text, receivedAt: new Date(Number(m.internalDate)).toISOString(), authenticated: true });
      const timestamp = String(Date.now());
      const signature = Utilities.computeHmacSha256Signature(timestamp + '.' + body, s.secret, Utilities.Charset.UTF_8).map(function(b) { return ('0' + ((b + 256) % 256).toString(16)).slice(-2); }).join('');
      const response = UrlFetchApp.fetch(s.url + '/api/integrations/belo', { method: 'post', contentType: 'application/json', payload: body, headers: { 'x-belo-timestamp': timestamp, 'x-belo-signature': signature }, muteHttpExceptions: true, followRedirects: false });
      const code = response.getResponseCode();
      if (code === 200 || code === 201) { accepted++; return; }
      if (code === 422) { failure_(s.p, item.id, 'Aviso rechazado: revisar importe, moneda o fecha'); review++; return; }
      throw new Error('BOOSTIFY respondió HTTP ' + code + '. No se avanza la página; se reintentará sin duplicar.');
    });
    if (page.nextPageToken) { scan.pageToken = page.nextPageToken; s.p.setProperty('BELO_SCAN', JSON.stringify(scan)); }
    else { s.p.setProperty('BELO_CURSOR', String(scan.before)); s.p.deleteProperty('BELO_SCAN'); }
    console.log('Aceptados o ya importados: ' + accepted + '. Ignorados: ' + ignored + '. Para revisar: ' + review + '. Otra página: ' + Boolean(page.nextPageToken));
  } finally { lock.releaseLock(); }
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
// Gmail may omit base64 padding; Apps Script's decoder is stricter than Node's.
function decodeBody_(value) {
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
  if (!list.some(function(x) { return x.id === id; })) list.push({ id: id, reason: reason });
  properties.setProperty('BELO_REVIEW', JSON.stringify(list.slice(-50)));
}
function showBeloReview() {
  console.log(PropertiesService.getScriptProperties().getProperty('BELO_REVIEW') || '[]');
}
