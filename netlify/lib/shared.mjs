import { createHmac, timingSafeEqual } from 'node:crypto';
import { getStore } from '@netlify/blobs';

/* ---- subscription rules (change here if you change the price) ---- */
export const PLAN_AMOUNT = 15000;      // GH₵150 in pesewas
export const PLAN_CURRENCY = 'GHS';
export const PERIOD_MS = 32 * 24 * 60 * 60 * 1000; // 1 month + 2 days grace
const TOKEN_TTL_MS = 180 * 24 * 60 * 60 * 1000;

export const env = (k) =>
  (globalThis.Netlify ? globalThis.Netlify.env.get(k) : process.env[k]) || '';

export const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });

export const normEmail = (e) => String(e || '').trim().toLowerCase();
export const validEmail = (e) => e.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e);

/* ---- storage (Netlify Blobs) ---- */
const subKey = (email) => 'sub:' + encodeURIComponent(email);
const db = () => getStore('subscriptions');

export async function getSub(email) {
  return (await db().get(subKey(email), { type: 'json' })) || null;
}
export async function saveSub(sub) {
  sub.updated = Date.now();
  await db().setJSON(subKey(sub.email), sub);
  return sub;
}
export const publicSub = (s) => ({
  active: !!s && (s.paidUntil || 0) > Date.now(),
  paidUntil: s?.paidUntil || 0,
  status: s?.status || 'none',
});

/* ---- signed login token (proves the browser paid for this email) ---- */
const sign = (body, secret) => createHmac('sha256', secret).update(body).digest('base64url');

export function signToken(email) {
  const secret = env('TOKEN_SECRET');
  if (!secret) throw new Error('TOKEN_SECRET is not set');
  const body = Buffer.from(JSON.stringify({ e: email, x: Date.now() + TOKEN_TTL_MS })).toString('base64url');
  return body + '.' + sign(body, secret);
}

/** Returns the email inside a valid Bearer token, or null. */
export function emailFromRequest(req) {
  const secret = env('TOKEN_SECRET');
  const h = req.headers.get('authorization') || '';
  const [body, sig] = (h.startsWith('Bearer ') ? h.slice(7) : '').split('.');
  if (!secret || !body || !sig) return null;
  const a = Buffer.from(sig);
  const b = Buffer.from(sign(body, secret));
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString());
    return p.e && p.x > Date.now() ? p.e : null;
  } catch {
    return null;
  }
}

/* ---- Paystack API (uses the SECRET key, server only) ---- */
export async function paystack(path, { method = 'GET', body } = {}) {
  const r = await fetch('https://api.paystack.co' + path, {
    method,
    headers: {
      Authorization: 'Bearer ' + env('PAYSTACK_SECRET_KEY'),
      'content-type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { ok: r.ok, status: r.status, data: await r.json().catch(() => ({})) };
}

export const planCodeOf = (tx) =>
  tx?.plan_object?.plan_code || tx?.plan?.plan_code || (typeof tx?.plan === 'string' ? tx.plan : '') || '';

/** Is this transaction one of OUR subscription payments (not some other product)? */
function isOurs(tx, existing) {
  const plan = env('PAYSTACK_PLAN_CODE');
  if (plan && planCodeOf(tx) === plan) return true;
  if (tx?.metadata?.app === 'work-estimator') return true;
  return !!existing; // renewals from a known subscriber
}

/**
 * Turns a successful Paystack transaction into subscription access.
 * Safe to call twice for the same reference (verify + webhook both do).
 * Returns the subscription record, or null if the payment does not qualify.
 */
export async function applyCharge(tx, { strict }) {
  if (!tx || tx.status !== 'success') return null;
  if (tx.currency !== PLAN_CURRENCY || Number(tx.amount) < PLAN_AMOUNT) return null;
  const email = normEmail(tx.customer?.email);
  const ref = String(tx.reference || '');
  if (!validEmail(email) || !ref) return null;

  const existing = await getSub(email);
  if (!isOurs(tx, strict ? null : existing)) return null;

  const sub = existing || { email, paidUntil: 0, status: 'none', refs: [] };
  if (!sub.refs.includes(ref)) {
    const paidAt = Date.parse(tx.paid_at || tx.paidAt || '') || Date.now();
    sub.paidUntil = Math.max(sub.paidUntil || 0, paidAt + PERIOD_MS);
    sub.refs = [...sub.refs, ref].slice(-24);
    sub.status = 'active';
    await saveSub(sub);
  }
  return sub;
}
