import { describe, expect, it } from "vitest";
import { createEmptyPluginRegistry } from "../plugins/registry-empty.js";
import {
  buildHardwareResourceId,
  getHardwareResource,
  listHardwareAdapters,
  listHardwareResources,
  parseHardwareResourceId,
  runHardwareAction,
  watchHardwareResources,
} from "./service.js";
import type { HardwareAdapterWatchEvent, HardwareWatchEvent } from "./types.js";

function createRegistry() {
  const registry = createEmptyPluginRegistry();
  let lampState = "off";
  let watchListener: ((event: HardwareAdapterWatchEvent) => void) | undefined;

  registry.hardwareAdapters = [
    {
      id: "demo",
      label: "Demo",
      pluginId: "demo-plugin",
      source: "/virtual/demo/index.ts",
      list: async () => [
        {
          id: "lamp",
          name: "Desk Lamp",
          type: "light",
          actions: [
            { id: "turn_on", label: "Turn On" },
            { id: "turn_off", label: "Turn Off" },
          ],
          state: {
            value: lampState,
          },
        },
      ],
      get: async (resourceId) =>
        resourceId === "lamp"
          ? {
              id: "lamp",
              name: "Desk Lamp",
              type: "light",
              state: {
                value: lampState,
              },
            }
          : null,
      set: async ({ resourceId, action }) => {
        if (resourceId !== "lamp") {
          throw new Error("unknown resource");
        }
        lampState = action === "turn_on" ? "on" : "off";
        return {
          ok: true,
          resource: {
            id: "lamp",
            name: "Desk Lamp",
            type: "light",
            state: {
              value: lampState,
            },
          },
        };
      },
      watch: async (_params, emit) => {
        watchListener = emit;
        return () => {
          watchListener = undefined;
        };
      },
    },
  ];

  return {
    registry,
    emitWatch: (value: string) => {
      lampState = value;
      watchListener?.({
        kind: "changed",
        resourceId: "lamp",
        resource: {
          id: "lamp",
          name: "Desk Lamp",
          type: "light",
          state: {
            value,
          },
        },
      });
    },
  };
}

describe("hardware service", () => {
  it("builds and parses stable hardware resource ids", () => {
    expect(buildHardwareResourceId("homeassistant", "light.kitchen")).toBe(
      "homeassistant:light.kitchen",
    );
    expect(parseHardwareResourceId("homeassistant:light.kitchen")).toEqual({
      adapterId: "homeassistant",
      adapterResourceId: "light.kitchen",
    });
  });

  it("lists registered adapters with derived features", () => {
    const adapters = listHardwareAdapters({ registry: createRegistry().registry });
    expect(adapters).toEqual([
      expect.objectContaining({
        id: "demo",
        supportedFeatures: ["get", "list", "set", "watch"],
      }),
    ]);
  });

  it("lists and filters hardware resources", async () => {
    const { registry } = createRegistry();
    await expect(listHardwareResources({ registry })).resolves.toEqual([
      expect.objectContaining({
        id: "demo:lamp",
        adapterId: "demo",
        adapterResourceId: "lamp",
        name: "Desk Lamp",
      }),
    ]);
    await expect(listHardwareResources({ registry, query: "desk" })).resolves.toHaveLength(1);
    await expect(listHardwareResources({ registry, query: "thermostat" })).resolves.toHaveLength(0);
  });

  it("gets a normalized hardware resource", async () => {
    const resource = await getHardwareResource({
      registry: createRegistry().registry,
      id: "demo:lamp",
    });
    expect(resource).toEqual(
      expect.objectContaining({
        id: "demo:lamp",
        adapterId: "demo",
        state: expect.objectContaining({ value: "off" }),
      }),
    );
  });

  it("runs an action and returns updated resource state", async () => {
    const { registry } = createRegistry();
    const result = await runHardwareAction({
      registry,
      id: "demo:lamp",
      action: "turn_on",
    });
    expect(result).toEqual(
      expect.objectContaining({
        ok: true,
        resource: expect.objectContaining({
          id: "demo:lamp",
          state: expect.objectContaining({ value: "on" }),
        }),
      }),
    );
    const resource = await getHardwareResource({ registry, id: "demo:lamp" });
    expect(resource?.state?.value).toBe("on");
  });

  it("normalizes watch events from adapters", async () => {
    const { registry, emitWatch } = createRegistry();
    const events: HardwareWatchEvent[] = [];

    const stop = await watchHardwareResources({
      registry,
      adapterId: "demo",
      emit: (event) => {
        events.push(event);
      },
    });

    emitWatch("on");

    expect(events).toEqual([
      expect.objectContaining({
        adapterId: "demo",
        id: "demo:lamp",
        adapterResourceId: "lamp",
        kind: "changed",
        resource: expect.objectContaining({
          id: "demo:lamp",
          state: expect.objectContaining({
            value: "on",
          }),
        }),
      }),
    ]);

    await stop();
  });
});
