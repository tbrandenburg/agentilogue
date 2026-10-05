# Architecture

Agentilogue aims to be a minimal chat surface for talking to agents across different runtimes and providers.

The project should stay simple: keep working integrations working, add abstraction only when a second implementation proves it is useful, and avoid turning the UI into an agent framework.

## Today

The initial assistant-ui template provides a complete working path:

```text
assistant-ui
    |
useChatRuntime
    |
AssistantChatTransport
    |
POST /api/chat
    |
Vercel AI SDK streamText
    |
OpenAI
```

This path is useful and should remain supported. It is the simplest way to use Agentilogue with an AI SDK model.

## Direction

Agentilogue should also support richer agents without replacing the existing path:

```text
                         assistant-ui
                              |
                    AssistantRuntime boundary
                      /                 \
                     /                   \
             AI SDK lane             agent lane
                 |                       |
          /api/chat              AssistantTransport
                 |                       |
            streamText                /api/agent
                 |                       |
          model/provider             AgentService
                                         |
                                   AgentProvider
                                  /      |       \
                             OpenCode   ACP/A2A   other
```

The exact implementation may evolve. The important boundary is that assistant-ui owns the chat experience while agent-specific execution stays outside the UI.

## Principles

### Keep the simple path simple

A user who only wants the AI SDK path should not need the agent-provider layer.

### Keep agent contracts UI-independent

Agent/provider contracts should use Agentilogue domain types rather than assistant-ui types. Translation belongs at the runtime or transport boundary.

A future provider contract may be as small as:

```ts
interface AgentProvider {
  readonly id: string;
  readonly capabilities: AgentCapabilities;

  run(request: AgentRequest): AsyncIterable<AgentEvent>;
  cancel?(runId: string): Promise<void>;
}
```

This is a direction, not an API commitment. Define only what real integrations require.

### Preserve native capabilities

Generic protocols are useful, but they should not force richer native integrations into a lowest-common-denominator model. A direct OpenCode integration, for example, may expose capabilities that a generic protocol does not.

### Prefer protocols over provider-specific glue

Where standards fit naturally, prefer reusable protocol adapters such as ACP or A2A over many nearly identical provider integrations. Native providers remain an escape hatch.

### Separate agents from tools

Agent runtimes/providers and tool protocols are different concerns. MCP and similar tool mechanisms should not become agent providers merely because both involve remote capabilities.

## First proof: OpenCode

The first deeper custom-agent integration should be OpenCode.

Use it to validate the smallest useful contracts for:

- text streaming
- cancellation and resume
- tool calls and results
- approvals/permissions
- attachments/files
- errors
- sessions and subagents where useful

Do not generalize the contracts before this integration creates a concrete need.

## What not to build yet

Avoid adding a plugin framework, provider registry service, persistence layer, auth system, orchestration engine, or generalized event bus until the project actually needs one.

Agentilogue should remain a small chat application with clean extension points, not become another agent framework.
