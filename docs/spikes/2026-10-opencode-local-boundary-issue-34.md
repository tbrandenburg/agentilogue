# Issue #34: opencode local-browser boundary and adapter compatibility

**Status:** Fresh production-build browser evidence on adapter `0.2.30` has **18 PASS, 1 FAIL, and 3 NOT TESTED checks (22 enumerated rows)**. **FAIL:** same-mount recovery after opencode restart stalled until reload; root cause remains unproven. Full-page reload/password re-entry recovered the same session safely, retained unknown outcome, and sent no duplicate prompt. Generated server titles matched official thread metadata/list-item titles and restored without the removed workaround. This is an off-by-default experimental trusted-local integration, not production readiness or seamless recovery. #34 remains production hardening; #33 remains **NO-GO for strict project isolation**. Older `0.2.29` evidence below remains historical. Basic auth is required; app-origin matching is defense-in-depth rather than authorization.

## Current PR #36 baseline and final browser evidence

| Component                      | Current pin | Previous baseline |
| ------------------------------ | ----------- | ----------------- |
| `@assistant-ui/react-opencode` | `0.2.30`    | `0.2.29`          |
| `@assistant-ui/core` override  | `0.3.26`    | `0.3.25`          |
| `@assistant-ui/store` override | `0.3.19`    | `0.3.18`          |
| `assistant-stream`             | `0.3.49`    | `0.3.48`          |
| `@assistant-ui/tap` override   | `0.9.22`    | unchanged         |
| `@opencode-ai/sdk`             | `1.18.35`   | unchanged         |

