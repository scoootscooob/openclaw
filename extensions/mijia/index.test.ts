import { describe, expect, it } from "vitest";
import { isMijiaConfigured, resolveMijiaConfig } from "./src/config.js";

describe("mijia plugin", () => {
  it("resolves config with defaults", () => {
    const config = resolveMijiaConfig({});
    expect(config.discoveryTimeoutMs).toBe(8_000);
    expect(config.token).toBeUndefined();
    expect(config.devices).toEqual([]);
  });

  it("resolves config with global token", () => {
    const config = resolveMijiaConfig({
      token: "ffffffffffffffffffffffffffffffff",
    });
    expect(config.token).toBe("ffffffffffffffffffffffffffffffff");
  });

  it("rejects invalid tokens", () => {
    const config = resolveMijiaConfig({ token: "too-short" });
    expect(config.token).toBeUndefined();
  });

  it("parses manual device entries", () => {
    const config = resolveMijiaConfig({
      devices: [
        { ip: "192.168.1.100", token: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1", name: "Desk Lamp" },
        { ip: "192.168.1.101", token: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbb22" },
        { ip: "", token: "invalid" },
      ],
    });
    expect(config.devices).toHaveLength(2);
    expect(config.devices[0]?.name).toBe("Desk Lamp");
    expect(config.devices[1]?.name).toBeUndefined();
  });

  it("is configured with global token", () => {
    expect(
      isMijiaConfigured(resolveMijiaConfig({ token: "ffffffffffffffffffffffffffffffff" })),
    ).toBe(true);
  });

  it("is configured with manual devices", () => {
    expect(
      isMijiaConfigured(
        resolveMijiaConfig({
          devices: [{ ip: "192.168.1.100", token: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1" }],
        }),
      ),
    ).toBe(true);
  });

  it("is not configured when empty", () => {
    expect(isMijiaConfigured(resolveMijiaConfig({}))).toBe(false);
  });
});
