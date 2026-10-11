# Issue #47: assistant-ui compatibility assessment

**Decision: NO-GO for a dependency or lockfile change.** Retain the current pins. The observed version lag does not establish incompatibility, and this assessment did not identify a concrete compatibility failure that justifies risking the working chat and native opencode paths.

## Evidence collected

### Actual declarations, lock resolution, and installed packages

`package.json` declares exact assistant-ui package pins: `@assistant-ui/react@0.15.25`, `@assistant-ui/ai-sdk@0.0.11`, `@assistant-ui/react-markdown@0.14.19`, `@assistant-ui/react-opencode@0.2.30`, and `@assistant-ui/next@0.0.24`; it also pins `assistant-stream@0.3.49` and overrides core/store/tap to `0.3.26`/`0.3.19`/`0.9.22` (`package.json:19-59`). The declarations for `ai`, Next, React, and React DOM are ranges, so their actual versions must be read from the lock/install, not inferred from package.json.

`bun.lock` resolves `ai@7.0.127`, `@ai-sdk/react@4.0.130`, Next `16.3.8`, React/React DOM `19.3.0`, and `react-markdown@10.1.0`, alongside the exact assistant-ui and override versions above (`bun.lock:64-82`, `502`, `508`, `722`, `750`). `bun pm ls --all` independently reported those same installed versions. The working tree's installed package set is therefore not silently lagging behind this lock for the packages assessed.

Published npm package metadata confirms the current pins are in declared peer ranges:

| Installed/resolved package | Published compatibility evidence | Assessment |
| --- | --- | --- |
| `@assistant-ui/react@0.15.25` | Peers `react`/`react-dom: ^18 || ^19`; dependencies permit core `^0.3.24`, store `^0.3.17`, tap `^0.9.21`, stream `^0.3.48`. | Resolved React 19.3.0 and the overrides fit. |
| `@assistant-ui/ai-sdk@0.0.11` | Peer `ai: ^7.0.101`, React `^18 || ^19`; dependencies permit core `^0.3.24`, store `^0.3.17`, tap `^0.9.21`, stream `^0.3.48`, and `@ai-sdk/react: ^4.0.126`. | Resolved ai 7.0.127 and @ai-sdk/react 4.0.130 fit. |
| `@assistant-ui/react-markdown@0.14.19` | Peer `@assistant-ui/react: ^0.15.0`, React `^18 || ^19`; depends on `react-markdown: ^10.1.0`. | Both resolved packages fit. |
| `@assistant-ui/react-opencode@0.2.30` | Peers `@assistant-ui/react: ^0.15.0`, React `^18 || ^19`; depends on `@assistant-ui/core: ^0.3.26`, store `^0.3.19`, and `@opencode-ai/sdk: ^1.18.35`. | Current React, adapter, overrides, and SDK satisfy declared ranges. The repo's documented browser evidence for this exact adapter also records title restoration and no observed summarize requests/native HTTP 400s (`docs/assistant-ui-upgrades.md:12-23`). |
| `@assistant-ui/core@0.3.26`, store `0.3.19`, tap `0.9.22`, `assistant-stream@0.3.49` | Lock metadata records core peers store `^0.3.19` and tap `^0.9.22`; store peer tap `^0.9.22`; React peers `^18 || ^19`; stream peers accept AI SDK 6 or 7. | The exact override set is internally range-compatible with the resolved React/AI versions. |
| `@assistant-ui/next@0.0.24` | Exact package is present in both lock and install; Context7's Next.js route-handler documentation confirms route modules have a constrained export contract and generated route-type checks are separate from ordinary TypeScript checks. | No reported incompatibility surfaced in this dependency-only review; this package still needs application build/generated-route validation for any proposed change. |

These are peer/dependency compatibility checks, not proof that every runtime flow passes E2E. Notably, they establish that the current set is coherent by published package constraints; version numbers alone do not establish a need to upgrade.

### Released upgrade candidates do not establish a safe replacement

Official npm metadata reports newer stable releases `@assistant-ui/react@0.15.27`, `@assistant-ui/ai-sdk@0.0.12`, and `@assistant-ui/next@0.0.25`. The candidate React package still declares React 18/19 and moves minimum assistant-ui dependencies to core `^0.3.26`, store `^0.3.19`, tap `^0.9.22`, stream `^0.3.49`; candidate ai-sdk 0.0.12 still peers on AI SDK 7 and moves its minimum `@ai-sdk/react` to `^4.0.133`, alongside assistant-cloud `^0.2.6` and other assistant-ui minima. These releases are evidence that upgrades exist, not that replacing the current stack is behavior-preserving. In particular, an upgrade would move the AI SDK adapter dependency and could change the registry Thread source baseline.

The copied Thread's recorded source of truth is the released `@assistant-ui/react@0.15.25` tag at commit `dc840613f1edbe9cebcc01d0112add781aca0449` (`docs/assistant-ui-upgrades.md:3-6`). No registry refresh was made. A newer package version alone is not evidence that copied registry files can be mixed with this baseline without re-review and drift validation.

## Why NO-GO

1. There is no observed peer-range conflict in the installed/locked package set and no concrete issue #47 incompatibility demonstrated by the evidence collected.
2. A replacement candidate's published metadata is not enough to establish the required coherent, behaviorally safe set. Proving that would require adjusting the exact package/override set, obtaining the lock, validating a frozen install outside ancestor dependency fallback, and exercising the affected runtimes/build routes.
3. Available space was only **884 MB** before creating the requested worktree and **879 MB** afterward; the filesystem reports 100% used. This is not a safe margin for package installation or a Next production build. Neither was run. The required isolated frozen-lockfile acceptance and runtime E2E therefore cannot be claimed.
4. In the absence of a demonstrated defect, the current published peer compatibility and existing runtime evidence favor retaining working pins rather than taking an unvalidated upgrade risk.

## Scope and validation record

- Read the full issue and comments using `gh issue view 47 --comments --json title,body,comments`; issue #47 had no comments.
- Read-only inspection: `package.json`, `bun.lock`, `docs/assistant-ui-upgrades.md`; `bun pm ls --all`; published npm metadata via `npm view`.
- Context7 references consulted: `/assistant-ui/assistant-ui` for AI SDK v7 runtime selection and release guidance; `/vercel/next.js` for route exports and generated route-type validation.
- No dependency, lockfile, app/runtime/UI, CI, copied Thread, or upgrade-baseline files were changed. No install, build, or E2E was run due to disk capacity.
- `docs/assistant-ui-upgrades.md` remains untouched; the work is a separate issue report to avoid overlap with #41.

## References

- [Issue #47](https://github.com/tbrandenburg/agentilogue/issues/47)
- [Assistant UI package source and release tags](https://github.com/assistant-ui/assistant-ui/tags)
- [npm metadata: @assistant-ui/react](https://www.npmjs.com/package/@assistant-ui/react?activeTab=versions)
- [npm metadata: @assistant-ui/ai-sdk](https://www.npmjs.com/package/@assistant-ui/ai-sdk?activeTab=versions)
- [npm metadata: @assistant-ui/next](https://www.npmjs.com/package/@assistant-ui/next?activeTab=versions)
- [Next.js route handlers](https://nextjs.org/docs/app/api-reference/file-conventions/route)
