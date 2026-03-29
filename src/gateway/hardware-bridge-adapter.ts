import type { AhpManifest, AhpResource } from "../hardware/bridge-protocol.js";
import type {
  HardwareActionResult,
  HardwareAdapterPlugin,
  HardwareAdapterResource,
  HardwareAdapterWatchEvent,
} from "../hardware/types.js";
import type { NodeInvokeResult, NodeRegistry } from "./node-registry.js";

function requireOk(result: NodeInvokeResult, command: string): unknown {
  if (!result.ok) {
    const msg = result.error?.message ?? "bridge invoke failed";
    throw new Error(`bridge ${command}: ${msg}`);
  }
  const payload = result.payloadJSON ? JSON.parse(result.payloadJSON) : result.payload;
  return payload;
}

/** Map AHP resource to hardware adapter resource. */
function toAdapterResource(res: AhpResource): HardwareAdapterResource {
  return {
    id: res.id,
    name: res.label,
    type: res.type,
    summary: res.description,
    actions: res.commands?.map((cmd) => ({
      id: cmd.id,
      label: cmd.label,
      description: cmd.description,
    })),
    state: res.properties?.reduce(
      (acc, prop) => {
        if (prop.observable) {
          acc.properties = acc.properties ?? {};
          acc.properties[prop.id] = undefined;
        }
        return acc;
      },
      {} as { value?: unknown; properties?: Record<string, unknown> },
    ),
    metadata: res.metadata,
  };
}

export type BridgeStateEvent = {
  kind: "changed" | "discovered" | "removed";
  resourceId: string;
  resource?: HardwareAdapterResource | null;
  observedAt?: string;
};

/**
 * Creates a `HardwareAdapterPlugin` backed by a connected bridge node.
 * All adapter calls are translated into `node.invoke` commands using AHP methods.
 */
export function createBridgeAdapter(params: {
  nodeId: string;
  nodeRegistry: NodeRegistry;
  manifest: AhpManifest;
  label?: string;
  firmware?: string;
}): HardwareAdapterPlugin & { handleBridgeEvent: (event: BridgeStateEvent) => void } {
  const { nodeId, nodeRegistry } = params;
  let resources = params.manifest.resources.map(toAdapterResource);

  const invoke = async (command: string, invokeParams?: unknown) =>
    await nodeRegistry.invoke({ nodeId, command, params: invokeParams });

  let watchEmit: ((event: HardwareAdapterWatchEvent) => void) | null = null;

  const adapter: HardwareAdapterPlugin & {
    handleBridgeEvent: (event: BridgeStateEvent) => void;
  } = {
    id: `bridge:${nodeId}`,
    label: params.label ?? nodeId,
    description: params.firmware
      ? `Hardware bridge (firmware ${params.firmware})`
      : "Hardware bridge",
    isConfigured: true,
    supportedFeatures: ["list", "get", "set", "watch", "discover"],

    async list() {
      return resources;
    },

    async get(resourceId) {
      const raw = requireOk(
        await invoke("ahp.property.read", { resourceId, propertyId: "*" }),
        "ahp.property.read",
      );
      const result = raw as { resource?: HardwareAdapterResource } | null;
      return result?.resource ?? null;
    },

    async set(actionParams) {
      const raw = requireOk(
        await invoke("ahp.command.invoke", {
          resourceId: actionParams.resourceId,
          commandId: actionParams.action,
          input: actionParams.input,
        }),
        "ahp.command.invoke",
      );
      const response = raw as HardwareActionResult | null;
      return {
        ok: response?.ok ?? true,
        resource: response?.resource,
        result: response?.result,
      };
    },

    async discover() {
      const result = await invoke("ahp.manifest.update");
      if (!result.ok) {
        return resources;
      }
      const payload = result.payloadJSON ? JSON.parse(result.payloadJSON) : result.payload;
      const manifest = payload as { resources?: AhpResource[] } | null;
      if (Array.isArray(manifest?.resources)) {
        resources = manifest.resources.map(toAdapterResource);
        return resources;
      }
      return resources;
    },

    async watch(_watchParams, emit) {
      watchEmit = emit;
      await invoke("ahp.subscribe", {
        resourceId: _watchParams.resourceId,
      });
      return async () => {
        watchEmit = null;
        await invoke("ahp.unsubscribe", {});
      };
    },

    handleBridgeEvent(event: BridgeStateEvent) {
      if (!watchEmit) {
        return;
      }
      watchEmit({
        kind: event.kind,
        resourceId: event.resourceId,
        resource: event.resource ?? undefined,
        observedAt: event.observedAt,
      });
    },
  };

  return adapter;
}

export type BridgeHardwareAdapter = ReturnType<typeof createBridgeAdapter>;
