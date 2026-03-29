import type {
  HardwareActionResult,
  HardwareAdapterPlugin,
  HardwareAdapterResource,
  OpenClawPluginApi,
} from "../api.js";
import {
  AppleHomeClient,
  isWritable,
  resolveCharacteristicLabel,
  resolveServiceLabel,
  resolveServiceType,
  type DiscoveredDevice,
  type HomeKitAccessory,
  type HomeKitService,
} from "./client.js";
import type { AppleHomeConfig } from "./config.js";

// Map HomeKit service types to actions the agent can invoke.
const SERVICE_ACTIONS: Record<string, Array<{ id: string; label: string }>> = {
  lightbulb: [
    { id: "turn_on", label: "Turn On" },
    { id: "turn_off", label: "Turn Off" },
  ],
  outlet: [
    { id: "turn_on", label: "Turn On" },
    { id: "turn_off", label: "Turn Off" },
  ],
  switch: [
    { id: "turn_on", label: "Turn On" },
    { id: "turn_off", label: "Turn Off" },
  ],
  fan: [
    { id: "turn_on", label: "Turn On" },
    { id: "turn_off", label: "Turn Off" },
  ],
  fan_v2: [
    { id: "turn_on", label: "Turn On" },
    { id: "turn_off", label: "Turn Off" },
  ],
  lock_mechanism: [
    { id: "lock", label: "Lock" },
    { id: "unlock", label: "Unlock" },
  ],
  garage_door_opener: [
    { id: "open", label: "Open" },
    { id: "close", label: "Close" },
  ],
  thermostat: [
    { id: "set_temperature", label: "Set Temperature" },
    { id: "turn_off", label: "Turn Off" },
  ],
  window_covering: [
    { id: "open", label: "Open" },
    { id: "close", label: "Close" },
  ],
};

// Characteristic type short UUIDs for On (0x25) and target characteristics.
const ON_CHARACTERISTIC = "25";
const LOCK_TARGET_STATE = "1E";
const TARGET_DOOR_STATE = "35";
const TARGET_POSITION = "6";
const TARGET_TEMPERATURE = "35";

type DeviceWithAccessories = {
  device: DiscoveredDevice;
  accessories: HomeKitAccessory[];
};

function serviceToResource(
  device: DiscoveredDevice,
  accessory: HomeKitAccessory,
  service: HomeKitService,
): HardwareAdapterResource {
  const svcType = resolveServiceType(service);
  const svcLabel = resolveServiceLabel(service);
  const resourceId = `${device.id}:${accessory.aid}:${service.iid}`;

  // Read current state from characteristics.
  const stateProperties: Record<string, unknown> = {};
  let primaryValue: unknown;
  for (const char of service.characteristics) {
    const label = resolveCharacteristicLabel(char);
    stateProperties[label] = char.value;
    // The "On" characteristic is the primary state for most accessories.
    const shortType = char.type.replace(/-.*$/, "").replace(/^0+/, "").toUpperCase();
    if (shortType === ON_CHARACTERISTIC) {
      primaryValue = char.value;
    }
  }

  const actions = SERVICE_ACTIONS[svcType] ?? [];

  return {
    id: resourceId,
    name: `${device.name} ${svcLabel}`,
    type: svcType,
    summary: `${svcLabel} on ${device.name}`,
    actions,
    state: {
      value: primaryValue,
      properties: stateProperties,
    },
    tags: [svcType, "homekit"],
    metadata: {
      deviceId: device.id,
      address: device.address,
      port: device.port,
      aid: accessory.aid,
      iid: service.iid,
    },
  };
}

function findCharacteristicIid(service: HomeKitService, shortType: string): number | undefined {
  for (const char of service.characteristics) {
    const normalized = char.type.replace(/-.*$/, "").replace(/^0+/, "").toUpperCase();
    if (normalized === shortType && isWritable(char)) {
      return char.iid;
    }
  }
  return undefined;
}

