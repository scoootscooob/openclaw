import { beforeEach, describe, expect, it, vi } from "vitest";
import { createEmptyPluginRegistry } from "../../plugins/registry-empty.js";
import { setActivePluginRegistry } from "../../plugins/runtime.js";
import type { GatewayRequestContext } from "./types.js";

let hardwareHandlers: typeof import("./hardware.js").hardwareHandlers;

async function loadFreshHardwareHandlers() {
  vi.resetModules();
  ({ hardwareHandlers } = await import("./hardware.js"));
}

function makeContext(): GatewayRequestContext {
  return {
    dedupe: new Map(),
    logGateway: {
      info() {},
      warn() {},
      error() {},
      debug() {},
    },
    subscribeHardwareWatch: async () => "sub-1",
    unsubscribeHardwareWatch: async () => true,
  } as unknown as GatewayRequestContext;
}

async function runHandler(
  method: keyof typeof hardwareHandlers,
  params: Record<string, unknown>,
  client: { connId?: string; connect: unknown } | null = null,
) {
  const respond = vi.fn();
  await hardwareHandlers[method]({
    params: params as never,
    respond,
    context: makeContext(),
    req: { type: "req", id: "1", method },
    client: client as never,
    isWebchatConnect: () => false,
  });
  return respond;
}

describe("hardware gateway handlers", () => {
  beforeEach(async () => {
    const registry = createEmptyPluginRegistry();
    let lampState = "off";
    registry.hardwareAdapters = [
      {
        id: "demo",
        label: "Demo",
        pluginId: "demo",
        source: "/virtual/demo/index.ts",
        isConfigured: true,
        list: async () => [
          {
            id: "lamp",
            name: "Desk Lamp",
            type: "light",
            state: { value: lampState, available: true },
            actions: [{ id: "turn_on" }, { id: "turn_off" }],
          },
        ],
        get: async (resourceId) =>
          resourceId === "lamp"
            ? {
                id: "lamp",
                name: "Desk Lamp",
                type: "light",
                state: { value: lampState, available: true },
                actions: [{ id: "turn_on" }, { id: "turn_off" }],
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
              state: { value: lampState, available: true },
            },
          };
        },
      },
    ];
    setActivePluginRegistry(registry, "hardware-test");
    await loadFreshHardwareHandlers();
  });

  it("lists adapters", async () => {
    const respond = await runHandler("hardware.adapters.list", {});
    expect(respond).toHaveBeenCalledWith(
      true,
      {
        adapters: [
          expect.objectContaining({
            id: "demo",
            supportedFeatures: ["get", "list", "set"],
          }),
        ],
      },
      undefined,
    );
  });

  it("lists resources", async () => {
    const respond = await runHandler("hardware.resources.list", {});
    expect(respond).toHaveBeenCalledWith(
      true,
      {
        resources: [
          expect.objectContaining({
            id: "demo:lamp",
            adapterId: "demo",
            name: "Desk Lamp",
          }),
        ],
      },
      undefined,
    );
  });

  it("gets a resource by composite id", async () => {
    const respond = await runHandler("hardware.resource.get", { id: "demo:lamp" });
    expect(respond).toHaveBeenCalledWith(
      true,
      {
        resource: expect.objectContaining({
          id: "demo:lamp",
          state: expect.objectContaining({ value: "off" }),
        }),
      },
      undefined,
    );
  });

  it("runs a resource action", async () => {
    const respond = await runHandler("hardware.resource.action", {
      id: "demo:lamp",
      action: "turn_on",
    });
    expect(respond).toHaveBeenCalledWith(
      true,
      expect.objectContaining({
        ok: true,
        resource: expect.objectContaining({
          id: "demo:lamp",
          state: expect.objectContaining({ value: "on" }),
        }),
      }),
      undefined,
    );
  });

  it("subscribes to hardware watch events", async () => {
    const respond = vi.fn();
    await hardwareHandlers["hardware.watch.subscribe"]({
      params: { id: "demo:lamp" },
      respond,
      context: makeContext(),
      req: { type: "req", id: "1", method: "hardware.watch.subscribe" },
      client: { connId: "conn-1", connect: {} as never },
      isWebchatConnect: () => false,
    });

    expect(respond).toHaveBeenCalledWith(
      true,
      {
        subscribed: true,
        subscriptionId: "sub-1",
        adapterId: "demo",
        id: "demo:lamp",
      },
      undefined,
    );
  });

  it("unsubscribes from hardware watch events", async () => {
    const respond = await runHandler(
      "hardware.watch.unsubscribe",
      {
        subscriptionId: "sub-1",
      },
      { connId: "conn-1", connect: {} },
    );
    expect(respond).toHaveBeenCalledWith(
      true,
      {
        subscribed: false,
        removed: true,
        subscriptionId: "sub-1",
      },
      undefined,
    );
  });
});
