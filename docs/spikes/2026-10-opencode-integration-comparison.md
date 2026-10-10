# OpenCode integration comparison (issue #29)

**Status:** Completed spike; recommendation below is proposed, not approved.

## Objective and baseline

Compare the existing ACP lane with the published assistant-ui OpenCode runtime on the same OpenCode installation, focusing on lifecycle, capability preservation, code ownership, and the trusted-local security boundary. This is a spike, not a production migration.

Baseline is merged PR [#28](https://github.com/tbrandenburg/agentilogue/pull/28), commit [`61e4cd8`](https://github.com/tbrandenburg/agentilogue/commit/61e4cd8a7b72c5f00cced6474de038a3e486be53), merged 2026-10-09. The PR adds the ACP implementation and records its manual browser/native E2E. The baseline source and docs reviewed were `docs/CONTRACTS.md`, `docs/opencode-acp-proof.md`, `docs/opencode-agent-api.md`, and `app/opencode-session.tsx`.

| Component                      | Baseline                       | B experiment      |
| ------------------------------ | ------------------------------ | ----------------- |
| OS / architecture              | Linux 7.0.0-34-generic, x86_64 | Same host         |
| Bun / Node                     | Bun 1.3.9 / Node v24.15.0      | Same              |
| OpenCode CLI/server            | 1.18.32                        | 1.18.32           |
| `@assistant-ui/react`          | 0.15.25                        | 0.15.25           |
| `@assistant-ui/react-opencode` | Absent                         | 0.2.29            |
| `@agentclientprotocol/sdk`     | 1.7.0                          | 1.7.0 (unchanged) |
| `@opencode-ai/sdk`             | Absent                         | 1.18.35           |
| `assistant-stream`             | 0.3.48                         | 0.3.48            |

At baseline commit `61e4cd8`, these commands passed:

```text
bun install --frozen-lockfile       # installed 302 packages
bun run typecheck                   # passed
bun test                            # 71 pass, 0 fail; 12 files
bun run lint                        # passed
bun run format                      # passed; 84 files
```

The B dependencies were compatible with the app's React 19 and `@assistant-ui/react` 0.15.25 peers. Bun resolved `@assistant-ui/core` 0.3.25 and `@assistant-ui/store` 0.3.18 under the adapter. Installation emitted an `@assistant-ui/tap@0.9.21` peer warning (the adapter's core dependency requests `^0.9.22`); TypeScript, production build, and live runtime nevertheless passed. The installed package README still shows `apiUrl`; the published 0.2.29 type and the official current docs use `baseUrl`, which is what the spike page uses.

On the spike branch with the native-runtime page and pinned dependencies, `bun install --frozen-lockfile`, `bun run typecheck`, `bun test` (71 pass, 0 fail; 12 files), `bun run lint`, `bun run format`, and `bun run build` all passed. The final production build emitted `/opencode-native-spike`, `/api/agent`, and `/api/chat`.

