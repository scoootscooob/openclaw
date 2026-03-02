import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSignalEventHandler } from "./event-handler.js";
import {
  createBaseSignalEventHandlerDeps,
  createSignalReceiveEvent,
} from "./event-handler.test-harness.js";

const { dispatchInboundMessageMock } = vi.hoisted(() => ({
  dispatchInboundMessageMock: vi.fn(async () => ({
    queuedFinal: false,
    counts: { tool: 0, block: 0, final: 0 },
  })),
}));

vi.mock("../send.js", () => ({
  sendMessageSignal: vi.fn(),
  sendTypingSignal: vi.fn().mockResolvedValue(true),
  sendReadReceiptSignal: vi.fn().mockResolvedValue(true),
}));

vi.mock("../../auto-reply/dispatch.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../auto-reply/dispatch.js")>();
  return {
    ...actual,
    dispatchInboundMessage: dispatchInboundMessageMock,
    dispatchInboundMessageWithDispatcher: dispatchInboundMessageMock,
    dispatchInboundMessageWithBufferedDispatcher: dispatchInboundMessageMock,
  };
});

vi.mock("../../pairing/pairing-store.js", () => ({
  readChannelAllowFromStore: vi.fn().mockResolvedValue([]),
  upsertChannelPairingRequest: vi.fn(),
}));

describe("signal group admin / settings event filtering", () => {
  beforeEach(() => {
    dispatchInboundMessageMock.mockClear();
  });

  it("drops group UPDATE events (admin actions)", async () => {
    const handler = createSignalEventHandler(
      createBaseSignalEventHandlerDeps({
        // oxlint-disable-next-line typescript/no-explicit-any
        cfg: { messages: { inbound: { debounceMs: 0 } } } as any,
        historyLimit: 0,
      }),
    );

    await handler(
      createSignalReceiveEvent({
        dataMessage: {
          message: "Group name changed",
          groupInfo: { groupId: "g1", groupName: "New Name", type: "UPDATE" },
        },
      }),
    );

    expect(dispatchInboundMessageMock).not.toHaveBeenCalled();
  });

  it("drops expiration timer update events", async () => {
    const handler = createSignalEventHandler(
      createBaseSignalEventHandlerDeps({
        // oxlint-disable-next-line typescript/no-explicit-any
        cfg: { messages: { inbound: { debounceMs: 0 } } } as any,
        historyLimit: 0,
      }),
    );

    await handler(
      createSignalReceiveEvent({
        dataMessage: {
          message: null,
          isExpirationUpdate: true,
          expiresInSeconds: 3600,
          groupInfo: { groupId: "g1", groupName: "Test Group" },
        },
      }),
    );

    expect(dispatchInboundMessageMock).not.toHaveBeenCalled();
  });

  it("allows normal DELIVER group messages through", async () => {
    const handler = createSignalEventHandler(
      createBaseSignalEventHandlerDeps({
        // oxlint-disable-next-line typescript/no-explicit-any
        cfg: { messages: { inbound: { debounceMs: 0 } } } as any,
        historyLimit: 0,
      }),
    );

    await handler(
      createSignalReceiveEvent({
        dataMessage: {
          message: "Hello everyone",
          groupInfo: { groupId: "g1", groupName: "Test Group", type: "DELIVER" },
        },
      }),
    );

    expect(dispatchInboundMessageMock).toHaveBeenCalled();
  });
});
