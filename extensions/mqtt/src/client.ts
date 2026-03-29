import { connect } from "mqtt";
import type {
  MqttHardwareActionConfig,
  MqttHardwareConfig,
  MqttHardwareResourceConfig,
} from "./config.js";
import {
  mapDiscoveryToResource,
  parseDiscoveryPayload,
  parseDiscoveryTopic,
  type DiscoveryEntry,
} from "./discovery.js";

export class MqttHardwareClientError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MqttHardwareClientError";
  }
}

type MqttClientLike = {
  on: (event: string, listener: (...args: unknown[]) => void) => MqttClientLike;
  once: (event: string, listener: (...args: unknown[]) => void) => MqttClientLike;
  subscribe: (
    topic: string | string[],
    opts: { qos?: number },
    callback: (error?: Error | null) => void,
  ) => MqttClientLike;
  publish: (
    topic: string,
    message: string | Buffer,
    opts: { qos?: number; retain?: boolean },
    callback: (error?: Error | null) => void,
  ) => MqttClientLike;
  end: (force?: boolean, callback?: () => void) => MqttClientLike;
};

export type MqttConnectFn = (
  url: string,
  opts?: {
    username?: string;
    password?: string;
    clientId?: string;
  },
) => MqttClientLike;

export type MqttHardwareSnapshot = {
  value?: unknown;
  available?: boolean;
  observedAt?: string;
  rawState?: string;
  parsedState?: unknown;
  rawAvailability?: string;
};

export type MqttHardwareWatchEvent = {
  kind: "changed";
  resourceId: string;
  snapshot: MqttHardwareSnapshot;
};

function defaultMqttConnect(
  url: string,
  opts?: {
    username?: string;
    password?: string;
    clientId?: string;
  },
): MqttClientLike {
  return connect(url, opts) as unknown as MqttClientLike;
}

function parsePayload(rawPayload: string): unknown {
  const trimmed = rawPayload.trim();
  if (!trimmed) {
    return rawPayload;
  }
  try {
    return JSON.parse(trimmed);
  } catch {
    return rawPayload;
  }
}

function mapStateValue(resource: MqttHardwareResourceConfig, rawPayload: string): unknown {
  const mapped = resource.stateMap?.[rawPayload];
  if (mapped !== undefined) {
    return mapped;
  }
  const parsed = parsePayload(rawPayload);
  if (
    typeof parsed === "string" ||
    typeof parsed === "number" ||
    typeof parsed === "boolean" ||
    parsed === null
  ) {
    return parsed;
  }
  return rawPayload;
}

function mapAvailability(resource: MqttHardwareResourceConfig, rawPayload: string): boolean {
  const mapped = resource.availabilityMap?.[rawPayload];
  if (typeof mapped === "boolean") {
    return mapped;
  }
  const normalized = rawPayload.trim().toLowerCase();
  if (!normalized) {
    return true;
  }
  return !["0", "false", "offline", "unavailable"].includes(normalized);
}

function cloneSnapshot(snapshot?: MqttHardwareSnapshot): MqttHardwareSnapshot | undefined {
  return snapshot ? { ...snapshot } : undefined;
}

export class MqttHardwareClient {
  private clientPromise: Promise<MqttClientLike> | null = null;
  private readonly snapshots = new Map<string, MqttHardwareSnapshot>();
  private readonly watchers = new Set<(event: MqttHardwareWatchEvent) => void>();
  private stateSubscriptionsPromise: Promise<void> | null = null;
  private readonly resourcesByStateTopic = new Map<string, string[]>();
  private readonly resourcesByAvailabilityTopic = new Map<string, string[]>();
  /** Resources created by HA MQTT Discovery (Zigbee2MQTT, Tasmota, ESPHome). */
  readonly discoveredResources = new Map<string, MqttHardwareResourceConfig>();
  private discoverySubscriptionPromise: Promise<void> | null = null;

