# Issue #34: OpenCode local-browser boundary and adapter compatibility

**Status:** The maintainer-approved local E2E opt-in is enabled by environment configuration, with a temporary scoped SDK-fetch workaround for assistant-ui #9244. This is testing-only, not production readiness. Native chat, context, tools, permissions, cancellation, SSE recovery, and AI SDK/ACP smoke flows were exercised. **B15 late permission after abort and B18 process-loss outcome both FAIL**; #34 remains open until these blockers and the remaining manual matrix are resolved. Basic auth is required, the local user enters its password in memory, and configured app-origin matching is defense-in-depth rather than authorization.

## Decision context

Read the full updated [#34](https://github.com/tbrandenburg/agentilogue/issues/34), [#33](https://github.com/tbrandenburg/agentilogue/issues/33), and [#35](https://github.com/tbrandenburg/agentilogue/pull/35) bodies/comments, plus [ADR 0001](../decisions/0001-agent-integration-lanes.md) and the earlier [comparison report](2026-10-opencode-integration-comparison.md). The issues returned no comments. The decision in #34 is a **one-user trusted-local** scope: configured projects/sessions are within the user's trust scope. #33's profile probe remains **NO-GO for project isolation**; it was not edited or rerun here and is not a failure of this revised scope.

## Versions and compatibility

| Component                      | Version/evidence                                                                                                                             |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| OpenCode CLI/server            | `1.18.32` installed; separately installed `opencode-ai@1.18.35` reported health version `1.18.35`                                            |
| `@assistant-ui/react-opencode` | `0.2.29`, initially inspected with `npm pack`; pinned in the gated implementation                                                            |
| `@opencode-ai/sdk`             | `1.18.35`, required by adapter range `^1.18.35`; inspected packed SDK types/source                                                           |
| Adapter peers                  | `@assistant-ui/react ^0.15.0`; React peer range is `^18` or `^19`; optional `@types/react *`; app's declared assistant-ui React is `0.15.25` |
| Adapter dependencies           | `@assistant-ui/core ^0.3.25`, `@assistant-ui/store ^0.3.18`, `@opencode-ai/sdk ^1.18.35`, `assistant-cloud *`                                |
| CLI/package skew               | SDK `1.18.35` range permits CLI `1.18.32`; tested CLI/server `1.18.32` and matching `1.18.35`, and the title mismatch persisted              |

Source inspection of adapter `0.2.29` found:

- `src/openCodeThreadListAdapter.ts:97-103` calls `client.session.summarize({ sessionID })` without the provider/model body. Its emitted `dist/openCodeThreadListAdapter.js` does the same.
- The SDK's generated client `Config` accepts `headers` (`dist/v2/gen/core/types.gen.d.ts:33-38`) and auth (`:21-27`); the adapter quickstart documents a preconfigured client for auth headers. These are browser client options: a privileged password placed there is present in browser JS/runtime and the Authorization request. This is not a server-only credential channel.
- The adapter's client is created from `@opencode-ai/sdk/v2/client`, and supports the documented stable client, `initialSessionId`, `onThreadIdChange`, `defaultModel` and `defaultAgent` options (`src/types.ts:187-210`). The session list calls `experimental.session.list({ roots: true, archived: true })` (`src/openCodeThreadListAdapter.ts:40-46`).
- `npm view @assistant-ui/core@0.3.25 dependencies` reports `assistant-stream ^0.3.49`; the historical spike report records the install's `@assistant-ui/tap 0.9.21` vs requested `^0.9.22` warning. That warning is historical evidence, not a fresh full dependency install in this worktree.

The current OpenCode website's server docs identify the new v2 and were last updated Oct 8, 2026. The Context7 results likewise resolve current v2/dev sources, not the installed 1.18.32 implementation. I used them only as general orientation; CLI help and live tests below are the version-specific evidence. Official references: [OpenCode server docs](https://opencode.ai/docs/server/), [assistant-ui OpenCode quickstart](https://www.assistant-ui.com/docs/runtimes/opencode/quickstart), [adapter npm metadata](https://www.npmjs.com/package/@assistant-ui/react-opencode/v/0.2.29), [SDK npm metadata](https://www.npmjs.com/package/@opencode-ai/sdk/v/1.18.35).

## Synthetic local test

Only a fresh `/tmp/opencode/issue34-run.wJ4d5n` project and fresh HOME/XDG data/config/state/cache roots were used. The server processes inherited no provider credentials; no model prompt was sent. The test used ports 44034/44035 after checking them free. Both processes were launched with `--hostname 127.0.0.1`; no all-interface listener was started. `ip -brief address` showed loopback `127.0.0.1` and non-loopback Wi-Fi `192.168.0.20/24` (plus IPv6 addresses).

### CORS and HTTP behavior

For the no-password process on 44034, `--cors http://127.0.0.1:3319`:

| Request                                                                                | Observed result                                                                                        |
| -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| OPTIONS `/session`, configured Origin, requested POST and `content-type,authorization` | `204`, exact `Access-Control-Allow-Origin: http://127.0.0.1:3319`, allowed methods and headers present |
| OPTIONS `/session`, `Origin: https://attacker.invalid`                                 | `204`, **no** `Access-Control-Allow-Origin`                                                            |
| GET `/global/health`, configured Origin                                                | `200`, exact allow-origin header present; body `{"healthy":true,"version":"1.18.32"}`                  |
| GET `/global/health`, unauthorized Origin                                              | `200`, **no** allow-origin header                                                                      |

This is HTTP-header testing only. The server still returned data/status 200 to a raw HTTP client carrying an unauthorized `Origin`. A browser's enforcement of the missing CORS response header, preflight behavior, opaque-origin cases, and request-side effects were **not** proved by this first probe; see the coordinator browser verification below. CORS is not authentication.

### Coordinator browser verification

Chrome requests were made from the app origin `http://localhost:3003` and an unapproved loopback-alias origin `http://127.0.0.1:3003` against OpenCode CLI/server 1.18.32 on loopback with `--cors http://localhost:3003`. All data was synthetic; no production credentials or profiles were used.

| Server configuration and browser Origin                                               | Request                                             | Result                                                                                                           |
| ------------------------------------------------------------------------------------- | --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| No Basic auth; configured `localhost` origin                                          | GET `/global/health`                                | **PASS:** browser read status 200 and health JSON.                                                               |
| No Basic auth; unapproved `127.0.0.1` origin                                          | GET `/session`                                      | **FAIL:** browser read status 200 and body `[]`.                                                                 |
| No Basic auth; unapproved `127.0.0.1` origin                                          | POST `/session` with JSON                           | **FAIL:** browser created a synthetic session and read its response.                                             |
| No Basic auth; unapproved `127.0.0.1` origin                                          | POST `/session` with simple `text/plain` JSON body  | **FAIL:** browser created a synthetic session and read its response.                                             |
| Basic auth enabled; configured `localhost` origin with synthetic Authorization header | GET `/global/health`, POST `/session`               | **PASS:** browser read status 200 and created a synthetic session using client auth.                             |
| Basic auth enabled; unapproved `127.0.0.1` origin without auth                        | GET `/session`, JSON POST, simple `text/plain` POST | **PASS (auth boundary):** all returned 401 with an empty body; no session response was available to that origin. |

The configured CORS origin did not prevent Chrome access from the unapproved loopback alias, despite the earlier raw HTTP test showing no allow-origin header for an arbitrary non-loopback origin. The unauthenticated server configuration is **not acceptable**. Basic auth blocked the tested unauthorized-origin requests. The test used only a synthetic password in runtime memory and an Authorization request header; this demonstrates user-supplied credentials work with the upstream SDK client, not that an app-owned server secret can be hidden in a direct browser connection.

### HTTP Basic auth

A second process on 44035 used a random synthetic password in its environment and a separate fresh XDG profile. The password was not put in the report or output.

| Request                                              | Result                                               |
| ---------------------------------------------------- | ---------------------------------------------------- |
| `/global/health`, no auth                            | `401`                                                |
| `/global/health`, wrong auth                         | `401`                                                |
| `/global/health`, correct synthetic Basic auth       | `200`                                                |
| OPTIONS preflight for configured origin with no auth | `204`, allowed-origin/method/header response present |
| Actual GET with configured origin and correct auth   | `200`, allowed-origin header present                 |
| Actual GET with unauthorized origin and correct auth | `200`, no allow-origin header                        |

The server-side auth switch works. The direct browser adapter must send Basic auth on API/SSE calls; the SDK supports client-side auth/headers, not a server-only secret facility. Never place an app-owned privileged server secret in `createOpencodeClient`. A local user-provided password can be held ephemerally in browser memory and sent in the Authorization header; the actual browser test above confirmed this flow. The feature must require server auth and an explicit user-supplied password, not rely on loopback/CORS alone. No custom gateway was built.

### Binding and remote reachability

`ss -ltnp` showed only `127.0.0.1:44034` and `127.0.0.1:44035`. A same-host connection attempt to the machine's non-loopback IPv4 address `192.168.0.20` failed with curl status `000` / connection refused on both ports. This establishes the tested processes did not listen on that interface. **Access from a separate remote host was NOT TESTED.** Loopback binding and same-host non-loopback refusal do not prove remote network/firewall behavior.

## Automatic title request

Created a fresh synthetic session using `POST /session` with title `Issue 34 synthetic title probe` and confirmed its returned directory was the disposable project. Then sent the same bodyless `POST /session/{id}/summarize` call emitted by adapter 0.2.29. CLI/server 1.18.32 returned:

```text
HTTP/1.1 400 Bad Request
{"name":"BadRequest","data":{"message":"Expected object, got undefined","kind":"Payload"}}
```

This reproduced the earlier summarize 400 without a prompt, model, provider credential, or real user session. Repeating the same bodyless request with a separately installed `opencode-ai@1.18.35` server reported health version `1.18.35` but also returned HTTP 400 with `Expected object, got undefined`. Merely aligning the server version with SDK 1.18.35 does not fix the adapter's bodyless call. The current server API expects a `{ providerID, modelID }` body, while adapter 0.2.29 omits it. This remains a **confirmed title compatibility blocker**. Successful title generation with a compatible body/model was not tested because that would require provider/model availability and was not safe credential-free. The native chat/session flow beyond synthetic session creation was not tested.

## Security/compatibility matrix

| Check                                                                           | Status                                 | Evidence/limit                                                                                                     |
| ------------------------------------------------------------------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Fresh synthetic project/profile; no global user history or provider credentials | **PASS**                               | Fresh temporary HOME/XDG roots; no provider prompt or credentials                                                  |
| Loopback bind (not `0.0.0.0`)                                                   | **PASS**                               | Exact listener addresses from `ss`                                                                                 |
| Same-host access via non-loopback interface address                             | **PASS** (connection refused)          | `192.168.0.20` attempts failed; this is not a remote-host test                                                     |
| Separate remote-host access                                                     | **NOT TESTED**                         | No remote client used                                                                                              |
| Exact configured CORS header on raw HTTP preflight and actual response          | **PASS**                               | Exact origin emitted on configured-origin responses                                                                |
| Unauthorized origin lacks CORS allow-origin response header                     | **PASS** (HTTP observation)            | Raw HTTP preflight and GET lacked ACAO; GET still returned 200                                                     |
| Browser configured origin with `--cors`                                         | **PASS**                               | Chrome fetch succeeded from `http://localhost:3003`                                                                |
| Browser unapproved loopback alias without server password                       | **FAIL**                               | Chrome from `http://127.0.0.1:3003` read session data and created sessions                                         |
| Browser unapproved loopback alias with Basic auth, no credential                | **PASS (auth boundary)**               | GET and JSON/simple POST attempts returned 401 with empty bodies                                                   |
| HTTP Basic auth configuration                                                   | **PASS**                               | Missing/wrong credentials 401; synthetic correct credential 200                                                    |
| Authenticated direct browser client without app-owned secret                    | **PASS with user-supplied password**   | SDK sends runtime Authorization header; require ephemeral user input, never bundle/persist/log an app-owned secret |
| Preflight vs actual request under Basic auth                                    | **PASS**                               | OPTIONS succeeded without auth; actual protected GET required valid auth                                           |
| Adapter's automatic summarize/title call against CLI 1.18.32 and 1.18.35        | **FAIL**                               | Exact bodyless call returns HTTP 400 on both versions                                                              |
| Successful title generation using provider/model                                | **NOT TESTED**                         | No provider credentials or model request used                                                                      |
| Project isolation                                                               | **NOT TESTED HERE; #33 remains NO-GO** | Explicitly not required by the one-user trusted-local scope; do not reinterpret as a pass                          |

## Recommendation and smallest blockers

Do not enable the native lane. Adapter 0.2.29's title endpoint mismatch is confirmed against CLI/server 1.18.32 and 1.18.35; matching those versions did not help. Browser testing showed that unauthenticated OpenCode with configured `--cors` allowed an unapproved loopback alias to read and create synthetic sessions. Basic auth blocked those same requests; the official SDK supports sending an Authorization header. The local user must enter the OpenCode server password at runtime, held ephemerally in browser memory and never bundled, persisted, or logged. The implementation is unconditionally fail-closed for the pinned adapter; there is no environment bypass. Unblocking requires an upstream adapter/server version, pinned in the app, plus evidence that a completed native prompt successfully generates a title (no summarize 400), and renewed origin/auth verification. No custom gateway is needed for the single-user trust model. Remote-host access remains **NOT TESTED**; the actual server bound only to loopback, and same-host Wi-Fi-IP connections were refused.

## Validation commands and evidence

Research/package inspection:

```text
gh issue view 34 --json number,title,body,comments,url
gh issue view 33 --json number,title,body,comments,url
gh issue view 35 --json number,title,body,comments,url
npm view @assistant-ui/react-opencode@0.2.29 version peerDependencies dependencies --json
npm view @opencode-ai/sdk@1.18.35 version peerDependencies dependencies --json
npm pack @assistant-ui/react-opencode@0.2.29 --pack-destination /tmp/opencode
npm pack @opencode-ai/sdk@1.18.35 --pack-destination /tmp/opencode
opencode --version                         # 1.18.32
opencode serve --help                      # default hostname 127.0.0.1; --cors available
ip -brief address                          # lo=127.0.0.1; Wi-Fi=192.168.0.20/24
```

Server checks used curl against ports 44034 and 44035, and actual Chrome requests against OpenCode 1.18.32 on port 44334, including:

```text
OPTIONS /session with Origin and Access-Control-Request-Method/Headers
GET /global/health with configured and unauthorized Origin
GET /global/health without, with wrong, and with correct synthetic Basic auth
POST /session with a synthetic title
POST /session/{synthetic-id}/summarize with no body
curl --connect-timeout 2 http://192.168.0.20:{44034,44035}/global/health
ss -ltnp '( sport = :44034 or sport = :44035 )'
Chrome fetch from http://localhost:3003 and http://127.0.0.1:3003 to http://127.0.0.1:44334
Chrome GET/list and POST session requests with JSON and simple text/plain bodies, with/without Basic auth
```

Owned server PIDs from the HTTP probe were `927303` and `928572`; both were sent `TERM`. Browser verification used task-owned OpenCode PIDs `934459` and `936818`, which were stopped; follow-up `ss` showed no listener on port 44334. The CLI 1.18.35 title probe ran under an owned npm-exec process group; follow-up `ss` showed no listener on 44335. The test profile, synthetic sessions and credentials were removed. Temporary profiles, response bodies and packed packages were cleaned after recording evidence. **At the time this initial research was performed**, no production validation suite was run because no production code changed.

## Gated implementation and manual E2E results (2026-10-10)

The E2E server used CLI/server `1.18.32`, SDK `1.18.35`, adapter `0.2.29`, a fresh temporary XDG profile and project with `opencode/gpt-4o-mini` configured, and a Basic-auth-protected loopback listener. A provider key was passed to the isolated server process from its environment but was not read, printed, or recorded. Test files and server state remained under `/tmp`.

- Exact pins: `@assistant-ui/react-opencode@0.2.29` and `@opencode-ai/sdk@1.18.35`.
- Bun 1.3.9 root overrides pin core `0.3.25`, store `0.3.18`, and tap `0.9.22`; `bun pm ls --all` showed one installed copy of each.
- Native server password is entered in the selected app tab, kept only in component memory, and sent in Basic Authorization headers. The app never receives that password in environment or page props, and does not persist or log it. Connection checks first require unauthenticated `/global/health` to return 401, then authenticated health to return 200.
- Native models and agents remain disabled; their catalogs and effective selection semantics were not tested. Session IDs are held in the current app tab's in-memory state; no durable reload mapping is claimed.
- The SDK custom-fetch workaround in `lib/opencode-native-title-workaround.ts` suppresses only the adapter's bodyless `/session/{id}/summarize` request with local 204; it forwards other calls. OpenCode's own first-prompt title generation was observed (`Smoke test NATIVE_E2E_OK response`). The upstream defect is [assistant-ui #9244](https://github.com/assistant-ui/assistant-ui/issues/9244). This workaround is temporary and must be removed when a fixed adapter release is verified.

| #   | Scenario                                    | Status                                   | Observed evidence / remaining gap                                                                                                                                                                                                                                                                                                                                                                                                                                |
| --- | ------------------------------------------- | ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B1  | Gate off                                    | **NOT TESTED**                           | This run enabled the explicit native gate.                                                                                                                                                                                                                                                                                                                                                                                                                       |
| B2  | Gate on and local auth                      | **PASS**                                 | Browser connected at the configured loopback origin. Unauthenticated health was 401, authenticated health and session list were 200; wrong password displayed an auth error.                                                                                                                                                                                                                                                                                     |
| B3  | First native tab                            | **PASS**                                 | First prompt created one session and streamed `NATIVE_E2E_OK`; exactly one `POST /session` preceded the prompt.                                                                                                                                                                                                                                                                                                                                                  |
| B4  | Same-tab context                            | **PASS**                                 | The second turn in the same session recalled `NATIVE_E2E_OK`.                                                                                                                                                                                                                                                                                                                                                                                                    |
| B5  | Two native tabs                             | **PASS**                                 | Separate tabs created distinct OpenCode session IDs; each recalled its own marker (`NATIVE_E2E_OK` vs `NATIVE_B_2026`). No cross-tab transcript bleed was observed.                                                                                                                                                                                                                                                                                              |
| B6  | Background and heterogeneous tabs           | **PARTIAL**                              | A native run continued while switching to another native tab; the running tab's close control stayed disabled and Stop remained available on return. AI SDK and ACP were separately exercised, but not while that native run was active.                                                                                                                                                                                                                         |
| B7  | Create/close/lock tabs                      | **PARTIAL**                              | New tabs and running-tab close protection were exercised. Last-tab close protection and a mixed-target close matrix were not tested.                                                                                                                                                                                                                                                                                                                             |
| B8  | Native model catalog                        | **PASS (honest disabled)**               | Model picker remains disabled because catalog discovery/application semantics were not verified.                                                                                                                                                                                                                                                                                                                                                                 |
| B9  | Default/explicit model continuation         | **PARTIAL**                              | Server-configured default model completed multi-turn prompts; explicit native model selection/override was not tested because the picker is disabled.                                                                                                                                                                                                                                                                                                            |
| B10 | Agent selection                             | **PASS (honest disabled)**               | Agent picker remains disabled because catalog discovery/application semantics were not verified.                                                                                                                                                                                                                                                                                                                                                                 |
| B11 | Text/tool/text projection                   | **PASS**                                 | Assistant text before and after a native file-read tool rendered in order; fixture contents matched.                                                                                                                                                                                                                                                                                                                                                             |
| B12 | Permission allow/deny                       | **PASS**                                 | Native write allowed once created exact `NATIVE_ALLOW_2026`; denied write file remained absent. ACP regression separately read, allowed, and denied synthetic files.                                                                                                                                                                                                                                                                                             |
| B13 | Always allow                                | **NOT TESTED**                           | The option was offered but persistent permission scope was not tested.                                                                                                                                                                                                                                                                                                                                                                                           |
| B14 | Native stream cancellation                  | **PASS**                                 | Stop sent `POST /session/{id}/abort` → HTTP 200 / `true`; UI showed Aborted and `/session/status` had no active run afterward. ACP cancellation also showed its native confirmed-cancelled outcome.                                                                                                                                                                                                                                                              |
| B15 | Cancel with permission pending / late reply | **FAIL — blocker**                       | With a unique `late.txt` edit pending, abort returned 200 / `true`. The stale Allow remained available; clicking it sent `/permission/{id}/reply` → HTTP 200 / `true`, and `late.txt` was created with `NATIVE_LATE_APPROVAL_2026` after abort. In a second test, `late-race-2.txt` was confirmed absent before and after abort when the stale decision button had disappeared. See [OpenCode issue #54332](https://github.com/anomalyco/opencode/issues/54332). |
| B16 | Interactive questions                       | **NOT TESTED**                           | No native question was generated.                                                                                                                                                                                                                                                                                                                                                                                                                                |
| B17 | SSE disconnect/reconnect                    | **PASS (fault-injected)**                | Playwright aborted the real `/event` request during an active prompt, then restored it. One event request reconnected successfully; `SSE_DROP_RECOVERED` appeared once in the user prompt and once in the reply, with no duplicate prompt. This was a controlled browser network fault, not server loss.                                                                                                                                                         |
| B18 | Server loss/recovery                        | **FAIL — blocker**                       | OpenCode was stopped during a run and restarted with the same temporary profile. The session survived, but `/session/status` was empty and the last assistant message had no `finish` or `time.completed`. The UI showed partial content/actions without an explicit unknown/unavailable outcome.                                                                                                                                                                |
| B19 | Disconnect/reattach and reload              | **PARTIAL**                              | Disconnecting and reconnecting the same mounted app tab restored its transcript through `initialSessionId`. Full-page reload and named-session reopening after the ephemeral app state reset were not tested.                                                                                                                                                                                                                                                    |
| B20 | Same-user multi-project scope               | **NOT TESTED**                           | All current app E2E used one synthetic project; no project-isolation claim is made.                                                                                                                                                                                                                                                                                                                                                                              |
| B21 | Title and versions                          | **PASS (temporary workaround)**          | Bodyless summarize was absent from server traffic; OpenCode generated a session title on first prompt. Native title propagation into a visible assistant-ui thread list is not part of the current UI and was not tested.                                                                                                                                                                                                                                        |
| B22 | Mobile/console                              | **PARTIAL**                              | At 390×844, document/client/body widths were all 390. Browser console included expected unauthenticated 401 health challenges and Next dev HMR WebSocket connection-refused errors (dev server bound to `127.0.0.1` while Next HMR requested `localhost`); no hydration failure was observed, but a clean production-console run was not completed.                                                                                                              |
| B23 | AI SDK and ACP regression                   | **PASS (benign prompts/tool decisions)** | AI SDK returned `AI_SDK_E2E_OK`. ACP returned `ACP_E2E_OK`, read the synthetic fixture, created the allowed file once, denied a second write, and confirmed cancellation.                                                                                                                                                                                                                                                                                        |

### Remaining launch blockers

1. **B15 FAIL:** OpenCode accepts a late permission reply after session abort and executes the write. No application-side adapter interception was added for permission/cancel behavior; the native lane must remain a local testing feature until OpenCode resolves this race or an accepted upstream fix lands.
2. **B18 FAIL:** after OpenCode process loss, a partial assistant message is rendered without an explicit unknown status despite no terminal finish evidence. Recovery semantics need a truthful state before production enablement.
3. **NOT TESTED:** remote-host access, native question handling, persistent permissions, full-page reload recovery, same-user multi-project switching, explicit native model/agent selection, and the full mixed-runtime background matrix.

The upstream title workaround is for local E2E only. PR #36 and #34 remain open; this report does not claim the B1–B23 matrix has passed or that the native lane is production-ready. The separate upstream cancellation race is reported at [OpenCode #54332](https://github.com/anomalyco/opencode/issues/54332). #33 remains **NO-GO for project isolation** and its report/probe are unchanged.

### Coordinator validation after the current PR changes

```text
bun install --frozen-lockfile — passed (307 packages checked, no changes)
bun run format — passed
bun run lint — passed
bun run typecheck — passed
bun test — 78 passed, 0 failed (14 files)
bun run build — passed (Next.js 16.3.8)
bun run models:check — passed
bun pm ls --all — one installed version each of @assistant-ui/core 0.3.25, store 0.3.18, tap 0.9.22
git diff --check — passed
```

These checks do not resolve B15/B18 or replace the remaining manual E2E cases. The latest browser tests used only temporary project/profile data and a synthetic OpenCode Basic password; the provider key was passed from the environment to the temporary server and not read or recorded.

## Temporary title workaround added after upstream report (2026-10-10)

An additional follow-up on this PR files the upstream adapter defect at [assistant-ui #9244](https://github.com/assistant-ui/assistant-ui/issues/9244). OpenCode v1.18.35 generates native titles through its first-prompt `SessionPrompt.ensureTitle` path; the assistant-ui adapter instead called the session compaction endpoint from `generateTitle`.

For explicitly opted-in **manual E2E testing only**, `lib/opencode-native-title-workaround.ts` supplies the published SDK's configurable `fetch` hook. It returns an empty successful HTTP 204 response **only** for a bodyless `POST /session/{id}/summarize`, the invalid call from adapter 0.2.29. It forwards all other requests, including compaction with a real model body, through ordinary `fetch`. This changes no assistant-ui package, SDK code, server API, security boundary, or package version. The app continues to require loopback URLs, an exact configured app origin, explicit feature opt-in, and verified Basic auth with a user-entered in-memory password. The experiment does **not** claim that OpenCode's native generated title already propagates into assistant-ui's thread-list title.

The original automatic-title **FAIL** remains a valid observation for the unmodified adapter; the workaround avoids that specific network request instead of proving upstream compatibility. A real first prompt nevertheless produced an OpenCode server-generated title, and no summarize request reached the server. The experimental gate is available only for trusted-local E2E. The B1–B23 matrix is partial: B15 and B18 fail, while questions, persistent permission semantics, remote-host access, full-page recovery, same-user multi-project switching, and some mixed-runtime background cases remain untested. **Production enablement and closure of #34 are blocked.** Remove the custom-fetch workaround once an upstream adapter release has verified native title behavior.
