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
- Prefer existing assistant-ui primitives and maintained runtime integrations over custom replacements.
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

## Agent integration selection

Every chat lane provides assistant-ui's `AssistantRuntime` to the existing `Thread`. Existing integrations:

- **AI SDK:** `useChatRuntime → /api/chat → AI SDK`.
- **OpenCode ACP:** `useExternalStoreRuntime → /api/agent → AgentProvider → OpenCode ACP`.

For a new agent, **evaluate a maintained assistant-ui runtime first**. Use it directly if installed versions, project/session isolation, native controls, lifecycle correctness and capabilities are validated. Otherwise choose an appropriate native SDK/protocol with the smallest necessary server boundary.

`AgentProvider` and `lib/agent/contracts/` are authoritative **for our provider-neutral backend lane**, not universal interfaces that native assistant-ui runtimes must implement. Never create a second projection layer merely to route a maintained runtime through `RunSnapshot` or `AgentRunEvent`. ACP is a useful option for local agent processes, not a compulsory protocol.

See [ADR 0001](docs/decisions/0001-agent-integration-lanes.md) for the accepted selection policy, [CONTRACTS.md](docs/CONTRACTS.md) for the provider-neutral contract, and [ARCHITECTURE.md](docs/ARCHITECTURE.md) for the lane diagram.

## Development approach

1. Keep the UI minimal and the existing AI SDK and ACP paths working.
2. Inspect maintained assistant-ui adapters and the agent's official SDK/protocol before writing glue.
3. Prove project/session ownership, independent permissions/cancellation and honest native outcomes in the actual deployment.
4. Reuse `AgentProvider` only where the backend truly benefits from the existing provider-neutral contract.
5. Preserve native capabilities and document unsupported or untested behavior; add shared APIs only after two real implementations need them.
6. Prefer a small factory for two implementations of the **same backend port**, not a universal runtime registry.

## Lessons Learned

- 2026-10-06: Pitfall: Concurrent Next.js dev servers from one checkout share `.next` state and can reject the second server. Prevention: Run simultaneous app variants from separate worktrees and inspect startup logs before browser testing.
- 2026-10-06: Pitfall: A full filesystem can leave partial checkout writes when `git switch` or `git worktree add` fails. Prevention: Check `df -h` before checkout/worktree operations; after failure, inspect `git status` and verify or restore the tree before continuing.
- 2026-10-07: Pitfall: Unescaped Markdown backticks in a shell-quoted GitHub CLI body triggered command substitution and corrupted the PR text. Prevention: Write multiline PR bodies to a temporary file and pass `--body-file`; verify the published body before proceeding.
- 2026-10-07: Pitfall: Workspace `node_modules` lagged the lockfile, so source inspection used an older assistant-ui release than the reported baseline. Prevention: Install the frozen lockfile in an isolated worktree and verify actual package versions before researching version-specific behavior.
- 2026-10-10: Pitfall: An interrupted delegated spike left task-owned servers running and untracked prototype files. Prevention: Inspect worktree status, exact PIDs, and listening ports immediately after interruption; preserve useful artifacts and stop only task-owned processes before restarting.
