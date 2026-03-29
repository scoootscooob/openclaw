import {
  parseHardwareResourceId,
  getHardwareResource,
  HardwareServiceError,
  listHardwareAdapters,
  listHardwareResources,
  runHardwareAction,
} from "../../hardware/service.js";
import {
  ErrorCodes,
  errorShape,
  formatValidationErrors,
  validateHardwareAdaptersListParams,
  validateHardwareResourceActionParams,
  validateHardwareResourceGetParams,
  validateHardwareResourcesListParams,
  validateHardwareWatchSubscribeParams,
  validateHardwareWatchUnsubscribeParams,
} from "../protocol/index.js";
import type { GatewayRequestHandlers, RespondFn } from "./types.js";

type ValidateFn = {
  (params: unknown): boolean;
  errors?: import("ajv").ErrorObject[] | null;
};

/** Wrap a hardware handler with validation + error handling boilerplate. */
function hwHandler<TCtx extends { params: unknown; respond: RespondFn }>(
  method: string,
  validate: ValidateFn,
  handler: (ctx: TCtx) => Promise<void>,
): (ctx: TCtx) => Promise<void> {
  return async (ctx) => {
    if (!validate(ctx.params)) {
      ctx.respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `invalid ${method} params: ${formatValidationErrors(validate.errors)}`,
        ),
      );
      return;
    }
    try {
      await handler(ctx);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      ctx.respond(
        false,
        undefined,
        errorShape(
          error instanceof HardwareServiceError
            ? ErrorCodes.INVALID_REQUEST
            : ErrorCodes.UNAVAILABLE,
          `${method} failed: ${message}`,
        ),
      );
    }
  };
}

function resolveHardwareWatchTarget(params: { adapterId?: string; id?: string }): {
  adapterId: string;
  id?: string;
  resourceId?: string;
} {
  const adapterId = params.adapterId?.trim() || undefined;
  const id = params.id?.trim() || undefined;
  if (id) {
    const parsed = parseHardwareResourceId(id);
    if (adapterId && adapterId !== parsed.adapterId) {
      throw new HardwareServiceError(
        `hardware watch adapter mismatch: ${adapterId} does not own ${id}`,
      );
    }
    return { adapterId: parsed.adapterId, id, resourceId: parsed.adapterResourceId };
  }
  if (!adapterId) {
    throw new HardwareServiceError("hardware watch requires adapterId or id");
  }
  return { adapterId };
}

export const hardwareHandlers: GatewayRequestHandlers = {
  "hardware.adapters.list": hwHandler(
    "hardware.adapters.list",
    validateHardwareAdaptersListParams,
    async ({ respond }) => {
      respond(true, { adapters: listHardwareAdapters() }, undefined);
    },
  ),

  "hardware.resources.list": hwHandler(
    "hardware.resources.list",
    validateHardwareResourcesListParams,
    async ({ params, respond }) => {
      const { adapterId, query, includeState } = params as {
        adapterId?: string;
        query?: string;
        includeState?: boolean;
      };
      respond(
        true,
        { resources: await listHardwareResources({ adapterId, query, includeState }) },
        undefined,
      );
    },
  ),

  "hardware.resource.get": hwHandler(
    "hardware.resource.get",
    validateHardwareResourceGetParams,
    async ({ params, respond }) => {
      const { id } = params as { id: string };
      const resource = await getHardwareResource({ id });
      if (!resource) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, `unknown hardware resource: ${id}`),
        );
        return;
      }
      respond(true, { resource }, undefined);
    },
  ),

  "hardware.resource.action": hwHandler(
    "hardware.resource.action",
    validateHardwareResourceActionParams,
    async ({ params, respond }) => {
      const { id, action, input } = params as {
        id: string;
        action: string;
        input?: Record<string, unknown>;
      };
      respond(true, await runHardwareAction({ id, action, input }), undefined);
    },
  ),

  "hardware.watch.subscribe": hwHandler(
    "hardware.watch.subscribe",
    validateHardwareWatchSubscribeParams,
    async ({ params, client, context, respond }) => {
      const watchParams = params as {
        adapterId?: string;
        id?: string;
        query?: string;
        includeState?: boolean;
      };
      const target = resolveHardwareWatchTarget(watchParams);
      const connId = client?.connId?.trim();
      if (!connId) {
        respond(
          true,
          {
            subscribed: false,
            adapterId: target.adapterId,
            ...(target.id ? { id: target.id } : {}),
          },
          undefined,
        );
        return;
      }
      const subscriptionId = await context.subscribeHardwareWatch(connId, {
        adapterId: target.adapterId,
        resourceId: target.resourceId,
        query: watchParams.query,
        includeState: watchParams.includeState,
      });
      respond(
        true,
        {
          subscribed: true,
          subscriptionId,
          adapterId: target.adapterId,
          ...(target.id ? { id: target.id } : {}),
        },
        undefined,
      );
    },
  ),

  "hardware.watch.unsubscribe": hwHandler(
    "hardware.watch.unsubscribe",
    validateHardwareWatchUnsubscribeParams,
    async ({ params, client, context, respond }) => {
      const { subscriptionId } = params as { subscriptionId: string };
      const connId = client?.connId?.trim();
      const removed = connId
        ? await context.unsubscribeHardwareWatch(connId, subscriptionId)
        : false;
      respond(true, { subscribed: false, removed, subscriptionId }, undefined);
    },
  ),
};
