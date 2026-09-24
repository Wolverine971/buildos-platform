<!-- docs/architecture/PROJECT_REVIEW_V2_2026-09-21.md -->
<!-- doc-status: point-in-time -->

> **Point-in-time document.** Written 2026-09-21; describes the state of the system at that moment.
> It is not a current reference. Verify against code before acting on anything here.

# Project Review v2

New explicit project reviews can opt into richer evidence and successful abstention. Ordinary
chat and old admitted project/document reviews retain their existing contracts. This is the first
implementation slice of the specialist reassessment,
not completion of its entire roadmap.

## Roadmap status

| Work                                          | Current result                                                                                                           | Still required                                                                                                 |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| Richer project evidence and useful abstention | Implemented, versioned, default-off; durable QA smoke passed                                                             | Passing release gate and source-bound answer quality before promotion                                          |
| Answer quality evaluation                     | Four fictional workflow fixtures, a 36-claim Jev probe, planner/second-specialist comparisons, inspectable A/B prototype | Independent labels, broader held-out workflows, integration with the existing workbench                        |
| Claim and synthesis contract                  | Offline exact-quote/date prototype catches the real QA date failure                                                      | Versioned runtime/SQL integration, recovery tests and calibrated semantic shadow scoring                       |
| Jev recommendations and routing               | Decision boundaries and acceptance cases specified                                                                       | Authenticated persisted recommendation/admission integration; existing adjacent WIP is not claimed as complete |
| Review to action                              | Proposal/apply/undo contract specified against existing suggestion services                                              | Typed operations, preview, freshness checks, durable application and tested safe inverse                       |
| Broader specialist work                       | Retrieval/escalation/reuse/challenge boundaries specified                                                                | Implement and evaluate each capability after the foundational gates pass                                       |

The main unresolved quality failure is concrete: real source IDs accompanied a false date claim.
The [claim inspector](../research/specialist-quality-2026-09-21/claim-inspector.html) exposes the
original answer and the exact saved task dates; code computes two overdue tasks where the editor
claimed five. The [answer comparison](../research/specialist-quality-2026-09-21/answer-comparison.html)
makes complete synthetic answers reviewable. Both are local research artifacts, not production UI.

## Contracts

| Boundary             | New version                                  |
| -------------------- | -------------------------------------------- |
| Admission policy ref | `internal-project-review:v2`                 |
| Frozen policy        | `agentic_chat_project_review_policy_v2`      |
| Preparation          | `agentic_chat_project_review_preparation_v2` |
| Evidence payload     | `agentic_chat_project_review_payload_v2`     |
| Role report          | `chat_workflow_role_report_v2`               |
| Definitions          | `project_analyst@2`, `risk_reviewer@3`       |

The plan graph, model routes, dollar/deadline caps and physical dispatch accounting remain the
existing bounded workflow. Definition versions resolve exactly; the runner never resolves latest.
The report records the executing specialist's id/version separately from its storage slot. V1
reports keep their old shape. SQL chooses the validator from the admitted policy and binds the
new preparation/payload versions to that policy.

## Evidence

`load_agentic_chat_project_review_evidence_v2(user, project, question)` is a service-only,
security-invoker RPC. It checks actor-explicit current project access and takes one database
snapshot. It reuses bounded task/goal/milestone/plan/event reads and adds:

| Source            | Limit / projection                                                                                                                          |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Risk register     | 16 active, nondeleted rows; 1,800 content characters each; missing mitigation timestamp first, then critical/high impact                    |
| Relationships     | 48 project edges; dependency relations first; same-project task titles where available                                                      |
| Documents         | Rank the authorized project's saved search vectors against the question; 20 inventory rows, text for the best four at 4,000 characters each |
| START HERE        | One nondeleted/nonarchived project context document, 4,000 characters                                                                       |
| Recent activity   | 12 entries; before/after state and due-date fields, excluding unrelated log bodies                                                          |
| Prior suggestions | Eight pending/delegated/failed entries; explicitly labeled previous recommendations, not verified source facts                              |
| Timezone          | Acting user's configured timezone; validated with UTC fallback                                                                              |

