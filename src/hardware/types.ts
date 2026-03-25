export type HardwareAdapterFeature = "discover" | "list" | "get" | "set" | "watch";

export type HardwareAdapterPlugin = {
  id: string;
  label: string;
  description?: string;
  supportedFeatures?: HardwareAdapterFeature[];
  isConfigured?: boolean;
};

export type RegisteredHardwareAdapter = HardwareAdapterPlugin & {
  pluginId: string;
  pluginName?: string;
  source: string;
  rootDir?: string;
};
