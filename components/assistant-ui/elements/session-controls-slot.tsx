"use client";

import { createContext, useContext, type PropsWithChildren, type ReactNode } from "react";
import { SessionControls } from "@/components/assistant-ui/elements/session-controls";
import type { SessionControlsConfig } from "@/components/assistant-ui/elements/session-controls";

type SessionControlsContextValue = {
  config: SessionControlsConfig;
  hasOpenAIKey: boolean;
  hasOpenCodeApi: boolean;
  hasOpenCodeNative?: boolean;
  nativeOpenCodeReason?: string;
  providerControls?: ReactNode;
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
      hasOpenCodeNative={value.hasOpenCodeNative ?? false}
      nativeOpenCodeReason={value.nativeOpenCodeReason}
      providerControls={value.providerControls}
      onChange={value.onChange}
    />
  );
}
