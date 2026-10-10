# agentilogue

**A minimal chat UI for AI models today, with opt-in local agent runtimes.**

agentilogue is an open-source chat app built with [Next.js](https://nextjs.org/) and [assistant-ui](https://github.com/assistant-ui/assistant-ui). It keeps the conversation experience small and focused while keeping the backend integration replaceable.

> **Project status:** Early development. The AI SDK + OpenAI and OpenCode ACP paths remain available. OpenCode · Native is an **experimental trusted-local opt-in for manual E2E testing**, not a validated production lane. A temporary SDK fetch workaround suppresses the upstream title/compaction bug ([assistant-ui #9244](https://github.com/assistant-ui/assistant-ui/issues/9244)).

## What works today

The app streams model responses through the Vercel AI SDK and OpenAI:

```text
assistant-ui → useChatRuntime → /api/chat → Vercel AI SDK → OpenAI
```

The UI and runtime are built on assistant-ui, so the existing model-chat path stays useful on its own while the project explores richer agent integrations.

The chat screen supports in-memory session tabs with independent assistant-ui runtime transcripts. **Run with** offers AI SDK · OpenAI, OpenCode · ACP, and an experimental OpenCode · Native option when explicitly configured. The native adapter `@assistant-ui/react-opencode@0.2.29` incorrectly invokes OpenCode's compaction endpoint to generate a title. The temporary custom-fetch workaround suppresses **only that invalid bodyless call**, so native functionality can be tested without a dependency fork. A real completed-prompt/title test and the full native browser E2E matrix are **not yet verified**; do not treat the experimental lane as production-ready. The native client requires Basic auth and checks the configured app origin, but neither CORS nor the client check replaces server authentication. Projects and sessions share one trusted-local user's scope, without per-project authorization or filesystem sandboxing. #33's project-isolation NO-GO remains valid for strict isolation.

The checked-in models.dev catalog is provider-independent metadata grouped by canonical creator/lab IDs. Repository-owned **Preconfigured** tiers provide a compact fast path, while the broader catalog remains available for selection where the active execution path supports it. Check catalog freshness with `bun run models:check`; after reviewing drift, update it with `bun run models:sync`.

## Quick start

You’ll need [Bun](https://bun.sh/). An [OpenAI API key](https://platform.openai.com/api-keys) is needed for the AI SDK path. OpenCode ACP is separately optional for its trusted-local path.

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

To opt in to OpenCode ACP, install and authenticate the OpenCode CLI separately, then set these server-side values in `.env.local`:

```env
AGENT_API_ENABLED=1
AGENT_TRUSTED_LOCAL=1
OPENCODE_CWD=/absolute/path/to/project
# Optional; defaults to `opencode` on PATH.
# OPENCODE_EXECUTABLE=/absolute/path/to/opencode
```

Restart with `bun run dev`; the project entrypoint binds to `127.0.0.1`. The API has no caller authentication and trusts the operator's `AGENT_TRUSTED_LOCAL=1` assertion. It also rejects requests that fail its loopback Host and same-origin browser checks. Do not change the bind address or place it behind a reverse proxy or on a shared/untrusted network. OpenCode retains control of its native tools and permissions; agentilogue does not sandbox their filesystem or other effects. See [the API limits and behavior](docs/opencode-agent-api.md).

### OpenCode · Native (experimental, E2E testing only)

The experimental native lane can now be selected for **local manual testing** using the temporary SDK custom-fetch workaround for [upstream title bug #9244](https://github.com/assistant-ui/assistant-ui/issues/9244). It does **not** validate first-prompt title propagation, tool permissions, cancellation, reconnection, multi-tab isolation, or browser regressions; these still require the #34 E2E matrix. Remove the workaround after an upstream fix has been released and verified.

Use an exact loopback app origin (for example `http://localhost:3000`) and an OpenCode server **with Basic auth enabled**:

```bash
OPENCODE_SERVER_PASSWORD='choose-a-local-password' opencode serve --hostname 127.0.0.1 --cors http://localhost:3000
```

Configure the app server (never an OpenCode password) and restart:

```env
OPENCODE_NATIVE_ENABLED=1
OPENCODE_NATIVE_URL=http://127.0.0.1:4096
OPENCODE_NATIVE_APP_ORIGIN=http://localhost:3000
```

With these explicit values, the native target becomes available for local E2E testing. The UI checks that `window.location.origin` exactly matches the configured app origin before constructing a native client; this is defense-in-depth, **not** authorization. Enter the OpenCode password in the selected tab when prompted; it is held in memory, never in the app environment, props, URL or storage. The lane does not provide project isolation. Native model/agent controls remain disabled pending verification. Remote-host access was not tested.

## Direction

OpenCode ACP remains an opt-in trusted-local path. OpenCode · Native is experimental and explicit opt-in only; it uses a temporary title-request workaround pending upstream resolution and must pass #34's E2E matrix before production approval. Future agent support should be added only when another runtime creates a concrete need, while keeping chat UI separate from execution and preserving useful native capabilities.

Planned CLI targets include opencode, pi, codex, claude code, and github copilot. This is a direction, not a claim that those integrations are available today. Abstractions will be added as real integrations require them; the working AI SDK path remains a first-class option.

## Architecture

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the current and planned integration boundaries and [docs/assistant-ui-upgrades.md](docs/assistant-ui-upgrades.md) for the pinned Thread baseline and local patchset. See [AGENTS.md](AGENTS.md) for project principles and development guidance.

## Contributing

Contributions and feedback are welcome. Before making a larger change, please read [AGENTS.md](AGENTS.md) and [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) to understand the project’s scope and direction.

Run the project checks with `make format`, `make lint`, and `make test`. To
create a version commit and Git tag, then publish a GitHub release with generated
notes, run `make release BUMP=PATCH` (or `MINOR` / `MAJOR`). Releases require a
clean working tree and an authenticated `gh` CLI.
