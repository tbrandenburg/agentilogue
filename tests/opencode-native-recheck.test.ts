import assert from "node:assert/strict";
import { it } from "node:test";
import { createOpenCodeRecheck } from "../lib/opencode-native-recheck";

it("coalesces in-flight checks and runs the latest terminal recheck without applying stale results", async () => {
  const enqueue = createOpenCodeRecheck();
  const results: string[] = [];
  let release: () => void = () => {};
  const deferred = new Promise<void>((resolve) => {
    release = resolve;
  });
  const first = enqueue(async (current) => {
    await deferred;
    if (current()) results.push("busy");
  });
  await Promise.resolve();
  const skipped = enqueue(async () => {
    results.push("intermediate");
  });
  const last = enqueue(async (current) => {
    if (current()) results.push("terminal");
  });
  release();
  await Promise.all([first, skipped, last]);
  assert.deepEqual(results, ["terminal"]);
  await enqueue(async () => {
    results.push("later");
  });
  assert.deepEqual(results, ["terminal", "later"]);
});

it("runs a terminal recheck enqueued at the worker completion boundary", async () => {
  const enqueue = createOpenCodeRecheck();
  const results: string[] = [];
  const first = enqueue(async () => {
    results.push("first");
  });
  const terminal = new Promise<void>((resolve, reject) => {
    queueMicrotask(() => {
      enqueue(async () => {
        results.push("terminal");
      }).then(resolve, reject);
    });
  });
  await Promise.all([first, terminal]);
  assert.deepEqual(results, ["first", "terminal"]);
});

it("propagates a check failure and permits a subsequent recheck", async () => {
  const enqueue = createOpenCodeRecheck();
  const failure = new Error("status transport failed");
  await assert.rejects(
    enqueue(() => {
      throw failure;
    }),
    (error) => error === failure,
  );
  let checked = false;
  await enqueue(async () => {
    checked = true;
  });
  assert.equal(checked, true);
});
