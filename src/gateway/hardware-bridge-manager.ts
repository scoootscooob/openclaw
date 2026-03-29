import type { AhpManifest } from "../hardware/bridge-protocol.js";
import type { RegisteredHardwareAdapter } from "../hardware/types.js";
import {
  createBridgeAdapter,
  type BridgeHardwareAdapter,
  type BridgeStateEvent,
} from "./hardware-bridge-adapter.js";
import type { NodeRegistry, NodeSession } from "./node-registry.js";

export const HARDWARE_BRIDGE_CAP = "hardware-bridge";

export type HardwareBridgeManager = {
  onNodeConnected: (session: NodeSession) => Promise<void>;
  onNodeDisconnected: (nodeId: string) => void;
  handleBridgeEvent: (nodeId: string, event: BridgeStateEvent) => void;
  getAdapters: () => RegisteredHardwareAdapter[];
};

function isBridgeNode(session: NodeSession): boolean {
  return Array.isArray(session.caps) && session.caps.includes(HARDWARE_BRIDGE_CAP);
}

function parseAhpManifest(session: NodeSession): AhpManifest | null {
  const raw = (session as unknown as Record<string, unknown>).bridgeManifest;
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const manifest = raw as Record<string, unknown>;
  if (!Array.isArray(manifest.resources)) {
    return null;
  }
  return raw as AhpManifest;
}

export function createHardwareBridgeManager(params: {
  nodeRegistry: NodeRegistry;
  onAdapterAdded?: (adapter: RegisteredHardwareAdapter) => void;
  onAdapterRemoved?: (adapterId: string) => void;
}): HardwareBridgeManager {
  const { nodeRegistry } = params;
  const bridges = new Map<string, BridgeHardwareAdapter>();

  return {
    async onNodeConnected(session) {
      if (!isBridgeNode(session)) {
        return;
      }

      // Try inline manifest first, then fetch via invoke.
      let manifest = parseAhpManifest(session);
      if (!manifest) {
        const result = await nodeRegistry.invoke({
          nodeId: session.nodeId,
          command: "ahp.hello",
          timeoutMs: 10_000,
        });
        if (result.ok) {
          const payload = result.payloadJSON ? JSON.parse(result.payloadJSON) : result.payload;
          if (
            payload &&
            typeof payload === "object" &&
            Array.isArray((payload as Record<string, unknown>).resources)
          ) {
            manifest = payload as AhpManifest;
          }
        }
      }

      if (!manifest || manifest.resources.length === 0) {
        return;
      }

      const label = (session as unknown as Record<string, unknown>).label as string | undefined;
      const firmware = (session as unknown as Record<string, unknown>).firmware as
        | string
        | undefined;

      const adapter = createBridgeAdapter({
        nodeId: session.nodeId,
        nodeRegistry,
        manifest,
        label: label ?? session.displayName ?? session.nodeId,
        firmware,
      });

      const registered: RegisteredHardwareAdapter = {
        ...adapter,
        pluginId: `bridge:${session.nodeId}`,
        pluginName: label ?? session.displayName ?? session.nodeId,
        source: "bridge",
        rootDir: undefined,
      };

      bridges.set(session.nodeId, adapter);
      params.onAdapterAdded?.(registered);
    },

    onNodeDisconnected(nodeId) {
      const adapter = bridges.get(nodeId);
      if (!adapter) {
        return;
      }
      bridges.delete(nodeId);
      params.onAdapterRemoved?.(adapter.id);
    },

    handleBridgeEvent(nodeId, event) {
      const adapter = bridges.get(nodeId);
      if (!adapter) {
        return;
      }
      adapter.handleBridgeEvent(event);
    },

    getAdapters() {
      return [...bridges.values()].map((adapter) => ({
        ...adapter,
        pluginId: adapter.id,
        source: "bridge",
      })) as RegisteredHardwareAdapter[];
    },
  };
}
