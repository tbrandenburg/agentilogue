import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { checkFile, formattedDigest } from "./assistant-ui-drift";

const manifest = {
  formatter: "oxfmt@0.68.0",
  upstream: {
    repository: "assistant-ui/assistant-ui",
    commit: "dc840613f1edbe9cebcc01d0112add781aca0449",
    path: "packages/ui/src/components/react/assistant-ui/elements/thread.aui.tsx",
    blob: "fbffa25727755ff79817c1a94cda1b0ad325b412",
  },
  files: [
    {
      path: "thread.tsx",
      formattedSha256: "",
      approvedPatches: [
        { name: "ComposerActionLeft", reason: "accessory", introducedBy: "issue #41" },
      ],
    },
  ],
};

describe("assistant-ui copied-source drift check", () => {
  it("accepts the pinned baseline", async () => {
    const source = 'const answer = "ready";\n';
    const baseline = {
      ...manifest,
      files: [
        { ...manifest.files[0]!, formattedSha256: await formattedDigest(source, "thread.tsx") },
      ],
    };
    assert.equal((await checkFile(baseline, "thread.tsx", source)).ok, true);
  });

  it("accepts formatter-only changes", async () => {
    const source = 'const answer = "ready";\n';
    const baseline = {
      ...manifest,
      files: [
        { ...manifest.files[0]!, formattedSha256: await formattedDigest(source, "thread.tsx") },
      ],
    };
    assert.equal((await checkFile(baseline, "thread.tsx", 'const answer="ready";')).ok, true);
  });

  it("rejects functional changes with an actionable message", async () => {
    const baselineSource = 'const answer = "ready";\n';
    const baseline = {
      ...manifest,
      files: [
        {
          ...manifest.files[0]!,
          formattedSha256: await formattedDigest(baselineSource, "thread.tsx"),
        },
      ],
    };
    const result = await checkFile(baseline, "thread.tsx", 'const answer = "broken";\n');
    assert.equal(result.ok, false);
    assert.match(result.message, /Unexpected functional drift: thread\.tsx/);
    assert.match(result.message, /ComposerActionLeft \(issue #41\)/);
    assert.match(result.message, /formattedSha256/);
  });

  it("accepts an explicitly approved baseline update", async () => {
    const approvedSource = 'const answer = "approved";\n';
    const updated = {
      ...manifest,
      files: [
        {
          ...manifest.files[0]!,
          formattedSha256: await formattedDigest(approvedSource, "thread.tsx"),
          approvedPatches: [{ name: "approved-change", reason: "reviewed", introducedBy: "test" }],
        },
      ],
    };
    assert.equal((await checkFile(updated, "thread.tsx", approvedSource)).ok, true);
  });

  it("tracks only the copied Thread component", async () => {
    const manifestText = await readFile(
      new URL("../docs/assistant-ui-source.json", import.meta.url),
      "utf8",
    );
    const checkedInManifest = JSON.parse(manifestText) as typeof manifest;
    assert.deepEqual(
      checkedInManifest.files.map((file) => file.path),
      ["components/assistant-ui/elements/thread.aui.tsx"],
    );
  });
});
