import type {
  AnyAgentTool,
  HardwareAdapterPlugin,
  ImageGenerationProviderPlugin,
  MediaUnderstandingProviderPlugin,
  OpenClawPluginApi,
  ProviderPlugin,
  SpeechProviderPlugin,
  WebSearchProviderPlugin,
} from "./types.js";

export type CapturedPluginRegistration = {
  api: OpenClawPluginApi;
  providers: ProviderPlugin[];
  hardwareAdapters: HardwareAdapterPlugin[];
  speechProviders: SpeechProviderPlugin[];
  mediaUnderstandingProviders: MediaUnderstandingProviderPlugin[];
  imageGenerationProviders: ImageGenerationProviderPlugin[];
  webSearchProviders: WebSearchProviderPlugin[];
  tools: AnyAgentTool[];
};

export function createCapturedPluginRegistration(): CapturedPluginRegistration {
  const providers: ProviderPlugin[] = [];
  const hardwareAdapters: HardwareAdapterPlugin[] = [];
  const speechProviders: SpeechProviderPlugin[] = [];
  const mediaUnderstandingProviders: MediaUnderstandingProviderPlugin[] = [];
  const imageGenerationProviders: ImageGenerationProviderPlugin[] = [];
  const webSearchProviders: WebSearchProviderPlugin[] = [];
  const tools: AnyAgentTool[] = [];

  return {
    providers,
    hardwareAdapters,
    speechProviders,
    mediaUnderstandingProviders,
    imageGenerationProviders,
    webSearchProviders,
    tools,
    api: {
      registerProvider(provider: ProviderPlugin) {
        providers.push(provider);
      },
      registerHardwareAdapter(adapter: HardwareAdapterPlugin) {
        hardwareAdapters.push(adapter);
      },
      registerSpeechProvider(provider: SpeechProviderPlugin) {
        speechProviders.push(provider);
      },
      registerMediaUnderstandingProvider(provider: MediaUnderstandingProviderPlugin) {
        mediaUnderstandingProviders.push(provider);
      },
      registerImageGenerationProvider(provider: ImageGenerationProviderPlugin) {
        imageGenerationProviders.push(provider);
      },
      registerWebSearchProvider(provider: WebSearchProviderPlugin) {
        webSearchProviders.push(provider);
      },
      registerTool(tool: AnyAgentTool) {
        tools.push(tool);
      },
    } as OpenClawPluginApi,
  };
}

export function capturePluginRegistration(params: {
  register(api: OpenClawPluginApi): void;
}): CapturedPluginRegistration {
  const captured = createCapturedPluginRegistration();
  params.register(captured.api);
  return captured;
}
