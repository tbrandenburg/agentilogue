# opencode · Native: support and known issues

**Supported for trusted-local use (opt-in):** one trusted user on one machine, app and opencode server bound to loopback, HTTP Basic auth on the opencode server, exact configured app origin. That user's projects/sessions share one trust scope. Tools use the user's native opencode policy and filesystem authority, not an agentilogue sandbox. Remote/LAN/proxy/public hosting, multiple users, and access by untrusted webpages are outside support. Loopback/CORS are not authentication. See [setup](/README.md#native--supported-for-trusted-local-use-opt-in).

| Limitation                                                                             | Safe behavior / boundary                                                                                                                                                                                        |
| -------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Same-page recovery is not guaranteed for every outage                                  | The tested 2s/16s cases pass after #65's first-event lifecycle correction. If recovery fails, reload, re-enter each chat's password, and inspect history/partial work. No universal seamless-reconnect promise. |
| Interrupted work has no terminal completion evidence; tool cards may remain unresolved | **Outcome unknown** is not success or confirmed cancellation. Inspect file effects before manually retrying; retries can repeat side effects. No automatic prompt resend, resume, or replay.                    |
| Same-user cross-project session/file visibility                                        | No project ACL or filesystem sandbox. [#33 remains NO-GO for strict isolation](https://github.com/tbrandenburg/agentilogue/issues/33).                                                                          |
| Late permission protection is client-scoped                                            | Stop invalidates this app's pending approval callbacks. It does not revoke permissions for arbitrary direct server clients; the upstream server race is not fixed here.                                         |
| Session mapping is tab-local `sessionStorage`, not durable account history             | Reload can restore the mapping while browser storage and native history survive. Missing/cleared storage can prevent restoration. Passwords stay in chat memory and require re-entry; never persist them.       |
| Model/agent choices lock after first send or session restoration                       | Start a new session to change them. Default delegates to native agent/session/server semantics, not an explicit reset. Catalog failure leaves unverified explicit choices unavailable.                          |
| Upstream adapter API is experimental                                                   | Tested adapter `@assistant-ui/react-opencode@0.2.30`, SDK `@opencode-ai/sdk@1.18.35`, server/CLI `1.18.35`. Pin and retest upgrades; an incompatible global v2 CLI is not this server generation.               |

## Recovery and emergency disable

When **Connection could not recover…** appears, reload the page and re-enter the local server password to restore the session. Preserve/inspect partial work; **Retrying the prompt can repeat side effects**. Recheck is read-only, and unknown remains unknown unless native terminal evidence is available. Do not bypass Basic auth or widen the listener/origin to recover.

Unset `OPENCODE_NATIVE_ENABLED` or set it to `0`, then restart the app to disable the native option. It remains off by default. AI SDK and opencode ACP remain separate supported lanes.

## Verification and historical evidence

Verified **2026-10-24** with a frozen install, production Next.js `16.3.8` build, Playwright `1.63.0` / Chrome `156.0.8078.47`, pinned native versions above, disposable loopback ports/projects/HOME/XDG profiles, and real models (`openai/gpt-4.1`, `openai/gpt-4.1-mini`). No mocked E2E responses. The small compatibility bridge waits for an actual first event, propagates stream errors, and requires the maintained runtime's caller-owned abort signal; it is not a general return-only iterator cancellation API. Retest/remove it with a separately validated upstream upgrade.

| Production browser check                                                                         | Result                                                                      |
| ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------- |
| Gate off / invalid server URL: native disabled, zero native requests                             | PASS                                                                        |
| Missing/wrong password, health 401/401/200, exact-origin mismatch blocked                        | PASS                                                                        |
| Two-turn/two-native-tab context and model/agent choices; official runtime/server title agreement | PASS                                                                        |
| Native read/tool display, approved write effect, denied-file absence                             | PASS                                                                        |
| Stop plus captured mounted late Allow callback: no reply dispatch or file write                  | PASS                                                                        |
| Reload/password re-entry, same session/history, no stored password or replay                     | PASS                                                                        |
| Active-tool server loss: partial transcript/unknown, no automatic resend                         | PASS                                                                        |
| Same-mounted-page recheck after 2s and 16s downtime                                              | PASS for tested cases after lifecycle correction; not a universal guarantee |
| Guidance survives acknowledgement; reload restores history and retains unknown                   | PASS — five explicit prompts, no outage/reload resend                       |
| Real AI SDK/ACP smoke, native 390×844 layout, no unexpected browser errors                       | PASS                                                                        |
| Separate remote host                                                                             | NOT TESTED — unsupported                                                    |
| Strict project isolation                                                                         | NO-GO from #33 — outside this support contract                              |

These are current local-support checks, not a rewrite of earlier results. Preserve [#34's production evidence and failures](/docs/spikes/2026-10-opencode-local-boundary-issue-34.md), [#37's recovery investigation](/docs/spikes/issue-37-native-recovery.md), and [#38's selection semantics](/docs/spikes/issue-38-native-selection.md). The [dated ADR addendum](/docs/decisions/0001-agent-integration-lanes.md#2026-10-24-addendum-trusted-local-native-product-support) separates product support from [upstream API stability](https://www.assistant-ui.com/docs/runtimes/opencode/overview).

Historical coordinator runs failed second-tab restoration and generic Model readiness; those results are not reclassified. [#65](https://github.com/tbrandenburg/agentilogue/issues/65) traced false reconnect/resync traffic to the lazy SDK subscription contract, with browser socket-pool pressure. After correction, repeated production runs restored **both chats after both outages**, with retained history/unknown state and **five prompts, no resend**. Reproduce from a built checkout with `RECOVERY_OPENCODE_BIN=/absolute/path/to/opencode-1.18.35 node tests/e2e/native-recovery.mjs`; the script checks free ports and uses `next start`. Dedicated safety acceptance and a fresh post-fix generic upgrade proof passed; the earlier generic failure remains a historical result.
