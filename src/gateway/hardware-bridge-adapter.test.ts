import { describe, expect, it, vi } from "vitest";
import type { AhpManifest } from "../hardware/bridge-protocol.js";
import { createBridgeAdapter } from "./hardware-bridge-adapter.js";

function createMockNodeRegistry() {
  const invoke = vi.fn();
  return {
    invoke,
    registry: { invoke } as unknown as import("./node-registry.js").NodeRegistry,
  };
}

const TEST_MANIFEST: AhpManifest = {
  resources: [
    {
      id: "led",
      type: "light",
      label: "Status LED",
      commands: [{ id: "turn_on" }, { id: "turn_off" }],
      properties: [{ id: "on", type: "boolean", observable: true, writable: true }],
    },
    {
      id: "temp",
      type: "sensor",
      label: "Temperature",
      properties: [{ id: "temperature", type: "number", unit: "celsius", observable: true }],
    },
  ],
};

describe("createBridgeAdapter", () => {
  it("creates adapter with bridge:nodeId id", () => {
    const { registry } = createMockNodeRegistry();
    const adapter = createBridgeAdapter({
      nodeId: "esp32-abc",
      nodeRegistry: registry,
      manifest: TEST_MANIFEST,
      label: "Test Bridge",
      firmware: "0.1.0",
    });
    expect(adapter.id).toBe("bridge:esp32-abc");
    expect(adapter.label).toBe("Test Bridge");
    expect(adapter.isConfigured).toBe(true);
  });

  it("list returns adapter resources mapped from AHP manifest", async () => {
    const { registry } = createMockNodeRegistry();
    const adapter = createBridgeAdapter({
      nodeId: "esp32-abc",
      nodeRegistry: registry,
      manifest: TEST_MANIFEST,
    });
    const resources = await adapter.list!();
    expect(resources).toHaveLength(2);
    expect(resources[0].id).toBe("led");
    expect(resources[0].name).toBe("Status LED");
    expect(resources[1].id).toBe("temp");
  });

  it("get invokes ahp.property.read on the node", async () => {
    const { registry, invoke } = createMockNodeRegistry();
    invoke.mockResolvedValueOnce({
      ok: true,
      payloadJSON: JSON.stringify({
        resource: { id: "led", name: "Status LED", type: "light", state: { value: "on" } },
      }),
    });
    const adapter = createBridgeAdapter({
      nodeId: "esp32-abc",
      nodeRegistry: registry,
      manifest: TEST_MANIFEST,
    });
    const resource = await adapter.get!("led");
    expect(invoke).toHaveBeenCalledWith({
      nodeId: "esp32-abc",
      command: "ahp.property.read",
      params: { resourceId: "led", propertyId: "*" },
    });
    expect(resource?.state?.value).toBe("on");
  });

  it("set invokes ahp.command.invoke on the node", async () => {
    const { registry, invoke } = createMockNodeRegistry();
    invoke.mockResolvedValueOnce({
      ok: true,
      payloadJSON: JSON.stringify({ ok: true, resource: null }),
    });
    const adapter = createBridgeAdapter({
      nodeId: "esp32-abc",
      nodeRegistry: registry,
      manifest: TEST_MANIFEST,
    });
    const result = await adapter.set!({
      resourceId: "led",
      action: "turn_on",
      input: { brightness: 100 },
    });
    expect(invoke).toHaveBeenCalledWith({
      nodeId: "esp32-abc",
      command: "ahp.command.invoke",
      params: { resourceId: "led", commandId: "turn_on", input: { brightness: 100 } },
    });
    expect(result.ok).toBe(true);
  });

  it("watch starts subscription and routes events", async () => {
    const { registry, invoke } = createMockNodeRegistry();
    invoke.mockResolvedValue({ ok: true });
    const adapter = createBridgeAdapter({
      nodeId: "esp32-abc",
      nodeRegistry: registry,
      manifest: TEST_MANIFEST,
    });

    const events: unknown[] = [];
    const stop = await adapter.watch!({ resourceId: "led" }, (event) => {
      events.push(event);
    });

    expect(invoke).toHaveBeenCalledWith({
      nodeId: "esp32-abc",
      command: "ahp.subscribe",
      params: { resourceId: "led" },
    });

    adapter.handleBridgeEvent({
      kind: "changed",
      resourceId: "led",
      resource: { id: "led", name: "Status LED", type: "light", state: { value: "on" } },
    });

    expect(events).toHaveLength(1);
    expect(events[0]).toEqual(expect.objectContaining({ kind: "changed", resourceId: "led" }));

    await stop!();
    expect(invoke).toHaveBeenCalledWith({
      nodeId: "esp32-abc",
      command: "ahp.unsubscribe",
      params: {},
    });
  });

  it("throws on failed invoke", async () => {
    const { registry, invoke } = createMockNodeRegistry();
    invoke.mockResolvedValueOnce({
      ok: false,
      error: { code: "NOT_CONNECTED", message: "node not connected" },
    });
    const adapter = createBridgeAdapter({
      nodeId: "esp32-abc",
      nodeRegistry: registry,
      manifest: TEST_MANIFEST,
    });
    await expect(adapter.get!("led")).rejects.toThrow("node not connected");
  });
});
