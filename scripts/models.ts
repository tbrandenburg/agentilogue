import { readFile, writeFile } from "node:fs/promises";

const catalogPath = new URL("../data/models.json", import.meta.url);
const catalogUrl = "https://models.dev/api.json";
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

function getUpstreamModels(upstream: Record<string, unknown>, lab: Lab): string[] {
  const upstreamName: Record<Lab, string> = {
    openai: "openai",
    anthropic: "anthropic",
    google: "google",
    xai: "xai",
    deepseek: "deepseek",
    moonshotai: "moonshotai",
    qwen: "alibaba",
    "z-ai": "zai",
    minimax: "minimax",
    mistral: "mistral",
    cohere: "cohere",
  };
  const source = upstream[upstreamName[lab]];
  if (!isObject(source) || !isObject(source.models))
    fail(`models.dev is missing tracked lab "${lab}".`);
  const ids = Object.entries(source.models).flatMap(([id, model]) => (isObject(model) ? [id] : []));
  if (ids.length === 0) fail(`models.dev returned no model IDs for ${lab}.`);
  return [...new Set(ids)].sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));
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

  const changes = labs.flatMap((lab) => {
    const additions = refreshed[lab].models
      .filter((id) => !local[lab].models.includes(id))
      .map((id) => `  + ${lab}/${id}`);
    const removals = local[lab].models
      .filter((id) => !refreshed[lab].models.includes(id))
      .map((id) => `  - ${lab}/${id}`);
    return [...additions, ...removals];
  });
  if (changes.length > 0)
    fail(
      `models.dev drift detected.\n\n${changes.join("\n")}\n\nRun:\n  bun run models:sync\n\nThen review the diff and adjust small / medium / large if appropriate.`,
    );
  console.info("Model catalog matches models.dev.");
}

run().catch((error: unknown) =>
  fail(`Model catalog operation failed: ${error instanceof Error ? error.message : String(error)}`),
);
