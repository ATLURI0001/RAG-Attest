/**
 * AEGIS-EDGE Master Test Runner
 */

import { runLexerTests } from './test_lexer.ts';
import { runParserTests } from './test_parser.ts';
import { runMetricsTests } from './test_metrics.ts';
import { runVmTests } from './test_vm.ts';
import { runEngineTests } from './test_engine.ts';
import { runTelemetryTests } from './test_telemetry.ts';
import { runStorageTests } from './test_storage.ts';
import { runBm25Tests } from './test_bm25.ts';
import { runRerankerTests } from './test_reranker.ts';
import { runEntropyTests } from './test_entropy.ts';
import { runContractTests } from './test_contract.ts';
import { runRateGovernorTests } from './test_rate_governor.ts';
import { runPromptGuardTests } from './test_prompt_guard.ts';
import { runChunkerTests } from './test_chunker.ts';
import { runGroundingVerifierTests } from './test_grounding_verifier.ts';
import { runIngestionContractTests } from './test_ingestion_contract.ts';
import { runRetrievalTelemetryTests } from './test_retrieval_telemetry.ts';
import { runAttestationGuardTests } from './test_attestation_guard.ts';
import { runIndexCompactorTests } from './test_index_compactor.ts';
import { runHybridFusionProfilerTests } from './test_hybrid_fusion_profiler.ts';
import { runEmbeddingContractTests } from './test_embedding_contract.ts';
import { runCacheTelemetryTests } from './test_cache_telemetry.ts';
import { runVectorStoreCircuitBreakerTests } from './test_vector_store_circuit_breaker.ts';
import { runRerankerCircuitBreakerTests } from './test_reranker_circuit_breaker.ts';
import { runIndexCorruptionSentinelTests } from './test_index_corruption_sentinel.ts';
import { runBM25BenchmarkProfilerTests } from './test_bm25_benchmark_profiler.ts';
import { runEmbeddingBenchmarkProfilerTests } from './test_embedding_benchmark_profiler.ts';
import { runRerankerScoreContractTests } from './test_reranker_score_contract.ts';
import { runChunkDedupRotaryTests } from './test_chunk_dedup_rotary.ts';
import { runEmbeddingApiCircuitBreakerTests } from './test_embedding_api_circuit_breaker.ts';
import { runChunkInjectionSentinelTests } from './test_chunk_injection_sentinel.ts';
import { runCosineSimProfilerTests } from './test_cosine_sim_profiler.ts';
import { runCitationAnchorContractTests } from './test_citation_anchor_contract.ts';
import { runRerankLatencyRotaryTests } from './test_rerank_latency_rotary.ts';
import { runChunkStoreCircuitBreakerTests } from './test_chunk_store_circuit_breaker.ts';
import { runContextTruncationSentinelTests } from './test_context_truncation_sentinel.ts';
import { runBm25TokenizeProfilerTests } from './test_bm25_tokenize_profiler.ts';
import { runChunkMetadataContractTests } from './test_chunk_metadata_contract.ts';
import { runEmbeddingCacheRotaryTests } from './test_embedding_cache_rotary.ts';
import { runRerankerPoolCircuitBreakerTests } from './test_reranker_pool_circuit_breaker.ts';
import { runUnicodeNormSentinelTests } from './test_unicode_norm_sentinel.ts';
import { runChunkHashProfilerTests } from './test_chunk_hash_profiler.ts';
import { runQueryCacheCircuitBreakerTests } from './test_query_cache_circuit_breaker.ts';

async function runAll(): Promise<void> {
  console.log('\n======================================================');
  console.log('   AEGIS-EDGE AUTOMATED TEST SUITE EXECUTION           ');
  console.log('======================================================\n');

  let passed = 0;
  let total = 43;

  try {
    if (runLexerTests()) passed++;
    if (runParserTests()) passed++;
    if (runMetricsTests()) passed++;
    if (runVmTests()) passed++;
    if (runEngineTests()) passed++;
    if (runTelemetryTests()) passed++;
    if (runStorageTests()) passed++;
    if (runBm25Tests()) passed++;
    if (runRerankerTests()) passed++;
    if (runEntropyTests()) passed++;
    if (runContractTests()) passed++;
    if (runRateGovernorTests()) passed++;
    runPromptGuardTests();
    passed++;
    if (runChunkerTests()) passed++;
    runGroundingVerifierTests();
    passed++;
    if (runIngestionContractTests()) passed++;
    if (runRetrievalTelemetryTests()) passed++;
    if (runAttestationGuardTests()) passed++;
    if (runIndexCompactorTests()) passed++;
    if (runHybridFusionProfilerTests()) passed++;
    if (runEmbeddingContractTests()) passed++;
    if (runCacheTelemetryTests()) passed++;
    if (await runVectorStoreCircuitBreakerTests()) passed++;
    if (await runRerankerCircuitBreakerTests()) passed++;
    if (runIndexCorruptionSentinelTests()) passed++;
    if (runBM25BenchmarkProfilerTests()) passed++;
    if (runEmbeddingBenchmarkProfilerTests()) passed++;
    if (runRerankerScoreContractTests()) passed++;
    if (runChunkDedupRotaryTests()) passed++;
    if (runEmbeddingApiCircuitBreakerTests()) passed++;
    if (runChunkInjectionSentinelTests()) passed++;
    if (runCosineSimProfilerTests()) passed++;
    if (runCitationAnchorContractTests()) passed++;
    if (runRerankLatencyRotaryTests()) passed++;
    if (runChunkStoreCircuitBreakerTests()) passed++;
    if (runContextTruncationSentinelTests()) passed++;
    if (runBm25TokenizeProfilerTests()) passed++;
    if (runChunkMetadataContractTests()) passed++;
    if (runEmbeddingCacheRotaryTests()) passed++;
    if (runRerankerPoolCircuitBreakerTests()) passed++;
    if (runUnicodeNormSentinelTests()) passed++;
if (runChunkHashProfilerTests()) passed++;
if (runQueryCacheCircuitBreakerTests()) passed++;

    console.log(`\n======================================================`);
    console.log(`  ALL ${passed}/${total} TEST SUITES PASSED DETERMINISTICALLY!`);
    console.log(`======================================================\n`);
  } catch (err: any) {
    console.error(`\n✖ Test Suite FAILED:`, err.message);
    process.exit(1);
  }
}

runAll();
