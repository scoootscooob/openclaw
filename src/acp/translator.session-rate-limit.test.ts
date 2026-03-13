import type {
  AgentSideConnection,
  LoadSessionRequest,
  NewSessionRequest,
  PromptRequest,
} from "@agentclientprotocol/sdk";
import { describe, expect, it, vi } from "vitest";
import type { GatewayClient } from "../gateway/client.js";
import { createInMemorySessionStore } from "./session.js";
import { AcpGatewayAgent } from "./translator.js";
import { createAcpConnection, createAcpGateway } from "./translator.test-helpers.js";

function createNewSessionRequest(cwd = "/tmp"): NewSessionRequest {
  return {
    cwd,
    mcpServers: [],
    _meta: {},
  } as unknown as NewSessionRequest;
}

function createLoadSessionRequest(sessionId: string, cwd = "/tmp"): LoadSessionRequest {
  return {
    sessionId,
    cwd,
    mcpServers: [],
    _meta: {},
  } as unknown as LoadSessionRequest;
}

function createPromptRequest(
  sessionId: string,
  text: string,
  meta: Record<string, unknown> = {},
): PromptRequest {
  return {
    sessionId,
    prompt: [{ type: "text", text }],
    _meta: meta,
  } as unknown as PromptRequest;
}

async function expectOversizedPromptRejected(params: { sessionId: string; text: string }) {
  const request = vi.fn(async () => ({ ok: true })) as GatewayClient["request"];
  const sessionStore = createInMemorySessionStore();
  const agent = new AcpGatewayAgent(createAcpConnection(), createAcpGateway(request), {
    sessionStore,
  });
  await agent.loadSession(createLoadSessionRequest(params.sessionId));

  await expect(agent.prompt(createPromptRequest(params.sessionId, params.text))).rejects.toThrow(
    /maximum allowed size/i,
  );
  expect(request).not.toHaveBeenCalledWith("chat.send", expect.anything(), expect.anything());
  const session = sessionStore.getSession(params.sessionId);
  expect(session?.activeRunId).toBeNull();
  expect(session?.abortController).toBeNull();

  sessionStore.clearAllSessionsForTest();
}

async function createPromptHarness() {
  const updates: Array<{ sessionId: string; update: Record<string, unknown> }> = [];
  const connection = {
    sessionUpdate: vi.fn(
      async (payload: { sessionId: string; update: Record<string, unknown> }) => {
        updates.push(payload);
      },
    ),
  };
  const request = vi.fn(async () => ({ ok: true })) as GatewayClient["request"];
  const sessionStore = createInMemorySessionStore();
  const agent = new AcpGatewayAgent(
    connection as unknown as AgentSideConnection,
    createAcpGateway(request),
    { sessionStore },
  );
  await agent.loadSession(createLoadSessionRequest("prompt-session"));
  const promptPromise = agent.prompt(createPromptRequest("prompt-session", "hello"));
  const runId = sessionStore.getSession("prompt-session")?.activeRunId;
  if (!runId) {
    throw new Error("Expected ACP prompt run to be active");
  }
  return { agent, connection, request, updates, sessionStore, promptPromise, runId };
}

describe("acp session creation rate limit", () => {
  it("rate limits excessive newSession bursts", async () => {
    const sessionStore = createInMemorySessionStore();
    const agent = new AcpGatewayAgent(createAcpConnection(), createAcpGateway(), {
      sessionStore,
      sessionCreateRateLimit: {
        maxRequests: 2,
        windowMs: 60_000,
      },
    });

    await agent.newSession(createNewSessionRequest());
    await agent.newSession(createNewSessionRequest());
    await expect(agent.newSession(createNewSessionRequest())).rejects.toThrow(
      /session creation rate limit exceeded/i,
    );

    sessionStore.clearAllSessionsForTest();
  });

  it("does not count loadSession refreshes for an existing session ID", async () => {
    const sessionStore = createInMemorySessionStore();
    const agent = new AcpGatewayAgent(createAcpConnection(), createAcpGateway(), {
      sessionStore,
      sessionCreateRateLimit: {
        maxRequests: 1,
        windowMs: 60_000,
      },
    });

    await agent.loadSession(createLoadSessionRequest("shared-session"));
    await agent.loadSession(createLoadSessionRequest("shared-session"));
    await expect(agent.loadSession(createLoadSessionRequest("new-session"))).rejects.toThrow(
      /session creation rate limit exceeded/i,
    );

    sessionStore.clearAllSessionsForTest();
  });
});

