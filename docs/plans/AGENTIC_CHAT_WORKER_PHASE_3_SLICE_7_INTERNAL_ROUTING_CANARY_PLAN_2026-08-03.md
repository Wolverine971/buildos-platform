<!-- docs/plans/AGENTIC_CHAT_WORKER_PHASE_3_SLICE_7_INTERNAL_ROUTING_CANARY_PLAN_2026-08-03.md -->

# Agentic Chat Worker Phase 3 Slice 7 — Internal Routing Canary

**Prepared:** 2026-08-03 EDT  
**Status:** Superseded activation record. The bounded-read release is deployed on exact revision `8ae5ae7f2d5b7c6f48855c5371a05031d3bca677`. After repairing the empty cohort, the fresh worker-selected request failed closed before atomic admission because the web's 1.5-second end-to-end capacity timeout equaled the worker's own 1.5-second collection ceiling. Zero worker turn rows were created. Routing is again exact `false` in Ready deployment `dpl_7467BvfiP1pids538fmTszcfFS46`; continue with the Slice 14 timeout repair before another canary.  
**Authority:** The user authorized repairing the failed build and continuing to the next slice. That authorized the production secret remediation, fail-closed prerequisite staging, and local implementation. It did not authorize pushing the dirty worktree, broadly enabling worker routing, or making a provider call.

## Migration status

This slice changes web TypeScript/Svelte, tests, environment configuration, and planning records only. The hosted Agentic Chat migration chain remains current through exact receipt `20260802037000`; no new database migration is required or applied.

## Build incident and remediation

The pushed Vercel build initially failed because `CRON_SECRET` contained leading or trailing whitespace and therefore could not be used as an HTTP header value. Production `CRON_SECRET` and `PRIVATE_CRON_SECRET` were atomically rotated to the same fresh canonical value without surrounding whitespace or a trailing newline. The value was not printed.

The resulting redeploy cleared that validation and then exposed a second cacheless-build problem: Vercel built `apps/web` without first producing the workspace dependency artifacts, so `@buildos/shared-types/dist` was absent. `apps/web` now runs its existing transitive workspace dependency build before the normal production build. A final local `pnpm --filter @buildos/web build` completed through `adapter-vercel`, proving the dependency prebuild and the completed canary code together. The adapter's optional cross-platform Sharp lookup warnings remain non-fatal.

The corrected pushed revision was subsequently deployed from an exact clean `HEAD` archive because the Git integration did not create a new deployment automatically. The cacheless Vercel build completed and the production alias was promoted successfully.

## Production deployment proof

The exact clean revision `2f874afc4` deployed as `build-ff0z7t7za-djwayne35gmailcoms-projects.vercel.app` and was promoted to `build-os.com`. Read-only post-deploy probes showed:

- the production alias returns HTTP 200;
- the new transport route is live and returns the expected unauthenticated HTTP 401 boundary;
- that boundary sets `Cache-Control: private, no-store` and `Vary: Authorization`; and
- no transport lease, admission, or provider call was created by the probes.

The routing switch remained false for the entire build, promotion, and verification sequence.

## Deployed worker re-audit

The latest Railway deployment completed successfully. Read-only production verification showed:

- `/health` returns HTTP 200 with Agentic Chat enabled, healthy, running, not draining, and no consecutive claim failure;
- the authenticated `/agentic-chat/capacity` route returns HTTP 200 with private/no-store headers;
- capacity evidence is fresh, the ready-job age is zero, the provider is available, and the publisher is healthy with no pending bytes; and
- no live turn or provider request was made.

## Production prerequisites staged closed

At the time of the original Slice 7 audit, Vercel Production was intended to have:

- a fresh `AGENTIC_CHAT_TRANSPORT_LEASE_SECRET`;
- `AGENTIC_CHAT_WORKER_KILL_EPOCH=0`;
- `AGENTIC_CHAT_WORKER_ROUTING_ENABLED=false`; and
- `AGENTIC_CHAT_WORKER_ROUTING_USER_IDS` set to the exact one-user internal Railway cohort.

