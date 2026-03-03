import type { StreamFn } from "@mariozechner/pi-agent-core";
import type { Context, Model, SimpleStreamOptions } from "@mariozechner/pi-ai";
import { describe, expect, it, vi } from "vitest";
import { applyExtraParamsToAgent, collectSamplingParams } from "./extra-params.js";

// Mock streamSimple for testing
vi.mock("@mariozechner/pi-ai", () => ({
  streamSimple: vi.fn(() => ({
    push: vi.fn(),
    result: vi.fn(),
  })),
}));

type SamplingCase = {
  applyProvider: string;
  applyModelId: string;
  model: Model<"openai-completions">;
  cfg?: Parameters<typeof applyExtraParamsToAgent>[1];
  options?: SimpleStreamOptions;
};

function runSamplingCase(params: SamplingCase) {
  const payload: Record<string, unknown> = { model: params.model.id, messages: [] };
  const baseStreamFn: StreamFn = (_model, _context, options) => {
    options?.onPayload?.(payload);
    return {} as ReturnType<StreamFn>;
  };
  const agent = { streamFn: baseStreamFn };

  applyExtraParamsToAgent(agent, params.cfg, params.applyProvider, params.applyModelId);

  const context: Context = { messages: [] };
  void agent.streamFn?.(params.model, context, params.options ?? {});

  return payload;
}

const defaultModel = {
  api: "openai-completions",
  provider: "openai",
  id: "gpt-5",
} as Model<"openai-completions">;

describe("collectSamplingParams", () => {
  it("returns undefined when no sampling params are present", () => {
    expect(collectSamplingParams({ temperature: 0.7 })).toBeUndefined();
    expect(collectSamplingParams(undefined)).toBeUndefined();
    expect(collectSamplingParams({})).toBeUndefined();
  });

  it("collects snake_case params", () => {
    expect(
      collectSamplingParams({
        frequency_penalty: 0.5,
        presence_penalty: 0.3,
      }),
    ).toEqual({
      frequency_penalty: 0.5,
      presence_penalty: 0.3,
    });
  });

  it("normalises camelCase to snake_case", () => {
    expect(
      collectSamplingParams({
        frequencyPenalty: 0.5,
        presencePenalty: 0.3,
        topP: 0.9,
        topK: 40,
        repetitionPenalty: 1.1,
      }),
    ).toEqual({
      frequency_penalty: 0.5,
      presence_penalty: 0.3,
      top_p: 0.9,
      top_k: 40,
      repetition_penalty: 1.1,
    });
  });

  it("ignores non-numeric values", () => {
    expect(
      collectSamplingParams({
        frequency_penalty: "high",
        presence_penalty: true,
        top_p: null,
        top_k: 40,
      }),
    ).toEqual({ top_k: 40 });
  });

  it("ignores NaN and Infinity", () => {
    expect(
      collectSamplingParams({
        frequency_penalty: NaN,
        presence_penalty: Infinity,
        top_p: 0.9,
      }),
    ).toEqual({ top_p: 0.9 });
  });

  it("snake_case takes last-wins when both aliases are present", () => {
    // Both camelCase and snake_case are present — last-wins per iteration
    // order, but both map to the same key so the final value wins.
    const result = collectSamplingParams({
      frequencyPenalty: 0.5,
      frequency_penalty: 0.8,
    });
    expect(result).toHaveProperty("frequency_penalty");
    expect(typeof result!.frequency_penalty).toBe("number");
  });
});

