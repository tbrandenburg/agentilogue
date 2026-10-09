import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createConversationId } from "./assistant";

describe("browser conversation IDs", () => {
  it("gives independent initial conversations and a new conversation distinct IDs", () => {
    const firstInitialConversation = createConversationId();
    const secondInitialConversation = createConversationId();
    const subsequentConversation = createConversationId();

    assert.notEqual(firstInitialConversation, secondInitialConversation);
    assert.notEqual(firstInitialConversation, subsequentConversation);
    assert.notEqual(secondInitialConversation, subsequentConversation);
  });
});
