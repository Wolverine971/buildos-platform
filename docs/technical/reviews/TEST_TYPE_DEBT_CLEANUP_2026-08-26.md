<!-- docs/technical/reviews/TEST_TYPE_DEBT_CLEANUP_2026-08-26.md -->

<!-- doc-status: point-in-time -->

> **Point-in-time document.** Written 2026-08-26; describes the state of the system at that moment.
> It is not a current reference. Verify against code before acting on anything here.

# Test type-debt cleanup — 2026-08-26

## Baseline

The raw test TypeScript projects began this cleanup pass with 1,443 diagnostics across 205 files:

| Workspace | Diagnostics | Files |
| --------- | ----------: | ----: |
| Web       |         818 |   155 |
| Worker    |         625 |    50 |

The debt checker is a ratchet, not a declaration that these diagnostics are acceptable. Every
verified batch must lower `scripts/testing/test-type-baseline.json` by the observed reduction.

## Cleanup principles

- Fix inference once at mock, fixture, and generated-route boundaries.
- Prefer canonical builders and purposeful input types over annotations on every object literal.
- Preserve `strict` and `noUncheckedIndexedAccess`.
- Do not use unused-name prefixes, blanket casts, non-null assertions, or baseline increases.
- Treat a stale fixture as a possible contract or implementation loose end before changing it.
- Run focused behavior tests as well as typechecks; a lower diagnostic count is not enough.

## Prioritized backlog

| Priority | Work                                                        | Starting diagnostics | State                  |
| -------- | ----------------------------------------------------------- | -------------------: | ---------------------- |
| P1       | Route-specific generated `RequestEvent` types               |                   69 | Completed              |
| P1       | Worker provider test harness inference                      |                  404 | Completed              |
| P1       | Live/legacy tool-call contract decision                     |      218 family-wide | Delegated to Tasker 64 |
| P2       | Worker executor harness inference                           |                   85 | Not started            |
| P2       | Checked collection and mock-call access                     |        About 297 web | Not started            |
| P3       | Stale database/domain fixtures and narrow production inputs |          At least 97 | Not started            |
| P3       | Runtime/config compatibility and bespoke tail               |       Remaining debt | Not started            |

## Current pass boundary

This pass intentionally stops after:

1. Replacing generic SvelteKit `RequestEvent` imports in affected route tests with each route's
   generated `$types` contract.
2. Typing the worker provider test harness at its client/tool factory seams so Vitest call tuples and
   tool arrays infer correctly without per-test annotations.
3. Running focused tests and both workspace debt checks, then recording the exact result here.

The live/legacy tool-call decision is documented independently in
`tasker/64-agentic-chat-tool-call-contract-compatibility.md` and is not implemented in this pass.

## Change ledger

| Batch                   | Implementation                                                                                                                                                                                                                                                    | Verification                                                                                                                                                         | Result                   |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| Route event contracts   | Replaced the generic SvelteKit `RequestEvent` import in 19 route tests with each route's generated `./$types` contract. No generic imports remain in route `server.test.ts` files.                                                                                | Focused Vitest run: 19 files and 69 tests passed. Web debt check passed at the lowered baseline.                                                                     | Web: 818 → 749 (-69)     |
| Worker provider harness | Typed provider stream mocks at the client port, normalized tool-definition fixtures at their factory boundaries, narrowed message/schema reads with runtime guards, and preserved artifact-version discrimination through one helper. No production code changed. | Worker Vitest run: 138 files passed, 1 skipped; 1,228 tests passed, 1 skipped. Provider test has zero diagnostics; worker debt check passed at the lowered baseline. | Worker: 625 → 221 (-404) |

## Pass result

This bounded pass removed 473 diagnostics and lowered the combined ratchet from 1,443 to 970. The
remaining prioritized work was not started. Tasker 64 is ready for an independent agent to resolve
the important live/legacy tool-call contract loose end.

## Follow-up production lint pass

The repository lint pipeline initially stopped before ESLint because document-patch reanchoring
returned the full conflict union, including the apply-only `WRITE_RACE` reason. The resolver now
advertises only conflicts it can actually produce, and the shared package builds successfully.

Worker lint warnings fell from 176 to 110. All non-`any` warnings are resolved: import ordering,
fake-async callbacks, stale promise wrapping, and the optional-chain branch. Catch boundaries now
use `unknown` plus guarded error-message/status extraction, and database update/cleanup payloads use
their generated row contracts where those contracts already exist.

The remaining 110 warnings were all explicit-`any` debt:

- 86 casts around untyped or stale Supabase table/RPC seams.
- 14 arrays returned by JSON project-graph/context RPCs without runtime decoders.
- 9 permissive notification payload records rooted in the shared `NotificationDelivery.payload`
  contract.
