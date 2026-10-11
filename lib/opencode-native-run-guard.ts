const PERMISSION_REPLY_PATH = /^\/permission\/([^/]+)\/reply$/;
const SESSION_ABORT_PATH = /^\/session\/[^/]+\/abort$/;

export type OpenCodeRunGuard = {
  readonly trackPending: (ids: Iterable<string>) => void;
  readonly invalidatePending: () => void;
  readonly isInvalidated: (id: string) => boolean;
  readonly subscribe: (listener: () => void) => () => void;
  readonly getSnapshot: () => number;
  readonly fetch: typeof fetch;
};

export function createOpenCodeRunGuard(delegate: typeof fetch): OpenCodeRunGuard {
  const pending = new Set<string>();
  const invalidated = new Set<string>();
  const listeners = new Set<() => void>();
  let revision = 0;

  const notify = () => {
    revision += 1;
    for (const listener of listeners) listener();
  };

  return {
    trackPending(ids) {
      pending.clear();
      for (const id of ids) if (!invalidated.has(id)) pending.add(id);
    },
    invalidatePending() {
      if (pending.size === 0) return;
      for (const id of pending) invalidated.add(id);
      pending.clear();
      notify();
    },
    isInvalidated: (id) => invalidated.has(id),
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
      if (reply && invalidated.has(decodeURIComponent(reply[1]!))) {
        throw new Error("This OpenCode permission was cancelled and is no longer available.");
      }
      if (request.method === "POST" && SESSION_ABORT_PATH.test(pathname)) {
        // Do this before the delegate sees the abort request, including failed aborts.
        for (const id of pending) invalidated.add(id);
        if (pending.size > 0) {
          pending.clear();
          notify();
        }
      }
      (request as Request & { timeout?: boolean }).timeout = false;
      return delegate(request);
    },
  };
}
