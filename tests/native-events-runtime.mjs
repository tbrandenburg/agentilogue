import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import { it } from "node:test";
import { createOpencodeClient } from "@opencode-ai/sdk/v2/client";
import { configureOpenCodeEvents } from "../lib/opencode-native-events.ts";

// Exercise the installed compiled runtime, not a copy of its cancellation logic.
const { OpenCodeEventSource } = await import(
  new URL("./OpenCodeEventSource.js", import.meta.resolve("@assistant-ui/react-opencode"))
);

for (const phase of [
  "first-event disconnect",
  "reconnected dispose",
  "before-first-event dispose",
]) {
  it(`pinned runtime closes HTTP on ${phase}`, { timeout: 5_000 }, async (context) => {
    const requested = Promise.withResolvers();
    const disconnected = Promise.withResolvers();
    context.signal.addEventListener("abort", () => disconnected.reject(context.signal.reason), {
      once: true,
    });
    const expected = phase === "reconnected dispose" ? 2 : 1;
    let requests = 0;
    let closed = 0;
    const events = [];
    const server = createServer((_request, response) => {
      requests += 1;
      response.on("close", () => {
        closed += 1;
        if (closed === expected) disconnected.resolve();
      });
      response.writeHead(200, { "Content-Type": "text/event-stream" });
      response.flushHeaders();
      if (phase !== "before-first-event dispose") {
        response.write('data: {"type":"server.connected","properties":{}}\n\n');
      }
      if (phase === "reconnected dispose" && requests === 1) response.end();
      requested.resolve();
    });
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const source = new OpenCodeEventSource(
      configureOpenCodeEvents(
        createOpencodeClient({ baseUrl: `http://127.0.0.1:${address.port}` }),
      ),
    );
    try {
      const unsubscribe = source.subscribe((event) => {
        events.push(event.type);
        if (phase === "first-event disconnect") unsubscribe();
        if (phase === "reconnected dispose" && event.type === "stream.reconnected")
          source.dispose();
      });
      if (phase === "before-first-event dispose") {
        await Promise.race([requested.promise, disconnected.promise]);
        source.dispose();
      }
      // Observe peer closure before forced fixture cleanup can hide a leaked body.
      await disconnected.promise;
      assert.equal(requests, expected);
      assert.equal(closed, expected);
      assert.deepEqual(
        events,
        phase === "before-first-event dispose"
          ? []
          : phase === "reconnected dispose"
            ? ["server.connected", "stream.reconnected"]
            : ["server.connected"],
      );
    } finally {
      source.dispose();
      const stopped = new Promise((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
      server.closeAllConnections();
      await stopped;
    }
  });
}
