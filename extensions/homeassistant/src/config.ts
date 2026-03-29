import type { OpenClawPluginConfigSchema } from "../api.js";

export type HomeAssistantConfig = {
  url?: string;
  token?: string;
  timeoutMs: number;
};

const DEFAULT_TIMEOUT_MS = 15_000;

export const homeAssistantConfigUiHints = {
  url: {
    label: "URL",
    placeholder: "http://homeassistant.local:8123",
  },
  token: {
    label: "Access Token",
    sensitive: true,
  },
  timeoutMs: {
    label: "Timeout (ms)",
    advanced: true,
  },
} satisfies NonNullable<OpenClawPluginConfigSchema["uiHints"]>;

export const homeAssistantConfigJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    url: {
      type: "string",
      minLength: 1,
    },
    token: {
      type: "string",
      minLength: 1,
    },
    timeoutMs: {
      type: "number",
      minimum: 100,
    },
  },
} satisfies NonNullable<OpenClawPluginConfigSchema["jsonSchema"]>;

function normalizeUrl(raw: unknown): string | undefined {
  if (typeof raw !== "string") {
    return undefined;
  }
  const trimmed = raw.trim();
  if (!trimmed) {
    return undefined;
  }
  return trimmed.replace(/\/+$/, "");
}

function normalizeToken(raw: unknown): string | undefined {
  if (typeof raw !== "string") {
    return undefined;
  }
  const trimmed = raw.trim();
  return trimmed || undefined;
}

export function resolveHomeAssistantConfig(value: unknown): HomeAssistantConfig {
  const raw =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  const timeoutMs =
    typeof raw.timeoutMs === "number" && Number.isFinite(raw.timeoutMs)
      ? Math.max(100, Math.floor(raw.timeoutMs))
      : DEFAULT_TIMEOUT_MS;
  return {
    url: normalizeUrl(raw.url),
    token: normalizeToken(raw.token),
    timeoutMs,
  };
}

export function isHomeAssistantConfigured(config: HomeAssistantConfig): boolean {
  return Boolean(config.url && config.token);
}

export const homeAssistantConfigSchema: OpenClawPluginConfigSchema = {
  parse: resolveHomeAssistantConfig,
  uiHints: homeAssistantConfigUiHints,
  jsonSchema: homeAssistantConfigJsonSchema,
};
