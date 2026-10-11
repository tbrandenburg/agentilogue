# agentilogue

**A minimal chat UI for AI models today, with opt-in local agent runtimes.**

agentilogue is an open-source chat app built with [Next.js](https://nextjs.org/) and [assistant-ui](https://github.com/assistant-ui/assistant-ui). It keeps the conversation experience small and focused while keeping the backend integration replaceable.

> **Project status:** Early development. The AI SDK + OpenAI and OpenCode ACP paths remain available. OpenCode · Native is an **experimental trusted-local opt-in for local use**, not a validated production lane. Adapter `0.2.30` generated and restored titles without the removed workaround. Longer server outages can stall same-mount recovery; reload/password re-entry is the proven safe recovery path. [Issue #34](https://github.com/tbrandenburg/agentilogue/issues/34) tracks production hardening.

## What works today

The app streams model responses through the Vercel AI SDK and OpenAI:

```text
assistant-ui → useChatRuntime → /api/chat → Vercel AI SDK → OpenAI
```

The UI and runtime are built on assistant-ui, so the existing model-chat path stays useful on its own while the project explores richer agent integrations.

The chat screen supports in-memory session tabs with independent assistant-ui runtime transcripts. Native OpenCode session mappings are saved in the current browser tab's `sessionStorage` so a full-page reload can reopen the native conversation; the server password remains memory-only and must be entered again. AI SDK transcripts are not persisted. **Run with** offers AI SDK · OpenAI, OpenCode · ACP, and an experimental OpenCode · Native option when explicitly configured. The native adapter is pinned to `@assistant-ui/react-opencode@0.2.30` with SDK `1.18.35`, without the former bodyless-title-request suppression. Browser evidence confirmed matching server, official thread metadata, and runtime list-item titles, restored after reload; zero summarize requests or native HTTP 400 responses were observed. Custom app tabs still display chat labels. The [boundary report](docs/spikes/2026-10-opencode-local-boundary-issue-34.md) records current limits and preserves historical `0.2.29` failures and workaround results. The native client requires Basic auth and checks the configured app origin, but neither CORS nor the client check replaces server authentication. Projects and sessions share one trusted-local user's scope, without per-project authorization or filesystem sandboxing. [#33](https://github.com/tbrandenburg/agentilogue/issues/33)'s project-isolation NO-GO remains valid for strict isolation.

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

### OpenCode · Native (experimental local use)

The experimental native lane uses adapter `0.2.30`, which resolves [title bug #9244](https://github.com/assistant-ui/assistant-ui/issues/9244) through upstream [PR #9245](https://github.com/assistant-ui/assistant-ui/pull/9245); the local workaround and its dedicated tests have been removed. Browser tests verified stale-reply blocking through Stop, reconnect, and reload, followed by a working fresh approval. The final build preserves settled Allow/Deny receipts after Stop and cancels only pending approvals. After server loss, the app retained the interrupted transcript and unknown-outcome warning without resending the prompt. **Short-outage recovery passed, but a longer outage stalled the existing browser mount; full-page reload and password re-entry recovered the same session safely. Seamless recovery is not guaranteed, and the exact cause remains unproven.** An interrupted tool can remain unresolved after reload; this is not terminal success.

Stop latches cancellation and notifies approval controls before storage writes; a storage failure still forwards the abort and surfaces the error. Cancelled permission IDs and the latch survive reload in the same browser tab when storage succeeds; a new prompt first quarantines stale server permission requests. OpenCode retry status remains active; recovery checks coalesce and preserve checks queued at the completion boundary. Intermediate tool calls, `unknown` finishes, and completion timestamps alone do not establish a terminal outcome. Storage-failure and scheduler-race coverage is deterministic, not fresh browser injection. These are client-side safeguards, not OpenCode v1 server guarantees: other clients can still reply to stale permissions. Disabled native model/agent selection and separate remote-host validation remain production-hardening work under #34.

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

With these explicit values, the native target becomes available for experimental local use. The UI checks that `window.location.origin` exactly matches the configured app origin before constructing a native client; this is defense-in-depth, **not** authorization. Enter the OpenCode password in the selected tab when prompted; it is held in memory, never in the app environment, props, URL or storage. The lane does not provide project isolation. Native model/agent controls remain disabled pending verification. Remote-host access was not tested.

## Direction

OpenCode ACP remains an opt-in trusted-local path. OpenCode · Native is experimental and explicit opt-in only; the upgraded adapter runs without a title-request workaround and must pass #34's E2E matrix before production approval. Future agent support should be added only when another runtime creates a concrete need, while keeping chat UI separate from execution and preserving useful native capabilities.

Planned CLI targets include opencode, pi, codex, claude code, and github copilot. This is a direction, not a claim that those integrations are available today. Abstractions will be added as real integrations require them; the working AI SDK path remains a first-class option.

## Architecture

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the current and planned integration boundaries and [docs/assistant-ui-upgrades.md](docs/assistant-ui-upgrades.md) for the pinned Thread baseline and local patchset. See [AGENTS.md](AGENTS.md) for project principles and development guidance.

## Contributing

Contributions and feedback are welcome. Before making a larger change, please read [AGENTS.md](AGENTS.md) and [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) to understand the project’s scope and direction.

Run the project checks with `make format`, `make lint`, and `make test`. To
create a version commit and Git tag, then publish a GitHub release with generated
notes, run `make release BUMP=PATCH` (or `MINOR` / `MAJOR`). Releases require a
clean working tree and an authenticated `gh` CLI.
