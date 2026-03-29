/**
 * HA MQTT Discovery parser.
 *
 * Zigbee2MQTT, Tasmota, ESPHome, and Shelly all publish HA MQTT Discovery
 * messages at `<prefix>/<component>/<nodeId>/<objectId>/config`.
 * An empty payload means the device was removed.
 *
 * Reference: https://www.home-assistant.io/integrations/mqtt/#mqtt-discovery
 */

import type { MqttHardwareActionConfig, MqttHardwareResourceConfig } from "./config.js";

// HA components we know how to map.
const SUPPORTED_COMPONENTS = new Set([
  "light",
  "switch",
  "binary_sensor",
  "sensor",
  "fan",
  "cover",
  "climate",
  "lock",
  "number",
  "button",
]);

export type DiscoveryEntry = {
  component: string;
  nodeId: string;
  objectId: string;
  /** Composite key for dedup: `<component>/<nodeId>/<objectId>`. */
  key: string;
  payload: DiscoveryPayload;
};

export type DiscoveryPayload = {
  name?: string;
  unique_id?: string;
  state_topic?: string;
  command_topic?: string;
  availability_topic?: string;
  payload_on?: string;
  payload_off?: string;
  brightness_command_topic?: string;
  brightness_state_topic?: string;
  position_topic?: string;
  set_position_topic?: string;
  temperature_command_topic?: string;
  temperature_state_topic?: string;
  mode_command_topic?: string;
  unit_of_measurement?: string;
  device_class?: string;
  device?: {
    name?: string;
    identifiers?: string | string[];
    manufacturer?: string;
    model?: string;
  };
  [key: string]: unknown;
};

/**
 * Parse a discovery topic into its segments.
 * Returns null if the topic doesn't match the expected pattern.
 */
export function parseDiscoveryTopic(
  topic: string,
  prefix: string,
): { component: string; nodeId: string; objectId: string } | null {
  if (!topic.startsWith(prefix + "/")) {
    return null;
  }
  const rest = topic.slice(prefix.length + 1);
  // Expected: <component>/<nodeId>/<objectId>/config
  const parts = rest.split("/");
  if (parts.length < 3 || parts[parts.length - 1] !== "config") {
    return null;
  }
  // Could be <component>/<objectId>/config (no nodeId, used by some devices)
  // or <component>/<nodeId>/<objectId>/config
  const component = parts[0]!;
  if (!SUPPORTED_COMPONENTS.has(component)) {
    return null;
  }
  if (parts.length === 3) {
    // <component>/<objectId>/config
    return { component, nodeId: "", objectId: parts[1]! };
  }
  // <component>/<nodeId>/<objectId>/config
  return { component, nodeId: parts[1]!, objectId: parts[parts.length - 2]! };
}

/**
 * Parse a discovery config payload JSON.
 * Returns null if the payload is empty (device removed) or invalid.
 */
export function parseDiscoveryPayload(raw: string): DiscoveryPayload | null {
  const trimmed = raw.trim();
  if (!trimmed) {
    return null; // Empty payload = device removed per HA protocol.
  }
  try {
    const parsed = JSON.parse(trimmed);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }
    return parsed as DiscoveryPayload;
  } catch {
    return null;
  }
}

function resolveResourceName(entry: DiscoveryEntry): string {
  const deviceName = entry.payload.device?.name;
  const entityName = entry.payload.name;
  if (deviceName && entityName && entityName !== deviceName) {
    return `${deviceName} ${entityName}`;
  }
  return entityName ?? deviceName ?? entry.objectId;
}

function mapComponentToType(component: string): string {
  switch (component) {
    case "light":
      return "light";
    case "switch":
      return "switch";
    case "binary_sensor":
    case "sensor":
      return "sensor";
    case "fan":
      return "fan";
    case "cover":
      return "cover";
    case "climate":
      return "climate";
    case "lock":
      return "lock";
    case "number":
      return "number";
    case "button":
      return "button";
    default:
      return component;
  }
}

function buildActions(entry: DiscoveryEntry): Record<string, MqttHardwareActionConfig> | undefined {
  const { component, payload } = entry;
  const commandTopic = payload.command_topic;
  if (!commandTopic) {
    return undefined;
  }

  const actions: Record<string, MqttHardwareActionConfig> = {};

  switch (component) {
    case "light":
    case "switch":
    case "fan": {
      const payloadOn = payload.payload_on ?? "ON";
      const payloadOff = payload.payload_off ?? "OFF";
      actions.turn_on = { payload: String(payloadOn), topic: commandTopic };
      actions.turn_off = { payload: String(payloadOff), topic: commandTopic };
      break;
    }
    case "cover":
      actions.open = { payload: "OPEN", topic: commandTopic };
      actions.close = { payload: "CLOSE", topic: commandTopic };
      actions.stop = { payload: "STOP", topic: commandTopic };
      break;
    case "lock":
      actions.lock = { payload: "LOCK", topic: commandTopic };
      actions.unlock = { payload: "UNLOCK", topic: commandTopic };
      break;
    case "button":
      actions.press = { payload: "PRESS", topic: commandTopic };
      break;
    default:
      break;
  }

  return Object.keys(actions).length > 0 ? actions : undefined;
}

function buildTags(entry: DiscoveryEntry): string[] | undefined {
  const tags: string[] = [];
  if (entry.payload.device_class) {
    tags.push(entry.payload.device_class);
  }
  if (entry.payload.device?.manufacturer) {
    tags.push(entry.payload.device.manufacturer);
  }
  if (entry.payload.unit_of_measurement) {
    tags.push(entry.payload.unit_of_measurement);
  }
  return tags.length > 0 ? tags : undefined;
}

/**
 * Map a parsed discovery entry into a `MqttHardwareResourceConfig`.
 */
export function mapDiscoveryToResource(entry: DiscoveryEntry): MqttHardwareResourceConfig {
  return {
    name: resolveResourceName(entry),
    type: mapComponentToType(entry.component),
    summary: entry.payload.device_class
      ? `${entry.payload.device_class} (${entry.component})`
      : undefined,
    stateTopic: entry.payload.state_topic,
    availabilityTopic: entry.payload.availability_topic,
    commandTopic: entry.payload.command_topic,
    tags: buildTags(entry),
    actions: buildActions(entry),
  };
}
