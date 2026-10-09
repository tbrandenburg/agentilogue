import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AssistantTransportDecoder } from "assistant-stream";
import { createGetHandler } from "@/app/api/agent/route";
import type { AgentProvider } from "@/lib/agent/contracts/provider";
import { ConversationIdSchema, RunIdSchema } from "@/lib/agent/contracts/identifiers";
import type { RunObservation } from "@/lib/agent/contracts/run";

const runId = RunIdSchema.parse("00000000-0000-4000-8000-000000000041");
const conversationId = ConversationIdSchema.parse("conversation-observation");

function handlerFor(observe: AgentProvider["observe"]) {
  const provider = {
    id: "test-provider",
    describe: () => ({}),
    start: async () => ({ runId }),
    observe,
    cancel: async () => "dispatched" as const,
    respond: async () => "dispatched" as const,
  } as unknown as AgentProvider;
  return createGetHandler(provider);
}

function request() {
  return new Request(`http://localhost:3000/api/agent?runId=${runId}`, {
    headers: { host: "localhost:3000", origin: "http://localhost:3000" },
  });
}

async function readObservations(response: Response): Promise<RunObservation[]> {
  if (!response.body) throw new Error("Expected an observation stream");
  const reader = response.body
    .pipeThrough(new AssistantTransportDecoder({ strict: true }))
    .getReader();
  const observations: RunObservation[] = [];
  while (true) {
    const { value, done } = await reader.read();
    if (done) return observations;
    if (value.type !== "update-state") continue;
    for (const operation of value.operations) {
      if (operation.type !== "set" || operation.path.length !== 0) continue;
      observations.push(operation.value as RunObservation);
    }
  }
}

describe("agent observation route", () => {
  it("streams an unknown terminal snapshot instead of treating it as a missing run", async () => {
    const observe: AgentProvider["observe"] = async function* () {
      yield {
        type: "snapshot",
        snapshot: {
          runId,
          conversationId,
          lastSequence: 0,
          phase: "unknown",
          outcome: { kind: "unknown", message: "native outcome unavailable" },
          messages: [],
          tools: [],
          parts: [],
          pendingPermissions: [],
        },
      };
    };
    const response = await handlerFor(observe)(request());

    assert.equal(response.status, 200);
    const observations = await readObservations(response);
    assert.equal(observations.length, 1);
    assert.equal(
      observations[0]?.type === "snapshot" ? observations[0].snapshot.phase : undefined,
      "unknown",
    );
  });

  it("returns a permanent 404 before streaming an expired or missing run", async () => {
    const observe: AgentProvider["observe"] = () => ({
      [Symbol.asyncIterator]: () => ({
        next: async () => {
          throw new Error("Unknown run");
        },
      }),
    });
    const response = await handlerFor(observe)(request());

    assert.equal(response.status, 404);
  });
});
