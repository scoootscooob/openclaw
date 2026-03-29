import type {
  HardwareActionResult,
  HardwareAdapterPlugin,
  HardwareAdapterResource,
  OpenClawPluginApi,
} from "../api.js";
import {
  MijiaClient,
  resolveActionsForType,
  resolveDeviceType,
  type MijiaDevice,
} from "./client.js";
import type { MijiaConfig } from "./config.js";

function deviceToResource(device: MijiaDevice): HardwareAdapterResource {
  const type = resolveDeviceType(device.model ?? "unknown");
  const actions = resolveActionsForType(type);

  return {
    id: device.id,
    name: device.name ?? device.ip,
    type,
    summary: device.model ? `${device.name ?? device.ip} (${device.model})` : device.ip,
    actions,
    state: {
      value: undefined,
      properties: {
        model: device.model,
        ip: device.ip,
      },
    },
    tags: [type, "mijia"],
    metadata: {
      ip: device.ip,
      model: device.model,
    },
  };
}

export function createMijiaAdapter(params: {
  api: OpenClawPluginApi;
  config: MijiaConfig;
  isConfigured: boolean;
}): HardwareAdapterPlugin {
  const client = new MijiaClient(params.config);

  // Cache last discovery for get lookups.
  let cachedDevices: MijiaDevice[] = [];

  return {
    id: "mijia",
    label: "Xiaomi Mijia",
    description: "Discover and control Xiaomi smart home devices via MiIO protocol",
    isConfigured: params.isConfigured,

    async discover() {
      cachedDevices = await client.discover();
      return cachedDevices.map(deviceToResource);
    },

    async list() {
      cachedDevices = await client.discover();
      return cachedDevices.map(deviceToResource);
    },

    async get(resourceId) {
      const device = await client.getDevice(resourceId);
      return device ? deviceToResource(device) : null;
    },

    async set({ resourceId, action, input }): Promise<HardwareActionResult> {
      try {
        const result = await client.callAction(resourceId, action, input);
        const device = await client.getDevice(resourceId);
        return {
          ok: true,
          resource: device ? deviceToResource(device) : undefined,
          result,
        };
      } catch (error) {
        return {
          ok: false,
          result: error instanceof Error ? error.message : String(error),
        };
      }
    },
  };
}