  constructor(
    private readonly config: MqttHardwareConfig,
    private readonly connectImpl: MqttConnectFn = defaultMqttConnect,
  ) {
    for (const [resourceId, resource] of Object.entries(config.resources)) {
      if (resource.stateTopic) {
        const resourceIds = this.resourcesByStateTopic.get(resource.stateTopic) ?? [];
        resourceIds.push(resourceId);
        this.resourcesByStateTopic.set(resource.stateTopic, resourceIds);
      }
      if (resource.availabilityTopic) {
        const resourceIds = this.resourcesByAvailabilityTopic.get(resource.availabilityTopic) ?? [];
        resourceIds.push(resourceId);
        this.resourcesByAvailabilityTopic.set(resource.availabilityTopic, resourceIds);
      }
    }
  }

  private getResource(resourceId: string): MqttHardwareResourceConfig {
    const resource = this.config.resources[resourceId] ?? this.discoveredResources.get(resourceId);
    if (!resource) {
      throw new MqttHardwareClientError(`unknown MQTT hardware resource: ${resourceId}`);
    }
    return resource;
  }

  private async getClient(): Promise<MqttClientLike> {
    if (!this.clientPromise) {
      const url = this.config.url?.trim();
      if (!url) {
        throw new MqttHardwareClientError("MQTT broker URL is required");
      }
      this.clientPromise = new Promise<MqttClientLike>((resolve, reject) => {
        const client = this.connectImpl(url, {
          username: this.config.username,
          password: this.config.password,
          clientId: this.config.clientId,
        });
        client.on("message", (topic, payload) => {
          this.handleMessage(
            String(topic),
            payload instanceof Buffer ? payload : Buffer.from(String(payload)),
          );
        });
        client.on("error", () => {});
        client.once("connect", () => resolve(client));
        client.once("error", (error) => {
          reject(
            new MqttHardwareClientError(
              error instanceof Error ? error.message : `MQTT connection failed: ${String(error)}`,
            ),
          );
        });
      });
    }
    return await this.clientPromise;
  }

  private async ensureStateSubscriptions(): Promise<void> {
    if (this.stateSubscriptionsPromise) {
      await this.stateSubscriptionsPromise;
      return;
    }
    this.stateSubscriptionsPromise = (async () => {
      const topics = [
        ...this.resourcesByStateTopic.keys(),
        ...this.resourcesByAvailabilityTopic.keys(),
      ].filter(Boolean);
      if (topics.length === 0) {
        return;
      }
      const client = await this.getClient();
      await new Promise<void>((resolve, reject) => {
        client.subscribe(topics, { qos: this.config.qos }, (error) => {
          if (error) {
            reject(
              new MqttHardwareClientError(error instanceof Error ? error.message : String(error)),
            );
            return;
          }
          resolve();
        });
      });
    })();
    await this.stateSubscriptionsPromise;
  }

  private updateSnapshot(resourceId: string, updater: (current: MqttHardwareSnapshot) => void) {
    const next = {
      ...this.snapshots.get(resourceId),
    } satisfies MqttHardwareSnapshot;
    updater(next);
    this.snapshots.set(resourceId, next);
    const event: MqttHardwareWatchEvent = {
      kind: "changed",
      resourceId,
      snapshot: { ...next },
    };
    for (const watcher of this.watchers) {
      watcher(event);
    }
  }

  private handleMessage(topic: string, payload: Buffer) {
    const rawPayload = payload.toString("utf8");
    const observedAt = new Date().toISOString();
    for (const resourceId of this.resourcesByStateTopic.get(topic) ?? []) {
      const resource = this.getResource(resourceId);
      this.updateSnapshot(resourceId, (snapshot) => {
        snapshot.value = mapStateValue(resource, rawPayload);
        snapshot.rawState = rawPayload;
        snapshot.parsedState = parsePayload(rawPayload);
        snapshot.observedAt = observedAt;
        if (snapshot.available === undefined && !resource.availabilityTopic) {
          snapshot.available = true;
        }
      });
    }
    for (const resourceId of this.resourcesByAvailabilityTopic.get(topic) ?? []) {
      const resource = this.getResource(resourceId);
      this.updateSnapshot(resourceId, (snapshot) => {
        snapshot.available = mapAvailability(resource, rawPayload);
        snapshot.rawAvailability = rawPayload;
        snapshot.observedAt = observedAt;
      });
    }
  }

