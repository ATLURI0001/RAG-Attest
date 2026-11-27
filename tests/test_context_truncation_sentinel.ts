import assert from 'node:assert/strict';
import { assertContextWithinBudget } from '../src/context_truncation_sentinel.ts';

export function runContextTruncationSentinelTests(): boolean {
  assertContextWithinBudget(1024, 4096);
  assert.throws(() => assertContextWithinBudget(5000, 4096));
  console.log('✓ ContextTruncationSentinel tests passed');
  return true;
}
