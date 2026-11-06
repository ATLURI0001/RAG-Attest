/**
 * AEGIS-EDGE: Sovereign Edge RAG Evaluation Engine
 * Core Domain Types & Data Contracts
 */

export interface RetrievedChunk {
  id: string;
  text: string;
  rank?: number;
  score?: number;
  sourceUri?: string;
}

export interface RagPayload {
  id: string;
  query: string;
  retrievedChunks: RetrievedChunk[];
  generatedAnswer: string;
  groundTruth?: string;
  latencyMs?: number;
  ttftMs?: number;
  tokensGenerated?: number;
  timestamp?: string;
  metadata?: Record<string, unknown>;
}

export type ClaimStatus = 'ENTAILED' | 'CONTRADICTED' | 'UNGROUNDED';

export interface ClaimVerification {
  id: string;
  claimText: string;
  status: ClaimStatus;
  confidence: number;
  bestMatchingChunkId: string | null;
  matchScore: number;
  overlapKeywords: string[];
  negationDetected: boolean;
}

export interface RagTriadMetrics {
  contextPrecision: number; // 0.0 - 1.0: Did retrieval rank relevant info at top?
  groundedness: number;     // 0.0 - 1.0: Is generated answer strictly backed by retrieved context?
  answerRelevance: number;  // 0.0 - 1.0: Does the answer directly answer the query without divergence?
}

export interface ExtendedMetrics {
  contextRecall: number;          // 0.0 - 1.0: How well did retrieved chunks cover ground truth / core query premises?
  semanticDrift: number;          // 0.0 - 1.0: Divergence between query intent and answer centroid
  hallucinationRisk: number;      // 0.0 - 1.0: Synthesized probability of fabricated claims
  contradictionEntropy: number;   // 0.0 - 1.0: Polar conflict measure against reference chunks
  brevityIndex: number;           // 0.0 - 1.0: Information density vs wordiness ratio
  lexicalDiversity: number;       // TTR (Type-Token Ratio)
}

export interface EdgeEfficiencyMetrics {
  latencyMs: number;
  ttftMs?: number;
  tokensGenerated?: number;
  throughputTokensSec?: number;
  evalComputeTimeMs: number;
  memoryFootprintKb: number;
  edgeBudgetCompliance: boolean;
}

export type PolicyVerdict = 'PASSED' | 'DEGRADED' | 'FAILED';

export interface PolicyViolation {
  ruleName?: string;
  assertion: string;
  measuredValue: number | string;
  expectedCondition: string;
  severity: 'CRITICAL' | 'WARNING' | 'INFO';
  message: string;
  line?: number;
}

export interface PolicyAttestationReport {
  policyName: string;
  verdict: PolicyVerdict;
  complianceScore: number; // 0.0 - 1.0
  violations: PolicyViolation[];
  passedCount: number;
  failedCount: number;
  evaluatedAt: string;
}

export interface EvaluationResult {
  id: string;
  payloadId: string;
  timestamp: string;
  triad: RagTriadMetrics;
  extended: ExtendedMetrics;
  claims: ClaimVerification[];
  efficiency: EdgeEfficiencyMetrics;
  overallScore: number; // Harmonized composite score
  status: 'OPTIMAL' | 'ACCEPTABLE' | 'DEGRADED' | 'UNSAFE';
  attestation?: PolicyAttestationReport;
}

export interface EvaluationBatchSummary {
  totalCount: number;
  averageTriad: RagTriadMetrics;
  averageOverall: number;
  hallucinationRate: number;
  latencyPercentiles: {
    p50: number;
    p95: number;
    p99: number;
    min: number;
    max: number;
    avg: number;
  };
  totalClaimsEvaluated: number;
  entailedClaimsRatio: number;
  results: EvaluationResult[];
}
