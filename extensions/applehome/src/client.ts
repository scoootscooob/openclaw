import type { AppleHomeConfig } from "./config.js";

/**
 * Represents a HomeKit service (a single controllable characteristic group
 * within an accessory — e.g. "Lightbulb", "Temperature Sensor").
 */
export type HomeKitService = {
  iid: number;
  type: string;
  characteristics: HomeKitCharacteristic[];
};

export type HomeKitCharacteristic = {
  iid: number;
  type: string;
  description?: string;
  value?: unknown;
  perms?: string[];
  minValue?: number;
  maxValue?: number;
  minStep?: number;
};

export type HomeKitAccessory = {
  aid: number;
  services: HomeKitService[];
};

export type DiscoveredDevice = {
  id: string;
  name: string;
  address: string;
  port: number;
  paired: boolean;
};

export class AppleHomeClientError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AppleHomeClientError";
  }
}

// HomeKit service type UUIDs → human-readable names
const SERVICE_TYPE_LABELS: Record<string, string> = {
  "43": "Lightbulb",
  "47": "Outlet",
  "49": "Switch",
  "8A": "Temperature Sensor",
  "82": "Humidity Sensor",
  "85": "Motion Sensor",
  "86": "Occupancy Sensor",
  "89": "Stateless Programmable Switch",
  "41": "Garage Door Opener",
  "45": "Lock Mechanism",
  "4A": "Thermostat",
  "40": "Fan",
  B7: "Fan v2",
  BC: "Window Covering",
  D0: "Door",
  D4: "Air Quality Sensor",
  CC: "Battery Service",
  "7E": "Security System",
  "8D": "Contact Sensor",
  "8E": "Light Sensor",
  "8C": "Leak Sensor",
  "7F": "Smoke Sensor",
  "87": "Carbon Dioxide Sensor",
  "97": "Carbon Monoxide Sensor",
};

// HomeKit characteristic type UUIDs → human-readable names
const CHARACTERISTIC_LABELS: Record<string, string> = {
  "25": "On",
  "8": "Brightness",
  "13": "Hue",
  "2F": "Saturation",
  CE: "Color Temperature",
  "11": "Current Temperature",
  "10": "Current Relative Humidity",
  "22": "Motion Detected",
  "35": "Target Door State",
  E: "Door Current State",
  "1E": "Lock Target State",
  "1D": "Lock Current State",
  "33": "Target Heating Cooling State",
  F: "Heating Cooling State",
  "36": "Target Temperature",
  "6": "Target Position",
  "71": "Status Active",
  "79": "Status Low Battery",
};

function serviceTypeLabel(type: string): string {
  const short = type.replace(/-.*$/, "").replace(/^0+/, "").toUpperCase();
  return SERVICE_TYPE_LABELS[short] ?? `Service-${short}`;
}

function characteristicLabel(type: string): string {
  const short = type.replace(/-.*$/, "").replace(/^0+/, "").toUpperCase();
  return CHARACTERISTIC_LABELS[short] ?? type;
}

export function resolveServiceType(service: HomeKitService): string {
  return serviceTypeLabel(service.type).toLowerCase().replace(/\s+/g, "_");
}

export function resolveServiceLabel(service: HomeKitService): string {
  return serviceTypeLabel(service.type);
}

export function resolveCharacteristicLabel(char: HomeKitCharacteristic): string {
  return characteristicLabel(char.type);
}

export function isWritable(char: HomeKitCharacteristic): boolean {
  return Array.isArray(char.perms) && char.perms.includes("pw");
}

export function isReadable(char: HomeKitCharacteristic): boolean {
  return Array.isArray(char.perms) && char.perms.includes("pr");
}

/**
 * Thin client wrapping hap-controller for HomeKit accessory discovery and control.
 *
 * hap-controller provides:
 * - `HttpClient` — paired IP device control
 * - `IPDiscovery` — mDNS/Bonjour device discovery
 */
export class AppleHomeClient {
  constructor(
    private readonly config: AppleHomeConfig,
    private readonly hapController?: Record<string, unknown>,
  ) {}

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- hap-controller types unavailable until npm install
  private async loadHap(): Promise<any> {
    if (this.hapController) {
      return this.hapController;
    }
    // Dynamic import resolved at runtime after npm install in extension dir.
    return await (Function('return import("hap-controller")')() as Promise<unknown>);
  }

  async discover(): Promise<DiscoveredDevice[]> {
    const hap = await this.loadHap();
    const discovery = new hap.IPDiscovery();
    const devices: DiscoveredDevice[] = [];

    return await new Promise<DiscoveredDevice[]>((resolve) => {
      const timeout = setTimeout(() => {
        discovery.stop();
        resolve(devices);
      }, this.config.discoveryTimeoutMs);

      discovery.on("serviceUp", (service: Record<string, unknown>) => {
        devices.push({
          id: String(service.id ?? ""),
          name: String(service.name ?? service.id ?? "Unknown"),
          address: String(service.address ?? ""),
          port: Number(service.port ?? 0),
          paired: Boolean(service["sf"] === 0),
        });
      });

      discovery.start();

      // Unref timer so it doesn't keep the process alive in tests.
      timeout.unref?.();
    });
  }

  async getAccessories(
    deviceId: string,
    address: string,
    port: number,
  ): Promise<HomeKitAccessory[]> {
    const hap = await this.loadHap();
    if (!this.config.pin) {
      throw new AppleHomeClientError(
        "HomeKit pin required for accessory control. Set plugins.entries.applehome.config.pin.",
      );
    }
    const client = new hap.HttpClient(deviceId, address, port, {
      keys: {},
    });
    try {
      const result = await client.getAccessories();
      return (result?.accessories ?? []) as HomeKitAccessory[];
    } finally {
      client.close?.();
    }
  }

  async setCharacteristic(
    deviceId: string,
    address: string,
    port: number,
    aid: number,
    iid: number,
    value: unknown,
  ): Promise<void> {
    const hap = await this.loadHap();
    if (!this.config.pin) {
      throw new AppleHomeClientError("HomeKit pin required for accessory control.");
    }
    const client = new hap.HttpClient(deviceId, address, port, {
      keys: {},
    });
    try {
      await client.setCharacteristics({ characteristics: [{ aid, iid, value }] });
    } finally {
      client.close?.();
    }
  }
}
