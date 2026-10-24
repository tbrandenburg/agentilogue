# opencode · Native: support and known issues

**Proposed trusted-local support scope (opt-in):** one trusted user on one machine, app and opencode server bound to loopback, HTTP Basic auth on the opencode server, exact configured app origin. Native remains experimental pending [two-tab reload recovery #65](https://github.com/tbrandenburg/agentilogue/issues/65) and maintainer GO. That user's projects/sessions share one trust scope. Tools use the user's native opencode policy and filesystem authority, not an agentilogue sandbox. Remote/LAN/proxy/public hosting, multiple users, and access by untrusted webpages are outside support. Loopback/CORS are not authentication. See [setup](/README.md#native-experimental-trusted-local-opt-in).

| Limitation                                                                             | Safe behavior / boundary                                                                                                                                                                                  |
| -------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Same-page requests can stall after a server outage, including short active-run outages | Full-page reload, re-enter the server password in each restored chat, then inspect history and partial work. Seamless reconnect is not promised; the transport cause is unconfirmed.                      |
| Interrupted work has no terminal completion evidence; tool cards may remain unresolved | **Outcome unknown** is not success or confirmed cancellation. Inspect file effects before manually retrying; retries can repeat side effects. No automatic prompt resend, resume, or replay.              |
| Same-user cross-project session/file visibility                                        | No project ACL or filesystem sandbox. [#33 remains NO-GO for strict isolation](https://github.com/tbrandenburg/agentilogue/issues/33).                                                                    |
| Late permission protection is client-scoped                                            | Stop invalidates this app's pending approval callbacks. It does not revoke permissions for arbitrary direct server clients; the upstream server race is not fixed here.                                   |
| Session mapping is tab-local `sessionStorage`, not durable account history             | Reload can restore the mapping while browser storage and native history survive. Missing/cleared storage can prevent restoration. Passwords stay in chat memory and require re-entry; never persist them. |
| Model/agent choices lock after first send or session restoration                       | Start a new session to change them. Default delegates to native agent/session/server semantics, not an explicit reset. Catalog failure leaves unverified explicit choices unavailable.                    |
| Upstream adapter API is experimental                                                   | Tested adapter `@assistant-ui/react-opencode@0.2.30`, SDK `@opencode-ai/sdk@1.18.35`, server/CLI `1.18.35`. Pin and retest upgrades; an incompatible global v2 CLI is not this server generation.         |

## Recovery and emergency disable

When **Connection could not recover…** appears, reload the page and re-enter the local server password to restore the session. Preserve/inspect partial work; **Retrying the prompt can repeat side effects**. Recheck is read-only, and unknown remains unknown unless native terminal evidence is available. Do not bypass Basic auth or widen the listener/origin to recover.

Unset `OPENCODE_NATIVE_ENABLED` or set it to `0`, then restart the app to disable the native option. It remains off by default. AI SDK and opencode ACP remain separate supported lanes.

## Verification and historical evidence

Verified **2026-10-24** with a frozen install, production Next.js `16.3.8` build, Playwright `1.63.0` / Chrome `154.0.8037.92`, pinned native versions above, disposable loopback ports/projects/HOME/XDG profiles, and real models (`openai/gpt-4.1`, `openai/gpt-4.1-mini`). No mocked E2E responses or runtime changes.

| Production browser check                                                                         | Result                                                |
| ------------------------------------------------------------------------------------------------ | ----------------------------------------------------- |
| Gate off / invalid server URL: native disabled, zero native requests                             | PASS                                                  |
| Missing/wrong password, health 401/401/200, exact-origin mismatch blocked                        | PASS                                                  |
| Two-turn/two-native-tab context and model/agent choices; official runtime/server title agreement | PASS                                                  |
| Native read/tool display, approved write effect, denied-file absence                             | PASS                                                  |
| Stop plus captured mounted late Allow callback: no reply dispatch or file write                  | PASS                                                  |
| Reload/password re-entry, same session/history, no stored password or replay                     | PASS                                                  |
| Active-tool server loss: partial transcript/unknown, no automatic resend                         | PASS                                                  |
| Same-mounted-page recheck after 2s and 16s downtime                                              | FAIL — accepted limitation; reload fallback passed    |
| Guidance survives acknowledgement; reload restores history and retains unknown                   | PASS — five explicit prompts, no outage/reload resend |
| Real AI SDK/ACP smoke, native 390×844 layout, no unexpected browser errors                       | PASS                                                  |
| Separate remote host                                                                             | NOT TESTED — unsupported                              |
| Strict project isolation                                                                         | NO-GO from #33 — outside this support contract        |

These are current local-support checks, not a rewrite of earlier results. Preserve [#34's production evidence and failures](/docs/spikes/2026-10-opencode-local-boundary-issue-34.md), [#37's recovery investigation](/docs/spikes/issue-37-native-recovery.md), and [#38's selection semantics](/docs/spikes/issue-38-native-selection.md). The [dated ADR addendum](/docs/decisions/0001-agent-integration-lanes.md#2026-10-24-addendum-proposed-trusted-local-native-product-support) separates product support from [upstream API stability](https://www.assistant-ui.com/docs/runtimes/opencode/overview).

The coordinator independently passed the production safety/feature acceptance. Its recovery rerun restored the active chat after both outages without resend, but timed out reconnecting the other restored tab after the 16s outage. That run exited 1; it is **not** a passing two-tab fallback result. The earlier matrix remains attributed to the initial run, and #65 blocks graduation until reconciled. The separate generic upgrade proof also timed out waiting five seconds for native Model availability; dedicated selection acceptance passing does not rewrite that failure.
