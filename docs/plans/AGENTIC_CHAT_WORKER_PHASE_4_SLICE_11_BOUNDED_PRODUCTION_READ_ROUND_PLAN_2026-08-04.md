<!-- docs/plans/AGENTIC_CHAT_WORKER_PHASE_4_SLICE_11_BOUNDED_PRODUCTION_READ_ROUND_PLAN_2026-08-04.md -->

# Agentic Chat Worker Phase 4 Slice 11 — Bounded Production Read Round

**Prepared:** 2026-08-04 EDT  
**Status:** Implemented, locally proved, and deployed on exact revision `8ae5ae7f2d5b7c6f48855c5371a05031d3bca677`. One fresh worker-mode internal live canary remains the release gate.  
**Authority:** The user asked to continue with the next safe implementation unit after Slice 10 was applied, verified, and documented.

## Outcome

Slice 11 activates one deliberately narrow production read capability for the already-enabled internal Agentic Chat worker cohort.

The provider may either answer directly or request exactly one `get_project_overview` call. That legacy-facing tool name is backed by the shared read-only `onto.project.status.get` gateway operation. After the read result is generation-fenced and durable, the provider receives that exact result in one final synthesis request with tools disabled. There is no third request and no mutation path.

This slice does not add or require a migration. It consumes the provider-call identity and replay-safe read ledger hosted by Slice 10 migrations `20260804035100` and `20260804036000`.

## Activation boundary

The production surface is enabled only when the immutable admission artifact's `toolSurface.toolNames` contains `get_project_overview`. All other prepared turns retain the previous text-only `toolChoice: none` path.

Even for an enabled turn, the worker does not trust the prepared artifact as the executable tool definition. It constructs one frozen worker-owned schema with:

- exactly one function named `get_project_overview`;
- exactly one of canonical `project_id` or a trimmed query of at most 200 characters;
- no additional arguments;
- one hard-coded backing operation, `onto.project.status.get`;
- a `read_only` gateway scope restricted to that operation;
- project scoping from the immutable request context when the turn is project- or ontology-scoped; and
- a canonical result bound of 480 KiB.

The OpenRouter/OpenAI-compatible HTTP client independently compares the complete outgoing definition to the frozen production definition before opening the network. A same-name definition with a changed description, widened arguments, or different schema fails closed.

Attachments remain disabled. The production assembly still supplies no mutation adapter. Parallel reads, multiple calls, multiple rounds, supervisor actions, and effects remain unreachable.

## Exact provider protocol

### First request

When the frozen tool is available, the first request carries exactly that tool and `tool_choice: auto`. The streaming parser assembles OpenAI-compatible tool-call deltas only at index zero and enforces bounded provider ID, function name, and argument bytes.

The provider adapter rejects:

- more than one tool call;
- a non-allowlisted name;
- incomplete or malformed tool-call deltas;
- mixed assistant text and tool-call output;
- a tool finish reason without a complete call;
- any tool output in a `toolChoice: none` turn; and
- events after the terminal provider frame.

Normal text-only responses retain immediate streaming; enabling the tool surface does not buffer a direct answer.

For a valid read, the adapter preserves the exact provider tool-call ID and emits stable SHA-derived planning, call, and result transition UUIDs. Its local provider-capacity lease remains held across the read and the second provider request.

### Durable read handoff

Immediately before the read, the executor reclaims the current turn and requires the exact `matching_current_claim` generation, queue job, processing token, user, session, correlation, input artifact, and user-message lineage. Cancellation, terminal state, or stale ownership stops before tool execution.

The executor then:

1. publishes the stable public `tool_call`;
2. executes the one read-only gateway operation;
3. validates and canonicalizes its result and telemetry;
4. persists it through `persist_agentic_chat_read_tool_execution` under the current generation and processing token;
5. publishes `tool_result` only after that ledger commit; and
6. passes the same structured durable result to provider synthesis.

The Slice 10 ledger transaction is the post-read cancellation/generation fence. A cancellation or ownership change that wins during the database read therefore prevents both the public result and synthesis. Successful lost-response replay remains exact and does not create a second row.

### Final synthesis

The second and final request appends:

- one canonical assistant tool-call message with the exact provider ID/name/arguments; and
- one tool-result message containing the exact canonical durable result.

It sends an empty tool surface with `tool_choice: none`. Any second-round tool call or tool finish reason fails permanently. The final assistant text streams normally.

Exact usage is summed across both provider requests only when both requests supplied internally consistent exact usage. If either request lacks exact usage, terminal usage remains unknown rather than reporting a misleading partial total. Capacity is released on success, failure, abort, or protocol rejection.

## Audit fixes

The implementation audit caught and corrected three edges before handoff:

1. Direct text answers initially risked being buffered while waiting to learn whether the provider would call a tool. The adapter now streams text immediately and rejects a later mixed tool call.
2. The first adapter draft reached the shared gateway through a broader execution facade. Production now imports the dedicated read dispatcher directly and hard-codes the single operation and scope.
3. The network boundary initially rechecked only the allowlisted name. It now compares the full outgoing definition to the frozen schema and has a regression test proving a widened same-name definition cannot reach `fetch`.

The prepared invocation also records that the initial iterable completed its one-read handoff before accepting synthesis. A caller cannot consume the read step and invoke synthesis without completing the initial provider round.