- 1 remaining bespoke annotation.

They were handled as boundary projects rather than by replacing `any` with decorative local types:

- Removed stale Supabase table/RPC casts where the generated database contract was already correct.
  This included scheduler, OCR, braindump, voice-note, profile/contact signal, Agent Run, Brief,
  project-loop, and notification paths.
- Added a shared, runtime-validated `ProjectGraphContext` contract matching the
  `load_project_graph_context` SQL projection. Snapshot and project-loop workers now decode the JSON
  response before consuming it, and the worker test harness supplies the real RPC shape.
- Replaced the permissive notification delivery record with a JSON-safe shared payload contract.
  A delivery is promoted to a sendable notification only after title/body validation; shared
  accessors narrow legacy direct-or-nested payload values for email and SMS.
- Added a shared Cycle claim decoder and outcome serializer. The worker no longer casts the RPC
  method or claim response.
- Deleted the unused worker-local tracked in-app notification service and fixed the active
  shared-agent-ops implementation to use the typed Supabase client and JSON-safe payload contract.
  Keeping a second unreferenced copy was drift risk, not unfinished UI.

Result: worker lint fell from 110 warnings to zero warnings and zero errors.

### Loose ends surfaced by the cleanup

- Resolved: `complete_cycle_run`, `complete_cycle_run_impl`, `fail_cycle_run`, and
  `fail_cycle_run_impl` return `boolean` in SQL, but PostgREST omits RPC return schemas from its
  OpenAPI document. The REST type generator now applies audited return overrides for these four
  Cycle RPCs. A live regeneration reproduces the four `boolean` signatures without unrelated
  generated-type churn.
- The snapshot worker previously fell back to `graph.project.icon_svg`, although the graph RPC does
  not select that field. The worker already requires and loads the project row with `icon_svg`, so
  the impossible fallback was removed. No icon-generation behavior was missing.
- Libri session/entity contracts had been duplicated locally. They now come from shared types, with
  JSON serializers kept at their persistence boundaries.

## Final verification

- The worker lint pipeline passes with zero ESLint errors or warnings, including the HTTP module-size
  guard.
- Shared-types and worker production typechecks pass.
- Shared contract tests pass: 57 tests across 6 files, including the new project-graph decoder and
  Cycle RPC decoder/serializer coverage.
- Focused worker behavior tests pass: 33 tests covering Cycle processing/adversarial cases,
  notification retry semantics, and degraded project-loop execution.
- Repository lint passes all 11 workspaces. The full production typecheck passes all 19 tasks with
  Svelte reporting zero errors and zero warnings. Both test-debt ratchets remain at their existing
  ceilings (web 540, worker 221); neither baseline increased.
- Production typechecks pass, including `svelte-check` with zero errors and zero warnings.
- The test-debt ratchets pass at web 540 and worker 221; neither ceiling was increased.
- A newly added document-proposal test briefly raised web debt to 541 by supplying a type argument to
  a non-generic Vitest matcher. The test now verifies both the custom error class and its `NO_CHANGE`
  code, and all five focused proposal-service tests pass.
- One combined Turbo run observed generated `shared-agent-ops` JavaScript while its declarations were
  being rebuilt and emitted transient check diagnostics. A stable standalone web check immediately
  passed cleanly. If this recurs without concurrent package work, the package build/typecheck task
  ordering should be audited rather than suppressing generated-file diagnostics.

## Second-pass audit — 2026-08-27

- Tightened the Cycle claim decoder so it rejects cross-field drift, not just malformed individual
  fields: positive/matching definition versions, matching project targets, matching trigger identity,
  valid claim-disposition/status pairs, and queue fencing identity on claimed runs. Contract errors
  now retain the rejected field path in the permanent queue error.
- Removed the snapshot worker's blanket `unknown`-to-`Json` cast. Snapshot and queue payloads now pass
  through a recursive serializer that rejects non-finite numbers and non-JSON values. The stale
  project-facet fallback through unprojected `props` was deleted; Start Here reads the typed RPC
  projection directly.
- Removed the remaining shared notification `any` defaults and permissive record parameters.
  Notification payloads accept unknown records at the external seam, then recursively validate JSON
  values before transformation. Direct tests cover both tracked payload construction and rejection of
  non-JSON values.
- Live Supabase RPC names are aligned (306 functions). Migration ledger, SQL contract inventory, and
  schema-generator tests pass. Repository lint passes all 11 workspaces; Svelte reports zero errors
  and zero warnings; test-debt ratchets remain web 540 and worker 221.
- Shared contracts now pass 60 tests across 7 files. Focused Cycle worker behavior remains 21/21.
- The complete worker suite passes with local HTTP binding enabled: 143 files and 1,245 tests passed;
  the opt-in Phase A workflow evaluation remains skipped as designed.
