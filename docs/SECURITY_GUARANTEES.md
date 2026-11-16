# Sandboxed Evaluation & Memory Safety Guarantees

## Memory Safety
Zig's explicit memory management guarantees:
- No hidden control flow or unexpected runtime allocations.
- Buffer overflow and integer wrapping protections in release modes.
- Strict payload size limits (default: 16 MB maximum document stream).

## DoS Mitigation
Regex engines are avoided in favor of deterministic Boyer-Moore and Aho-Corasick string searching, preventing algorithmic complexity attacks.
