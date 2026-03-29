import { Command } from "commander";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createCliRuntimeCapture } from "./test-runtime-capture.js";

const callGatewayFromCli = vi.fn();
const addGatewayClientOptions = vi.fn((command: Command) => command);
const connectGatewayForEvents = vi.fn();

const { runtimeErrors, runtimeLogs, defaultRuntime, resetRuntimeCapture } =
  createCliRuntimeCapture();

vi.mock("./gateway-rpc.js", () => ({
  addGatewayClientOptions,
  callGatewayFromCli,
}));

vi.mock("../gateway/call.js", () => ({
  connectGatewayForEvents,
}));

vi.mock("../utils/message-channel.js", () => ({
  GATEWAY_CLIENT_NAMES: { CLI: "cli" },
  GATEWAY_CLIENT_MODES: { CLI: "cli" },
}));

vi.mock("../runtime.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../runtime.js")>()),
  defaultRuntime,
}));

const { formatHardwareAdapterList, formatHardwareResourceList, registerHardwareCli } =
  await import("./hardware-cli.js");

describe("hardware-cli", () => {
  async function runCli(args: string[]) {
    const program = new Command();
    registerHardwareCli(program);
    try {
      await program.parseAsync(args, { from: "user" });
    } catch (err) {
      if (!(err instanceof Error && err.message.startsWith("__exit__:"))) {
        throw err;
      }
    }
  }

  beforeEach(() => {
    vi.clearAllMocks();
    resetRuntimeCapture();
    callGatewayFromCli.mockResolvedValue({ adapters: [], resources: [] });
  });

  it("prints a table of registered hardware adapters", async () => {
    callGatewayFromCli.mockResolvedValueOnce({
      adapters: [
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

    await runCli(["hardware", "adapters"]);

    expect(runtimeLogs[0]).toContain("Home Assistant (homeassistant)");
    expect(runtimeLogs[0]).toContain("homeassistant");
    expect(runtimeLogs[0]).toContain("list, watch");
    expect(runtimeLogs[0]).toContain("configured");
  });

  it("prints adapter json when requested", async () => {
    const writeJsonSpy = vi.spyOn(defaultRuntime, "writeJson");
    callGatewayFromCli.mockResolvedValueOnce({
      adapters: [
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

    await runCli(["hardware", "adapters", "--json"]);

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

  it("lists hardware resources through the gateway", async () => {
    callGatewayFromCli.mockResolvedValueOnce({
      resources: [
        {
          id: "homeassistant:light.office",
          adapterId: "homeassistant",
          adapterResourceId: "light.office",
          adapterLabel: "Home Assistant",
          name: "Office Lamp",
          type: "light",
          actions: [{ id: "turn_on" }, { id: "turn_off" }],
          state: { value: "off" },
          pluginId: "homeassistant",
        },
      ],
    });

    await runCli(["hardware", "list", "--adapter", "homeassistant"]);

    expect(callGatewayFromCli).toHaveBeenCalledWith(
      "hardware.resources.list",
      expect.objectContaining({ adapter: "homeassistant" }),
      {
        adapterId: "homeassistant",
        query: undefined,
        includeState: false,
      },
      { expectFinal: false },
    );
    expect(runtimeLogs[0]).toContain("Office Lamp (homeassistant:light.office)");
    expect(runtimeLogs[0]).toContain("turn_on, turn_off");
  });

  it("runs hardware actions with JSON input", async () => {
    callGatewayFromCli.mockResolvedValueOnce({ ok: true });

    await runCli([
      "hardware",
      "call",
      "homeassistant:light.office",
      "--action",
      "turn_on",
      "--input-json",
      '{"brightness_pct":50}',
    ]);

    expect(callGatewayFromCli).toHaveBeenCalledWith(
      "hardware.resource.action",
      expect.objectContaining({
        action: "turn_on",
        inputJson: '{"brightness_pct":50}',
      }),
      {
        id: "homeassistant:light.office",
        action: "turn_on",
        input: { brightness_pct: 50 },
      },
      { expectFinal: false },
    );
  });

  it("formats an empty registry clearly", () => {
    expect(formatHardwareAdapterList([])).toBe("No hardware adapters registered.");
  });

  it("formats an empty resource list clearly", () => {
    expect(formatHardwareResourceList([])).toBe("No hardware resources found.");
  });

  it("hardware watch subscribes via connectGatewayForEvents", async () => {
    let capturedOnEvent: ((evt: { event: string; payload?: unknown }) => void) | undefined;
    connectGatewayForEvents.mockImplementation(
      async (opts: {
        subscribeMethod: string;
        subscribeParams: unknown;
        onEvent: (evt: { event: string; payload?: unknown }) => void;
      }) => {
        capturedOnEvent = opts.onEvent;
        return {
          subscriptionPayload: {
            subscribed: true,
            subscriptionId: "sub-1",
            adapterId: "homeassistant",
          },
          stop: vi.fn(),
        };
      },
    );

    const runPromise = runCli(["hardware", "watch", "--adapter", "homeassistant", "--json"]);

    await vi.waitFor(() => {
      expect(connectGatewayForEvents).toHaveBeenCalledWith(
        expect.objectContaining({
          subscribeMethod: "hardware.watch.subscribe",
          subscribeParams: expect.objectContaining({
            adapterId: "homeassistant",
          }),
        }),
      );
    });

    expect(capturedOnEvent).toBeDefined();

    capturedOnEvent!({
      event: "hardware.changed",
      payload: {
        kind: "changed",
        resourceId: "homeassistant:light.desk",
        name: "Desk Lamp",
        state: { value: "on" },
        ts: Date.now(),
      },
    });

    void runPromise;
  });

  it("hardware watch reports error when subscription is rejected", async () => {
    connectGatewayForEvents.mockImplementation(async () => ({
      subscriptionPayload: { subscribed: false },
      stop: vi.fn(),
    }));

    await runCli(["hardware", "watch", "--adapter", "homeassistant"]);

    expect(runtimeErrors.at(-1)).toContain("Watch subscription was not accepted");
  });
});
