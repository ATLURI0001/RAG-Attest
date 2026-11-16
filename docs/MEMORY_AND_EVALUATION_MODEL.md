# Zero-Cloud Evaluation Loop & Memory Allocation Model

## Architectural Philosophy
RAG-Attest performs blazing-fast, deterministic claim attestation entirely on-device without telemetry or cloud dependencies.

## Zig Memory Management
- **ArenaAllocator**: Request-scoped evaluations allocate tokens and evaluation ASTs within an arena, freed in a single operation.
- **FixedBufferAllocator**: Extreme low-latency environments utilize pre-allocated fixed memory pools to avoid OS syscall overhead.
- **Zero-Copy Tokenization**: Byte slices reference the source buffer directly without heap duplication.
