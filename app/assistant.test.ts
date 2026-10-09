import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ConversationIdSchema,
  MessageIdSchema,
  RunIdSchema,
  ToolCallIdSchema,
} from "@/lib/agent/contracts/identifiers";
import type { SessionUpdate } from "@agentclientprotocol/sdk";
import {
  RunSnapshotSchema,
  type AgentRunEvent,
  type RunMessage,
  type RunObservation,
  type RunTool,
} from "@/lib/agent/contracts/run";
import { projectOpenCodeUpdate } from "@/lib/agent/opencode/update-projection";
import { applyAgentObservation, assistantMessageFromSnapshot } from "./opencode-projection";

describe("OpenCode assistant-ui projection", () => {
  it("reconstructs interleaved text/tool segments in event order with unique UI part IDs", () => {
    let snapshot = RunSnapshotSchema.parse({
      runId: RunIdSchema.parse("00000000-0000-4000-8000-000000000031"),
      conversationId: ConversationIdSchema.parse("tab-interleaved"),
      lastSequence: 0,
      phase: "running",
      messages: [],
      tools: [],
      parts: [],
      pendingPermissions: [],
    });
    const state = {
      fallbackMessageId: "fallback",
      messages: new Map<string, RunMessage>(),
      tools: new Map<string, RunTool>(),
      parts: [] as typeof snapshot.parts,
    };
    const updates = [
      {
        sessionUpdate: "agent_message_chunk",
        messageId: "native-one",
        content: { type: "text", text: "A" },
      },
      {
        sessionUpdate: "agent_message_chunk",
        messageId: "native-one",
        content: { type: "text", text: "B" },
      },
      {
        sessionUpdate: "tool_call",
        toolCallId: "tool-one",
        title: "Tool",
        kind: "execute",
        status: "pending",
      },
      {
        sessionUpdate: "agent_message_chunk",
        messageId: "native-one",
        content: { type: "text", text: "C" },
      },
      {
        sessionUpdate: "agent_message_chunk",
        messageId: "native-two",
        content: { type: "text", text: "D" },
      },
    ] as SessionUpdate[];
    const events: AgentRunEvent[] = [];
    for (const update of updates)
      projectOpenCodeUpdate(state, update, (event) => events.push(event));
    for (const [index, event] of events.entries())
      snapshot = applyAgentObservation(snapshot, { type: "event", sequence: index + 1, event });

    assert.deepEqual(snapshot.parts, state.parts);
    assert.deepEqual(snapshot.messages, [...state.messages.values()]);
    const message = assistantMessageFromSnapshot(snapshot, "assistant", new Map(), new Date(0));
    if (typeof message.content === "string") throw new Error("Expected structured assistant parts");
    assert.deepEqual(
      message.content.map((part) =>
        part.type === "text" ? part.text : part.type === "tool-call" ? part.toolCallId : part.type,
      ),
      ["AB", "tool-one", "C", "D"],
    );
    const textIds = message.content.filter((part) => part.type === "text").map((part) => part.id);
    assert.equal(new Set(textIds).size, textIds.length);
  });

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

  it("renders abnormal ACP stop reasons as incomplete, not successful", () => {
    const running = RunSnapshotSchema.parse({
      runId: RunIdSchema.parse("00000000-0000-4000-8000-000000000032"),
      conversationId: ConversationIdSchema.parse("tab-stopped"),
      lastSequence: 0,
      phase: "running",
      messages: [],
      tools: [],
      parts: [],
      pendingPermissions: [],
    });
    const stopped = applyAgentObservation(running, {
      type: "event",
      sequence: 1,
      event: { type: "run.finished", outcome: { kind: "stopped", reason: "max_tokens" } },
    });
    const message = assistantMessageFromSnapshot(
      stopped,
      "assistant-stopped",
      new Map(),
      new Date(0),
    );

    assert.equal(message.status?.type, "incomplete");
    if (typeof message.content === "string") throw new Error("Expected structured assistant parts");
    assert.ok(
      message.content.some(
        (part) => part.type === "text" && part.text.includes("stopped the run (max_tokens)"),
      ),
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
