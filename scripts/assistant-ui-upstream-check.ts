import { createHash } from "node:crypto";
import { readFile, mkdtemp, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

type Manifest = {
  formatter: string;
  upstream: { repository: string; commit: string };
  files: Array<{ path: string; upstreamPath: string; upstreamBlob: string }>;
};
type Release = {
  tag_name: string;
  draft: boolean;
  prerelease: boolean;
  published_at: string | null;
};
type Version = { major: number; minor: number; patch: number; version: string };
type TreeEntry = { path: string; type: string; sha: string };
type PackageMetadata = {
  name: string;
  version: string;
  repository?: string | { url?: string; directory?: string };
  dependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  dist?: { tarball?: string; integrity?: string; signatures?: unknown[] };
};
type Change = { path: string; kind: string; detail: string; url?: string };
type Report = {
  status: "PASS" | "DRIFT" | "ERROR";
  pinnedVersion: string;
  pinnedCommit: string;
  candidateVersion?: string;
  candidateCommit?: string;
  changes: Change[];
  errors: string[];
  info: string[];
};
type Fetcher = (url: string) => Promise<Response>;

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const github = "https://api.github.com";
const remediation =
  "Review the tagged upstream diff and compatibility; if accepted, update exact package pins/overrides and copied sources together, update manifest provenance, then run frozen install, local drift check, runtime tests, and this check in the same PR.";

export const parseVersion = (value: string): Version | undefined => {
  const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.exec(value);
  if (!match) return undefined;
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    version: value,
  };
};

export const compareVersions = (left: Version, right: Version): number =>
  left.major - right.major || left.minor - right.minor || left.patch - right.patch;

export const releaseVersion = (release: Release): Version | undefined => {
  if (release.draft || release.prerelease || release.published_at === null) return undefined;
  const match = /^@assistant-ui\/react@(\d+\.\d+\.\d+)$/.exec(release.tag_name);
  return match ? parseVersion(match[1]!) : undefined;
};

export const newestReactRelease = (pages: Release[][]): { release: Release; version: Version } => {
  const releases = pages
    .flat()
    .flatMap((release) => {
      const version = releaseVersion(release);
      return version ? [{ release, version }] : [];
    })
    .sort((left, right) => compareVersions(right.version, left.version));
  if (!releases[0]) throw new Error("No published stable @assistant-ui/react release found");
  return releases[0];
};

const request = async (fetcher: Fetcher, url: string): Promise<Response> => {
  const response = await fetcher(url);
  if (!response.ok) throw new Error(`GET ${new URL(url).pathname} failed (${response.status})`);
  return response;
};

