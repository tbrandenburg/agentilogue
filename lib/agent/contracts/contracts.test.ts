import { describe, expect, test } from "bun:test";
import {
  AgentCapabilitiesSchema,
  AgentControlBodySchema,
  AgentControlReceiptSchema,
  AgentRunEventSchema,
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
  test("accepts a valid start without minting a run ID in the browser", () => {
    expect(StartAgentRunBodySchema.parse(validStart)).toEqual(validStart);
    expect(StartAgentRunReceiptSchema.parse({ status: "accepted", runId }).runId).toBe(runId);
  });

  test("rejects malformed bodies and fields not owned by the caller", () => {
    for (const value of [
      { ...validStart, runId },
      { ...validStart, providerSessionId: "foreign" },
      { ...validStart, cwd: "/tmp" },
      { ...validStart, executable: "sh" },
      { ...validStart, credentials: "secret" },
      { ...validStart, input: [] },
      { ...validStart, input: [{ type: "text", text: "" }] },
      { ...validStart, input: [{ type: "file", fileId: "x", mimeType: "text/plain", path: "/etc/passwd" }] },
      { ...validStart, conversationId: "../escape" },
    ]) {
      expect(StartAgentRunBodySchema.safeParse(value).success).toBe(false);
    }
  });

  test("parses a separate cancel control and its nonterminal dispatch receipt", () => {
    expect(
      AgentControlBodySchema.parse({ kind: "cancel", runId, conversationId: "thread-1" }).kind,
    ).toBe("cancel");
    expect(AgentControlReceiptSchema.parse({ kind: "cancel", receipt: "dispatched" })).toEqual({
      kind: "cancel",
      receipt: "dispatched",
    });
    expect(
      AgentControlReceiptSchema.safeParse({ kind: "cancel", receipt: "cancelled" }).success,
    ).toBe(false);
  });

  test("requires a correlated permission decision and rejects stale-looking shapes", () => {
    const body = {
      kind: "permission.respond",
      runId,
      conversationId: "thread-1",
      decision: { permissionId, optionId: "allow-once" },
    } as const;
    expect(AgentControlBodySchema.parse(body)).toEqual(body);
    expect(AgentControlBodySchema.safeParse({ ...body, decision: { optionId: "allow-once" } }).success).toBe(false);
    expect(AgentControlBodySchema.safeParse({ ...body, decision: { ...body.decision, optionId: "" } }).success).toBe(false);
    expect(AgentControlBodySchema.safeParse({ ...body, conversationId: "thread-2", extra: true }).success).toBe(false);
  });
});

describe("internal provider contract", () => {
  test("capabilities distinguish cold reattach from same-process reconnect", () => {
    const capability = {
      input: { text: true, files: false },
      interactions: { permissions: true, questions: false },
      session: { continuation: true, coldReattach: false, modelSelection: false, agentSelection: false },
      observation: { live: true, reconnect: "same-process", toolUpdates: true, reasoning: false },
      cancellation: true,
    };
    expect(AgentCapabilitiesSchema.parse(capability)).toEqual(capability);
    expect(AgentCapabilitiesSchema.safeParse({
      ...capability,
      observation: { ...capability.observation, reconnect: "forever" },
    }).success).toBe(false);
  });

  test("permission options have unique native option IDs and a local correlation ID", () => {
    const permission = {
      id: permissionId,
      title: "Write a file",
      options: [
        { id: "allow", label: "Allow once", intent: "allow" },
        { id: "deny", label: "Deny", intent: "deny" },
      ],
    } as const;
    expect(PermissionRequestSchema.parse(permission)).toEqual(permission);
    expect(PermissionRequestSchema.safeParse({
      ...permission,
      options: [permission.options[0], permission.options[0]],
    }).success).toBe(false);
  });

  test("never embeds native SDK events or opaque tool execution payloads", () => {
    expect(AgentRunEventSchema.parse({
      type: "message.delta",
      messageId: "msg-1",
      channel: "assistant",
      text: "Hello",
    }).type).toBe("message.delta");
    expect(AgentRunEventSchema.safeParse({
      type: "tool.updated",
      toolCallId: "tool-1",
      status: "running",
      nativePayload: { cmd: "rm -rf /" },
    }).success).toBe(false);
    expect(AgentRunEventSchema.safeParse({
      type: "run.finished",
      outcome: { kind: "unknown", message: "Lost native process" },
    }).success).toBe(true);
  });
});
