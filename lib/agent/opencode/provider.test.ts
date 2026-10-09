import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { OpenCodeProvider } from "./provider";
import { RunIdSchema, ConversationIdSchema } from "../contracts/identifiers";

describe("OpenCodeProvider admission and observation", () => {
  it("supports conversation continuation only in the current server process", () => {
    const provider = new OpenCodeProvider({ cwd: "/tmp", executable: "/bin/false" });
    assert.equal(provider.describe().session.continuation, true);
    assert.equal(provider.describe().session.coldReattach, false);
  });

  it("does not admit unsafe overrides or duplicate run IDs", async () => {
    const provider = new OpenCodeProvider({ cwd: "/tmp", executable: "/bin/false" });
    const runId = RunIdSchema.parse("00000000-0000-4000-8000-000000000001");
    const request = {
      runId,
      conversationId: ConversationIdSchema.parse("conversation-a"),
      input: [{ type: "text" as const, text: "hello" }],
    };
    await assert.rejects(
      provider.start({ ...request, model: "unproven" }),
      /overrides are disabled/,
    );
    await provider.start(request);
    await assert.rejects(provider.start(request), /already exists/);
  });

  it("keeps two conversations distinct and observes child loss as unknown", async () => {
    const provider = new OpenCodeProvider({ cwd: "/tmp", executable: "/bin/false" });
    const runs = [
      {
        runId: RunIdSchema.parse("00000000-0000-4000-8000-000000000002"),
        conversationId: ConversationIdSchema.parse("conversation-b"),
      },
      {
        runId: RunIdSchema.parse("00000000-0000-4000-8000-000000000003"),
        conversationId: ConversationIdSchema.parse("conversation-c"),
      },
    ];
    for (const run of runs)
      await provider.start({ ...run, input: [{ type: "text", text: "hello" }] });

    for (const run of runs) {
      const iterator = provider.observe(run.runId)[Symbol.asyncIterator]();
      const initial = await iterator.next();
      assert.equal(initial.value?.type, "snapshot");
      if (initial.value?.type === "snapshot") {
        assert.equal(initial.value.snapshot.conversationId, run.conversationId);
        if (initial.value.snapshot.phase === "unknown") {
          assert.equal(initial.value.snapshot.outcome.kind, "unknown");
          continue;
        }
      }
      const terminal = await iterator.next();
      assert.equal(terminal.value?.type, "event");
      if (terminal.value?.type === "event" && terminal.value.event.type === "run.finished")
        assert.equal(terminal.value.event.outcome.kind, "unknown");
    }
  });
});
