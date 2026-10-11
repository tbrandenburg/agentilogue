import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createOpenCodeRunGuard } from "../lib/opencode-native-run-guard";

const base = "http://127.0.0.1:4096";

describe("native OpenCode permission cancellation guard", () => {
  it("does not release cancellation if Stop occurs during stale-permission reconciliation", async () => {
    let release: (response: Response) => void = () => {};
    const deferred = new Promise<Response>((resolve) => {
      release = resolve;
    });
    const paths: string[] = [];
    const guard = createOpenCodeRunGuard(async (input) => {
      const path = new URL(new Request(input).url).pathname;
      paths.push(path);
      return path === "/permission" ? deferred : Response.json(true);
    });
    guard.invalidatePending();
    const prompt = guard.fetch(`${base}/session/session-a/prompt_async`, { method: "POST" });
    await guard.fetch(`${base}/session/session-a/abort`, { method: "POST" });
    release(Response.json([]));
    await assert.rejects(prompt, /cancelled during permission reconciliation/);
    assert.equal(guard.isInvalidated("delayed"), true);
    assert.deepEqual(paths, ["/permission", "/session/session-a/abort"]);
  });

  it("invalidates pending IDs before forwarding abort and rejects every late reply", async () => {
    const forwarded: Request[] = [];
    const guard = createOpenCodeRunGuard(async (request) => {
      forwarded.push(new Request(request));
      return new Response("ok", { status: 200 });
    });
    guard.trackPending(["permission-a", "permission-b"]);

    await guard.fetch(`${base}/session/session-a/abort`, { method: "POST" });
    assert.equal(forwarded[0]!.url, `${base}/session/session-a/abort`);
    for (const id of ["permission-a", "permission-b"])
      assert.throws(
        () =>
          guard.fetch(`${base}/permission/${id}/reply`, {
            method: "POST",
            body: '{"reply":"once"}',
          }),
        /cancelled and is no longer available/,
      );
    assert.equal(forwarded.length, 1);
  });

  it("keeps IDs invalid after pending state changes and allows later IDs", async () => {
    const forwarded: string[] = [];
    const guard = createOpenCodeRunGuard(async (input, init) => {
      forwarded.push(new URL(new Request(input, init).url).pathname);
      return new Response("[]", { status: 200 });
    });
    guard.trackPending(["old"]);
    guard.invalidatePending();
    await guard.fetch(`${base}/session/session-b/prompt_async`, { method: "POST" });
    guard.trackPending(["new"]);

    assert.throws(() => guard.fetch(`${base}/permission/old/reply`, { method: "POST" }));
    await guard.fetch(`${base}/permission/new/reply`, { method: "POST" });
    assert.deepEqual(forwarded, [
      "/permission",
      "/session/session-b/prompt_async",
      "/permission/new/reply",
    ]);
  });

  it("keeps guards independent between mounted native tabs and invalidates even on abort failure", async () => {
    const first = createOpenCodeRunGuard(async () => {
      throw new Error("abort transport failed");
    });
    const secondForwarded: string[] = [];
    const second = createOpenCodeRunGuard(async (input, init) => {
      secondForwarded.push(new URL(new Request(input, init).url).pathname);
      return new Response("ok", { status: 200 });
    });
    first.trackPending(["same-id"]);
    second.trackPending(["same-id"]);

    await assert.rejects(
      first.fetch(`${base}/session/session-a/abort`, { method: "POST" }),
      /abort transport failed/,
    );
    assert.equal(first.isInvalidated("same-id"), true);
    assert.equal(second.isInvalidated("same-id"), false);
    await second.fetch(`${base}/permission/same-id/reply`, { method: "POST" });
    assert.deepEqual(secondForwarded, ["/permission/same-id/reply"]);
  });

  it("notifies subscribers synchronously when pending approvals are invalidated", async () => {
    const guard = createOpenCodeRunGuard(async () => new Response("ok", { status: 200 }));
    guard.trackPending(["permission-a"]);
    let observedRevision = guard.getSnapshot();
    let notified = false;
    const unsubscribe = guard.subscribe(() => {
      notified = true;
      observedRevision = guard.getSnapshot();
    });

    const abort = guard.fetch(`${base}/session/session-a/abort`, { method: "POST" });
    assert.equal(notified, true);
    assert.equal(observedRevision, 1);
    await abort;
    unsubscribe();
  });

  it("quarantines an approval committed after Stop even when no ID was pending at abort", async () => {
    const paths: string[] = [];
    const guard = createOpenCodeRunGuard(async (input) => {
      paths.push(new Request(input).url);
      return new Response("true");
    });
    const commit = () => guard.trackPending(["delayed"]);
    await guard.fetch(`${base}/session/session-a/abort`, { method: "POST" });
    commit();
    assert.equal(guard.isInvalidated("delayed"), true);
    assert.throws(() => guard.fetch(`${base}/permission/delayed/reply`, { method: "POST" }));
    assert.equal(paths.length, 1);
  });

  it("preserves cancellation on remount and quarantines a stale server request before a new run", async () => {
    let saved: string | null = null;
    const storage = {
      load: () => saved,
      save: (value: string) => {
        saved = value;
      },
    };
    const replies: string[] = [];
    const delegate: typeof fetch = async (input) => {
      const path = new URL(new Request(input).url).pathname;
      replies.push(path);
      return Response.json(
        path === "/permission" ? [{ id: "stale-server", sessionID: "session-a" }] : true,
      );
    };
    const first = createOpenCodeRunGuard(delegate, storage);
    first.trackPending(["old"]);
    await first.fetch(`${base}/session/session-a/abort`, { method: "POST" });
    const restored = createOpenCodeRunGuard(delegate, storage);
    assert.throws(() => restored.fetch(`${base}/permission/old/reply`, { method: "POST" }));
    assert.throws(() =>
      restored.fetch(`${base}/permission/stale-server/reply`, { method: "POST" }),
    );
    await restored.fetch(`${base}/session/session-a/prompt_async`, { method: "POST" });
    restored.trackPending(["old", "stale-server", "new"]);
    assert.equal(restored.isInvalidated("stale-server"), true);
    await restored.fetch(`${base}/permission/new/reply`, { method: "POST" });
    assert.deepEqual(replies, [
      "/session/session-a/abort",
      "/permission",
      "/session/session-a/prompt_async",
      "/permission/new/reply",
    ]);
  });
});
