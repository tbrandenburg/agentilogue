import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  compareTaggedPackageConstraints,
  compareBaseline,
  compareVersions,
  exitCode,
  formatReport,
  listReleases,
  newestReactRelease,
  parseVersion,
  releaseVersion,
  resolveCommit,
  npmVersion,
  runCheck,
} from "./assistant-ui-upstream-check";

const manifest = {
  formatter: "oxfmt@0.68.0",
  upstream: { repository: "assistant-ui/assistant-ui", commit: "a".repeat(40) },
  files: [
    {
      path: "thread.aui.tsx",
      upstreamPath: "packages/ui/src/components/react/assistant-ui/elements/thread.aui.tsx",
      upstreamBlob: "b".repeat(40),
    },
  ],
};
const packageJson = {
  dependencies: {
    "@assistant-ui/react": "0.15.31",
    "@assistant-ui/ai-sdk": "0.0.11",
    react: "19.3.0",
  },
  overrides: { "@assistant-ui/core": "0.3.31" },
};
const packageData = (version: string, dependencies = { "@assistant-ui/core": "^0.3.31" }) => ({
  name: "@assistant-ui/react",
  version,
  repository: {
    url: "git+https://github.com/assistant-ui/assistant-ui.git",
    directory: "packages/react",
  },
  dependencies,
  peerDependencies: { react: "^18 || ^19" },
  dist: { tarball: `https://registry.npmjs.org/a/-/a-${version}.tgz`, integrity: "sha512-valid" },
});
const registrySource = `export const registry = [{ name: "thread", files: [{ sourcePath: "../../packages/ui/src/components/react/assistant-ui/elements/thread.aui.tsx" }], registryDependencies: ["button"] }];`;
const response = (value: unknown, status = 200): Response =>
  new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });

