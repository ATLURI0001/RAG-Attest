const std = @import("std");

pub const Tokenizer = struct {
    allocator: std.mem.Allocator,

    pub fn init(allocator: std.mem.Allocator) Tokenizer {
        return .{ .allocator = allocator };
    }

    pub fn tokenize(self: *Tokenizer, text: []const u8) !std.ArrayList([]const u8) {
        var list = std.ArrayList([]const u8).empty;
        var i: usize = 0;

        while (i < text.len) {
            // Skip non-alphanumeric
            while (i < text.len and !std.ascii.isAlphanumeric(text[i])) : (i += 1) {}
            if (i >= text.len) break;

            const start = i;
            while (i < text.len and (std.ascii.isAlphanumeric(text[i]) or text[i] == '-')) : (i += 1) {}
            const end = i;

            if (end > start) {
                // Lowercase the token into allocated memory
                const slice = text[start..end];
                var buf = try self.allocator.alloc(u8, slice.len);
                for (slice, 0..) |c, idx| {
                    buf[idx] = std.ascii.toLower(c);
                }
                try list.append(self.allocator, buf);
            }
        }

        return list;
    }
};
