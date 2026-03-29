import { defineHardwarePluginEntry } from "openclaw/plugin-sdk/hardware";
import { createHomeAssistantAdapter } from "./src/adapter.js";
import {
  homeAssistantConfigSchema,
  isHomeAssistantConfigured,
  resolveHomeAssistantConfig,
} from "./src/config.js";

export default defineHardwarePluginEntry({
  id: "homeassistant",
  name: "Home Assistant",
  description: "Expose Home Assistant entities through the OpenClaw hardware capability",
  configSchema: homeAssistantConfigSchema,
  parseConfig: resolveHomeAssistantConfig,
  isConfigured: isHomeAssistantConfigured,
  createAdapter: (config, api) =>
    createHomeAssistantAdapter({
      api,
      config,
      isConfigured: isHomeAssistantConfigured(config),
    }),
});