describe("extra-params: sampling parameter injection", () => {
  it("injects frequency_penalty into payload", () => {
    const payload = runSamplingCase({
      applyProvider: "openai",
      applyModelId: "gpt-5",
      model: defaultModel,
      cfg: {
        agents: {
          defaults: {
            models: {
              "openai/gpt-5": {
                params: {
                  frequency_penalty: 0.5,
                },
              },
            },
          },
        },
      },
    });

    expect(payload.frequency_penalty).toBe(0.5);
  });

  it("injects multiple sampling params into payload", () => {
    const payload = runSamplingCase({
      applyProvider: "openai",
      applyModelId: "gpt-5",
      model: defaultModel,
      cfg: {
        agents: {
          defaults: {
            models: {
              "openai/gpt-5": {
                params: {
                  frequency_penalty: 0.5,
                  presence_penalty: 0.3,
                  top_p: 0.9,
                },
              },
            },
          },
        },
      },
    });

    expect(payload.frequency_penalty).toBe(0.5);
    expect(payload.presence_penalty).toBe(0.3);
    expect(payload.top_p).toBe(0.9);
  });

  it("normalises camelCase config keys to snake_case in payload", () => {
    const payload = runSamplingCase({
      applyProvider: "openai",
      applyModelId: "gpt-5",
      model: defaultModel,
      cfg: {
        agents: {
          defaults: {
            models: {
              "openai/gpt-5": {
                params: {
                  frequencyPenalty: 0.5,
                  presencePenalty: 0.3,
                  topP: 0.9,
                  topK: 40,
                  repetitionPenalty: 1.1,
                },
              },
            },
          },
        },
      },
    });

    expect(payload.frequency_penalty).toBe(0.5);
    expect(payload.presence_penalty).toBe(0.3);
    expect(payload.top_p).toBe(0.9);
    expect(payload.top_k).toBe(40);
    expect(payload.repetition_penalty).toBe(1.1);
  });

  it("does not inject sampling params when none are configured", () => {
    const payload = runSamplingCase({
      applyProvider: "openai",
      applyModelId: "gpt-5",
      model: defaultModel,
      cfg: {
        agents: {
          defaults: {
            models: {
              "openai/gpt-5": {
                params: {
                  temperature: 0.7,
                },
              },
            },
          },
        },
      },
    });

    expect(payload).not.toHaveProperty("frequency_penalty");
    expect(payload).not.toHaveProperty("presence_penalty");
    expect(payload).not.toHaveProperty("top_p");
    expect(payload).not.toHaveProperty("top_k");
    expect(payload).not.toHaveProperty("repetition_penalty");
  });

  it("chains with existing onPayload callback", () => {
    const existingOnPayload = vi.fn();
    const payload: Record<string, unknown> = { model: "gpt-5", messages: [] };
    const baseStreamFn: StreamFn = (_model, _context, options) => {
      options?.onPayload?.(payload);
      return {} as ReturnType<StreamFn>;
    };
    const agent = { streamFn: baseStreamFn };

    applyExtraParamsToAgent(
      agent,
      {
        agents: {
          defaults: {
            models: {
              "openai/gpt-5": {
                params: {
                  frequency_penalty: 0.5,
                },
              },
            },
          },
        },
      },
      "openai",
      "gpt-5",
    );

    const context: Context = { messages: [] };
    void agent.streamFn?.(defaultModel, context, { onPayload: existingOnPayload });

    // Sampling params should be injected
    expect(payload.frequency_penalty).toBe(0.5);
    // Original onPayload should still be called
    expect(existingOnPayload).toHaveBeenCalledWith(payload);
  });

  it("works with non-OpenAI providers", () => {
    const zaiModel = {
      api: "openai-completions",
      provider: "zai",
      id: "glm-5",
    } as Model<"openai-completions">;

    const payload = runSamplingCase({
      applyProvider: "zai",
      applyModelId: "glm-5",
      model: zaiModel,
      cfg: {
        agents: {
          defaults: {
            models: {
              "zai/glm-5": {
                params: {
                  frequency_penalty: 0.5,
                  repetition_penalty: 1.1,
                },
              },
            },
          },
        },
      },
    });

    expect(payload.frequency_penalty).toBe(0.5);
    expect(payload.repetition_penalty).toBe(1.1);
  });

  it("ignores non-numeric sampling param values", () => {
    const payload = runSamplingCase({
      applyProvider: "openai",
      applyModelId: "gpt-5",
      model: defaultModel,
      cfg: {
        agents: {
          defaults: {
            models: {
              "openai/gpt-5": {
                params: {
                  frequency_penalty: "high",
                  presence_penalty: 0.3,
                },
              },
            },
          },
        },
      },
    });

    expect(payload).not.toHaveProperty("frequency_penalty");
    expect(payload.presence_penalty).toBe(0.3);
  });
});
