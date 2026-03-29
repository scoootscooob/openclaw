import { describe, expect, it, vi } from "vitest";
import { resolveAppleHomeConfig, isAppleHomeConfigured } from "./src/config.js";

describe("applehome plugin", () => {
  it("resolves config with defaults", () => {
    const config = resolveAppleHomeConfig({});
    expect(config.discoveryTimeoutMs).toBe(10_000);
    expect(config.pin).toBeUndefined();
  });

  it("resolves config with explicit values", () => {
    const config = resolveAppleHomeConfig({
      pin: "031-45-154",
      discoveryTimeoutMs: 5000,
    });
    expect(config.pin).toBe("031-45-154");
    expect(config.discoveryTimeoutMs).toBe(5000);
  });

  it("is always configured since HomeKit uses mDNS discovery", () => {
    expect(isAppleHomeConfigured(resolveAppleHomeConfig({}))).toBe(true);
  });

  it("clamps discovery timeout minimum", () => {
    const config = resolveAppleHomeConfig({ discoveryTimeoutMs: 100 });
    expect(config.discoveryTimeoutMs).toBe(1000);
  });
});
