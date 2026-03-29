import type { MijiaConfig, MijiaDeviceEntry } from "./config.js";

export type MijiaProperty = {
  siid: number;
  piid: number;
  value?: unknown;
  description?: string;
};

export type MijiaDevice = {
  id: string;
  ip: string;
  token: string;
  model?: string;
  name?: string;
  properties: MijiaProperty[];
};

export class MijiaClientError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MijiaClientError";
  }
}

// Model → human-readable device type mapping.
const MODEL_TYPES: Record<string, string> = {
  "yeelink.light": "light",
  "philips.light": "light",
  "cuco.plug": "switch",
  "chuangmi.plug": "switch",
  "lumi.sensor_ht": "sensor",
  "lumi.weather": "sensor",
  "lumi.gateway": "gateway",
  "roborock.vacuum": "vacuum",
  "dreame.vacuum": "vacuum",
  "zhimi.airpurifier": "air_purifier",
  "zhimi.humidifier": "humidifier",
  "zhimi.fan": "fan",
  "dmaker.fan": "fan",
  "lumi.curtain": "curtain",
  "lumi.lock": "lock",
};

// Model prefix → supported actions.
const MODEL_ACTIONS: Record<string, Array<{ id: string; label: string }>> = {
  light: [
    { id: "turn_on", label: "Turn On" },
    { id: "turn_off", label: "Turn Off" },
    { id: "set_brightness", label: "Set Brightness" },
  ],
  switch: [
    { id: "turn_on", label: "Turn On" },
    { id: "turn_off", label: "Turn Off" },
  ],
  fan: [
    { id: "turn_on", label: "Turn On" },
    { id: "turn_off", label: "Turn Off" },
    { id: "set_speed", label: "Set Speed" },
  ],
  vacuum: [
    { id: "start", label: "Start Cleaning" },
    { id: "pause", label: "Pause" },
    { id: "stop", label: "Stop" },
    { id: "home", label: "Return to Dock" },
  ],
  air_purifier: [
    { id: "turn_on", label: "Turn On" },
    { id: "turn_off", label: "Turn Off" },
    { id: "set_mode", label: "Set Mode" },
  ],
  humidifier: [
    { id: "turn_on", label: "Turn On" },
    { id: "turn_off", label: "Turn Off" },
  ],
  curtain: [
    { id: "open", label: "Open" },
    { id: "close", label: "Close" },
  ],
  lock: [
    { id: "lock", label: "Lock" },
    { id: "unlock", label: "Unlock" },
  ],
};

function resolveDeviceType(model: string): string {
  for (const [prefix, type] of Object.entries(MODEL_TYPES)) {
    if (model.startsWith(prefix)) {
      return type;
    }
  }
  return "unknown";
}

function resolveActionsForType(type: string): Array<{ id: string; label: string }> {
  return MODEL_ACTIONS[type] ?? [];
}

/**
 * Client for Xiaomi MiIO protocol communication.
 *
 * Uses the `miio` npm package for local network discovery and device control.
 * The MiIO protocol sends encrypted UDP packets to devices on port 54321.
 */
export class MijiaClient {
  private connectedDevices = new Map<string, { device: unknown; entry: MijiaDeviceEntry }>();

  constructor(
    private readonly config: MijiaConfig,
    private readonly miioModule?: Record<string, unknown>,
  ) {}

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- miio types unavailable until npm install
  private async loadMiio(): Promise<any> {
    if (this.miioModule) {
      return this.miioModule;
    }
    // Dynamic import resolved at runtime after npm install in extension dir.
    return await (Function('return import("miio")')() as Promise<unknown>);
  }

  async discover(): Promise<MijiaDevice[]> {
    const miio = await this.loadMiio();
    const devices: MijiaDevice[] = [];

    // First: manually configured devices.
    for (const entry of this.config.devices) {
      try {
        const device = await miio.device({ address: entry.ip, token: entry.token });
        const model = String(device.miioModel ?? device.model ?? "unknown");
        devices.push({
          id: entry.ip,
          ip: entry.ip,
          token: entry.token,
          model,
          name: entry.name ?? model,
          properties: [],
        });
        this.connectedDevices.set(entry.ip, { device, entry });
      } catch {
        // Device unreachable — still list it with limited info.
        devices.push({
          id: entry.ip,
          ip: entry.ip,
          token: entry.token,
          name: entry.name ?? entry.ip,
          properties: [],
        });
      }
    }

    // Second: auto-discovery on local network (if token is available).
    if (this.config.token) {
      try {
        const browser = miio.browse({ cacheTime: 0 });
        await new Promise<void>((resolve) => {
          const timeout = setTimeout(() => {
            browser.stop?.();
            resolve();
          }, this.config.discoveryTimeoutMs);

          browser.on?.("available", (info: Record<string, unknown>) => {
            const ip = String(info.address ?? "");
            if (ip && !this.connectedDevices.has(ip)) {
              devices.push({
                id: ip,
                ip,
                token: this.config.token!,
                model: String(info.model ?? "unknown"),
                name: String(info.hostname ?? info.model ?? ip),
                properties: [],
              });
            }
          });

          timeout.unref?.();
        });
      } catch {
        // Discovery failed — continue with manual devices.
      }
    }

    return devices;
  }

  async getDevice(ip: string): Promise<MijiaDevice | null> {
    const cached = this.connectedDevices.get(ip);
    if (!cached) {
      return null;
    }
    const device = cached.device as Record<string, unknown>;
    const model = String(device.miioModel ?? device.model ?? "unknown");
    return {
      id: ip,
      ip,
      token: cached.entry.token,
      model,
      name: cached.entry.name ?? model,
      properties: [],
    };
  }

  async callAction(ip: string, action: string, params?: Record<string, unknown>): Promise<unknown> {
    const cached = this.connectedDevices.get(ip);
    if (!cached) {
      throw new MijiaClientError(`Device not connected: ${ip}`);
    }
    const device = cached.device as Record<string, (...args: unknown[]) => Promise<unknown>>;

    // Map generic actions to miio method calls.
    switch (action) {
      case "turn_on":
        return await device.setPower?.(true);
      case "turn_off":
        return await device.setPower?.(false);
      case "set_brightness":
        return await device.setBrightness?.(params?.brightness ?? 100);
      case "set_speed":
        return await device.setSpeed?.(params?.speed ?? 1);
      case "set_mode":
        return await device.setMode?.(params?.mode ?? "auto");
      case "start":
        return await device.start?.();
      case "pause":
        return await device.pause?.();
      case "stop":
        return await device.stop?.();
      case "home":
        return await device.home?.();
      case "open":
        return await device.open?.();
      case "close":
        return await device.close?.();
      case "lock":
        return await device.lock?.();
      case "unlock":
        return await device.unlock?.();
      case "set_temperature":
        return await device.setTargetTemperature?.(params?.temperature ?? 22);
      default:
        throw new MijiaClientError(`Unknown action: ${action}`);
    }
  }

  async destroy(): Promise<void> {
    for (const [, { device }] of this.connectedDevices) {
      try {
        const d = device as Record<string, () => void>;
        d.destroy?.();
      } catch {
        // Ignore cleanup errors.
      }
    }
    this.connectedDevices.clear();
  }
}

export { resolveDeviceType, resolveActionsForType };
