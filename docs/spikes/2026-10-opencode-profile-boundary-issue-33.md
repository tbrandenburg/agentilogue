# Native OpenCode boundary proof (issue #33)

**Decision: NO-GO for slice B.** Retain ACP and `/api/chat`. A revised synthetic test showed A's server returning B's marker when given B's relative file path and directory header, so separate XDG profiles do not establish a filesystem authorization boundary. An absolute-path-only request was inconclusive (HTTP 500). Do not treat the foreign abort's HTTP 200/`true` as proof it affected active work: no active B run existed, so the side effect is **NOT TESTED**.

## Issue and scope

Issue [#33](https://github.com/tbrandenburg/agentilogue/issues/33) is the prerequisite for #34. The complete issue body was read with `gh issue view 33 --json number,title,body,state,url,comments`; comments were empty. PR #32 was merged (`2026-10-10T09:08:53Z`). Branch: `issue/33-native-opencode-proof`. This proof makes no production runtime/UI changes.

## Versions and research

Recorded environment: OpenCode CLI `1.18.32`, Python `3.12.3`, Bun `1.3.9`, Node `v24.15.0`, Next.js `16.3.8`, assistant-ui React `0.15.25`. The OpenCode adapter and SDK were **NOT TESTED** in this worktree.

Current server documentation (`https://docs.opencode.ai/docs/server/`, retrieved 2026-10-10) documents Basic auth, `/session/:id/abort` returning a boolean, `/file/content?path=...`, and directory override support on search routes. Context7 source research reports that OpenCode's workspace routing selects the directory from the `directory` query, then `x-opencode-directory`, then cwd. The `/file/content` absolute-path behavior and cross-profile access were not separately revalidated against the pinned binary in this revision.

## Revised proof and evidence status

[`opencode-profile-isolation-proof.py`](./opencode-profile-isolation-proof.py) uses OS-selected loopback ports, checks the candidate listeners before starting a child, and verifies the listener PID is the launched process before readiness or API requests. It checks expected session-list, foreign-session, file-read, and authentication outcomes; timeouts and cleanup uncertainty are nonzero `INCONCLUSIVE`, and failed expectations are nonzero `FAIL`. Cleanup terminates only captured children and checks their selected ports for remaining listeners.

Coordinator rerun: `python3 docs/spikes/opencode-profile-isolation-proof.py` against OpenCode `1.18.32` selected ports `34507` and `40343`, and verified listener PIDs `768848` and `769006` before requests. Both profiles created one session; both ordinary and roots/archived lists contained only their own ID. Foreign metadata, messages, and delete returned 404. Foreign abort returned HTTP 200 with JSON `true`, so the API did not reject the foreign ID; because B had no active run, the effect on active work remains **NOT TESTED**. The absolute-path-only request returned HTTP 500 (inconclusive); the separate relative-path + B directory-header request returned HTTP 200 containing `B_MARKER_ONLY` (boundary failure). Missing and wrong auth returned 401. The arbitrary-origin request returned 200 and reflected `http://127.0.0.1:33999`. Both child processes were waited out, and neither selected port had a listener after cleanup. The probe result was `INCONCLUSIVE`, exit `1`, with two expected-boundary failures and one inconclusive file-path result.

| Check                                                                                 | Current status                                          | Evidence/limitation                                                                                                                        |
| ------------------------------------------------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Profile session listing                                                               | **PASS (narrow)**                                       | Revised run: each profile listed its own synthetic ID and not the other ID in both routes.                                                 |
| Foreign metadata/messages/delete                                                      | **PASS (narrow)**                                       | Revised run returned 404 for each.                                                                                                         |
| Foreign abort                                                                         | **FAIL (route response)**; active effect **NOT TESTED** | Revised run returned HTTP 200 and JSON `true` for B's foreign ID; no active B run existed, so no claim is made about aborting active work. |
| Absolute path without directory override                                              | **INCONCLUSIVE**                                        | Revised run returned HTTP 500 without marker; not a reliable boundary result.                                                              |
| Directory header with relative path                                                   | **FAIL (NO-GO basis)**                                  | Revised run returned HTTP 200 containing `B_MARKER_ONLY` from B's synthetic project.                                                       |
| Authentication                                                                        | **PASS (narrow)**                                       | Revised run returned 401 for missing and wrong credentials.                                                                                |
| Origin/CORS                                                                           | **Not an authorization boundary**                       | Revised run returned 200 and reflected the arbitrary origin.                                                                               |
| Active foreign-run abort effect, SSE, child sessions, restart, permission/fork/revert | **NOT TESTED**                                          | No safe synthetic active run or these route cases were performed.                                                                          |
| Native runtime, real provider chat/tools/title, browser                               | **NOT TESTED**                                          | No adapter or provider credentials were exercised for this profile-boundary proof.                                                         |

## Reproduction

Prerequisites: Linux with `/proc` listener ownership visibility, Python 3, and `opencode` on `PATH`. No provider credentials are required. The script refuses an occupied selected port before starting a server or sending requests, uses temporary synthetic projects/profiles, and never terminates a process it did not launch.

From the repository root:

```sh
python3 docs/spikes/opencode-profile-isolation-proof.py
```

Expected exit contract: `0` only when every checked expectation passes and cleanup finds no listener; `1` with `RESULT FAIL` for a boundary assertion failure, or `1` with `RESULT INCONCLUSIVE` for setup/readiness/timeout/cleanup uncertainty. Observed exact result: `RESULT INCONCLUSIVE failures=2 inconclusive=1`, exit `1`; the two failures were foreign abort returning true and directory-header file read, and the inconclusive was absolute-path-only HTTP 500.

## Decision and handoff

**NO-GO. #34 remains blocked.** The revised synthetic directory-header file read is sufficient to reject profile separation as a complete project/filesystem boundary; it is not a claim of OS-level sandboxing. A same-origin boundary would need to keep credentials server-side and authorize routes, session IDs, directories, mutations, and events. Building that gateway is outside this proof. Keep ACP and `/api/chat`; do not expose a direct authenticated OpenCode endpoint to browser code. Reconsider native integration only after a minimal boundary is designed and its relevant HTTP/SSE surface is proven with synthetic projects.

## Validation record

Coordinator validation after frozen install: `bun install --frozen-lockfile` passed (303 installs checked; no changes); `bun run format`, `bun run lint`, `bun run typecheck`, `bun test` (71 passed, 0 failed; 12 files), `bun run build`, `bun run models:check`, `python3 -m py_compile docs/spikes/opencode-profile-isolation-proof.py`, and `git diff --check` passed. The OpenCode proof intentionally exited `1` with `RESULT INCONCLUSIVE failures=2 inconclusive=1`; cleanup reported no remaining listeners on either selected port. The first format check found report formatting drift; `bun run format:fix -- docs/spikes/2026-10-opencode-profile-boundary-issue-33.md` corrected it, and the subsequent full format check passed.
