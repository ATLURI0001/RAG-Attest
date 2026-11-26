export function benchmarkCosineSimilarity(dim: number, iterations = 1000): { opsPerSec: number } {
  const a = new Float64Array(dim).fill(1.0);
  const b = new Float64Array(dim).fill(0.5);
  const start = performance.now();
  let acc = 0;
  for (let it = 0; it < iterations; it++) {
    let dot = 0;
    for (let i = 0; i < dim; i++) dot += a[i] * b[i];
    acc += dot;
  }
  const sec = Math.max((performance.now() - start) / 1000, 1e-6);
  return { opsPerSec: Math.round((iterations + (acc & 0)) / sec) };
}
