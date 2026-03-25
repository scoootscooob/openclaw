import type { Command } from "commander";
import { buildHardwareAdapterCatalog } from "../hardware/runtime.js";
import type { RegisteredHardwareAdapter } from "../hardware/types.js";
import { buildPluginStatusReport } from "../plugins/status.js";
import { defaultRuntime } from "../runtime.js";
import { getTerminalTableWidth, renderTable } from "../terminal/table.js";

type HardwareListOptions = {
  json?: boolean;
};

function formatConfiguredState(isConfigured: boolean | undefined): string {
  if (isConfigured === true) {
    return "configured";
  }
  if (isConfigured === false) {
    return "not configured";
  }
  return "unknown";
}

function formatSupportedFeatures(adapter: RegisteredHardwareAdapter): string {
  return adapter.supportedFeatures?.length ? adapter.supportedFeatures.join(", ") : "-";
}

export function formatHardwareAdapterList(adapters: RegisteredHardwareAdapter[]): string {
  if (adapters.length === 0) {
    return "No hardware adapters registered.";
  }

  return renderTable({
    width: getTerminalTableWidth(),
    columns: [
      { key: "Adapter", header: "Adapter", minWidth: 18, flex: true },
      { key: "Plugin", header: "Plugin", minWidth: 16, flex: true },
      { key: "Features", header: "Features", minWidth: 20, flex: true },
      { key: "Status", header: "Status", minWidth: 14 },
    ],
    rows: adapters.map((adapter) => ({
      Adapter: `${adapter.label} (${adapter.id})`,
      Plugin: adapter.pluginId,
      Features: formatSupportedFeatures(adapter),
      Status: formatConfiguredState(adapter.isConfigured),
    })),
  });
}

export function registerHardwareCli(program: Command) {
  const hardware = program.command("hardware").description("Inspect registered hardware adapters");

  hardware
    .command("list")
    .description("List registered hardware adapters")
    .option("--json", "Output JSON", false)
    .action((opts: HardwareListOptions) => {
      const report = buildPluginStatusReport();
      const adapters = buildHardwareAdapterCatalog({
        hardwareAdapters: report.hardwareAdapters,
      });

      if (opts.json) {
        defaultRuntime.writeJson({ adapters });
        return;
      }

      defaultRuntime.log(formatHardwareAdapterList(adapters));
    });
}
