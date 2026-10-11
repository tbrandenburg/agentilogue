# assistant-ui upgrade baseline

Copied-source drift is checked offline by `bun run assistant-ui:drift-check`.
The machine-readable baseline in [assistant-ui-source.json](assistant-ui-source.json)
pins the one copied upstream component and its intentional local patch. The
check formats temporary copies with the repository's installed Oxfmt version,
then compares SHA-256 digests; it does not rewrite source files or fetch GitHub
in CI. Files elsewhere under `components/assistant-ui/` are app-owned UI and
are not included in this upstream-copy scope.

The copied Thread bundle is sourced from `assistant-ui/assistant-ui` at
`@assistant-ui/react@0.15.25` (tag commit `dc840613f1edbe9cebcc01d0112add781aca0449`).
Its registry `thread` item and transitive registry dependencies are the source
of truth; do not refresh these files from the live registry or `main`.

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

The intentional `thread.aui.tsx` patchset is limited to:

1. `ThreadComponents.ComposerActionLeft`, a generic optional composer accessory
   rendered beside the attachment control while preserving stock markup when
   absent.

The baseline's upstream provenance is the pinned Git blob for
`packages/ui/src/components/react/assistant-ui/elements/thread.aui.tsx` at the
commit above. The manifest records the normalized local source digest after
applying the approved `ComposerActionLeft` patch. A digest mismatch reports the
path, expected and actual digests, provenance, and the approval procedure.

The welcome-suggestion condition now matches the pinned registry source: it
checks only for a new chat with an empty composer. The former local
`s.composer.canSend` guard hid suggestions when an otherwise-ready composer was
empty. Send-enabled suggestions now rely on the core runtime send policy,
including `isSendDisabled`, enforced by assistant-ui's suggestion trigger
([upstream fix #8941](https://github.com/assistant-ui/assistant-ui/pull/8941),
included in the `@assistant-ui/core@0.3.25` line pinned here at `0.3.26`).

Session tabs, running-state reporting, the SessionControls provider/slot,
ModelContextBridge, model catalog/validation, and RunTarget policy live outside
Thread. On the next upgrade, start with the released registry bundle and check
for an official composer accessory slot before reapplying that one patch.

## Release upgrade procedure

1. Check the desired published assistant-ui release and peer dependency ranges;
   do not use `main` or the live registry as the source baseline.
2. Create a clean worktree, update exact package versions/overrides in a
   dedicated change, and run `bun install --frozen-lockfile`.
3. Retrieve the registry source from that release's exact Git tag commit. Record
   its repository, commit, source path, and Git blob SHA in
   `assistant-ui-source.json`; refresh only files confirmed to be copied.
4. Reapply only reviewed local functional patches and list each patch, rationale,
   and issue in the manifest. Run `bun run assistant-ui:drift-check` to record
   the formatted SHA-256 for the reviewed result. A digest change without an
   accompanying source/provenance and patch review is not an approval.
5. Run `bun run format`, `bun run lint`, `bun run test`, `bun run typecheck`,
   and `bun run build`, then validate the app's primary chat flow before merging.
