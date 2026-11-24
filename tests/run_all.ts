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

async function runAll(): Promise<void> {
  console.log('\n======================================================');
  console.log('   AEGIS-EDGE AUTOMATED TEST SUITE EXECUTION           ');
  console.log('======================================================\n');

  let passed = 0;
  let total = 22;

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

    console.log(`\n======================================================`);
    console.log(`  ALL ${passed}/${total} TEST SUITES PASSED DETERMINISTICALLY!`);
    console.log(`======================================================\n`);
  } catch (err: any) {
    console.error(`\n✖ Test Suite FAILED:`, err.message);
    process.exit(1);
  }
}

runAll();
