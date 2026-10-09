import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  AgentCapabilitiesSchema,
  AgentControlBodySchema,
  AgentControlReceiptSchema,
  AgentRunEventSchema,
  RunSnapshotSchema,
  RunObservationSchema,
  PermissionRequestSchema,
  StartAgentRunBodySchema,
  StartAgentRunReceiptSchema,
} from "./index";

const runId = "7b34e408-421a-4f06-8dbe-720e76f8e813";
const permissionId = "6f281552-462e-40c8-b67e-c8c0f844a320";
const validStart = {
  conversationId: "thread-1",
  input: [{ type: "text", text: "Explain this code" }],
} as const;

describe("application HTTP contract", () => {
  it("accepts a valid start without minting a run ID in the browser", () => {
    assert.deepEqual(StartAgentRunBodySchema.parse(validStart), validStart);
    assert.equal(StartAgentRunReceiptSchema.parse({ status: "accepted", runId }).runId, runId);
  });

  it("rejects malformed bodies and fields not owned by the caller", () => {
    for (const value of [
      { ...validStart, runId },
      { ...validStart, providerSessionId: "foreign" },
      { ...validStart, cwd: "/tmp" },
      { ...validStart, executable: "sh" },
      { ...validStart, credentials: "secret" },
      { ...validStart, input: [] },
      { ...validStart, input: [{ type: "text", text: "" }] },
      {
        ...validStart,
        input: [{ type: "file", fileId: "x", mimeType: "text/plain", path: "/etc/passwd" }],
      },
      { ...validStart, conversationId: "../escape" },
    ]) {
      assert.equal(StartAgentRunBodySchema.safeParse(value).success, false);
    }
  });

  it("parses a separate cancel control and its nonterminal dispatch receipt", () => {
    assert.equal(
      AgentControlBodySchema.parse({ kind: "cancel", runId, conversationId: "thread-1" }).kind,
      "cancel",
    );
    assert.deepEqual(AgentControlReceiptSchema.parse({ kind: "cancel", receipt: "dispatched" }), {
      kind: "cancel",
      receipt: "dispatched",
    });
    assert.equal(
      AgentControlReceiptSchema.safeParse({ kind: "cancel", receipt: "cancelled" }).success,
      false,
    );
  });

  it("requires a correlated permission decision and rejects invalid shapes", () => {
    const body = {
      kind: "permission.respond",
      runId,
      conversationId: "thread-1",
      decision: { permissionId, optionId: "allow-once" },
    } as const;
    assert.deepEqual(AgentControlBodySchema.parse(body), body);
    assert.equal(
      AgentControlBodySchema.safeParse({ ...body, decision: { optionId: "allow-once" } }).success,
      false,
    );
    assert.equal(
      AgentControlBodySchema.safeParse({ ...body, decision: { ...body.decision, optionId: "" } })
        .success,
      false,
    );
    assert.equal(
      AgentControlBodySchema.safeParse({ ...body, conversationId: "thread-2", extra: true })
        .success,
      false,
    );
  });
});

