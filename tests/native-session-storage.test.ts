import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseStoredNativeSessions, serializeNativeSessions } from "../lib/native-session-storage";

const session = {
  id: "conversation-a",
  title: "chat a",
  projectName: "agentilogue",
  openCodeProjectName: "project-a",
  runTarget: "opencode:native",
  nativeSessionId: "session-a",
};

describe("native chat session recovery storage", () => {
  it("round-trips scoped native session IDs and active tab", () => {
    const serialized = serializeNativeSessions([session], session.id, "agentilogue", "project-a");
    assert.ok(serialized);
    assert.deepEqual(parseStoredNativeSessions(serialized, "agentilogue", "project-a"), {
      sessions: [session],
      activeId: session.id,
    });
  });

  it("rejects malformed or differently scoped saved state", () => {
    const serialized = serializeNativeSessions([session], session.id, "agentilogue", "project-a");
    assert.equal(parseStoredNativeSessions("not-json", "agentilogue", "project-a"), null);
    assert.equal(parseStoredNativeSessions(serialized, "other-app", "project-a"), null);
    assert.equal(parseStoredNativeSessions(serialized, "agentilogue", "project-b"), null);
  });

  it("stores only native sessions with a server session ID", () => {
    const serialized = serializeNativeSessions(
      [
        session,
        { ...session, id: "ai-sdk", runTarget: "openai:vercel-ai", nativeSessionId: undefined },
        { ...session, id: "unbound", nativeSessionId: undefined },
      ],
      "ai-sdk",
      "agentilogue",
      "project-a",
    );
    const stored = parseStoredNativeSessions(serialized, "agentilogue", "project-a");
    assert.deepEqual(stored?.sessions, [session]);
    assert.equal(stored?.activeId, session.id);
    assert.equal(serializeNativeSessions([], "", "agentilogue", "project-a"), null);
  });
});
