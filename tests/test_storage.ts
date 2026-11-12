import fs from 'fs';
import os from 'os';
import path from 'path';
import assert from 'assert';
import { EdgeStorage } from '../src/edge/storage.ts';
import type { EvaluationResult } from '../src/core/types.ts';

function makeResult(id: string): EvaluationResult {
  return {
    id,
    timestamp: '2026-11-12T00:00:00.000Z',
    prompt: 'q',
    contextChunks: ['c'],
    output: 'a',
    triad: { contextPrecision: 0.9, groundedness: 0.9, answerRelevance: 0.9 },
    extended: { completeness: 0.9, coherence: 0.9, hallucinationRisk: 0.05 },
    efficiency: { latencyMs: 12, inputTokens: 10, outputTokens: 5, tokensPerSec: 100 },
    claims: [{ id: '1', text: 'claim', status: 'ENTAILED', evidence: [] }],
    overallScore: 0.9,
    status: 'SAFE'
  };
}

export function runStorageTests(): boolean {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rag-attest-storage-'));
  try {
    assert.throws(() => new EdgeStorage(dir, 0), /positive integer/);
    assert.throws(() => new EdgeStorage(dir, -3), /positive integer/);
    assert.throws(() => new EdgeStorage(dir, Number.NaN), /positive integer/);

    const walPath = path.join(dir, 'aegis_wal.jsonl');
    fs.writeFileSync(
      walPath,
      [
        JSON.stringify(makeResult('valid-1')),
        'null',
        '{"partial":true}',
        JSON.stringify(makeResult('valid-2'))
      ].join('\n') + '\n',
      'utf-8'
    );

    const store = new EdgeStorage(dir, 2);
    assert.strictEqual(store.getRecent(-1).length, 0);
    assert.strictEqual(store.getRecent(0).length, 0);
    assert.strictEqual(store.getRecent(Number.NaN).length, 0);
    assert.deepStrictEqual(
      store.getRecent(5).map((r) => r.id),
      ['valid-2', 'valid-1']
    );

    const summary = store.getSummary();
    assert.strictEqual(summary.totalCount, 2);
    console.log('✓ Storage Edge-Case & WAL Hardening Tests Passed!');
    return true;
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
