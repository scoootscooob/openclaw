import type { HardwareWatchEvent } from "../hardware/types.js";
import { requestHeartbeatNow } from "../infra/heartbeat-wake.js";
import { enqueueSystemEvent } from "../infra/system-events.js";

export type HardwareEventRelayOptions = {
  /** Session key for the system event queue (resolveMainSessionKeyFromConfig). */
  sessionKey: string;
  /** Optional custom event formatter. */
  formatEvent?: (event: HardwareWatchEvent) => string;
};

function defaultFormatEvent(event: HardwareWatchEvent): string {
  const kind = event.kind ?? "changed";
  const name = event.resource?.name ?? "";
  const id = event.id ?? event.adapterResourceId ?? "";
  const label = name ? `${name} (${id})` : id;
  const stateValue = event.resource?.state?.value;
  const stateStr = stateValue !== undefined ? ` → ${JSON.stringify(stateValue)}` : "";
  return `Hardware ${kind}: ${label}${stateStr}`;
}

/**
 * Creates a callback that relays hardware watch events to the agent via the
 * system event queue and heartbeat wake mechanism.
 *
 * The system event queue deduplicates consecutive identical texts and caps at
 * 20 entries. `requestHeartbeatNow` coalesces within 250ms by default.
 */
export function createHardwareEventRelay(
  options: HardwareEventRelayOptions,
): (event: HardwareWatchEvent) => void {
  const { sessionKey } = options;
  const formatEvent = options.formatEvent ?? defaultFormatEvent;

  return (event: HardwareWatchEvent) => {
    const text = formatEvent(event);
    if (!text) {
      return;
    }
    const enqueued = enqueueSystemEvent(text, { sessionKey });
    if (enqueued) {
      requestHeartbeatNow({ reason: "hardware:changed" });
    }
  };
}
