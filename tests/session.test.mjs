import test from 'node:test';
import assert from 'node:assert/strict';
import { issueSession, validSession, SESSION_SECONDS } from '../server/session.mjs';
test('device session survives server restarts but rejects expiry, tampering and password rotation', () => {
 const now = Date.UTC(2026, 9, 8), secret = 'test-passphrase';
 const token = issueSession(secret, now);
 assert.equal(validSession(token, secret, now + 86400000), true);
 assert.equal(validSession(token, secret, now + SESSION_SECONDS * 1000), false);
 assert.equal(validSession(token, 'changed', now), false);
 assert.equal(validSession(token.replace(/^\d/, '9'), secret, now), false);
 assert.equal(validSession(token.slice(0, -1), secret, now), false);
 assert.equal(validSession('a'.repeat(64), secret, now), false);
 assert.equal(validSession(token, '', now), false);
 assert.ok(!token.includes(secret));
 assert.notEqual(issueSession(secret, now), token);
});
