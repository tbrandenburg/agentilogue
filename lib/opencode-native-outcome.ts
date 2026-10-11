import type { AssistantMessage, Part, UserMessage } from "@opencode-ai/sdk/v2/client";

type OpenCodeHistoryInfo =
  | Pick<UserMessage, "role">
  | Pick<AssistantMessage, "role" | "finish" | "time" | "error">;

type OpenCodeHistoryEntry = { info: OpenCodeHistoryInfo; parts?: readonly Part[] };

export function hasOpenCodeTerminalEvidence(
  message: Pick<AssistantMessage, "finish" | "time" | "error"> | undefined,
): boolean {
  if (!message) return false;
  if (message.finish === "tool-calls" || message.finish === "unknown") return false;
  return Boolean(
    (typeof message.finish === "string" && message.finish.length > 0) ||
    (message.error &&
      typeof message.time.completed === "number" &&
      Number.isFinite(message.time.completed)),
  );
}

export function classifyOpenCodeOutcome(
  status: boolean | "busy" | "retry" | "idle" | undefined,
  hasTerminalEvidence: boolean,
): "active" | "terminal" | "unknown" {
  if (status === true || status === "busy" || status === "retry") return "active";
  return hasTerminalEvidence ? "terminal" : "unknown";
}

export function classifyOpenCodeHistoryOutcome(
  messages: readonly OpenCodeHistoryEntry[],
): "idle" | "terminal" | "unknown" {
  const latestUserIndex = messages.map(({ info }) => info.role).lastIndexOf("user");
  if (latestUserIndex < 0) return "idle";

  const latestAssistant = messages
    .slice(latestUserIndex + 1)
    .reverse()
    .find(({ info }) => info.role === "assistant");
  if (!latestAssistant || latestAssistant.info.role !== "assistant") return "unknown";
  // A provider can report stop for a tool step that still needs a follow-up model call.
  const hasToolCalls = latestAssistant.parts?.some(
    (part) =>
      part.type === "tool" &&
      !part.metadata?.providerExecuted &&
      !(part.state.status === "error" && part.state.metadata?.interrupted === true),
  );
  if (hasToolCalls) return "unknown";
  return hasOpenCodeTerminalEvidence(latestAssistant.info) ? "terminal" : "unknown";
}
