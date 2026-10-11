"use client";

import { AssistantRuntimeProvider, useAuiState } from "@assistant-ui/react";
import type { ToolCallMessagePartProps } from "@assistant-ui/react";
import { useOpenCodeRuntime } from "@assistant-ui/react-opencode";
import { createOpencodeClient } from "@opencode-ai/sdk/v2/client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import { Thread } from "@/components/assistant-ui/elements/thread.aui";
import type { ThreadComponents } from "@/components/assistant-ui/elements/thread.aui";
import { ToolFallback as ThreadDefaultToolFallback } from "@/components/assistant-ui/elements/tool-fallback.aui";
import { SessionControlsProvider } from "@/components/assistant-ui/elements/session-controls-slot";
import type { OpenCodeNativeAvailability } from "@/lib/opencode-native-config";
import { isOpenCodeNativeOriginAllowed } from "@/lib/opencode-native-config";
import { withOpenCodeTitleWorkaround } from "@/lib/opencode-native-title-workaround";
import { createOpenCodeRunGuard } from "@/lib/opencode-native-run-guard";
import type { RunTargetId } from "@/lib/run-target";
import { AGENT_THREAD_COMPONENTS } from "./opencode-session";
import { NativeOpenCodeStatus } from "./opencode-native-status";

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
              unauthenticatedResult = await unauthenticated.global.health({
                signal: AbortSignal.timeout(5_000),
              });
            } catch {
              // SDK transport failures are not proof that Basic auth is enabled.
              throw new Error("Could not verify OpenCode Basic auth");
            }
            if (!unauthenticatedResult?.response) {
              throw new Error("Could not verify OpenCode Basic auth");
            }
            if (unauthenticatedResult.response.status !== 401) {
              throw new Error(
                "OpenCode Basic auth is not enabled (unauthenticated health did not return 401)",
              );
            }
            const authenticated = createAuthenticatedClient(availability.baseUrl, password);
            const authenticatedResult = await authenticated.global.health({
              signal: AbortSignal.timeout(5_000),
            });
            if (!authenticatedResult?.response) {
              throw new Error("Could not connect to OpenCode");
            }
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

function createAuthenticatedClient(
  baseUrl: string,
  password: string,
  fetcher: typeof fetch = fetch,
) {
  const bytes = new TextEncoder().encode(`opencode:${password}`);
  const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join("");
  return createOpencodeClient({
    baseUrl,
    headers: { Authorization: `Basic ${btoa(binary)}` },
    fetch: withOpenCodeTitleWorkaround(fetcher),
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
  const guard = useMemo(() => createOpenCodeRunGuard(fetch), []);
  const [client] = useState(() => createAuthenticatedClient(baseUrl, password, guard.fetch));
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
      <NativeGuardContext.Provider value={guard}>
        <NativeRunningStateReporter onRunningChange={reportRunning} />
        <NativeOpenCodeStatus guard={guard} client={client} sessionId={session.nativeSessionId} />
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
            <Thread components={NATIVE_THREAD_COMPONENTS} autoFocus={isActive} />
          </div>
        </SessionControlsProvider>
      </NativeGuardContext.Provider>
    </AssistantRuntimeProvider>
  );
}

const NATIVE_THREAD_COMPONENTS: ThreadComponents = {
  ...THREAD_COMPONENTS,
  ToolFallback: NativeToolFallback,
};

function NativeToolFallback(props: ToolCallMessagePartProps) {
  const guard = useGuardContext();
  useSyncExternalStore(guard.subscribe, guard.getSnapshot, guard.getSnapshot);
  const { isInvalidated } = guard;
  if (props.approval?.id && isInvalidated(props.approval.id))
    return (
      <p className="text-xs text-muted-foreground">Cancelled — approval no longer available</p>
    );
  return <ThreadDefaultToolFallback {...props} />;
}

const NativeGuardContext = createContext<ReturnType<typeof createOpenCodeRunGuard> | null>(null);

function useGuardContext() {
  const guard = useContext(NativeGuardContext);
  if (!guard) throw new Error("OpenCode native run guard is unavailable");
  return guard;
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
