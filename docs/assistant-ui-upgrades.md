# assistant-ui upgrade baseline

Copied-source drift is checked offline by `bun run assistant-ui:drift-check`.
The machine-readable baseline in [assistant-ui-source.json](assistant-ui-source.json)
tracks 19 verified copied registry components and support helpers, including `attachment.aui.tsx`,
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
`@assistant-ui/react@0.15.31` (tag commit `d8124e7b427021d977abf9aabc9a057705a81644`).
Each manifest entry records its exact registry path and Git blob SHA. Do not
refresh these files from the live registry or `main`.

## Released upstream drift gate

Every pull request also runs the networked, read-only
`make assistant-ui-upstream-check` (`bun run assistant-ui:upstream-check`),
with a manual `workflow_dispatch` entry point. This is separate from the offline
copied-source digest gate: it checks the newest published stable
`@assistant-ui/react` GitHub Release, not whichever unrelated package was most
recently released in the monorepo. The checker paginates release results,
semantically sorts stable versions, resolves lightweight or annotated tags to
immutable commits, and verifies npm's exact package name/version, repository,
and `packages/react` publication identity. It does not consult `main` or the
mutable deployed registry.

The checker compares every manifest source path and its Git blob against the
pinned tag, reconciles each source with the tagged
`apps/registry/src/registry.ts` declarations (unrecognized or missing entries
fail closed), and compares published dependency/peer ranges for the React
package and every installed `@assistant-ui/*` package against their versions in
the same pinned and candidate tagged trees. Package metadata is read from the
exact npm versions and must identify its corresponding monorepo package
directory; missing manifests or unverifiable publications fail closed. Git
blob SHA changes alone do not prove a functional change: both source versions
are normalized with the manifest-pinned Oxfmt. Formatting-only changes and version-only advances are
informational; substantive copied-source, registry/dependency, or relevant
constraint changes produce `DRIFT`. Incomplete provenance, missing required
data, malformed responses, API failures and formatter failures produce
`ERROR`. Both statuses exit nonzero. The report is deterministic and contains
tagged source links and same-PR remediation; long item lists are summarized
deterministically and `--json` is available for machine consumers.

