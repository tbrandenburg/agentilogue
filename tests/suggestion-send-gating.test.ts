import assert from "node:assert/strict";
import { it } from "node:test";
import { suggestionTriggerDisabled } from "@assistant-ui/core/store/internal";
import type { AssistantState } from "@assistant-ui/react";

const state = (isSendDisabled: boolean): AssistantState =>
  ({
    composer: { canSend: false, isEmpty: true },
    thread: { isDisabled: false, isSendDisabled },
  }) as unknown as AssistantState;

it("keeps send-enabled suggestions available for a ready empty composer", () => {
  assert.equal(suggestionTriggerDisabled(state(false), true), false);
});

it("blocks sends through suggestions when the runtime disables sending", () => {
  assert.equal(suggestionTriggerDisabled(state(true), true), true);
});

it("preserves populate-only suggestions when runtime sending is disabled", () => {
  assert.equal(suggestionTriggerDisabled(state(true), false), false);
});
