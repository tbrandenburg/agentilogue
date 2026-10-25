# Codex ACP (trusted local only)

The optional **Run with → codex** lane reuses the official ACP v1 SDK **1.7.0**, existing run snapshots/leases, HTTP handler factories and assistant-ui external-store conversation UI. `/api/codex` has its own provider instance; `/api/agent` remains opencode. A separate route keeps provider selection server-owned without a registry. The maintained assistant-ui runtime catalog has no dedicated Codex runtime; its external-store runtime supports the independent approval and Stop callbacks needed here.

## Install and opt in

Reviewed and tested versions: **`@agentclientprotocol/codex-acp@2.2.2`**, **`@openai/codex@0.160.1`**. Install outside the app in a dedicated directory and retain that installation's lockfile. Pin both packages: the adapter's dependency otherwise permits newer Codex releases.

```sh
mkdir codex-agent
cd codex-agent
npm init -y
npm pkg set 'overrides.@openai/codex=0.160.1'
npm install --save-exact @agentclientprotocol/codex-acp@2.2.2 @openai/codex@0.160.1
./node_modules/.bin/codex-acp --version
./node_modules/.bin/codex --version
```

Set these **app-server-only** variables in `.env.local` or the server environment:

```env
CODEX_ACP_ENABLED=1
AGENT_TRUSTED_LOCAL=1
CODEX_ACP_CWD=/absolute/path/to/project
CODEX_ACP_EXECUTABLE=/absolute/path/to/codex-agent/node_modules/.bin/codex-acp
# Supply CODEX_API_KEY or OPENAI_API_KEY securely on the server.
```

Restart with `bun run dev` or `bun run build` followed by `bun run start`. Use the default loopback binding. Codex stays unavailable if opt-in, trusted-local assertion, an existing absolute project directory, an executable absolute file, or an API key is missing. An invalid key produces a safe run error, not browser login; a separately revoked key has not been tested. Availability checks key presence, not account validity. `CODEX_API_KEY` takes precedence over `OPENAI_API_KEY`.

The adapter launches **without arguments**, unlike `opencode acp`. Its child receives an explicit environment: `NODE_ENV`; executable lookup (`PATH`); OS/profile and temporary-directory variables (`HOME`, `USERPROFILE`, `CODEX_HOME`, `XDG_CONFIG_HOME`, `XDG_DATA_HOME`, `XDG_CACHE_HOME`, `XDG_STATE_HOME`, `XDG_RUNTIME_DIR`, `TMPDIR`, `TMP`, `TEMP`, `SYSTEMROOT`, `WINDIR`, `APPDATA`, `LOCALAPPDATA`); and the optional `CODEX_PATH` override. `CODEX_PATH` is passed through as an environment override; it does not change the configured `CODEX_ACP_EXECUTABLE` used to launch the adapter. For authentication, `CODEX_API_KEY` is preferred and otherwise `OPENAI_API_KEY` is forwarded under the `CODEX_API_KEY` name. Other application environment variables are not inherited. The server authenticates with the advertised `api-key` method, forces `NO_BROWSER=1` and initial `read-only` mode, and removes adapter file-logging/default interactive-auth overrides so those behaviors remain disabled. No key is placed in an ACP request or browser payload. This initial lane intentionally does not use stored ChatGPT login or custom gateway auth. Filtering is defense in depth, not OS/process isolation; operators must explicitly supply dedicated HOME/XDG/Codex profile paths when profile isolation is required. Review Codex configuration, the executable and optional `CODEX_PATH` override; use the pinned bundled runtime for the documented versions.

## Behavior and limits

- Text prompts, native tool activity, exact offered approval choices and native-confirmed cancellation are supported. Persistent approval options retain their original labels and effects; choosing one is not equivalent to allow-once.
- Codex's own sandbox and permission policy govern native tools. `read-only` starts with approval-required writes; reads may not need approval. Agentilogue does not implement ACP filesystem/terminal callbacks, enforce filesystem confinement or authorize projects.
- One active/unknown run per conversation; different tabs receive distinct native sessions. Follow-up turns use advertised v1 `session/load`; historical replay is suppressed from the new turn. Native IDs, cwd, executable, environment and credentials cannot be supplied by the browser start/control API.
- Observation disconnect does not cancel or resend a prompt. Same-process reconnect obtains a current snapshot. Child loss without a terminal result is `unknown` and keeps the conversation lease blocked; there is no automatic retry.
- The adapter and its App Server are launched in an owned process group; shutdown closes stdin and escalates bounded cleanup through TERM/KILL. A run outcome is not published until that cleanup finishes.
- No Codex model/agent/mode selectors, attachments, reasoning/plan/subagent UI, native SDK lane, persistence or cold reattach. Browser reload loses ACP transcripts/session bindings in the UI; server restart loses the in-memory bindings and snapshots. Start a new tab after an unknown run; do not assume uncertain side effects were rolled back.

The shared [agent HTTP boundary](/docs/opencode-agent-api.md) applies to `/api/codex`: matching loopback Host and browser Origin/Referer, JSON/schema validation and independently delivered controls. These checks are **not caller authentication**. Keep the app single-user, trusted-local, without public interfaces, reverse proxies or shared/untrusted clients.
