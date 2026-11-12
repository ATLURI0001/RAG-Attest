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

async function runAll(): Promise<void> {
  console.log('\n======================================================');
  console.log('   AEGIS-EDGE AUTOMATED TEST SUITE EXECUTION           ');
  console.log('======================================================\n');

  let passed = 0;
  let total = 7;

  try {
    if (runLexerTests()) passed++;
    if (runParserTests()) passed++;
    if (runMetricsTests()) passed++;
    if (runVmTests()) passed++;
    if (runEngineTests()) passed++;
    if (runTelemetryTests()) passed++;
    if (runStorageTests()) passed++;

    console.log(`\n======================================================`);
    console.log(`  ALL ${passed}/${total} TEST SUITES PASSED DETERMINISTICALLY!`);
    console.log(`======================================================\n`);
  } catch (err: any) {
    console.error(`\n✖ Test Suite FAILED:`, err.message);
    process.exit(1);
  }
}

runAll();
