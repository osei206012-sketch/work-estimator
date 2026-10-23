import { json, env, emailFromRequest, getSub, saveSub, publicSub, paystack } from '../lib/shared.mjs';

export default async (req) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const email = emailFromRequest(req);
  if (!email) return json({ error: 'Not signed in' }, 401);
  const sub = await getSub(email);
  if (!sub) return json({ error: 'No subscription found' }, 404);

  let code = sub.subscriptionCode, token = sub.emailToken;
  if (!code || !token) {
    // Look the subscription up at Paystack by customer email.
    const c = await paystack('/customer/' + encodeURIComponent(email));
    const plan = env('PAYSTACK_PLAN_CODE');
    const found = (c.data?.data?.subscriptions || []).find(
      (s) => s.status === 'active' && (!plan || s.plan_code === plan || s.plan?.plan_code === plan)
    );
    if (found) {
      const d = await paystack('/subscription/' + encodeURIComponent(found.subscription_code));
      code = found.subscription_code;
      token = d.data?.data?.email_token;
    }
  }
  if (!code || !token) {
    // e.g. mobile-money payers: there is no auto-renewal to cancel.
    sub.status = 'cancelled';
    await saveSub(sub);
    return json({ ...publicSub(sub), note: 'No automatic renewal was found, so nothing more will be charged.' });
  }

  const r = await paystack('/subscription/disable', { method: 'POST', body: { code, token } });
  if (!r.ok) return json({ error: 'Paystack could not cancel the subscription. Try again.' }, 502);
  sub.status = 'cancelled';
  sub.subscriptionCode = code;
  sub.emailToken = token;
  await saveSub(sub);
  return json(publicSub(sub));
};

export const config = { path: '/api/cancel-subscription' };
