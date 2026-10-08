import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
export const SESSION_SECONDS = 30 * 24 * 60 * 60;
const sign = (payload, secret) => createHmac('sha256', secret).update('health-device-session-v1:' + payload).digest('hex');
export function issueSession(secret, now = Date.now()) {
  const payload = `${Math.floor(now / 1000) + SESSION_SECONDS}.${randomBytes(32).toString('hex')}`;
  return `${payload}.${sign(payload, secret)}`;
}
export function validSession(token, secret, now = Date.now()) {
  if (!secret || typeof token !== 'string' || token.length > 150) return false;
  const match = /^(\d{10,11})\.([a-f0-9]{64})\.([a-f0-9]{64})$/.exec(token);
  if (!match) return false;
  const expiry = Number(match[1]), current = Math.floor(now / 1000);
  if (expiry <= current || expiry > current + SESSION_SECONDS) return false;
  return timingSafeEqual(Buffer.from(match[3], 'hex'), Buffer.from(sign(`${match[1]}.${match[2]}`, secret), 'hex'));
}
