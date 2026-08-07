<!-- docs/plans/AGENTIC_CHAT_WORKER_PHASE_4_SLICE_13_READ_CANARY_READINESS_AND_EVIDENCE_GATE_PLAN_2026-08-04.md -->

# Agentic Chat Worker Phase 4 Slice 13 — Read Canary Readiness and Evidence Gate

**Prepared:** 2026-08-04 EDT  
**Status:** Readiness hardening and evidence tooling are implemented and deployed on exact revision `8ae5ae7f2d5b7c6f48855c5371a05031d3bca677`, but the production gate remains open. The first request correctly exposed disabled routing. A second, worker-selected request then failed closed before atomic admission because the web's 1.5-second end-to-end capacity deadline left no transport budget around the worker's separate 1.5-second collection ceiling. No worker turn row or provider call was created. Routing is back to exact `false` in Ready production deployment `dpl_7467BvfiP1pids538fmTszcfFS46`; the bounded timeout repair is recorded in Slice 14 and must be deployed before one new canary is authorized.  
**Authority:** The user asked to double-check the completed work and continue with the next part.

## Outcome

Slice 13 makes the first bounded production-read canary honest and repeatable. It closes one real cross-host capacity bug, proves the current deployment boundary, and adds a fail-closed verifier for the exact durable evidence created by a successful one-read turn.

This slice adds no migration and makes no production database write. The Slice 12 migration is already hosted. The verifier uses an explicit turn UUID and service-role `GET` requests only; it never searches for a vague “latest” turn, invokes a provider, admits work, changes routing, or prints assistant/project/tool-result content.

## Deployment boundary re-audit

Read-only production inspection found:

- the production Vercel deployment is Ready;
- pushed `HEAD` is `3a7f30c0b`;
- that Git tree does not contain `apps/worker/src/workers/agentic-chat/readOnlyTool.ts` or the local Slice 11 bounded-read implementation;
- the Railway worker health endpoint returns HTTP 200 with Agentic Chat enabled, healthy, running, and not draining;
- the authenticated capacity endpoint returns HTTP 200 with `Cache-Control: private, no-store`, queue age zero, provider available, publisher healthy, and zero pending publisher bytes; and
- no live provider call, worker admission, or production write was made during this audit.

The practical conclusion is strict: production health is good, but it does not prove Slice 11. Running a project-status “canary” before the reviewed local code is pushed and deployed would test an older path and produce unusable release evidence.

## Capacity freshness bug and fix

Five consecutive production capacity samples arrived with worker `observedAtMs` 33–35 ms ahead of the web host receipt clock. The prior evaluator treated every negative age as stale. A healthy capacity projection could therefore close solely because Railway and Vercel clocks were separated by a few milliseconds.

The evaluator now permits at most 1,000 ms of future skew. Evidence at exactly +1,000 ms remains open; +1,001 ms fails closed as `stale_evidence`. The existing 15-second maximum past age remains unchanged. This tolerance is deliberately much smaller than the freshness window and does not allow missing, old, malformed, or pressured evidence to route work.

## Explicit-turn durable evidence verifier

Run after the reviewed web and worker revisions are deployed and one controlled internal project-status turn has completed:

```bash
pnpm verify:agentic-chat-read-canary -- --turn-id <exact-turn-run-uuid>
```

The CLI loads the canonical Supabase URL/service key, trims environment-boundary whitespace, requires exactly one canonical turn UUID, and reads only the rows linked from that turn. It returns a redacted count/status summary and a numbered failure list. It exits 0 only when every durable invariant passes, 1 for evidence failure, and 2 for invalid invocation/configuration or inability to read the evidence source.

The verifier requires:

