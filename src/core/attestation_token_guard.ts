/**
 * Cryptographic Attestation Token Guard & Signature Hardener.
 *
 * Enforces HMAC-SHA256 constant-time verification, strict replay nonce caching,
 * claim boundary validation, and algorithm downgrade attack prevention.
 */

import * as crypto from 'node:crypto';

export interface AttestationClaims {
  jti: string;
  iss: string;
  sub: string;
  exp: number;
  nbf?: number;
  scope: string[];
}

export interface VerificationResult {
  valid: boolean;
  claims?: AttestationClaims;
  error?: string;
}

export interface AttestationGuardOptions {
  secretKey: string;
  allowedIssuers?: string[];
  maxClockSkewSec?: number;
  maxTokenTtlSec?: number;
}

export class AttestationTokenGuard {
  private secretKey: Buffer;
  private allowedIssuers: Set<string>;
  private maxClockSkewSec: number;
  private maxTokenTtlSec: number;
  private seenNonces: Map<string, number>; // jti -> expiresAtUnixSec

  constructor(options: AttestationGuardOptions) {
    if (!options.secretKey || typeof options.secretKey !== 'string' || options.secretKey.length < 16) {
      throw new Error('secretKey must be a string of at least 16 characters');
    }
    this.secretKey = Buffer.from(options.secretKey, 'utf-8');
    this.allowedIssuers = new Set(options.allowedIssuers || ['aegis-auth-authority', 'aegis-edge-gateway']);
    this.maxClockSkewSec = options.maxClockSkewSec ?? 10;
    this.maxTokenTtlSec = options.maxTokenTtlSec ?? 3600;
    this.seenNonces = new Map();
  }

  /**
   * Generates a signed attestation token string: header.payload.signature
   */
  signToken(claims: AttestationClaims): string {
    const header = { alg: 'HS256', typ: 'AEGIS-ATTEST' };
    const encodedHeader = Buffer.from(JSON.stringify(header)).toString('base64url');
    const encodedPayload = Buffer.from(JSON.stringify(claims)).toString('base64url');

    const unsignedToken = `${encodedHeader}.${encodedPayload}`;
    const signature = crypto
      .createHmac('sha256', this.secretKey)
      .update(unsignedToken)
      .digest('base64url');

    return `${unsignedToken}.${signature}`;
  }

  /**
   * Verifies the cryptographic integrity, freshness, nonce uniqueness, and claim validity.
   */
  verifyToken(token: string, requiredScope?: string): VerificationResult {
    if (!token || typeof token !== 'string') {
      return { valid: false, error: 'Token must be a non-empty string' };
    }

    const parts = token.trim().split('.');
    if (parts.length !== 3) {
      return { valid: false, error: 'Malformed token: expected 3 dot-separated segments' };
    }

    const [rawHeader, rawPayload, rawSignature] = parts;

    // 1. Verify Header
    let header: any;
    try {
      header = JSON.parse(Buffer.from(rawHeader, 'base64url').toString('utf-8'));
    } catch {
      return { valid: false, error: 'Malformed token header' };
    }

    if (header.alg !== 'HS256' || header.typ !== 'AEGIS-ATTEST') {
      return { valid: false, error: `Invalid header or algorithm downgrade attempt: alg=${header.alg}` };
    }

    // 2. Cryptographic signature verification using constant-time comparison
    const unsignedToken = `${rawHeader}.${rawPayload}`;
    const expectedSig = crypto
      .createHmac('sha256', this.secretKey)
      .update(unsignedToken)
      .digest('base64url');

    const expectedBuffer = Buffer.from(expectedSig, 'utf-8');
    const actualBuffer = Buffer.from(rawSignature, 'utf-8');

    if (expectedBuffer.length !== actualBuffer.length || !crypto.timingSafeEqual(expectedBuffer, actualBuffer)) {
      return { valid: false, error: 'Cryptographic signature verification failed' };
    }

    // 3. Payload and Claims validation
    let payload: AttestationClaims;
    try {
      payload = JSON.parse(Buffer.from(rawPayload, 'base64url').toString('utf-8'));
    } catch {
      return { valid: false, error: 'Malformed token payload' };
    }

    const nowSec = Math.floor(Date.now() / 1000);

    // Nonce (jti) format
    if (!payload.jti || typeof payload.jti !== 'string' || !/^[a-zA-Z0-9_-]{16,64}$/.test(payload.jti)) {
      return { valid: false, error: 'Invalid or missing nonce (jti): must match ^[a-zA-Z0-9_-]{16,64}$' };
    }

    // Issuer verification
    if (!payload.iss || !this.allowedIssuers.has(payload.iss)) {
      return { valid: false, error: `Unauthorized issuer: ${payload.iss}` };
    }

    // Expiration checks
    if (!Number.isFinite(payload.exp)) {
      return { valid: false, error: 'Missing or non-numeric expiration (exp)' };
    }

    if (nowSec > payload.exp + this.maxClockSkewSec) {
      return { valid: false, error: 'Token expired' };
    }

    // Max TTL check
    if (payload.nbf && Number.isFinite(payload.nbf)) {
      if (payload.exp - payload.nbf > this.maxTokenTtlSec) {
        return { valid: false, error: `Token TTL exceeds maximum allowed (${this.maxTokenTtlSec}s)` };
      }
      if (nowSec < payload.nbf - this.maxClockSkewSec) {
        return { valid: false, error: 'Token not yet valid (nbf in future)' };
      }
    }

    // 4. Replay attack prevention via seen nonce cache
    this.evictExpiredNonces(nowSec);
    if (this.seenNonces.has(payload.jti)) {
      return { valid: false, error: `Replay attack detected: nonce ${payload.jti} already used` };
    }
    this.seenNonces.set(payload.jti, payload.exp);

    // 5. Scope authorization check
    if (requiredScope) {
      const scopes = Array.isArray(payload.scope) ? payload.scope : [];
      if (!scopes.includes(requiredScope) && !scopes.includes('rag:admin')) {
        return { valid: false, error: `Insufficient scope: required ${requiredScope}` };
      }
    }

    return { valid: true, claims: payload };
  }

  private evictExpiredNonces(nowSec: number): void {
    for (const [nonce, exp] of this.seenNonces.entries()) {
      if (nowSec > exp + this.maxClockSkewSec) {
        this.seenNonces.delete(nonce);
      }
    }
  }

  get cachedNonceCount(): number {
    return this.seenNonces.size;
  }
}
