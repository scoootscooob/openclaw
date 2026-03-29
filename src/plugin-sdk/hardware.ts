/**
 * Shared helpers for hardware adapter plugins.
 *
 * Mirrors the channel plugin pattern: `defineChannelPluginEntry` wraps
 * `definePluginEntry` with channel-specific registration;
 * `defineHardwarePluginEntry` does the same for hardware adapters.
 */

import type { HardwareAdapterPlugin } from "../hardware/types.js";
import { emptyPluginConfigSchema } from "../plugins/config-schema.js";
import type { OpenClawPluginApi, OpenClawPluginConfigSchema } from "../plugins/types.js";
import { definePluginEntry } from "./plugin-entry.js";

export type DefineHardwarePluginEntryOptions<TConfig> = {
  id: string;
  name: string;
  description: string;
  configSchema?: OpenClawPluginConfigSchema;
  /** Parse raw plugin config into a typed config object. */
  parseConfig: (raw: unknown) => TConfig;
  /** Return true if the adapter has enough config to operate. */
  isConfigured: (config: TConfig) => boolean;
  /** Create the adapter from the parsed config. */
  createAdapter: (config: TConfig, api: OpenClawPluginApi) => HardwareAdapterPlugin;
};

/**
 * Define a hardware adapter plugin entry.
 *
 * Handles the boilerplate: parse config → check configured → register adapter.
 * Each extension only provides the three functions that differ.
 *
 * ```ts
 * export default defineHardwarePluginEntry({
 *   id: "mqtt",
 *   name: "MQTT",
 *   description: "...",
 *   configSchema: mqttConfigSchema,
 *   parseConfig: resolveMqttConfig,
 *   isConfigured: isMqttConfigured,
 *   createAdapter: (config) => createMqttAdapter({ config, isConfigured: true }),
 * });
 * ```
 */
export function defineHardwarePluginEntry<TConfig>(
  options: DefineHardwarePluginEntryOptions<TConfig>,
) {
  return definePluginEntry({
    id: options.id,
    name: options.name,
    description: options.description,
    configSchema: options.configSchema ?? emptyPluginConfigSchema,
    register(api: OpenClawPluginApi) {
      const config = options.parseConfig(api.pluginConfig);
      api.registerHardwareAdapter(options.createAdapter(config, api));
    },
  });
}
