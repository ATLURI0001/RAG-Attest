import assert from 'node:assert/strict';
import { validateChunkMetadata } from '../src/chunk_metadata_contract.ts';

export function runChunkMetadataContractTests(): boolean {
  validateChunkMetadata({ chunkId: 'c1', sourceUri: 'doc://1', tokenCount: 128 });
  assert.throws(() => validateChunkMetadata({ chunkId: '', sourceUri: 'doc://1', tokenCount: 0 }));
  console.log('✓ ChunkMetadataContract tests passed');
  return true;
}
