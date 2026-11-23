/**
 * Tests for AttestationTokenGuard & Replay / Downgrade Attack Defense.
 */

import assert from 'node:assert';
import { AttestationTokenGuard } from '../src/core/attestation_token_guard.ts';
import type { AttestationClaims } from '../src/core/attestation_token_guard.ts';

export function runAttestationGuardTests(): boolean {
  console.log('  Testing AttestationTokenGuard & Cryptographic Replay Hardening...');

  const secret = 'super-secure-production-secret-key-32bytes!';
  const guard = new AttestationTokenGuard({
    secretKey: secret,
    allowedIssuers: ['aegis-auth-authority'],
    maxClockSkewSec: 5,
    maxTokenTtlSec: 1800,
  });

  const nowSec = Math.floor(Date.now() / 1000);
  const validClaims: AttestationClaims = {
    jti: 'nonce-uuid-1234567890abcdef',
    iss: 'aegis-auth-authority',
    sub: 'tenant-enterprise-42',
    exp: nowSec + 300,
    nbf: nowSec - 10,
    scope: ['rag:read', 'rag:eval'],
  };

  // 1. Sign and verify valid token
  const token = guard.signToken(validClaims);
  assert.ok(typeof token === 'string' && token.split('.').length === 3);

  const res1 = guard.verifyToken(token, 'rag:read');
  assert.strictEqual(res1.valid, true);
  assert.strictEqual(res1.claims?.sub, 'tenant-enterprise-42');

  // 2. Replay attack rejection
  const replayRes = guard.verifyToken(token, 'rag:read');
  assert.strictEqual(replayRes.valid, false);
  assert.ok(replayRes.error?.includes('Replay attack detected'));

  // 3. Signature tampering detection
  const tamperedClaims: AttestationClaims = {
    ...validClaims,
    jti: 'nonce-uuid-tampered99999999',
  };
  const tamperedToken = guard.signToken(tamperedClaims) + 'tamper';
  const tamperRes = guard.verifyToken(tamperedToken);
  assert.strictEqual(tamperRes.valid, false);
  assert.ok(tamperRes.error?.includes('signature verification failed'));

  // 4. Algorithm downgrade attack detection (alg: none)
  const fakeHeader = Buffer.from(JSON.stringify({ alg: 'none', typ: 'AEGIS-ATTEST' })).toString('base64url');
  const fakePayload = Buffer.from(JSON.stringify({ ...validClaims, jti: 'nonce-uuid-downgrade123' })).toString('base64url');
  const downgradeToken = `${fakeHeader}.${fakePayload}.`;
  const downgradeRes = guard.verifyToken(downgradeToken);
  assert.strictEqual(downgradeRes.valid, false);

  // 5. Expired token rejection
  const expiredClaims: AttestationClaims = {
    ...validClaims,
    jti: 'nonce-uuid-expired999999999',
    exp: nowSec - 100,
    nbf: nowSec - 500,
  };
  const expiredToken = guard.signToken(expiredClaims);
  const expiredRes = guard.verifyToken(expiredToken);
  assert.strictEqual(expiredRes.valid, false);
  assert.ok(expiredRes.error?.includes('Token expired'));

  // 6. Insufficient scope rejection
  const readOnlyClaims: AttestationClaims = {
    ...validClaims,
    jti: 'nonce-uuid-readonly12345678',
    scope: ['rag:read'],
  };
  const readOnlyToken = guard.signToken(readOnlyClaims);
  const scopeRes = guard.verifyToken(readOnlyToken, 'rag:admin');
  assert.strictEqual(scopeRes.valid, false);
  assert.ok(scopeRes.error?.includes('Insufficient scope'));

  console.log('    ✓ AttestationTokenGuard replay, tampering, and scope tests PASSED');
  return true;
}
