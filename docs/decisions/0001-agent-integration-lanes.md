# ADR 0001: Choose agent integrations at the boundary that fits

**Status:** Accepted  
**Date:** 2026-10-10  
**Related:** [Issue #29](https://github.com/tbrandenburg/agentilogue/issues/29), [Issue #33](https://github.com/tbrandenburg/agentilogue/issues/33), [Issue #34](https://github.com/tbrandenburg/agentilogue/issues/34), [OpenCode comparison spike](../spikes/2026-10-opencode-integration-comparison.md)

## Context

Agentilogue has an established OpenCode ACP implementation and a first-class AI SDK `/api/chat` lane. Assistant-ui also publishes an experimental `useOpenCodeRuntime` adapter. The comparison and follow-up probe found that direct server access can expose sessions and project files across directories in the tested configuration. That evidence remains valid: profile separation is not a security sandbox, and the probe remains **NO-GO for project isolation**. The maintainer's revised decision scopes the proposed native lane to one trusted local user; cross-project access by that same user is within this product trust boundary, rather than a required authorization guarantee. See the linked report and [#33](https://github.com/tbrandenburg/agentilogue/issues/33) for exact evidence, tests, and limits.

The app needs a maintainable path to multiple agents without making ACP mandatory, copying adapter implementations, or reducing native agent behavior to a premature lowest-common-denominator interface.

## Decision

1. **Use assistant-ui `AssistantRuntime` as the common frontend contract.** AGENTILOGUE's `Thread` consumes an `AssistantRuntime` supplied by `AssistantRuntimeProvider`. Each integration may supply it through a maintained assistant-ui hook or a custom runtime adapter. This does **not** prescribe an identical backend.
2. **Keep ACP as the current OpenCode lane.** Its server-owned project, conversation/session binding, native run lifecycle and independent permission/cancel controls fit the current trusted-local architecture. This is a current implementation choice, **not** an ACP-first rule.
3. **Evaluate a maintained assistant-ui adapter first** for each new integration. Adopt it only after verifying installed-package compatibility, a concrete browser-to-local-server access boundary appropriate to the deployment, conversation/tab isolation, truthful completion/cancellation, live permission handling, reconnect/reattach claims, and preservation of important native capabilities. Use its public runtime and existing `Thread` instead of duplicating projection logic.
4. **Choose protocols at the boundary they actually serve.** ACP is an option for local native-agent processes; AG-UI is an agent-to-UI event/interaction protocol; A2A is for remote agent task/artifact interactions. None is a mandatory intermediate layer.
5. **Use a native SDK/API with minimal server glue when justified** by a missing maintained adapter, security/deployment ownership, or a tested native capability. Keep provider-specific semantics at that adapter boundary.
6. **Keep `AgentProvider` optional and scoped.** `AgentProvider`, `RunObservation`, `RunSnapshot`, `AgentRunEvent`, and `/api/agent` are authoritative **for the app-owned provider-neutral backend lane**. A framework-native integration need not implement, translate through, or duplicate them. Shared security and lifecycle _behaviors_ must still be demonstrated in each lane.

Agent-specific behavior remains agent-specific: project/workspace selection, process lifecycle, session identity and history, model/agent selection semantics, native permissions and questions, cancellation evidence, tool parts, and child-agent transcript shape. Normalize only behaviors required at an actual shared boundary; do not force every integration through `AgentProvider`.

**Trust boundary:** The native OpenCode lane is for one trusted local user. That user's configured projects and sessions are within the same trust scope; the app does not promise per-project authorization or isolation. The #33 evidence remains a NO-GO for project isolation and documents why separate profiles are not security sandboxes. It does not by itself block this single-user scope. No multi-user authentication/proxy, OS sandbox, or per-project profile is required solely to enforce a boundary between projects of that same user.

Before enablement, implementation must still demonstrate a concrete browser-to-local-server access boundary. Loopback binding is not authorization; verify allowed-origin/CORS behavior and server authentication in the actual deployment, including requests from unauthorized websites and remote clients. Never embed an app-owned privileged secret in frontend code. Do not expose the server to unrestricted external clients. OpenCode documents loopback as the `serve` default, configurable browser origins via `--cors`, and optional HTTP Basic auth via `OPENCODE_SERVER_PASSWORD`; these controls must be tested together for the chosen client flow ([OpenCode server docs](https://opencode.ai/docs/server/)).

**Scope of acceptance:** This ADR approves the **integration-selection policy**, the one-user trusted-local scope, and retention of the current ACP OpenCode lane. It does **not** approve a general multi-user or remotely exposed service, replace ACP, introduce new integrations, or change the TypeScript contracts.

## Options considered

- **Keep ACP for OpenCode:** selected for the current product lane; preserves the server-owned project/session boundary and has live lifecycle evidence.
- **Add assistant-ui native OpenCode runtime:** selected for an opt-in implementation under the one-user trusted-local scope; it remains fail-closed until browser/server protection and title compatibility are confirmed. The tested cross-project listing/file access remains documented as a limitation, not a project-isolation pass.
- **Support both OpenCode lanes immediately:** deferred; it would duplicate an integration path before the native security boundary and maintenance case are demonstrated.
- **Build a custom runtime or universal service/registry:** rejected; duplicates maintained assistant-ui behavior or adds abstractions without a second provider selection requirement.

## Consequences

- The existing ACP and AI SDK `/api/chat` paths remain unchanged.
- ACP remains an implementation choice for this native OpenCode integration, not a rule for every future agent.
- Future adapter work must record actual package/peer versions, project/session ownership, native cancellation/permission semantics, and evidence for each advertised capability.
- A native OpenCode lane may reduce app-owned code. It is opt-in and must demonstrate browser-to-local-server protection and compatibility before enablement; it makes no per-project authorization claim.
- `lib/agent/contracts/` remains authoritative for the provider-neutral lane; the shared frontend uses assistant-ui's upstream `AssistantRuntime` contract. No second contract or cross-adapter translation requirement is created.

## Prerequisites before enabling the opt-in native OpenCode lane

- Verify the concrete browser-to-local-server access boundary against unauthorized website origins and remote clients: configured allowed-origin/CORS behavior, server authentication behavior, loopback binding, and no app-owned privileged secret in frontend assets or requests. Loopback and CORS alone are not authorization; do not enable unrestricted external exposure.
- Pin and test the installed upstream adapter, SDK, and OpenCode server versions. Confirm create, continuation, and automatic-title behavior; the comparison observed a title-generation HTTP 400.
- Verify permissions, cancellation outcomes/races, independent per-tab and multi-tab/multi-session behavior, and disconnection/reload/process-loss behavior before claiming those capabilities.
- Keep the upstream assistant-ui adapter as the runtime and existing per-tab runtime structure. Do not add a project-isolation proxy/profile requirement solely to separate projects belonging to the same trusted local user.

The upstream [assistant-ui OpenCode quickstart](https://www.assistant-ui.com/docs/runtimes/opencode/quickstart) describes its SSE-backed session/thread runtime and custom client configuration; use that maintained runtime directly rather than recreating its projection.

## Reconsider when

- The app's trust model changes beyond one trusted local user; that would require a new explicit authorization decision and evidence, not an assumption that profiles are sandboxes.
- A stable/pinned assistant-ui package version supports this app's dependencies, browser/server access controls are confirmed for the deployment, and native create/continuation/title actions pass against the matching OpenCode server version.
- A second concrete provider creates a real selection need; then evaluate a small factory rather than preemptively adding a registry.
