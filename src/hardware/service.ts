import type { PluginRegistry } from "../plugins/registry.js";
import { getActivePluginRegistry } from "../plugins/runtime.js";
import { buildHardwareAdapterCatalog, normalizeHardwareAdapterFeatures } from "./runtime.js";
import type {
  HardwareActionParams,
  HardwareActionResult,
  HardwareAdapterResource,
  HardwareAdapterWatchEvent,
  HardwareListParams,
  HardwareResourceRecord,
  HardwareWatchEvent,
  HardwareWatchEventKind,
  HardwareWatchParams,
  RegisteredHardwareAdapter,
} from "./types.js";

export class HardwareServiceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HardwareServiceError";
  }
}

function readRegistry(params?: {
  registry?: PluginRegistry | null;
}): PluginRegistry["hardwareAdapters"] {
  return params?.registry?.hardwareAdapters ?? getActivePluginRegistry()?.hardwareAdapters ?? [];
}

function normalizeText(value: string): string {
  return value.trim().toLowerCase();
}

function normalizeQuery(value: string | undefined): string | undefined {
  const trimmed = typeof value === "string" ? value.trim() : "";
  return trimmed ? trimmed.toLowerCase() : undefined;
}

function matchesResourceQuery(resource: HardwareResourceRecord, query?: string): boolean {
  if (!query) {
    return true;
  }
  const haystack = [
    resource.id,
    resource.adapterId,
    resource.adapterResourceId,
    resource.name,
    resource.type,
    resource.summary,
    ...(resource.tags ?? []),
  ]
    .filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
    .map(normalizeText);
  return haystack.some((entry) => entry.includes(query));
}

export function buildHardwareResourceId(adapterId: string, adapterResourceId: string): string {
  const normalizedAdapterId = adapterId.trim();
  const normalizedResourceId = adapterResourceId.trim();
  if (!normalizedAdapterId) {
    throw new HardwareServiceError("hardware adapter id required");
  }
  if (!normalizedResourceId) {
    throw new HardwareServiceError("hardware resource id required");
  }
  return `${normalizedAdapterId}:${normalizedResourceId}`;
}

export function parseHardwareResourceId(value: string): {
  adapterId: string;
  adapterResourceId: string;
} {
  const raw = value.trim();
  const separator = raw.indexOf(":");
  if (separator <= 0 || separator === raw.length - 1) {
    throw new HardwareServiceError(
      `invalid hardware resource id: ${value} (expected <adapterId>:<resourceId>)`,
    );
  }
  return {
    adapterId: raw.slice(0, separator),
    adapterResourceId: raw.slice(separator + 1),
  };
}

function normalizeHardwareResource(params: {
  adapter: RegisteredHardwareAdapter;
  resource: HardwareAdapterResource;
}): HardwareResourceRecord {
  const adapterResourceId = params.resource.id.trim();
  if (!adapterResourceId) {
    throw new HardwareServiceError(
      `hardware adapter ${params.adapter.id} returned a resource without an id`,
    );
  }
  const name = params.resource.name.trim();
  const type = params.resource.type.trim();
  if (!name) {
    throw new HardwareServiceError(
      `hardware adapter ${params.adapter.id} returned resource ${adapterResourceId} without a name`,
    );
  }
  if (!type) {
    throw new HardwareServiceError(
      `hardware adapter ${params.adapter.id} returned resource ${adapterResourceId} without a type`,
    );
  }
  return {
    ...params.resource,
    id: buildHardwareResourceId(params.adapter.id, adapterResourceId),
    adapterId: params.adapter.id,
    adapterLabel: params.adapter.label,
    adapterResourceId,
    pluginId: params.adapter.pluginId,
    pluginName: params.adapter.pluginName,
    name,
    type,
    summary: params.resource.summary?.trim() || undefined,
    tags: params.resource.tags?.map((tag) => tag.trim()).filter(Boolean),
    actions: params.resource.actions
      ?.map((action) => ({
        ...action,
        id: action.id.trim(),
        label: action.label?.trim() || undefined,
        description: action.description?.trim() || undefined,
      }))
      .filter((action) => action.id.length > 0),
  };
}

// Consolidated adapter lookup + configuration check.
function requireAdapter(
  adapterId: string,
  registry?: PluginRegistry | null,
): RegisteredHardwareAdapter {
  const adapters = buildHardwareAdapterCatalog({
    hardwareAdapters: readRegistry({ registry }),
  });
  const adapter = adapters.find((entry) => entry.id === adapterId);
  if (!adapter) {
    throw new HardwareServiceError(`unknown hardware adapter: ${adapterId}`);
  }
  if (adapter.isConfigured === false) {
    throw new HardwareServiceError(`hardware adapter is not configured: ${adapter.id}`);
  }
  return adapter;
}

async function listResourcesForAdapter(params: {
  adapter: RegisteredHardwareAdapter;
  query?: string;
  includeState?: boolean;
}): Promise<HardwareResourceRecord[]> {
  const listFn = params.adapter.list ?? params.adapter.discover;
  if (!listFn) {
    return [];
  }
  const resources = await listFn({
    query: params.query,
    includeState: params.includeState,
  });
  return resources
    .map((resource) =>
      normalizeHardwareResource({
        adapter: params.adapter,
        resource,
      }),
    )
    .filter((resource) => matchesResourceQuery(resource, normalizeQuery(params.query)))
    .toSorted(
      (left, right) =>
        left.name.localeCompare(right.name) ||
        left.id.localeCompare(right.id) ||
        left.adapterId.localeCompare(right.adapterId),
    );
}

