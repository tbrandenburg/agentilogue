"use client";

import { createContext, useContext, type PropsWithChildren } from "react";
import { SessionControls } from "@/components/assistant-ui/elements/session-controls";
import type { RunTargetId } from "@/lib/run-target";

type SessionControlsConfig = {
  projectName: string;
  openCodeProjectName: string;
  runTarget: RunTargetId | null;
  model?: string;
};

type SessionControlsContextValue = {
  config: SessionControlsConfig;
  hasOpenAIKey: boolean;
  hasOpenCodeApi: boolean;
  onChange: (patch: Partial<SessionControlsConfig>) => void;
};

const SessionControlsContext = createContext<SessionControlsContextValue | null>(null);

export function SessionControlsProvider({
  children,
  ...value
}: PropsWithChildren<SessionControlsContextValue>) {
  return (
    <SessionControlsContext.Provider value={value}>{children}</SessionControlsContext.Provider>
  );
}

export function AgentilogueSessionControlsSlot() {
  const value = useContext(SessionControlsContext);
  if (!value) throw new Error("SessionControlsProvider is required around the Thread slot");

  return (
    <SessionControls
      config={value.config}
      hasOpenAIKey={value.hasOpenAIKey}
      hasOpenCodeApi={value.hasOpenCodeApi}
      onChange={value.onChange}
    />
  );
}
