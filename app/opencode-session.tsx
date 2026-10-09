"use client";

import {
  AssistantRuntimeProvider,
  useExternalStoreRuntime,
  useAuiState,
} from "@assistant-ui/react";
import type {
  AppendMessage,
  RespondToToolApprovalOptions,
  ThreadMessageLike,
} from "@assistant-ui/react";
import { AssistantTransportDecoder } from "assistant-stream";
import { useCallback, useEffect, useRef, useState } from "react";
import type { RunTargetId } from "@/lib/run-target";
import { RunObservationSchema } from "@/lib/agent/contracts/run";
import { StartAgentRunReceiptSchema } from "@/lib/agent/contracts/http";
import {
  AgentilogueSessionControlsSlot,
  SessionControlsProvider,
} from "@/components/assistant-ui/elements/session-controls-slot";
import { Thread } from "@/components/assistant-ui/elements/thread.aui";
import type { ThreadComponents } from "@/components/assistant-ui/elements/thread.aui";
import {
  applyAgentObservation,
  assistantMessageFromSnapshot,
  type AssistantProjection,
  type PermissionRecord,
} from "./opencode-projection";

export const AGENT_THREAD_COMPONENTS: ThreadComponents = {
  ComposerActionLeft: AgentilogueSessionControlsSlot,
};

type Session = {
  readonly id: string;
  readonly projectName: string;
  readonly openCodeProjectName: string;
  readonly runTarget: RunTargetId | null;
  readonly model?: string;
};

export type OpenCodeSessionRuntimeProps = {
  readonly session: Session;
  readonly hasOpenAIKey: boolean;
  readonly hasOpenCodeApi: boolean;
  readonly isActive: boolean;
  readonly onUpdate: (patch: Partial<Session>) => void;
  readonly onRunningChange: (id: string, running: boolean) => void;
};