  /**
   * Register a discovered resource and wire its state/availability topics.
   */
  private registerDiscoveredResource(resourceId: string, resource: MqttHardwareResourceConfig) {
    this.discoveredResources.set(resourceId, resource);
    if (resource.stateTopic) {
      const ids = this.resourcesByStateTopic.get(resource.stateTopic) ?? [];
      if (!ids.includes(resourceId)) {
        ids.push(resourceId);
        this.resourcesByStateTopic.set(resource.stateTopic, ids);
      }
    }
    if (resource.availabilityTopic) {
      const ids = this.resourcesByAvailabilityTopic.get(resource.availabilityTopic) ?? [];
      if (!ids.includes(resourceId)) {
        ids.push(resourceId);
        this.resourcesByAvailabilityTopic.set(resource.availabilityTopic, ids);
      }
    }
  }

  private removeDiscoveredResource(resourceId: string) {
    const resource = this.discoveredResources.get(resourceId);
    if (!resource) {
      return;
    }
    this.discoveredResources.delete(resourceId);
    this.snapshots.delete(resourceId);
    // Clean up topic → resourceId mappings.
    if (resource.stateTopic) {
      const ids = this.resourcesByStateTopic.get(resource.stateTopic);
      if (ids) {
        const idx = ids.indexOf(resourceId);
        if (idx >= 0) {
          ids.splice(idx, 1);
        }
        if (ids.length === 0) {
          this.resourcesByStateTopic.delete(resource.stateTopic);
        }
      }
    }
    if (resource.availabilityTopic) {
      const ids = this.resourcesByAvailabilityTopic.get(resource.availabilityTopic);
      if (ids) {
        const idx = ids.indexOf(resourceId);
        if (idx >= 0) {
          ids.splice(idx, 1);
        }
        if (ids.length === 0) {
          this.resourcesByAvailabilityTopic.delete(resource.availabilityTopic);
        }
      }
    }
  }

  private handleDiscoveryMessage(topic: string, payload: string, prefix: string) {
    const parsed = parseDiscoveryTopic(topic, prefix);
    if (!parsed) {
      return;
    }
    const discoveryPayload = parseDiscoveryPayload(payload);
    if (!discoveryPayload) {
      // Empty payload = device removed.
      const key = `${parsed.component}/${parsed.nodeId}/${parsed.objectId}`;
      this.removeDiscoveredResource(key);
      return;
    }
    const entry: DiscoveryEntry = {
      component: parsed.component,
      nodeId: parsed.nodeId,
      objectId: parsed.objectId,
      key: `${parsed.component}/${parsed.nodeId}/${parsed.objectId}`,
      payload: discoveryPayload,
    };
    const resource = mapDiscoveryToResource(entry);
    const resourceId = entry.key;

    // Don't override static config — explicit config wins.
    if (this.config.resources[resourceId]) {
      return;
    }

    this.registerDiscoveredResource(resourceId, resource);

    // Subscribe to the discovered resource's state and availability topics.
    const newTopics = [resource.stateTopic, resource.availabilityTopic].filter((t): t is string =>
      Boolean(t),
    );
    if (newTopics.length > 0) {
      // Fire-and-forget subscribe; errors are already handled by the MQTT client.
      void this.getClient().then((client) => {
        client.subscribe(newTopics, { qos: this.config.qos }, () => {});
      });
    }

    // Emit a "discovered" watch event so watchers are notified.
    for (const watcher of this.watchers) {
      watcher({
        kind: "changed",
        resourceId,
        snapshot: {},
      });
    }
  }

