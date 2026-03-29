import { describe, expect, it } from "vitest";
import {
  mapDiscoveryToResource,
  parseDiscoveryPayload,
  parseDiscoveryTopic,
  type DiscoveryEntry,
} from "./discovery.js";

describe("parseDiscoveryTopic", () => {
  it("parses standard 4-segment discovery topics", () => {
    expect(parseDiscoveryTopic("homeassistant/light/0x1234/led/config", "homeassistant")).toEqual({
      component: "light",
      nodeId: "0x1234",
      objectId: "led",
    });
  });

  it("parses 3-segment discovery topics (no nodeId)", () => {
    expect(parseDiscoveryTopic("homeassistant/sensor/temperature/config", "homeassistant")).toEqual(
      {
        component: "sensor",
        nodeId: "",
        objectId: "temperature",
      },
    );
  });

  it("returns null for non-config topics", () => {
    expect(parseDiscoveryTopic("homeassistant/light/0x1234/led/state", "homeassistant")).toBeNull();
  });

  it("returns null for unsupported components", () => {
    expect(
      parseDiscoveryTopic("homeassistant/unknown/0x1234/foo/config", "homeassistant"),
    ).toBeNull();
  });

  it("returns null for topics outside the prefix", () => {
    expect(parseDiscoveryTopic("zigbee2mqtt/light/0x1234/led/config", "homeassistant")).toBeNull();
  });

  it("works with custom prefixes", () => {
    expect(parseDiscoveryTopic("custom/switch/node1/relay/config", "custom")).toEqual({
      component: "switch",
      nodeId: "node1",
      objectId: "relay",
    });
  });
});

describe("parseDiscoveryPayload", () => {
  it("parses valid JSON config", () => {
    const payload = parseDiscoveryPayload(
      JSON.stringify({ name: "Kitchen Light", state_topic: "z2m/kitchen/state" }),
    );
    expect(payload).toEqual(
      expect.objectContaining({ name: "Kitchen Light", state_topic: "z2m/kitchen/state" }),
    );
  });

  it("returns null for empty payload (device removed)", () => {
    expect(parseDiscoveryPayload("")).toBeNull();
    expect(parseDiscoveryPayload("  ")).toBeNull();
  });

  it("returns null for invalid JSON", () => {
    expect(parseDiscoveryPayload("{not json")).toBeNull();
  });

  it("returns null for non-object JSON", () => {
    expect(parseDiscoveryPayload('"string"')).toBeNull();
    expect(parseDiscoveryPayload("[1,2]")).toBeNull();
  });
});

describe("mapDiscoveryToResource", () => {
  function makeEntry(overrides?: Partial<DiscoveryEntry>): DiscoveryEntry {
    return {
      component: "light",
      nodeId: "0x1234",
      objectId: "kitchen_light",
      key: "light/0x1234/kitchen_light",
      payload: {
        name: "Kitchen Light",
        state_topic: "zigbee2mqtt/kitchen/state",
        command_topic: "zigbee2mqtt/kitchen/set",
        payload_on: "ON",
        payload_off: "OFF",
        device: { name: "Kitchen", manufacturer: "IKEA" },
      },
      ...overrides,
    };
  }

  it("maps a light with turn_on/turn_off actions", () => {
    const resource = mapDiscoveryToResource(makeEntry());
    expect(resource.name).toBe("Kitchen Kitchen Light");
    expect(resource.type).toBe("light");
    expect(resource.stateTopic).toBe("zigbee2mqtt/kitchen/state");
    expect(resource.commandTopic).toBe("zigbee2mqtt/kitchen/set");
    expect(resource.actions).toEqual(
      expect.objectContaining({
        turn_on: { payload: "ON", topic: "zigbee2mqtt/kitchen/set" },
        turn_off: { payload: "OFF", topic: "zigbee2mqtt/kitchen/set" },
      }),
    );
    expect(resource.tags).toContain("IKEA");
  });

  it("maps a sensor as read-only (no actions)", () => {
    const resource = mapDiscoveryToResource(
      makeEntry({
        component: "sensor",
        payload: {
          name: "Temperature",
          state_topic: "zigbee2mqtt/sensor/temperature",
          unit_of_measurement: "°C",
          device_class: "temperature",
        },
      }),
    );
    expect(resource.type).toBe("sensor");
    expect(resource.actions).toBeUndefined();
    expect(resource.tags).toContain("temperature");
    expect(resource.tags).toContain("°C");
  });

  it("maps a cover with open/close/stop actions", () => {
    const resource = mapDiscoveryToResource(
      makeEntry({
        component: "cover",
        payload: {
          name: "Garage Door",
          state_topic: "cover/garage/state",
          command_topic: "cover/garage/set",
        },
      }),
    );
    expect(resource.type).toBe("cover");
    expect(resource.actions).toEqual(
      expect.objectContaining({
        open: expect.objectContaining({ payload: "OPEN" }),
        close: expect.objectContaining({ payload: "CLOSE" }),
        stop: expect.objectContaining({ payload: "STOP" }),
      }),
    );
  });

  it("maps a lock with lock/unlock actions", () => {
    const resource = mapDiscoveryToResource(
      makeEntry({
        component: "lock",
        payload: {
          name: "Front Door",
          state_topic: "lock/front/state",
          command_topic: "lock/front/set",
        },
      }),
    );
    expect(resource.type).toBe("lock");
    expect(resource.actions).toEqual(
      expect.objectContaining({
        lock: expect.objectContaining({ payload: "LOCK" }),
        unlock: expect.objectContaining({ payload: "UNLOCK" }),
      }),
    );
  });

  it("uses objectId as fallback name", () => {
    const resource = mapDiscoveryToResource(
      makeEntry({
        payload: { state_topic: "test/state" },
      }),
    );
    expect(resource.name).toBe("kitchen_light");
  });
});
