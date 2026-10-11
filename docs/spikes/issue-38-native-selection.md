# #38 — Native model and agent selection

## Decision and pinned evidence

Use the existing authenticated browser SDK client and upstream runtime. Installed
`@assistant-ui/react-opencode` **0.2.30**, `@opencode-ai/sdk` **1.18.35**, and real
OpenCode CLI/authenticated server health **1.18.35** were checked before implementation.
The issue was reread with `gh issue view 38 --repo tbrandenburg/agentilogue --json body,comments,title`;
it returned zero comments.

Research before implementation:

- [OpenCode SDK](https://opencode.ai/docs/sdk/) and
  [assistant-ui quickstart](https://www.assistant-ui.com/docs/runtimes/opencode/quickstart.md).
- Context7 `/anomalyco/opencode`, query covering provider/agent catalogs, prompt pairs,
  previous-model/default semantics. Current docs include v2/dev APIs; those were
  orientation only, not evidence of installed compatibility.
- Installed adapter `src/types.ts:187-210` exposes `defaultModel` (provider/model pair)
  and `defaultAgent`. `src/useOpenCodeRuntime.ts:135-147` passes them on each send;
  `src/OpenCodeThreadController.ts:902-910` forwards them to `session.promptAsync`.
- Installed SDK `dist/v2/gen/types.gen.d.ts:7954-7966` returns `all`, `connected`, and
  per-provider defaults from `provider.list`. Agent records at `:1936-1956` include
  mode/hidden/name/model. `app.agents` is the pinned supported endpoint.
- [Version-tagged server source](https://github.com/anomalyco/opencode/blob/v1.18.35/packages/opencode/src/session/prompt.ts):
  `createUserMessage` resolves `input.model ?? agent.model ?? currentModel(session)`;
  `currentModel` checks session model, prior user model, then provider default.
  Missing agent uses the configured default agent, not the prior prompt agent.

Only connected providers' exact model pairs and visible primary/all-mode agents
are selectable. Subagents/internal agents are not top-level choices. Provider
catalog defaults are not misrepresented as a global default pair.

**Default means delegation, not reset.** Before the first message, choosing Default
removes the explicit runtime option. After the first message, model/agent choices
lock, as does the runtime family. Start a new session to reset. This deliberately
avoids presenting an unsupported explicit-to-Default reset during continuation.
Restored server IDs lock controls even before history loads, including the
password-screen runtime switch. Old saved sessions without choices remain Default
delegation: the explanation explicitly includes inherited session models.

Native choices are separate from AI SDK's `model`, scoped per app tab, and saved
alongside native server IDs in existing version-1 session storage. No password,
catalog, or resolved default is persisted. Discovery failures disable sending and
selection, explain reconnect-to-retry; unavailable saved selections disable sending
instead of silently falling back. No proxy, adapter fork, or message projection.

## Reproduction

From the issue worktree, with frozen dependencies available and an inherited
`OPENAI_API_KEY` (existence checked; value never printed):

```sh
bun run format
bun run lint
bun run typecheck
bun test ./tests
bun tests/native-selection-proof.ts
git diff --check
ss -ltn '( sport = :14381 or sport = :14382 )'
```

The proof requires installed Playwright and Chrome (`channel: "chrome"`), OpenCode
1.18.35, and free ports 14381/14382. It creates disposable HOME/XDG/project roots
under `/tmp/opencode`, sets a random in-memory Basic-auth password, launches owned
services with `setsid`, and uses a private direct Playwright browser/context. Only
the owned process tree is terminated. Logs: `/tmp/detach-issue38-app.log` and
`/tmp/detach-issue38-server.log`. The app uses **Next.js 16.3.8 webpack dev mode**:
Turbopack rejects the permitted node_modules symlink outside its filesystem root.
No shared dependency installation or tooling config changes were needed. The app's
`.next` output stays in this worktree.

## Real server/browser results

The completed proof prints ten PASS evidence lines (six effective-turn checks and
four combined independence/lifecycle/omission/teardown checks):

| Check                                | Evidence                                                                                                |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| Explicit → Default before first send | Real outgoing prompt omits model/agent; server resolves `openai/gpt-4.1-mini`, `build`                  |
| Default first/second/reopened turns  | User and assistant server records agree on `openai/gpt-4.1-mini`, `build`; no assistant errors          |
| Explicit first/second/reopened turns | User and assistant records agree on `openai/gpt-4.1`, `plan`; no assistant errors                       |
| Two native app tabs                  | Distinct server IDs, independent persisted pairs/agents, three verified turns each                      |
| Background AI SDK/ACP                | Real marker responses retained after native turns; AI SDK request remains `gpt-4.1-mini`                |
| Runtime/selection lock               | Model, agent, runtime disabled after first message; runtime/password switch and model lock after reload |
| Reload                               | Original two server IDs and choices preserved; no password in session storage                           |
| Approval                             | Real UI Allow on write; disposable target file appears                                                  |
| Cancellation                         | Real Stop forwards exactly one native abort; server becomes idle                                        |
| Explicit → omission server probe     | Separate `noReply` session records `gpt-4.1` twice, proving inherited override                          |
| Teardown                             | Ports 14381/14382 have zero listeners after owned-service shutdown                                      |

Unit suite: **51 passed, 0 failed, 11 files**, including three new high-signal tests
covering pair collisions/slashed model IDs, connected-provider/agent filtering,
missing saved selections, malformed pairs, and explicit/Default storage isolation.
Formatter and linter pass without warnings.

## Integration caveat

Source typecheck passes with disposable `.next` output removed. After a dev run,
`bun run typecheck` sees Next-generated route validation and fails on the existing
`app/api/agent/route.ts` export `createPostHandler` (`.next/dev/types/app/api/agent/route.ts:14`).
That route is outside #38 ownership; it must be resolved by integration. This is
not suppressed via a config change. Reproduce by running the proof then typecheck.

The live proof is intentionally larger than the selection glue: it owns isolated
services and checks native server records, independent real lanes, approvals,
cancel, and teardown instead of mocking runtime behavior. This evidence earns the
roughly 300+ net-line simplicity-budget exception; no runtime abstraction was added.
Server configuration/catalog changes require reconnect; external clients changing
the same native session can affect delegated Default. Strict project isolation,
server-restart recovery, native-status fixes, and production builds are outside this
proof and remain existing integration work.
