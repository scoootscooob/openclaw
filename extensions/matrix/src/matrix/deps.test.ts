import { describe, expect, it, vi } from "vitest";
import { isMatrixSdkAvailable, isCryptoNativeModuleAvailable } from "./deps.js";

describe("matrix deps availability checks", () => {
  it("isMatrixSdkAvailable returns boolean", () => {
    const result = isMatrixSdkAvailable();
    expect(typeof result).toBe("boolean");
  });

  it("isCryptoNativeModuleAvailable returns boolean", () => {
    const result = isCryptoNativeModuleAvailable();
    expect(typeof result).toBe("boolean");
  });

  it("isCryptoNativeModuleAvailable does not throw on missing module", () => {
    // The function should gracefully return false, not throw,
    // when the native binary is not available.
    expect(() => isCryptoNativeModuleAvailable()).not.toThrow();
  });
});
