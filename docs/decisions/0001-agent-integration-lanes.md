# ADR 0001: Choose agent integrations at the boundary that fits

**Status:** Accepted  
**Date:** 2026-10-10  
**Related:** [Issue #29](https://github.com/tbrandenburg/agentilogue/issues/29), [OpenCode comparison spike](../spikes/2026-10-opencode-integration-comparison.md)

## Context

Agentilogue has an established OpenCode ACP implementation and a first-class AI SDK `/api/chat` lane. Assistant-ui also publishes an experimental `useOpenCodeRuntime` adapter. The comparison showed that the upstream adapter works for chat, tool projection, and basic permissions, while direct server access exposes a root-session list spanning project directories. ACP instead keeps the project path and browser-conversation/session binding in the app server. See the linked report for exact commands, versions, tests, and limits.

The app needs a maintainable path to multiple agents without making ACP mandatory, copying adapter implementations, or reducing native agent behavior to a premature lowest-common-denominator interface.

## Decision

1. **Use assistant-ui `AssistantRuntime` as the common frontend contract.** AGENTILOGUE's `Thread` consumes an `AssistantRuntime` supplied by `AssistantRuntimeProvider`. Each integration may supply it through a maintained assistant-ui hook or a custom runtime adapter. This does **not** prescribe an identical backend.
2. **Keep ACP as the current OpenCode lane.** Its server-owned project, conversation/session binding, native run lifecycle and independent permission/cancel controls satisfy the current trusted-local architecture. This is a current implementation choice, **not** an ACP-first rule.
3. **Evaluate a maintained assistant-ui adapter first** for each new integration. Adopt it only after verifying installed-package compatibility, authenticated/authorized project and session access appropriate to the deployment, conversation isolation, truthful completion/cancellation, live permission handling, reconnect/reattach claims, and preservation of important native capabilities. Use its public runtime and existing `Thread` instead of duplicating projection logic.
4. **Choose protocols at the boundary they actually serve.** ACP is an option for local native-agent processes; AG-UI is an agent-to-UI event/interaction protocol; A2A is for remote agent task/artifact interactions. None is a mandatory intermediate layer.
5. **Use a native SDK/API with minimal server glue when justified** by a missing maintained adapter, security/deployment ownership, or a tested native capability. Keep provider-specific semantics at that adapter boundary.
6. **Keep `AgentProvider` optional and scoped.** `AgentProvider`, `RunObservation`, `RunSnapshot`, `AgentRunEvent`, and `/api/agent` are authoritative **for the app-owned provider-neutral backend lane**. A framework-native integration need not implement, translate through, or duplicate them. Shared security and lifecycle *behaviors* must still be demonstrated in each lane.

Agent-specific behavior remains agent-specific: project/workspace selection, process lifecycle, session identity and history, model/agent selection semantics, native permissions and questions, cancellation evidence, tool parts, and child-agent transcript shape. Normalize only behaviors required at an actual shared boundary; do not force every integration through `AgentProvider`.

**Scope of acceptance:** This ADR approves the **integration-selection policy** and retention of the current ACP OpenCode lane. It does **not** approve the experimental native OpenCode runtime for production, replace ACP, introduce new integrations, or change the TypeScript contracts.



## Options considered

- **Keep ACP for OpenCode:** selected for the current product lane; preserves the server-owned project/session boundary and has live lifecycle evidence.
- **Replace ACP with assistant-ui native OpenCode runtime:** not selected now; the runtime is viable but its direct session-list behavior conflicts with project scoping in the tested setup, and its automatic title request failed against OpenCode 1.18.32.
- **Support both OpenCode lanes immediately:** deferred; it would duplicate an integration path before the native security boundary and maintenance case are demonstrated.
- **Build a custom runtime or universal service/registry:** rejected; duplicates maintained assistant-ui behavior or adds abstractions without a second provider selection requirement.

## Consequences

- The existing ACP and AI SDK `/api/chat` paths remain unchanged.
- ACP remains an implementation choice for this native OpenCode integration, not a rule for every future agent.
- Future adapter work must record actual package/peer versions, project/session ownership, native cancellation/permission semantics, and evidence for each advertised capability.
- A native OpenCode lane may reduce app-owned code, but requires a focused security/session-isolation follow-up before it can replace or join the app's default path.
- `lib/agent/contracts/` remains authoritative for the provider-neutral lane; the shared frontend uses assistant-ui's upstream `AssistantRuntime` contract. No second contract or cross-adapter translation requirement is created.

## Prerequisites for considering a native OpenCode production lane

- Prove project-scoped session listing, interaction authorization and caller/session ownership with an isolated OpenCode data store or a minimal authorized proxy; loopback and CORS alone do not enforce project isolation.
- Resolve the published adapter/server title-generation HTTP 400 and dependency compatibility warning against pinned versions.
- Verify native cancellation outcomes and permission races, context/cross-window isolation, and disconnection/reload/process-loss recovery before claiming parity.
- Compare retained upstream benefits against the actual proxy/server operations cost, using the linked spike as the baseline. A separate implementation PR must carry these tests and any warranted contract changes.

## Reconsider when

- The native OpenCode server can be isolated to an authorized project and session set, verified from a browser client.
- A proxy is shown to be both necessary and small enough to own caller/session authorization without shadowing the upstream runtime.
- A stable/pinned assistant-ui package version supports this app's dependencies, and native title/session actions pass against the matching OpenCode server version.
- A second concrete provider creates a real selection need; then evaluate a small factory rather than preemptively adding a registry.
