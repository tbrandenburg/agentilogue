import assert from "node:assert/strict";
import { it } from "node:test";
import { createOpencodeClient } from "@opencode-ai/sdk/v2/client";
import { readOpenCodeRecoveryOutcome } from "../lib/opencode-native-recheck";

const current = () => true;
const client = (fetcher: typeof fetch) =>
  createOpencodeClient({ baseUrl: "http://127.0.0.1:14372", fetch: fetcher });

it("rejects status and history HTTP failures without treating missing evidence as completion", async () => {
  for (const failedPath of ["/session/status", "/session/session/message"]) {
    const requests: string[] = [];
    const sdk = client(async (request) => {
      const path = new URL((request as Request).url).pathname;
      requests.push(path);
      return path === failedPath
        ? Response.json({ error: "unavailable" }, { status: 503 })
        : Response.json({});
    });
    await assert.rejects(readOpenCodeRecoveryOutcome(sdk, "session", current), /recheck failed/);
    assert.deepEqual(
      requests,
      failedPath === "/session/status"
        ? ["/session/status"]
        : ["/session/status", "/session/session/message"],
    );
  }
});

it("propagates transport failure and bounds a stalled status or history request", async () => {
  await assert.rejects(
    readOpenCodeRecoveryOutcome(
      client(async () => {
        throw new Error("connection refused");
      }),
      "session",
      current,
    ),
    /status recheck failed/,
  );
  for (const stalledPath of ["/session/status", "/session/session/message"]) {
    const sdk = client(async (request) => {
      const input = request as Request;
      if (new URL(input.url).pathname !== stalledPath) return Response.json({});
      return new Promise<Response>((_resolve, reject) => {
        input.signal.addEventListener("abort", () => reject(input.signal.reason), { once: true });
      });
    });
    await assert.rejects(
      readOpenCodeRecoveryOutcome(sdk, "session", current, 20),
      /recheck failed/,
    );
  }
});

it("successful history retains unknown for an interrupted turn and accepts terminal evidence", async () => {
  for (const finish of [undefined, "tool-calls", "stop"]) {
    const sdk = client(async (request) =>
      new URL((request as Request).url).pathname === "/session/status"
        ? Response.json({})
        : Response.json([
            { info: { role: "user" } },
            { info: { role: "assistant", finish, time: { created: 1 } } },
          ]),
    );
    assert.equal(
      await readOpenCodeRecoveryOutcome(sdk, "session", current),
      finish === "stop" ? "terminal" : "unknown",
    );
  }
});

it("busy status avoids history and superseded checks do not fetch history", async () => {
  let requests = 0;
  const sdk = client(async () => {
    requests += 1;
    return Response.json({ session: { type: "busy" } });
  });
  assert.equal(await readOpenCodeRecoveryOutcome(sdk, "session", current), "active");
  assert.equal(await readOpenCodeRecoveryOutcome(sdk, "session", () => false), undefined);
  assert.equal(requests, 2);
});
