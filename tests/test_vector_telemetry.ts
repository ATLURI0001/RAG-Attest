import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { VectorTelemetryEngine } from '../src/core/vector_telemetry.ts';

describe('Vector Telemetry & Cluster Dispersion Suite', () => {
  test('initializes empty and returns EMPTY diagnostic tier', () => {
    const engine = new VectorTelemetryEngine();
    const telemetry = engine.analyzeCluster();

    assert.equal(telemetry.totalVectors, 0);
    assert.equal(telemetry.diagnosticTier, 'EMPTY');
    assert.equal(telemetry.anomalies.length, 1);
  });

  test('validates vector dimensions and rejects mismatches', () => {
    const engine = new VectorTelemetryEngine(3);

    engine.addVector('v1', [1.0, 0.0, 0.0]);

    // Mismatched length (4 instead of 3)
    assert.throws(
      () => engine.addVector('v2', [1.0, 0.0, 0.0, 0.0]),
      /Dimension mismatch/
    );

    // Non-finite value
    assert.throws(
      () => engine.addVector('v3', [1.0, NaN, 0.0]),
      /non-finite element/
    );
  });

  test('computes OPTIMAL telemetry for well-distributed normalized embeddings', () => {
    const engine = new VectorTelemetryEngine(4);

    // Orthogonal basis vectors (unit length)
    engine.addVector('doc_1', [1.0, 0.0, 0.0, 0.0]);
    engine.addVector('doc_2', [0.0, 1.0, 0.0, 0.0]);
    engine.addVector('doc_3', [0.0, 0.0, 1.0, 0.0]);
    engine.addVector('doc_4', [0.0, 0.0, 0.0, 1.0]);

    const telemetry = engine.analyzeCluster();

    assert.equal(telemetry.totalVectors, 4);
    assert.equal(telemetry.dimensions, 4);
    assert.equal(telemetry.l2NormMean, 1.0);
    assert.equal(telemetry.l2NormStdDev, 0.0);
    assert.equal(telemetry.cosineSimilarityMean, 0.0); // Orthogonal
    assert.equal(telemetry.diagnosticTier, 'OPTIMAL');
    assert.equal(telemetry.anomalies.length, 0);
  });

  test('detects COLLAPSED vector space when embeddings lack diversity', () => {
    const engine = new VectorTelemetryEngine(3);

    // Nearly identical vectors
    engine.addVector('c1', [1.0, 0.001, 0.001]);
    engine.addVector('c2', [1.0, 0.002, 0.001]);
    engine.addVector('c3', [1.0, 0.001, 0.002]);

    const telemetry = engine.analyzeCluster();

    assert.equal(telemetry.diagnosticTier, 'COLLAPSED');
    assert.ok(telemetry.cosineSimilarityMean > 0.99);
    assert.ok(telemetry.anomalies.some((a) => a.includes('severe spatial collapse')));
  });

  test('formats diagnostic report and resets state', () => {
    const engine = new VectorTelemetryEngine(2);
    engine.addVector('a', [1.0, 0.0]);
    engine.addVector('b', [0.0, 1.0]);

    const report = engine.formatDiagnosticReport();
    assert.ok(report.includes('=== Vector Cluster Diagnostic [OPTIMAL] ==='));
    assert.ok(report.includes('Vectors: 2 | Dimension: 2'));

    engine.reset();
    assert.equal(engine.analyzeCluster().totalVectors, 0);
  });
});
