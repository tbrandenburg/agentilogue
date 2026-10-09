# OpenCode ACP proof (issue #23)

## Reproduction

The proof uses `@agentclientprotocol/sdk` **1.7.0** and OpenCode **1.18.32**. The SDK's stable entry point is ACP v1. The local CLI is a small stdio client; it advertises only filesystem read/write methods, implemented within its supplied proof `cwd`. It advertises no terminal, elicitation, or session-extension capabilities.

```sh
bun install --frozen-lockfile
bun run opencode:acp-proof /absolute/disposable/project 'Reply with exactly ACP_PROOF_OK and nothing else.'
```

`permission.edit` and `permission.bash` were set to `ask` in temporary project-local `opencode.json` files for permission checks. The files and projects were removed after each run. No global OpenCode configuration was changed, and no credentials or raw environment data were read or recorded.

## Native observations

- `initialize` negotiated protocol version **1**. The observed capabilities were `loadSession: true`, `promptCapabilities: { embeddedContext: true, image: true }`, session capabilities `close`, `fork`, `list`, `resume`, and MCP capabilities `{ http: true, sse: true }`. These values differ from the current OpenCode ACP web reference (`delete` listed; `sse: false`), so claims here describe this binary's response only.
- Session creation accepted the temporary absolute `cwd`; config options returned `model`, `effort`, and `mode`.
- A plain prompt returned `end_turn`; streamed `agent_message_chunk` updates shared one `messageId`, and their deltas reconstructed `ACP_PROOF_OK`. `lib/agent/opencode/fixtures/text-turn.json` contains a sanitized excerpt with the ID replaced.
- A harmless file-write request generated `session/request_permission` while the prompt was active with offered option IDs `once`, `always`, `reject`. Selecting `once` allowed the write; the file contents were verified as `ACP_OK`. Selecting `reject` produced a failed tool update, `end_turn`, and no file.
- A second harmless file-write run captured the native `tool_call` pending, `tool_call_update` in-progress/completed sequence, permission choices, selected `once` option, `end_turn`, and verified file content. Sanitized updates and outcome are in `lib/agent/opencode/fixtures/tool-permission.json`.
- Two prompts in one live ACP session each returned `end_turn`; the second turn answered `TURN_TWO` after `TURN_ONE`.
- Cancelling a long text-only turn after its first message chunk produced `stopReason: cancelled`.
- Pending-permission cancellation was repeated with both client orderings: (1) dispatch and await `session/cancel`, then resolve `session/request_permission` with `outcome: cancelled`; (2) resolve the permission request first, then dispatch `session/cancel`. Both produced a failed tool update followed by prompt `stopReason: cancelled`, and the child exited normally with code 0. The offered IDs were `once`, `always`, `reject`. This verifies that configured OpenCode build for these observed races; the adapter should still treat the prompt result, rather than the cancel write, as confirmation.
- Session continuity was exercised across three distinct OpenCode ACP child processes in one disposable project. Process one created a session, saved codeword `RESTART_CONTEXT_73`, and exited code 0. Process two called `session/load` with the same absolute `cwd` and session ID; it replayed the prior user and assistant messages, then answered a follow-up with the saved codeword. Process three called `session/resume` with that `cwd` and ID; it sent no prior-history updates (only `available_commands_update` before the new answer), and answered the same follow-up with the saved codeword. Both returned the same session ID and exited code 0.
- Observer-detach simulation stopped forwarding `session/update` events after the first message chunk while retaining the SDK connection and its handlers. A second prompt completed with `end_turn`; the OpenCode child exited code 0. This supports detaching a local UI observer without cancelling the native run, but does not claim that an ACP transport can remain connected after it is closed.
- For process-loss behavior, the harness sent `SIGTERM` only to the exact OpenCode child PID it spawned after receiving a real message chunk. The client observed `ACP connection closed`, child exit `{ code: null, signal: "SIGTERM" }`, and no `session/prompt` result. The turn's outcome is therefore **unknown**, not cancelled or completed.
- OpenCode's file-operation requests used paths relative to the process filesystem root in the observed write trace despite the ACP schema describing absolute paths. The proof client resolves both absolute and observed root-relative forms and confines access to the disposable project.

## Unproven / contract handoff

- Authentication failure was not exercised. Session `load`/`resume` and active-process local observer detach have native evidence now, in addition to the earlier same-process continuation test.
- ACP partial tool updates must be merged by `toolCallId`; updates may omit fields. Message chunks have a stable `messageId` in the observed text turn. Keep prompt cancellation confirmation distinct from the client's cancel dispatch.
- The official client implements only `fs/read_text_file` and `fs/write_text_file` within the supplied proof directory, plus permission and session-update handlers. It advertises no terminal, elicitation, or extra filesystem capability.

ACP remains adequate for the observed OpenCode prompt, permission, cancel, continuation, load, and resume flows. It does not report the final prompt outcome after an abrupt process/connection loss; represent that as unknown. If the server contract requires authoritative reconciliation after process loss, ACP alone is insufficient and a native OpenCode serve/API or SDK-backed state lookup would be needed. The server integration must preserve that unknown outcome and the distinction between observer detach and native cancellation.
