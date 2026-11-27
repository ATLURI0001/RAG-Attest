export interface ChunkMetadata {
  chunkId: string;
  sourceUri: string;
  tokenCount: number;
}

export function validateChunkMetadata(meta: ChunkMetadata): void {
  if (!meta.chunkId || !meta.sourceUri) throw new Error('Contract violation: chunkId and sourceUri required');
  if (!Number.isInteger(meta.tokenCount) || meta.tokenCount <= 0) {
    throw new Error('Contract violation: tokenCount must be positive integer');
  }
}
