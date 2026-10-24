# Issues #47 → #46: released-stack browser acceptance

**WORKING for the tested upgrade scope.** The coordinator executed the real
production-build proof on 2026-10-23, finishing at **20:17:41 UTC**. This is not
native opencode production approval or a claim that outage recovery is fixed.
The same real proof passed again in the fresh isolated checkout at
**20:23:35 UTC**, with identical aggregate runtime request/error counts.

## Reproduce

From a fresh checkout outside ancestor dependency trees:

```sh
bun install --frozen-lockfile
bun run format
bun run lint
bun run test
NEXT_TELEMETRY_DISABLED=1 bun run build
bun run typecheck
bun run assistant-ui:drift-check

UPGRADE_OPENCODE_BIN=/absolute/path/to/opencode-1.18.35 \
  UPGRADE_BROWSER_CHANNEL=chrome \
  bun tests/assistant-ui-upgrade-proof.ts
```

The executable must be a disposable **opencode 1.18.35** installation. The
machine's global v2 CLI is not interchangeable with this SDK/server generation.
Inherit an OpenAI key with access to `gpt-4.1-mini`; never put it in arguments or
reports. Node runs `next start`, matching the app's normal production path.
Allow a 15-minute command timeout. The proof spends real model tokens, performs
real approvals and creates synthetic files only in its disposable project.

Default ports **14461/14462** are checked before either service starts. Occupied,
duplicate, invalid and shared ports **3000/5173/4096** fail closed; existing
processes are never terminated to free them. `--preflight` checks prerequisites
without starting services. `--ui-only` is an explicitly partial, non-model proof;
it cannot satisfy runtime acceptance. `UPGRADE_APP_MODE=dev` is diagnostic only.

## Evidence

- [Stage/version/timestamp report](/docs/spikes/assets/issue-46-47-e2e.json)
- [Aggregate network counts](/docs/spikes/assets/issue-46-47-network-counts.json)
- [Isolated-checkout repeat](/docs/spikes/assets/issue-46-47-isolated-e2e.json)
- [Isolated aggregate counts](/docs/spikes/assets/issue-46-47-isolated-network-counts.json)
- [AI SDK composer at 390×844](/docs/spikes/assets/issue-46-ai-mobile.png)
- [Native reload/unknown-outcome UI](/docs/spikes/assets/issue-46-native-reloaded.png)

Accepted execution: Bun **1.3.9**, Node **24.15.0**, Chrome **154.0.8037.92**,
Playwright **1.63.0**, Next **16.3.8**, assistant-ui React **0.15.31**, AI SDK
adapter **0.0.11**, native adapter **0.2.30**, native SDK/server **1.18.35**.
The [compatibility matrix](/docs/spikes/issue-47-assistant-ui-compatibility.md)
records the remaining exact packages, dependency ranges and intentional splits.

| Area            | Verified real behavior                                                                                                                                                                                                                                           |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| None            | Welcome suggestion visible; suggestion/Enter cannot mutate; Send disabled; no assistant message or Resume.                                                                                                                                                       |
| Narrow composer | Control, shell and page bounds at 390×844; Attach precedes the accessory; keyboard opens Run with; a hit-tested blank shell-padding click restores input focus. Send/Stop remain usable.                                                                         |
| AI SDK          | Welcome suggestion sends once with the chosen model; real PNG upload and reply; partial streamed text, model lock, background running state after switching to ACP, independent Stop and no prompt resend.                                                       |
| ACP             | Independent text reply after AI cancellation; approved write produces exact file content and receipt; cancellation occurs with a new turn's enabled pending approval, closes it without replying, and reports confirmed cancellation. No AI model/agent leakage. |
| Native          | Wrong password rejected before a prompt; authenticated official model/agent discovery; effective selection verified in server user and assistant records; selectors lock after the first message.                                                                |
| Native tools    | Exact approved write and receipt; approved `sleep 60` observed running on the server before Stop; one abort and server idle; unknown outcome represented honestly when terminal evidence is absent.                                                              |
| Native reload   | Password re-entry required; same session mapping/transcript and generated server title restored; no prompt replay; password absent from session/local storage.                                                                                                   |
| Teardown        | Captured owned service groups/descendants stopped; proof ports free. Coordinator independently found zero remaining version-matched CLI processes and no listeners on either proof port.                                                                         |

