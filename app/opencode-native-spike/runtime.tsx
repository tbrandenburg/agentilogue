"use client";

import { AssistantRuntimeProvider, useAui } from "@assistant-ui/react";
import { useOpenCodeRuntime } from "@assistant-ui/react-opencode";
import { useEffect, useRef } from "react";
import { Thread } from "@/components/assistant-ui/elements/thread.aui";

export function NativeOpenCodeSpike({ baseUrl }: { baseUrl: string }) {
  const runtime = useOpenCodeRuntime({ baseUrl });

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <CreateInitialSession />
      <main className="h-dvh px-3 pt-2 md:px-6">
        <div className="mx-auto h-full max-w-4xl">
          <p className="py-2 text-xs text-amber-600">
            Disposable native OpenCode adapter experiment
          </p>
          <Thread />
        </div>
      </main>
    </AssistantRuntimeProvider>
  );
}

function CreateInitialSession() {
  const aui = useAui();
  const created = useRef(false);

  useEffect(() => {
    if (created.current) return;
    created.current = true;
    aui.threads.switchToNewThread();
  }, [aui]);

  return null;
}
