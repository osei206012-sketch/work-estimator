import { createHmac, timingSafeEqual } from 'node:crypto';
import { env, normEmail, validEmail, getSub, saveSub, applyCharge, planCodeOf } from '../lib/shared.mjs';

function signatureOk(raw, sig) {
  const secret = env('PAYSTACK_SECRET_KEY');
  if (!secret || !sig) return false;
  const good = createHmac('sha512', secret).update(raw).digest('hex');
  const a = Buffer.from(sig), b = Buffer.from(good);
  return a.length === b.length && timingSafeEqual(a, b);
}

const ourPlan = (data) => {
  const want = env('PAYSTACK_PLAN_CODE'), got = planCodeOf(data);
  return !want || !got || got === want;
};

async function patch(email, fields) {
  if (!validEmail(email)) return;
  const sub = (await getSub(email)) || { email, paidUntil: 0, status: 'none', refs: [] };
  Object.assign(sub, fields);
  await saveSub(sub);
}

export default async (req) => {
  const raw = await req.text();
  if (!signatureOk(raw, req.headers.get('x-paystack-signature'))) {
    return new Response('Invalid signature', { status: 401 });
  }
  let event;
  try { event = JSON.parse(raw); } catch { return new Response('Bad JSON', { status: 400 }); }
  const data = event.data || {};
  const email = normEmail(data.customer?.email);

  try {
    switch (event.event) {
      case 'charge.success':
        await applyCharge(data, { strict: false });
        break;
      case 'subscription.create':
        if (ourPlan(data)) await patch(email, { subscriptionCode: data.subscription_code, emailToken: data.email_token });
        break;
      case 'subscription.disable':
      case 'subscription.not_renew':
        if (ourPlan(data)) await patch(email, { status: 'cancelled' });
        break;
      case 'invoice.payment_failed':
        if (ourPlan(data)) await patch(email, { status: 'past_due' });
        break;
    }
  } catch (e) {
    console.error('webhook error', e);
    return new Response('Error', { status: 500 }); // Paystack will retry
  }
  return new Response('ok', { status: 200 });
};

export const config = { path: '/api/paystack-webhook' };
