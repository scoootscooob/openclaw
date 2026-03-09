import { describe, expect, it } from "vitest";
import { normalizeAllowFrom } from "./bot-access.js";

describe("normalizeAllowFrom", () => {
  it("accepts positive sender IDs and negative group chat IDs as valid numeric entries", () => {
    const result = normalizeAllowFrom(["-1001234567890", " tg:-100999 ", "745123456", "@someone"]);

    expect(result).toEqual({
      entries: ["-1001234567890", "-100999", "745123456"],
      hasWildcard: false,
      hasEntries: true,
      invalidEntries: ["@someone"],
    });
  });

  it("rejects non-numeric entries like usernames", () => {
    const result = normalizeAllowFrom(["@username", "not-a-number", "abc123"]);

    expect(result).toEqual({
      entries: [],
      hasWildcard: false,
      hasEntries: true,
      invalidEntries: ["@username", "not-a-number", "abc123"],
    });
  });

  it("handles wildcard entry", () => {
    const result = normalizeAllowFrom(["*", "745123456"]);

    expect(result).toEqual({
      entries: ["745123456"],
      hasWildcard: true,
      hasEntries: true,
      invalidEntries: [],
    });
  });

  it("strips telegram/tg prefix before validation", () => {
    const result = normalizeAllowFrom(["telegram:123", "tg:-100999", "TG:456"]);

    expect(result).toEqual({
      entries: ["123", "-100999", "456"],
      hasWildcard: false,
      hasEntries: true,
      invalidEntries: [],
    });
  });

  it("returns empty result for undefined input", () => {
    const result = normalizeAllowFrom(undefined);

    expect(result).toEqual({
      entries: [],
      hasWildcard: false,
      hasEntries: false,
      invalidEntries: [],
    });
  });
});
