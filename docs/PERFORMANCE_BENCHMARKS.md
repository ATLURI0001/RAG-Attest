# Throughput Scaling Metrics & Performance Verification

## Benchmark Configuration
- CPU: AMD Ryzen 9 / Apple M-series
- Evaluation Target: 10,000 synthetic retrieval-grounding pairs
- Compiler: Zig 0.13.0 (ReleaseFast)

## Scaling Matrix
| Thread Count | Evaluations / sec | Latency (p50) | Latency (p99) |
| :---: | :---: | :---: | :---: |
| 1 | 8,200 | 120 µs | 280 µs |
| 4 | 28,500 | 35 µs | 85 µs |
| 8 | 49,800 | 20 µs | 45 µs |
