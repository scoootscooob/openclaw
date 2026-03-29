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
  AppleHomeClient,
  AppleHomeClientError,
  type HomeKitAccessory,
  type HomeKitService,
} from "./src/client.js";
export {
  appleHomeConfigSchema,
  isAppleHomeConfigured,
  resolveAppleHomeConfig,
  type AppleHomeConfig,
} from "./src/config.js";
