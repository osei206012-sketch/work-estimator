import { json, normEmail, validEmail, paystack, applyCharge, publicSub, signToken } from '../lib/shared.mjs';

export default async (req) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  let body;
  try { body = await req.json(); } catch { return json({ error: 'Bad request' }, 400); }

  const email = normEmail(body.email);
  const reference = String(body.reference || '').trim();
  if (!validEmail(email) || !/^[\w.\-=]{4,100}$/.test(reference)) {
    return json({ error: 'Enter a valid email and payment reference.' }, 400);
  }

  const r = await paystack('/transaction/verify/' + encodeURIComponent(reference));
  if (!r.ok || !r.data.status || !r.data.data) {
    return json({ error: 'Payment could not be verified with Paystack.' }, 402);
  }
  const tx = r.data.data;
  if (normEmail(tx.customer?.email) !== email) {
    return json({ error: 'This payment was made with a different email address.' }, 403);
  }
  const sub = await applyCharge(tx, { strict: true });
  if (!sub) return json({ error: 'This is not a successful Work Estimator subscription payment.' }, 402);

  return json({ token: signToken(email), ...publicSub(sub) });
};

export const config = { path: '/api/verify-payment' };
