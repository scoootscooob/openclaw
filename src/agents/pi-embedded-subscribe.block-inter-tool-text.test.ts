import type { AssistantMessage } from "@mariozechner/pi-ai";
import { describe, expect, it, vi } from "vitest";
import type { OpenClawConfig } from "../config/config.js";
import {
  createSubscribedSessionHarness,
  emitAssistantTextDelta,
  emitAssistantTextEnd,
  extractTextPayloads,
} from "./pi-embedded-subscribe.e2e-harness.js";

function createInterToolHarness(params?: {
  blockInterToolText?: boolean;
  blockReplyBreak?: "text_end" | "message_end";
}) {
  const onBlockReply = vi.fn();
  const config: OpenClawConfig = {
    agents: {
      defaults: {
        blockInterToolText: params?.blockInterToolText ?? true,
      },
    },
  } as OpenClawConfig;

  const { emit, subscription } = createSubscribedSessionHarness({
    runId: "test-run",
    onBlockReply,
    blockReplyBreak: params?.blockReplyBreak ?? "text_end",
    config,
  });

  return { emit, onBlockReply, subscription };
}

/** Emit a text_delta + text_end + message_end sequence for an assistant message WITH tool_use. */
function emitMessageWithToolUse(params: { emit: (evt: unknown) => void; text: string }) {
  params.emit({
    type: "message_start",
    message: { role: "assistant" },
  });
  emitAssistantTextDelta({ emit: params.emit, delta: params.text });
  emitAssistantTextEnd({ emit: params.emit });
  // Message containing both text and tool_use content blocks
  const assistantMessage = {
    role: "assistant",
    stop_reason: "tool_use",
    content: [
      { type: "text", text: params.text },
      { type: "tool_use", id: "tool_1", name: "read_file", input: { path: "test.txt" } },
    ],
  } as unknown as AssistantMessage;
  params.emit({ type: "message_end", message: assistantMessage });
}

/** Emit a text_delta + text_end + message_end sequence for an assistant message WITHOUT tool_use. */
function emitMessageWithoutToolUse(params: { emit: (evt: unknown) => void; text: string }) {
  params.emit({
    type: "message_start",
    message: { role: "assistant" },
  });
  emitAssistantTextDelta({ emit: params.emit, delta: params.text });
  emitAssistantTextEnd({ emit: params.emit });
  const assistantMessage = {
    role: "assistant",
    stop_reason: "end_turn",
    content: [{ type: "text", text: params.text }],
  } as unknown as AssistantMessage;
  params.emit({ type: "message_end", message: assistantMessage });
}

describe("blockInterToolText (#32512)", () => {
  it("suppresses text from messages that contain tool_use blocks", () => {
    const { emit, onBlockReply } = createInterToolHarness({ blockInterToolText: true });

    // Message 1: "I'll check the file" + tool_use → should be suppressed
    emitMessageWithToolUse({ emit, text: "I'll check the file" });

    expect(onBlockReply).not.toHaveBeenCalled();
  });

  it("delivers text from messages without tool_use blocks", () => {
    const { emit, onBlockReply } = createInterToolHarness({ blockInterToolText: true });

    // Final answer message: no tool calls
    emitMessageWithoutToolUse({ emit, text: "Here is the answer." });

    const texts = extractTextPayloads(onBlockReply.mock.calls);
    expect(texts).toEqual(["Here is the answer."]);
  });

  it("delivers only the final answer when inter-tool messages precede it", () => {
    const { emit, onBlockReply } = createInterToolHarness({ blockInterToolText: true });

    // Turn 1: text + tool_use → suppressed
    emitMessageWithToolUse({ emit, text: "Let me check the file" });
    expect(onBlockReply).not.toHaveBeenCalled();

    // Simulate tool execution (these don't affect block replies directly)
    emit({ type: "tool_execution_start", toolName: "read_file", toolCallId: "t1", args: {} });
    emit({ type: "tool_execution_end", toolName: "read_file", toolCallId: "t1", result: {} });

    // Turn 2: text + tool_use → suppressed
    emitMessageWithToolUse({ emit, text: "Now checking another file" });
    expect(onBlockReply).not.toHaveBeenCalled();

    // Turn 3: final answer (no tool_use) → delivered
    emitMessageWithoutToolUse({ emit, text: "Based on my analysis, here is the result." });

    const texts = extractTextPayloads(onBlockReply.mock.calls);
    expect(texts).toEqual(["Based on my analysis, here is the result."]);
  });

  it("delivers all text when blockInterToolText is disabled", () => {
    const { emit, onBlockReply } = createInterToolHarness({ blockInterToolText: false });

    // Message with tool_use → should be delivered (feature disabled)
    emitMessageWithToolUse({ emit, text: "I'll check the file" });

    const texts = extractTextPayloads(onBlockReply.mock.calls);
    expect(texts.length).toBeGreaterThanOrEqual(1);
    expect(texts[0]).toBe("I'll check the file");
  });

  it("forces blockReplyBreak to message_end when enabled", () => {
    const { emit, onBlockReply } = createInterToolHarness({
      blockInterToolText: true,
      blockReplyBreak: "text_end", // user configured text_end, but feature overrides
    });

    // If break was still text_end, text would be emitted at text_end before
    // we know about tool_use. The feature overrides to message_end.
    emitMessageWithToolUse({ emit, text: "This should be suppressed" });
    expect(onBlockReply).not.toHaveBeenCalled();
  });

  it("suppresses text from messages detected via content blocks (not stop_reason)", () => {
    const { emit, onBlockReply } = createInterToolHarness({ blockInterToolText: true });

    emit({ type: "message_start", message: { role: "assistant" } });
    emitAssistantTextDelta({ emit, delta: "Checking..." });
    emitAssistantTextEnd({ emit });

    // Message with tool_use in content but no stop_reason field
    const assistantMessage = {
      role: "assistant",
      content: [
        { type: "text", text: "Checking..." },
        { type: "tool_use", id: "t1", name: "exec", input: {} },
      ],
    } as unknown as AssistantMessage;
    emit({ type: "message_end", message: assistantMessage });

    expect(onBlockReply).not.toHaveBeenCalled();
  });

  it("does not suppress text when config is not set (default behavior)", () => {
    const onBlockReply = vi.fn();
    const { emit } = createSubscribedSessionHarness({
      runId: "test-run",
      onBlockReply,
      blockReplyBreak: "message_end",
      // No config → blockInterToolText defaults to false
    });

    emitMessageWithToolUse({ emit, text: "Should be delivered" });

    const texts = extractTextPayloads(onBlockReply.mock.calls);
    expect(texts).toEqual(["Should be delivered"]);
  });

  it("excludes suppressed text from assistantTexts", () => {
    const { emit, onBlockReply, subscription } = createInterToolHarness({
      blockInterToolText: true,
    });

    // Suppressed message
    emitMessageWithToolUse({ emit, text: "I'll check the file" });
    expect(onBlockReply).not.toHaveBeenCalled();

    // Final answer
    emitMessageWithoutToolUse({ emit, text: "Here is the answer." });

    // Only the final answer should appear in assistantTexts (used for final payloads)
    const texts = subscription.assistantTexts.map((t) => t.trim()).filter(Boolean);
    expect(texts).toEqual(["Here is the answer."]);
  });
});