  /**
   * Subscribe to HA MQTT Discovery topics. Call once after connecting.
   */
  async subscribeDiscovery(prefix: string): Promise<void> {
    if (this.discoverySubscriptionPromise) {
      await this.discoverySubscriptionPromise;
      return;
    }
    this.discoverySubscriptionPromise = (async () => {
      const client = await this.getClient();
      const discoveryTopic = `${prefix}/#`;
      // Intercept messages on discovery topics before the normal handler.
      client.on("message", (rawTopic, rawPayload) => {
        const t = String(rawTopic);
        if (t.startsWith(prefix + "/") && t.endsWith("/config")) {
          const p = rawPayload instanceof Buffer ? rawPayload.toString("utf8") : String(rawPayload);
          this.handleDiscoveryMessage(t, p, prefix);
        }
      });
      await new Promise<void>((resolve, reject) => {
        client.subscribe(discoveryTopic, { qos: this.config.qos }, (error) => {
          if (error) {
            reject(
              new MqttHardwareClientError(error instanceof Error ? error.message : String(error)),
            );
            return;
          }
          resolve();
        });
      });
    })();
    await this.discoverySubscriptionPromise;
  }

  async listResourceIds(): Promise<string[]> {
    await this.ensureStateSubscriptions();
    const staticIds = Object.keys(this.config.resources);
    const discoveredIds = [...this.discoveredResources.keys()];
    return [...new Set([...staticIds, ...discoveredIds])].toSorted();
  }

  async getSnapshot(resourceId: string): Promise<MqttHardwareSnapshot | null> {
    await this.ensureStateSubscriptions();
    this.getResource(resourceId);
    return cloneSnapshot(this.snapshots.get(resourceId)) ?? {};
  }

  async publishAction(
    resourceId: string,
    actionId: string,
  ): Promise<{ topic: string; payload: string; qos: number; retain: boolean }> {
    const resource = this.getResource(resourceId);
    const action = resource.actions?.[actionId];
    if (!action) {
      throw new MqttHardwareClientError(`unknown MQTT action "${actionId}" for ${resourceId}`);
    }
    const topic = action.topic ?? resource.commandTopic;
    if (!topic) {
      throw new MqttHardwareClientError(
        `MQTT action "${actionId}" missing topic for ${resourceId}`,
      );
    }
    const client = await this.getClient();
    const qos = action.qos ?? this.config.qos;
    const retain = action.retain === true;
    await new Promise<void>((resolve, reject) => {
      client.publish(topic, action.payload, { qos, retain }, (error) => {
        if (error) {
          reject(
            new MqttHardwareClientError(error instanceof Error ? error.message : String(error)),
          );
          return;
        }
        resolve();
      });
    });
    return {
      topic,
      payload: action.payload,
      qos,
      retain,
    };
  }

  async watch(
    params: {
      resourceId?: string;
    },
    emit: (event: MqttHardwareWatchEvent) => void,
  ): Promise<() => void> {
    await this.ensureStateSubscriptions();
    const resourceId = params.resourceId?.trim() || undefined;
    if (resourceId) {
      this.getResource(resourceId);
    }
    const listener = (event: MqttHardwareWatchEvent) => {
      if (resourceId && event.resourceId !== resourceId) {
        return;
      }
      emit({
        ...event,
        snapshot: { ...event.snapshot },
      });
    };
    this.watchers.add(listener);
    return () => {
      this.watchers.delete(listener);
    };
  }

  async close(): Promise<void> {
    const client = await this.getClient();
    await new Promise<void>((resolve) => {
      client.end(false, () => resolve());
    });
  }
}

export function describeMqttAction(
  resource: MqttHardwareResourceConfig,
  actionId: string,
  action: MqttHardwareActionConfig,
): string | undefined {
  const topic = action.topic ?? resource.commandTopic;
  return topic ? `Publish ${action.payload} to ${topic}` : undefined;
}
