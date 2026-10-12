# assistant-ui upgrade baseline

Copied-source drift is checked offline by `bun run assistant-ui:drift-check`.
The machine-readable baseline in [assistant-ui-source.json](assistant-ui-source.json)
tracks 14 verified copied registry components, including `attachment.aui.tsx`,
`tool-fallback.aui.tsx`, and `model-selector.tsx`. The two session-control
components are app-owned. Do not infer ownership from filenames or `.aui` suffixes:
inventory each local element against the pinned registry source.

The check formats temporary copies with the repository's installed Oxfmt version
and compares SHA-256 digests. It verifies local files against a reviewed digest
and reports the pinned source path/blob; it does **not** fetch or independently
compare upstream source in CI. It does not rewrite source files or access GitHub.
Verify exact upstream blobs when explicitly refreshing the baseline, as described
in the release procedure below.

The copied elements are sourced from `assistant-ui/assistant-ui` at
`@assistant-ui/react@0.15.25` (tag commit `dc840613f1edbe9cebcc01d0112add781aca0449`).
Each manifest entry records its exact registry path and Git blob SHA. Do not
refresh these files from the live registry or `main`.

The exact package baseline is `@assistant-ui/react@0.15.25`,
`@assistant-ui/ai-sdk@0.0.11`, `@assistant-ui/react-markdown@0.14.19`, and
`@assistant-ui/next@0.0.24`.

The experimental native opencode lane separately pins
`@assistant-ui/react-opencode@0.2.30` and `@opencode-ai/sdk@1.18.35`.
Root overrides pin `@assistant-ui/core@0.3.26`, `@assistant-ui/store@0.3.19`,
and `@assistant-ui/tap@0.9.22`; `assistant-stream` is pinned and overridden
to one shared `0.3.49` version.
The adapter upgrade removed the app's temporary title-request workaround and
its dedicated tests. Browser evidence for `0.2.30` confirms generated server
titles match official thread metadata/list-item titles and restore after reload,
with zero summarize requests or native HTTP 400 responses observed.
The same-mount recovery failure and prior `0.2.29` evidence are retained in the
[issue #34 report](spikes/2026-10-opencode-local-boundary-issue-34.md).
These dependency changes do not refresh the copied Thread baseline.

The only intentional functional patch in the current copied-element inventory is:

`ThreadComponents.ComposerActionLeft`, a generic optional composer accessory
rendered beside the attachment control while preserving stock markup when absent.
It was introduced by [PR #17](https://github.com/tbrandenburg/agentilogue/pull/17),
not issue #41. The issue #41 welcome-suggestion guard matched upstream after its
removal and is not an approved local patch.

For each listed file, the manifest records the upstream path/blob and the
formatted local digest. A digest mismatch reports the local path, expected and
actual digests, upstream provenance, and approved patches.

The welcome-suggestion condition now matches the pinned registry source: it
checks only for a new chat with an empty composer. The former local
`s.composer.canSend` guard hid suggestions when an otherwise-ready composer was
empty. Send-enabled suggestions now rely on the core runtime send policy,
including `isSendDisabled`, enforced by assistant-ui's suggestion trigger
([upstream fix #8941](https://github.com/assistant-ui/assistant-ui/pull/8941),
included in the `@assistant-ui/core@0.3.25` line pinned here at `0.3.26`).

Session tabs, running-state reporting, the SessionControls provider/slot,
ModelContextBridge, model catalog/validation, and RunTarget policy are
app-owned. On the next upgrade, start with the released registry bundle and
check for an official composer accessory slot before reapplying the PR #17 patch.

## Release upgrade procedure

1. Check the desired published assistant-ui release and peer dependency ranges;
   do not use `main` or the live registry as the source baseline.
2. Create a clean worktree, update exact package versions/overrides in a
   dedicated change, and run `bun install --frozen-lockfile`.
3. Fetch the exact upstream commit for the explicit comparison step:
   `git fetch --no-tags https://github.com/assistant-ui/assistant-ui.git <commit>`.
   For every copied file, verify its manifest blob against
   `git ls-tree <commit> <upstream-path>` and `git hash-object` of the exact
   `git show <commit>:<upstream-path>` bytes. Compare those sources with local
   files after formatting both with the pinned Oxfmt version. Review and explain
   every functional difference; do not treat the local digest as proof of
   upstream equivalence.
4. Update the manifest's exact commit/path/blob for every verified copy. Reapply
   only reviewed local functional patches and record their rationale/provenance.
   Run `bun run assistant-ui:drift-check` to record the formatted local SHA-256.
   CI remains offline and checks this reviewed digest only.
5. Run `bun run format`, `bun run lint`, `bun run test`, `bun run typecheck`,
   and `bun run build`, then validate the app's primary chat flow before merging.
