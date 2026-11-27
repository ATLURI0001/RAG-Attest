import assert from 'node:assert/strict';
import { validateEmbeddingDrift } from '../src/embedding_drift_sentinel.ts';

export function runEmbeddingDriftSentinelTests(): boolean {
  validateEmbeddingDrift(0.9);
  try { validateEmbeddingDrift(0.3); assert.fail('expected drift error'); }
  catch (e: any) { assert.match(e.message, /embedding drift/); }
  return true;
}
