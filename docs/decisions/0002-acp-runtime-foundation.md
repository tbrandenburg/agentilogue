# ADR 0002: Keep the official ACP SDK foundation

**Decision: KEEP `@agentclientprotocol/sdk@1.7.0` (ACP v1).** Evaluated published `acpx@0.21.0`. [Issue #59](https://github.com/tbrandenburg/agentilogue/issues/59)'s foundation decision unblocks [#60](https://github.com/tbrandenburg/agentilogue/issues/60); it does not certify untested acceptance scenarios. No provider factory, backend changes, or dependency migration is needed for KEEP.

## Bounded comparison

Research checked the [published npm manifest](https://registry.npmjs.org/acpx/0.21.0), [tarball](https://registry.npmjs.org/acpx/-/acpx-0.21.0.tgz) (SHA-1 `18c7a995316b4a158626a0782d974b38ebdf3d47`), [runtime declarations](https://unpkg.com/acpx@0.21.0/dist/runtime.d.ts), [permissions](https://acpx.sh/permissions.html), [shared ownership](https://acpx.sh/shared-sessions.html), and Context7 `/openclaw/acpx`. Published artifacts take precedence over potentially newer website documentation.

| Concern             | Existing SDK lane                                                                     | Published acpx runtime                                                                                                                                                                                                                                                      |
| ------------------- | ------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Permission identity | Exact offered IDs; rejects stale/duplicate/foreign decisions                          | Host `undefined`/exception falls back to policy. Safe embedding needs `permissionMode: "deny-all"`, `nonInteractivePermissions: "deny"`, no approving per-tool policy, and exact `{ outcome: "selected", optionId }`; kind-based selection can fall back to `allow_always`. |
| Client authority    | Advertises `{}`; no client FS/terminal handlers                                       | FS/terminal default enabled; explicitly disable both. Neither approach sandboxes agent-native tools.                                                                                                                                                                        |
| Ownership/storage   | In-memory conversation binding, server-owned process configuration, one leased prompt | In-process `createAcpRuntime` accepts a custom memory store: persistence is not mandatory. Adds session records, handles, checkpoints, retained connections, and turn queues. Shared runtime/file store/queue workers are outside scope.                                    |
| Observation         | Atomic snapshots, contiguous sequences, independent detach/reconnect                  | In-process API has no `watchSession`; `getStatus` is not a transcript snapshot. `closeStream` detaches delivery, not work. App materialization/queues/reconnect remain necessary.                                                                                           |
| Outcomes            | Native stop mapping; process loss means `unknown` and retained lease                  | Turn result exposes completed/cancelled/failed plus native result/error, not the app's unknown/lease contract. Candidate child-loss/reconnect was not certified.                                                                                                            |
| Compatibility       | Frozen SDK 1.7.0 under Bun 1.3.9                                                      | MIT, Node `>=22.13.0`; tested under Node 24.15.0, not certified under Bun. No ACP v2 adopted.                                                                                                                                                                               |

Six direct dependencies: `@agentclientprotocol/sdk ^1.5.0`, `@openclaw/fs-safe ^0.26.7`, `commander ^15.0.0`, `skillflag ^0.2.1`, `tsx ^4.23.15`, `zod ^4.6.5`. The scratch install resolved respectively **1.9.0, 0.26.13, 15.0.0, 0.2.1, 4.23.15, 4.6.7**: candidate proof does not establish compatibility with the app's SDK 1.7.0/Zod 4.4.2.

## Size and decision

Counts include comments/blank lines, excluding tests, fixtures, upstream components, and docs. These seven inspected lane files are not a whole-repository source count.

| File                                      |    Before | After KEEP | Responsibility                                                                       |
| ----------------------------------------- | --------: | ---------: | ------------------------------------------------------------------------------------ |
| `lib/agent/opencode/acp-client.ts`        |       106 |        106 | Spawn, initialize/new/load, replay suppression, permission/cancel callbacks, cleanup |
| `lib/agent/opencode/provider.ts`          |       437 |        437 | Admission, sessions/leases, snapshots, control races, outcomes/retention             |
| `lib/agent/opencode/update-projection.ts` |        79 |         79 | Message/tool identity and interleaving                                               |
| `lib/agent/http-handlers.ts`              |       173 |        173 | Origin/schema boundary and independent observation                                   |
| `app/opencode-session.tsx`                |       355 |        355 | assistant-ui runtime and controls                                                    |
| `app/opencode-observer.ts`                |        72 |         72 | Bounded reconnect                                                                    |
| `app/opencode-projection.ts`              |       226 |        226 | Sequenced observations to UI state                                                   |
| **Total**                                 | **1,448** |  **1,448** | ACP-specific backend subset: **622**                                                 |

The plausible replacement seam is the **106-line client**, not the entire client/provider pair. Deleting it leaves **1,342 inspected lines** before adding acpx store/handle adaptation, event projection, exact-option bridging, stop mapping, and shutdown ownership. This is a retained-responsibility estimate, not a claim that a hypothetical migration keeps every line verbatim.

**Stop at the size/complexity gate:** no demonstrated smaller implementation replaces those app obligations. This is not a claim that acpx is unsafe. **Production impact: 0 handwritten source LOC changed; 0 dependencies added/removed; manifest/lockfile unchanged.** Reconsider only when a concrete provider need or versioned runtime demonstrates materially less glue without unwanted state.

## Versioned real proof

Frozen install, format/lint/typecheck, **130 tests in 23 files**, production Next **16.3.8** build, and copied-source checks passed. Tested opencode **1.18.35** came from a scratch pinned install; global **v2.0.28** was excluded. Projects and HOME/XDG storage were disposable; credential values were not read or logged.

- `bun run opencode:acp-proof "$PROJECT" 'Reply only ACP_BASELINE_59. Remember the marker CONTEXT_59.' --turn 'What marker did I ask you to remember? Reply only the marker.'`: protocol 1, two `end_turn` results, context preserved. This script always launches a real agent, but implements FS callbacks unlike production; it is not proof of the production authority boundary.
- Scratch Node acpx probe against the real agent: context, absent/throwing/unoffered host-decision denial, exact allow-once file creation, and detach without cancel passed. No candidate browser matrix, late/cancel-racing response, child-loss/retry, or Bun certification is claimed.
- Scratch probe importing the unchanged production provider: session/load context and replay suppression, distinct conversations, denial/no write, invalid/foreign/duplicate rejection, contiguous snapshot reconnect, and owned-child death to unknown/blocked retry passed. An ambiguous context prompt was clarified before the passing rerun; no product fix was made.
- `TMPDIR=/tmp/opencode UPGRADE_OPENCODE_BIN="$BINARY_DIR/node_modules/.bin/opencode" UPGRADE_APP_PORT=14591 UPGRADE_SERVER_PORT=14592 bun tests/assistant-ui-upgrade-proof.ts`: real production browser ACP text/approved write/receipt/pending-approval Stop, AI SDK, and authenticated native smoke passed. Chromium **153.0.8010.12**, assistant-ui **0.15.31**, AI SDK adapter **0.0.11**, native adapter **0.2.30**. Owned services stopped and proof ports were free afterward.

### Browser acceptance and remaining boundaries

Sanitized reports are preserved under `.playwright-mcp/issue-59-baseline-report.json`, `.playwright-mcp/issue-59-agent-gaps/`, and `.playwright-mcp/issue-59-coordinator-gaps/` (ignored local artifacts). Preserve report summaries in the implementation PR before removing evaluation worktrees. The coordinator's generic upgrade proof passed AI SDK/ACP but timed out waiting five seconds for native Model availability; it is not an overall passing run. Separate dedicated production-native safety/feature acceptance subsequently passed; its outage/recovery failures remain tracked under #61/#65, not reclassified as passes here.

The supplemental agent and coordinator each ran `bun /tmp/opencode/issue-59-proof/browser-gaps.ts` against their isolated production checkouts: **seven required scenarios passed**, plus preflight, page-error and teardown assertions (**10 PASS, 0 FAIL** per final run). Browser requests/events and actual disposable file effects were observed without response interception.

| Scenario                              | Coordinator result                                                                                         |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Follow-up context                     | PASS: same native session, remembered marker                                                               |
| Deny/stale/duplicate/foreign controls | PASS: 404/409 rejection, one denial dispatch, no forbidden write                                           |
| Streaming Stop                        | PASS: native terminal `cancelled`                                                                          |
| Observer reconnect                    | PASS: replacement snapshot sequence 444; 2,627 contiguous subsequent events through 3071; no second prompt |
| Two simultaneous ACP tabs             | PASS: distinct sessions, approved A file present, denied B file absent, foreign reply rejected             |
| Exact child loss                      | PASS: unknown, cleared permissions, rejected late reply/retry, no forbidden file                           |
| Live caller boundary                  | PASS: malformed/spawn-setting injections 400; untrusted/cross-origin 403; no child spawn                   |

Exact captured process identities were absent after cleanup and ports 14593/14594 were free. Preliminary supplemental harness failures are preserved: the maintained SSE decoder cancels upstream input at `[DONE]`, so evidence checks terminal run frames rather than incorrectly requiring HTTP EOF. No expanded auth, isolation, sandbox, persistence, or durable-reconnect guarantee is implied. The native same-mounted recovery limitation and #65's second-tab fallback failure remain outside this unchanged ACP foundation decision.
