import type { HomeAssistantConfig } from "./config.js";

export type HomeAssistantState = {
  entity_id: string;
  state: string;
  attributes?: Record<string, unknown>;
  last_changed?: string;
  last_updated?: string;
};

type FetchLike = typeof fetch;

export class HomeAssistantClientError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HomeAssistantClientError";
  }
}

function requireConfigured(config: HomeAssistantConfig): asserts config is HomeAssistantConfig & {
  url: string;
  token: string;
} {
  if (!config.url || !config.token) {
    throw new HomeAssistantClientError(
      "Home Assistant adapter is not configured. Set plugins.entries.homeassistant.config.url and plugins.entries.homeassistant.config.token.",
    );
  }
}

function buildHeaders(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

export class HomeAssistantClient {
  constructor(
    private readonly config: HomeAssistantConfig,
    private readonly fetchImpl: FetchLike = fetch,
  ) {}

  private async requestJson<T>(path: string, init?: RequestInit): Promise<T> {
    requireConfigured(this.config);
    const response = await this.fetchImpl(`${this.config.url}${path}`, {
      ...init,
      headers: {
        ...buildHeaders(this.config.token),
        ...(init?.headers ?? {}),
      },
      signal: AbortSignal.timeout(this.config.timeoutMs),
    });
    if (!response.ok) {
      const message = await response.text().catch(() => "");
      if (response.status === 404) {
        throw new HomeAssistantClientError(`Home Assistant resource not found: ${path}`);
      }
      throw new HomeAssistantClientError(
        `Home Assistant request failed (${response.status} ${response.statusText}): ${message || path}`,
      );
    }
    return (await response.json()) as T;
  }

  async listStates(): Promise<HomeAssistantState[]> {
    return await this.requestJson<HomeAssistantState[]>("/api/states", {
      method: "GET",
    });
  }

  async getState(entityId: string): Promise<HomeAssistantState | null> {
    try {
      return await this.requestJson<HomeAssistantState>(`/api/states/${entityId}`, {
        method: "GET",
      });
    } catch (error) {
      if (error instanceof HomeAssistantClientError && error.message.includes("not found")) {
        return null;
      }
      throw error;
    }
  }

  async callService(
    domain: string,
    service: string,
    body: Record<string, unknown>,
  ): Promise<unknown> {
    return await this.requestJson(`/api/services/${domain}/${service}`, {
      method: "POST",
      body: JSON.stringify(body),
    });
  }
}
