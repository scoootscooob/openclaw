/**
 * Agent Hardware Protocol (AHP) — TypeScript types.
 *
 * These types define the contract between a physical device (or bridge) and
 * the OpenClaw gateway. They mirror the AHP spec (PROTOCOL.md) and serve as
 * the single source of truth for the C/Arduino firmware SDK.
 *
 * Three interaction primitives:
 *   Properties — live readable/writable state
 *   Commands   — typed invocable operations
 *   Events     — device-declared push notifications with policies
 *
 * Types only — no runtime code.
 */

// ---------------------------------------------------------------------------
// Manifest — the self-describing capability document
// ---------------------------------------------------------------------------

export type AhpPropertyType = "boolean" | "integer" | "number" | "string" | "object" | "array";

export type AhpProperty = {
  id: string;
  type: AhpPropertyType;
  label?: string;
  description?: string;
  unit?: string;
  minimum?: number;
  maximum?: number;
  enum?: unknown[];
  observable?: boolean;
  writable?: boolean;
};

export type AhpCommandInput = {
  type: "object";
  properties?: Record<
    string,
    { type: string; minimum?: number; maximum?: number; description?: string; enum?: unknown[] }
  >;
  required?: string[];
};

export type AhpCommand = {
  id: string;
  label?: string;
  description?: string;
  input?: AhpCommandInput;
  output?: AhpCommandInput;
  safe?: boolean;
  idempotent?: boolean;
  confirmRequired?: boolean;
};

export type AhpEventPriority = "info" | "notice" | "alert" | "critical";

export type AhpEventPolicy = {
  debounce_ms?: number;
  threshold?: {
    property: string;
    above?: number;
    below?: number;
    equals?: unknown;
  };
  wake?: boolean;
  batch_window_ms?: number;
  max_rate_per_min?: number;
};

export type AhpEventDecl = {
  id: string;
  label?: string;
  description?: string;
  priority?: AhpEventPriority;
  policy?: AhpEventPolicy;
  data?: AhpCommandInput;
};

export type AhpResource = {
  id: string;
  type: string;
  semanticType?: string;
  label: string;
  description?: string;
  properties?: AhpProperty[];
  commands?: AhpCommand[];
  events?: AhpEventDecl[];
  metadata?: Record<string, unknown>;
};

export type AhpManifest = {
  resources: AhpResource[];
};

// ---------------------------------------------------------------------------
// Session lifecycle
// ---------------------------------------------------------------------------

export type AhpHelloParams = {
  protocolVersion: string;
  deviceId: string;
  label?: string;
  firmware?: string;
  caps: string[];
  manifest: AhpManifest;
};

export type AhpHelloOkResult = {
  protocolVersion: string;
  hostId: string;
  hostCaps: string[];
  sessionId: string;
};

// ---------------------------------------------------------------------------
// Interactions — host → device
// ---------------------------------------------------------------------------

export type AhpPropertyReadParams = {
  resourceId: string;
  propertyId: string;
};

export type AhpPropertyReadResult = {
  value: unknown;
  observedAt?: string;
};

export type AhpPropertyWriteParams = {
  resourceId: string;
  propertyId: string;
  value: unknown;
};

export type AhpPropertyWriteResult = {
  value: unknown;
  observedAt?: string;
};

export type AhpCommandInvokeParams = {
  resourceId: string;
  commandId: string;
  input?: Record<string, unknown>;
};

export type AhpCommandInvokeResult = {
  ok: boolean;
  output?: unknown;
};

export type AhpSubscribeParams = {
  resourceId: string;
  propertyIds?: string[];
  minIntervalMs?: number;
  maxIntervalMs?: number;
};

export type AhpSubscribeResult = {
  subscriptionId: string;
  accepted: boolean;
  negotiatedMinIntervalMs?: number;
  negotiatedMaxIntervalMs?: number;
};

export type AhpUnsubscribeParams = {
  subscriptionId: string;
};

// ---------------------------------------------------------------------------
// Notifications — device → host
// ---------------------------------------------------------------------------

export type AhpPropertyChange = {
  propertyId: string;
  value: unknown;
  observedAt?: string;
};

export type AhpPropertyChangedParams = {
  subscriptionId: string;
  resourceId: string;
  changes: AhpPropertyChange[];
};

export type AhpEventParams = {
  resourceId: string;
  eventId: string;
  priority?: AhpEventPriority;
  data?: Record<string, unknown>;
  observedAt?: string;
  seq?: number;
};

export type AhpManifestUpdateParams = {
  manifest: AhpManifest;
};

// ---------------------------------------------------------------------------
// Batch operations
// ---------------------------------------------------------------------------

export type AhpBatchOperation = {
  method: string;
  params: Record<string, unknown>;
};

export type AhpBatchParams = {
  operations: AhpBatchOperation[];
};

// ---------------------------------------------------------------------------
// Error codes
// ---------------------------------------------------------------------------

export const AHP_ERROR_CODES = {
  RESOURCE_NOT_FOUND: -32001,
  PROPERTY_NOT_FOUND: -32002,
  COMMAND_NOT_FOUND: -32003,
  NOT_WRITABLE: -32004,
  VALIDATION_FAILED: -32005,
  DEVICE_BUSY: -32006,
  CONFIRMATION_REQUIRED: -32007,
  CAPABILITY_NOT_SUPPORTED: -32008,
} as const;

// ---------------------------------------------------------------------------
// Method name constants
// ---------------------------------------------------------------------------

export const AHP_METHODS = {
  // Lifecycle
  HELLO: "ahp.hello",
  HELLO_OK: "ahp.hello.ok",
  READY: "ahp.ready",

  // Host → device
  PROPERTY_READ: "ahp.property.read",
  PROPERTY_WRITE: "ahp.property.write",
  COMMAND_INVOKE: "ahp.command.invoke",
  SUBSCRIBE: "ahp.subscribe",
  UNSUBSCRIBE: "ahp.unsubscribe",
  BATCH: "ahp.batch",

  // Device → host (notifications)
  PROPERTY_CHANGED: "ahp.property.changed",
  EVENT: "ahp.event",
  MANIFEST_UPDATE: "ahp.manifest.update",
} as const;
