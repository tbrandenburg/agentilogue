import assert from "node:assert/strict";
import { describe, it } from "node:test";
import catalog from "../data/models.json";

const labs = [
  "openai",
  "anthropic",
  "google",
  "xai",
  "deepseek",
  "moonshotai",
  "qwen",
  "z-ai",
  "minimax",
  "mistral",
  "cohere",
] as const;

describe("checked-in model suggestions", () => {
  it("tracks exactly the supported model creators with unique, sorted IDs", () => {
    assert.deepEqual(Object.keys(catalog).sort(), [...labs].sort());
    for (const lab of labs) {
      const models = catalog[lab].models;
      assert.ok(models.length > 0);
      assert.equal(new Set(models).size, models.length);
      assert.ok(models.every((model) => model.trim() === model && !/[\s/]/.test(model)));
      assert.deepEqual(
        models,
        [...models].sort((left, right) => (left < right ? -1 : left > right ? 1 : 0)),
      );
    }
  });

  it("keeps optional tier references within their creator's catalog", () => {
    for (const lab of labs) {
      for (const [tier, model] of Object.entries(catalog[lab].tiers ?? {})) {
        assert.ok(["small", "medium", "large"].includes(tier));
        assert.ok(catalog[lab].models.includes(model));
      }
    }
  });
});
