import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AssistantTransportEncoder } from "assistant-stream";
import { hasTerminalProjection, observeOpenCodeRun } from "./opencode-observer";

async function snapshotResponse(runId: string): Promise<Response> {
  const encoder = new AssistantTransportEncoder();
  const writer = encoder.writable.getWriter();
  await writer.write({
    type: "update-state",
    path: [],
    operations: [
      {
        type: "set",
        path: [],
        value: {
          type: "snapshot",
          snapshot: {
            runId,
            conversationId: "conversation",
            lastSequence: 0,
            phase: "running",
            messages: [],
            tools: [],
            parts: [],
            pendingPermissions: [],
          },
        },
      },
    ],
  });
  await writer.write({
    type: "update-state",
    path: [],
    operations: [
      {
        type: "set",
        path: [],
        value: {
          type: "snapshot",
          snapshot: {
            runId,
            conversationId: "conversation",
            lastSequence: 0,
            phase: "finished",
            outcome: { kind: "success" },
            messages: [],
            tools: [],
            parts: [],
            pendingPermissions: [],
          },
        },
      },
    ],
  });
  await writer.close();
  return new Response(encoder.readable, { headers: Object.fromEntries(encoder.headers) });
}

describe("OpenCode observer reconnect", () => {
  it("stops automatic retries for permanent HTTP errors", async () => {
    for (const status of [403, 404]) {
      let requests = 0;
      const states: string[] = [];
      await observeOpenCodeRun(
        "run",
        () => {},
        (state) => states.push(state),
        async () => {
          requests += 1;
          return new Response(null, { status });
        },
        async () => assert.fail("permanent error must not retry"),
      );
      assert.equal(requests, 1);
      assert.deepEqual(states, ["disconnected"]);
    }
  });

  it("reconnects after a transient error and consumes a fresh snapshot for the same run", async () => {
    let requests = 0;
    const urls: string[] = [];
    const observations: unknown[] = [];
    await observeOpenCodeRun(
      "00000000-0000-4000-8000-000000000001",
      (observation) => observations.push(observation),
      () => {},
      async (input) => {
        urls.push(String(input));
        requests += 1;
        return requests === 1
          ? new Response(null, { status: 503 })
          : await snapshotResponse("00000000-0000-4000-8000-000000000001");
      },
      async () => {},
    );
    assert.equal(requests, 2);
    assert.deepEqual(urls, [
      "/api/agent?runId=00000000-0000-4000-8000-000000000001",
      "/api/agent?runId=00000000-0000-4000-8000-000000000001",
    ]);
    assert.equal(observations.length, 2);
    assert.deepEqual(observations[0], {
      type: "snapshot",
      snapshot: {
        runId: "00000000-0000-4000-8000-000000000001",
        conversationId: "conversation",
        lastSequence: 0,
        phase: "running",
        messages: [],
        tools: [],
        parts: [],
        pendingPermissions: [],
      },
    });
  });

  it("stops after bounded transient retries", async () => {
    let requests = 0;
    const states: string[] = [];
    await observeOpenCodeRun(
      "run",
      () => {},
      (state) => states.push(state),
      async () => {
        requests += 1;
        return new Response(null, { status: 503 });
      },
      async () => {},
    );
    assert.equal(requests, 6);
    assert.equal(states.at(-1), "disconnected");
  });

  it("does not treat an absent projection as terminal", () => {
    assert.equal(hasTerminalProjection(null, "run-message"), false);
    assert.equal(
      hasTerminalProjection(
        { messageId: "run-message", snapshot: { phase: "running" } },
        "run-message",
      ),
      false,
    );
    assert.equal(
      hasTerminalProjection(
        { messageId: "run-message", snapshot: { phase: "unknown" } },
        "run-message",
      ),
      true,
    );
  });
});
