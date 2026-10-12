import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

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
const formatter = join(root, "node_modules/.bin/oxfmt");

export const formattedDigest = async (source: string, filename: string): Promise<string> => {
  const temporaryDirectory = await mkdtemp(join(tmpdir(), "assistant-ui-drift-"));
  const temporaryFile = join(temporaryDirectory, filename.split("/").at(-1) ?? "source.tsx");

  try {
    await writeFile(temporaryFile, source);
    const result = spawnSync(formatter, ["--write", temporaryFile], {
      cwd: root,
      encoding: "utf8",
    });
    if (result.status !== 0) {
      throw new Error(`oxfmt failed for ${filename}: ${result.stderr || result.stdout}`);
    }
    const formatted = await readFile(temporaryFile);
    return createHash("sha256").update(formatted).digest("hex");
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
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
  const version = spawnSync(formatter, ["--version"], { cwd: root, encoding: "utf8" });
  if (
    version.status !== 0 ||
    !version.stdout.includes(manifest.formatter.split("@").at(-1) ?? "")
  ) {
    console.error(`Expected ${manifest.formatter}; got ${version.stdout || version.stderr}`);
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
