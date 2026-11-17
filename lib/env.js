import './load-env.js';

export function env(name, fallback = '') {
  const v = process.env[name];
  return v === undefined || v === null || v === '' ? fallback : String(v).trim();
}

export function onVercelProd() {
  return env('VERCEL_ENV') === 'production';
}

/** 'live' ou 'test'. En test, les cles *_TEST_* sont utilisees. */
export function paymentMode() {
  const m = env('GALA_PAYMENT_MODE', 'test').toLowerCase();
  return m === 'live' ? 'live' : 'test';
}

export function isLive() {
  return paymentMode() === 'live';
}

/** Lit une variable de paiement selon le mode : X ou X en version _TEST. */
export function paymentVar(name) {
  if (isLive()) return env(name);
  return env(name.replace(/^(PAYPLUG|PAYPAL)_/, '$1_TEST_'));
}

export function publicUrl() {
  return env('PUBLIC_SITE_URL', 'https://gala.boxingcenter.fr').replace(/\/+$/, '');
}

/** Secret obligatoire : en prod, absent = erreur ; en local, valeur de dev. */
export function secret(name) {
  const v = env(name);
  if (v) return v;
  if (env('VERCEL') === '1') throw Object.assign(new Error(`${name} manquant`), { status: 500 });
  return `dev-only-${name}`;
}

export function salesOpen() {
  return env('GALA_SALES_OPEN') === '1';
}