Coverage distinguishes loaded, empty, unavailable and truncated families, with included, total
and omitted counts. Each document declares full/excerpt/inventory-only/empty coverage. External
calendar, comments, requirements and assets are explicitly outside the recipe. Events inherit the
existing RPC window (seven days before to fourteen days after the snapshot); their total is within
that window, not all historical events. A family marked loaded does not claim coverage outside
its recipe scope.

The builder preserves the new collections through serialization, evidence indexes, hashed
checkpoint, display labels and model input. It caps the new packet at 64,000 serialized bytes,
leaving provider request headroom. When shrinking it removes events, activity and prior suggestions
before risk/document evidence. Coverage updates after removal. Missing evidence cannot become an
empty-but-complete inventory by accident. Recovery uses the saved checkpoint, not a new live read.

## Outcomes

V2 requires one of:

- `findings`: at least one finding with a supplied source id; every risk also needs a source.
- `no_material_findings`: no findings or risks; applies only to inspected evidence.
- `insufficient_evidence`: no findings or risks, and a specific missing-evidence explanation.
- `needs_clarification`: no findings or risks, and a specific unresolved question.

The host injects the specialist identity. Model-supplied identity is not authority. Valid
abstention completes without retry. Reports preserve outcome and identity through storage,
progress projection, and editor input. The editor prompt preserves coverage and abstention.

This is **source membership validation, not semantic proof**. Summary and recommendation remain
free text, and the editor still streams prose. Field/span claims, bounded semantic judgment and
validated synthesis are the next required change. The [synthetic research](../research/specialist-quality-2026-09-21/README.md)
retains concrete examples of both the improvement and these remaining limits.

## Enablement and rollback

Migration: `supabase/migrations/20260921042959_agentic_chat_project_review_v2.sql`.
It depends on the existing specialist snapshot, bounded document-read, evidence-handoff and
published-execution migrations. Do not blanket-push unrelated pending migrations.

Set `AGENTIC_CHAT_PROJECT_REVIEW_V2_ENABLED=true` on web and every workflow worker after installing
the migration and compatible builds. Existing v4 admission/preparation/execution switches and
explicit internal cohort still apply. It defaults off. Only explicit project-review admission
uses the new policy; document/custom specialist selection keeps its own profile.

To stop new v2 admissions, disable the **web** flag first. Keep the compatible worker and migration
until already-admitted v2 runs have drained. Disabling the worker flag while v2 work is queued
causes that work to fail with `workflow_not_enabled`; it does not reinterpret it as v1. New v1
reviews can continue. Never edit the old definition/policy versions or delete accepted checkpoints.

The old Jev shadow candidate roster does not include the new recipe. V2 skips that observer until
a versioned, evaluated selection contract includes it. It does not silently record v1 as the
executing baseline for a v2 run.

## Validation and deployment record

Implemented in the shared working tree. Default-off; not deployed to production by this change.
The catalog preview now includes all document profiles and both new project definitions.

Focused validation:

- 22 role-report tests, 12 evidence/preparation tests, four real disposable PostgreSQL v2 tests.
- 27 existing workflow runner tests and six published-specialist execution PostgreSQL tests.
- 13 web admission tests. Worker typecheck and shared package builds passed.
- PostgreSQL tests include old relevant documents beyond the former inventory limit,
  cross-project exclusion, private RPC grants, malformed outcomes, durable abstentions and v1
  completion with the v2 migration installed.
- Isolated QA's real RPC returned the expected project, recipe and family counts. A plain SQL
  role test first failed because it lacked the service JWT claim required by the legacy base RPC;
  repeating with the actual service request role/claims succeeded.

QA target `daudvqczjqxhpzstlfih` was verified through Supabase's branch inventory as the persistent,
non-default `agentic-chat-gate` branch of production, created with `with_data=false`. Both active
chat queue/turn counts were zero before setup. Six existing specialist migrations plus the new
migration were applied only to QA. The connector records QA application timestamps in its ledger;
production/local migration identities were not rewritten. One automatic approval rejection was
resolved by this explicit branch/isolation verification before retrying the same migration tool.