export function listHardwareAdapters(params?: {
  registry?: PluginRegistry | null;
}): RegisteredHardwareAdapter[] {
  return buildHardwareAdapterCatalog({
    hardwareAdapters: readRegistry(params),
  });
}

export async function listHardwareResources(
  params?: HardwareListParams & {
    adapterId?: string;
    registry?: PluginRegistry | null;
  },
): Promise<HardwareResourceRecord[]> {
  const adapters = params?.adapterId
    ? [requireAdapter(params.adapterId, params?.registry)]
    : listHardwareAdapters(params).filter((adapter) => adapter.isConfigured !== false);
  const resourcesByAdapter = await Promise.all(
    adapters.map((adapter) =>
      listResourcesForAdapter({
        adapter,
        query: params?.query,
        includeState: params?.includeState,
      }),
    ),
  );
  return resourcesByAdapter
    .flat()
    .toSorted(
      (left, right) =>
        left.name.localeCompare(right.name) ||
        left.id.localeCompare(right.id) ||
        left.adapterId.localeCompare(right.adapterId),
    );
}

export async function getHardwareResource(params: {
  id: string;
  registry?: PluginRegistry | null;
}): Promise<HardwareResourceRecord | null> {
  const { adapterId, adapterResourceId } = parseHardwareResourceId(params.id);
  const adapter = requireAdapter(adapterId, params.registry);
  if (!adapter.get) {
    throw new HardwareServiceError(`hardware adapter does not support get: ${adapterId}`);
  }
  const resource = await adapter.get(adapterResourceId);
  return resource ? normalizeHardwareResource({ adapter, resource }) : null;
}

export async function runHardwareAction(params: {
  id: string;
  action: string;
  input?: Record<string, unknown>;
  registry?: PluginRegistry | null;
}): Promise<HardwareActionResult & { resource?: HardwareResourceRecord | null }> {
  const { adapterId, adapterResourceId } = parseHardwareResourceId(params.id);
  const adapter = requireAdapter(adapterId, params.registry);
  const features = normalizeHardwareAdapterFeatures(adapter);
  if (!features.includes("set") || !adapter.set) {
    throw new HardwareServiceError(`hardware adapter does not support actions: ${adapterId}`);
  }
  const action = params.action.trim();
  if (!action) {
    throw new HardwareServiceError("hardware action required");
  }
  const result = await adapter.set({
    resourceId: adapterResourceId,
    action,
    input: params.input,
  } satisfies HardwareActionParams);
  return {
    ...result,
    resource: result.resource
      ? normalizeHardwareResource({ adapter, resource: result.resource })
      : undefined,
  };
}

function normalizeHardwareWatchKind(value: string | undefined): HardwareWatchEventKind {
  if (value === "discovered" || value === "removed") {
    return value;
  }
  return "changed";
}

function normalizeHardwareWatchEvent(params: {
  adapter: RegisteredHardwareAdapter;
  requestedAdapterResourceId?: string;
  event: HardwareAdapterWatchEvent;
}): HardwareWatchEvent {
  const normalizedResource = params.event.resource
    ? normalizeHardwareResource({ adapter: params.adapter, resource: params.event.resource })
    : undefined;
  const adapterResourceId =
    normalizedResource?.adapterResourceId ??
    params.event.resourceId?.trim() ??
    params.requestedAdapterResourceId;
  return {
    kind: normalizeHardwareWatchKind(params.event.kind),
    adapterId: params.adapter.id,
    adapterLabel: params.adapter.label,
    pluginId: params.adapter.pluginId,
    pluginName: params.adapter.pluginName,
    ...(adapterResourceId
      ? {
          adapterResourceId,
          id: buildHardwareResourceId(params.adapter.id, adapterResourceId),
        }
      : {}),
    ...(normalizedResource ? { resource: normalizedResource } : {}),
    observedAt: params.event.observedAt ?? normalizedResource?.state?.observedAt,
    metadata: params.event.metadata,
  };
}

function matchesWatchParams(
  event: HardwareWatchEvent,
  params: {
    requestedAdapterResourceId?: string;
    query?: string;
  },
): boolean {
  if (
    params.requestedAdapterResourceId &&
    event.adapterResourceId !== params.requestedAdapterResourceId
  ) {
    return false;
  }
  if (params.query && event.resource && !matchesResourceQuery(event.resource, params.query)) {
    return false;
  }
  return true;
}

export async function watchHardwareResources(
  params: HardwareWatchParams & {
    adapterId: string;
    emit: (event: HardwareWatchEvent) => void;
    registry?: PluginRegistry | null;
  },
): Promise<() => Promise<void>> {
  const adapter = requireAdapter(params.adapterId, params.registry);
  if (!adapter.watch) {
    throw new HardwareServiceError(`hardware adapter does not support watch: ${params.adapterId}`);
  }
  const requestedAdapterResourceId = params.resourceId?.trim() || undefined;
  const query = normalizeQuery(params.query);
  const stopHandle = await adapter.watch(
    {
      resourceId: requestedAdapterResourceId,
      query: params.query,
      includeState: params.includeState,
    },
    (rawEvent) => {
      const normalizedEvent = normalizeHardwareWatchEvent({
        adapter,
        requestedAdapterResourceId,
        event: rawEvent,
      });
      if (!matchesWatchParams(normalizedEvent, { requestedAdapterResourceId, query })) {
        return;
      }
      params.emit(normalizedEvent);
    },
  );
  return async () => {
    if (typeof stopHandle === "function") {
      await stopHandle();
    }
  };
}
