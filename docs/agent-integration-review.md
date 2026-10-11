# Agent integration review and measurement

Use this checklist for each PR that adds or changes an agent runtime. Prefer a maintained assistant-ui runtime when its published API, deployment boundary, lifecycle, and required capabilities fit; preserve the agent's native behavior and keep any necessary boundary small. The [assistant-ui runtime documentation](https://www.assistant-ui.com/docs/runtimes) describes supported runtime choices and adapters. Do not add a projection through `AgentProvider`/`RunSnapshot` solely to make unlike runtimes look uniform; see [ADR 0001](decisions/0001-agent-integration-lanes.md).

## PR checklist

- [ ] Identify the maintained runtime/API and exact published version; explain any custom adapter or projection that remains.
- [ ] State deployment assumptions and verify ownership/isolation, permissions, cancellation, reconnect/process-loss behavior, and unknown outcomes for this lane. Never infer another lane's guarantees.
- [ ] List changed existing shared source modules separately from new provider-specific modules, tests, docs, generated files, and dependencies.
- [ ] Keep provider controls outside copied assistant-ui source. Report copied-source functional drift against the pinned released registry source using [#42's drift guard](https://github.com/tbrandenburg/agentilogue/issues/42); distinguish intentional allowlisted patches from unexpected drift.
- [ ] Explain each new abstraction and identify the second real implementation that needs it; otherwise keep the integration local.
- [ ] Attach the applicable behavioral-matrix evidence below (commands, environment, and brief notes); mark unavailable or unverified cases honestly.
- [ ] Complete the [release/compatibility checklist](#release-and-compatibility-checklist) before changing assistant-ui pins.

## Metrics and counting rules

| Measure                   | Definition                                                                                                                                                                                                                                                                                      |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Shared-source touchpoints | Count distinct **pre-existing shared source modules** changed by the integration. Exclude newly added provider-specific modules, tests, docs, lockfiles/manifests, generated files, and formatting-only changes. Report excluded categories separately; this is a locality measure, not effort. |
| Integration effort        | Engineer-hours spent on scoped integration implementation and debugging, with start/stop scope stated. Exclude unrelated work. If not tracked, report **UNMEASURED**. Compare only similarly scoped integrations and disclose capability/scope differences.                                     |
| Thread drift              | Use the #42 checker against the matching pinned released registry source. Report approved functional Thread patches and unexpected functional differences separately; expected unexpected differences: zero. Do not substitute LOC or changed-file totals for the checker.                      |
| Custom projection         | Count newly introduced custom message/event projection layers for maintained native assistant-ui runtimes. Target: zero; explain any exception.                                                                                                                                                 |

### Measured baseline: merged PR #36

PR [#36](https://github.com/tbrandenburg/agentilogue/pull/36), “feat: add fail-closed native OpenCode runtime path,” changed **24 files, +1,987 / -38 lines**. Its exact comparison is base `6ab9618f1e32d5f4018151cec858d7a209f23f7a` to head `c875a5fd1b00175cdeb6f0066c27df066494471c`. Applying the shared-source rule above to that diff yields **5 existing shared source modules**:

```text
app/assistant.tsx
app/page.tsx
components/assistant-ui/elements/session-controls-slot.tsx
components/assistant-ui/elements/session-controls.tsx
lib/run-target.ts
```

Reproduce the inputs with:

```sh
gh pr view 36 --json changedFiles,additions,deletions,headRefOid
gh api repos/tbrandenburg/agentilogue/pulls/36 --jq '.base.sha'
git diff --name-status 6ab9618f1e32d5f4018151cec858d7a209f23f7a c875a5fd1b00175cdeb6f0066c27df066494471c
```

The five-module count is a scoped locality baseline, **not** total implementation effort: #36 also added provider-specific implementation, security/lifecycle code, tests, and documentation. Engineer-hours were not recorded (**UNMEASURED**). The **≤50% effort** comparison is a future target only, not a demonstrated result or a 2× speedup claim. #43 is a controls refactor, not a comparable new adapter; #45 is blocked by the Pi boundary decision and supplies no second sample. Do not claim a 2× improvement until comparable effort data exists.

## Behavioral evidence matrix

Statuses summarize evidence linked here, not a blanket production-readiness declaration. `PASS` is limited to the named evidence; `FAIL` means a known acceptance gate failed; `BLOCKED` means a prerequisite prevents the test; `NOT TESTED` means no concrete evidence is recorded here.

| Lane                         | Runtime/selection and send                                                                                        | Isolation, lifecycle, and native behavior                                                                                                                                           | Current evidence/status                                                                                                                                                                                                                                                     |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AI SDK                       | Existing `useChatRuntime` path is retained; empty/unavailable send gating is covered by #41's guard-removal work. | Per-tab behavior, cancellation, and deployment-wide release compatibility are not asserted by this documentation baseline.                                                          | **PASS** — existing supported path and #41 send-gating result; additional matrix scenarios **NOT TESTED** here. See [#41](https://github.com/tbrandenburg/agentilogue/issues/41).                                                                                           |
| OpenCode ACP                 | Existing `useExternalStoreRuntime`/ACP lane is retained.                                                          | Do not infer experimental native OpenCode guarantees from ACP; this document records no fresh cross-tab/manual E2E run.                                                             | **PASS** — merged ACP implementation [PR #28](https://github.com/tbrandenburg/agentilogue/pull/28); extended matrix **NOT TESTED** here.                                                                                                                                    |
| Experimental native opencode | Fail-closed native path is present; this row is explicitly experimental.                                          | The follow-up browser report records server-loss/unknown-outcome recovery PASS, while same-mount recovery after restart stalled; it explicitly does not claim production readiness. | **PASS / FAIL / NOT TESTED** — [boundary report](spikes/2026-10-opencode-local-boundary-issue-34.md) records 18 PASS, 1 FAIL, and 3 NOT TESTED of 22 enumerated checks. The same-mount recovery FAIL remains unresolved; do not summarize this lane as an unqualified PASS. |
| Pi                           | Do not enable or claim a working Pi lane.                                                                         | Trusted-local server protection was not demonstrated; queues, approvals, reconnect, cancellation, and identity have no passing Pi evidence.                                         | **BLOCKED** — [#44](https://github.com/tbrandenburg/agentilogue/issues/44) NO-GO; [#45](https://github.com/tbrandenburg/agentilogue/issues/45) depends on it. **No Pi capability is PASS.**                                                                                 |

These statuses are bounded to the cited implementation/reports. A PR claiming broader readiness must attach fresh browser/server evidence for its changed behavior and identify exact package versions and environment.

## Release and compatibility checklist

- [ ] Verify the upstream API/slot exists in a **published stable** release and matching released registry source; an open upstream PR or `main` source is not a released API.
- [ ] Record exact locked and installed versions, peer ranges, overrides, and registry-source tag. Use registry publication/version and dist-tag evidence (for example `npm view <package> versions --json` and `npm dist-tag ls <package>`); distinguish `latest` from the exact version selected.
- [ ] Confirm the coherent version set with a frozen-lockfile install in an isolated checkout and run the project's relevant checks, including production build/route validation when dependencies or routes change.
- [ ] Record compatibility outcome and unsupported behavior. Follow [#47's compatibility assessment](https://github.com/tbrandenburg/agentilogue/issues/47): its current outcome is **NO-GO**, retaining current pins. Reassess only with new published compatibility evidence.
- [ ] For copied components, run [#42's drift guard](https://github.com/tbrandenburg/agentilogue/issues/42) against the exact matching release; report the guard result rather than claiming zero drift from inspection alone.

## Current dependency notes

- [#41](https://github.com/tbrandenburg/agentilogue/issues/41): suggestion guard removed (issue currently open).
- [#42](https://github.com/tbrandenburg/agentilogue/issues/42): drift guard implemented on branch `issue/42-assistant-ui-drift` (issue currently open).
- [#43](https://github.com/tbrandenburg/agentilogue/issues/43): provider-control composition implemented on branch `issue/43-provider-controls` (issue currently open); this is not a new-adapter effort sample.
- [#44](https://github.com/tbrandenburg/agentilogue/issues/44): NO-GO; trusted-local Pi server policy not demonstrated.
- [#45](https://github.com/tbrandenburg/agentilogue/issues/45): blocked by #44 and not implemented.
- [#46](https://github.com/tbrandenburg/agentilogue/issues/46): blocked while upstream [PR #8003](https://github.com/assistant-ui/assistant-ui/pull/8003) remains open; no unpublished slot is treated as available.
- [#47](https://github.com/tbrandenburg/agentilogue/issues/47): compatibility NO-GO; current pins retained.
