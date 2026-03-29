import { defineHardwarePluginEntry } from "openclaw/plugin-sdk/hardware";
import { createMijiaAdapter } from "./src/adapter.js";
import { isMijiaConfigured, mijiaConfigSchema, resolveMijiaConfig } from "./src/config.js";

export default defineHardwarePluginEntry({
  id: "mijia",
  name: "Xiaomi Mijia",
  description: "Expose Xiaomi smart home devices through the OpenClaw hardware capability",
  configSchema: mijiaConfigSchema,
  parseConfig: resolveMijiaConfig,
  isConfigured: isMijiaConfigured,
  createAdapter: (config, api) =>
    createMijiaAdapter({ api, config, isConfigured: isMijiaConfigured(config) }),
});
