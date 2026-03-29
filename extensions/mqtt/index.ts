import { defineHardwarePluginEntry } from "openclaw/plugin-sdk/hardware";
import { createMqttAdapter } from "./src/adapter.js";
import { isMqttConfigured, mqttConfigSchema, resolveMqttHardwareConfig } from "./src/config.js";

export default defineHardwarePluginEntry({
  id: "mqtt",
  name: "MQTT",
  description: "Expose mapped MQTT topics through the OpenClaw hardware capability",
  configSchema: mqttConfigSchema,
  parseConfig: resolveMqttHardwareConfig,
  isConfigured: isMqttConfigured,
  createAdapter: (config) => createMqttAdapter({ config, isConfigured: isMqttConfigured(config) }),
});
