import * as acp from "@agentclientprotocol/sdk";
import type { AgentRunEvent, RunMessage, RunPart, RunTool } from "../contracts/run";

export interface OpenCodeProjectionState {
  readonly fallbackMessageId: string;
  readonly messages: Map<string, RunMessage>;
  readonly tools: Map<string, RunTool>;
  readonly parts: RunPart[];
}

export function projectOpenCodeUpdate(
  state: OpenCodeProjectionState,
  update: acp.SessionUpdate,
  publish: (event: AgentRunEvent) => void,
): void {
  if (update.sessionUpdate === "agent_message_chunk") {
    const id =
      "messageId" in update && update.messageId ? update.messageId : state.fallbackMessageId;
    const channel = "assistant" as const;
    const text = "content" in update && "text" in update.content ? update.content.text : "";
    if (!text) return;
    const lastPart = state.parts.at(-1);
    const lastMessage =
      lastPart?.type === "message" && lastPart.messageId === id
        ? state.messages.get(`${id}\0${lastPart.segmentId}\0${channel}`)
        : undefined;
    const segmentId = lastMessage?.segmentId ?? `text-${state.parts.length}`;
    const key = `${id}\0${segmentId}\0${channel}`;
    const old = state.messages.get(key);
    state.messages.set(key, {
      id: id as never,
      segmentId,
      channel,
      text: `${old?.text ?? ""}${text}`,
    });
    if (!old) state.parts.push({ type: "message", messageId: id as never, segmentId });
    publish({ type: "message.delta", messageId: id as never, segmentId, channel, text });
    return;
  }

  if (update.sessionUpdate !== "tool_call" && update.sessionUpdate !== "tool_call_update") return;
  const id = update.toolCallId;
  const old = state.tools.get(id) ?? { id: id as never };
  const status =
    "status" in update && update.status
      ? (
          {
            pending: "pending",
            in_progress: "running",
            completed: "completed",
            failed: "failed",
          } as const
        )[update.status]
      : undefined;
  const title = "title" in update && update.title ? update.title : undefined;
  const summary =
    "content" in update && Array.isArray(update.content)
      ? update.content
          .map((part) => ("content" in part && "text" in part.content ? part.content.text : ""))
          .join("\n")
          .slice(0, 8192)
      : undefined;
  const tool = {
    ...old,
    ...(title ? { title } : {}),
    ...(status ? { status } : {}),
    ...(summary === undefined ? {} : { summary }),
  };
  state.tools.set(id, tool);
  if (!state.parts.some((part) => part.type === "tool" && part.toolCallId === id))
    state.parts.push({ type: "tool", toolCallId: id as never });
  publish({
    type: "tool.updated",
    toolCallId: id as never,
    ...(tool.title ? { title: tool.title } : {}),
    ...(tool.status ? { status: tool.status } : {}),
    ...(tool.summary === undefined ? {} : { summary: tool.summary }),
  });
}
