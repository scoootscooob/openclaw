import { beforeEach, describe, expect, it, vi } from "vitest";

const callGatewayTool = vi.fn(async (method: string) => ({ ok: true, method }));
const readGatewayCallOptions = vi.fn(() => ({}));

vi.mock("./gateway.js", () => ({
  callGatewayTool,
  readGatewayCallOptions,
}));

let createHardwareTool: typeof import("./hardware-tool.js").createHardwareTool;

async function loadFreshHardwareTool() {
  vi.resetModules();
  vi.doMock("./gateway.js", () => ({
    callGatewayTool,
    readGatewayCallOptions,
  }));
  ({ createHardwareTool } = await import("./hardware-tool.js"));
}

describe("hardware tool", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await loadFreshHardwareTool();
  });

  it("marks hardware as owner-only", () => {
    expect(createHardwareTool().ownerOnly).toBe(true);
  });

  it("lists adapters", async () => {
    const tool = createHardwareTool();
    await tool.execute("call-1", { action: "list_adapters" });
    expect(callGatewayTool).toHaveBeenCalledWith("hardware.adapters.list", {}, {});
  });

  it("lists resources with optional filters", async () => {
    const tool = createHardwareTool();
    await tool.execute("call-2", {
      action: "list_resources",
      adapterId: "homeassistant",
      query: "lamp",
      includeState: true,
    });
    expect(callGatewayTool).toHaveBeenCalledWith(
      "hardware.resources.list",
      {},
      {
        adapterId: "homeassistant",
        query: "lamp",
        includeState: true,
      },
    );
  });

  it("runs hardware actions with structured input", async () => {
    const tool = createHardwareTool();
    await tool.execute("call-3", {
      action: "run_action",
      resourceId: "homeassistant:light.office",
      hardwareAction: "turn_on",
      input: { brightness_pct: 50 },
    });
    expect(callGatewayTool).toHaveBeenCalledWith(
      "hardware.resource.action",
      {},
      {
        id: "homeassistant:light.office",
        action: "turn_on",
        input: { brightness_pct: 50 },
      },
    );
  });
});
