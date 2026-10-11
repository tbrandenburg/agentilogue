import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { AssistantMessage, ToolPart } from "@opencode-ai/sdk/v2/client";
import {
  classifyOpenCodeHistoryOutcome,
  classifyOpenCodeOutcome,
  hasOpenCodeTerminalEvidence,
} from "../lib/opencode-native-outcome";

const interrupted = {
  role: "assistant",
  finish: null,
  time: { created: 1, completed: undefined },
} as unknown as Pick<AssistantMessage, "finish" | "time">;

describe("native OpenCode outcome evidence", () => {
  it("does not treat null finish and absent completion as terminal", () => {
    assert.equal(hasOpenCodeTerminalEvidence(interrupted), false);
  });

  it("recognizes a final finish reason or a completed explicit error", () => {
    assert.equal(hasOpenCodeTerminalEvidence({ ...interrupted, finish: "stop" }), true);
    assert.equal(
      hasOpenCodeTerminalEvidence({
        ...interrupted,
        error: { name: "MessageAbortedError", data: { message: "Aborted" } },
        time: { created: 1, completed: 2 },
      }),
      true,
    );
  });

  it("does not mistake completed intermediate messages for final run evidence", () => {
    for (const finish of ["tool-calls", "unknown", "", undefined]) {
      const info = {
        role: "assistant" as const,
        finish,
        time: { created: 1, completed: 2 },
      };
      assert.equal(hasOpenCodeTerminalEvidence(info), false);
      assert.equal(
        classifyOpenCodeHistoryOutcome([{ info: { role: "user" } }, { info }]),
        "unknown",
      );
    }
  });

  it("keeps a stop with tool calls unknown until a final assistant response follows", () => {
    const prompt = { info: { role: "user" as const } };
    const tool = {
      type: "tool",
      state: { status: "completed", metadata: {} },
    } as ToolPart;
    const step = {
      info: { role: "assistant" as const, finish: "stop", time: { created: 1, completed: 2 } },
      parts: [tool],
    };
    assert.equal(classifyOpenCodeHistoryOutcome([prompt, step]), "unknown");
    assert.equal(
      classifyOpenCodeHistoryOutcome([prompt, step, { info: step.info, parts: [] }]),
      "terminal",
    );
    assert.equal(
      classifyOpenCodeHistoryOutcome([
        prompt,
        { ...step, parts: [{ ...tool, metadata: { providerExecuted: true } }] },
      ]),
      "terminal",
    );
    assert.equal(
      classifyOpenCodeHistoryOutcome([
        prompt,
        {
          ...step,
          parts: [
            {
              ...tool,
              state: {
                status: "error",
                input: {},
                error: "Interrupted",
                time: { start: 1, end: 2 },
                metadata: { interrupted: true },
              },
            },
          ],
        },
      ]),
      "terminal",
    );
  });

  it("rejects empty finish reasons and non-numeric completion timestamps", () => {
    assert.equal(hasOpenCodeTerminalEvidence({ ...interrupted, finish: "" }), false);
    assert.equal(
      hasOpenCodeTerminalEvidence({
        ...interrupted,
        time: { created: 1, completed: "2" as unknown as number },
      }),
      false,
    );
  });

  it("treats a busy session as active and missing terminal evidence as unknown", () => {
    assert.equal(classifyOpenCodeOutcome(true, false), "active");
    assert.equal(classifyOpenCodeOutcome("retry", false), "active");
    assert.equal(classifyOpenCodeOutcome("retry", true), "active");
    assert.equal(classifyOpenCodeOutcome(false, true), "terminal");
    assert.equal(classifyOpenCodeOutcome(false, false), "unknown");
  });

  it("keeps sessions with no prompts idle and detects an incomplete latest prompt after reload", () => {
    const completed = {
      role: "assistant",
      finish: "stop",
      time: { created: 1, completed: 2 },
    } as const;
    const prompt = { role: "user" } as const;
    const incomplete = {
      role: "assistant",
      finish: null,
      time: { created: 3, completed: undefined },
    } as unknown as Pick<AssistantMessage, "role" | "finish" | "time">;

    assert.equal(classifyOpenCodeHistoryOutcome([]), "idle");
    assert.equal(classifyOpenCodeHistoryOutcome([{ info: prompt }]), "unknown");
    assert.equal(
      classifyOpenCodeHistoryOutcome([{ info: prompt }, { info: incomplete }]),
      "unknown",
    );
    assert.equal(
      classifyOpenCodeHistoryOutcome([{ info: prompt }, { info: completed }]),
      "terminal",
    );
    assert.equal(
      classifyOpenCodeHistoryOutcome([{ info: completed }, { info: prompt }]),
      "unknown",
    );
  });
});
