import type { OpenClawPluginConfigSchema } from "../api.js";

export type AppleHomeConfig = {
  pin?: string;
  discoveryTimeoutMs: number;
};

const DEFAULT_DISCOVERY_TIMEOUT_MS = 10_000;

export const appleHomeConfigUiHints = {
  pin: {
    label: "HomeKit Setup Code",
    placeholder: "031-45-154",
    sensitive: true,
  },
  discoveryTimeoutMs: {
    label: "Discovery Timeout (ms)",
    advanced: true,
  },
} satisfies NonNullable<OpenClawPluginConfigSchema["uiHints"]>;

export const appleHomeConfigJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    pin: {
      type: "string",
      minLength: 1,
    },
    discoveryTimeoutMs: {
      type: "number",
      minimum: 1000,
    },
  },
} satisfies NonNullable<OpenClawPluginConfigSchema["jsonSchema"]>;

function normalizePin(raw: unknown): string | undefined {
  if (typeof raw !== "string") {
    return undefined;
  }
  const trimmed = raw.trim();
  return trimmed || undefined;
}

export function resolveAppleHomeConfig(value: unknown): AppleHomeConfig {
  const raw =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  const discoveryTimeoutMs =
    typeof raw.discoveryTimeoutMs === "number" && Number.isFinite(raw.discoveryTimeoutMs)
      ? Math.max(1000, Math.floor(raw.discoveryTimeoutMs))
      : DEFAULT_DISCOVERY_TIMEOUT_MS;
  return {
    pin: normalizePin(raw.pin),
    discoveryTimeoutMs,
  };
}

export function isAppleHomeConfigured(_config: AppleHomeConfig): boolean {
  // Apple Home uses mDNS discovery; no credentials required for read-only.
  // Pin is only needed for pairing (write operations).
  return true;
}

export const appleHomeConfigSchema: OpenClawPluginConfigSchema = {
  parse: resolveAppleHomeConfig,
  uiHints: appleHomeConfigUiHints,
  jsonSchema: appleHomeConfigJsonSchema,
};
