import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { once } from "node:events";
import { createServer, type RequestListener } from "node:http";
import { it } from "node:test";
import { fileURLToPath } from "node:url";
import { createOpencodeClient } from "@opencode-ai/sdk/v2/client";
import { configureOpenCodeEvents } from "../lib/opencode-native-events";

async function fixture(handler: RequestListener) {
  const controller = new AbortController();
  const server = createServer(handler);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const client = configureOpenCodeEvents(
    createOpencodeClient({
      baseUrl: `http://127.0.0.1:${address.port}`,
    }),
  );
  return {
    client,
    signal: controller.signal,
    close: async () => {
      controller.abort();
      const stopped = new Promise<void>((done, reject) =>
        server.close((error) => (error ? reject(error) : done())),
      );
      server.closeAllConnections();
      await stopped;
    },
  };
}

it("does not resolve an SDK subscription before its first native event", async () => {
  let release = () => {};
  const requested = Promise.withResolvers<void>();
  const server = await fixture((request, response) => {
    assert.equal(request.url, "/event");
    response.writeHead(200, { "Content-Type": "text/event-stream" });
    response.flushHeaders();
    release = () =>
      response.end(
        'data: {"type":"server.connected","properties":{}}\n\ndata: {"type":"server.heartbeat","properties":{}}\n\n',
      );
    requested.resolve();
  });
  try {
    let resolved = false;
    const pending = server.client.event
      .subscribe(undefined, { signal: server.signal, sseMaxRetryAttempts: 1 })
      .then((value) => {
        resolved = true;
        return value;
      });
    await requested.promise;
    await new Promise((done) => setTimeout(done, 20));
    assert.equal(resolved, false, "HTTP headers alone must not claim a native connection");
    release();
    const subscription = await pending;
    const events = [];
    for await (const event of subscription.stream) events.push(event.type);
    assert.deepEqual(
      events,
      ["server.connected", "server.heartbeat"],
      "lookahead must preserve the first event and the remaining stream",
    );
  } finally {
    await server.close();
  }
});

it("propagates a failed SSE response instead of reporting successful subscription", async () => {
  let requests = 0;
  const server = await fixture((_request, response) => {
    requests += 1;
    response.writeHead(503).end();
  });
  try {
    await assert.rejects(
      server.client.event.subscribe(undefined, { signal: server.signal, sseMaxRetryAttempts: 1 }),
      /SSE failed: 503/,
    );
    assert.equal(requests, 1, "runtime owns reconnect attempts, not the SDK");
  } finally {
    await server.close();
  }
});

it("rejects an empty event stream rather than announcing a connection", async () => {
  let requests = 0;
  const server = await fixture((_request, response) => {
    requests += 1;
    response.writeHead(200, { "Content-Type": "text/event-stream" }).end();
  });
  try {
    await assert.rejects(
      server.client.event.subscribe(undefined, { signal: server.signal, sseMaxRetryAttempts: 1 }),
      /ended before connecting/,
    );
    assert.equal(requests, 1);
  } finally {
    await server.close();
  }
});

it("aborts while waiting for the first event without leaving the subscription pending", async () => {
  const requested = Promise.withResolvers<void>();
  const server = await fixture((_request, response) => {
    response.writeHead(200, { "Content-Type": "text/event-stream" });
    response.flushHeaders();
    requested.resolve();
  });
  const controller = new AbortController();
  try {
    const pending = server.client.event.subscribe(undefined, {
      signal: controller.signal,
      sseMaxRetryAttempts: 1,
    });
    await requested.promise;
    controller.abort();
    await assert.rejects(pending);
    assert.equal(controller.signal.aborted, true);
  } finally {
    await server.close();
  }
});

it("rejects event subscriptions without a caller-owned signal before starting HTTP", async () => {
  let requests = 0;
  const server = await fixture((_request, response) => {
    requests += 1;
    response.end('data: {"type":"server.connected","properties":{}}\n\n');
  });
  try {
    await assert.rejects(server.client.event.subscribe(), /caller-owned AbortSignal/);
    assert.equal(requests, 0, "unsupported callers must not start an eager HTTP subscription");
  } finally {
    await server.close();
  }
});

it(
  "closes HTTP subscriptions through the pinned runtime's signal lifecycle under Node",
  { timeout: 20_000 },
  () => {
    const result = spawnSync(
      "node",
      [
        "--test",
        "--test-reporter=tap",
        fileURLToPath(new URL("./native-events-runtime.mjs", import.meta.url)),
      ],
      {
        encoding: "utf8",
        env: { PATH: process.env.PATH ?? "/usr/bin:/bin", NODE_ENV: "test" },
        timeout: 15_000,
      },
    );
    assert.equal(result.status, 0, `${result.error ?? ""}\n${result.stdout}\n${result.stderr}`);
    assert.match(result.stdout, /# pass 3\b/);
    assert.match(result.stdout, /# fail 0\b/);
  },
);
