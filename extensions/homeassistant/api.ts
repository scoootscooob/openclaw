export type {
  HardwareActionResult,
  HardwareAdapterPlugin,
  HardwareAdapterResource,
  HardwareAdapterFeature,
  OpenClawPluginApi,
  OpenClawPluginConfigSchema,
} from "openclaw/plugin-sdk/core";
export { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";
export {
  HomeAssistantClient,
  HomeAssistantClientError,
  type HomeAssistantState,
} from "./src/client.js";
export {
  homeAssistantConfigJsonSchema,
  homeAssistantConfigSchema,
  homeAssistantConfigUiHints,
  isHomeAssistantConfigured,
  resolveHomeAssistantConfig,
  type HomeAssistantConfig,
} from "./src/config.js";
