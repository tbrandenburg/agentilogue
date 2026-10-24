import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import formatter from "oxfmt/package.json";

type Manifest = {
  formatter: string;
  upstream: { repository: string; commit: string };
  files: Array<{
    path: string;
    upstreamPath: string;
    upstreamBlob: string;
    formattedSha256: string;
    approvedPatches: Array<{ name: string; reason: string; introducedBy: string }>;
  }>;
};

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const manifestPath = join(root, "docs/assistant-ui-source.json");

export const formattedDigest = async (source: string, filename: string): Promise<string> => {
  const oxfmt = await import("oxfmt");
  const result = await oxfmt.format(filename, source);
  if (result.errors.length) {
    throw new Error(
      `oxfmt failed for ${filename}: ${result.errors.map((error) => error.message).join("\n")}`,
    );
  }
  return createHash("sha256").update(result.code).digest("hex");
};

export const sourceDiff = (cwd: string, filename: string, baseRef?: string): string => {
  const workingTreeDiff = spawnSync("git", ["diff", "--no-ext-diff", "--", filename], {
    cwd,
    encoding: "utf8",
  });
  if (workingTreeDiff.status === 0 && workingTreeDiff.stdout.trim())
    return workingTreeDiff.stdout.trim();

  const ref = baseRef ?? process.env.ASSISTANT_UI_DRIFT_BASE;
  if (!ref) return "";

  const committedDiff = spawnSync(
    "git",
    ["diff", "--no-ext-diff", `${ref}...HEAD`, "--", filename],
    {
      cwd,
      encoding: "utf8",
    },
  );
  return committedDiff.status === 0 ? committedDiff.stdout.trim() : "";
};

export const checkFile = async (
  manifest: Manifest,
  filename: string,
  source: string,
): Promise<{ ok: boolean; message: string }> => {
  const entry = manifest.files.find((file) => file.path === filename);
  if (!entry) return { ok: false, message: `No pinned baseline for ${filename}` };

  const actual = await formattedDigest(source, filename);
  if (actual === entry.formattedSha256)
    return { ok: true, message: `${filename}: baseline matches` };

  const approved = entry.approvedPatches
    .map((patch) => `${patch.name} (${patch.introducedBy})`)
    .join(", ");
  const diff = sourceDiff(root, filename);
  return {
    ok: false,
    message: [
      `Unexpected functional drift: ${filename}`,
      `  expected formatted SHA-256: ${entry.formattedSha256}`,
      `  actual formatted SHA-256:   ${actual}`,
      `  pinned upstream: ${manifest.upstream.repository}@${manifest.upstream.commit}:${entry.upstreamPath}`,
      `  upstream Git blob: ${entry.upstreamBlob}`,
      `  approved local patches: ${approved || "none"}`,
      ...(diff ? ["  working-tree diff:", diff] : []),
      "Review the functional change, verify the pinned upstream blob, update the approved patch entry and formattedSha256 in docs/assistant-ui-source.json, and include the rationale in the PR.",
    ].join("\n"),
  };
};

const run = async (): Promise<number> => {
  const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as Manifest;
  if (manifest.formatter !== `oxfmt@${formatter.version}`) {
    console.error(`Expected ${manifest.formatter}; got oxfmt@${formatter.version}`);
    return 1;
  }
  const results = await Promise.all(
    manifest.files.map(async ({ path }) =>
      checkFile(manifest, path, await readFile(join(root, path), "utf8")),
    ),
  );
  for (const result of results) console.log(result.message);
  return results.every((result) => result.ok) ? 0 : 1;
};

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exitCode = await run();
