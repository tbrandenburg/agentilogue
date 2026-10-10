# ADR 0001: Choose agent integrations at the boundary that fits

**Status:** Proposed (maintainer approval required)  
**Date:** 2026-10-10  
**Related:** [Issue #29](https://github.com/tbrandenburg/agentilogue/issues/29), [OpenCode comparison spike](../spikes/2026-10-opencode-integration-comparison.md)

## Context

Agentilogue has an established OpenCode ACP implementation and a first-class AI SDK `/api/chat` lane. Assistant-ui also publishes an experimental `useOpenCodeRuntime` adapter. The comparison showed that the upstream adapter works for chat, tool projection, and basic permissions, while direct server access exposes a root-session list spanning project directories. ACP instead keeps the project path and browser-conversation/session binding in the app server. See the linked report for exact commands, versions, tests, and limits.

The app needs a maintainable path to multiple agents without making ACP mandatory, copying adapter implementations, or reducing native agent behavior to a premature lowest-common-denominator interface.

## Decision

1. **Keep ACP as the current OpenCode lane** while the app requires a server-owned project and conversation/session boundary.
2. **Prefer a maintained assistant-ui runtime** when it supports the target agent, its package is compatible with the installed assistant-ui line, and its session/security ownership can meet the app boundary. Use that runtime and the existing `Thread`; do not reimplement its projection.
3. **Prefer a standardized protocol at the boundary it serves.** Use ACP for native local agent subprocesses when process/session ownership and cross-agent native interoperability matter. Use AG-UI when an agent backend speaks AG-UI to a browser runtime. Use A2A for remote agent tasks/artifacts and their task lifecycle, not as a local subprocess session substitute.
4. **Use a direct provider SDK/API with minimal glue** when no maintained assistant-ui adapter or suitable protocol exists, or where a proven native capability requires it. Keep SDK types and lifecycle behavior at that agent adapter boundary.
5. Reconsider a separate OpenCode native-runtime lane after a project-scoped server/data store or an authorized proxy proves session ownership, and after the package/server compatibility issues in the spike are resolved.

Agent-specific behavior remains agent-specific: project/workspace selection, process lifecycle, session identity and history, model/agent selection semantics, native permissions and questions, cancellation evidence, tool parts, and child-agent transcript shape. Normalize only behavior required for a shared app boundary; do not force every integration through `AgentProvider` when a maintained runtime is simpler.

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
- The authoritative TypeScript contracts remain in `lib/agent/contracts/`; this ADR documents policy and does not define a second contract.

## Reconsider when

- The native OpenCode server can be isolated to an authorized project and session set, verified from a browser client.
- A proxy is shown to be both necessary and small enough to own caller/session authorization without shadowing the upstream runtime.
- A stable/pinned assistant-ui package version supports this app's dependencies, and native title/session actions pass against the matching OpenCode server version.
- A second concrete provider creates a real selection need; then evaluate a small factory rather than preemptively adding a registry.