The minimal B-only page and pinned dependencies are on [`spike/issue-29-opencode-integration-comparison`](https://github.com/tbrandenburg/agentilogue/tree/spike/issue-29-opencode-integration-comparison), experiment commit [`0c4fc68`](https://github.com/tbrandenburg/agentilogue/commit/0c4fc68). It mounts `useOpenCodeRuntime` with the existing `Thread`; it does not implement another runtime or message reducer. The page is at [`app/opencode-native-spike/`](https://github.com/tbrandenburg/agentilogue/tree/0c4fc68/app/opencode-native-spike).

## Reproduction

Use disposable directories and the existing project-local `opencode.json` permissions shown below. Do not point either path at a work project. A and B used the same OpenCode 1.18.32 installation and equivalent disposable-project layouts in isolated worktrees.

For A, check out the merged PR #28 baseline; for B, check out the linked spike branch. In each app checkout, run `bun install --frozen-lockfile` before starting the app. Keep the OpenCode server and app in separate shells; the commands below use loopback-only ports.

```sh
mkdir -p /absolute/disposable/project
cat > /absolute/disposable/project/opencode.json <<'JSON'
{"$schema":"https://opencode.ai/config.json","permission":{"edit":"ask","bash":"ask"}}
JSON
```

### A — ACP in the application

```sh
AGENT_API_ENABLED=1 \
AGENT_TRUSTED_LOCAL=1 \
OPENCODE_CWD=/absolute/disposable/project \
bun run dev -- --hostname 127.0.0.1 --port 3320
```

Select **opencode** in the existing “Run with” selector. The app starts the configured OpenCode CLI through the official ACP SDK. The route is intentionally trusted-local only; the API is not authenticated for multi-user deployment. Details: [`docs/opencode-agent-api.md`](../opencode-agent-api.md).

### B — published assistant-ui OpenCode adapter

```sh
# Shell 1: run OpenCode from the disposable project so it owns that project root.
(cd /absolute/disposable/project && \
  opencode serve --hostname 127.0.0.1 --port 4319 \
    --cors http://127.0.0.1:3319)
# Shell 2: from the agentilogue checkout on the spike branch.
OPENCODE_NATIVE_URL=http://127.0.0.1:4319 \
  bun run dev -- --hostname 127.0.0.1 --port 3319
```

Open `http://127.0.0.1:3319/opencode-native-spike`. The tested server listened on loopback and allowed only the app origin through CORS. No same-origin proxy (C) was built. OpenCode server password authentication was not configured in this local experiment; provider credentials remained in the OpenCode process and were not sent to the page. The browser spoke directly to the loopback server.

## A/B scenario matrix

Statuses mean **Pass**, **Fail**, **Unsupported**, or **Not tested**. A references to PR #28 and the ACP proof are prior live evidence on the same OpenCode binary; the A-specific actions below were also repeated from an isolated baseline worktree. B observations came from the disposable native-runtime page. No raw credentials, environment dumps, or user project contents were retained.

| Scenario                                                 | A — ACP                                                                                         | B — native runtime                                                              | Evidence / observation                                                                                                                                                                                                                                                                                                                                                                                       |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Send and stream text                                     | **Pass**                                                                                        | **Pass**                                                                        | A returned `ACP_AB_OK`; PR #28 recorded streamed text. B returned `NATIVE_SPIKE_OK` through the SSE-backed runtime.                                                                                                                                                                                                                                                                                          |
| Text → tool → text, including partial tool updates       | **Pass**                                                                                        | **Not tested**                                                                  | A: PR #28's live transcript recorded `BEFORE_TOOL`, `probe.txt` read, `AFTER_TOOL`; [`opencode-acp-proof.md`](../opencode-acp-proof.md) records partial `tool_call_update` traces. B: same-turn read tool followed by `SPIKE_READ_DONE` rendered in order; a prefix text part and partial tool updates in one turn were not captured.                                                                        |
| Native file read                                         | **Pass**                                                                                        | **Pass**                                                                        | Both runtimes read the disposable `opencode.json`; A returned `ACP_READ_DONE`, B `SPIKE_READ_DONE`.                                                                                                                                                                                                                                                                                                          |
| Native write allowed / rejected                          | **Pass**                                                                                        | **Pass**                                                                        | A approved `a-allow.txt` once (`ACP_ALLOWED`, verified contents) and rejected `a-reject.txt` (verified absent). B approved `spike-allow.txt` once (`ALLOWED`, verified contents) and denied `spike-reject.txt` (verified absent). PR #28 additionally records native OpenCode file-edit approval/rejection.                                                                                                  |
| “Always allow”                                           | **Not tested**                                                                                  | **Not tested**                                                                  | Both UIs exposed an always option. B's confirmation flow was interrupted before a completed write; no persistent rule behavior is claimed.                                                                                                                                                                                                                                                                   |
| Cancel while streaming                                   | **Pass**                                                                                        | **Not tested**                                                                  | A's proof and PR #28 record native cancellation evidence. B: streaming text was visible and the Stop action removed the active UI stream, but the native terminal reason was not queried. This does not establish that OpenCode stopped or how the terminal result was classified.                                                                                                                           |
| Cancel while permission waits; no post-cancel approval   | **Pass**                                                                                        | **Not tested**                                                                  | A: stopping during a pending edit request produced “OpenCode confirmed this run was cancelled”; target file remained absent. B's pending edit tool was stopped, but native terminal status and a post-cancel response race were not verified.                                                                                                                                                                |
| Continue in the same UI conversation                     | **Pass**                                                                                        | **Pass** for same runtime thread; context recall **Not tested**                 | A: PR #28 verified same-conversation native-session continuation. B: two turns rendered in one runtime thread; no codeword/context-recall check verified retained native context.                                                                                                                                                                                                                            |
| Two browser windows stay isolated                        | **Pass**                                                                                        | **Not tested**                                                                  | A: PR #28 manual E2E used two browser contexts; distinct conversation and native session IDs, and no context marker crossed between them. B was not tested for cross-window context isolation.                                                                                                                                                                                                               |
| Browser reload / event reconnect / process failure       | **Pass** for manual Retry after forced 404; **Unsupported** for cold process reattach           | **Not tested**                                                                  | A: PR #28's forced-404 case recovered after the user clicked Retry (details below). ACP process loss reports `unknown`, not cancelled. B reload returned to a blank new-thread view; reconnect and process failure were not exercised.                                                                                                                                                                       |
| Model and agent selection                                | **Unsupported**                                                                                 | **Not tested**                                                                  | A controls are intentionally disabled because explicit/unset continuation behavior is unproven. B accepts `defaultModel`/`defaultAgent` options in source; no selector or override was tested.                                                                                                                                                                                                               |
| Questions / elicitation                                  | **Unsupported**                                                                                 | **Not tested**                                                                  | A ACP client advertises no elicitation capability. B's upstream runtime exposes question reply/reject actions in source; no live question was generated.                                                                                                                                                                                                                                                     |
| Session history, fork/revert, nested subagent transcript | **Not tested**                                                                                  | **Not tested**                                                                  | A ACP proof observed native session load/resume/fork/list capability, but the UI does not expose all of these operations. B source exposes a server-backed thread-list adapter, fork/revert extras, and nested task-session projection; those UI flows were not exercised.                                                                                                                                   |
| Existing `/api/chat` lane                                | **Pass**                                                                                        | **Pass**                                                                        | Live app returned `CHAT_OK` from the AI SDK/OpenAI route during B testing; unchanged baseline lane.                                                                                                                                                                                                                                                                                                          |
| Narrow screen                                            | **Pass**                                                                                        | **Pass**                                                                        | At 390×844, `document.documentElement.clientWidth` and `document.body.scrollWidth` were both 390 on A and B pages.                                                                                                                                                                                                                                                                                           |
| Local bind, project/session ownership, caller protection | **Pass** only for documented trusted-local use; **Unsupported** for shared/untrusted deployment | **Fail** for project-scoped ownership as configured; **Pass** for loopback bind | A route binds the configured cwd server-side, checks same-origin/local host, and keeps native session IDs server-owned; it still has no caller authentication. B bound to `127.0.0.1` with exact-origin CORS, but its session-list request returned 100 root sessions, only 1 in the disposable directory and 99 in other directories. No app-level session/project filter or identity boundary was present. |

**A retry clarification:** PR #28's live E2E forced the first observation GET to return 404. The UI showed disconnected state with a manual Retry action; clicking it reused the same run ID and recovered from a fresh snapshot. It did not demonstrate automatic retry after 404. The current [`observeOpenCodeRun`](../../app/opencode-observer.ts#L28-L29) treats 403/404 as permanent, covered by [`app/opencode-observer.test.ts`](../../app/opencode-observer.test.ts#L60-L78). Automatic retry after 503 is covered by a unit test ([lines 80–115](../../app/opencode-observer.test.ts#L80-L115)), but no transient failure was live-tested. B's upstream `initialSessionId` exists, but this experiment page did not persist or restore it.

### Sanitized live evidence excerpts

These are the exact response markers and filesystem outcomes used during the UI runs; the directories were disposable and were not included in the repository.

```text
A text response: ACP_AB_OK
A read-tool response: ACP_READ_DONE
A approved write: a-allow.txt = ACP_ALLOWED
A rejected write: a-reject.txt absent
A stop during pending permission: “OpenCode confirmed this run was cancelled.”

B text response: NATIVE_SPIKE_OK
B read-tool response: SPIKE_READ_DONE
B approved write: spike-allow.txt = ALLOWED
B rejected write: spike-reject.txt absent
B streaming stop: UI stream stopped; native terminal result not checked
B app-title request: POST /session/{id}/summarize -> HTTP 400
  {"name":"BadRequest","data":{"message":"Expected object, got undefined","kind":"Payload"}}
B session-list request: GET /experimental/session?roots=true&archived=true
  100 root sessions; 1 disposable-project session; 99 other-directory sessions
```

The B 400 was generated by the package's automatic session title action after the prompt itself completed. The installed 0.2.29 implementation calls `session.summarize` with only a session ID, while the tested OpenCode server rejected the missing model payload. Ordinary prompt, read, and approved edit still worked.

## Ownership and capability comparison

Approximate production modules currently owned specifically for path A:

| A-only responsibility                         | Files                                                                                                                                     | Current lines |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ------------: |
| Browser observation and transcript projection | `app/opencode-session.tsx`, `app/opencode-observer.ts`, `app/opencode-projection.ts`                                                      |           653 |
| Admission/control endpoint and ACP lifecycle  | `app/api/agent/route.ts`, `lib/agent/opencode/provider.ts`, `lib/agent/opencode/acp-client.ts`, `lib/agent/opencode/update-projection.ts` |           805 |
| **Approximate A-only implementation surface** | Above                                                                                                                                     |     **1,458** |

This count excludes tests, fixtures, documentation, and the 405 lines of provider-neutral contracts. B's experiment page is 47 lines of app code plus two package dependencies; the upstream adapter owns session/thread state, event projection, tools, permission/question responses, and fork/revert actions. B would therefore remove substantial A-only code if adopted without a proxy. A proxy would add server lifecycle, request/session authorization, and forwarding code, reducing that saving.

**A preserves:** app-owned conversation-to-session binding; server-owned project cwd; a deliberately small, validated observation/control API; explicit same-process observer retry; native cancellation terminal confirmation; and `unknown` on process loss. Its current UI does not expose native model/agent selection, questions, or all session-history operations.

**B preserves:** OpenCode's richer native session API and event model. The published runtime source handles session/message/part event projection, session thread-list operations, permission and question replies, cancellation, fork/revert, and task child sessions. It has no app-owned mapping from a browser conversation to an authorized project session. The observed global root-session listing makes that omission material: a `ThreadList` backed directly by this server can surface sessions from other working directories.

**C was not built.** The cross-directory session enumeration is a real project-ownership problem for a project-scoped application, but solving it needs a deliberate server isolation/authentication boundary (for example a per-project server/data store or a narrow authorized proxy). A generic reverse proxy would not itself establish session ownership. This needs a focused follow-up design before B can be enabled as an app lane.

## Adjacent integration patterns (source review)

Assistant-ui source was reviewed at commit [`2b3e0d36`](https://github.com/assistant-ui/assistant-ui/commit/2b3e0d36b62d21c2ffd280cfc96f4e2a127365da). `npm view` reported the following latest published versions on 2026-10-10. These rows are source review, not live integrations in agentilogue.

| Adapter               | Native protocol/API                    | Browser runtime/transport                                                         | Session/permission/cancel owner                                                               | Extra AGENTILOGUE glue                                                         | Evidence/version                                                                                                                                                                                                                                           |
| --------------------- | -------------------------------------- | --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| OpenCode ACP          | ACP v1 over OpenCode CLI               | App external-store projection + assistant-stream transport                        | App server binds UI conversation/session; ACP server owns native permissions and cancellation | Existing `/api/agent`, ACP provider, observer/projection, trusted-local checks | **Live**: OpenCode 1.18.32, SDK 1.7.0; PR #28 and this report                                                                                                                                                                                              |
| OpenCode native       | OpenCode SDK/server API                | `useOpenCodeRuntime` with direct SDK/SSE client                                   | OpenCode server owns sessions/events; browser owns runtime/thread selection                   | Project-scoped authorization and session mapping still needed                  | **Live**: `react-opencode` 0.2.29, SDK 1.18.35, CLI 1.18.32; this report                                                                                                                                                                                   |
| Pi                    | Pi SDK via `PiClient`                  | `usePiRuntime`; optional HTTP/SSE `createPiHttpClient`; Node `createPiNodeClient` | Pi supervisor owns process/session; host UI mediates extension requests; runtime sends cancel | Server route/SSE and workspace/session ownership if using Node client          | **Source reviewed, not run**: `react-pi` 0.0.29, [README](https://github.com/assistant-ui/assistant-ui/blob/2b3e0d36b62d21c2ffd280cfc96f4e2a127365da/packages/react-pi/README.md)                                                                          |
| AG-UI                 | AG-UI agent event protocol             | `useAgUiRuntime` over `@ag-ui/client` / `HttpAgent`                               | Backend owns run/session state; adapter projects text, tools, state, approvals, and subagents | AG-UI-compliant backend, endpoint and caller security                          | **Source reviewed, not run**: `react-ag-ui` 0.0.66, [docs](https://www.assistant-ui.com/docs/runtimes/ag-ui/overview), [README](https://github.com/assistant-ui/assistant-ui/blob/2b3e0d36b62d21c2ffd280cfc96f4e2a127365da/packages/react-ag-ui/README.md) |
| A2A                   | A2A v1.0 remote task/artifact protocol | `useA2ARuntime` with HTTP/SSE client                                              | Remote agent owns task state/artifacts; client handles task updates and required-input states | Agent-card discovery, endpoint/tenant/auth setup                               | **Source reviewed, not run**: `react-a2a` 0.2.42, [docs](https://www.assistant-ui.com/docs/runtimes/a2a/overview), [README](https://github.com/assistant-ui/assistant-ui/blob/2b3e0d36b62d21c2ffd280cfc96f4e2a127365da/packages/react-a2a/README.md)       |
| Claude Managed Agents | Hosted agent API                       | Assistant-ui managed-agent runtime                                                | Hosted service owns credentials, durable sessions, approvals, and event recovery              | Hosted-agent account/configuration and app authorization                       | **Not tested / not included** (optional reference)                                                                                                                                                                                                         |

Pi is the closest adjacent local CLI pattern: its browser-facing `PiClient` is transport-neutral, with a provided HTTP/SSE bridge and an optional Node-only process/session supervisor. It explicitly assigns workspace selection and route security to the host app. AG-UI is a browser-facing agent interaction protocol and runtime, not a native process-spawning protocol like ACP. A2A models remote tasks, artifacts, and input/auth-required states; it is not a clone of a local coding-agent subprocess session.

## Recommendation and unresolved questions

**Recommendation:** Keep ACP as agentilogue's current OpenCode lane. Do not replace it with direct B in the project-scoped app yet. The upstream runtime is technically viable and removes roughly 1.4k lines of OpenCode-specific app implementation, but the observed session-list exposure crosses the app's project boundary and the adapter's automatic title request failed against the tested server version. Reconsider a separate native lane only after a real per-project session boundary is demonstrated and the adapter/server compatibility is pinned and tested. No change to `docs/CONTRACTS.md` is justified by this spike.

Open questions for that follow-up: Can OpenCode be launched with a per-project isolated data directory without breaking its auth/config lookup? If not, what narrow proxy authorizes every session and interaction without duplicating the SDK/runtime? Does the title-generation payload mismatch persist with matching CLI/SDK versions? What is the minimum stable assistant-ui adapter version and upgrade test policy for an experimental package?