describe("assistant-ui upstream release selection", () => {
  it("uses semantic version ordering and ignores other packages, drafts, prereleases, and unpublished releases", () => {
    assert.equal(parseVersion("0.15.100")?.version, "0.15.100");
    assert.ok(compareVersions(parseVersion("0.15.100")!, parseVersion("0.15.99")!) > 0);
    const releases = [
      {
        tag_name: "@assistant-ui/react@0.15.99",
        draft: false,
        prerelease: false,
        published_at: "2026-01-01",
      },
      {
        tag_name: "@assistant-ui/react@0.15.100",
        draft: false,
        prerelease: false,
        published_at: "2025-01-01",
      },
      {
        tag_name: "@assistant-ui/core@99.0.0",
        draft: false,
        prerelease: false,
        published_at: "2026-01-01",
      },
      {
        tag_name: "@assistant-ui/react@9.0.0",
        draft: true,
        prerelease: false,
        published_at: "2026-01-01",
      },
      {
        tag_name: "@assistant-ui/react@8.0.0",
        draft: false,
        prerelease: true,
        published_at: "2026-01-01",
      },
      {
        tag_name: "@assistant-ui/react@7.0.0",
        draft: false,
        prerelease: false,
        published_at: null,
      },
    ];
    assert.equal(newestReactRelease([releases]).version.version, "0.15.100");
    assert.equal(releaseVersion(releases[3]!), undefined);
  });

  it("follows every release page and fails on HTTP errors or corrupt responses", async () => {
    const calls: string[] = [];
    const fetcher = async (url: string) => {
      calls.push(url);
      const page = Number(new URL(url).searchParams.get("page"));
      return response(
        page === 1
          ? Array.from({ length: 100 }, (_, index) => ({
              tag_name: `x${index}`,
              draft: false,
              prerelease: false,
              published_at: null,
            }))
          : [],
      );
    };
    assert.equal((await listReleases(fetcher)).length, 2);
    assert.deepEqual(
      calls.map((url) => new URL(url).searchParams.get("page")),
      ["1", "2"],
    );
    await assert.rejects(
      listReleases(async () => response({ error: true })),
      /Malformed releases page/,
    );
    await assert.rejects(
      listReleases(async () => response({}, 429)),
      /429/,
    );
  });

  it("paginates beyond the first stable candidate before selecting the newest version", async () => {
    const release = (tag_name: string) => ({
      tag_name,
      draft: false,
      prerelease: false,
      published_at: "2026-01-01",
    });
    const calls: number[] = [];
    const pages = [
      Array.from({ length: 100 }, (_, index) =>
        release(index === 0 ? "@assistant-ui/react@0.15.99" : `other-${index}`),
      ),
      [release("@assistant-ui/react@0.15.100")],
    ];
    const found = await listReleases(async (url) => {
      const page = Number(new URL(url).searchParams.get("page"));
      calls.push(page);
      return response(pages[page - 1] ?? []);
    });
    assert.deepEqual(calls, [1, 2]);
    assert.equal(newestReactRelease(found).version.version, "0.15.100");
  });

  it("selects the semantic maximum even when GitHub orders a newer tag on a later page", () => {
    const release = (tag_name: string) => ({
      tag_name,
      draft: false,
      prerelease: false,
      published_at: "2026-01-01",
    });
    assert.equal(
      newestReactRelease([
        [release("@assistant-ui/react@0.15.99")],
        [release("@assistant-ui/react@0.15.100")],
      ]).version.version,
      "0.15.100",
    );
  });

  it("dereferences annotated tags to an immutable commit and rejects non-commit tags", async () => {
    const fetcher = async (url: string) =>
      url.includes("git/ref/")
        ? response({ object: { type: "tag", sha: "c".repeat(40) } })
        : response({ object: { type: "commit", sha: "d".repeat(40) } });
    assert.equal(await resolveCommit(fetcher, "@assistant-ui/react@0.15.31"), "d".repeat(40));
    await assert.rejects(
      resolveCommit(async () => response({ object: { type: "tree", sha: "d".repeat(40) } }), "bad"),
      /immutable commit/,
    );
  });

  it("requires the published npm name, version, repository, and immutable archive identity", async () => {
    const metadata = packageData("0.15.31");
    assert.equal((await npmVersion(async () => response(metadata), "0.15.31")).version, "0.15.31");
    await assert.rejects(
      npmVersion(async () => response({ ...metadata, version: "0.15.30" }), "0.15.31"),
      /identity is incomplete/,
    );
    await assert.rejects(
      npmVersion(
        async () =>
          response({
            ...metadata,
            repository: { url: "https://example.invalid", directory: "packages/react" },
          }),
        "0.15.31",
      ),
      /repository identity/,
    );
  });

  it("compares installed adapter constraints from pinned/candidate tagged package provenance", async () => {
    const oldPackage = {
      name: "@assistant-ui/ai-sdk",
      version: "0.0.11",
    };
    const newPackage = { ...oldPackage, version: "0.0.15" };
    const oldSha = "1".repeat(40);
    const newSha = "2".repeat(40);
    const metadata = (version: string, peer: string) => ({
      name: "@assistant-ui/ai-sdk",
      version,
      repository: {
        url: "git+https://github.com/assistant-ui/assistant-ui.git",
        directory: "packages/ai-sdk",
      },
      peerDependencies: { ai: peer },
      dist: {
        tarball: `https://registry.npmjs.org/a/-/a-${version}.tgz`,
        integrity: "sha512-valid",
      },
    });
    const blobs = new Map([
      [oldSha, JSON.stringify(oldPackage)],
      [newSha, JSON.stringify(newPackage)],
    ]);
    const packages = new Map([
      ["0.0.11", metadata("0.0.11", "^6")],
      ["0.0.15", metadata("0.0.15", "^7")],
    ]);
    const result = await compareTaggedPackageConstraints({
      names: ["@assistant-ui/ai-sdk"],
      pinnedTree: new Map([["packages/ai-sdk/package.json", oldSha]]),
      candidateTree: new Map([["packages/ai-sdk/package.json", newSha]]),
      fetcher: async (url) => {
        const hash = url.split("/").at(-1)!;
        const blob = blobs.get(hash);
        if (blob)
          return response({
            sha: hash,
            encoding: "base64",
            content: Buffer.from(blob).toString("base64"),
          });
        const version = url.split("/").at(-1)!;
        const published = packages.get(version);
        return published ? response(published) : response({}, 404);
      },
    });
    assert.equal(result.length, 1);
    assert.equal(result[0]!.path, "package:@assistant-ui/ai-sdk → ai");
    assert.match(result[0]!.detail, /peerDependencies: \^6 → \^7/);
  });

  it("includes the pinned assistant-stream override in package constraint comparisons", async () => {
    const oldSha = "3".repeat(40);
    const newSha = "4".repeat(40);
    const metadata = (version: string, peer: string) => ({
      name: "assistant-stream",
      version,
      repository: {
        url: "git+https://github.com/assistant-ui/assistant-ui.git",
        directory: "packages/assistant-stream",
      },
      peerDependencies: { ai: peer },
      dist: {
        tarball: `https://registry.npmjs.org/a/-/a-${version}.tgz`,
        integrity: "sha512-valid",
      },
    });
    const blobs = new Map([
      [oldSha, JSON.stringify({ name: "assistant-stream", version: "0.3.54" })],
      [newSha, JSON.stringify({ name: "assistant-stream", version: "0.3.60" })],
    ]);
    const packages = new Map([
      ["0.3.54", metadata("0.3.54", "^6")],
      ["0.3.60", metadata("0.3.60", "^7")],
    ]);
    const result = await compareTaggedPackageConstraints({
      names: ["assistant-stream"],
      pinnedTree: new Map([["packages/assistant-stream/package.json", oldSha]]),
      candidateTree: new Map([["packages/assistant-stream/package.json", newSha]]),
      fetcher: async (url) => {
        const id = url.split("/").at(-1)!;
        const blob = blobs.get(id);
        if (blob)
          return response({
            sha: id,
            encoding: "base64",
            content: Buffer.from(blob).toString("base64"),
          });
        const published = packages.get(id);
        return published ? response(published) : response({}, 404);
      },
    });
    assert.equal(result.length, 1);
    assert.match(result[0]!.detail, /peerDependencies: \^6 → \^7/);
  });
});

