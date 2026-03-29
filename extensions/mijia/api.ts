export type {
  HardwareActionResult,
  HardwareAdapterPlugin,
  HardwareAdapterResource,
  HardwareAdapterFeature,
  HardwareAdapterWatchEvent,
  OpenClawPluginApi,
  OpenClawPluginConfigSchema,
} from "openclaw/plugin-sdk/core";
export { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";
export {
  MijiaClient,
  MijiaClientError,
  type MijiaDevice,
  type MijiaProperty,
} from "./src/client.js";
export {
  mijiaConfigSchema,
  isMijiaConfigured,
  resolveMijiaConfig,
  type MijiaConfig,
  type MijiaDeviceEntry,
} from "./src/config.js";
