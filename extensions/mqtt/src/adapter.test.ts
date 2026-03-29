import { EventEmitter } from "node:events";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMqttAdapter } from "./adapter.js";
import { type MqttHardwareConfig } from "./config.js";

const { connectMock } = vi.hoisted(() => ({
  connectMock: vi.fn(),
}));

vi.mock("mqtt", () => ({
  connect: connectMock,
}));

class FakeMqttClient extends EventEmitter {
  readonly published: Array<{
    topic: string;
    payload: string;
    qos?: number;
    retain?: boolean;
  }> = [];

  readonly subscriptions: string[][] = [];

  subscribe(
    topic: string | string[],
    _opts: { qos?: number },
    callback: (error?: Error | null) => void,
  ) {
    this.subscriptions.push(Array.isArray(topic) ? topic : [topic]);
    callback(null);
    return this;
  }

  publish(
    topic: string,
    message: string | Buffer,
    opts: { qos?: number; retain?: boolean },
    callback: (error?: Error | null) => void,
  ) {
    this.published.push({
      topic,
      payload: Buffer.isBuffer(message) ? message.toString("utf8") : message,
      qos: opts.qos,
      retain: opts.retain,
    });
    callback(null);
    return this;
  }

  end(_force?: boolean, callback?: () => void) {
    callback?.();
    return this;
  }

  emitConnect() {
    this.emit("connect");
  }

  emitMessage(topic: string, payload: string) {
    this.emit("message", topic, Buffer.from(payload));
  }
}

const TEST_CONFIG: MqttHardwareConfig = {
  url: "mqtt://broker.local:1883",
  qos: 0,
  resources: {
    desk_lamp: {
      name: "Desk Lamp",
      type: "light",
      stateTopic: "demo/lamp/state",
      commandTopic: "demo/lamp/set",
      stateMap: {
        ON: "on",
        OFF: "off",
      },
      actions: {
        turn_on: {
          payload: "ON",
        },
        turn_off: {
          payload: "OFF",
        },
      },
    },
  },
};

describe("mqtt hardware adapter", () => {
  let client: FakeMqttClient;

  beforeEach(() => {
    connectMock.mockReset();
    client = new FakeMqttClient();
    connectMock.mockImplementation(() => {
      queueMicrotask(() => client.emitConnect());
      return client;
    });
  });

  it("lists configured MQTT resources with cached state", async () => {
    const adapter = createMqttAdapter({
      config: TEST_CONFIG,
      isConfigured: true,
    });

    await adapter.list?.({ includeState: true });
    client.emitMessage("demo/lamp/state", "ON");

    const resource = await adapter.get?.("desk_lamp");
    expect(resource).toEqual(
      expect.objectContaining({
        id: "desk_lamp",
        name: "Desk Lamp",
        type: "light",
        state: expect.objectContaining({
          value: "on",
        }),
      }),
    );
  });

  it("publishes configured action payloads", async () => {
    const adapter = createMqttAdapter({
      config: TEST_CONFIG,
      isConfigured: true,
    });

    await adapter.set?.({
      resourceId: "desk_lamp",
      action: "turn_on",
    });

    expect(client.published).toEqual([
      {
        topic: "demo/lamp/set",
        payload: "ON",
        qos: 0,
        retain: false,
      },
    ]);
  });

  it("emits watch events for MQTT topic changes", async () => {
    const adapter = createMqttAdapter({
      config: TEST_CONFIG,
      isConfigured: true,
    });
    const events: Array<{
      resourceId?: string;
      resource?: { state?: { value?: unknown } } | null;
    }> = [];

    const stop = await adapter.watch?.({ resourceId: "desk_lamp" }, (event) => {
      events.push(event);
    });

    client.emitMessage("demo/lamp/state", "OFF");

    expect(events).toEqual([
      expect.objectContaining({
        resourceId: "desk_lamp",
        resource: expect.objectContaining({
          state: expect.objectContaining({
            value: "off",
          }),
        }),
      }),
    ]);

    stop?.();
  });
});
