import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createOpenCodeRunGuard } from "../lib/opencode-native-run-guard";

const base = "http://127.0.0.1:4096";

describe("native OpenCode permission cancellation guard", () => {
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
      return new Response("ok", { status: 200 });
    });
    guard.trackPending(["old"]);
    guard.invalidatePending();
    guard.trackPending(["new"]);

    assert.throws(() => guard.fetch(`${base}/permission/old/reply`, { method: "POST" }));
    await guard.fetch(`${base}/permission/new/reply`, { method: "POST" });
    await guard.fetch(`${base}/session/session-b/prompt_async`, { method: "POST" });
    assert.deepEqual(forwarded, ["/permission/new/reply", "/session/session-b/prompt_async"]);
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
});
