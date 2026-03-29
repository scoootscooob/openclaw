import type {
  HardwareActionResult,
  HardwareAdapterPlugin,
  HardwareAdapterResource,
  OpenClawPluginApi,
} from "../api.js";
import { HomeAssistantClient, type HomeAssistantState } from "./client.js";
import type { HomeAssistantConfig } from "./config.js";

const DOMAIN_ACTIONS: Record<string, string[]> = {
  button: ["press"],
  climate: ["turn_on", "turn_off", "set_hvac_mode", "set_temperature"],
  cover: ["open_cover", "close_cover", "stop_cover"],
  fan: ["turn_on", "turn_off", "toggle", "set_percentage"],
  input_boolean: ["turn_on", "turn_off", "toggle"],
  light: ["turn_on", "turn_off", "toggle"],
  lock: ["lock", "unlock", "open"],
  media_player: ["turn_on", "turn_off", "media_play", "media_pause", "media_stop", "volume_set"],
  scene: ["turn_on"],
  script: ["turn_on"],
  switch: ["turn_on", "turn_off", "toggle"],
  vacuum: ["start", "pause", "stop", "return_to_base"],
};

function normalizeFriendlyName(state: HomeAssistantState): string {
  const raw = state.attributes?.friendly_name;
  if (typeof raw === "string" && raw.trim()) {
    return raw.trim();
  }
  return state.entity_id;
}

function describeState(state: HomeAssistantState): string | undefined {
  const friendlyName = normalizeFriendlyName(state);
  return `${friendlyName}: ${state.state}`;
}

function domainFromEntityId(entityId: string): string {
  const separator = entityId.indexOf(".");
  return separator > 0 ? entityId.slice(0, separator) : entityId;
}

function mapActionsForState(state: HomeAssistantState) {
  const domain = domainFromEntityId(state.entity_id);
  return (DOMAIN_ACTIONS[domain] ?? []).map((action) => ({
    id: action,
    label: action.replace(/_/g, " "),
  }));
}

export function mapHomeAssistantStateToResource(
  state: HomeAssistantState,
): HardwareAdapterResource {
  return {
    id: state.entity_id,
    name: normalizeFriendlyName(state),
    type: domainFromEntityId(state.entity_id),
    summary: describeState(state),
    actions: mapActionsForState(state),
    state: {
      value: state.state,
      observedAt: state.last_updated ?? state.last_changed,
      properties: {
        entity_id: state.entity_id,
        attributes: state.attributes ?? {},
        last_changed: state.last_changed,
        last_updated: state.last_updated,
      },
    },
    metadata: {
      source: "homeassistant",
      domain: domainFromEntityId(state.entity_id),
    },
    tags: [domainFromEntityId(state.entity_id)],
  };
}

export function createHomeAssistantAdapter(params: {
  api: OpenClawPluginApi;
  config: HomeAssistantConfig;
  isConfigured: boolean;
  fetchImpl?: typeof fetch;
}): HardwareAdapterPlugin {
  const client = new HomeAssistantClient(params.config, params.fetchImpl);

  const readState = async (entityId: string): Promise<HardwareAdapterResource | null> => {
    const state = await client.getState(entityId);
    return state ? mapHomeAssistantStateToResource(state) : null;
  };

  return {
    id: "homeassistant",
    label: "Home Assistant",
    description: "Expose Home Assistant entities as OpenClaw hardware resources",
    isConfigured: params.isConfigured,
    async discover() {
      const states = await client.listStates();
      return states.map(mapHomeAssistantStateToResource);
    },
    async list() {
      const states = await client.listStates();
      return states.map(mapHomeAssistantStateToResource);
    },
    async get(resourceId) {
      return await readState(resourceId);
    },
    async set({ resourceId, action, input }) {
      const domain = domainFromEntityId(resourceId);
      const result = await client.callService(domain, action, {
        entity_id: resourceId,
        ...(input ?? {}),
      });
      const resource = await readState(resourceId);
      return {
        ok: true,
        resource,
        result,
      } satisfies HardwareActionResult;
    },
  };
}
