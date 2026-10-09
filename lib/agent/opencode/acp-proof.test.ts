import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import type { SessionUpdate } from "@agentclientprotocol/sdk";
import { toAcpProofUpdate } from "./acp-proof";

const textFixture = JSON.parse(
  readFileSync(new URL("./fixtures/text-turn.json", import.meta.url), "utf8"),
) as {
  readonly protocolVersion: number;
  readonly updates: readonly SessionUpdate[];
  readonly stopReason: string;
};
const lifecycleFixture = JSON.parse(
  readFileSync(new URL("./fixtures/lifecycle.json", import.meta.url), "utf8"),
) as {
  readonly load: {
    readonly updates: readonly string[];
    readonly replayedText: string;
    readonly continuationText: string;
  };
  readonly resume: { readonly updates: readonly string[]; readonly continuationText: string };
  readonly observerDetach: {
    readonly visibleText: string;
    readonly promptStopReasons: readonly string[];
    readonly processExit: { readonly code: number | null; readonly signal: string | null };
  };
  readonly processLoss: {
    readonly clientError: string;
    readonly promptStopReason: string | null;
    readonly processExit: { readonly code: number | null; readonly signal: string | null };
  };
  readonly permissionCancel: {
    readonly offeredOptionIds: readonly string[];
    readonly toolFinalStatus: string;
    readonly cancelThenSettleStopReason: string;
    readonly settleThenCancelStopReason: string;
  };
};
const toolPermissionFixture = JSON.parse(
  readFileSync(new URL("./fixtures/tool-permission.json", import.meta.url), "utf8"),
) as {
  readonly updates: readonly SessionUpdate[];
  readonly permission: {
    readonly offeredOptionIds: readonly string[];
    readonly selectedOptionId: string;
  };
  readonly fileContent: string;
  readonly promptStopReason: string;
  readonly processExit: { readonly code: number | null; readonly signal: string | null };
};

describe("OpenCode ACP v1 update projection", () => {
  it("records native tool updates, offered permission choices, and the approved file result", () => {
    assert.deepEqual(
      toolPermissionFixture.updates.map(toAcpProofUpdate),
      ["pending", "in_progress", "completed"].map((status) => ({
        type: "update",
        sessionUpdate: status === "pending" ? "tool_call" : "tool_call_update",
        toolCallId: "<redacted-tool-call-id>",
        status,
      })),
    );
    assert.deepEqual(toolPermissionFixture.permission.offeredOptionIds, [
      "once",
      "always",
      "reject",
    ]);
    assert.equal(toolPermissionFixture.permission.selectedOptionId, "once");
    assert.equal(toolPermissionFixture.fileContent, "ACP_FIXTURE_WRITE_OK");
    assert.equal(toolPermissionFixture.promptStopReason, "end_turn");
    assert.deepEqual(toolPermissionFixture.processExit, { code: 0, signal: null });
  });

  it("records load replay, resume without replay, both permission-cancel orderings, and detach", () => {
    assert.deepEqual(lifecycleFixture.load.updates.slice(0, 2), [
      "user_message_chunk",
      "agent_message_chunk",
    ]);
    assert.ok(lifecycleFixture.load.replayedText.includes("RESTART_CONTEXT_73"));
    assert.equal(lifecycleFixture.load.continuationText, "RESTART_CONTEXT_73");
    assert.deepEqual(lifecycleFixture.resume.updates, [
      "available_commands_update",
      "agent_message_chunk",
    ]);
    assert.equal(lifecycleFixture.resume.continuationText, "RESTART_CONTEXT_73");
    assert.deepEqual(lifecycleFixture.observerDetach.promptStopReasons, ["end_turn", "end_turn"]);
    assert.equal(lifecycleFixture.observerDetach.processExit.code, 0);
    assert.deepEqual(lifecycleFixture.permissionCancel.offeredOptionIds, [
      "once",
      "always",
      "reject",
    ]);
    assert.equal(lifecycleFixture.permissionCancel.toolFinalStatus, "failed");
    assert.equal(lifecycleFixture.permissionCancel.cancelThenSettleStopReason, "cancelled");
    assert.equal(lifecycleFixture.permissionCancel.settleThenCancelStopReason, "cancelled");
  });

  it("preserves process loss as unknown when no native prompt result arrived", () => {
    assert.equal(lifecycleFixture.processLoss.clientError, "ACP connection closed");
    assert.equal(lifecycleFixture.processLoss.promptStopReason, null);
    assert.deepEqual(lifecycleFixture.processLoss.processExit, { code: null, signal: "SIGTERM" });
  });

  it("replays the sanitized native text-turn fixture without inventing message IDs", () => {
    assert.equal(textFixture.protocolVersion, 1);
    assert.equal(textFixture.stopReason, "end_turn");
    assert.deepEqual(
      textFixture.updates.map(toAcpProofUpdate),
      ["ACP", "_PRO", "OF", "_OK"].map((text) => ({
        type: "update",
        sessionUpdate: "agent_message_chunk",
        messageId: "<redacted-message-id>",
        text,
      })),
    );
  });

  it("preserves agent message IDs and treats each text update as a delta", () => {
    const update: SessionUpdate = {
      sessionUpdate: "agent_message_chunk",
      messageId: "msg_fixture",
      content: { type: "text", text: "delta" },
    };

    assert.deepEqual(toAcpProofUpdate(update), {
      type: "update",
      sessionUpdate: "agent_message_chunk",
      messageId: "msg_fixture",
      text: "delta",
    });
  });

  it("retains partial tool-call corrections by identity and status", () => {
    const update: SessionUpdate = {
      sessionUpdate: "tool_call_update",
      toolCallId: "call_fixture",
      status: "failed",
      rawOutput: { reason: "process stopped" },
    };

    assert.deepEqual(toAcpProofUpdate(update), {
      type: "update",
      sessionUpdate: "tool_call_update",
      toolCallId: "call_fixture",
      status: "failed",
    });
  });

  it("does not collapse duplicate notifications", () => {
    const update: SessionUpdate = {
      sessionUpdate: "agent_message_chunk",
      messageId: "msg_fixture",
      content: { type: "text", text: "same delta" },
    };

    assert.deepEqual(
      [toAcpProofUpdate(update), toAcpProofUpdate(update)],
      [
        {
          type: "update",
          sessionUpdate: "agent_message_chunk",
          messageId: "msg_fixture",
          text: "same delta",
        },
        {
          type: "update",
          sessionUpdate: "agent_message_chunk",
          messageId: "msg_fixture",
          text: "same delta",
        },
      ],
    );
  });
});
