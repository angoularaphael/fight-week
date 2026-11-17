import { json, route } from '../lib/http.js';
import { paymentMode } from '../lib/env.js';

export default route(['GET', 'HEAD'], async (req, res) => json(res, 200, { ok: true, mode: paymentMode() }));
