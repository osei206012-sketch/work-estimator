import { json, emailFromRequest, getSub, publicSub } from '../lib/shared.mjs';

export default async (req) => {
  const email = emailFromRequest(req);
  if (!email) return json({ error: 'Not signed in' }, 401);
  return json({ email, ...publicSub(await getSub(email)) });
};

export const config = { path: '/api/subscription-status' };
