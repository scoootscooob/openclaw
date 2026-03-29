export type {
  HardwareActionResult,
  HardwareAdapterFeature,
  HardwareAdapterPlugin,
  HardwareAdapterResource,
  HardwareAdapterWatchEvent,
  HardwareWatchEvent,
  HardwareWatchEventKind,
  HardwareWatchParams,
  OpenClawPluginApi,
  OpenClawPluginConfigSchema,
} from "openclaw/plugin-sdk/core";
export { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";
export {
  MqttHardwareClient,
  MqttHardwareClientError,
  describeMqttAction,
  type MqttConnectFn,
  type MqttHardwareSnapshot,
  type MqttHardwareWatchEvent,
} from "./src/client.js";
export {
  isMqttConfigured,
  mqttConfigJsonSchema,
  mqttConfigSchema,
  mqttConfigUiHints,
  resolveMqttHardwareConfig,
  type MqttDiscoveryConfig,
  type MqttHardwareActionConfig,
  type MqttHardwareConfig,
  type MqttHardwareResourceConfig,
} from "./src/config.js";
export {
  mapDiscoveryToResource,
  parseDiscoveryPayload,
  parseDiscoveryTopic,
  type DiscoveryEntry,
  type DiscoveryPayload,
} from "./src/discovery.js";
