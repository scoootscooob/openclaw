import { defineHardwarePluginEntry } from "openclaw/plugin-sdk/hardware";
import { createAppleHomeAdapter } from "./src/adapter.js";
import {
  appleHomeConfigSchema,
  isAppleHomeConfigured,
  resolveAppleHomeConfig,
} from "./src/config.js";

export default defineHardwarePluginEntry({
  id: "applehome",
  name: "Apple Home",
  description: "Expose HomeKit accessories through the OpenClaw hardware capability",
  configSchema: appleHomeConfigSchema,
  parseConfig: resolveAppleHomeConfig,
  isConfigured: isAppleHomeConfigured,
  createAdapter: (config, api) =>
    createAppleHomeAdapter({ api, config, isConfigured: isAppleHomeConfigured(config) }),
});