describe("assistant-ui upstream baseline comparison", () => {
  it("passes unchanged sources, reports semantic advances, and detects substantive source changes", async () => {
    const source = 'const ready = "yes";\n';
    const registry = `export const registry = [{ name: "thread", files: [{ sourcePath: "../../packages/ui/src/components/react/assistant-ui/elements/thread.aui.tsx" }], registryDependencies: ["button"] }];`;
    const blobFetch = async (url: string) => {
      const sha = url.endsWith("e".repeat(40)) ? "e".repeat(40) : "b".repeat(40);
      return response({
        sha,
        encoding: "base64",
        content: Buffer.from(sha === "e".repeat(40) ? registry : source).toString("base64"),
      });
    };
    const same = await compareBaseline({
      manifest,
      pinned: packageData("0.15.31"),
      candidate: packageData("0.15.31"),
      pinnedTree: new Map([
        [manifest.files[0]!.upstreamPath, "b".repeat(40)],
        ["apps/registry/src/registry.ts", "e".repeat(40)],
      ]),
      candidateTree: new Map([
        [manifest.files[0]!.upstreamPath, "b".repeat(40)],
        ["apps/registry/src/registry.ts", "e".repeat(40)],
      ]),
      fetcher: blobFetch,
      formatter: "node_modules/.bin/oxfmt",
      packageJson,
      candidateCommit: "f".repeat(40),
    });
    assert.deepEqual(same.changes, []);
    assert.deepEqual(same.errors, []);

    const changed = await compareBaseline({
      manifest,
      pinned: packageData("0.15.31"),
      candidate: packageData("0.15.100"),
      pinnedTree: new Map([
        [manifest.files[0]!.upstreamPath, "b".repeat(40)],
        ["apps/registry/src/registry.ts", "e".repeat(40)],
      ]),
      candidateTree: new Map([
        [manifest.files[0]!.upstreamPath, "f".repeat(40)],
        ["apps/registry/src/registry.ts", "e".repeat(40)],
      ]),
      fetcher: async (url) => {
        const sha = url.endsWith("e".repeat(40))
          ? "e".repeat(40)
          : url.endsWith("b".repeat(40))
            ? "b".repeat(40)
            : "f".repeat(40);
        const text =
          sha === "e".repeat(40)
            ? registrySource
            : sha === "b".repeat(40)
              ? 'const ready = "yes";\n'
              : 'const ready = "no";\n';
        return response({ sha, encoding: "base64", content: Buffer.from(text).toString("base64") });
      },
      formatter: "node_modules/.bin/oxfmt",
      packageJson,
      candidateCommit: "f".repeat(40),
    });
    assert.ok(changed.info.some((item) => item.includes("advance 0.15.31 → 0.15.100")));
    assert.ok(
      changed.changes.some((item) => item.kind === "source" && item.url?.includes("f".repeat(40))),
    );
  });

  it("classifies formatting-only source updates and actionable missing paths", async () => {
    const old = 'const ready="yes";';
    const formatted = 'const ready = "yes";\n';
    const tree = new Map([
      [manifest.files[0]!.upstreamPath, "b".repeat(40)],
      ["apps/registry/src/registry.ts", "e".repeat(40)],
    ]);
    const result = await compareBaseline({
      manifest,
      pinned: packageData("0.15.31"),
      candidate: packageData("0.15.31"),
      pinnedTree: tree,
      candidateTree: new Map([
        [manifest.files[0]!.upstreamPath, "f".repeat(40)],
        ["apps/registry/src/registry.ts", "e".repeat(40)],
      ]),
      fetcher: async (url) => {
        const sha = url.endsWith("e".repeat(40))
          ? "e".repeat(40)
          : url.endsWith("b".repeat(40))
            ? "b".repeat(40)
            : "f".repeat(40);
        const text =
          sha === "e".repeat(40) ? registrySource : sha === "b".repeat(40) ? old : formatted;
        return response({ sha, encoding: "base64", content: Buffer.from(text).toString("base64") });
      },
      formatter: "node_modules/.bin/oxfmt",
      packageJson,
      candidateCommit: "f".repeat(40),
    });
    assert.deepEqual(result.changes, []);
    assert.ok(result.info.some((item) => item.includes("formatting-only")));
    const missing = await compareBaseline({
      manifest,
      pinned: packageData("0.15.31"),
      candidate: packageData("0.15.31"),
      pinnedTree: tree,
      candidateTree: new Map([["apps/registry/src/registry.ts", "e".repeat(40)]]),
      fetcher: async () =>
        response({
          sha: "e".repeat(40),
          encoding: "base64",
          content: Buffer.from(registrySource).toString("base64"),
        }),
      formatter: "node_modules/.bin/oxfmt",
      packageJson,
      candidateCommit: "f".repeat(40),
    });
    assert.match(missing.errors[0]!, /required source is missing from candidate tag/);
  });

  it("detects registry/dependency-only drift, ignores unrelated package data, and sorts reports deterministically", async () => {
    const registryOld = `export const registry = [{ name: "thread", files: [{ sourcePath: "../../packages/ui/src/components/react/assistant-ui/elements/thread.aui.tsx" }], registryDependencies: ["button"] }];`;
    const registryNew = `export const registry = [{ name: "thread", files: [{ sourcePath: "../../packages/ui/src/components/react/assistant-ui/elements/thread.aui.tsx" }, { sourcePath: "../../packages/ui/src/components/react/assistant-ui/utils/new-support.ts" }], registryDependencies: ["dialog"] }];`;
    const oldSha = "e".repeat(40);
    const newSha = "f".repeat(40);
    const path = manifest.files[0]!.upstreamPath;
    const result = await compareBaseline({
      manifest,
      pinned: packageData("0.15.31"),
      candidate: packageData("0.15.32", { "@assistant-ui/core": "^0.4.0" }),
      pinnedTree: new Map([
        [path, "b".repeat(40)],
        ["apps/registry/src/registry.ts", oldSha],
      ]),
      candidateTree: new Map([
        [path, "b".repeat(40)],
        ["apps/registry/src/registry.ts", newSha],
      ]),
      fetcher: async (url) => {
        const sha = url.endsWith(oldSha) ? oldSha : newSha;
        return response({
          sha,
          encoding: "base64",
          content: Buffer.from(sha === oldSha ? registryOld : registryNew).toString("base64"),
        });
      },
      formatter: "node_modules/.bin/oxfmt",
      packageJson,
      candidateCommit: "a".repeat(40),
    });
    assert.ok(result.changes.some((item) => item.kind === "registry"));
    assert.ok(
      result.changes.some(
        (item) => item.kind === "registry" && item.detail.includes("utils/new-support.ts"),
      ),
    );
    assert.ok(
      result.changes.some((item) => item.kind === "dependency" && item.detail.includes("^0.4.0")),
    );
    assert.deepEqual(
      result.changes.map((item) => item.path),
      result.changes.map((item) => item.path).sort(),
    );
    assert.equal(
      formatReport({
        status: "DRIFT",
        pinnedVersion: "0.15.31",
        pinnedCommit: "a".repeat(40),
        changes: result.changes,
        errors: [],
        info: result.info,
      }),
      formatReport({
        status: "DRIFT",
        pinnedVersion: "0.15.31",
        pinnedCommit: "a".repeat(40),
        changes: result.changes,
        errors: [],
        info: result.info,
      }),
    );
  });

  it("fails closed when a manifest source cannot be reconciled to tagged registry data", async () => {
    const path = manifest.files[0]!.upstreamPath;
    const tree = new Map([
      [path, "b".repeat(40)],
      ["apps/registry/src/registry.ts", "e".repeat(40)],
    ]);
    const result = await compareBaseline({
      manifest,
      pinned: packageData("0.15.31"),
      candidate: packageData("0.15.31"),
      pinnedTree: tree,
      candidateTree: tree,
      fetcher: async () =>
        response({
          sha: "e".repeat(40),
          encoding: "base64",
          content: Buffer.from("export const registry = [];\n").toString("base64"),
        }),
      formatter: "node_modules/.bin/oxfmt",
      packageJson,
      candidateCommit: "f".repeat(40),
    });
    assert.ok(result.errors.some((error) => error.includes("could not be reconciled")));
  });

  it("bounds long human and JSON reports while keeping a deterministic omission summary", () => {
    const report = {
      status: "PASS" as const,
      pinnedVersion: "0.15.31",
      pinnedCommit: "a".repeat(40),
      changes: [],
      errors: [],
      info: Array.from({ length: 80 }, (_, index) => `unchanged-${index}`),
    };
    const text = formatReport(report);
    assert.ok(text.includes("50 additional items omitted"));
    assert.ok(!text.includes("unchanged-79"));
    assert.ok(formatReport(report, true).length < 10_000);
  });

  it("keeps omitted JSON changes structurally valid and clearly summarized", () => {
    const report = {
      status: "DRIFT" as const,
      pinnedVersion: "0.15.31",
      pinnedCommit: "a".repeat(40),
      changes: Array.from({ length: 40 }, (_, index) => ({
        path: `source-${index}.tsx`,
        kind: "source",
        detail: "substantive change",
      })),
      errors: [],
      info: [],
    };
    const json = JSON.parse(formatReport(report, true)) as typeof report;
    assert.equal(json.changes.length, 31);
    assert.equal(json.changes.at(-1)?.kind, "summary");
    assert.match(json.changes.at(-1)?.detail ?? "", /10 additional changes omitted/);
    assert.ok(!formatReport(report).includes("undefined"));
  });

  it("returns nonzero ERROR reports for incomplete upstream data", async () => {
    const report = await runCheck(
      async () => response({}, 503),
      manifest,
      packageJson,
      "node_modules/.bin/oxfmt",
    );
    assert.equal(report.status, "ERROR");
    assert.match(report.errors[0]!, /503/);
    assert.match(formatReport(report), /incomplete comparisons never pass/);
    assert.equal(exitCode("ERROR"), 1);
    assert.equal(exitCode("DRIFT"), 1);
    assert.equal(exitCode("PASS"), 0);
  });
});
