# Issue #37: Native recovery guidance and bounded outage investigation

## Result

The recovery UX is verified: a failed status/history recheck displays exactly:

> Connection could not recover. Reload this page and reconnect by entering the OpenCode server password to restore this session.

The existing **Outcome unknown** and **Retrying the prompt can repeat side effects** warning remain visible during recovery, including after Acknowledge. A successful status/history check clears recovery guidance; incomplete history still means unknown. Requests retain their five-second timeout and latest-check ownership. No transcript mutation, automatic reload, prompt resend, password persistence, transport replacement, or adapter fork was added.

The bounded investigation reproduced the same-mount stall. Reload/password re-entry remains the verified fallback. Short idle recovery passed in the final trial but failed in two preceding trials; short active-run recovery failed. Seamless reconnect is therefore not a reliable guarantee.

## Research before implementation

Re-read `gh issue view 37 --repo tbrandenburg/agentilogue --json body,comments,title`; comments were empty, including after the interruption. Read project/global instructions, runtime/development/detach skills, and the [prior evidence](/docs/spikes/2026-10-opencode-local-boundary-issue-34.md).

- [Official OpenCode server documentation](https://opencode.ai/docs/server/): loopback serve, explicit CORS, Basic auth, status/history endpoints and SSE.
- [Official assistant-ui quickstart](https://www.assistant-ui.com/docs/runtimes/opencode/quickstart.md): stable authenticated client, SSE runtime, `initialSessionId` restoration.
- Context7 `/anomalyco/opencode`: request signals and event subscription cancellation. Returned examples included newer/dev APIs; these were orientation, not proof about the pinned v1 implementation.
- Installed adapter `src/OpenCodeEventSource.ts:168-229`: adapter calls SDK subscription with `sseMaxRetryAttempts: 1`, emits reconnect before consuming the stream, and uses bounded backoff. Reconnect notifications can trigger reattachment, but source inspection alone does not establish why browser requests stall. No demonstrated upstream lifecycle adjustment justified changing the transport.

## Reproduction

From this issue worktree, with the frozen root dependency installation symlinked as `node_modules`, installed Playwright discoverable in the workspace, system Chrome, OpenCode `1.18.35`, and an existing `OPENAI_API_KEY` environment variable:

```sh
node tests/e2e/native-recovery.mjs
# Optional unique ports / explicit pinned binary:
RECOVERY_APP_PORT=14371 RECOVERY_SERVER_PORT=14372 RECOVERY_OPENCODE_BIN=opencode node tests/e2e/native-recovery.mjs
```

Allow up to ten minutes for compilation/model/browser operations. The script verifies free ports and version pins before starting anything. It uses fresh HOME/XDG config/data/state/cache and project directories, a random Basic password held in memory, `openai/gpt-4.1` with `openai/gpt-4.1-mini` for titles, and a private Playwright context. No provider credentials are read or logged. An inherited provider key is passed to the disposable server. The app has two **keepMounted app chat tabs**, each authenticated; after reload the script reconnects both before another outage. This is not two browser windows.

The script starts private detached process groups via Node's `detached: true` (setsid), captures exact PIDs, kills only owned groups, and verifies the exact processes and port listeners are gone. Output contains timings, endpoint paths and counts, without headers, passwords, prompt bodies or provider keys. Disposable logs/profile paths are printed for local diagnosis. App `.next` output is confined to this worktree.

Next `dev --webpack` is deliberate: Turbopack rejected the permitted out-of-root dependency symlink. The initial startup trial failed and stopped its owned PIDs. Playwright's default browser revision was absent; system Chrome avoids downloading dependencies. No tooling configuration or shared installation was changed.

## Final real-browser evidence

Final completed command: `node tests/e2e/native-recovery.mjs`, tool timeout **600000ms**. Versions: adapter **0.2.30**, SDK **1.18.35**, CLI/authenticated health **1.18.35**, Next **16.3.8**, Chrome **154.0.8037.92**, Playwright **1.63.0**. Disposable profile/project were fresh for this run.

| Check                                | Result | Evidence                                                                                                                                                                              |
| ------------------------------------ | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Normal native sessions               | PASS   | Two native app tabs completed independent exact-marker prompts.                                                                                                                       |
| Short idle outage continuation       | PASS   | Same mounted page completed an explicitly submitted continuation; 16922ms including shutdown, 2s delay, startup and model reply. Earlier trials failed within their 15s reply window. |
| Short active-run same-mount recovery | FAIL   | 2s intentional downtime; authenticated raw health ready after 8205ms total. Recheck/history stalled.                                                                                  |
| Long active-run same-mount recovery  | FAIL   | 16s intentional downtime; authenticated raw health ready after 28140ms total. Recheck/history stalled.                                                                                |
| Long-outage guidance                 | PASS   | Exact guidance, partial marker and unknown/side-effect warning visible by 16589ms while server remained stopped.                                                                      |
| Failed recheck after restart         | PASS   | Guidance and unknown warning survived Acknowledge in each active-run trial.                                                                                                           |
| Reload/password restoration          | PASS   | Empty password input required re-entry; same persisted mappings and partial transcript restored after both active-run outages. History returned HTTP 200 in 1003ms / 1137ms.          |
| Honest outcome / duplication         | PASS   | Recheck retained unknown after interrupted real `sleep 90` tool; five total explicit prompts, no outage/reload resend; password absent from browser storage.                          |
| Teardown                             | PASS   | Exact owned PIDs 1416729, 1416761, 1417258, 1417321, 1417541 were absent; `ss` showed no listeners on 14371/14372.                                                                    |

Both active-run trials waited 12 seconds after restart/recheck before probing. Primary-origin browser health timed out in **5001ms / 5000ms**, while `localhost` returned **HTTP 200 in 38ms / 14ms**. Each trial had **12 unanswered reattach requests**: session metadata, messages, status, permission, question and event for each of two runtimes. OS `ss` counted **7 matching TCP rows** including probes; this is not a six-slot browser connection proof. CDP had no response connection IDs for those unanswered requests. Observed successful response protocol was HTTP/1.1.

Final network totals: **551 requests, 5 prompt POSTs, 402 connection-refused failures, 10 aborted requests, 28 without response/failure at the final sample**. The last count includes live SSE and sampling races; it must not be interpreted as 28 stuck sockets. Prompt POSTs may return 204 and later report stream abortion; counting POST issuance avoids confusing that with duplication.

Earlier full trial also verified fallback but inadvertently had only one authenticated runtime after reload before the long outage. It was superseded by the corrected runs that reconnect both tabs. A later corrected run hit the harness's 300s timeout during final restoration; it was inconclusive and tore down owned services. The final ten-minute invocation completed with the output `PASS guidance/reload assertions; same-mount investigation results reported separately` and successful teardown.

## Findings and limits

Reattachment attempts cluster during outages, and failure is origin-specific in the measured active-run trials. The cause remains unconfirmed: stale SSE, browser scheduling/connection reuse, SDK subscription behavior and server behavior have not been causally isolated. Do not describe this as proven socket exhaustion. Short outages can fail too; duration is not a sufficient predictor.

The small production change adds one recovery flag and extracts the existing read-only recheck into a directly testable helper. The larger change is an explicit opt-in real-browser evidence script, not production machinery. Its size earns its place by exercising real process loss, two mounted runtimes, no resend, in-memory password restoration and exact teardown without mocks. No new shared abstraction is needed.

AI SDK, ACP, native controls/session/storage and coordinator tooling files have no edits. Existing deterministic tests cover those paths; real model smoke of AI SDK/ACP was not repeated for this UI-only native change. Production-build parity, other browsers, remote-host access and the transport mechanism remain untested. Integration with #38 must be validated by the coordinator.

## Validation

### Integrated coordinator verification

`node tests/e2e/native-recovery.mjs` completed against the combined #37/#38 changes after independent review strengthened readiness and recovery assertions. Normal two-tab sessions, failed-recheck guidance (including acknowledgement), and reload/password/transcript/unknown/no-resend checks passed. Short idle continuation **failed** its 15-second reply window. Active-run same-mount recovery **failed** after both 2-second and 16-second downtime: primary-origin health timed out in 5001ms while the alternate loopback alias returned HTTP 200 in 17ms. Restored history returned HTTP 200 in 2089ms and 1790ms. Five explicit prompt POSTs were recorded; exact owned processes stopped and ports 14371/14372 were free. These results supersede any assumption that short outages reliably recover, without establishing a transport root cause.

The selector proof also passed on this integrated checkout, including real AI SDK/ACP responses, native approvals/cancellation and reload. The coordinator moved API handler factories outside Next route modules so generated route validation can run rather than deleting validators.

```sh
bun run format app/opencode-native-status.tsx lib/opencode-native-recheck.ts tests/opencode-native-recovery.test.ts tests/e2e/native-recovery.mjs docs/spikes/issue-37-native-recovery.md
bun run lint
bun run typecheck
bun test ./tests
git diff --check
```

Focused SDK tests exercise status/history HTTP failure, transport failure, both request timeouts, interrupted/terminal history, busy status and superseded ownership. Existing recheck scheduler tests remain in place. Browser outcome investigations deliberately report FAIL independently of guidance/fallback assertions; a zero script exit never implies seamless reconnect.
