"use client";

import { AssistantRuntimeProvider, useAuiState } from "@assistant-ui/react";
import { useOpenCodeRuntime } from "@assistant-ui/react-opencode";
import { createOpencodeClient } from "@opencode-ai/sdk/v2/client";
import { useCallback, useEffect, useState } from "react";
import { Thread } from "@/components/assistant-ui/elements/thread.aui";
import type { ThreadComponents } from "@/components/assistant-ui/elements/thread.aui";
import { SessionControlsProvider } from "@/components/assistant-ui/elements/session-controls-slot";
import type { OpenCodeNativeAvailability } from "@/lib/opencode-native-config";
import { isOpenCodeNativeOriginAllowed } from "@/lib/opencode-native-config";
import { withOpenCodeTitleWorkaround } from "@/lib/opencode-native-title-workaround";
import type { RunTargetId } from "@/lib/run-target";
import { AGENT_THREAD_COMPONENTS } from "./opencode-session";

type NativeSession = {
  id: string;
  projectName: string;
  openCodeProjectName: string;
  runTarget: RunTargetId | null;
  model?: string;
  nativeSessionId?: string;
};

type Props = {
  session: NativeSession;
  hasOpenAIKey: boolean;
  hasOpenCodeApi: boolean;
  nativeOpenCode: OpenCodeNativeAvailability;
  isActive: boolean;
  onUpdate: (patch: Partial<NativeSession>) => void;
  onRunningChange: (id: string, running: boolean) => void;
};

const THREAD_COMPONENTS: ThreadComponents = AGENT_THREAD_COMPONENTS;

export function OpenCodeNativeSessionRuntime(props: Props) {
  const [password, setPassword] = useState("");
  const [connectedPassword, setConnectedPassword] = useState<string>();
  const [error, setError] = useState<string>();
  const [originMatches, setOriginMatches] = useState(false);
  const availability = props.nativeOpenCode;

  useEffect(() => {
    setOriginMatches(
      availability.enabled &&
        Boolean(availability.appOrigin) &&
        isOpenCodeNativeOriginAllowed(availability.appOrigin ?? "", window.location.origin),
    );
  }, [availability]);

  if (!availability.enabled) {
    return (
      <p className="p-4 text-sm text-muted-foreground">
        OpenCode · Native unavailable: {availability.reason}.
      </p>
    );
  }

  if (!originMatches) {
    return (
      <p role="status" className="p-4 text-sm text-muted-foreground">
        OpenCode · Native unavailable: waiting for the configured app origin to be confirmed.
      </p>
    );
  }

  if (!connectedPassword) {
    return (
      <form
        className="mx-auto mt-8 flex max-w-md flex-col gap-3 rounded-lg border p-4"
        onSubmit={async (event) => {
          event.preventDefault();
          setError(undefined);
          try {
            const unauthenticated = createOpencodeClient({ baseUrl: availability.baseUrl });
            let unauthenticatedResult;
            try {
              unauthenticatedResult = await unauthenticated.global.health();
            } catch {
              // SDK transport failures are not proof that Basic auth is enabled.
              throw new Error("Could not verify OpenCode Basic auth");
            }
            if (unauthenticatedResult.response.status !== 401) {
              throw new Error(
                "OpenCode Basic auth is not enabled (unauthenticated health did not return 401)",
              );
            }
            const authenticated = createAuthenticatedClient(availability.baseUrl, password);
            const authenticatedResult = await authenticated.global.health();
            if (authenticatedResult.response.status !== 200 || authenticatedResult.error) {
              throw new Error("OpenCode rejected the password; check the server password");
            }
            setConnectedPassword(password);
            setPassword("");
          } catch (connectError) {
            setError(
              connectError instanceof Error
                ? connectError.message
                : "Could not connect to OpenCode",
            );
          }
        }}
      >
        <label className="text-sm font-medium" htmlFor={`opencode-password-${props.session.id}`}>
          OpenCode server password
        </label>
        <input
          id={`opencode-password-${props.session.id}`}
          type="password"
          autoComplete="off"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
          className="rounded-md border bg-background px-3 py-2 text-sm"
        />
        <p className="text-xs text-muted-foreground">
          Held in memory for this tab only. A temporary workaround skips the adapter's invalid title
          request; OpenCode may supply a title after the first prompt.
        </p>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <button
          type="submit"
          className="self-start rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground"
        >
          Connect to OpenCode
        </button>
        <button
          type="button"
          onClick={() => props.onUpdate({ runTarget: null })}
          className="self-start rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted"
        >
          Choose another runtime
        </button>
      </form>
    );
  }

  return (
    <ConnectedOpenCodeSession
      {...props}
      baseUrl={availability.baseUrl}
      password={connectedPassword}
      onDisconnect={() => setConnectedPassword(undefined)}
    />
  );
}

function createAuthenticatedClient(baseUrl: string, password: string) {
  const bytes = new TextEncoder().encode(`opencode:${password}`);
  const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join("");
  return createOpencodeClient({
    baseUrl,
    headers: { Authorization: `Basic ${btoa(binary)}` },
    fetch: withOpenCodeTitleWorkaround(fetch),
  });
}

function ConnectedOpenCodeSession({
  session,
  hasOpenAIKey,
  hasOpenCodeApi,
  nativeOpenCode,
  isActive,
  onUpdate,
  onRunningChange,
  baseUrl,
  password,
  onDisconnect,
}: Props & { baseUrl: string; password: string; onDisconnect: () => void }) {
  const [client] = useState(() => createAuthenticatedClient(baseUrl, password));
  const runtime = useOpenCodeRuntime({
    client,
    initialSessionId: session.nativeSessionId,
    onThreadIdChange: (nativeSessionId) => {
      if (nativeSessionId) onUpdate({ nativeSessionId });
    },
  });
  const reportRunning = useCallback(
    (running: boolean) => onRunningChange(session.id, running),
    [onRunningChange, session.id],
  );

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <NativeRunningStateReporter onRunningChange={reportRunning} />
      <SessionControlsProvider
        config={session}
        hasOpenAIKey={hasOpenAIKey}
        hasOpenCodeApi={hasOpenCodeApi}
        hasOpenCodeNative={nativeOpenCode.enabled}
        nativeOpenCodeReason={undefined}
        onChange={onUpdate}
      >
        <div className="relative h-full">
          <button
            type="button"
            onClick={onDisconnect}
            className="absolute right-2 top-2 z-10 rounded px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
          >
            Disconnect
          </button>
          <Thread components={THREAD_COMPONENTS} autoFocus={isActive} />
        </div>
      </SessionControlsProvider>
    </AssistantRuntimeProvider>
  );
}

function NativeRunningStateReporter({
  onRunningChange,
}: {
  onRunningChange: (running: boolean) => void;
}) {
  const isRunning = useAuiState((state) => state.thread.isRunning);
  useEffect(() => onRunningChange(isRunning), [isRunning, onRunningChange]);
  return null;
}
