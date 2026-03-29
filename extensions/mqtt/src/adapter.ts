import type {
  HardwareActionResult,
  HardwareAdapterPlugin,
  HardwareAdapterResource,
  HardwareAdapterWatchEvent,
} from "../api.js";
import { MqttHardwareClient, describeMqttAction, type MqttConnectFn } from "./client.js";
import type { MqttHardwareConfig, MqttHardwareResourceConfig } from "./config.js";

function humanizeActionId(actionId: string): string {
  return actionId.replace(/_/g, " ");
}

function summarizeState(resource: MqttHardwareResourceConfig, value: unknown): string | undefined {
  if (resource.summary) {
    return resource.summary;
  }
  if (value === undefined) {
    return undefined;
  }
  return `${resource.name}: ${String(value)}`;
}

function mapConfiguredResourceToAdapterResource(params: {
  resourceId: string;
  resource: MqttHardwareResourceConfig;
  snapshot: Awaited<ReturnType<MqttHardwareClient["getSnapshot"]>>;
}): HardwareAdapterResource {
  const value = params.snapshot?.value;
  return {
    id: params.resourceId,
    name: params.resource.name,
    type: params.resource.type,
    summary: summarizeState(params.resource, value),
    tags: params.resource.tags,
    actions: Object.entries(params.resource.actions ?? {}).map(([actionId, action]) => ({
      id: actionId,
      label: humanizeActionId(actionId),
      description: describeMqttAction(params.resource, actionId, action),
    })),
    state: {
      value,
      observedAt: params.snapshot?.observedAt,
      properties: {
        state_topic: params.resource.stateTopic,
        availability_topic: params.resource.availabilityTopic,
        command_topic: params.resource.commandTopic,
        raw_state: params.snapshot?.rawState,
        parsed_state: params.snapshot?.parsedState,
        raw_availability: params.snapshot?.rawAvailability,
      },
    },
    metadata: {
      source: "mqtt",
      transport: "mqtt",
    },
  };
}

export function createMqttAdapter(params: {
  config: MqttHardwareConfig;
  isConfigured: boolean;
  connectImpl?: MqttConnectFn;
}): HardwareAdapterPlugin {
  const client = new MqttHardwareClient(params.config, params.connectImpl);
  let discoveryStarted = false;

  const ensureDiscovery = async () => {
    if (discoveryStarted || !params.config.discovery?.enabled) {
      return;
    }
    discoveryStarted = true;
    await client.subscribeDiscovery(params.config.discovery.prefix ?? "homeassistant");
  };

  const resolveResourceConfig = (resourceId: string): MqttHardwareResourceConfig | undefined =>
    params.config.resources[resourceId] ?? client.discoveredResources.get(resourceId);

  const readResource = async (resourceId: string): Promise<HardwareAdapterResource | null> => {
    const resource = resolveResourceConfig(resourceId);
    if (!resource) {
      return null;
    }
    return mapConfiguredResourceToAdapterResource({
      resourceId,
      resource,
      snapshot: await client.getSnapshot(resourceId),
    });
  };

  const description = params.config.discovery?.enabled
    ? "MQTT hardware adapter with autodiscovery (Zigbee2MQTT, Tasmota, ESPHome)"
    : "MQTT hardware adapter";

  return {
    id: "mqtt",
    label: "MQTT",
    description,
    isConfigured: params.isConfigured,
    async discover() {
      await ensureDiscovery();
      const resourceIds = await client.listResourceIds();
      return (await Promise.all(resourceIds.map(async (id) => await readResource(id)))).filter(
        (r): r is HardwareAdapterResource => r !== null,
      );
    },
    async list() {
      await ensureDiscovery();
      const resourceIds = await client.listResourceIds();
      return (await Promise.all(resourceIds.map(async (id) => await readResource(id)))).filter(
        (r): r is HardwareAdapterResource => r !== null,
      );
    },
    async get(resourceId) {
      await ensureDiscovery();
      return await readResource(resourceId);
    },
    async set({ resourceId, action }) {
      const result = await client.publishAction(resourceId, action);
      return {
        ok: true,
        resource: await readResource(resourceId),
        result,
      } satisfies HardwareActionResult;
    },
    async watch({ resourceId }, emit) {
      await ensureDiscovery();
      return await client.watch({ resourceId }, (event) => {
        const resourceConfig = resolveResourceConfig(event.resourceId);
        if (!resourceConfig) {
          return;
        }
        emit({
          kind: event.kind,
          resourceId: event.resourceId,
          resource: mapConfiguredResourceToAdapterResource({
            resourceId: event.resourceId,
            resource: resourceConfig,
            snapshot: event.snapshot,
          }),
          observedAt: event.snapshot.observedAt,
        } satisfies HardwareAdapterWatchEvent);
      });
    },
  };
}
