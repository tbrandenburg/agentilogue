import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { SessionUpdate } from "@agentclientprotocol/sdk";
import type { AgentRunEvent, RunMessage, RunPart, RunTool } from "../contracts/run";
import { projectOpenCodeUpdate } from "./update-projection";

describe("OpenCode ACP update projection", () => {
  it("appends chunks by stable message ID", () => {
    const state = {
      fallbackMessageId: "fallback-message",
      messages: new Map<string, RunMessage>(),
      tools: new Map<string, RunTool>(),
      parts: [] as RunPart[],
    };
    const events: AgentRunEvent[] = [];
    for (const text of ["hello", " world"]) {
      const update: SessionUpdate = {
        sessionUpdate: "agent_message_chunk",
        messageId: "native-message",
        content: { type: "text", text },
      };
      projectOpenCodeUpdate(state, update, (event) => events.push(event));
    }

    assert.equal(state.messages.size, 1);
    assert.equal([...state.messages.values()][0]?.text, "hello world");
    assert.equal(state.parts.length, 1);
    assert.equal(state.parts[0]?.type === "message" ? state.parts[0].segmentId : "", "text-0");
    assert.equal(events.length, 2);
  });

  it("preserves text/tool/text order and starts a segment after intervening parts or message IDs", () => {
    const state = {
      fallbackMessageId: "fallback-message",
      messages: new Map<string, RunMessage>(),
      tools: new Map<string, RunTool>(),
      parts: [] as RunPart[],
    };
    const events: AgentRunEvent[] = [];
    const updates: SessionUpdate[] = [
      {
        sessionUpdate: "agent_message_chunk",
        messageId: "same",
        content: { type: "text", text: "A" },
      },
      {
        sessionUpdate: "agent_message_chunk",
        messageId: "same",
        content: { type: "text", text: "B" },
      },
      {
        sessionUpdate: "tool_call",
        toolCallId: "tool",
        title: "Run",
        kind: "execute",
        status: "pending",
      },
      {
        sessionUpdate: "agent_message_chunk",
        messageId: "same",
        content: { type: "text", text: "C" },
      },
      {
        sessionUpdate: "agent_message_chunk",
        messageId: "other",
        content: { type: "text", text: "D" },
      },
      {
        sessionUpdate: "agent_message_chunk",
        messageId: "same",
        content: { type: "text", text: "E" },
      },
      {
        sessionUpdate: "agent_message_chunk",
        messageId: "same",
        content: { type: "text", text: "F" },
      },
    ];
    for (const update of updates)
      projectOpenCodeUpdate(state, update, (event) => events.push(event));

    assert.deepEqual(state.parts, [
      { type: "message", messageId: "same", segmentId: "text-0" },
      { type: "tool", toolCallId: "tool" },
      { type: "message", messageId: "same", segmentId: "text-2" },
      { type: "message", messageId: "other", segmentId: "text-3" },
      { type: "message", messageId: "same", segmentId: "text-4" },
    ]);
    assert.deepEqual(
      [...state.messages.values()].map(({ id, segmentId, text }) => [id, segmentId, text]),
      [
        ["same", "text-0", "AB"],
        ["same", "text-2", "C"],
        ["other", "text-3", "D"],
        ["same", "text-4", "EF"],
      ],
    );
    assert.deepEqual(
      events.map((event) => event.type),
      [
        "message.delta",
        "message.delta",
        "tool.updated",
        "message.delta",
        "message.delta",
        "message.delta",
        "message.delta",
      ],
    );
  });

  it("merges partial tool patches without dropping earlier fields", () => {
    const state = {
      fallbackMessageId: "fallback-message",
      messages: new Map<string, RunMessage>(),
      tools: new Map<string, RunTool>(),
      parts: [] as RunPart[],
    };
    const events: AgentRunEvent[] = [];
    const initial: SessionUpdate = {
      sessionUpdate: "tool_call",
      toolCallId: "native-tool",
      title: "Write file",
      kind: "edit",
      status: "pending",
    };
    const patch: SessionUpdate = {
      sessionUpdate: "tool_call_update",
      toolCallId: "native-tool",
      status: "in_progress",
    };
    projectOpenCodeUpdate(state, initial, (event) => events.push(event));
    projectOpenCodeUpdate(state, patch, (event) => events.push(event));

    assert.deepEqual(state.tools.get("native-tool"), {
      id: "native-tool",
      title: "Write file",
      status: "running",
    });
    assert.equal(state.parts.length, 1);
    assert.equal(events.length, 2);
    assert.deepEqual(events[1], {
      type: "tool.updated",
      toolCallId: "native-tool",
      title: "Write file",
      status: "running",
    });
  });
});
