import { describe, expect, it, vi } from "vitest";
import { createTestPluginApi } from "../../test/helpers/extensions/plugin-api.js";
import plugin from "./index.js";

describe("mqtt plugin entry", () => {
  it("registers the MQTT hardware adapter", () => {
    const registerHardwareAdapter = vi.fn();

    plugin.register(
      createTestPluginApi({
        id: "mqtt",
        name: "MQTT",
        source: "/virtual/mqtt/index.ts",
        config: {},
        runtime: {} as never,
        pluginConfig: {
          url: "mqtt://broker.local:1883",
          resources: {
            desk_lamp: {
              name: "Desk Lamp",
              type: "light",
            },
          },
        },
        registerHardwareAdapter,
      }),
    );

    expect(registerHardwareAdapter).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "mqtt",
        label: "MQTT",
        isConfigured: true,
      }),
    );
  });
});
