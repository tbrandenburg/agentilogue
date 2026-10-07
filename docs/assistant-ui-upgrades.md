# assistant-ui upgrade baseline

The copied Thread bundle is sourced from `assistant-ui/assistant-ui` at
`@assistant-ui/react@0.15.25` (tag commit `dc840613f1edbe9cebcc01d0112add781aca0449`).
Its registry `thread` item and transitive registry dependencies are the source
of truth; do not refresh these files from the live registry or `main`.

The exact package baseline is `@assistant-ui/react@0.15.25`,
`@assistant-ui/ai-sdk@0.0.11`, `@assistant-ui/react-markdown@0.14.19`, and
`@assistant-ui/next@0.0.24`.

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
