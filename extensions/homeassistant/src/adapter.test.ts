import { describe, expect, it, vi } from "vitest";
import { createTestPluginApi } from "../../../test/helpers/extensions/plugin-api.js";
import { createHomeAssistantAdapter, mapHomeAssistantStateToResource } from "./adapter.js";
import type { HomeAssistantState } from "./client.js";
import { resolveHomeAssistantConfig } from "./config.js";

function createJsonResponse(payload: unknown): Response {
  return {
    ok: true,
    status: 200,
    statusText: "OK",
    json: async () => payload,
  } as Response;
}

describe("homeassistant adapter", () => {
  it("maps Home Assistant states into hardware resources", () => {
    const resource = mapHomeAssistantStateToResource({
      entity_id: "light.office_lamp",
      state: "on",
      attributes: {
        friendly_name: "Office Lamp",
        brightness: 255,
      },
      last_updated: "2026-03-24T18:45:00Z",
    });

    expect(resource).toEqual(
      expect.objectContaining({
        id: "light.office_lamp",
        name: "Office Lamp",
        type: "light",
        actions: expect.arrayContaining([expect.objectContaining({ id: "turn_on" })]),
        state: expect.objectContaining({
          value: "on",
          available: true,
        }),
      }),
    );
  });

  it("lists and reads entity state through the Home Assistant API", async () => {
    const states: HomeAssistantState[] = [
      {
        entity_id: "light.office_lamp",
        state: "off",
        attributes: {
          friendly_name: "Office Lamp",
        },
      },
    ];
    const fetchImpl = vi.fn(async (input: URL | RequestInfo) => {
      const url = String(input);
      if (url.endsWith("/api/states")) {
        return createJsonResponse(states);
      }
      if (url.endsWith("/api/states/light.office_lamp")) {
        return createJsonResponse(states[0]);
      }
      throw new Error(`unexpected fetch ${url}`);
    });

    const adapter = createHomeAssistantAdapter({
      api: createTestPluginApi({
        id: "homeassistant",
        name: "Home Assistant",
        source: "/virtual/homeassistant/index.ts",
        config: {},
        runtime: {} as never,
      }),
      config: resolveHomeAssistantConfig({
        url: "http://homeassistant.local:8123",
        token: "secret",
      }),
      isConfigured: true,
      fetchImpl: fetchImpl as typeof fetch,
    });

    await expect(adapter.list?.()).resolves.toEqual([
      expect.objectContaining({
        id: "light.office_lamp",
        name: "Office Lamp",
      }),
    ]);
    await expect(adapter.get?.("light.office_lamp")).resolves.toEqual(
      expect.objectContaining({
        id: "light.office_lamp",
        type: "light",
      }),
    );
  });

  it("calls Home Assistant services and returns refreshed resource state", async () => {
    const serviceResult = [{ entity_id: "light.office_lamp", state: "on" }];
    const latestState: HomeAssistantState = {
      entity_id: "light.office_lamp",
      state: "on",
      attributes: {
        friendly_name: "Office Lamp",
      },
    };
    const fetchImpl = vi.fn(async (input: URL | RequestInfo, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/api/services/light/turn_on")) {
        expect(init?.method).toBe("POST");
        expect(init?.body).toBe(
          JSON.stringify({ entity_id: "light.office_lamp", brightness_pct: 50 }),
        );
        return createJsonResponse(serviceResult);
      }
      if (url.endsWith("/api/states/light.office_lamp")) {
        return createJsonResponse(latestState);
      }
      throw new Error(`unexpected fetch ${url}`);
    });

    const adapter = createHomeAssistantAdapter({
      api: createTestPluginApi({
        id: "homeassistant",
        name: "Home Assistant",
        source: "/virtual/homeassistant/index.ts",
        config: {},
        runtime: {} as never,
      }),
      config: resolveHomeAssistantConfig({
        url: "http://homeassistant.local:8123",
        token: "secret",
      }),
      isConfigured: true,
      fetchImpl: fetchImpl as typeof fetch,
    });

    await expect(
      adapter.set?.({
        resourceId: "light.office_lamp",
        action: "turn_on",
        input: { brightness_pct: 50 },
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        ok: true,
        result: serviceResult,
        resource: expect.objectContaining({
          id: "light.office_lamp",
          state: expect.objectContaining({ value: "on" }),
        }),
      }),
    );
  });
});