To resolve a reported drift, review the tagged upstream diff and package
compatibility first. If accepted, update exact package pins/overrides and copied
sources together, then update manifest provenance. Run `bun install
--frozen-lockfile`, `bun run assistant-ui:drift-check`, formatting, lint,
tests, typecheck, build, and the relevant AI SDK, ACP, and native opencode
runtime/E2E checks before rerunning the upstream gate. The compatibility and
cross-runtime acceptance evidence from [PR #52](https://github.com/tbrandenburg/agentilogue/pull/52)
is a reference, not a substitute for validating the actual upgrade. A newer
adapter version is not automatically required when the existing adapter is
compatible. There is no automatic source or lockfile update and no waiver
framework; unresolved upstream changes remain visible for a reviewed same-PR
resolution.

The workflow only adds a failing check; it cannot configure repository
protection. A maintainer must add the exact **`assistant-ui upstream drift`**
job context as a required status check on `main`'s ruleset/branch protection.
Until that administrator setting is verified, do not claim merge blocking is
enforced. The existing `Models` and offline `assistant-ui copied-source drift`
checks remain independent.

The exact package baseline is `@assistant-ui/react@0.15.31`,
`@assistant-ui/ai-sdk@0.0.11`, `@assistant-ui/react-markdown@0.14.24`, and
`@assistant-ui/next@0.0.24`.

The experimental native opencode lane separately pins
`@assistant-ui/react-opencode@0.2.30` and `@opencode-ai/sdk@1.18.35`.
Root overrides pin `@assistant-ui/core@0.3.31`, `@assistant-ui/store@0.3.22`,
and `@assistant-ui/tap@0.9.24`; `assistant-stream` is pinned and overridden
to one shared `0.3.54` version.
The adapter upgrade removed the app's temporary title-request workaround and
its dedicated tests. Browser evidence for `0.2.30` confirms generated server
titles match official thread metadata/list-item titles and restore after reload,
with zero summarize requests or native HTTP 400 responses observed.
The same-mount recovery failure and prior `0.2.29` evidence are retained in the
[issue #34 report](spikes/2026-10-opencode-local-boundary-issue-34.md).
The copied inventory now matches the `0.15.31` release tag after formatting:
**zero functional Thread patches and zero approved copied-source patches**.
The former `ComposerActionLeft` patch from
[PR #17](https://github.com/tbrandenburg/agentilogue/pull/17) is replaced by the
released `ThreadComponents.ComposerExtra` slot from
[upstream PR #9972](https://github.com/assistant-ui/assistant-ui/pull/9972).
Application/provider state remains in `AgentilogueSessionControlsSlot` and its
provider, outside the stock Thread. Without the slot, stock Thread does not add
an action-start wrapper. With it, Attach and the accessory share that wrapper;
Send, Cancel and dictation stay in the separate stock action group.

The refresh includes stock attachment state, ref-bearing collapsible,
safe-href, model-selection and isomorphic-effect helpers. Stock Thread also adds
Resume and image-file rendering; the matching markdown copy needs the stable
`memoizeMarkdownComponents` export, provided by `@assistant-ui/react-markdown@0.14.24`.

## Released source versus live registry

The immutable published release tag's registry source and definition are the
source of truth for this refresh. At inspection, both
`https://r.assistant-ui.com/thread.json` and its `/base/thread.json` variant
declared `@assistant-ui/react@^0.15.30` and **lacked `ComposerExtra`**. Neither
live JSON bundle matched the selected release tag; neither was consumed.
The release has no attached generated registry bundle. Resolve source paths
from `apps/registry/src/registry.ts` at the pinned commit, verify their Git
blobs, and use those exact released sources rather than a moving deployment.

## Capability and acceptance boundaries

Resume is stock checkpoint continuation, not a new application run mode.
The pinned native opencode adapter and the application's ACP/AI SDK setup do
not opt into `canResume`; cancelled or uncertain native outcomes therefore do
not expose Resume. Native requests still use the existing guarded client.
The upstream external-store runtime requires explicit `canResume` plus
`onResume`, and blocks continuation when the thread is disabled, running or
loading. Its Resume policy is separate from `isSendDisabled`; a future adapter
opting into checkpoints must review that policy instead of assuming a send-only
gate disables Resume.

The focused composer test parses markup rendered by the real Thread/runtime:
it checks optional/default structure, accessory order, separate Send/Cancel,
disabled sending and checkpoint opt-in. It is not a hydrated browser layout or
cross-runtime acceptance test. The coordinator's
[browser acceptance report](/docs/spikes/issue-46-47-e2e.md) records passing
narrow-viewport wrapping/focus, Attach, permissions, cancellation and cross-runtime
isolation checks; voice/dictation is not advertised by these runtimes. Repeat
that gate on later upgrades. Do not restore a copied-Thread patch if the upstream
slot layout fails it; report the narrow upstream regression.

For each listed file, the manifest records the upstream path/blob and the
formatted local digest. A digest mismatch reports the local path, expected and
actual digests, upstream provenance, and approved patches.

The welcome-suggestion condition now matches the pinned registry source: it
checks only for a new chat with an empty composer. The former local
`s.composer.canSend` guard hid suggestions when an otherwise-ready composer was
empty. Send-enabled suggestions now rely on the core runtime send policy,
including `isSendDisabled`, enforced by assistant-ui's suggestion trigger
([upstream fix #8941](https://github.com/assistant-ui/assistant-ui/pull/8941),
included in the `@assistant-ui/core@0.3.25` line and retained in `0.3.31`).

Session tabs, running-state reporting, the SessionControls provider/slot,
ModelContextBridge, model catalog/validation, and RunTarget policy are
app-owned. Keep them composed through the official `ComposerExtra` slot rather
than patching copied source on a future upgrade.

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
