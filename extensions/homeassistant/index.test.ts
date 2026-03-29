import { describe, expect, it, vi } from "vitest";
import { createTestPluginApi } from "../../test/helpers/extensions/plugin-api.js";
import plugin from "./index.js";

describe("homeassistant plugin entry", () => {
  it("registers the Home Assistant hardware adapter", () => {
    const registerHardwareAdapter = vi.fn();
    plugin.register(
      createTestPluginApi({
        id: "homeassistant",
        name: "Home Assistant",
        source: "/virtual/homeassistant/index.ts",
        config: {},
        runtime: {} as never,
        pluginConfig: {
          url: "http://homeassistant.local:8123",
          token: "secret",
        },
        registerHardwareAdapter,
      }),
    );

    expect(registerHardwareAdapter).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "homeassistant",
        label: "Home Assistant",
        isConfigured: true,
      }),
    );
  });
});
