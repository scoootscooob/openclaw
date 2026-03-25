import type { RegisteredHardwareAdapter } from "./types.js";

export function buildHardwareAdapterCatalog(params: {
  hardwareAdapters?: readonly RegisteredHardwareAdapter[];
}): RegisteredHardwareAdapter[] {
  return [...(params.hardwareAdapters ?? [])]
    .map((adapter) => ({
      ...adapter,
      supportedFeatures: [...new Set(adapter.supportedFeatures ?? [])].toSorted(),
    }))
    .toSorted(
      (left, right) =>
        left.label.localeCompare(right.label) ||
        left.id.localeCompare(right.id) ||
        left.pluginId.localeCompare(right.pluginId),
    );
}
