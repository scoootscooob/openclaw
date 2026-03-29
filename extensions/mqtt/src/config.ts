import type { OpenClawPluginConfigSchema } from "../api.js";

export type MqttHardwareActionConfig = {
  payload: string;
  topic?: string;
  qos?: 0 | 1 | 2;
  retain?: boolean;
};

export type MqttHardwareResourceConfig = {
  name: string;
  type: string;
  summary?: string;
  stateTopic?: string;
  availabilityTopic?: string;
  commandTopic?: string;
  tags?: string[];
  stateMap?: Record<string, unknown>;
  availabilityMap?: Record<string, boolean>;
  actions?: Record<string, MqttHardwareActionConfig>;
};

export type MqttDiscoveryConfig = {
  enabled?: boolean;
  /** MQTT topic prefix for HA discovery (default: "homeassistant"). */
  prefix?: string;
};

export type MqttHardwareConfig = {
  url?: string;
  username?: string;
  password?: string;
  clientId?: string;
  qos: 0 | 1 | 2;
  resources: Record<string, MqttHardwareResourceConfig>;
  discovery?: MqttDiscoveryConfig;
};

const DEFAULT_QOS = 0 as const;

function normalizeString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed || undefined;
}

function normalizeQos(value: unknown): 0 | 1 | 2 | undefined {
  if (value !== 0 && value !== 1 && value !== 2) {
    return undefined;
  }
  return value;
}

function normalizeStringList(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const normalized = value
    .map((entry) => normalizeString(entry))
    .filter((entry): entry is string => Boolean(entry));
  return normalized.length > 0 ? normalized : undefined;
}

function normalizeBooleanMap(value: unknown): Record<string, boolean> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const entries = Object.entries(value)
    .map(([key, entryValue]) => [key.trim(), entryValue] as const)
    .filter(
      (entry): entry is [string, boolean] => Boolean(entry[0]) && typeof entry[1] === "boolean",
    );
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

function normalizeUnknownMap(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const entries = Object.entries(value)
    .map(([key, entryValue]) => [key.trim(), entryValue] as const)
    .filter(([key]) => Boolean(key));
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

function normalizeActionConfig(value: unknown): MqttHardwareActionConfig | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const raw = value as Record<string, unknown>;
  const payload = normalizeString(raw.payload);
  if (!payload) {
    return undefined;
  }
  return {
    payload,
    topic: normalizeString(raw.topic),
    qos: normalizeQos(raw.qos),
    retain: raw.retain === true ? true : undefined,
  };
}

function normalizeActionMap(value: unknown): Record<string, MqttHardwareActionConfig> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const entries = Object.entries(value)
    .map(([key, entryValue]) => [key.trim(), normalizeActionConfig(entryValue)] as const)
    .filter(
      (entry): entry is [string, MqttHardwareActionConfig] =>
        Boolean(entry[0]) && Boolean(entry[1]),
    );
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

function normalizeResourceConfig(value: unknown): MqttHardwareResourceConfig | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const raw = value as Record<string, unknown>;
  const name = normalizeString(raw.name);
  const type = normalizeString(raw.type);
  if (!name || !type) {
    return undefined;
  }
  return {
    name,
    type,
    summary: normalizeString(raw.summary),
    stateTopic: normalizeString(raw.stateTopic),
    availabilityTopic: normalizeString(raw.availabilityTopic),
    commandTopic: normalizeString(raw.commandTopic),
    tags: normalizeStringList(raw.tags),
    stateMap: normalizeUnknownMap(raw.stateMap),
    availabilityMap: normalizeBooleanMap(raw.availabilityMap),
    actions: normalizeActionMap(raw.actions),
  };
}

function normalizeResources(value: unknown): Record<string, MqttHardwareResourceConfig> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(value)
      .map(([key, entryValue]) => [key.trim(), normalizeResourceConfig(entryValue)] as const)
      .filter(
        (entry): entry is [string, MqttHardwareResourceConfig] =>
          Boolean(entry[0]) && Boolean(entry[1]),
      ),
  );
}

function normalizeDiscoveryConfig(value: unknown): MqttDiscoveryConfig | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const raw = value as Record<string, unknown>;
  if (raw.enabled !== true) {
    return undefined;
  }
  return {
    enabled: true,
    prefix: normalizeString(raw.prefix) ?? "homeassistant",
  };
}

export function resolveMqttHardwareConfig(value: unknown): MqttHardwareConfig {
  const raw =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  return {
    url: normalizeString(raw.url),
    username: normalizeString(raw.username),
    password: normalizeString(raw.password),
    clientId: normalizeString(raw.clientId),
    qos: normalizeQos(raw.qos) ?? DEFAULT_QOS,
    resources: normalizeResources(raw.resources),
    discovery: normalizeDiscoveryConfig(raw.discovery),
  };
}

export function isMqttConfigured(config: MqttHardwareConfig): boolean {
  return Boolean(
    config.url && (Object.keys(config.resources).length > 0 || config.discovery?.enabled),
  );
}

export const mqttConfigUiHints = {
  url: {
    label: "Broker URL",
    placeholder: "mqtt://broker.local:1883",
  },
  username: {
    label: "Username",
  },
  password: {
    label: "Password",
    sensitive: true,
  },
  clientId: {
    label: "Client ID",
    advanced: true,
  },
  qos: {
    label: "Default QoS",
    advanced: true,
  },
  resources: {
    label: "Resources",
    help: "Map OpenClaw resource ids to MQTT topics and action payloads.",
  },
} satisfies NonNullable<OpenClawPluginConfigSchema["uiHints"]>;

export const mqttConfigJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    url: {
      type: "string",
      minLength: 1,
    },
    username: {
      type: "string",
      minLength: 1,
    },
    password: {
      type: "string",
      minLength: 1,
    },
    clientId: {
      type: "string",
      minLength: 1,
    },
    qos: {
      type: "number",
      enum: [0, 1, 2],
    },
    resources: {
      type: "object",
      additionalProperties: {
        type: "object",
        additionalProperties: false,
        properties: {
          name: {
            type: "string",
            minLength: 1,
          },
          type: {
            type: "string",
            minLength: 1,
          },
          summary: {
            type: "string",
          },
          stateTopic: {
            type: "string",
            minLength: 1,
          },
          availabilityTopic: {
            type: "string",
            minLength: 1,
          },
          commandTopic: {
            type: "string",
            minLength: 1,
          },
          tags: {
            type: "array",
            items: {
              type: "string",
            },
          },
          stateMap: {
            type: "object",
            additionalProperties: true,
          },
          availabilityMap: {
            type: "object",
            additionalProperties: {
              type: "boolean",
            },
          },
          actions: {
            type: "object",
            additionalProperties: {
              type: "object",
              additionalProperties: false,
              properties: {
                payload: {
                  type: "string",
                  minLength: 1,
                },
                topic: {
                  type: "string",
                  minLength: 1,
                },
                qos: {
                  type: "number",
                  enum: [0, 1, 2],
                },
                retain: {
                  type: "boolean",
                },
              },
              required: ["payload"],
            },
          },
        },
        required: ["name", "type"],
      },
    },
  },
} satisfies NonNullable<OpenClawPluginConfigSchema["jsonSchema"]>;

export const mqttConfigSchema: OpenClawPluginConfigSchema = {
  parse: resolveMqttHardwareConfig,
  uiHints: mqttConfigUiHints,
  jsonSchema: mqttConfigJsonSchema,
};