Security advisors: the workflow/specialist-related findings were informational RLS-without-policy
notices on private service-only tables. Browser grants are revoked; adding browser policies would
widen access and is not the remedy. Unrelated existing schema warnings were not changed.
[Advisor explanation](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy).

The first full gate was stopped after 13 retained turns established a systemic harness failure:
valid Jev tool-selection usage was rejected because attribution recognized only chat-model calls.
It also found a real task-batch failure: the model created tasks, then ended with a promise to
propose the dependency stage. Retained `gate.json` and `interruption.json` under
`output/agentic-gate/specialist-review-v2-2026-09-21/` mark that run failed/incomplete. It has no
complete scorecard and is not release evidence.

Repairs preserve Jev attribution and require every receipt to be attributable, including at least
one actual worker-model pass. A reviewed batch that stops with an explicit next-stage action
promise gets one continuation under the same tool surface, deadline, provider-pass budget and
independent mutation review. Repeating the promise returns saved receipts and an explicit partial
result. This bounded textual guard does not prove the entire user commission complete and does
not catch every form of omission. The broader completion/evaluation contract remains necessary.
Nine harness attribution tests, 144 provider tests and 19 repair-policy tests passed; worker
typecheck passed. One test-only wrong import was corrected before the passing run.

The full three-repetition Pareto rerun completed with **41/52**, 45 retained turns, and a failed
gate under `output/agentic-gate/specialist-review-v2-repaired-2026-09-21/`. It found provider
interruptions, one delayed database execution-begin response, and a 32.184-second document edit
against a 30-second limit. A known partial result also lacked a visible unfinished-work notice.
That disclosure is now driven by the host's structured terminal reason, including without a
legacy turn contract; 14 terminal-integrity tests and worker typecheck pass. See the
[retained failure analysis](../research/specialist-quality-2026-09-21/GATE_FAILURES.md).

The first attempted live smoke passed the older `/workflow` prototype, not durable v2 admission.
A database readback caught the missing durable run. Its retained verification-scope record marks
it explicitly inapplicable to v2. The corrected harness sends `reviewIntent: project_review`,
checks the durable policy/preparation/payload/report versions and identities, and requires a
register-only risk to survive into both reports. Sixteen focused harness tests pass. This also
prevents a future legacy-prototype success from being mistaken for v2 release evidence.

The corrected durable-v2 live smoke passed under
`output/workflow-durable-v2-verified-2026-09-21/`: 31.918-second turn, frozen v2 policy/context,
project_analyst@2 and risk_reviewer@3 accepted on their first attempts, a register-only $1,200
fee in both reports and the final answer, persisted progress/answer, and unchanged source records.
The subsequent smoke-test-only typed read boundary addresses generated public types lagging the
private workflow tables; its narrow typecheck passes. No runtime behavior changed after that smoke.
The PostgreSQL fixture now uses the real `risk_state` enum and all four tests still pass.

**This is not an answer-quality pass.** The analyst incorrectly calls September 29 overdue as of
September 21, and the editor expands that to all five tasks (including October inspections).
`quality-review.json` retains that failure. Keep v2 default-off; the source/claim and synthesis
boundary remains a release requirement. The offline typed-date prototype correctly computes two
of five overdue from the same checkpoint, without model judgment.

A full gate using a separate private DeepSeek v4.1 Flash QA configuration finished at
`output/agentic-gate/specialist-review-v2-deepseek-2026-09-21/`: **52/52 case score, 45 passing
behavior/state turns, verified provenance, zero capture errors, but a failed release gate**.
One task batch took 70.182 seconds against 60; the three narrow updates took 31.764, 30.993 and
33.195 seconds against 30. Calendar, DST, cold retrieval, document edits and grounded status
passed. No thresholds were relaxed. The executable tree remained fixed throughout the run.
QA active turn and queue counts were both zero afterward. The original Pareto configuration
and its failed scorecard are unchanged. No production settings or schema were changed.

The next slices have concrete proposed boundaries and acceptance cases in
Specialist quality: next contracts.
