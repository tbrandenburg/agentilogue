import { readFile, writeFile } from "node:fs/promises";

const catalogPath = new URL("../data/models.json", import.meta.url);
const catalogUrl = "https://models.dev/models.json";
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
type Lab = (typeof labs)[number];
type Tier = "small" | "medium" | "large";
type Entry = { models: string[]; tiers?: Partial<Record<Tier, string>> };
type Catalog = Record<Lab, Entry>;

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

async function fetchUpstream(): Promise<Record<string, unknown>> {
  const response = await fetch(catalogUrl, { signal: AbortSignal.timeout(20_000) });
  if (!response.ok) fail(`Unable to fetch models.dev (${response.status} ${response.statusText}).`);
  const data: unknown = await response.json();
  if (!isObject(data)) fail("models.dev returned an invalid catalog.");
  return data;
}

async function readLocal(): Promise<Catalog> {
  const data: unknown = JSON.parse(await readFile(catalogPath, "utf8"));
  if (!isObject(data) || Object.keys(data).sort().join(",") !== [...labs].sort().join(",")) {
    fail("Local model catalog must contain exactly the tracked labs.");
  }
  for (const lab of labs) {
    const entry = data[lab];
    if (
      !isObject(entry) ||
      !Array.isArray(entry.models) ||
      !entry.models.every(
        (id) => typeof id === "string" && id.length > 0 && id.trim() === id && !/[\s/]/.test(id),
      )
    ) {
      fail(`Invalid models list for ${lab}.`);
    }
    if (new Set(entry.models).size !== entry.models.length) fail(`Duplicate model IDs for ${lab}.`);
    if (entry.tiers !== undefined) {
      if (!isObject(entry.tiers)) fail(`Invalid tiers for ${lab}.`);
      for (const [tier, id] of Object.entries(entry.tiers)) {
        if (
          !["small", "medium", "large"].includes(tier) ||
          typeof id !== "string" ||
          !entry.models.includes(id)
        ) {
          fail(`Invalid ${tier} tier reference for ${lab}: ${String(id)}.`);
        }
      }
    }
  }
  return data as Catalog;
}

export function getUpstreamModels(upstream: Record<string, unknown>, lab: Lab): string[] {
  const prefix = `${lab}/`;
  const ids = Object.entries(upstream).flatMap(([canonicalId, model]) => {
    if (!canonicalId.startsWith(prefix) || !isObject(model)) return [];
    return [canonicalId.slice(prefix.length)];
  });
  if (ids.length === 0) throw new Error(`models.dev is missing tracked lab "${lab}".`);
  return ids.sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));
}

export function formatUnifiedDiff(before: string, after: string): string {
  const beforeLines = before.replace(/\n$/, "").split("\n");
  const afterLines = after.replace(/\n$/, "").split("\n");
  let prefix = 0;
  while (prefix < beforeLines.length && prefix < afterLines.length) {
    if (beforeLines[prefix] !== afterLines[prefix]) break;
    prefix++;
  }

  let beforeEnd = beforeLines.length;
  let afterEnd = afterLines.length;
  while (beforeEnd > prefix && afterEnd > prefix) {
    if (beforeLines[beforeEnd - 1] !== afterLines[afterEnd - 1]) break;
    beforeEnd--;
    afterEnd--;
  }

  const contextStart = Math.max(0, prefix - 3);
  const suffixContext = Math.min(3, beforeLines.length - beforeEnd, afterLines.length - afterEnd);
  const oldCount = beforeEnd - contextStart + suffixContext;
  const newCount = afterEnd - contextStart + suffixContext;

  return [
    "diff --git a/data/models.json b/data/models.json",
    "--- a/data/models.json",
    "+++ b/data/models.json",
    `@@ -${contextStart + 1},${oldCount} +${contextStart + 1},${newCount} @@`,
    ...beforeLines.slice(contextStart, prefix).map((line) => ` ${line}`),
    ...beforeLines.slice(prefix, beforeEnd).map((line) => `-${line}`),
    ...afterLines.slice(prefix, afterEnd).map((line) => `+${line}`),
    ...beforeLines.slice(beforeEnd, beforeEnd + suffixContext).map((line) => ` ${line}`),
  ].join("\n");
}

type ModelChange = { lab: string; id: string };

export function formatModelDriftSummary(
  missing: readonly ModelChange[],
  removed: readonly ModelChange[],
): string {
  const section = (title: string, changes: readonly ModelChange[]) => {
    if (changes.length === 0) return [];

    const byLab = new Map<string, string[]>();
    for (const { lab, id } of changes) byLab.set(lab, [...(byLab.get(lab) ?? []), id]);

    return [
      `${title} (${changes.length}):`,
      ...[...byLab].map(
        ([lab, models]) => `  ${lab}:\n${models.map((model) => `    - ${model}`).join("\n")}`,
      ),
    ];
  };

  return [
    ...section("Missing from data/models.json", missing),
    ...section("No longer in models.dev", removed),
  ].join("\n");
}

async function run() {
  const mode = process.argv[2];
  if (mode !== "check" && mode !== "sync") fail("Usage: bun scripts/models.ts <check|sync>");
  const upstream = await fetchUpstream();
  const local = await readLocal();
  const refreshed = Object.fromEntries(
    labs.map((lab) => [lab, { ...local[lab], models: getUpstreamModels(upstream, lab) }]),
  ) as Catalog;
  const removedTierRefs = labs.flatMap((lab) =>
    Object.entries(local[lab].tiers ?? {})
      .filter(([, id]) => !refreshed[lab].models.includes(id))
      .map(([tier, id]) => `${lab}.${tier} → ${id}`),
  );
  if (removedTierRefs.length > 0)
    fail(
      `Tier references point to removed models; choose replacements explicitly:\n${removedTierRefs.join("\n")}`,
    );

  if (mode === "sync") {
    await writeFile(catalogPath, `${JSON.stringify(refreshed, null, 2)}\n`);
    console.info("Updated data/models.json from models.dev; existing tier choices were preserved.");
    return;
  }

  const missing = labs.flatMap((lab) =>
    refreshed[lab].models
      .filter((id) => !local[lab].models.includes(id))
      .map((id) => ({ lab, id })),
  );
  const removed = labs.flatMap((lab) =>
    local[lab].models
      .filter((id) => !refreshed[lab].models.includes(id))
      .map((id) => ({ lab, id })),
  );
  if (missing.length > 0 || removed.length > 0)
    fail(
      [
        "models.dev drift detected.",
        "",
        formatModelDriftSummary(missing, removed),
        "",
        "Unified diff for data/models.json:",
        formatUnifiedDiff(
          `${JSON.stringify(local, null, 2)}\n`,
          `${JSON.stringify(refreshed, null, 2)}\n`,
        ),
        "",
        "Run bun run models:sync to apply the catalog update, then review tier choices and confirm bun run models:check passes.",
      ].join("\n"),
    );
  console.info("Model catalog matches models.dev.");
}

if (import.meta.main) {
  run().catch((error: unknown) =>
    fail(
      `Model catalog operation failed: ${error instanceof Error ? error.message : String(error)}`,
    ),
  );
}