1. one completed `worker_realtime` / `agentic_chat_worker_v1` turn with normal `stop`, no failure, and database-derived tool counters `1/1`;
2. one current v3 immutable input artifact whose tool surface contains `get_project_overview`;
3. a contiguous current-generation public event stream with exactly one first-step planning cue, tool call, successful tool result, finalizing phase, and terminal `done` in the required order;
4. an exact non-empty provider tool-call ID shared by the public call, public result, and durable ledger row;
5. one successful `project_read` ledger row at sequence one, one result, no zero-result marker, no user action, no effect, and exactly the returned project in `affected_entities`;
6. canonical equality between public call arguments and ledger arguments, and between the durable ledger result and public result;
7. ledger persistence timestamp no later than the public result timestamp;
8. terminal turn/event/stream-snapshot agreement through the final durable sequence;
9. exact assistant-message, prompt-snapshot, queue-job, user/session/stream/generation linkage;
10. either an internally exact aggregate usage triple or a wholly unknown triple—partial usage fails;
11. zero mutation-effect rows; and
12. the exact ten-observation Slice 12 lifecycle projection in its bounded semantic order.

No assistant text, project name, project result, prompt content, user ID, or provider call ID is printed in the success summary.

## Evidence boundary

The database cannot reconstruct the provider HTTP request bodies. A successful durable turn therefore cannot, by itself, prove that the first request carried the exact frozen schema or that the second request disabled tools. Those remain release gates in the source-controlled provider/network tests that compare the full outgoing definition, preserve the provider call ID, reject a widened same-name schema before `fetch`, prohibit a second tool round, and cap the invocation at two requests.

Likewise, one successfully completed read turn cannot simultaneously demonstrate that cancellation won around the read. Cancellation/generation fencing remains a deterministic race-test gate: cancellation before execution prevents the ledger; cancellation or ownership loss at the read-ledger transaction prevents the public result and synthesis. Do not mislabel absence of cancellation rows in the success canary as live cancellation proof.

## Verification

- Capacity and transport decision focus: 2 files / 18 tests passing.
- Canary evidence verifier: 7/7 tests passing, including strict explicit-ID parsing, zero-match short-circuiting, mutation/duplicate-row, identity/result, partial-usage/lifecycle, and wholly-unknown-usage boundaries.
- Slice 11 focused production read path: 5 files / 60 tests passing after the release-readiness changes.
- Standalone strict TypeScript check for the verifier, tests, and CLI: passing.
- Touched web-file ESLint: passing.
- Whole-worktree `svelte-check`: 0 errors / 0 warnings.
- Relevant Prettier and `git diff --check`: passing.
- CLI invalid-invocation boundary: exits 2 before any network request.
- Hosted zero-match smoke read: service-role PostgREST access succeeded and the explicit nonexistent turn failed closed before linked-row collection or content output.

## Production activation audit — 2026-08-05 EDT

The reviewed release is now pushed and deployed. Local `HEAD` and `origin/main` are the exact same revision, `8ae5ae7f2d5b7c6f48855c5371a05031d3bca677`; that Git tree contains the bounded read implementation, lifecycle projection migration, generated types, capacity-skew fix, and explicit-turn verifier. Railway and Vercel both reported successful deployment status for that exact revision.

The first controlled existing-session request was:

> Give me a concise current status overview of this project. Use the project overview tool.

The production UI completed normally, displayed one project-overview tool action, produced a concise answer, and made no mutation. Exact durable lookup resolved turn `7fb17d25-a1c7-46d7-8d4c-1ccceb897127`, but the row was `legacy_sse` with no worker artifact, queue job, stream state, or lifecycle projection. The verifier therefore failed closed as designed. Its redacted summary reported one tool row, one tool round/call, zero mutation effects, and the expected missing worker-only evidence; no assistant/project/tool-result content was printed.

The root cause was production configuration drift, not the bounded-read implementation: Vercel Production had `AGENTIC_CHAT_WORKER_ROUTING_ENABLED=false` and an empty `AGENTIC_CHAT_WORKER_ROUTING_USER_IDS`. The activation procedure had previously claimed the single-user cohort was staged, so that earlier record was inaccurate. The production values were corrected to exact `true` and exactly one canonical internal user UUID, with byte/whitespace, uniqueness, canonical-format, and exact-user checks passing without printing the value in the evidence record.

Vercel then rebuilt exact revision `8ae5ae7` without cache as deployment `dpl_7KDqFpWh4qCyzVCTr5hc53Pnh8Sj`. It reached Ready and was aliased to `build-os.com`. Post-deploy probes passed:

