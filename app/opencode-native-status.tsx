"use client";

import { useAuiState } from "@assistant-ui/react";
import { useOpenCodePermissions, useOpenCodeThreadState } from "@assistant-ui/react-opencode";
import type { OpencodeClient } from "@opencode-ai/sdk/v2/client";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { OpenCodeRunGuard } from "@/lib/opencode-native-run-guard";
import { createOpenCodeRecheck, readOpenCodeRecoveryOutcome } from "@/lib/opencode-native-recheck";

export function NativeOpenCodeStatus({
  guard,
  client,
  sessionId,
}: {
  guard: OpenCodeRunGuard;
  client: OpencodeClient;
  sessionId: string | undefined;
}) {
  const { pending } = useOpenCodePermissions();
  useLayoutEffect(
    () => guard.trackPending(pending.map((permission) => permission.id)),
    [guard, pending],
  );
  if (!sessionId) return null;
  return <NativeOpenCodeStatusReady client={client} sessionId={sessionId} />;
}

function NativeOpenCodeStatusReady({
  client,
  sessionId,
}: {
  client: OpencodeClient;
  sessionId: string;
}) {
  const state = useOpenCodeThreadState();
  const isRunning = useAuiState((thread) => thread.thread.isRunning);
  const lastEventAt = state.sync.lastEventAt;
  const [unknownOutcome, setUnknownOutcome] = useState(true);
  const [recoveryRequired, setRecoveryRequired] = useState(false);
  const [serverReportsBusy, setServerReportsBusy] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const staleAt = useRef<number | undefined>(undefined);
  const checkedGap = useRef(false);
  const [enqueue] = useState(createOpenCodeRecheck);
  const latestCheck = useRef<() => Promise<void>>(async () => {});
  const checkedInitialHistory = useRef(false);
  const wasRunning = useRef(false);
  const previousEventAt = useRef(lastEventAt);
  const pollTimer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(pollTimer.current), []);

  const recheck = useCallback(() => latestCheck.current(), []);
  const check = useCallback(
    () =>
      enqueue(async (current) => {
        try {
          const outcome = await readOpenCodeRecoveryOutcome(client, sessionId, current);
          if (!current() || outcome === undefined) return;
          setRecoveryRequired(false);
          if (outcome === "active") {
            const eventStreamIsQuiet =
              lastEventAt === undefined || Date.now() - lastEventAt >= 10_000;
            setServerReportsBusy(eventStreamIsQuiet);
            setUnknownOutcome(false);
            setAcknowledged(false);
            if (eventStreamIsQuiet) {
              pollTimer.current = window.setTimeout(() => void recheck(), 5_000);
            } else {
              window.clearTimeout(pollTimer.current);
            }
            return;
          }
          setServerReportsBusy(false);
          setUnknownOutcome(outcome === "unknown");
          if (outcome === "terminal") setAcknowledged(false);
        } catch {
          if (!current()) return;
          setRecoveryRequired(true);
          setUnknownOutcome(true);
          setServerReportsBusy(false);
        }
      }),
    [client, enqueue, lastEventAt, recheck, sessionId],
  );

  useLayoutEffect(() => {
    latestCheck.current = check;
  }, [check]);

  useEffect(() => {
    if (checkedInitialHistory.current) return;
    checkedInitialHistory.current = true;
    void recheck();
  }, [recheck]);

  useEffect(() => {
    if (!isRunning) {
      if (wasRunning.current) void recheck();
      wasRunning.current = false;
      staleAt.current = undefined;
      checkedGap.current = false;
      window.clearTimeout(pollTimer.current);
      previousEventAt.current = lastEventAt;
      return;
    }
    if (!wasRunning.current) {
      setServerReportsBusy(false);
      setAcknowledged(false);
    }
    wasRunning.current = true;
    if (lastEventAt !== undefined && lastEventAt !== previousEventAt.current) {
      staleAt.current = Date.now();
      checkedGap.current = false;
      window.clearTimeout(pollTimer.current);
      setServerReportsBusy(false);
      void recheck();
      previousEventAt.current = lastEventAt;
    }
    if (staleAt.current === undefined) staleAt.current = Date.now();
    const timer = window.setTimeout(() => {
      const staleSince = staleAt.current;
      if (staleSince !== undefined && Date.now() - staleSince >= 10_000 && !checkedGap.current) {
        checkedGap.current = true;
        void recheck();
      }
    }, 10_000);
    return () => window.clearTimeout(timer);
  }, [isRunning, lastEventAt, recheck]);

  return (
    <>
      {recoveryRequired ? (
        <p role="status" className="px-4 py-2 text-xs text-amber-700 dark:text-amber-300">
          Connection could not recover. Reload this page and reconnect by entering the opencode
          server password to restore this session.
        </p>
      ) : null}
      {unknownOutcome && (!acknowledged || recoveryRequired) ? (
        <div
          role="status"
          className="flex items-center gap-2 px-4 py-2 text-xs text-amber-700 dark:text-amber-300"
        >
          <span>
            Outcome unknown — terminal completion could not be confirmed. Retrying the prompt can
            repeat side effects.
          </span>
          <button type="button" className="underline" onClick={() => void recheck()}>
            Recheck status
          </button>
          <button type="button" className="underline" onClick={() => setAcknowledged(true)}>
            Acknowledge
          </button>
        </div>
      ) : null}
      {serverReportsBusy ? (
        <p role="status" className="px-4 py-2 text-xs text-muted-foreground">
          opencode event stream is quiet; server reports run active. Rechecking every 5 seconds.
        </p>
      ) : null}
    </>
  );
}