export function OpenCodeSessionRuntime({
  session,
  hasOpenAIKey,
  hasOpenCodeApi,
  isActive,
  onUpdate,
  onRunningChange,
}: OpenCodeSessionRuntimeProps) {
  const [messages, setMessages] = useState<ThreadMessageLike[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const activeRunId = useRef<string | null>(null);
  const projection = useRef<(AssistantProjection & { messageId: string; createdAt: Date }) | null>(
    null,
  );
  const reportRunning = useCallback(
    (running: boolean) => onRunningChange(session.id, running),
    [onRunningChange, session.id],
  );

  const publishProjection = useCallback((next: typeof projection.current) => {
    if (!next) return;
    projection.current = next;
    const assistant = assistantMessageFromSnapshot(
      next.snapshot,
      next.messageId,
      next.permissions,
      next.createdAt,
    );
    setMessages((current) => {
      const index = current.findIndex((message) => message.id === next.messageId);
      if (index < 0) return [...current, assistant];
      return current.map((message) => (message.id === next.messageId ? assistant : message));
    });
    if (next.snapshot.phase !== "running") {
      activeRunId.current = null;
      setIsRunning(false);
    }
  }, []);

  const consumeObservation = useCallback(
    (messageId: string, createdAt: Date, permissions: Map<string, PermissionRecord>) =>
      (raw: unknown) => {
        const observation = RunObservationSchema.parse(raw);
        const previous =
          projection.current?.messageId === messageId ? projection.current.snapshot : undefined;
        const snapshot = applyAgentObservation(previous, observation);
        if (observation.type === "snapshot") {
          const pendingIds = new Set<string>(
            observation.snapshot.pendingPermissions.map((permission) => permission.id),
          );
          for (const permission of observation.snapshot.pendingPermissions) {
            const record = permissions.get(permission.id);
            permissions.set(permission.id, { ...record, request: permission });
          }
          for (const [id, record] of permissions) {
            if (
              pendingIds.has(id) ||
              record.response !== undefined ||
              record.resolution !== undefined
            )
              continue;
            permissions.set(
              id,
              record.dispatchedResponse
                ? { ...record, response: record.dispatchedResponse, dispatchedResponse: undefined }
                : {
                    ...record,
                    resolution:
                      observation.snapshot.phase !== "running" &&
                      observation.snapshot.outcome.kind === "cancelled"
                        ? "cancelled"
                        : "expired",
                  },
            );
          }
        } else if (observation.event.type === "permission.requested") {
          const permission = observation.event.permission;
          const record = permissions.get(permission.id);
          permissions.set(permission.id, { ...record, request: permission });
        } else if (observation.event.type === "permission.resolved") {
          const record = permissions.get(observation.event.permissionId);
          if (record && record.response === undefined)
            permissions.set(
              observation.event.permissionId,
              record.dispatchedResponse
                ? { ...record, response: record.dispatchedResponse, dispatchedResponse: undefined }
                : { ...record, resolution: "cancelled" },
            );
        } else if (observation.event.type === "run.finished") {
          for (const [id, record] of permissions) {
            if (record.response !== undefined || record.resolution !== undefined) continue;
            permissions.set(id, {
              ...record,
              resolution: observation.event.outcome.kind === "cancelled" ? "cancelled" : "expired",
            });
          }
        }
        publishProjection({ snapshot, permissions, messageId, createdAt });
      },
    [publishProjection],
  );

  const onNew = useCallback(
    async (message: AppendMessage) => {
      const unsupportedInput = message.content.some((part) => part.type !== "text");
      const text = message.content
        .filter((part) => part.type === "text")
        .map((part) => part.text)
        .join("\n");
      const userMessage: ThreadMessageLike = {
        id: crypto.randomUUID(),
        role: "user",
        content: message.content,
        createdAt: new Date(),
      };
      const assistantId = crypto.randomUUID();
      const assistantCreatedAt = new Date();
      setMessages((current) => [...current, userMessage]);
      setIsRunning(true);
      let runId: string | undefined;
      try {
        if (unsupportedInput || !text.trim())
          throw new Error("OpenCode currently supports text prompts only.");
        const start = await fetch("/api/agent", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ conversationId: session.id, input: [{ type: "text", text }] }),
        });
        if (!start.ok) throw new Error("OpenCode could not admit this run.");
        runId = StartAgentRunReceiptSchema.parse(await start.json()).runId;
        activeRunId.current = runId;
        const permissions = new Map<string, PermissionRecord>();
        await observeOpenCodeRun(
          runId,
          consumeObservation(assistantId, assistantCreatedAt, permissions),
          setIsReconnecting,
        );
        if (
          projection.current?.messageId === assistantId &&
          projection.current.snapshot.phase === "running"
        )
          throw new Error("OpenCode observation ended before a terminal result.");
      } catch (error) {
        const failure =
          error instanceof Error && error.message.includes("text prompts")
            ? error.message
            : "OpenCode could not complete this run. Its final status may be unknown.";
        const partial =
          projection.current?.messageId === assistantId
            ? assistantMessageFromSnapshot(
                projection.current.snapshot,
                assistantId,
                projection.current.permissions,
                assistantCreatedAt,
              )
            : undefined;
        const content =
          partial && Array.isArray(partial.content)
            ? [...partial.content, { type: "text" as const, id: "run-error", text: failure }]
            : [{ type: "text" as const, id: "run-error", text: failure }];
        setMessages((current) => {
          const failed: ThreadMessageLike = {
            id: assistantId,
            role: "assistant",
            content,
            status: { type: "incomplete", reason: "other" },
            createdAt: assistantCreatedAt,
          };
          const index = current.findIndex((item) => item.id === assistantId);
          if (index < 0) return [...current, failed];
          return current.map((item) => (item.id === assistantId ? failed : item));
        });
      } finally {
        const terminal = projection.current?.snapshot.phase !== "running";
        if (runId === undefined || terminal) {
          if (runId === undefined || activeRunId.current === runId) activeRunId.current = null;
          setIsRunning(false);
          setIsReconnecting(false);
          if (projection.current?.messageId === assistantId) projection.current = null;
        }
      }
    },
    [consumeObservation, session.id],
  );

  const onCancel = useCallback(async () => {
    const runId = activeRunId.current;
    if (!runId) return;
    const response = await fetch("/api/agent", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind: "cancel", runId, conversationId: session.id }),
    });
    if (!response.ok) throw new Error("OpenCode could not dispatch cancellation.");
  }, [session.id]);

  const onRespondToToolApproval = useCallback(
    async ({ approvalId, approved, optionId }: RespondToToolApprovalOptions) => {
      const runId = activeRunId.current;
      const current = projection.current;
      const permission = current?.permissions.get(approvalId);
      if (!runId || !current || !permission || !optionId)
        throw new Error("This OpenCode permission is no longer available.");
      if (!permission.request.options.some((option) => option.id === optionId))
        throw new Error("OpenCode did not offer that permission choice.");
      current.permissions.set(approvalId, {
        ...permission,
        dispatchedResponse: { approved, optionId },
      });
      publishProjection(current);
      try {
        const result = await fetch("/api/agent", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            kind: "permission.respond",
            runId,
            conversationId: session.id,
            decision: { permissionId: approvalId, optionId },
          }),
        });
        if (!result.ok) throw new Error("OpenCode could not dispatch this permission choice.");
      } catch (error) {
        current.permissions.set(approvalId, { ...permission });
        publishProjection(current);
        throw error;
      }
    },
    [publishProjection, session.id],
  );

  const runtime = useExternalStoreRuntime<ThreadMessageLike>({
    messages,
    convertMessage: (message) => message,
    isRunning,
    isSendDisabled: !hasOpenCodeApi,
    unstable_enableToolInvocations: false,
    onNew,
    onCancel,
    onRespondToToolApproval,
  });
  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <RunningStateReporter onRunningChange={reportRunning} />
      {isReconnecting ? (
        <p role="status" className="px-4 py-1 text-xs text-amber-700 dark:text-amber-300">
          OpenCode observation disconnected; reconnecting. The run remains active and can still be
          stopped.
        </p>
      ) : null}
      <SessionControlsProvider
        config={session}
        hasOpenAIKey={hasOpenAIKey}
        hasOpenCodeApi={hasOpenCodeApi}
        onChange={onUpdate}
      >
        <Thread components={AGENT_THREAD_COMPONENTS} autoFocus={isActive} />
      </SessionControlsProvider>
    </AssistantRuntimeProvider>
  );
}

