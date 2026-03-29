import { describe, expect, it, vi } from "vitest";
import { createEmptyPluginRegistry } from "../plugins/registry-empty.js";
import { createHardwareWatchSubscriptionRegistry } from "./server-hardware-watch.js";

function createRegistry() {
  const registry = createEmptyPluginRegistry();
  let listener:
    | ((event: {
        kind?: "changed";
        resourceId?: string;
        resource?: { id: string; name: string; type: string };
      }) => void)
    | undefined;
  let stopCalls = 0;

  registry.hardwareAdapters = [
    {
      id: "demo",
      label: "Demo",
      pluginId: "demo",
      source: "/virtual/demo/index.ts",
      isConfigured: true,
      watch: async (_params, emit) => {
        listener = emit;
        return () => {
          stopCalls += 1;
          listener = undefined;
        };
      },
    },
  ];

  return {
    registry,
    emitChanged() {
      listener?.({
        kind: "changed",
        resourceId: "lamp",
        resource: {
          id: "lamp",
          name: "Desk Lamp",
          type: "light",
        },
      });
    },
    getStopCalls() {
      return stopCalls;
    },
  };
}

describe("hardware watch subscription registry", () => {
  it("routes watch events to the subscribing connection", async () => {
    const harness = createRegistry();
    const onEvent = vi.fn();
    const subscriptions = createHardwareWatchSubscriptionRegistry({
      registry: harness.registry,
      onEvent,
    });

    const subscriptionId = await subscriptions.subscribe("conn-1", {
      adapterId: "demo",
    });
    harness.emitChanged();

    expect(onEvent).toHaveBeenCalledWith(
      "conn-1",
      subscriptionId,
      expect.objectContaining({
        adapterId: "demo",
        id: "demo:lamp",
      }),
    );
  });

  it("stops watch handles when unsubscribing all connection subscriptions", async () => {
    const harness = createRegistry();
    const subscriptions = createHardwareWatchSubscriptionRegistry({
      registry: harness.registry,
      onEvent() {},
    });

    await subscriptions.subscribe("conn-1", {
      adapterId: "demo",
    });

    await subscriptions.unsubscribeAll("conn-1");

    expect(harness.getStopCalls()).toBe(1);
  });
});
