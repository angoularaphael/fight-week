// Preuve de travail cote navigateur : defi demande au serveur puis resolu
// dans un Web Worker, en tache de fond pendant la saisie du formulaire.
const cache = new Map();

async function fetchChallenge(scope) {
  const res = await fetch(`/api/pow?scope=${encodeURIComponent(scope)}`, { cache: 'no-store' });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.challenge) throw new Error(data.error || 'Verification indisponible, rechargez la page.');
  return data;
}

function solve({ challenge, difficulty }) {
  return new Promise((resolve, reject) => {
    const worker = new Worker('/pow-worker.js');
    worker.onmessage = (ev) => {
      worker.terminate();
      if (ev.data?.nonce) resolve({ challenge, nonce: ev.data.nonce });
      else reject(new Error('Verification impossible, rechargez la page.'));
    };
    worker.onerror = () => {
      worker.terminate();
      reject(new Error('Verification impossible sur ce navigateur.'));
    };
    worker.postMessage({ challenge, difficulty });
  });
}

/** Lance (ou reutilise) la resolution d'une PoW pour un scope. */
export function prepare(scope) {
  if (!cache.has(scope)) {
    const p = fetchChallenge(scope).then(solve);
    p.catch(() => cache.delete(scope));
    cache.set(scope, p);
  }
  return cache.get(scope);
}

/** Recupere une PoW prete puis l'oublie (usage unique) et en prepare une autre. */
export async function take(scope) {
  const pow = await prepare(scope);
  cache.delete(scope);
  return pow;
}
