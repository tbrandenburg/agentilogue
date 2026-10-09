import assert from "node:assert/strict";
import { it } from "node:test";
import { createPostHandler, GET } from "@/app/api/agent/route";
import type { AgentProvider } from "@/lib/agent/contracts/provider";

const startBody = JSON.stringify({
  conversationId: "conversation-1",
  input: [{ type: "text", text: "hello" }],
});
const controlBody = JSON.stringify({
  kind: "cancel",
  runId: "00000000-0000-4000-8000-000000000000",
  conversationId: "conversation-1",
});

function setup() {
  const calls = { start: 0, observe: 0, cancel: 0, respond: 0 };
  const provider = {
    id: "test",
    describe: () => ({}),
    start: async (run: { runId: string }) => {
      calls.start++;
      return { runId: run.runId };
    },
    observe: () => {
      calls.observe++;
      return (async function* () {})();
    },
    cancel: async () => {
      calls.cancel++;
      return "dispatched" as const;
    },
    respond: async () => {
      calls.respond++;
      return "dispatched" as const;
    },
  } as unknown as AgentProvider;
  return { calls, post: createPostHandler(provider) };
}

function request(
  body: string,
  headers: Record<string, string>,
  url = "http://localhost:3000/api/agent",
) {
  return new Request(url, { method: "POST", headers, body });
}

const sameOriginHeaders = {
  host: "localhost:3000",
  origin: "http://localhost:3000",
  "content-type": "application/json",
};

it("accepts a valid same-origin localhost JSON start request", async () => {
  const { calls, post } = setup();
  const response = await post(request(startBody, sameOriginHeaders));

  assert.equal(response.status, 202);
  assert.deepEqual(calls, { start: 1, observe: 0, cancel: 0, respond: 0 });
});

it("accepts the configured loopback application host", async () => {
  const { calls, post } = setup();
  const response = await post(
    request(
      startBody,
      {
        host: "127.0.0.1:3000",
        origin: "http://127.0.0.1:3000",
        "content-type": "application/json; charset=utf-8",
      },
      "http://127.0.0.1:3000/api/agent",
    ),
  );

  assert.equal(response.status, 202);
  assert.equal(calls.start, 1);
});

it("accepts same-origin browser requests that omit Origin but send a matching Referer", async () => {
  const { calls, post } = setup();
  const headers = { ...sameOriginHeaders, referer: "http://localhost:3000/" };
  delete (headers as Partial<typeof headers>).origin;
  const response = await post(request(startBody, headers));

  assert.equal(response.status, 202);
  assert.equal(calls.start, 1);
});

it("rejects foreign or missing Origin before start and control dispatch", async () => {
  for (const origin of ["https://attacker.example", undefined]) {
    const { calls, post } = setup();
    const headers = { ...sameOriginHeaders };
    if (origin === undefined) delete (headers as Partial<typeof headers>).origin;
    else headers.origin = origin;

    const start = await post(request(startBody, headers));
    const control = await post(request(controlBody, headers));

    assert.equal(start.status, 403);
    assert.equal(control.status, 403);
    assert.deepEqual(calls, { start: 0, observe: 0, cancel: 0, respond: 0 });
  }
});

it("rejects a missing Origin and Referer or a foreign Referer", async () => {
  const invalidHeaders: Record<string, string>[] = [
    { host: "localhost:3000", "content-type": "application/json" },
    {
      host: "localhost:3000",
      "content-type": "application/json",
      referer: "https://attacker.example/",
    },
  ];
  for (const headers of invalidHeaders) {
    const { calls, post } = setup();
    const response = await post(request(startBody, headers));
    assert.equal(response.status, 403);
    assert.equal(calls.start, 0);
  }
});

it("rejects unsupported content type before provider calls", async () => {
  const { calls, post } = setup();
  const response = await post(
    request(startBody, { ...sameOriginHeaders, "content-type": "text/plain" }),
  );

  assert.equal(response.status, 403);
  assert.deepEqual(calls, { start: 0, observe: 0, cancel: 0, respond: 0 });
});

it("rejects unexpected or mismatched Host before provider calls", async () => {
  for (const host of ["attacker.example", "localhost:3001"]) {
    const { calls, post } = setup();
    const response = await post(request(startBody, { ...sameOriginHeaders, host }));

    assert.equal(response.status, 403);
    assert.deepEqual(calls, { start: 0, observe: 0, cancel: 0, respond: 0 });
  }
});

it("rejects cross-origin and source-less observation GETs before provider lookup", async () => {
  const invalidHeaders: Record<string, string>[] = [
    { host: "localhost:3000", origin: "https://attacker.example" },
    { host: "localhost:3000" },
  ];
  for (const headers of invalidHeaders) {
    const response = await GET(
      new Request("http://localhost:3000/api/agent?runId=00000000-0000-4000-8000-000000000000", {
        headers,
      }),
    );
    assert.equal(response.status, 403);
  }
});