function RunningStateReporter({
  onRunningChange,
}: {
  onRunningChange: (running: boolean) => void;
}) {
  const isRunning = useAuiState((state) => state.thread.isRunning);
  useEffect(() => onRunningChange(isRunning), [isRunning, onRunningChange]);
  return null;
}

async function observeOpenCodeRun(
  runId: string,
  onObservation: (observation: unknown) => void,
  onConnectionState: (reconnecting: boolean) => void,
): Promise<void> {
  let attempt = 0;
  while (true) {
    try {
      const controller = new AbortController();
      const response = await fetch(`/api/agent?runId=${encodeURIComponent(runId)}`, {
        signal: controller.signal,
      });
      if (!response.ok || !response.body) throw new Error("OpenCode observer is unavailable.");
      onConnectionState(false);
      const reader = response.body
        .pipeThrough(new AssistantTransportDecoder({ strict: true }))
        .getReader();
      let finished = false;
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          if (value.type === "error") throw new Error("OpenCode observer reported an error.");
          if (value.type !== "update-state") continue;
          for (const operation of value.operations) {
            if (operation.type !== "set" || operation.path.length !== 0) continue;
            const observation = RunObservationSchema.safeParse(operation.value);
            if (!observation.success) throw new Error("OpenCode sent an invalid observation.");
            onObservation(observation.data);
            if (
              observation.data.type === "snapshot"
                ? observation.data.snapshot.phase !== "running"
                : observation.data.event.type === "run.finished"
            )
              finished = true;
          }
        }
      } catch (error) {
        controller.abort();
        throw error;
      } finally {
        reader.releaseLock();
      }
      if (finished) return;
      throw new Error("OpenCode observer ended before a terminal result.");
    } catch {
      onConnectionState(true);
      const delay = Math.min(250 * 2 ** attempt, 5_000);
      attempt = Math.min(attempt + 1, 5);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}