Adapter `0.2.30` resolves title bug [#9244](https://github.com/assistant-ui/assistant-ui/issues/9244) through upstream [PR #9245](https://github.com/assistant-ui/assistant-ui/pull/9245), merged as [5438d56](https://github.com/assistant-ui/assistant-ui/commit/5438d56bd524532d95a080c9a7fd37ef2042a607). The app removed `lib/opencode-native-title-workaround.ts` and its dedicated tests; the authenticated SDK client uses the native run guard without title-request suppression. The original `0.2.29` bodyless summarize 400 and workaround-only B21 result remain historical observations, separate from the upgraded browser evidence.

Fresh `0.2.30` evidence below verifies title generation and propagation through official runtime metadata/list items, not visible custom-tab title labels. The app intentionally keeps chat labels on its custom tabs. `assistant-stream` is pinned and overridden to a single shared `0.3.49` version.

The current lifecycle fixes reject intermediate `tool-calls` and `unknown` finishes, timestamp-only completion claims, and tool steps still requiring a follow-up model call. A completed error record can establish a terminal outcome; terminal does not imply success. Rechecks queued at the completion boundary are not dropped. Stop latches cancellation and notifies subscribers before attempting storage writes; if persistence fails, the guard still forwards abort and propagates the storage error, or both errors if abort also fails. Releasing the latch for a new prompt requires successful persistence. These are implementation changes; fresh browser evidence and coordinator validation must be recorded separately.

### Initial production-build browser evidence

Production Next.js `16.3.8` build ID `_v5Ie23KkgCrTzqJv30Af`; installed dependency versions match the current table, including the shared-stream override. CLI and authenticated health both reported opencode `1.18.35`. Enabled app, gate-off app, and opencode used loopback ports `45236`, `45237`, and `45238`; configured app origin was `http://127.0.0.1:45236`. A fresh disposable project/profile separated HOME/config/data/state/cache. Real models were `openai/gpt-4.1` and title model `openai/gpt-4.1-mini`; credentials were inherited without being read or printed. No mocks, fabricated responses, or adapter fork were used.

| #   | Check                                                 | Result     |
| --- | ----------------------------------------------------- | ---------- |
| 1   | Gate off                                              | PASS       |
| 2   | Auth + loopback                                       | PASS       |
| 3   | Exact app origin                                      | PASS       |
| 4   | Two native app tabs                                   | PASS       |
| 5   | Multiturn                                             | PASS       |
| 6   | Generated title + official metadata                   | PASS       |
| 7   | Title and session reopen                              | PASS       |
| 8   | Text/tool/text                                        | PASS       |
| 9   | Allow/deny                                            | PASS       |
| 10  | B15 Stop + captured late callback                     | PASS       |
| 11  | B15 reconnect/reload                                  | PASS       |
| 12  | B15 new approval                                      | PASS       |
| 13  | B18 server loss + partial transcript + no resend      | PASS       |
| 14  | B18 restart + reload/recheck                          | PASS       |
| 15  | Same-mount recovery/recheck without reload            | FAIL       |
| 16  | No password persistence                               | PASS       |
| 17  | AI SDK real smoke                                     | PASS       |
| 18  | ACP real smoke                                        | PASS       |
| 19  | Narrow viewport                                       | PASS       |
| 20  | Separate remote host                                  | NOT TESTED |
| 21  | Deferred React commit ordering                        | NOT TESTED |
| 22  | Storage failures / completion-boundary scheduler race | NOT TESTED |

The totals count these 22 rows, not expanded subchecks or the historical B1–B23 matrix.

- **Titles:** Server, `thread.metadata.title`, and official `threads.threadItems` titles agreed (`ORBIT_C_ONE_36 token confirmation` and `Token NEBULA_C_TWO_36 confirmation`). Zero `POST /summarize` requests and zero native HTTP 400 responses were observed. Reload/password re-entry restored the original session, transcript, and matching titles. The coordinator inspected this evidence.
- **B15:** Stop followed by invoking the captured real Allow callback left permission-reply count at 2 and the target file absent. Reconnect and reload exposed no Allow controls; a new prompt reconciled permissions, accepted a fresh approval (reply count 2 → 3), and wrote only the fresh target. This is the app-client boundary, not a server-side revocation guarantee.
- **B18 safe recovery:** Server termination during an approved `sleep 90` tool retained partial transcript and unknown warning; `prompt_async` count stayed 10. Restart with the same profile, full-page reload, password re-entry, and explicit Recheck returned status `{}`, assistant `finish: null` and completion `null`, retained unknown, and kept prompt count at 10. The interrupted tool remained unresolved despite `thread.isRunning=false`; no terminal success is claimed.
- **Same-mount FAIL:** After restart, raw unauthenticated health returned 401, but the existing page's direct fetch timed out at five seconds and explicit Recheck could not obtain healthy history. Reload restored HTTP 200 status/history. The root cause is unproven; reload/password re-entry is the proven recovery path. The failure is not reclassified as a seamless-reconnect pass.
- **Other checks:** Gate-off produced zero native requests and zero console/page errors. Wrong password failed; correct auth yielded health 401 then 200. An unconfigured loopback alias made zero native requests. Two sessions kept independent markers/context. Real read/allow/deny and AI SDK/ACP prompts passed; denied-file absence was verified, and missing post-denial completion surfaced unknown. Password inputs reset after reload and storage contained no password. At 390×844, native and ACP viewport/document/body widths were 390. Deliberate auth/process-loss console resource errors were expected.

The initial run included the shared-stream override and preceded the final approval-receipt/password-helper UI fixes. Test-owned services and browser were stopped, with empty listener/process checks.

### Final-build UI and bounded recovery follow-up

Build `n2l1GdZdCWQw-vH_Cy0h1` reused the retained disposable project/profile with opencode `1.18.35` and the same loopback app/server origins. This was not a fresh-profile test. The follow-up has **6 PASS and 1 FAIL across 7 rows**, separate from the initial 18/1/3 matrix.

| #   | Check                             | Result |
| --- | --------------------------------- | ------ |
| 1   | Password helper                   | PASS   |
| 2   | Password re-entry / restore       | PASS   |
| 3   | Settled Allow after Stop          | PASS   |
| 4   | Settled Deny after Stop           | PASS   |
| 5   | Pending B15 / late callback       | PASS   |
| 6   | Short-outage same-mount recovery  | PASS   |
| 7   | Longer-outage same-mount recovery | FAIL   |

The rebuilt password helper no longer mentioned the workaround. Reload left password fields blank, persisted no password, and restored session mappings. After Stop, completed writes still showed `Allowed · once` and successful file output; rejected writes still showed `Denied · reject` and the rejection. Only the pending approval showed Cancelled. Invoking its captured Allow callback left reply count **2 → 2**, and its target file remained absent.

With two mounted native runtimes over HTTP/1.1, a roughly two-second outage recovered same-mount event/status/history requests with HTTP 200 and no prompt resend. A longer outage of at least 15 seconds reproduced the stall: **12 outstanding reattach requests** lacked responses, primary-origin browser health timed out at **5001ms**, while `localhost` health returned **HTTP 200 in 16ms** and alias status/session calls completed in 195/210ms. Raw primary-origin health returned 401. Six Chrome primary-origin connections plus a working alias connection support a **per-origin transport/reconnect stall**, but the exact browser/SDK/server mechanism and causal role of those connections remain unproven; this is not a confirmed socket-exhaustion diagnosis.

Reload/password re-entry restored primary health/status in 192ms combined, retained unknown after explicit Recheck, and preserved session mappings. Prompt count stayed **5 → 5** through both outages, probes, and reload. This verifies safe recovery, not seamless reconnection. Owned services/browser were stopped and test-port listeners were absent.

### Repository gates and remaining limits

Repository gates passed: `bun install --frozen-lockfile`, `bun run format`, `bun run lint`, `bun run typecheck`, `bun test` (**100 passed, 0 failed; 17 files**), `bun run build`, `bun run models:check`, and `git diff --check`. Deterministic storage-failure and completion-boundary tests are separate from browser evidence. Remote-host access and deferred-commit/storage/scheduler browser injections remain NOT TESTED. Native model/agent controls stay disabled; tab-local persistence, unresolved recovered tools, and direct-server late replies remain limits. The longer-outage stall is #34 production-hardening work for the off-by-default experimental local-use lane, not evidence of unsafe prompt resend or a strict-isolation pass.

## Decision context

Read the full updated [#34](https://github.com/tbrandenburg/agentilogue/issues/34), [#33](https://github.com/tbrandenburg/agentilogue/issues/33), and [#35](https://github.com/tbrandenburg/agentilogue/pull/35) bodies/comments, plus [ADR 0001](../decisions/0001-agent-integration-lanes.md) and the earlier [comparison report](2026-10-opencode-integration-comparison.md). The issues returned no comments. The decision in #34 is a **one-user trusted-local** scope: configured projects/sessions are within the user's trust scope. #33's profile probe remains **NO-GO for project isolation**; it was not edited or rerun here and is not a failure of this revised scope.

## Historical 0.2.29 versions and compatibility

| Component                      | Version/evidence                                                                                                                             |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| opencode CLI/server            | `1.18.32` installed; separately installed `opencode-ai@1.18.35` reported health version `1.18.35`                                            |
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

The current opencode website's server docs identify the new v2 and were last updated Oct 8, 2026. The Context7 results likewise resolve current v2/dev sources, not the installed 1.18.32 implementation. I used them only as general orientation; CLI help and live tests below are the version-specific evidence. Official references: [opencode server docs](https://opencode.ai/docs/server/), [assistant-ui opencode quickstart](https://www.assistant-ui.com/docs/runtimes/opencode/quickstart), [adapter npm metadata](https://www.npmjs.com/package/@assistant-ui/react-opencode/v/0.2.29), [SDK npm metadata](https://www.npmjs.com/package/@opencode-ai/sdk/v/1.18.35).

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

Chrome requests were made from the app origin `http://localhost:3003` and an unapproved loopback-alias origin `http://127.0.0.1:3003` against opencode CLI/server 1.18.32 on loopback with `--cors http://localhost:3003`. All data was synthetic; no production credentials or profiles were used.

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

## Historical recommendation before experimental opt-in

Do not enable the native lane. Adapter 0.2.29's title endpoint mismatch is confirmed against CLI/server 1.18.32 and 1.18.35; matching those versions did not help. Browser testing showed that unauthenticated opencode with configured `--cors` allowed an unapproved loopback alias to read and create synthetic sessions. Basic auth blocked those same requests; the official SDK supports sending an Authorization header. The local user must enter the opencode server password at runtime, held ephemerally in browser memory and never bundled, persisted, or logged. The implementation is unconditionally fail-closed for the pinned adapter; there is no environment bypass. Unblocking requires an upstream adapter/server version, pinned in the app, plus evidence that a completed native prompt successfully generates a title (no summarize 400), and renewed origin/auth verification. No custom gateway is needed for the single-user trust model. Remote-host access remains **NOT TESTED**; the actual server bound only to loopback, and same-host Wi-Fi-IP connections were refused.

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

Server checks used curl against ports 44034 and 44035, and actual Chrome requests against opencode 1.18.32 on port 44334, including:

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

Owned server PIDs from the HTTP probe were `927303` and `928572`; both were sent `TERM`. Browser verification used task-owned opencode PIDs `934459` and `936818`, which were stopped; follow-up `ss` showed no listener on port 44334. The CLI 1.18.35 title probe ran under an owned npm-exec process group; follow-up `ss` showed no listener on 44335. The test profile, synthetic sessions and credentials were removed. Temporary profiles, response bodies and packed packages were cleaned after recording evidence. **At the time this initial research was performed**, no production validation suite was run because no production code changed.

## Gated implementation and manual E2E results (2026-10-10)

The E2E server used CLI/server `1.18.32`, SDK `1.18.35`, adapter `0.2.29`, a fresh temporary XDG profile and project with `opencode/gpt-4o-mini` configured, and a Basic-auth-protected loopback listener. A provider key was passed to the isolated server process from its environment but was not read, printed, or recorded. Test files and server state remained under `/tmp`.

- Exact pins: `@assistant-ui/react-opencode@0.2.29` and `@opencode-ai/sdk@1.18.35`.
- Bun 1.3.9 root overrides pin core `0.3.25`, store `0.3.18`, and tap `0.9.22`; `bun pm ls --all` showed one installed copy of each.
- Native server password is entered in the selected app tab, kept only in component memory, and sent in Basic Authorization headers. The app never receives that password in environment or page props, and does not persist or log it. Connection checks first require unauthenticated `/global/health` to return 401, then authenticated health to return 200.
- Native models and agents remain disabled because their catalogs and effective selection semantics are unverified. Native session mappings are saved in this browser tab's `sessionStorage` and restored after reload; the opencode password is never saved and must be re-entered. No server-side or cross-device persistence is claimed.
- The SDK custom-fetch workaround in `lib/opencode-native-title-workaround.ts` suppresses only the adapter's bodyless `/session/{id}/summarize` request with local 204; it forwards other calls. opencode's own first-prompt title generation was observed (`Smoke test NATIVE_E2E_OK response`). The upstream defect is [assistant-ui #9244](https://github.com/assistant-ui/assistant-ui/issues/9244). This workaround is temporary and must be removed when a fixed adapter release is verified.

| #   | Scenario                                    | Status                               | Observed evidence / remaining gap                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| --- | ------------------------------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| B1  | Gate off                                    | **PASS**                             | Fresh production app process without `OPENCODE_NATIVE_ENABLED` displayed `opencode · Native unavailable: Disabled by server configuration`; the Run with option was disabled and no native client was created.                                                                                                                                                                                                                                                                                                                                                                                               |
| B2  | Gate on and local auth                      | **PASS**                             | Browser connected at the configured loopback origin. Unauthenticated health was 401, authenticated health and session list were 200; wrong password displayed an auth error.                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| B3  | First native tab                            | **PASS**                             | First prompt created one session and streamed `NATIVE_E2E_OK`; exactly one `POST /session` preceded the prompt.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| B4  | Same-tab context                            | **PASS**                             | The second turn in the same session recalled `NATIVE_E2E_OK`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| B5  | Two native tabs                             | **PASS**                             | Separate tabs created distinct opencode session IDs; each recalled its own marker (`NATIVE_E2E_OK` vs `NATIVE_B_2026`). No cross-tab transcript bleed was observed.                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| B6  | Background and heterogeneous tabs           | **PASS**                             | With an approved native `sleep 90` command still running, an AI SDK tab returned `B6_FOREGROUND_AI_OK` and an ACP tab returned `B6_ACP_FOREGROUND_OK`. The native tab continued running with Stop available and its close control disabled; closing the completed ACP tab did not stop it. Stop then aborted the disposable command.                                                                                                                                                                                                                                                                         |
| B7  | Create/close/lock tabs                      | **PASS**                             | Added and closed completed AI SDK/ACP tabs while a native tab ran; closing the running native tab stayed disabled. After the other tab closed, the only remaining tab had no close control, preserving the last-tab guard.                                                                                                                                                                                                                                                                                                                                                                                   |
| B8  | Native model catalog                        | **PASS (honest disabled)**           | Model picker remains disabled because catalog discovery/application semantics were not verified.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| B9  | Default/explicit model continuation         | **PARTIAL**                          | Server-configured default model completed multi-turn prompts; explicit native model selection/override was not tested because the picker is disabled.                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| B10 | Agent selection                             | **PASS (honest disabled)**           | Agent picker remains disabled because catalog discovery/application semantics were not verified.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| B11 | Text/tool/text projection                   | **PASS**                             | Assistant text before and after a native file-read tool rendered in order; fixture contents matched.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| B12 | Permission allow/deny                       | **PASS**                             | Native write allowed once created exact `NATIVE_ALLOW_2026`; denied write file remained absent. ACP regression separately read, allowed, and denied synthetic files.                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| B13 | Always allow                                | **PASS — server-process scope**      | In project A, confirmed the UI's `*` rule with its explicit “until opencode is restarted” warning. A second write completed without another approval and did not modify `opencode.json`. After restarting opencode, the next write prompted again; after one-time approval it created only the expected disposable file. This grant is broad for that server process and is not a durable project rule.                                                                                                                                                                                                      |
| B14 | Native stream cancellation                  | **PASS**                             | Stop sent `POST /session/{id}/abort` → HTTP 200 / `true`; UI showed Aborted and `/session/status` had no active run afterward. ACP cancellation also showed its native confirmed-cancelled outcome.                                                                                                                                                                                                                                                                                                                                                                                                          |
| B15 | Cancel with permission pending / late reply | **PASS — native-client guard**       | The original opencode server race remains reproducible and is reported at [opencode issue #54332](https://github.com/anomalyco/opencode/issues/54332). A fresh browser created two concurrent pending writes and captured both rendered Allow callbacks. Stop sent `/session/{id}/abort`; both approval controls changed to `Cancelled — approval no longer available`. Invoking both stale callbacks afterward generated zero `/permission/{id}/reply` requests, and both target files remained absent. This verifies this app client's SDK fetch path, not arbitrary server clients or calls bypassing it. |
| B16 | Interactive questions                       | **PASS**                             | The native model generated a real multiple-choice question with options A/B. Selecting A and submitting it completed the question tool; the assistant acknowledged the answer.                                                                                                                                                                                                                                                                                                                                                                                                                               |
| B17 | SSE disconnect/reconnect                    | **PASS (fault-injected)**            | Playwright aborted the real `/event` request during an active prompt, then restored it. One event request reconnected successfully; `SSE_DROP_RECOVERED` appeared once in the user prompt and once in the reply, with no duplicate prompt. This was a controlled browser network fault, not server loss.                                                                                                                                                                                                                                                                                                     |
| B18 | Server loss/recovery                        | **PASS — unknown surfaced**          | In the follow-up browser test, opencode was stopped during an active prompt and restarted with the same temporary profile. The synthetic session remained; `/session/status` returned no entry for it, and the latest assistant record had `finish: null` with no `time.completed`. The app displayed `Outcome unknown — terminal completion could not be confirmed. Retrying the prompt can repeat side effects.` after server loss and retained it after restart. `lastEventAt` remains only a bounded quiet-event heuristic, not a definitive disconnection signal.                                       |
| B19 | Disconnect/reattach and reload              | **PASS — native tab scope**          | A completed native conversation saved its project-scoped session mapping in tab `sessionStorage`. A full-page reload restored the same conversation and opencode session; after re-entering the in-memory-only Basic password, the prior `B19_RELOAD_MARKER` transcript returned. AI SDK transcripts, cross-device persistence, and restoration under a different project configuration remain unsupported.                                                                                                                                                                                                  |
| B20 | Same-user multi-project scope               | **PASS — configured project scope**  | Using the same synthetic user/profile, a separately configured opencode server/app instance on `project-b` completed `B20_PROJECT_B_OK`; its approved `b20-project-b.txt` landed in `project-b` and was absent from project A. This verifies switching by configuring another trusted-local server/app instance; it does not add per-project authorization or isolation, and the UI does not dynamically switch a running server's project.                                                                                                                                                                  |
| B21 | Title and versions                          | **PASS (temporary workaround)**      | Bodyless summarize was absent from server traffic; opencode generated a session title on first prompt. Native title propagation into a visible assistant-ui thread list is not part of the current UI and was not tested.                                                                                                                                                                                                                                                                                                                                                                                    |
| B22 | Mobile/console                              | **PASS — production smoke**          | At 390×844, viewport, document and body widths were all 390. A fresh production browser context on the gate-off build reported zero console errors; this avoids relying on dev HMR output.                                                                                                                                                                                                                                                                                                                                                                                                                   |
| B23 | AI SDK and ACP regression                   | **PASS (foreground and background)** | AI SDK returned `B6_FOREGROUND_AI_OK` and ACP returned `B6_ACP_FOREGROUND_OK` while a native bash tool was still running in another tab. A separate ACP smoke returned `ACP_MERGE_READY_SMOKE`; AI SDK also returned its exact foreground marker.                                                                                                                                                                                                                                                                                                                                                            |

### Remaining launch blockers

1. **B15 scope:** opencode still accepts a direct late permission reply after session abort. The app-local fetch guard blocks the captured stale assistant-ui reply in the tested native browser path; arbitrary clients and calls that bypass this client guard are outside this mitigation.
2. **NOT TESTED / intentionally unsupported:** a separate remote host was not available (opencode listened only on loopback and prior same-host non-loopback connections were refused); a synthetic delayed React commit was not injected; explicit native model and agent selection remain disabled until catalog/application semantics are verified. The project-scoped app uses one configured opencode server at a time; use another trusted-local app/server configuration to select another project.

The upstream title workaround is for local E2E only. PR #36 and #34 remain open; this report does not claim the B1–B23 matrix has passed or that the native lane is production-ready. The separate upstream cancellation race is reported at [opencode #54332](https://github.com/anomalyco/opencode/issues/54332). #33 remains **NO-GO for project isolation** and its report/probe are unchanged.

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

These checks do not replace the remaining manual E2E cases. The latest browser tests used only temporary project/profile data and a synthetic opencode Basic password; the provider key was passed from the environment to the temporary server and not read or recorded.

## Historical temporary title workaround (2026-10-10; since removed)

An additional follow-up on this PR files the upstream adapter defect at [assistant-ui #9244](https://github.com/assistant-ui/assistant-ui/issues/9244). opencode v1.18.35 generates native titles through its first-prompt `SessionPrompt.ensureTitle` path; the assistant-ui adapter instead called the session compaction endpoint from `generateTitle`.

For explicitly opted-in **manual E2E testing only**, `lib/opencode-native-title-workaround.ts` supplies the published SDK's configurable `fetch` hook. It returns an empty successful HTTP 204 response **only** for a bodyless `POST /session/{id}/summarize`, the invalid call from adapter 0.2.29. It forwards all other requests, including compaction with a real model body, through ordinary `fetch`. This changes no assistant-ui package, SDK code, server API, security boundary, or package version. The app continues to require loopback URLs, an exact configured app origin, explicit feature opt-in, and verified Basic auth with a user-entered in-memory password. The experiment does **not** claim that opencode's native generated title already propagates into assistant-ui's thread-list title.

The original automatic-title **FAIL** remains a valid observation for the unmodified adapter; the workaround avoids that specific network request instead of proving upstream compatibility. A real first prompt nevertheless produced an opencode server-generated title, and no summarize request reached the server. The experimental gate is available only for trusted-local E2E. The B1–B23 matrix is partial: question handling, persistent permission semantics, remote-host access, full-page recovery, same-user multi-project switching, and some mixed-runtime background cases remain untested. **Production enablement and closure of #34 are blocked.** Remove the custom-fetch workaround once an upstream adapter release has verified native title behavior.

## Historical B15/B18 mitigations on adapter 0.2.29 (updated 2026-10-11)

The current worktree adds a native-client-scoped SDK fetch guard and a native-only outcome status. The guard tracks pending permission IDs from the pinned public `useOpenCodePermissions()` hook. At `POST /session/{id}/abort`, it invalidates its current pending IDs synchronously before forwarding the abort and notifies subscribers; the native tool fallback subscribes directly so stale Allow/Always allow/Deny controls are removed synchronously. `POST /permission/{id}/reply` for an invalidated ID throws before reaching `fetch`; the existing title workaround still handles only the bodyless summarize request. In the live B15 race below, the previously captured assistant-ui Allow callback was invoked after abort and the server received no permission-reply request. AI SDK, ACP, and the shared Thread are unchanged. This client-local guard does not protect arbitrary server clients or calls bypassing the mounted native client's fetch.

The status component consumes public `useOpenCodeThreadState()` and runtime thread running state. The installed SDK 1.18.35 public `AssistantMessage` type defines `finish?: string` and `time.completed?: number`; only a non-empty finish string or finite numeric completion time counts as terminal. `finish: null` plus absent completion is therefore inconclusive. The pinned adapter has no explicit disconnected status: `sync.lastEventAt` is used only as a bounded quiet-event heuristic, not definitive disconnect detection. When the server reports `busy`, the quiet-event notice is bounded by that heuristic and polls status every five seconds. When a run becomes idle, status/history are always rechecked, including after user-requested Stop; advancing `lastEventAt` clears stale quiet state before rechecking. Status and history calls have five-second timeouts so an abandoned request cannot prevent a later recovery check. A confirmed active run or terminal evidence clears stale uncertainty; idle without terminal evidence remains unknown. Acknowledgement only hides that warning for the current mounted native tab.

| Case                                                         | Result                               | Evidence / limitation                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ------------------------------------------------------------ | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| B15 pending writes, Stop, and captured late replies          | **PASS — native client path**        | Real browser with opencode 1.18.32, SDK 1.18.35, adapter 0.2.29, Basic auth, and disposable project/profile. Two writes were concurrently awaiting approval. Captured both rendered Allow handlers, then Stop sent `/session/{id}/abort`; both controls changed to `Cancelled — approval no longer available`. Invoking both captured handlers afterward generated zero `/permission/{id}/reply` requests, and both target files remained absent. This is limited to this app client's SDK fetch path.                                           |
| B15 invalidated reply rejection                              | **PASS (focused tests only)**        | `bun test tests/opencode-native-run-guard.test.ts` verifies abort-before-forward ordering, rejection before delegate/network for invalidated replies, permanent old-ID blocking, validity of later IDs, per-runtime scope, abort failure, and synchronous invalidation notification. This is not a browser/server late-reply proof.                                                                                                                                                                                                              |
| B15 concurrent pending IDs and delayed UI commit             | **PASS (concurrent IDs); PARTIAL**   | The real browser test covered two simultaneously pending approvals and stale callback invocation after Stop. A synthetic delayed React commit was not injected; pending-ID synchronization continues to use the public hook in a layout effect.                                                                                                                                                                                                                                                                                                  |
| B18 terminal evidence and interrupted-history classification | **PASS — focused tests and browser** | Focused tests cover server busy as active, terminal evidence as completed, and idle `finish: null`/absent completion—including after abort—as unknown. In a fresh browser restart test, public status was empty and the latest assistant record had no terminal evidence; the UI surfaced the explicit unknown-outcome warning. A locally running tool presentation remained after reconnect, so this does not claim assistant-ui's run state recovers.                                                                                          |
| B18 quiet-event heuristic behavior                           | **PASS — browser recovery rerun**    | The real restarted-server test exposed that updates to the whole thread-state object could keep resetting the quiet-period timer, and that an in-flight SDK status/history request could block later checks indefinitely. The effect now tracks the event timestamp and bounds both SDK status and history calls to five seconds. After the fix, the warning appeared after recovery, remained after explicit recheck, and no second prompt request was sent. Event silence remains a bounded heuristic, not definitive disconnection detection. |

After adding tab-scoped session recovery, a second test restored the real interrupted session ID after a full reload, re-entered the Basic password, and confirmed that the warning appeared and remained after Recheck status. No new `POST /session` or `POST /prompt_async` was sent. The interrupted ID was seeded into a fresh test tab; a separate completed-prompt run verified the app-generated `sessionStorage` write and restore path. The browser still showed the old tool call as unresolved after reattachment.

The B15 browser test invokes two stale callbacks captured from the real permission UI after Stop; the native SDK client guard prevents either late reply from reaching the server, and both target files remain absent. This is a native-client-only guarantee: direct server callers and requests bypassing this client's fetch guard are not protected. B18 recovery surfaces unknown when authenticated `/session/status` is empty and persisted assistant history lacks terminal evidence. A full reload with a retained native session mapping restores the transcript and surfaces unknown after password re-entry; the interrupted-session reload used the actual opencode session ID in a restored `sessionStorage` record, while the completed-session reload separately exercised the app-generated record. Explicit recheck preserves the warning and sends no prompt. The local assistant-ui runtime can retain the tool as unresolved after server loss, so the client does not claim to settle that run. Tracking the whole public thread-state object caused the quiet-period timer to be reset by unrelated updates; the effect now keys off `lastEventAt`, status/history calls time out after five seconds, and an initial history reconciliation distinguishes empty sessions from interrupted prompts. The pinned public `OpenCodeThreadState.sync` exposes `lastEventAt` but no connected flag, so event silence is only a heuristic. The public `useOpenCodeRuntimeExtras()` hook threw when the adapter/runtime context became unavailable during an earlier restart attempt, so status checks use public SDK status/messages calls alongside the public thread-state hook rather than assuming that hook remains callable after disconnection.

### Focused follow-up validation

```text
bun run format — passed
bun run lint — passed
bun run typecheck — passed
bun test — 90 passed, 0 failed (17 files)
bun run build — passed (Next.js 16.3.8 production build)
bun run models:check — passed (model catalog matches models.dev)
git diff --check — passed
```

The focused tests cover synchronous B15 guard notifications, B18 busy/terminal/unknown outcome transitions, and project-scoped native session recovery data. Browser tests cover gate-off behavior, B6 mixed-runtime background execution, B13's server-process permission scope, B15's concurrent pending approvals, B16 questions, B19 native reload restoration, B20 separately configured trusted-local projects, B22 production/mobile smoke, and B23 AI SDK/ACP regression. The remaining unsupported or unverified behavior is called out in the matrix; these results do not claim production readiness.

## Review follow-up for 26dcd1f: four focused lifecycle fixes

This section supersedes the earlier delayed-commit and reconnect limitations for this app client.

- **Delayed permission commit:** Stop sets a cancellation latch even when the pending-ID set is empty. Later pending-ID commits are quarantined rather than admitted. A deterministic test defers the pending-ID commit until after the actual guard forwards abort, then verifies the approval is invalidated and its reply never reaches the delegate.
- **Reconnect/reload:** Cancellation state is stored separately from transcript mappings in tab `sessionStorage`, scoped to server URL and conversation ID, without credentials. A reconstructed guard preserves invalidated IDs and blocks server-retained requests. Before a new prompt can release the latch, it reads the real permission list and permanently quarantines stale IDs for that native session. Failed/malformed reconciliation or another Stop keeps the gate closed. Storage errors are propagated, not treated as permission to reply.
- **Retry:** Both `busy` and `retry` mean active. A retry cannot fall through to interrupted-history classification merely because the server is waiting to retry a provider request.
- **Recovery-check race:** Concurrent rechecks are coalesced, not discarded. Queued work reruns using the latest committed callback/state, and superseded responses do not update notices. The deterministic test holds an earlier busy check, queues intermediate and terminal checks, then verifies only the latest terminal result is applied.

Browser reruns used opencode 1.18.32 with the existing pinned adapter/SDK and disposable project/profile:

| Scenario                                                | Evidence                                                                                                                                                                                                                                                                         |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B15 stale permission, Stop, reconnect, reload           | The real server retained one pending write after Stop. Invoking the captured stale Allow handler sent zero permission replies. After Disconnect/Reconnect and full reload/password re-entry, no Allow control was available. `review-stale-permission.txt` stayed absent.        |
| B18 server loss and recovery                            | Stopped opencode during an approved `sleep 60` tool. The mounted app displayed unknown. Restarting with the same profile returned no active status and an assistant record with no finish/completion evidence; explicit Recheck retained the warning. No prompt was resubmitted. |
| B18 terminal recheck behind an in-flight status request | Delayed one real HTTP status response (no fabricated response), then clicked Stop. The browser issued two status requests across the race; after release, Stop and the quiet-active/unknown notices were absent. This supplements the deterministic coalescing test.             |

The official `useOpenCodeRuntime` and public SDK boundary remain in use. No adapter fork, agent framework, backend proxy, or provider-neutral projection was added. These safeguards do not revoke permission requests in opencode v1, prevent replies from other clients, or survive deliberate deletion of this browser tab's cancellation storage. The native runtime can still retain an unresolved tool presentation after process loss. Merge assessment is for the experimental **off-by-default** integration, not production enablement or unrelated future native features.

Focused review gate: `bun run typecheck`, `bun test` (94 passed, 0 failed; 18 files), `bun run format`, `bun run lint`, `bun run build` (Next.js 16.3.8), and `git diff --check` passed. Test-owned opencode and app processes were stopped. The four reviewed findings are addressed for the experimental milestone; the title workaround, tab-local persistence scope, direct-server permission race, and unresolved native tool presentation remain documented release risks rather than claims of production readiness.
