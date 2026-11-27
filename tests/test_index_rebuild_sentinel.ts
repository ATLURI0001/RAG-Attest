import assert from 'node:assert/strict';
import { validateIndexRebuildTrigger } from '../src/index_rebuild_sentinel.ts';

export function runIndexRebuildSentinelTests(): boolean {
  validateIndexRebuildTrigger(0.75);
  try { validateIndexRebuildTrigger(1.5); assert.fail('expected throw'); }
  catch (e: any) { assert.ok(e instanceof RangeError); }
  return true;
}
