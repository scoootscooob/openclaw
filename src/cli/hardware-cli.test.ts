import { Command } from "commander";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createCliRuntimeCapture } from "./test-runtime-capture.js";

const buildPluginStatusReport = vi.fn();

const { runtimeLogs, defaultRuntime, resetRuntimeCapture } = createCliRuntimeCapture();

vi.mock("../plugins/status.js", () => ({
  buildPluginStatusReport: (...args: unknown[]) => buildPluginStatusReport(...args),
}));

vi.mock("../runtime.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../runtime.js")>()),
  defaultRuntime,
}));

const { formatHardwareAdapterList, registerHardwareCli } = await import("./hardware-cli.js");

describe("hardware-cli", () => {
  async function runCli(args: string[]) {
    const program = new Command();
    registerHardwareCli(program);
    await program.parseAsync(args, { from: "user" });
  }

  beforeEach(() => {
    vi.clearAllMocks();
    resetRuntimeCapture();
    buildPluginStatusReport.mockReturnValue({
      plugins: [],
      diagnostics: [],
      hardwareAdapters: [],
    });
  });

  it("prints a table of registered hardware adapters", async () => {
    buildPluginStatusReport.mockReturnValueOnce({
      plugins: [],
      diagnostics: [],
      hardwareAdapters: [
        {
          id: "homeassistant",
          label: "Home Assistant",
          supportedFeatures: ["list", "watch", "list"],
          isConfigured: true,
          pluginId: "homeassistant",
          pluginName: "Home Assistant",
          source: "/virtual/homeassistant/index.ts",
        },
      ],
    });

    await runCli(["hardware", "list"]);

    expect(runtimeLogs[0]).toContain("Home Assistant (homeassistant)");
    expect(runtimeLogs[0]).toContain("homeassistant");
    expect(runtimeLogs[0]).toContain("list, watch");
    expect(runtimeLogs[0]).toContain("configured");
  });

  it("prints json when requested", async () => {
    const writeJsonSpy = vi.spyOn(defaultRuntime, "writeJson");
    buildPluginStatusReport.mockReturnValueOnce({
      plugins: [],
      diagnostics: [],
      hardwareAdapters: [
        {
          id: "mqtt",
          label: "MQTT",
          supportedFeatures: ["discover"],
          isConfigured: false,
          pluginId: "mqtt",
          pluginName: "MQTT",
          source: "/virtual/mqtt/index.ts",
        },
      ],
    });

    await runCli(["hardware", "list", "--json"]);

    expect(writeJsonSpy).toHaveBeenCalledWith({
      adapters: [
        expect.objectContaining({
          id: "mqtt",
          label: "MQTT",
          supportedFeatures: ["discover"],
          isConfigured: false,
          pluginId: "mqtt",
        }),
      ],
    });
  });

  it("formats an empty registry clearly", () => {
    expect(formatHardwareAdapterList([])).toBe("No hardware adapters registered.");
  });
});
