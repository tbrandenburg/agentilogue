"use client";

import { AssistantRuntimeProvider, useAui, useAuiState } from "@assistant-ui/react";
import { Tabs } from "@base-ui/react/tabs";
import { AssistantChatTransport, useChatRuntime } from "@assistant-ui/ai-sdk";
import { lastAssistantMessageIsCompleteWithToolCalls } from "ai";
import { useCallback, useEffect, useRef, useState } from "react";
import { Thread } from "@/components/assistant-ui/elements/thread.aui";
import type { ThreadComponents } from "@/components/assistant-ui/elements/thread.aui";
import { SessionControlsProvider } from "@/components/assistant-ui/elements/session-controls-slot";
import type { RunTargetId } from "@/lib/run-target";
import type { OpenCodeNativeAvailability } from "@/lib/opencode-native-config";
import { AGENT_THREAD_COMPONENTS, OpenCodeSessionRuntime } from "./opencode-session";
import { OpenCodeNativeSessionRuntime } from "./opencode-native-session";

type ChatSession = {
  id: string;
  title: string;
  projectName: string;
  openCodeProjectName: string;
  runTarget: RunTargetId | null;
  model?: string;
  nativeSessionId?: string;
};

const THREAD_COMPONENTS: ThreadComponents = AGENT_THREAD_COMPONENTS;

export const createConversationId = () => crypto.randomUUID();

const createSession = (
  id: string,
  projectName: string,
  openCodeProjectName: string,
  hasOpenAIKey: boolean,
): ChatSession => ({
  id,
  title: `chat ${id}`,
  projectName,
  openCodeProjectName,
  runTarget: hasOpenAIKey ? "openai:vercel-ai" : null,
  model: undefined,
});

type AssistantProps = {
  hasOpenAIKey: boolean;
  hasOpenCodeApi: boolean;
  nativeOpenCode: OpenCodeNativeAvailability;
  initialConversationId: string;
  openCodeProjectName: string;
  projectName: string;
};

export const Assistant = ({
  hasOpenAIKey,
  hasOpenCodeApi,
  nativeOpenCode,
  initialConversationId,
  openCodeProjectName,
  projectName,
}: AssistantProps) => {
  const [initialSession] = useState(() =>
    createSession(initialConversationId, projectName, openCodeProjectName, hasOpenAIKey),
  );
  const [sessions, setSessions] = useState([initialSession]);
  const [activeId, setActiveId] = useState(initialSession.id);
  const [runningIds, setRunningIds] = useState<string[]>([]);
  const nextTitleNumber = useRef(2);

  const updateSession = (id: string, update: Partial<ChatSession>) => {
    setSessions((current) =>
      current.map((session) => (session.id === id ? { ...session, ...update } : session)),
    );
  };
  const updateRunning = useCallback((id: string, running: boolean) => {
    setRunningIds((current) =>
      running ? [...new Set([...current, id])] : current.filter((runningId) => runningId !== id),
    );
  }, []);
  const addSession = () => {
    const id = createConversationId();
    const title = `chat ${nextTitleNumber.current++}`;
    setSessions((current) => [
      ...current,
      { ...createSession(id, projectName, openCodeProjectName, hasOpenAIKey), title },
    ]);
    setActiveId(id);
  };
  const closeSession = (id: string) => {
    if (sessions.length === 1 || runningIds.includes(id)) return;
    const remaining = sessions.filter((session) => session.id !== id);
    setSessions(remaining);
    if (activeId === id)
      setActiveId(remaining[Math.max(0, sessions.findIndex((item) => item.id === id) - 1)].id);
  };

  return (
    <main className="h-dvh px-3 pt-2 md:px-6">
      <Tabs.Root
        value={activeId}
        onValueChange={(value) => setActiveId(String(value))}
        className="h-full"
      >
        <div className="mx-auto flex h-10 w-full max-w-4xl items-center gap-1 border-b border-border/60">
          <Tabs.List
            aria-label="Chat sessions"
            className="flex h-full min-w-0 flex-1 items-center gap-1 overflow-x-auto"
          >
            {sessions.map((session) => (
              <div key={session.id} className="flex h-8 shrink-0 items-center rounded-t-md">
                <Tabs.Tab
                  value={session.id}
                  className="max-w-32 truncate rounded-t-md px-3 text-sm text-muted-foreground data-[active]:bg-muted/60 data-[active]:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {session.title}
                </Tabs.Tab>
                <button
                  type="button"
                  aria-label={
                    runningIds.includes(session.id)
                      ? `Cannot close ${session.title} while a response is running`
                      : `Close ${session.title}`
                  }
                  disabled={sessions.length === 1 || runningIds.includes(session.id)}
                  onClick={() => closeSession(session.id)}
                  title={
                    runningIds.includes(session.id)
                      ? "Cannot close while a response is running"
                      : "Close session"
                  }
                  className={`px-2 text-muted-foreground/70 hover:text-foreground disabled:cursor-not-allowed disabled:text-muted-foreground/35 ${sessions.length === 1 ? "hidden" : ""}`}
                >
                  ×
                </button>
              </div>
            ))}
          </Tabs.List>
          <button
            type="button"
            onClick={addSession}
            aria-label="New session"
            title="New session"
            className="size-8 shrink-0 rounded-md text-lg text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            +
          </button>
        </div>
        <div className="mx-auto h-[calc(100%-2.5rem)] max-w-4xl">
          {sessions.map((session) => (
            <Tabs.Panel key={session.id} value={session.id} keepMounted className="h-full">
              <SessionRuntime
                session={session}
                hasOpenAIKey={hasOpenAIKey}
                hasOpenCodeApi={hasOpenCodeApi}
                nativeOpenCode={nativeOpenCode}
                isActive={activeId === session.id}
                onUpdate={(update) => updateSession(session.id, update)}
                onRunningChange={updateRunning}
              />
            </Tabs.Panel>
          ))}
        </div>
      </Tabs.Root>
    </main>
  );
};