export function createAppleHomeAdapter(params: {
  api: OpenClawPluginApi;
  config: AppleHomeConfig;
  isConfigured: boolean;
}): HardwareAdapterPlugin {
  const client = new AppleHomeClient(params.config);

  // Cache discovered devices + accessories for get/set lookups.
  let cachedDevices: DeviceWithAccessories[] = [];

  const discoverAll = async (): Promise<HardwareAdapterResource[]> => {
    const devices = await client.discover();
    const results: HardwareAdapterResource[] = [];
    const devicesWithAccessories: DeviceWithAccessories[] = [];

    for (const device of devices) {
      if (!device.paired || !params.config.pin) {
        // Unpaired or no pin — still list the device but without service details.
        results.push({
          id: device.id,
          name: device.name,
          type: "homekit_device",
          summary: device.paired ? "Paired device (no pin configured)" : "Unpaired device",
          tags: ["homekit"],
          metadata: {
            deviceId: device.id,
            address: device.address,
            port: device.port,
            paired: device.paired,
          },
        });
        continue;
      }

      try {
        const accessories = await client.getAccessories(device.id, device.address, device.port);
        devicesWithAccessories.push({ device, accessories });
        for (const accessory of accessories) {
          for (const service of accessory.services) {
            // Skip the AccessoryInformation service (type 0x3E).
            const shortType = service.type.replace(/-.*$/, "").replace(/^0+/, "").toUpperCase();
            if (shortType === "3E") {
              continue;
            }
            results.push(serviceToResource(device, accessory, service));
          }
        }
      } catch {
        // If we can't fetch accessories, list the device anyway.
        results.push({
          id: device.id,
          name: device.name,
          type: "homekit_device",
          summary: "Failed to fetch accessories",
          tags: ["homekit"],
          metadata: { deviceId: device.id, address: device.address, port: device.port },
        });
      }
    }

    cachedDevices = devicesWithAccessories;
    return results;
  };

  const findCachedResource = (resourceId: string) => {
    for (const { device, accessories } of cachedDevices) {
      for (const accessory of accessories) {
        for (const service of accessory.services) {
          const id = `${device.id}:${accessory.aid}:${service.iid}`;
          if (id === resourceId) {
            return { device, accessory, service };
          }
        }
      }
    }
    return null;
  };

  return {
    id: "applehome",
    label: "Apple Home",
    description: "Discover and control HomeKit accessories on the local network",
    isConfigured: params.isConfigured,

    async discover() {
      return await discoverAll();
    },

    async list() {
      return await discoverAll();
    },

    async get(resourceId) {
      // Re-discover to get fresh state.
      await discoverAll();
      const found = findCachedResource(resourceId);
      if (!found) {
        return null;
      }
      return serviceToResource(found.device, found.accessory, found.service);
    },

    async set({ resourceId, action, input }): Promise<HardwareActionResult> {
      const found = findCachedResource(resourceId);
      if (!found) {
        return { ok: false, result: `Resource not found: ${resourceId}` };
      }
      const { device, accessory, service } = found;
      const svcType = resolveServiceType(service);

      // Resolve which characteristic to write based on the action.
      let charIid: number | undefined;
      let value: unknown;

      if (action === "turn_on") {
        charIid = findCharacteristicIid(service, ON_CHARACTERISTIC);
        value = true;
      } else if (action === "turn_off") {
        charIid = findCharacteristicIid(service, ON_CHARACTERISTIC);
        value = false;
      } else if (action === "lock") {
        charIid = findCharacteristicIid(service, LOCK_TARGET_STATE);
        value = 1;
      } else if (action === "unlock") {
        charIid = findCharacteristicIid(service, LOCK_TARGET_STATE);
        value = 0;
      } else if (action === "open") {
        if (svcType === "garage_door_opener") {
          charIid = findCharacteristicIid(service, TARGET_DOOR_STATE);
          value = 0; // Open
        } else {
          charIid = findCharacteristicIid(service, TARGET_POSITION);
          value = 100;
        }
      } else if (action === "close") {
        if (svcType === "garage_door_opener") {
          charIid = findCharacteristicIid(service, TARGET_DOOR_STATE);
          value = 1; // Closed
        } else {
          charIid = findCharacteristicIid(service, TARGET_POSITION);
          value = 0;
        }
      } else if (action === "set_temperature" && input?.temperature !== undefined) {
        charIid = findCharacteristicIid(service, TARGET_TEMPERATURE);
        value = input.temperature;
      }

      if (charIid === undefined) {
        return { ok: false, result: `No writable characteristic for action: ${action}` };
      }

      await client.setCharacteristic(
        device.id,
        device.address,
        device.port,
        accessory.aid,
        charIid,
        value,
      );

      // Re-read state after action.
      const updated = await this.get?.(resourceId);
      return { ok: true, resource: updated };
    },
  };
}
