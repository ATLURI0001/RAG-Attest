export function validateEmbeddingDimContract(vec: number[], expectedDim = 384): boolean {
  return vec.length === expectedDim;
}
