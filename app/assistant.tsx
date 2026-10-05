"use client";

import { AssistantRuntimeProvider } from "@assistant-ui/react";
import { AssistantChatTransport, useChatRuntime } from "@assistant-ui/ai-sdk";
import { lastAssistantMessageIsCompleteWithToolCalls } from "ai";
import { useCallback, useRef, useState } from "react";
import { Thread } from "@/components/assistant-ui/elements/thread.aui";

type IntegrationId =
  | "openai:vercel-ai"
  | "opencode:cli"
  | "pi:cli"
  | "codex:cli"
  | "claude-code:cli"
  | "github-copilot:cli";

type ChatSession = {
  id: string;
  title: string;
  projectName: string;
  integration: IntegrationId | null;
  agent?: string;
  model?: string;
  hasMessages: boolean;
};

const createSession = (id: string, projectName: string, hasOpenAIKey: boolean): ChatSession => ({
  id,
  title: `chat ${id}`,
  projectName,
  integration: hasOpenAIKey ? "openai:vercel-ai" : null,
  hasMessages: false,
});

type AssistantProps = { hasOpenAIKey: boolean; projectName: string };

export const Assistant = ({ hasOpenAIKey, projectName }: AssistantProps) => {
  const [sessions, setSessions] = useState(() => [createSession("1", projectName, hasOpenAIKey)]);
  const [activeId, setActiveId] = useState("1");
  const [runningIds, setRunningIds] = useState<string[]>([]);
  const nextId = useRef(2);

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
    const id = `${Date.now()}-${nextId.current}`;
    const title = `chat ${nextId.current++}`;
    setSessions((current) => [
      ...current,
      { ...createSession(id, projectName, hasOpenAIKey), title },
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
      <nav
        aria-label="Chat sessions"
        className="mx-auto flex h-10 w-full max-w-4xl items-center gap-1 overflow-x-auto border-b border-border/60"
      >
        {sessions.map((session) => (
          <div
            key={session.id}
            className={`flex h-8 shrink-0 items-center rounded-t-md ${session.id === activeId ? "bg-muted/60 text-foreground" : "text-muted-foreground"}`}
          >
            <button
              type="button"
              aria-current={session.id === activeId ? "page" : undefined}
              onClick={() => setActiveId(session.id)}
              className="max-w-32 truncate px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {session.title}
            </button>
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
        <button
          type="button"
          onClick={addSession}
          aria-label="New session"
          title="New session"
          className="size-8 shrink-0 rounded-md text-lg text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          +
        </button>
      </nav>
      <div className="mx-auto h-[calc(100%-2.5rem)] max-w-4xl">
        {sessions.map((session) => (
          <SessionRuntime
            key={session.id}
            session={session}
            visible={session.id === activeId}
            hasOpenAIKey={hasOpenAIKey}
            onUpdate={(update) => updateSession(session.id, update)}
            onNewSession={addSession}
            onRunningChange={updateRunning}
          />
        ))}
      </div>
    </main>
  );
};

type SessionRuntimeProps = {
  session: ChatSession;
  visible: boolean;
  hasOpenAIKey: boolean;
  onUpdate: (update: Partial<ChatSession>) => void;
  onNewSession: () => void;
  onRunningChange: (id: string, running: boolean) => void;
};

const SessionRuntime = ({
  session,
  visible,
  hasOpenAIKey,
  onUpdate,
  onNewSession,
  onRunningChange,
}: SessionRuntimeProps) => {
  const reportRunning = useCallback(
    (running: boolean) => onRunningChange(session.id, running),
    [onRunningChange, session.id],
  );
  const runtime = useChatRuntime({
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
    transport: new AssistantChatTransport({ api: "/api/chat" }),
  });

  return (
    <section className={visible ? "h-full" : "hidden"} aria-hidden={!visible}>
      <AssistantRuntimeProvider runtime={runtime}>
        <Thread
          session={session}
          hasOpenAIKey={hasOpenAIKey}
          onUpdate={onUpdate}
          onNewSession={onNewSession}
          onRunningChange={reportRunning}
        />
      </AssistantRuntimeProvider>
    </section>
  );
};
