import assert from "node:assert/strict";
import { describe, it } from "node:test";
import catalog from "../data/models.json";
import { formatUnifiedDiff, getUpstreamModels } from "../scripts/models";

const labs = [
  "openai",
  "anthropic",
  "google",
  "xai",
  "deepseek",
  "moonshotai",
  "alibaba",
  "zhipuai",
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

  it("attributes model IDs by canonical creator namespace, not serving provider", () => {
    const modelCatalog = {
      "alibaba/qwen-max": {},
      "deepseek/deepseek-v4-flash": {},
      "moonshotai/kimi-k3": {},
      "zhipuai/glm-5.2": {},
    };

    assert.deepEqual(getUpstreamModels(modelCatalog, "alibaba"), ["qwen-max"]);
    assert.deepEqual(getUpstreamModels(modelCatalog, "deepseek"), ["deepseek-v4-flash"]);
    assert.deepEqual(getUpstreamModels(modelCatalog, "moonshotai"), ["kimi-k3"]);
    assert.deepEqual(getUpstreamModels(modelCatalog, "zhipuai"), ["glm-5.2"]);
  });

  it("rejects a provider catalog instead of treating its hosted models as creator entries", () => {
    const providerCatalog = {
      alibaba: { models: { "qwen-max": {}, "deepseek-v4-flash": {}, "glm-5.2": {} } },
    };

    assert.throws(() => getUpstreamModels(providerCatalog, "alibaba"), /missing tracked lab/);
  });

  it("prints an applicable unified diff for a catalog change", () => {
    const before = '{\n  "minimax": {\n    "models": [\n      "MiniMax-M2"\n    ]\n  }\n}\n';
    const after =
      '{\n  "minimax": {\n    "models": [\n      "MiniMax-H3",\n      "MiniMax-M2"\n    ]\n  }\n}\n';

    assert.equal(
      formatUnifiedDiff(before, after),
      [
        "diff --git a/data/models.json b/data/models.json",
        "--- a/data/models.json",
        "+++ b/data/models.json",
        "@@ -1,6 +1,7 @@",
        " {",
        '   "minimax": {',
        '     "models": [',
        '+      "MiniMax-H3",',
        '       "MiniMax-M2"',
        "     ]",
        "   }",
      ].join("\n"),
    );
  });
});
