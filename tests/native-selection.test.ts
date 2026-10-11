import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { nativeCatalog, nativeModelId, nativeSelectionAvailable } from "../lib/native-selection";
import { parseStoredNativeSessions, serializeNativeSessions } from "../lib/native-session-storage";

const catalog = nativeCatalog(
  {
    connected: ["one", "two"],
    all: [
      { id: "one", models: { same: { id: "same" } } },
      { id: "two", models: { same: { id: "same" }, slash: { id: "nested/model" } } },
      { id: "offline", models: { same: { id: "same" } } },
    ],
  },
  [
    { name: "build", mode: "primary" },
    { name: "both", mode: "all" },
    { name: "task", mode: "subagent" },
    { name: "internal", mode: "primary", hidden: true },
  ],
);

describe("native catalog and tab selection", () => {
  it("keeps connected provider/model pairs distinct, including model IDs containing slashes", () => {
    assert.deepEqual(
      catalog.models.map((option) => option.name),
      ["one/same", "two/nested/model", "two/same"],
    );
    assert.equal(new Set(catalog.models.map((option) => option.id)).size, 3);
    assert.deepEqual(catalog.agents, ["both", "build"]);
    assert.notEqual(
      nativeModelId({ providerID: "a/b", modelID: "c" }),
      nativeModelId({ providerID: "a", modelID: "b/c" }),
    );
  });
  it("rejects unavailable saved pairs and agents instead of silently falling back", () => {
    assert.equal(nativeSelectionAvailable(catalog, {}), true);
    assert.equal(
      nativeSelectionAvailable(catalog, {
        nativeModel: { providerID: "one", modelID: "same" },
        nativeAgent: "build",
      }),
      true,
    );
    assert.equal(
      nativeSelectionAvailable(catalog, {
        nativeModel: { providerID: "offline", modelID: "same" },
      }),
      false,
    );
    assert.equal(nativeSelectionAvailable(catalog, { nativeAgent: "task" }), false);
  });
  it("round-trips independent explicit and Default native tabs without AI SDK/ACP choices", () => {
    const base = {
      id: "a",
      title: "chat 1",
      projectName: "app",
      openCodeProjectName: "project",
      runTarget: "opencode:native",
      nativeSessionId: "server-a",
    };
    const explicit = {
      ...base,
      nativeModel: { providerID: "two", modelID: "nested/model" },
      nativeAgent: "build",
    };
    const defaults = { ...base, id: "b", nativeSessionId: "server-b" };
    const raw = serializeNativeSessions(
      [
        explicit,
        defaults,
        { ...base, id: "ai", runTarget: "openai:vercel-ai", model: "other" },
        { ...base, id: "acp", runTarget: "opencode:cli" },
      ],
      "b",
      "app",
      "project",
    );
    assert.deepEqual(parseStoredNativeSessions(raw, "app", "project"), {
      sessions: [explicit, defaults],
      activeId: "b",
    });
    assert.equal(
      parseStoredNativeSessions(
        raw!.replace('"providerID":"two"', '"providerID":""'),
        "app",
        "project",
      ),
      null,
    );
  });
});
