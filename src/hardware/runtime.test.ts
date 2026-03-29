import { describe, expect, it } from "vitest";
import { buildHardwareAdapterCatalog } from "./runtime.js";

describe("buildHardwareAdapterCatalog", () => {
  it("sorts adapters and normalizes duplicate features", () => {
    const catalog = buildHardwareAdapterCatalog({
      hardwareAdapters: [
        {
          id: "matter",
          label: "Matter",
          supportedFeatures: ["watch", "discover", "watch"],
          pluginId: "matter",
          source: "/virtual/matter/index.ts",
        },
        {
          id: "homeassistant",
          label: "Home Assistant",
          supportedFeatures: ["list", "get"],
          pluginId: "homeassistant",
          source: "/virtual/homeassistant/index.ts",
        },
      ],
    });

    expect(catalog).toEqual([
      expect.objectContaining({
        id: "homeassistant",
        label: "Home Assistant",
        supportedFeatures: ["get", "list"],
      }),
      expect.objectContaining({
        id: "matter",
        label: "Matter",
        supportedFeatures: ["discover", "watch"],
      }),
    ]);
  });
});