The secrets and cohort identity were never printed. A later exact pull on 2026-08-05 proved the cohort was actually empty and the switch remained false, so the original staged-cohort claim must not be used as evidence. Both values were then corrected, verified for exact bytes/format/single-user membership, and incorporated into Ready production deployment `dpl_7KDqFpWh4qCyzVCTr5hc53Pnh8Sj`. `turbo.json` and both environment examples declare the complete boundary so cacheless builds receive the required variables.

## Implemented server routing boundary

New transport decisions remain legacy unless every canary condition passes:

1. the client advertises the exact worker transport mode and contract;
2. `AGENTIC_CHAT_WORKER_ROUTING_ENABLED` is exactly `true`;
3. the authenticated user is in a strictly parsed, bounded, canonical UUID allowlist; and
4. the authenticated worker capacity projection returns the exact open decision.

Malformed, duplicated, oversized, missing, stale, closed, or failed routing evidence selects legacy. Non-cohort requests do not query capacity. Existing persisted turns bypass the live policy and retain their immutable stored transport mode, contract, and decision id.

Worker admission still performs its own capacity preparation, so a capacity change between negotiation and admission fails closed rather than creating work under stale evidence.

## Implemented browser canary boundary

The mounted chat controller now negotiates transport only for an existing session's ordinary user-authored text turn when the mounted worker-adoption authority is available. First/sessionless turns, attachments, voice notes, and agent-authored peer turns retain the legacy path.

If the server selects legacy, the existing SSE behavior is unchanged. If it selects worker transport, the browser sends the signed lease to the atomic admission route and adopts only the server-authoritative returned handle. It never starts the legacy SSE request after worker admission has begun.

Known non-admission responses remove the optimistic bubble and restore the input. An uncertain admission response retains the optimistic bubble and triggers owned-session discovery; it does not retry through legacy and therefore cannot duplicate a possibly committed turn. Reconnect, Stop, durable text/event convergence, and terminal projection remain owned by the mounted worker runtime from the earlier slices.

## Validation

Validation after the final changes:

- complete Agentic Chat web/service/route/PostgreSQL gate: 108 files / 878 tests passed;
- focused controller/UI/composed flow: 3 files / 38 tests passed;
- whole-worktree `svelte-check`: 0 errors / 0 warnings;
- touched-file ESLint passed;
- server-route size guard passed with no new violation;
- `git diff --check` passed;
- Svelte autofixer reported no actionable issue in either touched Svelte file; and
- complete web production build passed through all transitive dependency builds, Vite SSR/client output, and `adapter-vercel`.
- exact cacheless Vercel production build reached Ready and was promoted to `build-os.com`;
- production alias and protected transport-boundary probes passed; and
- the GitHub CI lint failure was reproduced as a stale process-scoped Vite dependency-cache reference in the Agent Skills catalog guard. Running that guard in explicit test mode fixes the boundary; the guard passed twice in separate processes, the complete web lint passed, and the exact root `pnpm turbo lint` CI command passed with only the repository's existing warnings.

No paid model call, provider request, live worker admission, or worker-mode production decision was made.

## Deployment and one-turn canary procedure

1. Push the reviewed Agent Skills guard mode follow-up and this evidence record; require the resulting GitHub CI run to pass.
2. Require the resulting Vercel production deployment to reach Ready; confirm the routing environment remains false.
3. Using an authenticated internal session, confirm the disabled transport route still selects legacy for a fresh decision.
4. Reconfirm Railway composite health and authenticated capacity immediately before activation.
5. Change only `AGENTIC_CHAT_WORKER_ROUTING_ENABLED` to exact `true`.
6. Run one controlled, text-only turn in an existing session as the exact internal cohort user.
7. Exercise Stop/reconnect and inspect the durable turn, queue, projection, terminal receipt, and cost evidence.
8. Set routing back to `false` after that single turn until its evidence is reviewed.

Do not broaden the cohort, enable worker attachments/voice/session-inline creation, raise chat concurrency, or route non-cohort users in this slice.
