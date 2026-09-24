<!-- docs/architecture/PROJECT_REVIEW_V3_2026-09-21.md -->
<!-- doc-status: point-in-time -->

> **Point-in-time document.** Written 2026-09-21; describes the state of the system at that moment.
> It is not a current reference. Verify against code before acting on anything here.

# Project Review v3: source-bound answers

V3 addresses the concrete v2 failure where genuine citations accompanied a false overdue-date
claim and the editor amplified it. It adds a separately enabled, extractive review contract.
The model selects evidence and its order; host code validates and renders the factual content.
General interpretation, recommendations and action proposals remain outside this first contract.

## Boundaries

| Boundary      | Contract                                                                                             |
| ------------- | ---------------------------------------------------------------------------------------------------- |
| Admission     | `internal-project-review:v3`, default-off `AGENTIC_CHAT_PROJECT_REVIEW_V3_ENABLED` on web and worker |
| Frozen policy | `agentic_chat_project_review_policy_v3`                                                              |
| Evidence      | Existing v2 recipe and payload, unchanged; exact accepted checkpoint hash                            |
| Specialists   | `project_analyst@3`, `risk_reviewer@4`                                                               |
| Report        | `chat_workflow_role_report_v3`                                                                       |
| Synthesis     | Buffered JSON selection of accepted unit IDs; host-authored rendering                                |

V3 takes precedence over v2 only for new explicit project-review admissions when its flag is on.
Ordinary chat and explicit document/published-specialist profiles retain their existing paths.
Old admitted v1/v2 reviews retain their definitions and behavior. Disable web admission first
when draining v3; keep compatible workers until admitted runs finish.

Each specialist returns an outcome and up to five typed claims. No model-authored summary,
recommendation, provenance, spans or extra fields are accepted.

- `excerpt` selects a record, an allowlisted field, and an exact, uniquely occurring quote of at
  most 240 Unicode code points. The host calculates the span and attaches the checkpoint hash.
  Span offsets use **Unicode code points**, consistently in JavaScript and PostgreSQL. This is
  an explicit difference from the earlier offline prototype's UTF-16 spans.
- `overdue_tasks` names 1–32 distinct supplied tasks and requests a count or an all/some/none
  predicate. Code compares explicit due instants and known task states against the saved snapshot
  instant. Missing/invalid dates or unknown states remain unknown; completed tasks are excluded.
  The result refers only to the named subset. A false or unestablished predicate is rejected.

The whole checkpoint hash binds record content, coverage and project scope. The accepted evidence
index selects the authoritative projection if START HERE also appears in the document inventory;
projections are not silently merged. Prior AI suggestions and activity summaries are not claim
sources in this first contract.

PostgreSQL rechecks claim shape, context identity, evidence membership, exact quoted text/spans,
date results, outcome and host-generated compatibility fields before accepting a report. The
existing service-role, attempt, generation, plan, cancellation and budget fences remain in place.
On recovery, the worker reconstructs the report from the saved checkpoint and rejects any changed
claim or compatibility field. It does not consult newer live rows to justify an old claim.

The editor receives accepted units and the user question. Its output can select IDs only. The
worker buffers all editor bytes, validates the selection, then sends host-rendered text through
the existing durable answer cursor. Invalid prose never becomes a visible prefix. Exhaustion
falls back to the same checked units, with an explicit partial-review notice. Quotes and labels
are escaped for Markdown; source text cannot create an executable link or HTML element.
The renderer preserves each specialist's abstention even when the editor omits its ID, identifies
the abstaining specialist, and renders identical selected evidence only once.

## Limits

An exact quote establishes **which text a saved source contains**, not that its assertion is true.
Substring matching also does not establish that an excerpt preserves nearby qualifications,
negations or mitigations. Source selection can still be incomplete or unhelpful. A model-selected no-finding outcome means that
the specialist selected no material finding; it does not prove the project is healthy. The final
answer states the inspected-evidence limit and that no project changes were made.

This version deliberately excludes free-form interpretations and advice rather than assigning
them an uncalibrated “verified” label. Jev semantic support scoring remains research work; the
36-case synthetic probe does not justify enforcement. A future report version can add calibrated,
clearly labeled interpretations and typed proposals without changing admitted v3 runs.

The answer cursor remains a trusted-worker boundary: PostgreSQL validates accepted source claims,
while the worker validates editor selection and renders the answer. This change does not create
a database-side renderer or authorize untrusted clients to submit answer text.

## Validation and rollout record

Migration: `20260921143217_agentic_chat_project_review_v3.sql`, created with the Supabase CLI.
It depends on the v2 migration and was applied only to isolated QA `daudvqczjqxhpzstlfih` after
seven disposable-PostgreSQL tests passed. The branch inventory reconfirmed a non-default,
persistent test branch with `with_data=false`; active turn and queue counts were zero.

