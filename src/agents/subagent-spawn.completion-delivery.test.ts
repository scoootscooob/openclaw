import { describe, expect, it } from "vitest";
import { resolveExpectsCompletionMessage } from "./subagent-completion-delivery.js";

describe("resolveExpectsCompletionMessage", () => {
  it("returns true by default (no config, no caller override)", () => {
    expect(resolveExpectsCompletionMessage(undefined, undefined)).toBe(true);
  });

  it("returns true when config is 'user'", () => {
    expect(resolveExpectsCompletionMessage(undefined, "user")).toBe(true);
  });

  it("returns false when config is 'internal'", () => {
    expect(resolveExpectsCompletionMessage(undefined, "internal")).toBe(false);
  });

  it("returns false when config is 'internal' even if caller explicitly passes true", () => {
    expect(resolveExpectsCompletionMessage(true, "internal")).toBe(false);
  });

  it("returns false when caller explicitly passes false", () => {
    expect(resolveExpectsCompletionMessage(false, undefined)).toBe(false);
  });

  it("returns false when caller passes false and config is 'user'", () => {
    expect(resolveExpectsCompletionMessage(false, "user")).toBe(false);
  });

  it("returns true when caller explicitly passes true and no config", () => {
    expect(resolveExpectsCompletionMessage(true, undefined)).toBe(true);
  });
});
