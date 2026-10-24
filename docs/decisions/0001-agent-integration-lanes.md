# ADR 0001: Choose agent integrations at the boundary that fits

**Status:** Accepted  
**Date:** 2026-10-10  
**Related:** [Issue #29](https://github.com/tbrandenburg/agentilogue/issues/29), [Issue #33](https://github.com/tbrandenburg/agentilogue/issues/33), [Issue #34](https://github.com/tbrandenburg/agentilogue/issues/34), [opencode comparison spike](../spikes/2026-10-opencode-integration-comparison.md), [trusted-local boundary and E2E report](../spikes/2026-10-opencode-local-boundary-issue-34.md)

## Context

Agentilogue has an established opencode ACP implementation and a first-class AI SDK `/api/chat` lane. Assistant-ui also publishes an experimental `useOpenCodeRuntime` adapter. The comparison and follow-up probe found that direct server access can expose sessions and project files across directories in the tested configuration. That evidence remains valid: profile separation is not a security sandbox, and the probe remains **NO-GO for project isolation**. The maintainer's revised decision scopes the proposed native lane to one trusted local user; cross-project access by that same user is within this product trust boundary, rather than a required authorization guarantee. See the linked report and [#33](https://github.com/tbrandenburg/agentilogue/issues/33) for exact evidence, tests, and limits.

The app needs a maintainable path to multiple agents without making ACP mandatory, copying adapter implementations, or reducing native agent behavior to a premature lowest-common-denominator interface.

## Decision

1. **Use assistant-ui `AssistantRuntime` as the common frontend contract.** AGENTILOGUE's `Thread` consumes an `AssistantRuntime` supplied by `AssistantRuntimeProvider`. Each integration may supply it through a maintained assistant-ui hook or a custom runtime adapter. This does **not** prescribe an identical backend.
2. **Keep ACP as the current opencode lane.** Its server-owned project, conversation/session binding, native run lifecycle and independent permission/cancel controls fit the current trusted-local architecture. This is a current implementation choice, **not** an ACP-first rule.
3. **Evaluate a maintained assistant-ui adapter first** for each new integration. Adopt it only after verifying installed-package compatibility, a concrete browser-to-local-server access boundary appropriate to the deployment, conversation/tab isolation, truthful completion/cancellation, live permission handling, reconnect/reattach claims, and preservation of important native capabilities. Use its public runtime and existing `Thread` instead of duplicating projection logic.
4. **Choose protocols at the boundary they actually serve.** ACP is an option for local native-agent processes; AG-UI is an agent-to-UI event/interaction protocol; A2A is for remote agent task/artifact interactions. None is a mandatory intermediate layer.
5. **Use a native SDK/API with minimal server glue when justified** by a missing maintained adapter, security/deployment ownership, or a tested native capability. Keep provider-specific semantics at that adapter boundary.
6. **Keep `AgentProvider` optional and scoped.** `AgentProvider`, `RunObservation`, `RunSnapshot`, `AgentRunEvent`, and `/api/agent` are authoritative **for the app-owned provider-neutral backend lane**. A framework-native integration need not implement, translate through, or duplicate them. Shared security and lifecycle _behaviors_ must still be demonstrated in each lane.

Agent-specific behavior remains agent-specific: project/workspace selection, process lifecycle, session identity and history, model/agent selection semantics, native permissions and questions, cancellation evidence, tool parts, and child-agent transcript shape. Normalize only behaviors required at an actual shared boundary; do not force every integration through `AgentProvider`.

**Trust boundary:** The native opencode lane is for one trusted local user. That user's configured projects and sessions are within the same trust scope; the app does not promise per-project authorization or isolation. The #33 evidence remains a NO-GO for project isolation and documents why separate profiles are not security sandboxes. It does not by itself block this single-user scope. No multi-user authentication/proxy, OS sandbox, or per-project profile is required solely to enforce a boundary between projects of that same user.

**Experimental implementation:** PR #36 provides the off-by-default trusted-local opt-in for experimental local use described in the boundary report. The enablement requirements below govern production approval; the experimental milestone does not establish that they have passed.

Before enablement, implementation must still demonstrate a concrete browser-to-local-server access boundary. Loopback binding is not authorization; verify allowed-origin/CORS behavior and server authentication in the actual deployment, including requests from unauthorized websites and remote clients. Never embed an app-owned privileged secret in frontend code. Do not expose the server to unrestricted external clients. opencode documents loopback as the `serve` default, configurable browser origins via `--cors`, and optional HTTP Basic auth via `OPENCODE_SERVER_PASSWORD`; these controls must be tested together for the chosen client flow ([opencode server docs](https://opencode.ai/docs/server/)).

**Scope of acceptance:** This ADR approves the **integration-selection policy**, the one-user trusted-local scope, and retention of the current ACP opencode lane. It does **not** approve a general multi-user or remotely exposed service, replace ACP, introduce new integrations, or change the TypeScript contracts.

## Options considered

- **Keep ACP for opencode:** selected for the current product lane; preserves the server-owned project/session boundary and has live lifecycle evidence.
- **Add assistant-ui native opencode runtime:** selected for an off-by-default experimental opt-in under the one-user trusted-local scope. Runtime configuration requires authenticated loopback access and an exact app origin. Production approval remains pending #34 hardening and compatibility evidence; the tested cross-project listing/file access remains documented as a limitation, not a project-isolation pass.
- **Support both opencode lanes:** ACP remains supported alongside the experimental native lane. This does not approve native production use or remove the ACP path.
- **Build a custom runtime or universal service/registry:** rejected; duplicates maintained assistant-ui behavior or adds abstractions without a second provider selection requirement.

## Consequences

- The existing ACP and AI SDK `/api/chat` paths remain unchanged.
- ACP remains an implementation choice for this native opencode integration, not a rule for every future agent.
- Future adapter work must record actual package/peer versions, project/session ownership, native cancellation/permission semantics, and evidence for each advertised capability.
- A native opencode lane may reduce app-owned code. The experimental lane is opt-in and must demonstrate browser-to-local-server protection and compatibility before production approval; it makes no per-project authorization claim. Adapter `0.2.30` includes upstream [PR #9245](https://github.com/assistant-ui/assistant-ui/pull/9245)'s title fix; browser evidence confirms official title agreement/restoration and final approval-receipt UI behavior without the former workaround. Short-outage recovery passed, but longer-outage same-mount recovery stalled with exact cause unproven. Reload/password re-entry is the proven safe recovery path, retaining unknown outcome without prompt resend. #34 remains production hardening; #33 remains NO-GO for strict isolation.
- `lib/agent/contracts/` remains authoritative for the provider-neutral lane; the shared frontend uses assistant-ui's upstream `AssistantRuntime` contract. No second contract or cross-adapter translation requirement is created.

## Prerequisites before production approval of the native opencode lane

- Verify the concrete browser-to-local-server access boundary against unauthorized website origins and remote clients: configured allowed-origin/CORS behavior, server authentication behavior, loopback binding, and no app-owned privileged secret in frontend assets or requests. Loopback and CORS alone are not authorization; do not enable unrestricted external exposure.
- Pin and test the installed upstream adapter, SDK, and opencode server versions. Confirm create, continuation, and automatic-title behavior; the comparison observed a title-generation HTTP 400.
- Verify permissions, cancellation outcomes/races, independent per-tab and multi-tab/multi-session behavior, and disconnection/reload/process-loss behavior before claiming those capabilities.
- Keep the upstream assistant-ui adapter as the runtime and existing per-tab runtime structure. Do not add a project-isolation proxy/profile requirement solely to separate projects belonging to the same trusted local user.

The upstream [assistant-ui opencode quickstart](https://www.assistant-ui.com/docs/runtimes/opencode/quickstart) describes its SSE-backed session/thread runtime and custom client configuration; use that maintained runtime directly rather than recreating its projection.

## Reconsider when

- The app's trust model changes beyond one trusted local user; that would require a new explicit authorization decision and evidence, not an assumption that profiles are sandboxes.
- A stable/pinned assistant-ui package version supports this app's dependencies, browser/server access controls are confirmed for the deployment, and native create/continuation/title actions pass against the matching opencode server version.
- A second concrete provider creates a real selection need; then evaluate a small factory rather than preemptively adding a registry.

## 2026-10-24 addendum: proposed trusted-local native product support

The original 2026-10-10 decision and experimental milestone above remain historical. [#34](https://github.com/tbrandenburg/agentilogue/issues/34), [#37](https://github.com/tbrandenburg/agentilogue/issues/37), and [#38](https://github.com/tbrandenburg/agentilogue/issues/38) are closed; their closure does not turn historical failures into passes. Proposed support is limited to one trusted local user, one machine, app/server bound to loopback, Basic auth on the opencode server, exact configured app origin, and the user's projects/sessions sharing one trust scope. **Graduation remains pending:** the coordinator's second restored tab timed out reconnecting after an outage ([#65](https://github.com/tbrandenburg/agentilogue/issues/65)); maintainer GO is also required. Native therefore remains experimental. Explicit enablement, fail-closed configuration, the integration-selection policy, and #33's **NO-GO for strict project isolation** remain unchanged.

Fresh production-build browser checks with adapter `0.2.30` and SDK/server `1.18.35` verified native multi-turn/tools, real approved/denied file effects, Stop with a captured late callback blocked by the mounted client, independent tabs/model/agent choices, official runtime/server title agreement, and reload/password/history restoration without replay or password storage. AI SDK/ACP smoke and a 390px native layout passed. The upstream adapter API remains **experimental** and upgrades need compatibility retesting.

Same-mounted-page reconnect failed after both short and longer active-run outages. Supported recovery is full-page reload → password re-entry → inspect restored partial work; missing terminal evidence remains unknown, and retrying can repeat side effects. The guard protects this client's permission requests, not direct callers after server abort. No remote/multi-user hosting, seamless reconnect, project ACL, filesystem sandbox, durable account history, automatic resume/resend, or server-wide permission revocation is promised. Separate remote-host testing remains **NOT TESTED and unsupported**, not an omitted local authorization guarantee. See [known issues, current verification, and emergency disable](/docs/opencode-native-known-issues.md); retain the original #34/#37 reports unchanged.
