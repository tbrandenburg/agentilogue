# Architecture

agentilogue aims to be a minimal chat surface for talking to agents across different runtimes and providers.

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

This path is useful and should remain supported. It is the simplest way to use agentilogue with an AI SDK model.

## Runtime architecture

assistant-ui gives us one UI surface while allowing different runtime integrations underneath it.

The existing AI SDK path remains a first-class lane. Richer agents can use a second lane based on assistant-ui's external-store runtime model and a backend agent abstraction.

```text
assistant-ui components
        |
        v
   AssistantRuntime
        |
   +----+---------------------+
   |                          |
AI SDK lane               agent lane
   |                          |
useChatRuntime()          AssistantTransport
   |                          |
AI SDK useChat()          ExternalStoreRuntime
   |                          |
/api/chat                /api/agent
   |                          |
streamText()              AgentService
   |                          |
OpenAI / AI SDK           AgentProvider
                          |- OpenCode
                          |- ACP
                          |- A2A
                          '- LangGraph / others
```

This diagram is conceptual rather than a strict call stack. In the agent lane, AssistantTransport is the frontend/backend protocol mechanism and feeds an ExternalStoreRuntime-backed assistant runtime. The backend stays responsible for agent execution and provider selection.

The important boundaries are:

- **assistant-ui components** render the conversation and interact with an `AssistantRuntime`.
- **ExternalStoreRuntime** adapts externally owned conversation/agent state into assistant-ui.
- **AssistantTransport** is one way to move commands and streamed state between that runtime and a remote backend.
- **AgentService** handles backend-level routing and coordination.
- **AgentProvider** isolates concrete agent runtimes and protocols from the UI.

## Direct framework adapters

assistant-ui already demonstrates another useful pattern: framework-specific adapters can map directly into ExternalStoreRuntime.

```text
LangGraph ---+
LangChain ---|
Eve ---------|
A2A ---------|
AG-UI -------|
OpenCode ----+
             |
             v
   ExternalStoreRuntime
             |
             v
      assistant-ui
```

These integrations are important references because they show how framework-specific messages, state, tool calls, approvals, attachments, and actions can be projected into a common UI runtime.

agentilogue does not need to force those direct integrations through `AgentProvider`. For a dedicated integration, a direct runtime adapter can be the simplest solution.

For agentilogue's provider-neutral backend path, however, the intended shape is:

```text
assistant-ui
    |
AssistantTransport
    |
HTTP / SSE
    |
/api/agent
    |
AgentService
    |
AgentProvider
    |
agent runtime or protocol
```

Both paths should remain possible.

## Backend boundary

The backend should expose the smallest useful contract between the UI transport and concrete agents.

A future provider contract may be as small as:

```ts
interface AgentProvider {
  readonly id: string;
  readonly capabilities: AgentCapabilities;

  run(request: AgentRequest): AsyncIterable<AgentEvent>;
  cancel?(runId: string): Promise<void>;
}
```

This is a direction, not an API commitment. OpenCode should help determine what the real minimum contract needs to be.

The provider layer should not depend on assistant-ui types. Translation between assistant-ui/transport state and agentilogue domain types belongs at the backend transport boundary.

A provider may represent:

- a native SDK or API such as OpenCode
- a local process
- a remote/cloud agent
- a protocol adapter such as ACP or A2A
- a framework such as LangGraph when routing it through the common backend is useful

The physical location of the agent should not matter to the UI.

## Principles

### Keep the simple path simple

A user who only wants the AI SDK path should not need the agent-provider layer.

### Keep agent contracts UI-independent

Agent/provider contracts should use agentilogue domain types rather than assistant-ui types. Translation belongs at the runtime or transport boundary.

### Preserve native capabilities

Generic protocols are useful, but they should not force richer native integrations into a lowest-common-denominator model. A direct OpenCode integration, for example, may expose capabilities that a generic protocol does not.

### Prefer protocols over provider-specific glue

