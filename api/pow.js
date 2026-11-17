import { getDb } from '../lib/db.js';
import { json, queryOf, route } from '../lib/http.js';
import { issueChallenge } from '../lib/pow.js';
import { enforceRate } from '../lib/ratelimit.js';

export default route(['GET'], async (req, res) => {
  const db = getDb();
  await enforceRate(db, req, 'pow');
  const scope = String(queryOf(req).scope || 'checkout');
  return json(res, 200, { ok: true, ...issueChallenge(scope) });
});
