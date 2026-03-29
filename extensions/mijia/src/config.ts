import type { OpenClawPluginConfigSchema } from "../api.js";

export type MijiaDeviceEntry = {
  ip: string;
  token: string;
  name?: string;
};

export type MijiaConfig = {
  token?: string;
  devices: MijiaDeviceEntry[];
  discoveryTimeoutMs: number;
};

const DEFAULT_DISCOVERY_TIMEOUT_MS = 8_000;

export const mijiaConfigUiHints = {
  token: {
    label: "Device Token",
    sensitive: true,
    help: "32-character hex token for local device communication.",
  },
  devices: {
    label: "Devices",
    help: "Manually specify devices by IP and token when auto-discovery is unavailable.",
  },
  discoveryTimeoutMs: {
    label: "Discovery Timeout (ms)",
    advanced: true,
  },
} satisfies NonNullable<OpenClawPluginConfigSchema["uiHints"]>;

export const mijiaConfigJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    token: { type: "string", minLength: 32, maxLength: 32 },
    devices: {
      type: "array",
      items: {
        type: "object",
        properties: {
          ip: { type: "string" },
          token: { type: "string", minLength: 32, maxLength: 32 },
          name: { type: "string" },
        },
        required: ["ip", "token"],
      },
    },
    discoveryTimeoutMs: { type: "number", minimum: 1000 },
  },
} satisfies NonNullable<OpenClawPluginConfigSchema["jsonSchema"]>;

function normalizeToken(raw: unknown): string | undefined {
  if (typeof raw !== "string") {
    return undefined;
  }
  const trimmed = raw.trim().toLowerCase();
  return /^[\da-f]{32}$/.test(trimmed) ? trimmed : undefined;
}

function normalizeDevices(raw: unknown): MijiaDeviceEntry[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw
    .filter(
      (entry): entry is Record<string, unknown> =>
        entry != null && typeof entry === "object" && !Array.isArray(entry),
    )
    .map((entry) => ({
      ip: String(entry.ip ?? "").trim(),
      token: String(entry.token ?? "")
        .trim()
        .toLowerCase(),
      name: typeof entry.name === "string" ? entry.name.trim() || undefined : undefined,
    }))
    .filter((entry) => entry.ip && /^[\da-f]{32}$/.test(entry.token));
}

export function resolveMijiaConfig(value: unknown): MijiaConfig {
  const raw =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  const discoveryTimeoutMs =
    typeof raw.discoveryTimeoutMs === "number" && Number.isFinite(raw.discoveryTimeoutMs)
      ? Math.max(1000, Math.floor(raw.discoveryTimeoutMs))
      : DEFAULT_DISCOVERY_TIMEOUT_MS;
  return {
    token: normalizeToken(raw.token),
    devices: normalizeDevices(raw.devices),
    discoveryTimeoutMs,
  };
}

export function isMijiaConfigured(config: MijiaConfig): boolean {
  // Configured if there's a global token (for discovery) or at least one manual device.
  return Boolean(config.token) || config.devices.length > 0;
}

export const mijiaConfigSchema: OpenClawPluginConfigSchema = {
  parse: resolveMijiaConfig,
  uiHints: mijiaConfigUiHints,
  jsonSchema: mijiaConfigJsonSchema,
};
