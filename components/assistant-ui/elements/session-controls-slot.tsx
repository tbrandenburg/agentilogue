"use client";

import { createContext, useContext, type PropsWithChildren } from "react";
import { SessionControls } from "@/components/assistant-ui/elements/session-controls";
import type { RunTargetId } from "@/lib/run-target";
import type { NativeCatalog, NativeSelection } from "@/lib/native-selection";

type SessionControlsConfig = NativeSelection & {
  projectName: string;
  openCodeProjectName: string;
  runTarget: RunTargetId | null;
  model?: string;
  nativeSessionId?: string;
};

type SessionControlsContextValue = {
  config: SessionControlsConfig;
  hasOpenAIKey: boolean;
  hasOpenCodeApi: boolean;
  hasOpenCodeNative?: boolean;
  nativeOpenCodeReason?: string;
  nativeCatalog?: NativeCatalog;
  nativeSelectionReason?: string;
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
      nativeCatalog={value.nativeCatalog}
      nativeSelectionReason={value.nativeSelectionReason}
      onChange={value.onChange}
    />
  );
}
