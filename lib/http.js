export function json(res, status, payload, headers = {}) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
  res.end(JSON.stringify(payload));
}

const MAX_BODY = 64 * 1024;

/** Lit le corps brut (necessaire aux webhooks) et le JSON. */
export async function readRawBody(req) {
  if (typeof req.rawBody === 'string') return req.rawBody;
  if (req.body !== undefined && req.body !== null) {
    if (Buffer.isBuffer(req.body)) return req.body.toString('utf8');
    if (typeof req.body === 'string') return req.body;
    return JSON.stringify(req.body);
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) throw Object.assign(new Error('Corps trop gros'), { status: 413 });
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

export async function readBody(req) {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body;
  const raw = await readRawBody(req);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function queryOf(req) {
  try {
    const url = new URL(req.url || '/', 'http://localhost');
    return Object.fromEntries(url.searchParams.entries());
  } catch {
    return {};
  }
}

export function methodOf(req) {
  return String(req.method || 'GET').toUpperCase();
}

export function header(req, name) {
  const h = req.headers || {};
  const v = h[name.toLowerCase()] ?? h[name];
  return Array.isArray(v) ? v[0] : v ? String(v) : '';
}

/** IP client derriere Vercel (premier element de x-forwarded-for). */
export function clientIp(req) {
  const xff = header(req, 'x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  return header(req, 'x-real-ip') || req.socket?.remoteAddress || '0.0.0.0';
}

export function httpError(status, message, code) {
  return Object.assign(new Error(message), { status, code });
}

/** Enveloppe commune : methode, erreurs, 5xx sans fuite de detail interne. */
export function route(methods, fn) {
  return async function handler(req, res) {
    if (!methods.includes(methodOf(req))) return json(res, 405, { ok: false, error: 'Methode non autorisee' });
    try {
      return await fn(req, res);
    } catch (err) {
      const status = Number(err?.status) || 500;
      if (status >= 500) console.error('[api]', req.url, err?.stack || err);
      const message = status >= 500 ? 'Erreur interne, reessayez dans un instant.' : err.message;
      return json(res, status, { ok: false, error: message, code: err?.code || undefined });
    }
  };
}
