# agentilogue

**A minimal chat UI for AI models today, with a path to richer coding agents tomorrow.**

agentilogue is an open-source chat app built with [Next.js](https://nextjs.org/) and [assistant-ui](https://github.com/assistant-ui/assistant-ui). It keeps the conversation experience small and focused while keeping the backend integration replaceable.

> **Project status:** Early development. The AI SDK + OpenAI chat path works today. An opt-in trusted-local OpenCode ACP path is available for text-only conversations; it has no authentication, durable storage, or security boundary around OpenCode's native tools.

## What works today

The app streams model responses through the Vercel AI SDK and OpenAI:

```text
assistant-ui → useChatRuntime → /api/chat → Vercel AI SDK → OpenAI
```

The UI and runtime are built on assistant-ui, so the existing model-chat path stays useful on its own while the project explores richer agent integrations.

The chat screen supports in-memory session tabs with independent assistant-ui runtime transcripts. **Run with** chooses what executes a chat: AI SDK · OpenAI is available when configured, and OpenCode · CLI is available only when its trusted-local API is explicitly enabled. **Model** is per-run configuration; OpenCode model and agent overrides remain unavailable. The OpenCode path accepts text only, runs provider-owned native tools under OpenCode's configured permissions and server-selected working directory, and is not sandboxed. Its unauthenticated API is suitable only for a single trusted local user, bound to loopback by the project `dev` and `start` scripts. Do not expose it through proxies, public/shared interfaces, or untrusted deployments. Tabs and run state are in memory. The Project label shows the configured directory basename for the selected target and is not editable; `/api/chat` executes from the server working directory.

The checked-in models.dev catalog is provider-independent metadata grouped by canonical creator/lab IDs. Repository-owned **Preconfigured** tiers provide a compact fast path, while the broader catalog remains available for selection where the active execution path supports it. Check catalog freshness with `bun run models:check`; after reviewing drift, update it with `bun run models:sync`.

## Quick start

You’ll need [Bun](https://bun.sh/). An [OpenAI API key](https://platform.openai.com/api-keys) is needed for the AI SDK path. OpenCode is separately optional for its trusted-local path.

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

To opt in to OpenCode, install and authenticate the OpenCode CLI separately, then set these server-side values in `.env.local`:

```env
AGENT_API_ENABLED=1
AGENT_TRUSTED_LOCAL=1
OPENCODE_CWD=/absolute/path/to/project
# Optional; defaults to `opencode` on PATH.
# OPENCODE_EXECUTABLE=/absolute/path/to/opencode
```

Restart with `bun run dev`; the project entrypoint binds to `127.0.0.1`. The API has no caller authentication and trusts the operator's `AGENT_TRUSTED_LOCAL=1` assertion. Do not change the bind address or place it behind a reverse proxy or on a shared/untrusted network. OpenCode retains control of its native tools and permissions; agentilogue does not sandbox their filesystem or other effects. See [the API limits and behavior](docs/opencode-agent-api.md).

## Direction

The initial OpenCode ACP integration is available as an opt-in trusted-local path. The next step is to extend agent support only when another runtime creates a concrete need, while keeping the chat UI separate from execution and preserving useful native capabilities.

Planned CLI targets include opencode, pi, codex, claude code, and github copilot. This is a direction, not a claim that those integrations are available today. Abstractions will be added as real integrations require them; the working AI SDK path remains a first-class option.

## Architecture

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the current and planned integration boundaries and [docs/assistant-ui-upgrades.md](docs/assistant-ui-upgrades.md) for the pinned Thread baseline and local patchset. See [AGENTS.md](AGENTS.md) for project principles and development guidance.

## Contributing

Contributions and feedback are welcome. Before making a larger change, please read [AGENTS.md](AGENTS.md) and [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) to understand the project’s scope and direction.

Run the project checks with `make format`, `make lint`, and `make test`. To
create a version commit and Git tag, then publish a GitHub release with generated
notes, run `make release BUMP=PATCH` (or `MINOR` / `MAJOR`). Releases require a
clean working tree and an authenticated `gh` CLI.
