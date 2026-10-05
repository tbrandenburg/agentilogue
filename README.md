# agentilogue

**A minimal chat UI for AI models today, with a path to richer coding agents tomorrow.**

agentilogue is an open-source chat app built with [Next.js](https://nextjs.org/) and [assistant-ui](https://github.com/assistant-ui/assistant-ui). It keeps the conversation experience small and focused while keeping the backend integration replaceable.

> **Project status:** Early development. The AI SDK + OpenAI chat path works today. Native integrations for coding-agent runtimes are planned, starting with opencode; they are not yet included.

## What works today

The app streams model responses through the Vercel AI SDK and OpenAI:

```text
assistant-ui → useChatRuntime → /api/chat → Vercel AI SDK → OpenAI
```

The UI and runtime are built on assistant-ui, so the existing model-chat path stays useful on its own while the project explores richer agent integrations.

The chat screen supports in-memory session tabs with independent assistant-ui runtime transcripts. Integration is session-scoped, while Agent and Model remain optional overrides. Project currently displays the server working-directory basename and is not editable: `/api/chat` ignores project configuration and executes from the server working directory. No folder picker or project override is implied. Only AI SDK · OpenAI is implemented; other integrations remain visible as unavailable. A selected named model is intentionally blocked until the chat route supports model overrides.

The model picker uses a small checked-in recommendation catalog derived from models.dev provider-independent model metadata and canonical lab IDs, not provider-hosted catalogs. Check freshness with `bun run models:check`; after reviewing drift, update model IDs with `bun run models:sync` and review tier recommendations in `data/models.json`.

## Quick start

You’ll need [Bun](https://bun.sh/) and an [OpenAI API key](https://platform.openai.com/api-keys).

1. Clone the repository and install dependencies:

   ```bash
   git clone https://github.com/tbrandenburg/agentilogue.git
   cd agentilogue
   bun install
   ```

2. Add your key to `.env.local` in the project root:

   ```env
   OPENAI_API_KEY=your-api-key
   ```

3. Start the development server:

   ```bash
   bun run dev
   ```

4. Open [http://localhost:3000](http://localhost:3000).

## Direction

The next step is a focused integration with a coding-agent runtime, beginning with opencode. The design keeps the chat UI separate from agent execution and aims to preserve useful native agent capabilities rather than forcing every runtime into a lowest-common-denominator interface.

Planned CLI targets include opencode, pi, codex, claude code, and github copilot. This is a direction, not a claim that those integrations are available today. Abstractions will be added as real integrations require them; the working AI SDK path remains a first-class option.

## Architecture

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the current and planned integration boundaries. See [AGENTS.md](AGENTS.md) for project principles and development guidance.

## Contributing

Contributions and feedback are welcome. Before making a larger change, please read [AGENTS.md](AGENTS.md) and [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) to understand the project’s scope and direction.

Run the project checks with `make format`, `make lint`, and `make test`. To
create a version commit and Git tag, then publish a GitHub release with generated
notes, run `make release BUMP=PATCH` (or `MINOR` / `MAJOR`). Releases require a
clean working tree and an authenticated `gh` CLI.