const json = async <T>(fetcher: Fetcher, url: string): Promise<T> => {
  try {
    return (await (await request(fetcher, url)).json()) as T;
  } catch (error) {
    throw new Error(
      `Invalid response from ${new URL(url).host}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
};

export const listReleases = async (fetcher: Fetcher): Promise<Release[][]> => {
  const pages: Release[][] = [];
  for (let page = 1; page <= 50; page += 1) {
    const result = await json<unknown>(
      fetcher,
      `${github}/repos/assistant-ui/assistant-ui/releases?per_page=100&page=${page}`,
    );
    if (
      !Array.isArray(result) ||
      result.some(
        (item) =>
          !item ||
          typeof item.tag_name !== "string" ||
          typeof item.draft !== "boolean" ||
          typeof item.prerelease !== "boolean" ||
          !(item.published_at === null || typeof item.published_at === "string"),
      )
    )
      throw new Error(`Malformed releases page ${page}`);
    pages.push(result as Release[]);
    if (result.length < 100) return pages;
  }
  throw new Error("Release pagination exceeded 50 pages; result may be incomplete");
};

const apiObject = async (fetcher: Fetcher, path: string): Promise<Record<string, unknown>> => {
  const value = await json<unknown>(fetcher, `${github}/repos/assistant-ui/assistant-ui/${path}`);
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error(`Malformed GitHub object at ${path}`);
  return value as Record<string, unknown>;
};

export const resolveCommit = async (fetcher: Fetcher, tag: string): Promise<string> => {
  let object = await apiObject(fetcher, `git/ref/tags/${encodeURIComponent(tag)}`);
  let target = object.object;
  if (!target || typeof target !== "object") throw new Error(`Missing tag target for ${tag}`);
  let next = target as { sha?: unknown; type?: unknown };
  for (let depth = 0; next.type === "tag" && depth < 8; depth += 1) {
    if (typeof next.sha !== "string" || !/^[0-9a-f]{40}$/.test(next.sha))
      throw new Error(`Invalid annotated tag object for ${tag}`);
    object = await apiObject(fetcher, `git/tags/${next.sha}`);
    target = object.object;
    if (!target || typeof target !== "object")
      throw new Error(`Missing annotated tag target for ${tag}`);
    next = target as { sha?: unknown; type?: unknown };
  }
  if (next.type !== "commit" || typeof next.sha !== "string" || !/^[0-9a-f]{40}$/.test(next.sha))
    throw new Error(`Tag ${tag} does not resolve to an immutable commit`);
  return next.sha;
};

export const npmVersion = async (
  fetcher: Fetcher,
  version: string,
  name = "@assistant-ui/react",
  directory = "packages/react",
): Promise<PackageMetadata> => {
  const metadata = await json<PackageMetadata>(
    fetcher,
    `https://registry.npmjs.org/${name.replace("/", "%2f")}/${version}`,
  );
  if (
    metadata.name !== name ||
    metadata.version !== version ||
    !metadata.dist?.tarball ||
    !metadata.dist.integrity
  )
    throw new Error(`npm publication identity is incomplete for ${name}@${version}`);
  const repository =
    typeof metadata.repository === "string" ? metadata.repository : metadata.repository?.url;
  const repositoryDirectory =
    typeof metadata.repository === "object" ? metadata.repository.directory : undefined;
  let repositoryMatches = false;
  try {
    if (repository) {
      const parsed = new URL(repository.replace(/^git\+/, ""));
      repositoryMatches =
        parsed.hostname === "github.com" &&
        parsed.pathname.replace(/\.git$/, "") === "/assistant-ui/assistant-ui";
    }
  } catch {
    repositoryMatches = false;
  }
  if (!repositoryMatches || repositoryDirectory !== directory)
    throw new Error(
      `npm repository identity does not match assistant-ui/assistant-ui ${directory} for ${name}@${version}`,
    );
  return metadata;
};

export const compareTaggedPackageConstraints = async (input: {
  names: string[];
  pinnedTree: Map<string, string>;
  candidateTree: Map<string, string>;
  fetcher: Fetcher;
}): Promise<Change[]> => {
  const changes: Change[] = [];
  for (const name of input.names) {
    const suffix = name.replace(/^@assistant-ui\//, "");
    const path = `packages/${suffix}/package.json`;
    const oldSha = input.pinnedTree.get(path);
    const newSha = input.candidateTree.get(path);
    if (!oldSha || !newSha)
      throw new Error(
        `${name}: package manifest missing from pinned or candidate tagged tree (${path})`,
      );
    const [oldPkg, newPkg] = await Promise.all([
      blobText(input.fetcher, oldSha).then((text) => JSON.parse(text) as PackageMetadata),
      blobText(input.fetcher, newSha).then((text) => JSON.parse(text) as PackageMetadata),
    ]);
    if (
      oldPkg.name !== name ||
      newPkg.name !== name ||
      typeof oldPkg.version !== "string" ||
      typeof newPkg.version !== "string"
    )
      throw new Error(`${path}: tagged package identity is invalid`);
    const [oldPublished, newPublished] = await Promise.all([
      npmVersion(input.fetcher, oldPkg.version, name, `packages/${suffix}`),
      npmVersion(input.fetcher, newPkg.version, name, `packages/${suffix}`),
    ]);
    // Tagged workspace ranges may be rewritten while publishing; exact-version
    // npm metadata is authoritative for the dependency constraints.
    for (const kind of ["dependencies", "peerDependencies"] as const) {
      const before = oldPublished[kind] ?? {};
      const after = newPublished[kind] ?? {};
      for (const dep of [...new Set([...Object.keys(before), ...Object.keys(after)])].sort()) {
        if (before[dep] !== after[dep])
          changes.push({
            path: `package:${name} → ${dep}`,
            kind: "dependency",
            detail: `${kind}: ${before[dep] ?? "undeclared"} → ${after[dep] ?? "undeclared"}`,
          });
      }
    }
  }
  return changes;
};

const tree = async (fetcher: Fetcher, commit: string): Promise<Map<string, string>> => {
  const result = await json<{ tree?: TreeEntry[]; truncated?: boolean }>(
    fetcher,
    `${github}/repos/assistant-ui/assistant-ui/git/trees/${commit}?recursive=1`,
  );
  if (!Array.isArray(result.tree) || result.truncated !== false)
    throw new Error(`Missing or truncated Git tree for ${commit}`);
  return new Map(
    result.tree.filter((entry) => entry.type === "blob").map((entry) => [entry.path, entry.sha]),
  );
};

const blobText = async (fetcher: Fetcher, sha: string): Promise<string> => {
  const result = await json<{ sha?: string; encoding?: string; content?: string }>(
    fetcher,
    `${github}/repos/assistant-ui/assistant-ui/git/blobs/${sha}`,
  );
  if (result.sha !== sha || result.encoding !== "base64" || typeof result.content !== "string")
    throw new Error(`Invalid Git blob response for ${sha}`);
  return Buffer.from(result.content.replace(/\n/g, ""), "base64").toString("utf8");
};

export const formattedDigest = async (
  source: string,
  filename: string,
  formatter: string,
): Promise<string> => {
  const directory = await mkdtemp(join(tmpdir(), "assistant-ui-upstream-"));
  const file = join(directory, filename.split("/").at(-1) ?? "source.tsx");
  try {
    await writeFile(file, source);
    const result = spawnSync(formatter, ["--write", file], { cwd: root, encoding: "utf8" });
    if (result.status !== 0)
      throw new Error(`Pinned Oxfmt failed for ${filename}: ${result.stderr || result.stdout}`);
    return createHash("sha256")
      .update(await readFile(file))
      .digest("hex");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
};

const registryItems = (source: string): Map<string, string> => {
  const result = new Map<string, string>();
  const fields = (object: string): string => {
    const arrayFields = [
      ...object.matchAll(
        /(dependencies|devDependencies|registryDependencies|radixDependencies|radixRegistryDependencies|baseDependencies|bundledRegistryDependencies|usesElements|usesHooks|usesUi):\s*\[([^\]]*)\]/g,
      ),
    ];
    const declaredFields = [
      ...object.matchAll(
        /\b(dependencies|devDependencies|registryDependencies|radixDependencies|radixRegistryDependencies|baseDependencies|bundledRegistryDependencies|usesElements|usesHooks|usesUi|usesSurfaces)\s*:/g,
      ),
    ];
    if (
      declaredFields.length !==
      arrayFields.length + [...object.matchAll(/\busesSurfaces\s*:\s*(?:true|false)/g)].length
    )
      throw new Error("Unrecognized registry dependency field shape");
    const arrays = arrayFields
      .map(
        (item) =>
          `${item[1]}=${[...item[2]!.matchAll(/["']([^"']+)["']/g)]
            .map((value) => value[1])
            .sort()
            .join(",")}`,
      )
      .sort()
      .join(";");
    const usesSurfaces = /usesSurfaces:\s*(true|false)/.exec(object)?.[1];
    return `${arrays}${usesSurfaces ? `;usesSurfaces=${usesSurfaces}` : ""}`;
  };
  for (const call of source.matchAll(/createElementRegistryItem\s*\(\s*\{/g)) {
    const start = call.index! + call[0].length - 1;
    let depth = 0;
    let quote = "";
    let escaped = false;
    let end = -1;
    for (let index = start; index < source.length; index += 1) {
      const character = source[index]!;
      if (quote) {
        if (escaped) escaped = false;
        else if (character === "\\") escaped = true;
        else if (character === quote) quote = "";
        continue;
      }
      if (character === '"' || character === "'" || character === "`") {
        quote = character;
        continue;
      }
      if (character === "{") depth += 1;
      if (character === "}" && --depth === 0) {
        end = index + 1;
        break;
      }
    }
    if (end < 0) continue;
    const object = source.slice(start, end);
    const file = /file:\s*["']([^"']+)["']/.exec(object)?.[1];
    if (file)
      result.set(
        `packages/ui/src/components/react/assistant-ui/elements/${file}`,
        `generated:${fields(object)};files=${file}`,
      );
  }
  const names = [...source.matchAll(/name:\s*["']([^"']+)["']/g)];
  for (const match of names) {
    const start = source.lastIndexOf("{", match.index);
    if (start < 0) continue;
    let depth = 0;
    let quote = "";
    let escaped = false;
    let end = -1;
    for (let index = start; index < source.length; index += 1) {
      const character = source[index]!;
      if (quote) {
        if (escaped) escaped = false;
        else if (character === "\\") escaped = true;
        else if (character === quote) quote = "";
        continue;
      }
      if (character === '"' || character === "'" || character === "`") {
        quote = character;
        continue;
      }
      if (character === "{") depth += 1;
      if (character === "}" && --depth === 0) {
        end = index + 1;
        break;
      }
    }
    if (end < 0) continue;
    const object = source.slice(start, end);
    const sourcePaths = [...object.matchAll(/\bsourcePath\s*:\s*["']([^"']+)["']/g)].map(
      (item) => item[1]!,
    );
    if ([...object.matchAll(/\bsourcePath\s*:/g)].length !== sourcePaths.length)
      throw new Error(`Registry item ${match[1]} has an unrecognized sourcePath shape`);
    if (sourcePaths.length === 0) continue;
    const prefix = "../../packages/ui/src/components/react/assistant-ui/";
    const files = sourcePaths.toSorted().join(",");
    for (const path of sourcePaths.filter((item) => item.startsWith(prefix)))
      result.set(
        `packages/ui/src/components/react/assistant-ui/${path.slice(prefix.length)}`,
        `${match[1]}:${fields(object)};files=${files}`,
      );
  }
  return result;
};

const relevantPackages = (pkg: Record<string, unknown>): string[] => {
  const dependencies = {
    ...(pkg.dependencies as Record<string, string>),
    ...(pkg.devDependencies as Record<string, string>),
    ...(pkg.overrides as Record<string, string>),
  };
  return [
    ...new Set([
      ...Object.keys(dependencies).filter(
        (name) => name.startsWith("@assistant-ui/") || name === "assistant-stream",
      ),
      "react",
      "react-dom",
      "next",
      "ai",
      "zod",
    ]),
  ].sort();
};

export const compareBaseline = async (input: {
  manifest: Manifest;
  pinned: PackageMetadata;
  candidate: PackageMetadata;
  pinnedTree: Map<string, string>;
  candidateTree: Map<string, string>;
  fetcher: Fetcher;
  formatter: string;
  packageJson: Record<string, unknown>;
  candidateCommit: string;
}): Promise<{ changes: Change[]; info: string[]; errors: string[] }> => {
  const changes: Change[] = [];
  const info: string[] = [];
  const errors: string[] = [];
  for (const entry of input.manifest.files) {
    const oldSha = input.pinnedTree.get(entry.upstreamPath);
    const newSha = input.candidateTree.get(entry.upstreamPath);
    const url = `https://github.com/assistant-ui/assistant-ui/blob/${input.candidateCommit}/${entry.upstreamPath}`;
    if (!oldSha) {
      errors.push(`${entry.upstreamPath}: pinned manifest path is missing from its tagged tree`);
      continue;
    }
    if (oldSha !== entry.upstreamBlob) {
      errors.push(
        `${entry.upstreamPath}: manifest blob ${entry.upstreamBlob} does not match pinned tag blob ${oldSha}`,
      );
      continue;
    }
    if (!newSha) {
      const movedTo = [...input.candidateTree].find(([, sha]) => sha === oldSha)?.[0];
      if (movedTo)
        changes.push({
          path: entry.upstreamPath,
          kind: "source",
          detail: `required source relocated to ${movedTo} (unchanged blob ${oldSha})`,
          url: `https://github.com/assistant-ui/assistant-ui/blob/${input.candidateCommit}/${movedTo}`,
        });
      else
        errors.push(
          `${entry.upstreamPath}: required source is missing from candidate tag ${input.candidate.version}`,
        );
      continue;
    }
    if (oldSha === newSha) {
      info.push(`${entry.upstreamPath}: unchanged (${newSha})`);
      continue;
    }
    try {
      const [oldText, newText] = await Promise.all([
        blobText(input.fetcher, oldSha),
        blobText(input.fetcher, newSha),
      ]);
      const [oldFormatted, newFormatted] = await Promise.all([
        formattedDigest(oldText, entry.upstreamPath, input.formatter),
        formattedDigest(newText, entry.upstreamPath, input.formatter),
      ]);
      if (oldFormatted === newFormatted)
        info.push(`${entry.upstreamPath}: formatting-only (${oldSha} → ${newSha}); ${url}`);
      else
        changes.push({
          path: entry.upstreamPath,
          kind: "source",
          detail: `${oldSha} → ${newSha}; substantive Oxfmt-normalized change`,
          url,
        });
    } catch (error) {
      errors.push(
        `${entry.upstreamPath}: unable to classify blobs: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  try {
    const [oldRegistrySha, newRegistrySha] = [
      input.pinnedTree.get("apps/registry/src/registry.ts"),
      input.candidateTree.get("apps/registry/src/registry.ts"),
    ];
    if (!oldRegistrySha || !newRegistrySha)
      throw new Error("tagged apps/registry/src/registry.ts missing");
    const [oldRegistry, newRegistry] = await Promise.all([
      blobText(input.fetcher, oldRegistrySha),
      blobText(input.fetcher, newRegistrySha),
    ]);
    const before = registryItems(oldRegistry);
    const after = registryItems(newRegistry);
    for (const entry of input.manifest.files) {
      const oldValue = before.get(entry.upstreamPath);
      const newValue = after.get(entry.upstreamPath);
      const registryUrl = `https://github.com/assistant-ui/assistant-ui/blob/${input.candidateCommit}/apps/registry/src/registry.ts`;
      if (!oldValue || !newValue)
        throw new Error(
          `${entry.upstreamPath}: manifest source could not be reconciled to a registry declaration (pinned ${oldValue ? "present" : "missing"}, candidate ${newValue ? "present" : "missing"})`,
        );
      if (oldValue !== newValue)
        changes.push({
          path: `registry:${entry.upstreamPath}`,
          kind: "registry",
          detail: `${oldValue} → ${newValue}`,
          url: registryUrl,
        });
    }
  } catch (error) {
    errors.push(
      `Tagged registry comparison failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  const oldRanges = new Map<string, string>();
  const newRanges = new Map<string, string>();
  for (const [name, range] of Object.entries(input.pinned.dependencies ?? {}))
    oldRanges.set(name, `dependency ${range}`);
  for (const [name, range] of Object.entries(input.pinned.peerDependencies ?? {}))
    oldRanges.set(name, `peer ${range}`);
  for (const [name, range] of Object.entries(input.candidate.dependencies ?? {}))
    newRanges.set(name, `dependency ${range}`);
  for (const [name, range] of Object.entries(input.candidate.peerDependencies ?? {}))
    newRanges.set(name, `peer ${range}`);
  const important = new Set(relevantPackages(input.packageJson));
  // Include every assistant-ui package installed by the application, plus runtimes
  // and framework packages whose published constraints can affect those adapters.
  for (const name of [...new Set([...oldRanges.keys(), ...newRanges.keys()])].sort()) {
    if (!important.has(name)) continue;
    const oldRange = oldRanges.get(name);
    const newRange = newRanges.get(name);
    if (oldRange !== newRange)
      changes.push({
        path: `package:@assistant-ui/react → ${name}`,
        kind: "dependency",
        detail: `${oldRange ?? "undeclared"} → ${newRange ?? "undeclared"}`,
      });
  }
  if (input.candidate.version !== input.pinned.version)
    info.push(
      `Published stable version advance ${input.pinned.version} → ${input.candidate.version}; version-only changes are informational.`,
    );
  return {
    changes: changes.sort((a, b) => a.path.localeCompare(b.path) || a.kind.localeCompare(b.kind)),
    info: info.sort(),
    errors: errors.sort(),
  };
};

export const formatReport = (report: Report, asJson = false): string =>
  asJson
    ? JSON.stringify(
        {
          ...report,
          info: summarize(report.info),
          changes: summarizeChanges(report.changes),
          errors: summarize(report.errors),
        },
        null,
        2,
      )
    : [
        `${report.status}: assistant-ui upstream drift`,
        `Pinned: @assistant-ui/react@${report.pinnedVersion} (${report.pinnedCommit})`,
        ...(report.candidateVersion
          ? [
              `Candidate: @assistant-ui/react@${report.candidateVersion} (${report.candidateCommit ?? "commit unavailable"})`,
            ]
          : []),
        ...summarize(report.info).map((item) => `INFO: ${item}`),
        ...summarizeChanges(report.changes).map(
          (item) =>
            `${report.status === "DRIFT" ? "DRIFT" : "CHANGE"}: ${item.path}: ${item.detail}${item.url ? `\n  ${item.url}` : ""}`,
        ),
        ...summarize(report.errors).map((item) => `ERROR: ${item}`),
        ...(report.status === "DRIFT" ? [`\n${remediation}`] : []),
        ...(report.status === "ERROR"
          ? [
              "Retry the check after GitHub/npm availability is restored; incomplete comparisons never pass.",
            ]
          : []),
      ].join("\n");

const REPORT_ITEM_LIMIT = 30;
const clip = (value: string): string => (value.length <= 500 ? value : `${value.slice(0, 497)}...`);
const summarize = <T>(items: T[]): T[] => {
  const shortened = items.map((item) => (typeof item === "string" ? (clip(item) as T) : item));
  return shortened.length <= REPORT_ITEM_LIMIT
    ? shortened
    : [
        ...shortened.slice(0, REPORT_ITEM_LIMIT),
        `${shortened.length - REPORT_ITEM_LIMIT} additional items omitted from this report.` as T,
      ];
};
const summarizeChanges = (items: Change[]): Change[] => {
  const shortened = items.map((item) => ({
    ...item,
    path: clip(item.path),
    detail: clip(item.detail),
    ...(item.url ? { url: clip(item.url) } : {}),
  }));
  return shortened.length <= REPORT_ITEM_LIMIT
    ? shortened
    : [
        ...shortened.slice(0, REPORT_ITEM_LIMIT),
        {
          path: "(summary)",
          kind: "summary",
          detail: `${shortened.length - REPORT_ITEM_LIMIT} additional changes omitted from this report.`,
        },
      ];
};

export const exitCode = (status: Report["status"]): 0 | 1 => (status === "PASS" ? 0 : 1);

export const runCheck = async (
  fetcher: Fetcher,
  manifest: Manifest,
  packageJson: Record<string, unknown>,
  formatter: string,
): Promise<Report> => {
  const pinnedVersion =
    packageJson.dependencies &&
    (packageJson.dependencies as Record<string, string>)["@assistant-ui/react"];
  const pinnedParsed = typeof pinnedVersion === "string" ? parseVersion(pinnedVersion) : undefined;
  const report: Report = {
    status: "ERROR",
    pinnedVersion: pinnedParsed?.version ?? "invalid",
    pinnedCommit: manifest.upstream.commit,
    changes: [],
    errors: [],
    info: [],
  };
  try {
    if (!pinnedParsed || !/^[0-9a-f]{40}$/.test(manifest.upstream.commit))
      throw new Error("Invalid pinned package version or manifest commit");
    const pages = await listReleases(fetcher);
    const selected = newestReactRelease(pages);
    report.candidateVersion = selected.version.version;
    const candidateTag = `@assistant-ui/react@${selected.version.version}`;
    const [candidateCommit, pinnedNpm, candidateNpm, pinnedCommit] = await Promise.all([
      resolveCommit(fetcher, candidateTag),
      npmVersion(fetcher, pinnedParsed.version),
      npmVersion(fetcher, selected.version.version),
      resolveCommit(fetcher, `@assistant-ui/react@${pinnedParsed.version}`),
    ]);
    report.candidateCommit = candidateCommit;
    if (pinnedCommit !== manifest.upstream.commit)
      throw new Error(
        `Pinned tag resolves to ${pinnedCommit}, not manifest commit ${manifest.upstream.commit}`,
      );
    if (
      pinnedNpm.version !== pinnedParsed.version ||
      candidateNpm.version !== selected.version.version
    )
      throw new Error("Git tag and npm publication identity disagree");
    const [pinnedTree, candidateTree] = await Promise.all([
      tree(fetcher, pinnedCommit),
      tree(fetcher, candidateCommit),
    ]);
    if (selected.version.version === pinnedParsed.version && candidateCommit !== pinnedCommit)
      throw new Error("Pinned release tag was retargeted to a different commit");
    if (compareVersions(selected.version, pinnedParsed) < 0)
      throw new Error("Selected stable release is older than pinned version");
    const compared = await compareBaseline({
      manifest,
      pinned: pinnedNpm,
      candidate: candidateNpm,
      pinnedTree,
      candidateTree,
      fetcher,
      formatter,
      packageJson,
      candidateCommit,
    });
    compared.changes.push(
      ...(await compareTaggedPackageConstraints({
        names: relevantPackages(packageJson).filter(
          (name) =>
            (name.startsWith("@assistant-ui/") && name !== "@assistant-ui/react") ||
            name === "assistant-stream",
        ),
        pinnedTree,
        candidateTree,
        fetcher,
      })),
    );
    compared.changes.sort((a, b) => a.path.localeCompare(b.path) || a.kind.localeCompare(b.kind));
    report.changes = compared.changes;
    report.info = compared.info;
    report.errors = compared.errors;
    report.status = report.errors.length ? "ERROR" : report.changes.length ? "DRIFT" : "PASS";
  } catch (error) {
    report.errors.push(error instanceof Error ? error.message : String(error));
  }
  return report;
};

const run = async (): Promise<number> => {
  const manifest = JSON.parse(
    await readFile(join(root, "docs/assistant-ui-source.json"), "utf8"),
  ) as Manifest;
  const packageJson = JSON.parse(await readFile(join(root, "package.json"), "utf8")) as Record<
    string,
    unknown
  >;
  const formatterPath = join(root, "node_modules/.bin/oxfmt");
  const formatterVersion = spawnSync(formatterPath, ["--version"], { cwd: root, encoding: "utf8" });
  if (
    formatterVersion.status !== 0 ||
    !formatterVersion.stdout.includes(manifest.formatter.split("@").at(-1) ?? "")
  )
    throw new Error(
      `Expected pinned ${manifest.formatter}; got ${formatterVersion.stdout || formatterVersion.stderr}`,
    );
  const fetcher: Fetcher = (url) => {
    const headers: Record<string, string> = {
      accept: url.startsWith(github) ? "application/vnd.github+json" : "application/json",
    };
    if (url.startsWith(github) && process.env.GITHUB_TOKEN)
      headers.authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
    return fetch(url, { headers, signal: AbortSignal.timeout(10_000) });
  };
  const report = await runCheck(fetcher, manifest, packageJson, formatterPath);
  console.log(formatReport(report, process.argv.includes("--json")));
  return exitCode(report.status);
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = await run();
  } catch (error) {
    console.error(
      formatReport(
        {
          status: "ERROR",
          pinnedVersion: "unknown",
          pinnedCommit: "unknown",
          changes: [],
          errors: [error instanceof Error ? error.message : String(error)],
          info: [],
        },
        process.argv.includes("--json"),
      ),
    );
    process.exitCode = 1;
  }
}