Where standards fit naturally, prefer reusable protocol adapters such as ACP or A2A over many nearly identical provider integrations. Native providers remain an escape hatch.

### Separate agents from tools

Agent runtimes/providers and tool protocols are different concerns. MCP and similar tool mechanisms should not become agent providers merely because both involve remote capabilities.

### Keep routing boring

`AgentService` should initially be little more than provider selection and delegation. Do not turn it into an orchestration framework unless real requirements demand that.

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

A successful first implementation should prove this path:

```text
assistant-ui
    |
AssistantTransport / ExternalStoreRuntime
    |
/api/agent
    |
AgentService
    |
OpenCodeProvider
    |
OpenCode
```

The goal is not merely to receive an answer. The integration should exercise enough real agent behavior that a second provider can be added without redesigning the UI or provider contract.

## References and inspiration

These projects and protocols are useful references. We should study their boundaries and lessons, not copy their complexity.

### assistant-ui

Primary reference for the frontend/runtime boundary:

- [assistant-ui](https://github.com/assistant-ui/assistant-ui)
- [ExternalStoreRuntime](https://www.assistant-ui.com/docs/runtimes/custom/external-store)
- [AssistantTransport](https://www.assistant-ui.com/docs/runtimes/custom/assistant-transport)
- [OpenCode runtime](https://www.assistant-ui.com/docs/runtimes/opencode/overview)
- LangGraph, LangChain, Eve, A2A, and AG-UI runtime adapters in the assistant-ui ecosystem

Study how framework-specific state, tool calls, approvals, attachments, and actions are mapped into one UI runtime without forcing the underlying framework into the UI.

### OpenCode

[OpenCode](https://github.com/anomalyco/opencode) is the first native agent integration we want to study deeply.

It should drive the first real version of the AgentProvider contract, especially around sessions, tool execution, permissions, files, streaming, and subagents.

### Archon

[Archon](https://github.com/coleam00/Archon) is useful for its provider abstraction and capability-oriented thinking.

Take inspiration from the idea of hiding concrete agent implementations behind a common provider contract, but avoid inheriting Archon-specific workflow, coding-agent, or orchestration concerns unless agentilogue actually needs them.

### Open WebUI

[Open WebUI](https://github.com/open-webui/open-webui) is useful as a mature interoperability reference.

Important lessons to keep in mind:

- prefer protocols/adapters over one-off provider glue where practical
- keep tools separate from agents
- be explicit about who owns tool execution to avoid duplicate tool-call loops
- preserve a simple model-chat path alongside richer integrations

### Omnigent and agent harnesses

[Omnigent](https://github.com/omnigent-ai/omnigent), [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness), and similar harnesses are useful references for multi-agent/runtime interoperability.

Their breadth is inspiration, not a target. agentilogue should remain a thin chat surface rather than becoming an orchestration platform.

### Agent protocols

Protocol support should be driven by real use cases:

- [ACP](https://agentclientprotocol.com/) for client-to-coding-agent interoperability
- [A2A](https://a2a-protocol.org/) for remote agent interoperability
- [AG-UI](https://docs.ag-ui.com/) as a reference for agent-to-UI event/state exchange
- [MCP](https://modelcontextprotocol.io/) for tools and resources, not as an AgentProvider abstraction
- [Microsoft Agent Host Protocol](https://github.com/microsoft/agent-host-protocol) as a reference when multi-client or hosted agent-session coordination becomes relevant

A useful conceptual layering is:

```text
UI/runtime transport
        |
AgentService / AgentProvider
        |
ACP / A2A / native providers
        |
agent runtime
        |
MCP / tools
```

Do not implement all of these up front. Add a protocol only when it removes real integration work or unlocks a concrete agent.

## What not to build yet

Avoid adding a plugin framework, provider registry service, persistence layer, auth system, orchestration engine, or generalized event bus until the project actually needs one.

agentilogue should remain a small chat application with clean extension points, not become another agent framework.