describe("internal provider contract", () => {
  it("capabilities distinguish cold reattach from same-process reconnect", () => {
    const capability = {
      input: { text: true, files: false },
      interactions: { permissions: true, questions: false },
      session: {
        continuation: true,
        coldReattach: false,
        modelSelection: false,
        agentSelection: false,
      },
      observation: {
        live: true,
        reconnect: "same-process",
        toolUpdates: true,
        reasoning: false,
      },
      cancellation: true,
    };
    assert.deepEqual(AgentCapabilitiesSchema.parse(capability), capability);
    assert.equal(
      AgentCapabilitiesSchema.safeParse({
        ...capability,
        observation: { ...capability.observation, reconnect: "forever" },
      }).success,
      false,
    );
  });

  it("permission options have unique native option IDs and a local correlation ID", () => {
    const permission = {
      id: permissionId,
      title: "Write a file",
      options: [
        { id: "allow", label: "Allow once", intent: "allow" },
        { id: "deny", label: "Deny", intent: "deny" },
      ],
    } as const;
    assert.deepEqual(PermissionRequestSchema.parse(permission), permission);
    assert.equal(
      PermissionRequestSchema.safeParse({
        ...permission,
        options: [permission.options[0], permission.options[0]],
      }).success,
      false,
    );
  });

  it("requires coherent materialized snapshot phases and contiguous-ready cursors", () => {
    const running = {
      runId,
      conversationId: "thread-1",
      phase: "running",
      lastSequence: 0,
      messages: [],
      tools: [],
      parts: [],
      pendingPermissions: [],
    };
    assert.equal(RunSnapshotSchema.safeParse(running).success, true);
    assert.equal(
      RunSnapshotSchema.safeParse({ ...running, outcome: { kind: "success" } }).success,
      false,
    );
    assert.equal(RunSnapshotSchema.safeParse({ ...running, phase: "finished" }).success, false);
    assert.equal(
      RunSnapshotSchema.safeParse({
        ...running,
        phase: "finished",
        outcome: { kind: "unknown", message: "Lost native agent" },
      }).success,
      false,
    );
    assert.equal(
      RunSnapshotSchema.safeParse({
        ...running,
        phase: "unknown",
        outcome: { kind: "unknown", message: "Lost native agent" },
      }).success,
      true,
    );
    assert.equal(
      RunObservationSchema.safeParse({
        type: "snapshot",
        snapshot: running,
      }).success,
      true,
    );
    assert.equal(
      RunObservationSchema.safeParse({
        type: "event",
        sequence: -1,
        event: { type: "run.finished", outcome: { kind: "success" } },
      }).success,
      false,
    );
  });

  it("preserves repeated text segments around tools in snapshot order", () => {
    const snapshot = {
      runId,
      conversationId: "thread-1",
      phase: "running",
      lastSequence: 5,
      messages: [
        { id: "msg-1", segmentId: "segment-1", channel: "assistant", text: "Before" },
        { id: "msg-1", segmentId: "segment-2", channel: "assistant", text: "After" },
      ],
      tools: [{ id: "tool-1", title: "Read file", status: "completed" }],
      parts: [
        { type: "message", messageId: "msg-1", segmentId: "segment-1" },
        { type: "tool", toolCallId: "tool-1" },
        { type: "message", messageId: "msg-1", segmentId: "segment-2" },
      ],
      pendingPermissions: [],
    } as const;

    assert.deepEqual(RunSnapshotSchema.parse(snapshot).parts, snapshot.parts);
  });

  it("rejects duplicate message, tool, and pending permission IDs", () => {
    const message = {
      id: "msg-1",
      segmentId: "segment-1",
      channel: "assistant",
      text: "Hello",
    } as const;
    const tool = { id: "tool-1", title: "Read", status: "completed" } as const;
    const permission = {
      id: permissionId,
      title: "Write a file",
      options: [{ id: "allow", label: "Allow", intent: "allow" }],
    } as const;
    const running = {
      runId,
      conversationId: "thread-1",
      phase: "running",
      lastSequence: 0,
      messages: [message],
      tools: [tool],
      parts: [
        { type: "message", messageId: message.id, segmentId: message.segmentId },
        { type: "tool", toolCallId: tool.id },
      ],
      pendingPermissions: [permission],
    };

    for (const invalid of [
      { ...running, messages: [message, message], parts: [running.parts[0], running.parts[0], running.parts[1]] },
      { ...running, tools: [tool, tool] },
      { ...running, pendingPermissions: [permission, permission] },
    ]) {
      assert.equal(RunSnapshotSchema.safeParse(invalid).success, false);
    }
  });

  it("does not retain pending permissions in finished or unknown snapshots", () => {
    const permission = {
      id: permissionId,
      title: "Write a file",
      options: [{ id: "allow", label: "Allow", intent: "allow" }],
    } as const;
    const base = {
      runId,
      conversationId: "thread-1",
      lastSequence: 0,
      messages: [],
      tools: [],
      parts: [],
      pendingPermissions: [permission],
    };

    assert.equal(
      RunSnapshotSchema.safeParse({ ...base, phase: "finished", outcome: { kind: "success" } })
        .success,
      false,
    );
    assert.equal(
      RunSnapshotSchema.safeParse({
        ...base,
        phase: "unknown",
        outcome: { kind: "unknown", message: "Lost native agent" },
      }).success,
      false,
    );
  });

  it("never embeds native SDK events or opaque tool execution payloads", () => {
    assert.equal(
      AgentRunEventSchema.parse({
        type: "message.delta",
        messageId: "msg-1",
        segmentId: "segment-1",
        channel: "assistant",
        text: "Hello",
      }).type,
      "message.delta",
    );
    assert.equal(
      AgentRunEventSchema.safeParse({
        type: "tool.updated",
        toolCallId: "tool-1",
        status: "running",
        nativePayload: { cmd: "rm -rf /" },
      }).success,
      false,
    );
    assert.equal(
      AgentRunEventSchema.safeParse({
        type: "run.finished",
        outcome: { kind: "unknown", message: "Lost native process" },
      }).success,
      true,
    );
  });
});
