import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createLoginRateLimiter } from '../backend/src/login-rate-limit.mjs';

test('login limiter блокирует IP+login временно и сбрасывается после успеха', () => {
  let now = 1000; const limiter = createLoginRateLimiter({ now: () => now, maxFailures: 3, windowMs: 1000, blockMs: 500 });
  limiter.failure('1.2.3.4', 'User@Example.com'); limiter.failure('1.2.3.4', 'user@example.com');
  assert.doesNotThrow(() => limiter.assertAllowed('1.2.3.4', 'user@example.com'));
  limiter.failure('1.2.3.4', 'user@example.com');
  assert.throws(() => limiter.assertAllowed('1.2.3.4', 'user@example.com'), { status: 429, code: 'LOGIN_RATE_LIMITED' });
  assert.doesNotThrow(() => limiter.assertAllowed('1.2.3.5', 'user@example.com'));
  assert.doesNotThrow(() => limiter.assertAllowed('1.2.3.4', 'other@example.com'));
  now += 501; assert.doesNotThrow(() => limiter.assertAllowed('1.2.3.4', 'user@example.com'));
  limiter.failure('1.2.3.4', 'user@example.com'); limiter.success('1.2.3.4', 'user@example.com');
  assert.doesNotThrow(() => limiter.assertAllowed('1.2.3.4', 'user@example.com'));
});
