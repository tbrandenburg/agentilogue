# AGENTS.md

## Project intent

Agentilogue is a minimal agent chat UI that should work with different agent runtimes and providers while remaining easy to understand and run.

The project starts from the assistant-ui minimal template. The existing AI SDK + OpenAI path is a first-class supported integration, not temporary scaffolding.

## Working rules

- Keep changes small and understandable.
- Prefer existing assistant-ui primitives over custom replacements.
- Do not remove or complicate the working AI SDK path to add agent integrations.
- Add abstractions only when a real second implementation needs them.
- Keep agent/provider domain types independent from assistant-ui and transport-specific types.
- Keep UI concerns in the UI/runtime layer and agent execution concerns behind backend/provider boundaries.
- Prefer standard protocols such as ACP or A2A when they fit, but preserve richer native integrations when they add value.
- Treat MCP/tool integrations separately from agent providers.
- Avoid new infrastructure, state libraries, persistence, auth, or orchestration unless required by the task.

## Current path

```text
assistant-ui -> useChatRuntime -> /api/chat -> AI SDK -> OpenAI
```

Keep this path working.

## Planned agent path

The likely direction is:

```text
assistant-ui
    |
AssistantTransport / ExternalStoreRuntime boundary
    |
backend transport adapter
    |
AgentService
    |
AgentProvider
    |
agent runtime/provider
```

This is architectural guidance, not a requirement to create every layer immediately.

## Development approach

1. Keep the UI working and polished.
2. Draft the smallest provider-neutral contracts.
3. Validate them with one deep OpenCode integration.
4. Only then extract patterns for ACP, A2A, LangGraph, Eve, or other runtimes.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the current architecture notes.
