import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { withOpenCodeTitleWorkaround } from "../lib/opencode-native-title-workaround";

describe("temporary native OpenCode title workaround", () => {
  const base = "http://127.0.0.1:4096";

  it("suppresses only bodyless POST to the session compaction endpoint", async () => {
    const forwarded: Request[] = [];
    const delegate: typeof fetch = async (input, init) => {
      forwarded.push(new Request(input, init));
      return new Response("forwarded", { status: 200 });
    };
    const request = withOpenCodeTitleWorkaround(delegate);

    const invalidTitleCall = await request(
      new Request(`${base}/session/synthetic-session/summarize`, {
        method: "POST",
      }),
    );
    assert.equal(invalidTitleCall.status, 204);
    assert.equal(forwarded.length, 0);

    const realCompaction = await request(
      new Request(`${base}/session/synthetic-session/summarize`, {
        method: "POST",
        body: JSON.stringify({ providerID: "example", modelID: "test-model" }),
        headers: { "content-type": "application/json" },
      }),
    );
    assert.equal(realCompaction.status, 200);
    assert.equal(forwarded.length, 1);
    assert.equal(forwarded[0].method, "POST");
    assert.equal(await forwarded[0].text(), '{"providerID":"example","modelID":"test-model"}');
  });

  it("forwards normal SDK and event-stream requests", async () => {
    const forwarded: Request[] = [];
    const delegate: typeof fetch = async (input, init) => {
      forwarded.push(new Request(input, init));
      return new Response("forwarded", { status: 200 });
    };
    const request = withOpenCodeTitleWorkaround(delegate);

    await request(`${base}/session`);
    await request(`${base}/event`, { headers: { Authorization: "Basic test" } });
    await request(`${base}/session/synthetic-session/summarize`, { method: "GET" });

    assert.equal(forwarded.length, 3);
    assert.equal(forwarded[1].headers.get("Authorization"), "Basic test");
    assert.equal(forwarded[2].method, "GET");
  });
});