type SessionRuntimeProps = {
  session: ChatSession;
  hasOpenAIKey: boolean;
  hasOpenCodeApi: boolean;
  nativeOpenCode: OpenCodeNativeAvailability;
  isActive: boolean;
  onUpdate: (update: Partial<ChatSession>) => void;
  onRunningChange: (id: string, running: boolean) => void;
};

const SessionRuntime = (props: SessionRuntimeProps) =>
  props.session.runTarget === "opencode:cli" ? (
    <OpenCodeSessionRuntime {...props} />
  ) : props.session.runTarget === "opencode:native" ? (
    <OpenCodeNativeSessionRuntime {...props} />
  ) : (
    <AiSdkSessionRuntime {...props} />
  );

const AiSdkSessionRuntime = ({
  session,
  hasOpenAIKey,
  hasOpenCodeApi,
  nativeOpenCode,
  isActive,
  onUpdate,
  onRunningChange,
}: SessionRuntimeProps) => {
  const canSend = session.runTarget === "openai:vercel-ai" && hasOpenAIKey;
  const reportRunning = useCallback(
    (running: boolean) => onRunningChange(session.id, running),
    [onRunningChange, session.id],
  );
  const runtime = useChatRuntime({
    isSendDisabled: !canSend,
    sendAutomaticallyWhen: (options) =>
      canSend && lastAssistantMessageIsCompleteWithToolCalls(options),
    transport: new AssistantChatTransport({ api: "/api/chat" }),
  });

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <ModelContextBridge model={session.model} />
      <RunningStateReporter onRunningChange={reportRunning} />
      <SessionControlsProvider
        config={session}
        hasOpenAIKey={hasOpenAIKey}
        hasOpenCodeApi={hasOpenCodeApi}
        hasOpenCodeNative={nativeOpenCode.enabled}
        nativeOpenCodeReason={nativeOpenCode.enabled ? undefined : nativeOpenCode.reason}
        onChange={onUpdate}
      >
        <Thread components={THREAD_COMPONENTS} autoFocus={isActive} />
      </SessionControlsProvider>
    </AssistantRuntimeProvider>
  );
};

function RunningStateReporter({
  onRunningChange,
}: {
  onRunningChange: (running: boolean) => void;
}) {
  const isRunning = useAuiState((state) => state.thread.isRunning);
  useEffect(() => onRunningChange(isRunning), [isRunning, onRunningChange]);
  return null;
}

function ModelContextBridge({ model }: { model?: string }) {
  const aui = useAui();

  useEffect(() => {
    if (model === undefined) return;
    return aui.modelContext.register({
      getModelContext: () => ({ config: { modelName: model } }),
    });
  }, [aui, model]);

  return null;
}
