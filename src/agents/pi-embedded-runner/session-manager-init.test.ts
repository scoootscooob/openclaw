import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { prepareSessionManagerForRun } from "./session-manager-init.js";

function makeSessionManager(fileEntries: unknown[]) {
  return {
    sessionId: "test-session",
    flushed: false,
    fileEntries,
    byId: new Map(),
    labelsById: new Map(),
    leafId: null,
  };
}

describe("prepareSessionManagerForRun", () => {
  const tmpDirs: string[] = [];

  async function makeTmpSessionFile(content: string): Promise<string> {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "session-init-test-"));
    tmpDirs.push(dir);
    const file = path.join(dir, "session.jsonl");
    await fs.writeFile(file, content, "utf-8");
    return file;
  }

  afterEach(async () => {
    for (const dir of tmpDirs) {
      await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
    }
    tmpDirs.length = 0;
  });

  it("strips thinking blocks from loaded assistant messages", async () => {
    const sessionFile = await makeTmpSessionFile("");
    const entries = [
      { type: "session", id: "s1", cwd: "/tmp" },
      {
        type: "message",
        message: {
          role: "user",
          content: [{ type: "text", text: "hello" }],
        },
      },
      {
        type: "message",
        message: {
          role: "assistant",
          content: [
            { type: "thinking", thinking: "internal reasoning", signature: "abc123" },
            { type: "text", text: "Here is my response." },
          ],
        },
      },
    ];
    const sm = makeSessionManager(entries);

    await prepareSessionManagerForRun({
      sessionManager: sm,
      sessionFile,
      hadSessionFile: true,
      sessionId: "s1",
      cwd: "/tmp",
    });

    const assistantMsg = (entries[2] as { type: string; message: { content: unknown[] } }).message;
    expect(assistantMsg.content).toHaveLength(1);
    expect((assistantMsg.content[0] as { type: string }).type).toBe("text");
  });

  it("strips redacted_thinking blocks from loaded assistant messages", async () => {
    const sessionFile = await makeTmpSessionFile("");
    const entries = [
      { type: "session", id: "s1", cwd: "/tmp" },
      {
        type: "message",
        message: {
          role: "assistant",
          content: [
            { type: "redacted_thinking", data: "opaque" },
            { type: "text", text: "Response text." },
          ],
        },
      },
    ];
    const sm = makeSessionManager(entries);

    await prepareSessionManagerForRun({
      sessionManager: sm,
      sessionFile,
      hadSessionFile: true,
      sessionId: "s1",
      cwd: "/tmp",
    });

    const msg = (entries[1] as { type: string; message: { content: unknown[] } }).message;
    expect(msg.content).toHaveLength(1);
    expect((msg.content[0] as { type: string }).type).toBe("text");
  });

  it("preserves assistant turn when all content was thinking-only", async () => {
    const sessionFile = await makeTmpSessionFile("");
    const entries = [
      { type: "session", id: "s1", cwd: "/tmp" },
      {
        type: "message",
        message: {
          role: "assistant",
          content: [{ type: "thinking", thinking: "only thinking" }],
        },
      },
    ];
    const sm = makeSessionManager(entries);

    await prepareSessionManagerForRun({
      sessionManager: sm,
      sessionFile,
      hadSessionFile: true,
      sessionId: "s1",
      cwd: "/tmp",
    });

    const msg = (entries[1] as { type: string; message: { content: unknown[] } }).message;
    expect(msg.content).toHaveLength(1);
    expect((msg.content[0] as { type: string }).type).toBe("text");
  });

  it("does not strip thinking blocks for new sessions", async () => {
    const sessionFile = await makeTmpSessionFile("");
    const entries = [
      { type: "session", id: "new-id", cwd: "/tmp" },
      {
        type: "message",
        message: {
          role: "assistant",
          content: [
            { type: "thinking", thinking: "reasoning" },
            { type: "text", text: "response" },
          ],
        },
      },
    ];
    const sm = makeSessionManager(entries);

    await prepareSessionManagerForRun({
      sessionManager: sm,
      sessionFile,
      hadSessionFile: false,
      sessionId: "new-id",
      cwd: "/tmp",
    });

    const msg = (entries[1] as { type: string; message: { content: unknown[] } }).message;
    // New session: thinking blocks should be preserved
    expect(msg.content).toHaveLength(2);
  });

  it("leaves user and tool_use messages untouched", async () => {
    const sessionFile = await makeTmpSessionFile("");
    const entries = [
      { type: "session", id: "s1", cwd: "/tmp" },
      {
        type: "message",
        message: {
          role: "user",
          content: [{ type: "text", text: "question" }],
        },
      },
      {
        type: "message",
        message: {
          role: "assistant",
          content: [
            { type: "thinking", thinking: "reasoning" },
            { type: "tool_use", id: "t1", name: "search", input: {} },
          ],
        },
      },
    ];
    const sm = makeSessionManager(entries);

    await prepareSessionManagerForRun({
      sessionManager: sm,
      sessionFile,
      hadSessionFile: true,
      sessionId: "s1",
      cwd: "/tmp",
    });

    // User message untouched
    const userMsg = (entries[1] as { type: string; message: { content: unknown[] } }).message;
    expect(userMsg.content).toHaveLength(1);

    // Assistant message: thinking stripped, tool_use preserved
    const assistantMsg = (entries[2] as { type: string; message: { content: unknown[] } }).message;
    expect(assistantMsg.content).toHaveLength(1);
    expect((assistantMsg.content[0] as { type: string }).type).toBe("tool_use");
  });
});