Focused checks passed: 12 source-binding/synthesis cases, 7 real PostgreSQL cases, 27 existing
runner cases, 22 existing role-report cases, 15 admission cases, shared package builds, worker
typecheck and the narrow live-harness typecheck. PostgreSQL cases exercise valid and invalid
editors, forged claims, Unicode spans, context mismatch, private grants and v1/v2 compatibility.
An initial SQL CASE-expression syntax error and a test's miscounted quote length were corrected
before the passing checks and before QA application.

Relevant advisor notices were informational RLS-without-policy findings on existing private
service-only tables, with no findings on the new helper/validator functions. Browser grants remain
revoked. Unrelated existing advisor warnings were not changed.
[Advisor explanation](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy).
Function security behavior was checked against the
[Supabase function documentation](https://supabase.com/docs/guides/database/functions).

The first live QA smoke passed in 25.974 seconds, with the permit fee and the correct **2 of 5**
overdue task count. Both specialists and the editor were accepted on their first attempt; source
records were unchanged. Its retained result is
`output/workflow-durable-v3-2026-09-21/smoke.json`. Inspection found an identical excerpt selected
by both specialists, so the final renderer now deduplicates it. The final-code smoke also passed:
**15.427 seconds**, one copy of the fee excerpt, the correct **2 of 5** count, all four model steps
accepted on their first attempt, and unchanged source records. This is a second synthetic smoke,
not evidence of a general latency improvement or broad answer accuracy. Its retained result is
`output/workflow-durable-v3-final-2026-09-21/smoke.json`;
[readable receipt](../research/specialist-quality-2026-09-21/live-v3-review.json).
The v3 smoke explicitly requests the fee excerpt and a typed count over all five supplied tasks;
the older v2 smoke asked an open-ended prioritization question. These runs verify the targeted
contract, not a controlled A/B quality or performance comparison.
In the final smoke, the first progress event arrived at 4.704 seconds and the first answer text
at 14.870 seconds; the checked answer is buffered while the visible workflow steps advance.

### Complete gate: failed, 44/52, source verification failed

`output/agentic-gate/specialist-review-v3-2026-09-21/` retains the three-repetition run from
14:50:53 to 15:19:26 UTC. It captured 44 turns: 42 passed their behavior checks and two failed.
The failed narrow update prevented its follow-up readback, so the expected 45th turn did not run.
There were zero evidence-capture errors. Calendar, DST, document edits, hostile-source handling
and cold retrieval passed their checks. **This is a failed gate, not release approval.**

| Case                                 | Retained failure                                                                                                                                                   |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Task batch, repetition 2             | All five tasks and three links saved correctly, but 63.441s exceeded 60s. A 4.821s buffered-progress failure retried successfully; model requests totaled 28.701s. |
| Narrow update, repetition 3          | Both provider attempts timed out before response headers, at 5s and 10s. No tool executed; the turn failed with `provider_stream_error`.                           |
| Grounded status, repetition 1        | The third `search_project` read timed out after 30.003s; five other reads completed. The turn failed with `read_tool_timeout`, taking 63.698s against 40s.         |
| Grounded status, repetitions 2 and 3 | Both answers passed their state and answer checks, but took 41.832s and 50.390s against 40s.                                                                       |

The timed-out search was already in a parallel read graph, with observed concurrency four.
Nearby database observation/cancellation requests were also slow. The trace does not establish
the database root cause, and model/tool timing sums are not disjoint wall-clock components.
[Retained failure diagnostics](../research/specialist-quality-2026-09-21/v3-gate-diagnostics.json).

Concurrent work changed the shared checkout during the gate: package/lockfile upgrades to
Vite 8 and Vitest 4, test configuration and tests, generated context files, and source headers.
This task made only documentation edits during the gate and did not revert the concurrent work.
The gate started with executable hash `53320c75859bde82cd8f171f76a118b4d4169f4a2ab59dbbeabf2af89c7f8dcd`;
the worker retained that identity, while the later web identity and final checkout differed.
Both the scorecard and gate therefore report failed source verification. Do not attribute the
whole run to one immutable executable tree or claim it validates the current checkout.

The gate exited at final source verification before its normal score-policy evaluation. A
[separate read-only evaluation](../research/specialist-quality-2026-09-21/v3-gate-policy-evaluation.json)
of its retained scorecard records the two failed cases, four timing violations, and provenance
failure without rewriting the original gate result.

After the concurrent tooling changes, all **83 focused tests** passed again under Vitest 4.1.11
(68 worker/PostgreSQL cases and 15 admission cases), and worker typecheck passed. The QA-applied
migration still matches the local SQL apart from an added leading file-header comment. The gate
stopped its services; isolated QA active-turn and active-queue counts were both zero.

V3 remains default-off and was not deployed or migrated to production. The next release validation
needs a settled, isolated checkout plus resolution of provider/read reliability and latency;
repeating this changing shared tree would not establish a clean release result.
