# assistant-ui upgrade baseline

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
2. `s.composer.canSend` in the new-chat suggestion condition so suggestions
   cannot bypass agentilogue's fail-closed send state.

Session tabs, running-state reporting, the SessionControls provider/slot,
ModelContextBridge, model catalog/validation, and RunTarget policy live outside
Thread. On the next upgrade, start with the released registry bundle, check for
an official composer accessory slot, then reapply or remove these two patches.