- `build-os.com` returned HTTP 200;
- the unauthenticated transport boundary returned HTTP 401 with `Cache-Control: private, no-store` and `Vary: Authorization`;
- Railway `/health` returned HTTP 200 with the overall runtime and Agentic Chat both healthy/running;
- authenticated capacity returned HTTP 200 and `private, no-store` with queue age zero, provider available, publisher healthy, and zero pending bytes; and
- the observed cross-host evidence offset was -348 ms at receipt, within the new 1,000 ms tolerance.

## Second activation attempt and transport-budget diagnosis

Immediately before the second request, an authenticated production capacity probe returned HTTP 200 with `private, no-store`, queue age zero, provider available, publisher healthy, and zero pending bytes. Its evidence timestamp was 181 ms ahead of the probing host, within the existing 1,000 ms skew allowance.

At `2026-08-05T14:07:08.280Z`, the established project session submitted the same controlled text-only request. Transport negotiation selected the worker path, but the independent capacity observation immediately before atomic admission returned closed. The UI surfaced `Worker turn capacity is temporarily unavailable`; no retry or legacy fallback was attempted.

A narrow service-role lookup for the exact session, request text, and post-start time returned zero `chat_turn_runs` rows. This proves the request did not cross atomic admission: it created no immutable artifact, queue job, stream projection, tool ledger, mutation effect, or provider call. There is therefore no turn UUID to pass to the explicit verifier, and no second request was sent.

The configuration was canonical and not the cause: Vercel Production's worker URL and bearer token were present, whitespace-free, printable, and byte-equal to the credentials that successfully queried the worker directly. The deterministic failure was timeout composition:

- the worker already bounds its own capacity collection to 1,500 ms;
- the web caller also aborted the entire DNS/TLS/proxy/request/response path at 1,500 ms;
- five probes using that exact outer deadline all timed out at 1,502–1,503 ms; and
- longer diagnostic probes returned healthy evidence in 7,625 ms, 2,505 ms, and 1,659 ms.

The fail-closed path behaved correctly, but the equal inner and outer deadlines made healthy cross-provider evidence unreliable. Slice 14 keeps the worker's 1.5-second collection ceiling and gives the web call a bounded 5-second end-to-end deadline. A fake-timer regression proves a healthy response can arrive at 4,999 ms without aborting; all existing authentication, schema, freshness, pressure, body-bound, and failure behavior remains closed.

Following the gate procedure, `AGENTIC_CHAT_WORKER_ROUTING_ENABLED` was returned to exact `false` while the exact one-user cohort remained staged. Exact source revision `8ae5ae7` was redeployed without including local dirty changes as production deployment `dpl_7467BvfiP1pids538fmTszcfFS46`; it reached Ready, was aliased to `build-os.com`, and the production alias returned HTTP 200.

## Exact next gate

1. Push and deploy the reviewed Slice 14 timeout repair with routing still exact `false`; require GitHub CI and the resulting production deployment to be green/Ready.
2. Reconfirm the disabled-mode transport decision remains legacy and the authenticated worker capacity projection is open.
3. Change only `AGENTIC_CHAT_WORKER_ROUTING_ENABLED` to exact `true`; keep the cohort at exactly one canonical internal user.
4. Submit one new controlled, text-only, existing-session project-status request and retain its exact `turn_run_id`. Do not reuse either failed attempt as evidence.
5. Require the new durable row to be `worker_realtime`, then run the explicit-turn verifier and retain its redacted result with the source-controlled provider/network and cancellation-race receipts.
6. Return routing to exact `false` if the fresh turn falls back, fails, duplicates, or cannot satisfy the verifier; otherwise keep the cohort at exactly one user until the evidence is reviewed.
7. Do not broaden the cohort, tool surface, provider rounds, mutations, attachments, or concurrency until that evidence is reviewed.

This is the natural stopping point before the Slice 14 release and one new real canary. Parallel reads, new read tools, mutations, attachments, supervisor actions, billing, and broader rollout remain separate capability decisions.
