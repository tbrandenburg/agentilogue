import type {
  ThreadAssistantMessagePart,
  ThreadMessageLike,
  ToolApprovalOption,
} from "@assistant-ui/react";
import {
  AgentRunEventSchema,
  RunSnapshotSchema,
  type PermissionRequest,
  type RunObservation,
  type RunSnapshot,
} from "@/lib/agent/contracts/run";

export type PermissionRecord = {
  readonly request: PermissionRequest;
  response?: { readonly approved: boolean; readonly optionId: string };
  dispatchedResponse?: { readonly approved: boolean; readonly optionId: string };
  resolution?: "cancelled" | "expired";
};

export type AssistantProjection = {
  readonly snapshot: RunSnapshot;
  readonly permissions: Map<string, PermissionRecord>;
};

export function applyAgentObservation(
  snapshot: RunSnapshot | undefined,
  observation: RunObservation,
): RunSnapshot {
  if (observation.type === "snapshot") {
    if (
      snapshot &&
      (snapshot.runId !== observation.snapshot.runId ||
        observation.snapshot.lastSequence < snapshot.lastSequence)
    )
      throw new Error("OpenCode observer snapshot does not continue the active run");
    return observation.snapshot;
  }
  if (!snapshot || observation.sequence !== snapshot.lastSequence + 1)
    throw new Error("OpenCode observation sequence is not contiguous");

  const event = AgentRunEventSchema.parse(observation.event);
  const base = { ...snapshot, lastSequence: observation.sequence };
  if (event.type === "message.delta") {
    const existing = snapshot.messages.find(
      (message) => message.id === event.messageId && message.segmentId === event.segmentId,
    );
    const messages = existing
      ? snapshot.messages.map((message) =>
          message === existing ? { ...message, text: message.text + event.text } : message,
        )
      : [
          ...snapshot.messages,
          {
            id: event.messageId,
            segmentId: event.segmentId,
            channel: event.channel,
            text: event.text,
          },
        ];
    const parts = existing
      ? snapshot.parts
      : [
          ...snapshot.parts,
          { type: "message" as const, messageId: event.messageId, segmentId: event.segmentId },
        ];
    return RunSnapshotSchema.parse({ ...base, messages, parts });
  }
  if (event.type === "tool.updated") {
    const previous = snapshot.tools.find((tool) => tool.id === event.toolCallId);
    const tool = {
      id: event.toolCallId,
      ...(previous?.title === undefined ? {} : { title: previous.title }),
      ...(previous?.status === undefined ? {} : { status: previous.status }),
      ...(previous?.summary === undefined ? {} : { summary: previous.summary }),
      ...(event.title === undefined ? {} : { title: event.title }),
      ...(event.status === undefined ? {} : { status: event.status }),
      ...(event.summary === undefined ? {} : { summary: event.summary }),
    };
    const tools = previous
      ? snapshot.tools.map((item) => (item.id === event.toolCallId ? tool : item))
      : [...snapshot.tools, tool];
    const hasPart = snapshot.parts.some(
      (part) => part.type === "tool" && part.toolCallId === event.toolCallId,
    );
    const parts = hasPart
      ? snapshot.parts
      : [...snapshot.parts, { type: "tool" as const, toolCallId: event.toolCallId }];
    return RunSnapshotSchema.parse({ ...base, tools, parts });
  }
  if (event.type === "permission.requested") {
    const pendingPermissions = snapshot.pendingPermissions.some(
      (permission) => permission.id === event.permission.id,
    )
      ? snapshot.pendingPermissions
      : [...snapshot.pendingPermissions, event.permission];
    return RunSnapshotSchema.parse({ ...base, pendingPermissions });
  }
  if (event.type === "permission.resolved")
    return RunSnapshotSchema.parse({
      ...base,
      pendingPermissions: snapshot.pendingPermissions.filter(
        (permission) => permission.id !== event.permissionId,
      ),
    });
  if (event.type === "session.bound")
    return RunSnapshotSchema.parse({ ...base, providerSessionId: event.providerSessionId });

  const outcome = event.outcome;
  if (outcome.kind === "unknown")
    return RunSnapshotSchema.parse({ ...base, phase: "unknown", outcome, pendingPermissions: [] });
  return RunSnapshotSchema.parse({ ...base, phase: "finished", outcome, pendingPermissions: [] });
}

