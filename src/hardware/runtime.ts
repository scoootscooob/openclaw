import type {
  HardwareAdapterFeature,
  HardwareAdapterPlugin,
  RegisteredHardwareAdapter,
} from "./types.js";

export function normalizeHardwareAdapterFeatures(
  adapter: Pick<
    HardwareAdapterPlugin,
    "supportedFeatures" | "discover" | "list" | "get" | "set" | "watch"
  >,
): HardwareAdapterFeature[] {
  const features = new Set<HardwareAdapterFeature>(adapter.supportedFeatures ?? []);
  if (adapter.discover) {
    features.add("discover");
  }
  if (adapter.list) {
    features.add("list");
  }
  if (adapter.get) {
    features.add("get");
  }
  if (adapter.set) {
    features.add("set");
  }
  if (adapter.watch) {
    features.add("watch");
  }
  return [...features].toSorted();
}

export function buildHardwareAdapterCatalog(params: {
  hardwareAdapters?: readonly RegisteredHardwareAdapter[];
}): RegisteredHardwareAdapter[] {
  return [...(params.hardwareAdapters ?? [])]
    .map((adapter) => ({
      ...adapter,
      supportedFeatures: normalizeHardwareAdapterFeatures(adapter),
    }))
    .toSorted(
      (left, right) =>
        left.label.localeCompare(right.label) ||
        left.id.localeCompare(right.id) ||
        left.pluginId.localeCompare(right.pluginId),
    );
}
