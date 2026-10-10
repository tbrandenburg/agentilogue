# Issue #34: OpenCode local-browser boundary and adapter compatibility

**Status:** Research and an implementation are present. The lane is unavailable, including when the ordinary native environment gate is enabled, because the pinned adapter title request returns HTTP 400 on both tested CLI versions. Do not enable it until a supported upstream adapter/server pair is pinned and successful automatic title generation is verified. Basic auth must be enabled; the app requires a user-entered password and checks unauthenticated health returns 401 before checking authenticated health. Exact app-origin matching is additional client-side defense-in-depth, not a replacement for Basic auth/CORS.

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

## Gated implementation findings

- Added exact pins for `@assistant-ui/react-opencode@0.2.29` and `@opencode-ai/sdk@1.18.35`; frozen installation and project validation are recorded in the implementation handoff.
- Bun 1.3.9 root overrides pin `@assistant-ui/core@0.3.25`, `@assistant-ui/store@0.3.18`, and `@assistant-ui/tap@0.9.22`. After a forced reinstall to remove stale nested package directories, `bun pm ls --all` showed one copy of each, and Node resolution from both the app root and adapter resolved to the same files. `bun install --frozen-lockfile` passed; `bun test` passed 75 tests with no duplicate-core warning.
- `OPENCODE_NATIVE_ENABLED=1`, a loopback `OPENCODE_NATIVE_URL`, and loopback `OPENCODE_NATIVE_APP_ORIGIN` are configuration inputs only; they do not enable the Run target while the pinned title incompatibility remains.
- The password is entered in the selected native tab, tested against `/global/health`, kept in component memory, and sent as an Authorization header. It is not an app environment value, prop, URL, persistent value, or logged value.
- The official runtime owns native transcript and runtime behavior. The settled session id callback is stored in the existing ephemeral app tab; there is no durable reload mapping. Native model and agent controls remain disabled because this implementation did not prove their catalog/application semantics.
- The package source contains no title-generation disable option. Its thread-list adapter calls `session.summarize({ sessionID })` without a body; no upstream workaround was introduced. B21 title/version success remains **FAIL / blocker**, not PASS. App-origin mismatch is checked before native client construction/request; this is defense-in-depth, not a replacement for Basic auth/CORS.
- Native real-chat/tool/browser E2E, separate remote-host access, and existing-lane E2E were not rerun in this implementation phase and remain **NOT TESTED**. This implementation does not upgrade the #33 project-isolation NO-GO evidence or make a per-project authorization claim.
- Coordinator browser smoke test with the production build, `OPENCODE_NATIVE_ENABLED=1`, loopback URL, and configured app origin: **PASS (blocked before connect)**. The Run with option remained disabled with the pinned title-incompatibility reason, and the browser recorded no requests to the configured OpenCode server. This is not B1 (gate-off) and does not test the gated password form or native runtime; B1 is **NOT TESTED**.
- Coordinator validation after dependency deduplication: `bun install --frozen-lockfile`, `bun run format`, `bun run lint`, `bun run typecheck`, `bun test` (75 passed, 0 failed across 13 files), `bun run build`, `bun run models:check`, and `git diff --check` passed. `bun pm ls --all` showed a single version each of core/store/tap. Build and test do not resolve the title compatibility blocker or replace the untested native manual E2E matrix.
