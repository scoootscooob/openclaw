import { randomUUID } from "node:crypto";
import { watchHardwareResources } from "../hardware/service.js";
import type { HardwareWatchEvent, HardwareWatchParams } from "../hardware/types.js";
import type { PluginRegistry } from "../plugins/registry.js";

type HardwareWatchSubscriptionEntry = {
  connId: string;
  stop: () => Promise<void>;
};

export type HardwareWatchSubscriptionRegistry = {
  subscribe: (
    connId: string,
    params: HardwareWatchParams & {
      adapterId: string;
    },
  ) => Promise<string>;
  unsubscribe: (connId: string, subscriptionId: string) => Promise<boolean>;
  unsubscribeAll: (connId: string) => Promise<void>;
  clear: () => Promise<void>;
};

function normalizeValue(value: string): string {
  return value.trim();
}

export function createHardwareWatchSubscriptionRegistry(params: {
  registry?: PluginRegistry | null;
  onEvent: (connId: string, subscriptionId: string, event: HardwareWatchEvent) => void;
}): HardwareWatchSubscriptionRegistry {
  const subscriptions = new Map<string, HardwareWatchSubscriptionEntry>();
  const connToSubscriptionIds = new Map<string, Set<string>>();

  const removeSubscriptionRef = (connId: string, subscriptionId: string) => {
    const subscriptionIds = connToSubscriptionIds.get(connId);
    if (!subscriptionIds) {
      return;
    }
    subscriptionIds.delete(subscriptionId);
    if (subscriptionIds.size === 0) {
      connToSubscriptionIds.delete(connId);
    }
  };

  return {
    subscribe: async (connId, watchParams) => {
      const normalizedConnId = normalizeValue(connId);
      if (!normalizedConnId) {
        throw new Error("hardware watch requires an active connection");
      }
      const subscriptionId = randomUUID();
      const stop = await watchHardwareResources({
        ...watchParams,
        registry: params.registry,
        emit: (event) => {
          if (!subscriptions.has(subscriptionId)) {
            return;
          }
          params.onEvent(normalizedConnId, subscriptionId, event);
        },
      });
      subscriptions.set(subscriptionId, {
        connId: normalizedConnId,
        stop,
      });
      const subscriptionIds = connToSubscriptionIds.get(normalizedConnId) ?? new Set<string>();
      subscriptionIds.add(subscriptionId);
      connToSubscriptionIds.set(normalizedConnId, subscriptionIds);
      return subscriptionId;
    },
    unsubscribe: async (connId, subscriptionId) => {
      const normalizedConnId = normalizeValue(connId);
      const normalizedSubscriptionId = normalizeValue(subscriptionId);
      if (!normalizedConnId || !normalizedSubscriptionId) {
        return false;
      }
      const entry = subscriptions.get(normalizedSubscriptionId);
      if (!entry || entry.connId !== normalizedConnId) {
        return false;
      }
      subscriptions.delete(normalizedSubscriptionId);
      removeSubscriptionRef(normalizedConnId, normalizedSubscriptionId);
      await entry.stop();
      return true;
    },
    unsubscribeAll: async (connId) => {
      const normalizedConnId = normalizeValue(connId);
      if (!normalizedConnId) {
        return;
      }
      const subscriptionIds = connToSubscriptionIds.get(normalizedConnId);
      if (!subscriptionIds || subscriptionIds.size === 0) {
        return;
      }
      connToSubscriptionIds.delete(normalizedConnId);
      await Promise.all(
        [...subscriptionIds].map(async (subscriptionId) => {
          const entry = subscriptions.get(subscriptionId);
          subscriptions.delete(subscriptionId);
          if (entry) {
            await entry.stop();
          }
        }),
      );
    },
    clear: async () => {
      const entries = [...subscriptions.values()];
      subscriptions.clear();
      connToSubscriptionIds.clear();
      await Promise.all(entries.map(async (entry) => await entry.stop()));
    },
  };
}
