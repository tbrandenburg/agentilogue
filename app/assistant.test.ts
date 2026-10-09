import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ConversationIdSchema,
  MessageIdSchema,
  RunIdSchema,
  ToolCallIdSchema,
} from "@/lib/agent/contracts/identifiers";
import { RunSnapshotSchema, type RunObservation } from "@/lib/agent/contracts/run";
import { applyAgentObservation, assistantMessageFromSnapshot } from "./opencode-projection";

describe("OpenCode assistant-ui projection", () => {
  it("appends text and merges partial tool updates without changing order", () => {
    let snapshot = RunSnapshotSchema.parse({
      runId: RunIdSchema.parse("00000000-0000-4000-8000-000000000025"),
      conversationId: ConversationIdSchema.parse("tab-one"),
      lastSequence: 0,
      phase: "running",
      messages: [],
      tools: [],
      parts: [],
      pendingPermissions: [],
    });
    const observations: RunObservation[] = [
      {
        type: "event",
        sequence: 1,
        event: {
          type: "message.delta",
          messageId: MessageIdSchema.parse("native-message"),
          segmentId: "text",
          channel: "assistant",
          text: "Hello",
        },
      },
      {
        type: "event",
        sequence: 2,
        event: {
          type: "tool.updated",
          toolCallId: ToolCallIdSchema.parse("native-tool"),
          title: "Write file",
          status: "running",
        },
      },
      {
        type: "event",
        sequence: 3,
        event: {
          type: "tool.updated",
          toolCallId: ToolCallIdSchema.parse("native-tool"),
          summary: "Writing",
        },
      },
      {
        type: "event",
        sequence: 4,
        event: {
          type: "message.delta",
          messageId: MessageIdSchema.parse("native-message"),
          segmentId: "text",
          channel: "assistant",
          text: " there",
        },
      },
    ];
    for (const observation of observations) snapshot = applyAgentObservation(snapshot, observation);

    assert.equal(snapshot.messages[0]?.text, "Hello there");
    assert.deepEqual(snapshot.parts, [
      { type: "message", messageId: "native-message", segmentId: "text" },
      { type: "tool", toolCallId: "native-tool" },
    ]);
    assert.deepEqual(snapshot.tools[0], {
      id: "native-tool",
      title: "Write file",
      status: "running",
      summary: "Writing",
    });
  });

  it("renders offered ACP permission IDs through assistant-ui approvals", () => {
    const snapshot = RunSnapshotSchema.parse({
      runId: RunIdSchema.parse("00000000-0000-4000-8000-000000000026"),
      conversationId: ConversationIdSchema.parse("tab-two"),
      lastSequence: 2,
      phase: "running",
      messages: [],
      tools: [{ id: ToolCallIdSchema.parse("native-tool"), title: "Edit file", status: "running" }],
      parts: [{ type: "tool", toolCallId: ToolCallIdSchema.parse("native-tool") }],
      pendingPermissions: [
        {
          id: "00000000-0000-4000-8000-000000000027",
          toolCallId: ToolCallIdSchema.parse("native-tool"),
          title: "Edit file",
          options: [
            { id: "once", label: "Allow once", intent: "allow" },
            { id: "reject", label: "Reject", intent: "deny" },
          ],
        },
      ],
    });
    const permissions = new Map(
      snapshot.pendingPermissions.map((request) => [request.id, { request }]),
    );
    const message = assistantMessageFromSnapshot(
      snapshot,
      "assistant-run",
      permissions,
      new Date(0),
    );
    assert.equal(message.status?.type, "requires-action");
    assert.equal(message.role, "assistant");
    if (typeof message.content === "string") throw new Error("Expected structured assistant parts");
    const tool = message.content[0];
    assert.equal(tool?.type, "tool-call");
    if (tool?.type !== "tool-call") throw new Error("Expected OpenCode tool call");
    assert.deepEqual(
      tool.approval?.options?.map((option) => [option.id, option.label]),
      [
        ["once", "Allow once"],
        ["reject", "Reject"],
      ],
    );
  });

  it("shows cancellation only after the native terminal event and preserves unknown", () => {
    const running = RunSnapshotSchema.parse({
      runId: RunIdSchema.parse("00000000-0000-4000-8000-000000000028"),
      conversationId: ConversationIdSchema.parse("tab-cancel"),
      lastSequence: 0,
      phase: "running",
      messages: [],
      tools: [],
      parts: [],
      pendingPermissions: [],
    });
    const whileRunning = assistantMessageFromSnapshot(
      running,
      "assistant-cancel",
      new Map(),
      new Date(0),
    );
    assert.equal(whileRunning.status?.type, "running");
    if (typeof whileRunning.content === "string")
      throw new Error("Expected assistant content parts");
    assert.equal(
      whileRunning.content.some((part) => part.type === "text" && part.text.includes("cancelled")),
      false,
    );

    const cancelled = applyAgentObservation(running, {
      type: "event",
      sequence: 1,
      event: { type: "run.finished", outcome: { kind: "cancelled" } },
    });
    const cancelledMessage = assistantMessageFromSnapshot(
      cancelled,
      "assistant-cancel",
      new Map(),
      new Date(0),
    );
    assert.equal(cancelledMessage.status?.type, "incomplete");
    if (typeof cancelledMessage.content === "string")
      throw new Error("Expected assistant content parts");
    assert.equal(
      cancelledMessage.content.some(
        (part) => part.type === "text" && part.text.includes("confirmed this run was cancelled"),
      ),
      true,
    );

    const unknown = applyAgentObservation(running, {
      type: "event",
      sequence: 1,
      event: { type: "run.finished", outcome: { kind: "unknown", message: "connection lost" } },
    });
    const unknownMessage = assistantMessageFromSnapshot(
      unknown,
      "assistant-unknown",
      new Map(),
      new Date(0),
    );
    assert.equal(unknownMessage.status?.type, "incomplete");
    if (typeof unknownMessage.content === "string")
      throw new Error("Expected assistant content parts");
    assert.equal(
      unknownMessage.content.some(
        (part) => part.type === "text" && part.text.includes("run unknown"),
      ),
      true,
    );
    assert.equal(
      unknownMessage.content.some(
        (part) => part.type === "text" && part.text.includes("cancelled"),
      ),
      false,
    );
  });

  it("rejects stale or foreign snapshots during observer reconnection", () => {
    const snapshot = RunSnapshotSchema.parse({
      runId: RunIdSchema.parse("00000000-0000-4000-8000-000000000029"),
      conversationId: ConversationIdSchema.parse("tab-reconnect"),
      lastSequence: 4,
      phase: "running",
      messages: [],
      tools: [],
      parts: [],
      pendingPermissions: [],
    });
    assert.throws(
      () =>
        applyAgentObservation(snapshot, {
          type: "snapshot",
          snapshot: { ...snapshot, lastSequence: 3 },
        }),
      /does not continue the active run/,
    );
    assert.throws(
      () =>
        applyAgentObservation(snapshot, {
          type: "snapshot",
          snapshot: {
            ...snapshot,
            runId: RunIdSchema.parse("00000000-0000-4000-8000-000000000030"),
          },
        }),
      /does not continue the active run/,
    );
  });
});
