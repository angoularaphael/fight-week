import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

process.env.GALA_NO_DOTENV = '1';
process.env.POW_BITS = '12';
const { issueChallenge, checkChallenge } = await import('../lib/pow.js');

function runWorker(data) {
  const src = readFileSync(new URL('../public/pow-worker.js', import.meta.url), 'utf8');
  let out = null;
  const self = { postMessage: (m) => (out = m) };
  vm.runInNewContext(src, { self, TextEncoder, Uint8Array, Uint32Array, Math, Date, String });
  self.onmessage({ data });
  return out;
}

test('le worker navigateur produit une PoW acceptee par le serveur', () => {
  const { challenge, difficulty } = issueChallenge('checkout');
  const out = runWorker({ challenge, difficulty });
  assert.ok(out.nonce, JSON.stringify(out));
  assert.ok(checkChallenge({ challenge, nonce: out.nonce }, 'checkout'));
});