describe("acp prompt size hardening", () => {
  it("rejects oversized prompt blocks without leaking active runs", async () => {
    await expectOversizedPromptRejected({
      sessionId: "prompt-limit-oversize",
      text: "a".repeat(2 * 1024 * 1024 + 1),
    });
  });

  it("rejects oversize final messages from cwd prefix without leaking active runs", async () => {
    await expectOversizedPromptRejected({
      sessionId: "prompt-limit-prefix",
      text: "a".repeat(2 * 1024 * 1024),
    });
  });
});

describe("acp final chat snapshots", () => {
  it("emits final snapshot text before resolving end_turn", async () => {
    const { agent, updates, promptPromise, runId, sessionStore } = await createPromptHarness();

    await agent.handleGatewayEvent({
      type: "event" as const,
      event: "chat",
      payload: {
        sessionKey: "prompt-session",
        runId,
        state: "final",
        stopReason: "end_turn",
        message: {
          content: [{ type: "text", text: "FINAL TEXT SHOULD BE EMITTED" }],
        },
      },
    });

    await expect(promptPromise).resolves.toEqual({ stopReason: "end_turn" });
    expect(updates.filter((entry) => entry.update.sessionUpdate === "agent_message_chunk")).toEqual(
      [
        {
          sessionId: "prompt-session",
          update: {
            sessionUpdate: "agent_message_chunk",
            content: { type: "text", text: "FINAL TEXT SHOULD BE EMITTED" },
          },
        },
      ],
    );
    expect(sessionStore.getSession("prompt-session")?.activeRunId).toBeNull();
    sessionStore.clearAllSessionsForTest();
  });

  it("does not duplicate text when final repeats the last delta snapshot", async () => {
    const { agent, updates, promptPromise, runId, sessionStore } = await createPromptHarness();

    await agent.handleGatewayEvent({
      type: "event" as const,
      event: "chat",
      payload: {
        sessionKey: "prompt-session",
        runId,
        state: "delta",
        message: {
          content: [{ type: "text", text: "Hello world" }],
        },
      },
    });

    await agent.handleGatewayEvent({
      type: "event" as const,
      event: "chat",
      payload: {
        sessionKey: "prompt-session",
        runId,
        state: "final",
        stopReason: "end_turn",
        message: {
          content: [{ type: "text", text: "Hello world" }],
        },
      },
    });

    await expect(promptPromise).resolves.toEqual({ stopReason: "end_turn" });
    expect(updates.filter((entry) => entry.update.sessionUpdate === "agent_message_chunk")).toEqual(
      [
        {
          sessionId: "prompt-session",
          update: {
            sessionUpdate: "agent_message_chunk",
            content: { type: "text", text: "Hello world" },
          },
        },
      ],
    );
    sessionStore.clearAllSessionsForTest();
  });

  it("emits only the missing tail when the final snapshot extends prior deltas", async () => {
    const { agent, updates, promptPromise, runId, sessionStore } = await createPromptHarness();

    await agent.handleGatewayEvent({
      type: "event" as const,
      event: "chat",
      payload: {
        sessionKey: "prompt-session",
        runId,
        state: "delta",
        message: {
          content: [{ type: "text", text: "Hello" }],
        },
      },
    });

    await agent.handleGatewayEvent({
      type: "event" as const,
      event: "chat",
      payload: {
        sessionKey: "prompt-session",
        runId,
        state: "final",
        stopReason: "max_tokens",
        message: {
          content: [{ type: "text", text: "Hello world" }],
        },
      },
    });

    await expect(promptPromise).resolves.toEqual({ stopReason: "max_tokens" });
    expect(updates.filter((entry) => entry.update.sessionUpdate === "agent_message_chunk")).toEqual(
      [
        {
          sessionId: "prompt-session",
          update: {
            sessionUpdate: "agent_message_chunk",
            content: { type: "text", text: "Hello" },
          },
        },
        {
          sessionId: "prompt-session",
          update: {
            sessionUpdate: "agent_message_chunk",
            content: { type: "text", text: " world" },
          },
        },
      ],
    );
    sessionStore.clearAllSessionsForTest();
  });
});
