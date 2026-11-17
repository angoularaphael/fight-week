/** Travail apres reponse (mail) : waitUntil sur Vercel, sinon en tache de fond. */
import { waitUntil } from '@vercel/functions';

export function after(promiseFactory, label = 'after') {
  const p = Promise.resolve()
    .then(promiseFactory)
    .catch((err) => console.error(`[${label}]`, err?.message || err));
  try {
    waitUntil(p);
  } catch {
    /* hors Vercel : la promesse continue seule */
  }
  return p;
}
