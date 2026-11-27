import assert from 'node:assert/strict';
import { assertNoBidiControlChars } from '../src/unicode_norm_sentinel.ts';

export function runUnicodeNormSentinelTests(): boolean {
  assertNoBidiControlChars('Clean ASCII and UTF-8 text');
  assert.throws(() => assertNoBidiControlChars('Trojan\u202Ecode'));
  console.log('✓ UnicodeNormSentinel tests passed');
  return true;
}
