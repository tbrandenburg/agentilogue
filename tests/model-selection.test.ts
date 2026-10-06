import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_MODEL,
  DEFAULT_OPTION_ID,
  isAllowedModel,
  modelFromSelectorValue,
} from "@/lib/model-selection";

describe("model selection", () => {
  it("maps Default to no override and preserves concrete IDs", () => {
    assert.equal(modelFromSelectorValue(DEFAULT_OPTION_ID), undefined);
    assert.equal(modelFromSelectorValue("gpt-6-sol"), "gpt-6-sol");
  });

  it("allows only exact OpenAI catalog IDs", () => {
    assert.equal(isAllowedModel(DEFAULT_MODEL), true);
    assert.equal(isAllowedModel("gpt-6-sol"), true);
    for (const invalid of ["unknown-model", DEFAULT_OPTION_ID, null, 42, {}, []]) {
      assert.equal(isAllowedModel(invalid), false);
    }
  });
});
