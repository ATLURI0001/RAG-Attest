/**
 * Vector Telemetry and Cluster Dispersion Diagnostic Engine.
 * Evaluates embedding dimensions, L2-norm uniformity, intra-cluster cosine distributions,
 * and detects vector space collapse or out-of-distribution embeddings in RAG systems.
 */

export type VectorDiagnosticTier = 'EMPTY' | 'OPTIMAL' | 'COLLAPSED' | 'HIGH_VARIANCE';

export interface VectorClusterTelemetry {
  totalVectors: number;
  dimensions: number;
  l2NormMean: number;
  l2NormStdDev: number;
  cosineSimilarityMean: number;
  cosineSimilarityMin: number;
  cosineSimilarityMax: number;
  intraClusterVariance: number;
  diagnosticTier: VectorDiagnosticTier;
  anomalies: string[];
}

export class VectorTelemetryEngine {
  private expectedDimension: number;
  private vectors: Map<string, number[]>;

  constructor(expectedDimension = 0) {
    this.expectedDimension = Number.isInteger(expectedDimension) && expectedDimension > 0 ? expectedDimension : 0;
    this.vectors = new Map();
  }

  /**
   * Registers an embedding vector into the telemetry cluster.
   * Enforces dimensional consistency and rejects non-finite entries.
   */
  public addVector(id: string, vector: number[]): void {
    const cleanId = String(id || '').trim();
    if (!cleanId) {
      throw new Error('Vector ID cannot be empty');
    }
    if (!Array.isArray(vector) || vector.length === 0) {
      throw new Error(`Vector '${cleanId}' must be a non-empty array of floats`);
    }

    if (this.expectedDimension === 0) {
      this.expectedDimension = vector.length;
    } else if (vector.length !== this.expectedDimension) {
      throw new Error(
        `Dimension mismatch for vector '${cleanId}': expected ${this.expectedDimension}, got ${vector.length}`
      );
    }

    for (let i = 0; i < vector.length; i++) {
      if (!Number.isFinite(vector[i])) {
        throw new Error(`Vector '${cleanId}' contains non-finite element at index ${i}`);
      }
    }

    this.vectors.set(cleanId, [...vector]);
  }

  /**
   * Computes cluster centroid, L2-norm distributions, and cosine similarity spread.
   */
  public analyzeCluster(): VectorClusterTelemetry {
    const n = this.vectors.size;
    const dim = this.expectedDimension;
    const anomalies: string[] = [];

    if (n === 0 || dim === 0) {
      return {
        totalVectors: 0,
        dimensions: dim,
        l2NormMean: 0.0,
        l2NormStdDev: 0.0,
        cosineSimilarityMean: 0.0,
        cosineSimilarityMin: 0.0,
        cosineSimilarityMax: 0.0,
        intraClusterVariance: 0.0,
        diagnosticTier: 'EMPTY',
        anomalies: ['No embedding vectors loaded into cluster'],
      };
    }

    // 1. Compute L2-norms
    const l2Norms: number[] = [];
    let normSum = 0;
    const centroid = new Array(dim).fill(0);

    for (const vec of this.vectors.values()) {
      let sumSq = 0;
      for (let d = 0; d < dim; d++) {
        sumSq += vec[d] * vec[d];
        centroid[d] += vec[d];
      }
      const norm = Math.sqrt(sumSq);
      l2Norms.push(norm);
      normSum += norm;
    }

    for (let d = 0; d < dim; d++) {
      centroid[d] /= n;
    }

    const l2NormMean = normSum / n;
    let normVar = 0;
    for (const norm of l2Norms) {
      normVar += (norm - l2NormMean) ** 2;
    }
    const l2NormStdDev = Math.sqrt(normVar / (n > 1 ? n - 1 : 1));

    // 2. Intra-cluster variance against centroid
    let totalCentroidDistance = 0;
    for (const vec of this.vectors.values()) {
      let distSq = 0;
      for (let d = 0; d < dim; d++) {
        distSq += (vec[d] - centroid[d]) ** 2;
      }
      totalCentroidDistance += distSq;
    }
    const intraClusterVariance = totalCentroidDistance / n;

    // 3. Pairwise cosine similarity sampled or all pairs (capped at 500 pairs for efficiency)
    const vecList = Array.from(this.vectors.values());
    const similarities: number[] = [];

    const sampleStep = Math.max(1, Math.floor(n / 25));
    for (let i = 0; i < n; i += sampleStep) {
      for (let j = i + 1; j < n; j += sampleStep) {
        similarities.push(this._cosineSimilarity(vecList[i], vecList[j], l2Norms[i], l2Norms[j]));
      }
    }

    let cosMean = 1.0;
    let cosMin = 1.0;
    let cosMax = 1.0;

    if (similarities.length > 0) {
      cosMin = Math.min(...similarities);
      cosMax = Math.max(...similarities);
      const sum = similarities.reduce((acc, v) => acc + v, 0);
      cosMean = sum / similarities.length;
    }

    // Diagnostic Tier Evaluation
    let diagnosticTier: VectorDiagnosticTier = 'OPTIMAL';
    if (cosMean > 0.98 && n > 2) {
      diagnosticTier = 'COLLAPSED';
      anomalies.push('Embedding vectors exhibit severe spatial collapse (mean cosine > 0.98); representations lack discrimination');
    } else if (l2NormStdDev > 0.4 * l2NormMean && l2NormMean > 0) {
      diagnosticTier = 'HIGH_VARIANCE';
      anomalies.push('L2-norm shows high variance; verify if vectors were unnormalized before ingestion');
    } else {
      diagnosticTier = 'OPTIMAL';
    }

    return {
      totalVectors: n,
      dimensions: dim,
      l2NormMean: Number(l2NormMean.toFixed(4)),
      l2NormStdDev: Number(l2NormStdDev.toFixed(4)),
      cosineSimilarityMean: Number(cosMean.toFixed(4)),
      cosineSimilarityMin: Number(cosMin.toFixed(4)),
      cosineSimilarityMax: Number(cosMax.toFixed(4)),
      intraClusterVariance: Number(intraClusterVariance.toFixed(6)),
      diagnosticTier,
      anomalies,
    };
  }

  /**
   * Generates a human-readable ASCII diagnostic report.
   */
  public formatDiagnosticReport(): string {
    const telemetry = this.analyzeCluster();
    const lines = [
      `=== Vector Cluster Diagnostic [${telemetry.diagnosticTier}] ===`,
      `Vectors: ${telemetry.totalVectors} | Dimension: ${telemetry.dimensions}`,
      `L2-Norm: ${telemetry.l2NormMean} +/- ${telemetry.l2NormStdDev}`,
      `Cosine Similarity: Mean=${telemetry.cosineSimilarityMean} (Min=${telemetry.cosineSimilarityMin}, Max=${telemetry.cosineSimilarityMax})`,
      `Intra-Cluster Variance: ${telemetry.intraClusterVariance}`,
    ];

    if (telemetry.anomalies.length > 0) {
      lines.push('Anomalies:');
      for (const a of telemetry.anomalies) {
        lines.push(`  * ${a}`);
      }
    }

    return lines.join('\n');
  }

  /**
   * Resets vector store and expected dimension.
   */
  public reset(): void {
    this.vectors.clear();
    this.expectedDimension = 0;
  }

  private _cosineSimilarity(a: number[], b: number[], normA: number, normB: number): number {
    if (normA === 0 || normB === 0) return 0.0;
    let dot = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
    }
    const val = dot / (normA * normB);
    return Math.max(-1.0, Math.min(1.0, val));
  }
}
