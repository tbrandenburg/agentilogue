# Issue #44: Pi server boundary — deferred

**Decision:** Defer implementation and do not expose or enable Pi. No `/api/pi/**` routes or Pi dependencies have been added, and no UI selector has been enabled. The adapter's HTTP/SSE contract is straightforward to wire, but a secure deployment boundary has not been demonstrated for this app. Issue #44 remains open for this implementation work; #45 stays blocked.

## Evidence

- `gh issue view 44 --comments --json title,body,comments` returned the full issue with no comments.
- Published npm metadata reports `@assistant-ui/react-pi@0.0.29` as latest. Its exports include browser-safe `.` and Node-only `./node`; peers are `@assistant-ui/react ^0.15.22` and `@earendil-works/pi-coding-agent >=0.80.8`.
- Published `@earendil-works/pi-coding-agent@1.1.0` requires Node `>=22.19.0`. The environment is Node `v24.15.0`; this satisfies the engine floor, but the package and its export/type compatibility have not been installed or validated against this app.
- Upstream assistant-ui source at commit [`0978a88de6327e259b0c542f9ae772ffc84b1d8d`](https://github.com/assistant-ui/assistant-ui/commit/0978a88de6327e259b0c542f9ae772ffc84b1d8d) documents the HTTP/SSE operations and `createPiNodeClient` process supervisor. The server example is an unauthenticated wiring example, not a trusted-local access policy. Its browser `createPiHttpClient` makes same-origin fetches but does not provide app-owned server authentication by default.
- ADR 0001 and `docs/spikes/2026-10-opencode-local-boundary-issue-34.md` describe the app's trusted-local policy and the observed failure of CORS/origin-only protection against a loopback alias. The tested opencode setup requires Basic authentication and a password supplied ephemerally by the user. Pi has no corresponding authentication mechanism in this project, and adding a UI credential flow is outside #44's requested server-only scope.
- The existing app scripts bind Next.js to `127.0.0.1`, but script configuration alone does not demonstrate that every supported production deployment remains loopback-only or has an equivalent authenticated boundary. Host/origin/`Sec-Fetch-*` validation is useful defense-in-depth; it does not authenticate callers that can reach the route directly.
- `df -h .` reported only 716 MiB free (filesystem 100% used) before worktree creation. Dependency installation and production build were therefore not attempted. The root `node_modules` was not used for package compatibility claims.

## Trust and safety consequence

Pi runs a filesystem- and shell-capable agent with a process-level supervisor. Exposing its read, mutation, and SSE methods without a boundary demonstrated for the actual deployment would grant that capability to any caller able to reach the Next.js process. A server-controlled scratch workspace narrows file scope but is not an OS sandbox for shell tools. An environment feature flag alone does not authenticate callers or prove deployment binding.

Therefore the safe state is absence of the routes and dependencies. This avoids an API that looks enabled while relying on unproven route-level checks. No Pi runtime is reachable from the app as changed. This is a deferment decision, not completion of #44's server implementation DoD.

## Reconsideration requirements

Next step for #44: establish and document the supported deployment trust boundary (loopback binding plus server-side Host/Origin/Fetch-Metadata and request validation, or an explicitly authorized user-authentication/CSRF flow). Then implement and test every upstream HTTP/SSE endpoint; use a disposable workspace to prove disconnect unsubscribes without cancelling a run. Pin exact dependencies and run frozen install, generated route validation, production build, negative security tests, and E2E with adequate free space.

## Research links

- [Assistant UI Pi README](https://github.com/assistant-ui/assistant-ui/blob/0978a88de6327e259b0c542f9ae772ffc84b1d8d/packages/react-pi/README.md)
- [Assistant UI Pi HTTP client](https://github.com/assistant-ui/assistant-ui/blob/0978a88de6327e259b0c542f9ae772ffc84b1d8d/packages/react-pi/src/client/httpClient.ts)
- [Assistant UI `with-pi` example](https://github.com/assistant-ui/assistant-ui/tree/0978a88de6327e259b0c542f9ae772ffc84b1d8d/examples/with-pi)
- [Pi adapter npm metadata](https://registry.npmjs.org/%40assistant-ui%2Freact-pi)
- [Pi SDK npm metadata](https://registry.npmjs.org/%40earendil-works%2Fpi-coding-agent)