function approvalOption(option: PermissionRequest["options"][number]): ToolApprovalOption {
  const kind: ToolApprovalOption["kind"] =
    option.intent === "allow"
      ? "allow-once"
      : option.intent === "deny"
        ? "reject-once"
        : "_acp-option";
  return { id: option.id, label: option.label, kind };
}

export function assistantMessageFromSnapshot(
  snapshot: RunSnapshot,
  messageId: string,
  permissions: ReadonlyMap<string, PermissionRecord>,
  createdAt: Date,
): ThreadMessageLike {
  const parts = [...snapshot.parts];
  for (const permission of snapshot.pendingPermissions) {
    if (
      permission.toolCallId &&
      !parts.some((part) => part.type === "tool" && part.toolCallId === permission.toolCallId)
    )
      parts.push({ type: "tool", toolCallId: permission.toolCallId });
  }
  const content: ThreadAssistantMessagePart[] = parts.map((part) => {
    if (part.type === "message") {
      const message = snapshot.messages.find(
        (item) => item.id === part.messageId && item.segmentId === part.segmentId,
      );
      return {
        type: "text",
        id: JSON.stringify([part.messageId, part.segmentId]),
        text: message?.text ?? "",
      };
    }
    const tool = snapshot.tools.find((item) => item.id === part.toolCallId);
    const approval = [...permissions.values()]
      .filter((item) => item.request.toolCallId === part.toolCallId)
      .at(-1);
    return {
      type: "tool-call",
      toolCallId: part.toolCallId,
      toolName: tool?.title ?? approval?.request.title ?? "OpenCode tool",
      args: {},
      argsText: "",
      ...(tool?.summary !== undefined
        ? { result: tool.summary }
        : tool?.status === "completed"
          ? { result: "" }
          : tool?.status === "failed"
            ? { result: "OpenCode tool failed" }
            : {}),
      ...(tool?.status === "running" || tool?.status === "pending" ? { isPreliminary: true } : {}),
      ...(tool?.status === "failed" ? { isError: true } : {}),
      ...(approval === undefined
        ? {}
        : {
            approval: {
              id: approval.request.id,
              prompt: approval.request.title,
              options: approval.request.options.map(approvalOption),
              ...(approval.response === undefined
                ? {}
                : {
                    approved: approval.response.approved,
                    optionId: approval.response.optionId,
                  }),
              ...(approval.resolution === undefined ? {} : { resolution: approval.resolution }),
            },
          }),
    };
  });

  const outcome = snapshot.phase === "running" ? undefined : snapshot.outcome;
  if (outcome?.kind === "unknown" || outcome?.kind === "failed")
    content.push({
      type: "text",
      id: "run-outcome",
      text: `OpenCode run ${outcome.kind}: ${outcome.message}`,
    });
  else if (outcome?.kind === "stopped")
    content.push({
      type: "text",
      id: "run-outcome",
      text: `OpenCode stopped the run (${outcome.reason}).`,
    });
  else if (outcome?.kind === "cancelled")
    content.push({
      type: "text",
      id: "run-outcome",
      text: "OpenCode confirmed this run was cancelled.",
    });
  else if (outcome && snapshot.messages.length === 0)
    content.push({
      type: "text",
      id: "run-outcome",
      text: "OpenCode completed without a text response.",
    });
  const status: ThreadMessageLike["status"] =
    snapshot.phase === "running"
      ? snapshot.pendingPermissions.length > 0
        ? { type: "requires-action", reason: "tool-calls" }
        : { type: "running" }
      : outcome?.kind === "success"
        ? { type: "complete", reason: "stop" }
        : outcome?.kind === "cancelled"
          ? { type: "incomplete", reason: "cancelled" }
          : outcome?.kind === "failed"
            ? { type: "incomplete", reason: "error" }
            : { type: "incomplete", reason: "other" };
  return { id: messageId, role: "assistant", content, status, createdAt };
}
