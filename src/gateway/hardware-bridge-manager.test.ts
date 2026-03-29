import { describe, expect, it, vi } from "vitest";
import type { AhpManifest } from "../hardware/bridge-protocol.js";
import type { RegisteredHardwareAdapter } from "../hardware/types.js";
import { createHardwareBridgeManager, HARDWARE_BRIDGE_CAP } from "./hardware-bridge-manager.js";
import type { NodeSession } from "./node-registry.js";

const TEST_MANIFEST: AhpManifest = {
  resources: [
    {
      id: "led",
      type: "light",
      label: "LED Strip",
      commands: [{ id: "turn_on", label: "Turn on" }],
    },
  ],
};

function createMockNodeRegistry() {
  return {
    invoke: vi.fn().mockResolvedValue({ ok: true }),
  } as unknown as import("./node-registry.js").NodeRegistry;
}

function createBridgeSession(overrides?: Partial<NodeSession>): NodeSession {
  return {
    nodeId: "esp32-kitchen",
    connId: "conn-1",
    client: {} as NodeSession["client"],
    caps: [HARDWARE_BRIDGE_CAP],
    commands: [],
    connectedAtMs: Date.now(),
    displayName: "Kitchen Bridge",
    bridgeManifest: TEST_MANIFEST,
    ...overrides,
  } as NodeSession;
}

describe("hardware bridge manager", () => {
  it("registers adapter when bridge node connects with inline manifest", async () => {
    const registry = createMockNodeRegistry();
    const added: RegisteredHardwareAdapter[] = [];
    const manager = createHardwareBridgeManager({
      nodeRegistry: registry,
      onAdapterAdded: (adapter) => added.push(adapter),
    });

    await manager.onNodeConnected(createBridgeSession());

    expect(added).toHaveLength(1);
    expect(added[0]?.id).toBe("bridge:esp32-kitchen");
    expect(added[0]?.pluginId).toBe("bridge:esp32-kitchen");
  });

  it("fetches manifest via invoke when not inline", async () => {
    const registry = createMockNodeRegistry();
    const invokeFn = vi.fn().mockResolvedValue({
      ok: true,
      payload: TEST_MANIFEST,
    });
    (registry as unknown as Record<string, unknown>).invoke = invokeFn;

    const added: RegisteredHardwareAdapter[] = [];
    const manager = createHardwareBridgeManager({
      nodeRegistry: registry,
      onAdapterAdded: (adapter) => added.push(adapter),
    });

    const session = createBridgeSession();
    delete (session as Record<string, unknown>).bridgeManifest;

    await manager.onNodeConnected(session);

    expect(invokeFn).toHaveBeenCalledWith(expect.objectContaining({ command: "ahp.hello" }));
    expect(added).toHaveLength(1);
  });

  it("ignores non-bridge nodes", async () => {
    const registry = createMockNodeRegistry();
    const added: RegisteredHardwareAdapter[] = [];
    const manager = createHardwareBridgeManager({
      nodeRegistry: registry,
      onAdapterAdded: (adapter) => added.push(adapter),
    });

    await manager.onNodeConnected(createBridgeSession({ caps: ["some-other-cap"] }));

    expect(added).toHaveLength(0);
  });

  it("removes adapter on disconnect", async () => {
    const registry = createMockNodeRegistry();
    const removed: string[] = [];
    const manager = createHardwareBridgeManager({
      nodeRegistry: registry,
      onAdapterRemoved: (id) => removed.push(id),
    });

    await manager.onNodeConnected(createBridgeSession());
    manager.onNodeDisconnected("esp32-kitchen");

    expect(removed).toEqual(["bridge:esp32-kitchen"]);
  });

  it("routes bridge events to adapter", async () => {
    const registry = createMockNodeRegistry();
    const manager = createHardwareBridgeManager({ nodeRegistry: registry });

    await manager.onNodeConnected(createBridgeSession());

    // Should not throw even without active watch subscribers
    manager.handleBridgeEvent("esp32-kitchen", {
      kind: "changed",
      resourceId: "led",
    });
  });
});
