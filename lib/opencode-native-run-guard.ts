const PERMISSION_REPLY_PATH = /^\/permission\/([^/]+)\/reply$/;
const SESSION_ABORT_PATH = /^\/session\/[^/]+\/abort$/;
const SESSION_PROMPT_PATH = /^\/session\/([^/]+)\/prompt_async$/;

type GuardState = { cancelled: boolean; invalidated: string[] };
type GuardStorage = { load: () => string | null; save: (value: string) => void };

export type OpenCodeRunGuard = {
  readonly trackPending: (ids: Iterable<string>) => void;
  readonly invalidatePending: () => void;
  readonly isInvalidated: (id: string) => boolean;
  readonly subscribe: (listener: () => void) => () => void;
  readonly getSnapshot: () => number;
  readonly fetch: typeof fetch;
};

export function createOpenCodeRunGuard(
  delegate: typeof fetch,
  storage?: GuardStorage,
): OpenCodeRunGuard {
  const pending = new Set<string>();
  const invalidated = new Set<string>();
  const listeners = new Set<() => void>();
  let revision = 0;
  let cancelled = false;
  if (storage) {
    const raw = storage.load();
    if (raw) {
      const state: unknown = JSON.parse(raw);
      if (
        typeof state !== "object" ||
        state === null ||
        !("cancelled" in state) ||
        typeof state.cancelled !== "boolean" ||
        !("invalidated" in state) ||
        !Array.isArray(state.invalidated) ||
        !state.invalidated.every((id: unknown) => typeof id === "string")
      )
        throw new Error("Invalid OpenCode cancellation state");
      cancelled = state.cancelled;
      for (const id of state.invalidated) invalidated.add(id);
    }
  }

  const persist = (cancellation = cancelled) => {
    const state: GuardState = { cancelled: cancellation, invalidated: [...invalidated] };
    storage?.save(JSON.stringify(state));
  };

  const notify = () => {
    revision += 1;
    for (const listener of listeners) listener();
  };
  const invalidate = () => {
    cancelled = true;
    for (const id of pending) invalidated.add(id);
    pending.clear();
    notify();
    persist();
  };

  return {
    trackPending(ids) {
      pending.clear();
      let changed = false;
      for (const id of ids) {
        if (cancelled && !invalidated.has(id)) {
          invalidated.add(id);
          changed = true;
        }
        if (!invalidated.has(id)) pending.add(id);
      }
      if (changed) {
        notify();
        persist();
      }
    },
    invalidatePending: invalidate,
    isInvalidated: (id) => cancelled || invalidated.has(id),
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot: () => revision,
    fetch(input, init) {
      const request =
        input instanceof Request && init === undefined ? input : new Request(input, init);
      const { pathname } = new URL(request.url);
      const reply = request.method === "POST" ? PERMISSION_REPLY_PATH.exec(pathname) : null;
      if (reply && (cancelled || invalidated.has(decodeURIComponent(reply[1]!)))) {
        throw new Error("This OpenCode permission was cancelled and is no longer available.");
      }
      (request as Request & { timeout?: boolean }).timeout = false;
      if (request.method === "POST" && SESSION_ABORT_PATH.test(pathname)) {
        // Latch cancellation before forwarding, even if React has not committed the approval.
        try {
          invalidate();
        } catch (storageError) {
          return (async () => {
            try {
              await delegate(request);
            } catch (abortError) {
              throw new AggregateError(
                [storageError, abortError],
                "OpenCode cancellation persistence and abort both failed",
              );
            }
            throw storageError;
          })();
        }
      }
      const prompt = request.method === "POST" ? SESSION_PROMPT_PATH.exec(pathname) : null;
      if (prompt && cancelled) {
        const cancellation = revision;
        return (async () => {
          // Quarantine stale server requests before admitting a new run.
          const url = new URL("/permission", request.url);
          const response = await delegate(
            new Request(url, {
              headers: request.headers,
              signal: AbortSignal.timeout(5_000),
            }),
          );
          if (!response.ok) throw new Error("Could not reconcile cancelled OpenCode permissions");
          const entries: unknown = await response.json();
          if (!Array.isArray(entries)) throw new Error("Invalid OpenCode permission response");
          for (const entry of entries) {
            if (
              typeof entry !== "object" ||
              entry === null ||
              !("sessionID" in entry) ||
              typeof entry.sessionID !== "string" ||
              !("id" in entry) ||
              typeof entry.id !== "string"
            ) {
              throw new Error("Invalid OpenCode permission response");
            }
            if (entry.sessionID === decodeURIComponent(prompt[1]!)) invalidated.add(entry.id);
          }
          if (revision !== cancellation) {
            persist();
            throw new Error("OpenCode prompt was cancelled during permission reconciliation");
          }
          persist(false);
          cancelled = false;
          notify();
          return delegate(request);
        })();
      }
      return delegate(request);
    },
  };
}
