# AGENTS.md

## Project intent

agentilogue is a minimal agent chat UI that should work with different agent runtimes and providers while remaining easy to understand and run.

The project starts from the assistant-ui minimal template. The existing AI SDK + OpenAI path is a first-class supported integration, not temporary scaffolding.

## Working rules

- Keep changes small and understandable.
- Keep the UI intentionally minimal: an excellent conversation surface, composer, and only the agent details users actually need.
- Do not grow the product for bells and whistles. Every new surface, mode, setting, and abstraction must earn its place.
- Follow KISS and YAGNI. Prefer the smallest design that solves a demonstrated requirement.
- Maximize reuse of existing libraries, especially assistant-ui and the libraries already in the repository. Configure, compose, or adapt before writing replacements.
- Do not reinvent primitives that a maintained dependency already solves well.
- Prefer existing assistant-ui primitives over custom replacements.
- Do not remove or complicate the working AI SDK path to add agent integrations.
- Add abstractions only when a real second implementation needs them.
- Treat opencode as the first proof, not the only target. Planned agent CLI targets include opencode, pi, codex, claude code, and github copilot; SDK-backed integrations may follow where useful.
- Keep agent/provider domain types independent from assistant-ui and transport-specific types.
- Keep UI concerns in the UI/runtime layer and agent execution concerns behind backend/provider boundaries.
- Prefer standard protocols such as ACP or A2A when they fit, but preserve richer native integrations when they add value.
- Treat MCP/tool integrations separately from agent providers.
- Avoid new infrastructure, state libraries, persistence, auth, or orchestration unless required by the task.
- Do not add an AgentService or AgentRegistry while one configured provider per chat session is enough.
- When provider #2 arrives, prefer a small factory before considering a registry or service.

## Simplicity budget

Treat lines of code as a cost, not a goal.

- Aim to keep agentilogue-specific handwritten source below **5,000 LOC** while the project is young.
- Any change that pushes handwritten source above that budget must explicitly challenge whether the same result can be achieved by deleting code, reusing an existing library, or simplifying the requirement.
- A PR adding more than roughly **300 net LOC** should receive the same challenge even when the repository is below the overall budget.
- Prefer deleting or consolidating code before raising the budget.
- Do not count lockfiles, generated files, documentation, or substantially unmodified upstream/copied assistant-ui or shadcn components against the budget.
- Avoid large files as a smell rather than a rule: when an agentilogue-specific file approaches **400 LOC**, challenge whether it has too many responsibilities before splitting it mechanically.

These are soft limits. Crossing them is allowed when the value is clear, but it should never happen accidentally.

## Current path

```text
assistant-ui -> useChatRuntime -> /api/chat -> AI SDK -> OpenAI
```

Keep this path working.

## Planned agent path

The minimal direction is:

```text
assistant-ui
    |
ExternalStoreRuntime / AssistantTransport
    |
/api/agent
    |
AgentProvider
    |
agent runtime/provider
```

For the first provider, the route should call the provider directly. Add a small provider factory only when a second provider creates a real selection problem. A registry or service comes later only if dynamic registration, discovery, orchestration, or shared lifecycle behavior actually requires it.

## Development approach

1. Keep the UI working, polished, and minimal.
2. Reuse existing libraries before adding custom code.
3. Draft the smallest provider-neutral contracts.
4. Validate them with one deep opencode integration.
5. Challenge the resulting contract against pi, codex, claude code, and github copilot before treating it as stable.
6. Add SDK-backed implementations later where they provide meaningful benefits.
7. Only then extract patterns for ACP, A2A, LangGraph, Eve, or other runtimes.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the current architecture notes.

## Lessons Learned

- 2026-10-06: Pitfall: Concurrent Next.js dev servers from one checkout share `.next` state and can reject the second server. Prevention: Run simultaneous app variants from separate worktrees and inspect startup logs before browser testing.
- 2026-10-06: Pitfall: A full filesystem can leave partial checkout writes when `git switch` or `git worktree add` fails. Prevention: Check `df -h` before checkout/worktree operations; after failure, inspect `git status` and verify or restore the tree before continuing.
