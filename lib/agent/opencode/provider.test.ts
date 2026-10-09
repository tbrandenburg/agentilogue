import assert from "node:assert/strict";
import { describe, it } from "node:test";
import * as acp from "@agentclientprotocol/sdk";
import type { OpenCodeAcpCallbacks } from "./acp-client";
import { OpenCodeProvider } from "./provider";
import { RunIdSchema, ConversationIdSchema } from "../contracts/identifiers";

describe("OpenCodeProvider admission and observation", () => {
  const makeRequest = (runId: string, conversationId: string) => ({
    runId: RunIdSchema.parse(runId),
    conversationId: ConversationIdSchema.parse(conversationId),
    input: [{ type: "text" as const, text: "hello" }],
  });

  it("accepts cancellation before session binding and cancels once when binding arrives", async () => {
    let callbacks!: OpenCodeAcpCallbacks;
    let complete!: (reason: "cancelled") => void;
    let cancelCalls = 0;
    const provider = new OpenCodeProvider({
      cwd: "/tmp",
      runPrompt: async (_config, _prompt, provided) => {
        callbacks = provided;
        return await new Promise((resolve) => {
          complete = resolve;
        });
      },
    });
    const request = makeRequest("00000000-0000-4000-8000-000000000010", "cancel-before-bind");
    await provider.start(request);
    assert.equal(await provider.cancel(request.runId), "dispatched");
    const denied = await callbacks.onPermission({
      toolCall: { toolCallId: "tool-1", title: "Write" },
      options: [{ optionId: "allow", name: "Allow", kind: "allow_once" }],
    } as never);
    assert.deepEqual(denied.outcome, { outcome: "cancelled" });
    callbacks.onSession("session-1", async () => {
      cancelCalls += 1;
    });
    callbacks.onSession("session-1", async () => {
      cancelCalls += 1;
    });
    await provider.cancel(request.runId);
    assert.equal(cancelCalls, 1);
    complete("cancelled");
    for await (const _observation of provider.observe(request.runId)) {
      /* drain */
    }
    assert.equal(await provider.cancel(request.runId), "already-ended");
  });

  it("settles a pending permission once when cancel races with a response", async () => {
    let callbacks!: OpenCodeAcpCallbacks;
    let finishPrompt!: (reason: "cancelled") => void;
    const provider = new OpenCodeProvider({
      cwd: "/tmp",
      runPrompt: async (_config, _prompt, provided) => {
        callbacks = provided;
        return await new Promise((resolve) => {
          finishPrompt = resolve;
        });
      },
    });
    const request = makeRequest("00000000-0000-4000-8000-000000000011", "permission-cancel-race");
    await provider.start(request);
    callbacks.onSession("session-2", async () => undefined);
    const permissionPromise = callbacks.onPermission({
      toolCall: { toolCallId: "tool-2", title: "Write" },
      options: [{ optionId: "allow", name: "Allow", kind: "allow_once" }],
    } as never);
    const observation = provider.observe(request.runId)[Symbol.asyncIterator]();
    const first = await observation.next();
    assert.equal(first.value?.type, "snapshot");
    assert.equal(first.value?.type === "snapshot" && first.value.snapshot.phase, "running");
    const permissionId =
      first.value?.type === "snapshot" && first.value.snapshot.phase === "running"
        ? first.value.snapshot.pendingPermissions[0]?.id
        : undefined;
    assert.ok(permissionId);
    const [cancelReceipt] = await Promise.all([
      provider.cancel(request.runId),
      provider.respond(request.runId, { permissionId, optionId: "allow" }).then(
        () => "unexpected",
        () => "stale",
      ),
    ]);
    assert.equal(cancelReceipt, "dispatched");
    assert.equal((await permissionPromise).outcome.outcome, "cancelled");
    finishPrompt("cancelled");
    await observation.return?.();
  });

  it("allows an approval accepted before cancellation", async () => {
    let callbacks!: OpenCodeAcpCallbacks;
    let finishPrompt!: (reason: "cancelled") => void;
    let cancelCalls = 0;
    const provider = new OpenCodeProvider({
      cwd: "/tmp",
      runPrompt: async (_config, _prompt, provided) => {
        callbacks = provided;
        return await new Promise((resolve) => {
          finishPrompt = resolve;
        });
      },
    });
    const request = makeRequest("00000000-0000-4000-8000-000000000014", "approval-before-cancel");
    await provider.start(request);
    callbacks.onSession("session-approval-first", async () => {
      cancelCalls += 1;
    });
    const permissionPromise = callbacks.onPermission({
      toolCall: { toolCallId: "tool-approval-first", title: "Write" },
      options: [{ optionId: "allow", name: "Allow", kind: "allow_once" }],
    } as never);
    const snapshot = await provider.observe(request.runId)[Symbol.asyncIterator]().next();
    assert.equal(snapshot.value?.type, "snapshot");
    const permissionId =
      snapshot.value?.type === "snapshot"
        ? snapshot.value.snapshot.pendingPermissions[0]?.id
        : null;
    assert.ok(permissionId);
    await provider.respond(request.runId, { permissionId, optionId: "allow" });
    assert.deepEqual((await permissionPromise).outcome, { outcome: "selected", optionId: "allow" });
    assert.equal(await provider.cancel(request.runId), "dispatched");
    assert.equal(cancelCalls, 1);
    finishPrompt("cancelled");
  });

  it("settles duplicate approvals once and dispatches repeated cancellation once", async () => {
    let callbacks!: OpenCodeAcpCallbacks;
    let finishPrompt!: (reason: "cancelled") => void;
    let cancelCalls = 0;
    const provider = new OpenCodeProvider({
      cwd: "/tmp",
      runPrompt: async (_config, _prompt, provided) => {
        callbacks = provided;
        return await new Promise((resolve) => {
          finishPrompt = resolve;
        });
      },
    });
    const request = makeRequest("00000000-0000-4000-8000-000000000015", "duplicate-controls");
    await provider.start(request);
    callbacks.onSession("session-duplicate-controls", async () => {
      cancelCalls += 1;
    });
    const permissionPromise = callbacks.onPermission({
      toolCall: { toolCallId: "tool-duplicate", title: "Write" },
      options: [{ optionId: "allow", name: "Allow", kind: "allow_once" }],
    } as never);
    const firstSnapshot = await provider.observe(request.runId)[Symbol.asyncIterator]().next();
    const permissionId =
      firstSnapshot.value?.type === "snapshot"
        ? firstSnapshot.value.snapshot.pendingPermissions[0]?.id
        : undefined;
    assert.ok(permissionId);
    const decisions = await Promise.allSettled([
      provider.respond(request.runId, { permissionId, optionId: "allow" }),
      provider.respond(request.runId, { permissionId, optionId: "allow" }),
    ]);
    assert.equal(decisions.filter((decision) => decision.status === "fulfilled").length, 1);
    assert.equal((await permissionPromise).outcome.outcome, "selected");
    assert.deepEqual(
      await Promise.all([provider.cancel(request.runId), provider.cancel(request.runId)]),
      ["dispatched", "dispatched"],
    );
    assert.equal(cancelCalls, 1);
    finishPrompt("cancelled");
  });

  it("returns already-ended for terminal runs and errors for unknown IDs", async () => {
    const provider = new OpenCodeProvider({ cwd: "/tmp", executable: "/bin/false" });
    const request = makeRequest("00000000-0000-4000-8000-000000000012", "terminal-cancel");
    await provider.start(request);
    for await (const _observation of provider.observe(request.runId)) {
      /* drain */
    }
    assert.equal(await provider.cancel(request.runId), "already-ended");
    await assert.rejects(
      provider.cancel(RunIdSchema.parse("00000000-0000-4000-8000-000000000099")),
      /Unknown run/,
    );
  });

  it("keeps the run outcome unknown when native cancellation fails", async () => {
    let finishPrompt!: (reason: "end_turn") => void;
    const provider = new OpenCodeProvider({
      cwd: "/tmp",
      runPrompt: async (_config, _prompt, callbacks) => {
        callbacks.onSession("session-cancel-failure", async () => {
          throw new Error("native cancel failed");
        });
        return await new Promise((resolve) => {
          finishPrompt = resolve;
        });
      },
    });
    const request = makeRequest("00000000-0000-4000-8000-000000000013", "cancel-failure");
    await provider.start(request);
    await assert.rejects(provider.cancel(request.runId), /native cancel failed/);
    finishPrompt("end_turn");
    const observations = [];
    for await (const observation of provider.observe(request.runId)) observations.push(observation);
    const terminal = observations.at(-1);
    assert.equal(terminal?.type, "event");
    assert.equal(
      terminal?.type === "event" && terminal.event.type === "run.finished"
        ? terminal.event.outcome.kind
        : undefined,
      "unknown",
    );
  });

  it("settles pending permission requests when the ACP child is lost", async () => {
    let permissionPromise!: ReturnType<OpenCodeAcpCallbacks["onPermission"]>;
    const provider = new OpenCodeProvider({
      cwd: "/tmp",
      runPrompt: async (_config, _prompt, callbacks) => {
        permissionPromise = callbacks.onPermission({
          toolCall: { toolCallId: "tool-child-loss", title: "Write" },
          options: [{ optionId: "allow", name: "Allow", kind: "allow_once" }],
        } as never);
        throw new Error("ACP child exited");
      },
    });
    const request = makeRequest("00000000-0000-4000-8000-000000000016", "permission-child-loss");
    await provider.start(request);
    assert.deepEqual((await permissionPromise).outcome, { outcome: "cancelled" });
    const final = await provider.observe(request.runId)[Symbol.asyncIterator]().next();
    assert.equal(final.value?.type, "snapshot");
    assert.equal(final.value?.type === "snapshot" && final.value.snapshot.phase, "unknown");
    assert.deepEqual(
      final.value?.type === "snapshot" ? final.value.snapshot.pendingPermissions : null,
      [],
    );
  });

  it("maps every ACP stop reason to its truthful run outcome", async () => {
    const cases = [
      ["end_turn", { kind: "success" }],
      ["cancelled", { kind: "cancelled" }],
      ["max_tokens", { kind: "stopped", reason: "max_tokens" }],
      ["max_turn_requests", { kind: "stopped", reason: "max_turn_requests" }],
      ["refusal", { kind: "stopped", reason: "refusal" }],
    ] as const;
    for (const [index, [reason, outcome]] of cases.entries()) {
      const provider = new OpenCodeProvider({ cwd: "/tmp", runPrompt: async () => reason });
      const request = makeRequest(
        `00000000-0000-4000-8000-${String(index + 20).padStart(12, "0")}`,
        `stop-reason-${reason}`,
      );
      await provider.start(request);
      for await (const _observation of provider.observe(request.runId)) {
        /* drain */
      }
      const finalSnapshot = await provider.observe(request.runId)[Symbol.asyncIterator]().next();
      assert.equal(finalSnapshot.value?.type, "snapshot");
      assert.deepEqual(
        finalSnapshot.value?.type === "snapshot" && finalSnapshot.value.snapshot.phase !== "running"
          ? finalSnapshot.value.snapshot.outcome
          : undefined,
        outcome,
      );
      assert.equal(await provider.cancel(request.runId), "already-ended");
    }
  });

  it("returns already-ended for failed terminal runs", async () => {
    const provider = new OpenCodeProvider({
      cwd: "/tmp",
      runPrompt: async () => {
        throw new acp.RequestError(-32000, "native prompt failed");
      },
    });
    const request = makeRequest("00000000-0000-4000-8000-000000000033", "failed-terminal");
    await provider.start(request);
    const terminal = await provider.observe(request.runId)[Symbol.asyncIterator]().next();
    assert.equal(terminal.value?.type, "snapshot");
    assert.equal(
      terminal.value?.type === "snapshot" && terminal.value.snapshot.phase === "finished"
        ? terminal.value.snapshot.outcome.kind
        : undefined,
      "failed",
    );
    assert.equal(await provider.cancel(request.runId), "already-ended");
  });

  it("expires known completed runs after 30 minutes", async () => {
    let now = 1_000;
    const provider = new OpenCodeProvider({
      cwd: "/tmp",
      now: () => now,
      runPrompt: async () => "end_turn",
    });
    const request = makeRequest("00000000-0000-4000-8000-000000000040", "expiry-known");
    await provider.start(request);
    assert.equal(
      (await provider.observe(request.runId)[Symbol.asyncIterator]().next()).value?.type,
      "snapshot",
    );
    now += 30 * 60 * 1000;
    await assert.rejects(
      provider.observe(request.runId)[Symbol.asyncIterator]().next(),
      /Unknown run/,
    );
  });

  it("retains active runs and their conversation lease beyond the retention period", async () => {
    let now = 1_000;
    let finish!: (reason: "end_turn") => void;
    const provider = new OpenCodeProvider({
      cwd: "/tmp",
      now: () => now,
      runPrompt: async () => await new Promise((resolve) => (finish = resolve)),
    });
    const request = makeRequest("00000000-0000-4000-8000-000000000041", "expiry-active");
    await provider.start(request);
    now += 60 * 60 * 1000;
    assert.equal(
      (await provider.observe(request.runId)[Symbol.asyncIterator]().next()).value?.type,
      "snapshot",
    );
    await assert.rejects(
      provider.start(makeRequest("00000000-0000-4000-8000-000000000042", "expiry-active")),
      /active or unknown/,
    );
    finish("end_turn");
  });

  it("retains unknown outcomes and never releases their conversation lease", async () => {
    let now = 1_000;
    const provider = new OpenCodeProvider({
      cwd: "/tmp",
      now: () => now,
      runPrompt: async () => {
        throw new Error("child lost");
      },
    });
    const request = makeRequest("00000000-0000-4000-8000-000000000043", "expiry-unknown");
    await provider.start(request);
    const first = await provider.observe(request.runId)[Symbol.asyncIterator]().next();
    assert.equal(first.value?.type === "snapshot" && first.value.snapshot.phase, "unknown");
    now += 60 * 60 * 1000;
    assert.equal(
      (await provider.observe(request.runId)[Symbol.asyncIterator]().next()).value?.type,
      "snapshot",
    );
    await assert.rejects(
      provider.start(makeRequest("00000000-0000-4000-8000-000000000044", "expiry-unknown")),
      /active or unknown/,
    );
  });

  it("keeps the already-ended receipt available until its retention deadline", async () => {
    let now = 1_000;
    const provider = new OpenCodeProvider({
      cwd: "/tmp",
      now: () => now,
      runPrompt: async () => "end_turn",
    });
    const request = makeRequest("00000000-0000-4000-8000-000000000045", "receipt-before-expiry");
    await provider.start(request);
    for await (const _observation of provider.observe(request.runId)) {
      /* drain */
    }
    now += 30 * 60 * 1000 - 1;
    assert.equal(await provider.cancel(request.runId), "already-ended");
  });

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
