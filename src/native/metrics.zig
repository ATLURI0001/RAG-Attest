const std = @import("std");
const Tokenizer = @import("tokenizer.zig").Tokenizer;

pub const MetricsEngine = struct {
    allocator: std.mem.Allocator,

    pub fn init(allocator: std.mem.Allocator) MetricsEngine {
        return .{ .allocator = allocator };
    }

    /// Fast Levenshtein distance
    pub fn levenshtein(self: *MetricsEngine, s1: []const u8, s2: []const u8) !usize {
        const m = s1.len;
        const n = s2.len;

        var v0 = try self.allocator.alloc(usize, n + 1);
        defer self.allocator.free(v0);
        var v1 = try self.allocator.alloc(usize, n + 1);
        defer self.allocator.free(v1);

        for (0..n + 1) |i| v0[i] = i;

        for (0..m) |i| {
            v1[0] = i + 1;
            for (0..n) |j| {
                const cost: usize = if (s1[i] == s2[j]) 0 else 1;
                const del = v0[j + 1] + 1;
                const ins = v1[j] + 1;
                const sub = v0[j] + cost;
                v1[j + 1] = @min(@min(del, ins), sub);
            }
            @memcpy(v0, v1);
        }

        return v0[n];
    }

    /// Jaccard similarity across two token arrays
    pub fn tokenJaccard(tokensA: [][]const u8, tokensB: [][]const u8) f64 {
        if (tokensA.len == 0 and tokensB.len == 0) return 1.0;
        if (tokensA.len == 0 or tokensB.len == 0) return 0.0;

        var matches: usize = 0;
        for (tokensA) |ta| {
            for (tokensB) |tb| {
                if (std.mem.eql(u8, ta, tb)) {
                    matches += 1;
                    break;
                }
            }
        }

        const total = tokensA.len + tokensB.len - matches;
        if (total == 0) return 1.0;
        return @as(f64, @floatFromInt(matches)) / @as(f64, @floatFromInt(total));
    }

    /// Fast Longest Common Subsequence ratio
    pub fn lcsRatio(self: *MetricsEngine, s1: []const u8, s2: []const u8) !f64 {
        const m = s1.len;
        const n = s2.len;
        if (m == 0 or n == 0) return 0.0;

        const prev = try self.allocator.alloc(usize, n + 1);
        defer self.allocator.free(prev);
        const curr = try self.allocator.alloc(usize, n + 1);
        defer self.allocator.free(curr);

        @memset(prev, 0);
        @memset(curr, 0);

        for (1..m + 1) |i| {
            for (1..n + 1) |j| {
                if (s1[i - 1] == s2[j - 1]) {
                    curr[j] = prev[j - 1] + 1;
                } else {
                    curr[j] = @max(prev[j], curr[j - 1]);
                }
            }
            @memcpy(prev, curr);
            @memset(curr, 0);
        }

        const lcsLen = prev[n];
        return @as(f64, @floatFromInt(2 * lcsLen)) / @as(f64, @floatFromInt(m + n));
    }
};