A follow-up adversarial audit tightened the successful-result boundary. `onto.project.status.get` has no valid successful zero-result shape: missing, ambiguous, forbidden, and failed reads are errors. The production adapter now requires one canonical project in every successful payload, requires it to match the immutable context or requested project when either fixes the target, and always records consistent `result_count: 1` / `zero_result: false` evidence. Missing-project and cross-project success payloads fail before ledger persistence or synthesis.

That audit also rejects provider frames containing multiple streamed choices rather than silently consuming only the first, estimates fallback usage from complete serialized messages (including tool-call history), proves that direct answers still stream with the tool enabled, and proves that a second synthesis tool round releases capacity while failing permanently.

## Implementation map

- `providerContract.ts` — optional one-time durable read synthesis contract.
- `readToolIdentity.ts` — stable planning/call/result transition UUIDs.
- `readOnlyTool.ts` — frozen one-tool definition and direct read-only gateway adapter.
- `readOnlyProvider.ts` — bounded first request, tool-call assembly, and final synthesis.
- `openRouterReadOnlyClient.ts` — exact HTTP tool surface and streamed tool-call delta transport.
- `fixtureTurnExecutor.ts` — immediate pre-read fence, durable result ordering, and synthesis handoff.
- `phase3Assembly.ts` — real read adapter injection while mutation remains disabled.
- focused provider, network, executor, assembly, and read-adapter tests.

## Verification

- Focused production read path: 5 files / 60 tests passing.
- Full worker suite: 93 passing files / 761 passing tests with one explicit opt-in skip.
- Real legacy stream one-read golden: 39/39 tests passing.
- Worker typecheck: passing.
- Worker lint: zero errors; the touched Agentic Chat files have zero warnings. Repository-wide pre-existing warnings remain.
- Agentic Chat runtime: 15/15 tests, typecheck, and CJS/ESM/declaration build passing.
- Shared Agent Ops: 12 files / 60 tests and typecheck passing.
- Relevant Prettier check and `git diff --check`: passing.

## Release gate and next safe unit

This is the natural code-complete stopping point. Do not widen the tool surface before deploying this slice and running one internal project-status canary.

### Release-readiness re-audit — 2026-08-04 EDT

The current production web and worker services are healthy, but the bounded-read implementation is not present in pushed `HEAD` `3a7f30c0b` and therefore cannot be credited to the current deployment. In particular, `apps/worker/src/workers/agentic-chat/readOnlyTool.ts` does not exist in that Git tree even though it exists in the local reviewed worktree. No live project-status turn was submitted against the older deployment, and no production write or provider call was made during this audit.

Read-only production probes found the Railway worker running and not draining, with no consecutive claim failure. Its authenticated capacity projection was open: queue age zero, provider available, publisher healthy, and no pending publisher bytes. Five samples also exposed a small normal infrastructure clock offset: worker evidence arrived 33–35 ms ahead of the web host's local clock. The web capacity evaluator previously rejected every negative age, which could incorrectly route a healthy cohort request to legacy. It now tolerates at most 1,000 ms of future skew and still fails closed at 1,001 ms or when evidence is more than 15 seconds old. The focused capacity/transport suite passes 18/18 tests, touched-file ESLint is clean, and whole-worktree `svelte-check` reports zero errors and zero warnings.

Slice 13 adds the exact read-only post-deploy evidence gate and records this deployment boundary in `AGENTIC_CHAT_WORKER_PHASE_4_SLICE_13_READ_CANARY_READINESS_AND_EVIDENCE_GATE_PLAN_2026-08-04.md`.

### Activation follow-up — 2026-08-05 EDT

The reviewed bounded-read files are now present in pushed `HEAD` and in the healthy Railway/Vercel production release. A controlled existing-session request visibly executed one overview tool and returned normally, but exact durable inspection proved it used `legacy_sse` because the production web routing switch was false and its cohort value was empty. That turn is not credited as the Slice 11 canary.

The two production Vercel routing values are now exact, whitespace-safe, and restricted to the single internal user. Exact revision `8ae5ae7` was rebuilt as production deployment `dpl_7KDqFpWh4qCyzVCTr5hc53Pnh8Sj`, reached Ready, and is aliased to `build-os.com`. Worker health and authenticated capacity remain open. Run one fresh request and require the explicit-turn Slice 13 verifier to pass before widening any capability.

The canary must prove:

1. a scoped internal turn is admitted to `worker_realtime_v1` with the immutable tool name present;
2. the first provider request exposes exactly the frozen tool and preserves the provider call ID;
3. exactly one linked ledger row commits before the public successful `tool_result`;
4. the final provider request has no tools and uses that exact durable result;
5. terminal assistant linkage and database-derived tool counts are `1/1`;
6. exact two-request usage is aggregated when both provider responses report it;
7. cancellation around the read cannot publish a post-cancel result or synthesis; and
8. no additional provider round, read call, or mutation is possible.

Keep the Slice 10 shared one-read golden and the full worker suite as release gates. The remaining code-only lifecycle-observability residual was closed by Slice 12's private service-only projection in `AGENTIC_CHAT_WORKER_PHASE_4_SLICE_12_PRIVATE_LIFECYCLE_OBSERVABILITY_PROJECTION_PLAN_2026-08-04.md`; its migration is hosted and its live access boundary is verified. Parallel reads, additional read tools, multiple rounds, mutations, attachments, supervisor actions, and billing each require their own deterministic golden and recovery matrix.
