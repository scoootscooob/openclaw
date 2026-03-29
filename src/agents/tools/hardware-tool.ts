import { Type } from "@sinclair/typebox";
import { stringEnum } from "../schema/typebox.js";
import { type AnyAgentTool, jsonResult, readStringParam } from "./common.js";
import { callGatewayTool, readGatewayCallOptions } from "./gateway.js";

const HARDWARE_TOOL_ACTIONS = [
  "list_adapters",
  "list_resources",
  "get_resource",
  "run_action",
] as const;

const HardwareToolSchema = Type.Object({
  action: stringEnum(HARDWARE_TOOL_ACTIONS),
  adapterId: Type.Optional(Type.String()),
  query: Type.Optional(Type.String()),
  includeState: Type.Optional(Type.Boolean()),
  resourceId: Type.Optional(Type.String()),
  hardwareAction: Type.Optional(Type.String()),
  input: Type.Optional(Type.Object({}, { additionalProperties: true })),
});

export function createHardwareTool(): AnyAgentTool {
  return {
    label: "Hardware",
    name: "hardware",
    ownerOnly: true,
    description:
      "List hardware adapters/resources, inspect a specific hardware resource, or run a hardware action. Use this for physical-device orchestration the same way you use other OpenClaw tools.",
    parameters: HardwareToolSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const action = readStringParam(params, "action", { required: true });
      const gatewayOpts = readGatewayCallOptions(params);

      if (action === "list_adapters") {
        return jsonResult(await callGatewayTool("hardware.adapters.list", gatewayOpts, {}));
      }
      if (action === "list_resources") {
        return jsonResult(
          await callGatewayTool("hardware.resources.list", gatewayOpts, {
            adapterId: readStringParam(params, "adapterId"),
            query: readStringParam(params, "query"),
            includeState: params.includeState === true,
          }),
        );
      }
      if (action === "get_resource") {
        const resourceId = readStringParam(params, "resourceId", { required: true });
        return jsonResult(
          await callGatewayTool("hardware.resource.get", gatewayOpts, {
            id: resourceId,
          }),
        );
      }
      if (action === "run_action") {
        const resourceId = readStringParam(params, "resourceId", { required: true });
        const hardwareAction = readStringParam(params, "hardwareAction", {
          required: true,
          label: "hardwareAction",
        });
        const input =
          params.input && typeof params.input === "object" && !Array.isArray(params.input)
            ? (params.input as Record<string, unknown>)
            : undefined;
        return jsonResult(
          await callGatewayTool("hardware.resource.action", gatewayOpts, {
            id: resourceId,
            action: hardwareAction,
            input,
          }),
        );
      }

      throw new Error(`Unknown action: ${action}`);
    },
  };
}
