export type HardwareAdapterFeature = "discover" | "list" | "get" | "set" | "watch";

export type HardwareResourceAction = {
  id: string;
  label?: string;
  description?: string;
};

export type HardwareResourceState = {
  value?: unknown;
  properties?: Record<string, unknown>;
  observedAt?: string;
};

export type HardwareAdapterResource = {
  id: string;
  name: string;
  type: string;
  summary?: string;
  tags?: string[];
  actions?: HardwareResourceAction[];
  state?: HardwareResourceState;
  metadata?: Record<string, unknown>;
};

export type HardwareResourceRecord = HardwareAdapterResource & {
  id: string;
  adapterId: string;
  adapterLabel: string;
  adapterResourceId: string;
  pluginId: string;
  pluginName?: string;
};

export type HardwareListParams = {
  query?: string;
  includeState?: boolean;
};

export type HardwareActionParams = {
  resourceId: string;
  action: string;
  input?: Record<string, unknown>;
};

export type HardwareActionResult = {
  ok: boolean;
  resource?: HardwareAdapterResource | null;
  result?: unknown;
};

export type HardwareWatchEventKind = "changed" | "discovered" | "removed";

export type HardwareWatchParams = HardwareListParams & {
  resourceId?: string;
};

export type HardwareAdapterWatchEvent = {
  kind?: HardwareWatchEventKind;
  resourceId?: string;
  resource?: HardwareAdapterResource | null;
  observedAt?: string;
  metadata?: Record<string, unknown>;
};

export type HardwareWatchEvent = {
  kind: HardwareWatchEventKind;
  adapterId: string;
  adapterLabel: string;
  pluginId: string;
  pluginName?: string;
  id?: string;
  adapterResourceId?: string;
  resource?: HardwareResourceRecord | null;
  observedAt?: string;
  metadata?: Record<string, unknown>;
};

type Awaitable<T> = T | Promise<T>;

export type HardwareAdapterPlugin = {
  id: string;
  label: string;
  description?: string;
  supportedFeatures?: HardwareAdapterFeature[];
  isConfigured?: boolean;
  discover?: (params?: HardwareListParams) => Awaitable<HardwareAdapterResource[]>;
  list?: (params?: HardwareListParams) => Awaitable<HardwareAdapterResource[]>;
  get?: (resourceId: string) => Awaitable<HardwareAdapterResource | null>;
  set?: (params: HardwareActionParams) => Awaitable<HardwareActionResult>;
  watch?: (
    params: HardwareWatchParams,
    emit: (event: HardwareAdapterWatchEvent) => void,
  ) => Awaitable<void | (() => Awaitable<void>)>;
};

export type RegisteredHardwareAdapter = HardwareAdapterPlugin & {
  pluginId: string;
  pluginName?: string;
  source: string;
  rootDir?: string;
};