Observed network totals: **3 AI SDK chat requests, 5 ACP mutations, 3 native
prompts, 1 native abort, 0 runtime HTTP failures, 0 browser page errors**. The
intentional wrong-password rejection is tested separately from runtime failures.

## Clean install, source and review gates

The coordinator repeated frozen installation, format/lint, **130 tests across
23 files**, production build, generated-route typecheck and drift validation in
an independently initialized disposable checkout, without
ancestor `node_modules`, existing `.next` or incremental state. The installed
manifest audit verified **57 dependency/peer edges**, with zero incompatible
ranges or ancestor resolutions.

The coordinator and adversarial reviewer independently checked **19/19** copied
files against Git blobs at release commit
`d8124e7b427021d977abf9aabc9a057705a81644`, then freshly formatted both sides:
**zero functional differences and zero approved patches**. Five focused
rendered-Thread tests cover the no-slot DOM, accessory placement, separate
Send/Cancel and explicit Resume capability policy.

Adversarial review found no critical/high production defect. Its medium stale
ACP-tool wait and low direct-input focus check were corrected before the accepted
run: decision controls now belong to the newly created assistant turn, and the
focus assertion uses a real click on verified blank shell padding.

Validation exposed and corrected stale Next type-cache diagnostics, an incorrect
Bun-based Next launcher, a text-span versus disclosure-button locator, differing
ACP/native approval labels, and a model-shortened counting response. No
application workaround, mocked response, retried send, or copied-source patch
was introduced to make the proof pass.

## Scope limits

- **Pi: not applicable.** Its selector is disabled; no Pi run/queue/host request
  is claimed. **Voice/dictation: not applicable.** These runtimes advertise no
  voice control; no synthetic microphone was substituted.
- **Long-outage same-mount recovery: not retested or fixed.** Preserve the
  [documented recovery limitation](/docs/spikes/issue-37-native-recovery.md).
  Cancellation's unknown-outcome warning does not establish outage recovery.
- The proof switches keep-mounted app chat tabs, not separate browser windows.
  It verifies generated server-title metadata restored to the browser, not an
  internal React title hook. App tab labels intentionally remain `chat N`.
- This trusted-local proof does not establish remote/multi-user authorization,
  native project isolation, or new production-hardening guarantees.

The approximately 800-line executable proof exceeds the usual small-change
budget to cover the required real-runtime matrix and owned-process safety.
It adds no production abstraction or dependency. Mechanical helper extraction
would not reduce that behavior; consolidating older executable proofs is outside
this focused upgrade.

## Research and artifact handling

The complete issue bodies/comments, existing native selection/recovery proofs,
official assistant-ui/opencode documentation, and Context7 Playwright/Next.js
documentation informed the implementation. No network interception, fake model
output, fabricated server event or runtime-internal mutation is used.

Each run writes reports and password-masked screenshots beneath the checkout's
`.playwright-mcp/issue-46-47-<id>/`. The accepted reports/screenshots above are
committed evidence; JSON formatting was normalized with parsed contents verified
unchanged. Private mode-0600 service logs and the disposable HOME/XDG profile
remain in a unique `assistant-ui-upgrade-*` directory under Node's `os.tmpdir()`
(honoring `TMPDIR` on Unix). The selected temporary directory must exist and be
writable; no `opencode` parent directory is required. Review/redact before
publishing these private artifacts.
Headers, credentials and prompt bodies are not saved by proof instrumentation.
SIGINT/SIGTERM use the owned-process teardown; an external SIGKILL cannot execute
JavaScript cleanup and requires inspecting exact owned PIDs, never name-killing.
