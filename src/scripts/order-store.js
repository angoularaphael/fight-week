// Jetons de commande gardes sur l'appareil (jamais dans une URL).
const KEY = 'ff_orders';

function read() {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '{}') || {};
  } catch {
    return {};
  }
}

export function saveOrderToken(ref, token) {
  try {
    const all = read();
    all[ref] = { token, at: Date.now() };
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    /* stockage indisponible : le mail suffit */
  }
  try {
    sessionStorage.setItem(`${KEY}:${ref}`, token);
  } catch {
    /* ignore */
  }
}

export function orderToken(ref) {
  try {
    const s = sessionStorage.getItem(`${KEY}:${ref}`);
    if (s) return s;
  } catch {
    /* ignore */
  }
  return read()[ref]?.token || null;
}
