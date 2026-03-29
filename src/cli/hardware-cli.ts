import type { Command } from "commander";
import { connectGatewayForEvents, type GatewayEventConnection } from "../gateway/call.js";
import type { EventFrame } from "../gateway/protocol/index.js";
import type { HardwareResourceRecord, RegisteredHardwareAdapter } from "../hardware/types.js";
import { defaultRuntime } from "../runtime.js";
import { getTerminalTableWidth, renderTable } from "../terminal/table.js";
import { GATEWAY_CLIENT_MODES, GATEWAY_CLIENT_NAMES } from "../utils/message-channel.js";
import type { GatewayRpcOpts } from "./gateway-rpc.js";
import { addGatewayClientOptions, callGatewayFromCli } from "./gateway-rpc.js";

type HardwareGatewayOptions = GatewayRpcOpts & {
  json?: boolean;
};

type HardwareResourcesListOptions = HardwareGatewayOptions & {
  adapter?: string;
  query?: string;
  includeState?: boolean;
};

type HardwareActionOptions = HardwareGatewayOptions & {
  action?: string;
  inputJson?: string;
};

type HardwareWatchOptions = GatewayRpcOpts & {
  adapter?: string;
  id?: string;
  query?: string;
  includeState?: boolean;
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

function formatHardwareState(resource: HardwareResourceRecord): string {
  if (resource.state?.value !== undefined) {
    return typeof resource.state.value === "string"
      ? resource.state.value
      : JSON.stringify(resource.state.value);
  }
  return "-";
}

function formatHardwareActions(resource: HardwareResourceRecord): string {
  return resource.actions?.length ? resource.actions.map((action) => action.id).join(", ") : "-";
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

export function formatHardwareResourceList(resources: HardwareResourceRecord[]): string {
  if (resources.length === 0) {
    return "No hardware resources found.";
  }

  return renderTable({
    width: getTerminalTableWidth(),
    columns: [
      { key: "Resource", header: "Resource", minWidth: 28, flex: true },
      { key: "Type", header: "Type", minWidth: 14 },
      { key: "State", header: "State", minWidth: 14 },
      { key: "Actions", header: "Actions", minWidth: 20, flex: true },
    ],
    rows: resources.map((resource) => ({
      Resource: `${resource.name} (${resource.id})`,
      Type: resource.type,
      State: formatHardwareState(resource),
      Actions: formatHardwareActions(resource),
    })),
  });
}

async function runHardwareGatewayCommand(
  opts: HardwareGatewayOptions,
  action: () => Promise<unknown>,
  formatter?: (result: unknown) => string,
): Promise<void> {
  try {
    const result = await action();
    if (opts.json) {
      defaultRuntime.writeJson(result);
      return;
    }
    if (formatter) {
      defaultRuntime.log(formatter(result));
      return;
    }
    defaultRuntime.writeJson(result);
  } catch (err) {
    defaultRuntime.error(String(err));
    defaultRuntime.exit(1);
  }
}

function parseActionInputJson(raw: string | undefined): Record<string, unknown> | undefined {
  const trimmed = typeof raw === "string" ? raw.trim() : "";
  if (!trimmed) {
    return undefined;
  }
  const parsed = JSON.parse(trimmed);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("--input-json must decode to an object");
  }
  return parsed as Record<string, unknown>;
}

export function registerHardwareCli(program: Command) {
  const hardware = program
    .command("hardware")
    .description("Inspect and control hardware resources");

  addGatewayClientOptions(
    hardware
      .command("adapters")
      .description("List registered hardware adapters")
      .option("--json", "Output JSON", false),
  ).action(async (opts: HardwareGatewayOptions) => {
    await runHardwareGatewayCommand(
      opts,
      async () =>
        await callGatewayFromCli(
          "hardware.adapters.list",
          opts,
          {},
          {
            expectFinal: false,
          },
        ),
      (result) =>
        formatHardwareAdapterList(
          (result as { adapters?: RegisteredHardwareAdapter[] }).adapters ?? [],
        ),
    );
  });

  const registerListAction = (command: Command) =>
    addGatewayClientOptions(
      command
        .description("List hardware resources")
        .option("--adapter <id>", "Only list resources from one adapter")
        .option("--query <text>", "Filter by resource id, name, type, or tags")
        .option("--include-state", "Request current state in the list response", false)
        .option("--json", "Output JSON", false),
    ).action(async (opts: HardwareResourcesListOptions) => {
      await runHardwareGatewayCommand(
        opts,
        async () =>
          await callGatewayFromCli(
            "hardware.resources.list",
            opts,
            {
              adapterId:
                typeof opts.adapter === "string" ? opts.adapter.trim() || undefined : undefined,
              query: typeof opts.query === "string" ? opts.query.trim() || undefined : undefined,
              includeState: opts.includeState === true,
            },
            { expectFinal: false },
          ),
        (result) =>
          formatHardwareResourceList(
            (result as { resources?: HardwareResourceRecord[] }).resources ?? [],
          ),
      );
    });

  registerListAction(hardware.command("list"));
  registerListAction(hardware.command("discover"));

  addGatewayClientOptions(
    hardware
      .command("get")
      .description("Get a hardware resource by id")
      .argument("<id>", "Composite resource id (<adapterId>:<resourceId>)")
      .option("--json", "Output JSON", false),
  ).action(async (id: string, opts: HardwareGatewayOptions) => {
    await runHardwareGatewayCommand(opts, async () => {
      return await callGatewayFromCli(
        "hardware.resource.get",
        opts,
        { id: id.trim() },
        { expectFinal: false },
      );
    });
  });

  addGatewayClientOptions(
    hardware
      .command("call")
      .description("Run an action against a hardware resource")
      .argument("<id>", "Composite resource id (<adapterId>:<resourceId>)")
      .requiredOption("--action <action>", "Action id to run")
      .option("--input-json <json>", "Optional JSON object to pass as action input")
      .option("--json", "Output JSON", false),
  ).action(async (id: string, opts: HardwareActionOptions) => {
    await runHardwareGatewayCommand(opts, async () => {
      return await callGatewayFromCli(
        "hardware.resource.action",
        opts,
        {
          id: id.trim(),
          action: typeof opts.action === "string" ? opts.action.trim() : "",
          input: parseActionInputJson(opts.inputJson),
        },
        { expectFinal: false },
      );
    });
  });

  // -------------------------------------------------------------------------
  // hardware watch — persistent event stream
  // -------------------------------------------------------------------------

  addGatewayClientOptions(
    hardware
      .command("watch")
      .description("Stream hardware change events from the gateway")
      .option("--adapter <id>", "Watch events from a specific adapter")
      .option("--id <compositeId>", "Watch a single resource (<adapterId>:<resourceId>)")
      .option("--query <text>", "Filter events by resource text")
      .option("--include-state", "Include full resource state in events", false)
      .option("--json", "Output JSON lines (one object per event)", false),
  ).action(async (opts: HardwareWatchOptions) => {
    const jsonMode = Boolean(opts.json);

    const writeJsonLine = (obj: unknown): boolean => {
      try {
        process.stdout.write(JSON.stringify(obj) + "\n");
        return true;
      } catch {
        return false;
      }
    };

    const writeTextLine = (text: string): boolean => {
      try {
        process.stdout.write(text + "\n");
        return true;
      } catch {
        return false;
      }
    };

    const str = (v: unknown, fallback = ""): string =>
      typeof v === "string" ? v : typeof v === "number" ? `${v}` : fallback;

    const formatWatchEvent = (payload: Record<string, unknown>): string => {
      const kind = str(payload.kind, "changed");
      const resourceId = str(payload.resourceId, str(payload.id, "-"));
      const name = str(payload.name);
      const stateValue =
        payload.state && typeof payload.state === "object" && "value" in payload.state
          ? JSON.stringify((payload.state as Record<string, unknown>).value)
          : undefined;
      const ts = typeof payload.ts === "number" ? new Date(payload.ts).toISOString() : "";
      const parts = [ts, `[${kind}]`, name || resourceId];
      if (stateValue !== undefined) {
        parts.push(`→ ${stateValue}`);
      }
      if (name && resourceId !== name) {
        parts.push(`(${resourceId})`);
      }
      return parts.join(" ");
    };

    const adapterId =
      typeof opts.adapter === "string" ? opts.adapter.trim() || undefined : undefined;
    const resourceId = typeof opts.id === "string" ? opts.id.trim() || undefined : undefined;
    const query = typeof opts.query === "string" ? opts.query.trim() || undefined : undefined;

    const subscribeParams: Record<string, unknown> = {};
    if (resourceId) {
      subscribeParams.id = resourceId;
    }
    if (adapterId) {
      subscribeParams.adapterId = adapterId;
    }
    if (query) {
      subscribeParams.query = query;
    }
    if (opts.includeState) {
      subscribeParams.includeState = true;
    }

    let connection: GatewayEventConnection | null = null;

    const cleanup = () => {
      if (connection) {
        connection.stop();
        connection = null;
      }
    };

    process.on("SIGINT", () => {
      cleanup();
      process.exit(0);
    });
    process.on("SIGTERM", () => {
      cleanup();
      process.exit(0);
    });

    try {
      connection = await connectGatewayForEvents({
        url: opts.url,
        token: opts.token,
        timeoutMs: Number(opts.timeout ?? 30_000),
        clientName: GATEWAY_CLIENT_NAMES.CLI,
        mode: GATEWAY_CLIENT_MODES.CLI,
        subscribeMethod: "hardware.watch.subscribe",
        subscribeParams,
        onEvent: (evt: EventFrame) => {
          if (evt.event !== "hardware.changed") {
            return;
          }
          const payload = (evt.payload ?? {}) as Record<string, unknown>;
          if (jsonMode) {
            writeJsonLine(payload);
          } else {
            writeTextLine(formatWatchEvent(payload));
          }
        },
        onDisconnect: (err) => {
          if (err) {
            defaultRuntime.error(`Disconnected: ${err.message}`);
          }
          process.exit(1);
        },
      });
    } catch (err) {
      cleanup();
      defaultRuntime.error(String(err));
      defaultRuntime.exit(1);
      return;
    }

    const sub = connection.subscriptionPayload;
    if (!sub.subscribed) {
      defaultRuntime.error("Watch subscription was not accepted by the gateway.");
      cleanup();
      defaultRuntime.exit(1);
      return;
    }

    if (!jsonMode) {
      const target = resourceId ?? adapterId ?? "all adapters";
      writeTextLine(`Watching hardware events (${target})… Press Ctrl+C to stop.`);
    }

    // Keep the process alive while the WebSocket connection is open.
    await new Promise<void>(() => {});
  });
}
