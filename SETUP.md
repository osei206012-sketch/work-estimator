# Work Estimator: payment setup (Paystack + Netlify)

## What is in this project
- `public/index.html` is the app (live public key already inside).
- `netlify/functions/` has four server functions: `verify-payment`, `paystack-webhook`, `subscription-status`, `cancel-subscription`.
- `netlify/lib/shared.mjs` has shared rules (price GH₵150 = 15000 pesewas, GHS only).
- `netlify.toml` and `package.json` are the Netlify config.

## 1. Paystack dashboard
1. Products > Plans > **Create plan**: GH₵150, monthly. Copy the `PLN_...` code.
2. Settings > API Keys & Webhooks: copy your **Live Secret Key** (`sk_live_...`).
3. Same page, set **Live Webhook URL** to `https://YOUR-SITE.netlify.app/api/paystack-webhook`

## 2. Netlify environment variables
Site configuration > Environment variables:

| Name | Value |
|---|---|
| `PAYSTACK_SECRET_KEY` | your `sk_live_...` key (never put it in the HTML) |
| `TOKEN_SECRET` | a long random string, e.g. output of `openssl rand -hex 32` |
| `PAYSTACK_PLAN_CODE` | your `PLN_...` code |

## 3. Put the plan code in the app
In `public/index.html` find `const PAYSTACK_PLAN_CODE='';` and paste the same `PLN_...` code between the quotes.
(If left blank, each payment is a one-off that unlocks 32 days.)

## 4. Deploy
Functions need a real deploy, not drag-and-drop of the HTML alone:
- **Git:** push this folder to GitHub/GitLab and connect it in Netlify, or
- **CLI:** `npm install` then `npx netlify-cli deploy --prod`

## 5. Test before taking real money
Use test keys first: `pk_test_...` in the HTML, `sk_test_...` in Netlify, test webhook URL set in Paystack. Pay with a Paystack test card, confirm the status shows "Active until...", then switch to live keys.

## How it works
1. Customer enters email and pays in the Paystack window.
2. The app sends the payment reference to `/api/verify-payment`.
3. The server asks Paystack to confirm it (status success, GHS, at least GH₵150, matching email) and stores the expiry date.
4. The server returns a signed token. The app keeps it and checks `/api/subscription-status` on every load.
5. Paystack webhooks keep renewals, failed payments and cancellations up to date.

## Good to know
- **Mobile money does not auto-renew.** Paystack can only auto-charge cards. Mobile money payers get about a month, then pay again.
- **Access is checked in the browser.** The server decides who has paid, but a determined person could still edit the page code to skip the lock. That is normal for a front-end-only app. The 3-free-estimate counter lives in the browser and can be reset.
- **Restore on a new phone:** Subscribe tab > "Already paid?" with email and the reference from the Paystack receipt.
- **Refund and cancellation wording** in the Terms page is a starting point. Review it and add your real support contact before launch.
