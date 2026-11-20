# Local Vector Database Ingestion Protocol

## Supported Local Engines
1. **SQLite-vec**: Direct C-FFI bindings for ultra-lightweight embedded vector queries.
2. **DuckDB**: Fast columnar scans for large-scale chunk attestation datasets.
3. **Raw Memory Slices**: Direct cosine similarity over aligned float32 arrays via AVX2 / NEON SIMD intrinsics.
