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
