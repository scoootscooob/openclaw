import { afterEach, describe, expect, it, vi } from "vitest";
import type { HardwareWatchEvent } from "../hardware/types.js";
import { resetHeartbeatWakeStateForTests } from "../infra/heartbeat-wake.js";
import { drainSystemEvents, resetSystemEventsForTest } from "../infra/system-events.js";
import { createHardwareEventRelay } from "./server-hardware-wake.js";

vi.mock("../infra/heartbeat-wake.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("../infra/heartbeat-wake.js")>();
  return {
    ...original,
    requestHeartbeatNow: vi.fn(),
  };
});

const { requestHeartbeatNow } = await import("../infra/heartbeat-wake.js");

const SESSION_KEY = "agent:main:main";

function makeEvent(overrides?: Partial<HardwareWatchEvent>): HardwareWatchEvent {
  return {
    kind: "changed",
    adapterId: "homeassistant",
    adapterLabel: "Home Assistant",
    pluginId: "homeassistant",
    id: "homeassistant:light.desk_lamp",
    adapterResourceId: "light.desk_lamp",
    resource: {
      id: "homeassistant:light.desk_lamp",
      adapterId: "homeassistant",
      adapterLabel: "Home Assistant",
      adapterResourceId: "light.desk_lamp",
      pluginId: "homeassistant",
      name: "Desk Lamp",
      type: "light",
      state: { value: "on" },
    },
    ...overrides,
  };
}

afterEach(() => {
  resetSystemEventsForTest();
  resetHeartbeatWakeStateForTests();
  vi.clearAllMocks();
});

describe("createHardwareEventRelay", () => {
  it("enqueues a system event and requests heartbeat on hardware change", () => {
    const relay = createHardwareEventRelay({ sessionKey: SESSION_KEY });
    relay(makeEvent());

    const events = drainSystemEvents(SESSION_KEY);
    expect(events).toHaveLength(1);
    expect(events[0]).toContain("Hardware changed");
    expect(events[0]).toContain("Desk Lamp");
    expect(events[0]).toContain("on");
    expect(requestHeartbeatNow).toHaveBeenCalledWith({ reason: "hardware:changed" });
  });

  it("skips duplicate consecutive events via system event dedup", () => {
    const relay = createHardwareEventRelay({ sessionKey: SESSION_KEY });
    relay(makeEvent());
    relay(makeEvent());

    const events = drainSystemEvents(SESSION_KEY);
    // enqueueSystemEvent deduplicates consecutive identical texts
    expect(events).toHaveLength(1);
    expect(requestHeartbeatNow).toHaveBeenCalledTimes(1);
  });

  it("enqueues distinct events separately", () => {
    const relay = createHardwareEventRelay({ sessionKey: SESSION_KEY });
    relay(makeEvent());
    relay(
      makeEvent({
        id: "homeassistant:light.floor_lamp",
        adapterResourceId: "light.floor_lamp",
        resource: {
          id: "homeassistant:light.floor_lamp",
          adapterId: "homeassistant",
          adapterLabel: "Home Assistant",
          adapterResourceId: "light.floor_lamp",
          pluginId: "homeassistant",
          name: "Floor Lamp",
          type: "light",
          state: { value: "off" },
        },
      }),
    );

    const events = drainSystemEvents(SESSION_KEY);
    expect(events).toHaveLength(2);
    expect(requestHeartbeatNow).toHaveBeenCalledTimes(2);
  });

  it("uses custom formatEvent when provided", () => {
    const relay = createHardwareEventRelay({
      sessionKey: SESSION_KEY,
      formatEvent: (event) => `custom: ${event.id}`,
    });
    relay(makeEvent());

    const events = drainSystemEvents(SESSION_KEY);
    expect(events[0]).toBe("custom: homeassistant:light.desk_lamp");
  });

  it("skips heartbeat when formatEvent returns empty string", () => {
    const relay = createHardwareEventRelay({
      sessionKey: SESSION_KEY,
      formatEvent: () => "",
    });
    relay(makeEvent());

    const events = drainSystemEvents(SESSION_KEY);
    expect(events).toHaveLength(0);
    expect(requestHeartbeatNow).not.toHaveBeenCalled();
  });
});
