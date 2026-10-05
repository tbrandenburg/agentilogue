# agentilogue

**Minimal agent chat for any runtime or provider.**

agentilogue is a small Next.js chat app built on [assistant-ui](https://github.com/assistant-ui/assistant-ui). The goal is simple: provide an excellent chat experience while staying flexible about what runs behind it.

The project deliberately keeps the working Vercel AI SDK path while leaving room for richer agent runtimes such as OpenCode, LangGraph, Eve, ACP/A2A agents, or custom providers.

## Philosophy

- **Simple first.** A basic model chat should stay easy to run.
- **Runtime-neutral UI.** The chat should not dictate the backend architecture.
- **Preserve capabilities.** Rich agent integrations should not be flattened unnecessarily.
- **Add abstraction when earned.** No framework-building before real integrations need it.

## Current setup

Today the included path is:

```text
assistant-ui
    -> useChatRuntime
    -> /api/chat
    -> Vercel AI SDK
    -> OpenAI
```

It supports streaming chat immediately and serves as the baseline integration.

## Run locally

Requirements: [Bun](https://bun.sh/) and an OpenAI API key.

1. Create `.env.local`:

   ```env
   OPENAI_API_KEY=your-api-key
   ```

2. Install and run:

   ```bash
   bun install
   bun run dev
   ```

3. Open [http://localhost:3000](http://localhost:3000).

The chat UI lives in `components/assistant-ui/elements/thread.aui.tsx`, the runtime is configured in `app/assistant.tsx`, and the current AI SDK route is `app/api/chat/route.ts`.

## Where this is going

The next architectural step is to define a small provider-neutral agent contract and validate it through a deep OpenCode integration, while keeping the existing AI SDK lane intact.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the design direction and [AGENTS.md](AGENTS.md) for contribution guidance.

## Status

Early and intentionally small. The priority is a great chat experience and clean extension points, not a large agent framework.
