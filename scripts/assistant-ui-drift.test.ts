import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkFile, formattedDigest, sourceDiff } from "./assistant-ui-drift";

const manifest = {
  formatter: "oxfmt@0.68.0",
  upstream: {
    repository: "assistant-ui/assistant-ui",
    commit: "dc840613f1edbe9cebcc01d0112add781aca0449",
  },
  files: [
    {
      path: "thread.tsx",
      upstreamPath: "thread.tsx",
      upstreamBlob: "fbffa25727755ff79817c1a94cda1b0ad325b412",
      formattedSha256: "",
      approvedPatches: [
        { name: "ComposerActionLeft", reason: "accessory", introducedBy: "PR #17" },
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
    assert.match(result.message, /ComposerActionLeft \(PR #17\)/);
    assert.match(result.message, /formattedSha256/);
    assert.match(result.message, /upstream Git blob/);
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

  it("shows a committed source diff against the pull request base", async () => {
    const repository = await mkdtemp(join(tmpdir(), "assistant-ui-drift-git-"));
    const runGit = (...args: string[]) =>
      execFileSync("git", args, {
        cwd: repository,
        env: {
          ...process.env,
          GIT_AUTHOR_NAME: "assistant-ui drift test",
          GIT_AUTHOR_EMAIL: "drift-test@example.invalid",
          GIT_COMMITTER_NAME: "assistant-ui drift test",
          GIT_COMMITTER_EMAIL: "drift-test@example.invalid",
        },
      });

    try {
      runGit("init", "--quiet");
      await writeFile(join(repository, "thread.tsx"), 'const value = "ready";\n');
      runGit("add", "thread.tsx");
      runGit("commit", "--quiet", "-m", "baseline");
      const base = runGit("rev-parse", "HEAD").toString().trim();

      await writeFile(join(repository, "thread.tsx"), 'const value = "changed";\n');
      runGit("add", "thread.tsx");
      runGit("commit", "--quiet", "-m", "functional change");

      const diff = sourceDiff(repository, "thread.tsx", base);
      assert.match(diff, /-const value = "ready"/);
      assert.match(diff, /\+const value = "changed"/);
    } finally {
      await rm(repository, { recursive: true, force: true });
    }
  });

  it("tracks verified registry copies without classifying app-owned controls as upstream", async () => {
    const manifestText = await readFile(
      new URL("../docs/assistant-ui-source.json", import.meta.url),
      "utf8",
    );
    const checkedInManifest = JSON.parse(manifestText) as typeof manifest;
    assert.deepEqual(
      checkedInManifest.files.map((file) => file.path),
      [
        "components/assistant-ui/elements/attachment.aui.tsx",
        "components/assistant-ui/elements/file.tsx",
        "components/assistant-ui/elements/follow-up-suggestions.aui.tsx",
        "components/assistant-ui/elements/image.tsx",
        "components/assistant-ui/elements/markdown-text.tsx",
        "components/assistant-ui/elements/media-player.tsx",
        "components/assistant-ui/elements/model-selector.tsx",
        "components/assistant-ui/elements/reasoning.aui.tsx",
        "components/assistant-ui/elements/reasoning.tsx",
        "components/assistant-ui/elements/surfaces.tsx",
        "components/assistant-ui/elements/thread.aui.tsx",
        "components/assistant-ui/elements/tool-fallback.aui.tsx",
        "components/assistant-ui/elements/tool-group.aui.tsx",
        "components/assistant-ui/elements/tooltip-icon-button.tsx",
      ],
    );
    assert.ok(checkedInManifest.files.every((file) => file.upstreamBlob.length === 40));
    assert.equal(
      checkedInManifest.files.some((file) => file.path.endsWith("session-controls.tsx")),
      false,
    );
  });
});
