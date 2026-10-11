import type { AssistantMessage, UserMessage } from "@opencode-ai/sdk/v2/client";

type OpenCodeHistoryInfo =
  | Pick<UserMessage, "role">
  | Pick<AssistantMessage, "role" | "finish" | "time">;

type OpenCodeHistoryEntry = { info: OpenCodeHistoryInfo };

export function hasOpenCodeTerminalEvidence(
  message: Pick<AssistantMessage, "finish" | "time"> | undefined,
): boolean {
  return Boolean(
    message &&
    ((typeof message.finish === "string" && message.finish.length > 0) ||
      (typeof message.time.completed === "number" && Number.isFinite(message.time.completed))),
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
    .find(({ info }) => info.role === "assistant")?.info;
  if (!latestAssistant || latestAssistant.role !== "assistant") return "unknown";
  return hasOpenCodeTerminalEvidence(latestAssistant) ? "terminal" : "unknown";
}
