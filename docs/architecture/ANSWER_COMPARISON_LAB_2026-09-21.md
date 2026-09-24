<!-- docs/architecture/ANSWER_COMPARISON_LAB_2026-09-21.md -->

<!-- doc-status: point-in-time -->

> **Point-in-time document.** Written 2026-09-21; describes the state of the system at that moment.
> It is not a current reference. Verify against code before acting on anything here.

# Compare answers: a blind comparison lab for specialist quality — September 21, 2026

Tasker 92, slice D. Built locally, uncommitted, free tests only. The lab answers one
question the workbench could not: given two ways of producing an answer to the same
request, which one is better, judged by a person who does not yet know which is which,
and what did each cost. It is a surface inside the workflow lab, not a benchmark
service. It never calls a model.

## What DJ chose

The interview settled two forks. The ambitious version, a comparison lab with its own
storage, over a static page. And real pilot turns as the first candidates, pulled from
the same `chat_turn_workflow_runs` rows the Tasker 91 inspector reads, with written
answers allowed as extra candidates or as a fallback.

## The rules the lab enforces

- **One frozen question per comparison.** A comparison stores the question and a source
  packet (question, project, accepted context hash, request hash) and the packet's
  canonical-JSON SHA-256. Every candidate carries that hash, and the database refuses a
  candidate bound to any other packet. A pilot run can only join a comparison whose
  packet has its accepted context hash, so two runs are compared only when they answered
  the same question from the same evidence.
- **Blind by construction.** Candidate labels (A, B, …) are derived per reviewer from
  `sha256(comparison:reviewer:candidate)`, so storage order never leaks, and the API
  withholds identity and receipts until that reviewer reveals. The vote row stores the
  label assignment the reviewer actually saw.
- **Vote before you see.** Reveal is refused until a vote exists. Revealing seals the
  vote: a trigger rejects any later change, and the only permitted update after voting
  is the reveal timestamp with every other column unchanged. Candidates lock once any
  vote exists, so a comparison cannot be reshaped under a recorded verdict.
- **Rubric, judged by the reviewer.** Required facts (0 missing, 1 partial, 2 present),
  unsupported claims (0 none, 1 some, 2 many), and whether abstaining was appropriate.
  The required facts are written when the comparison is created. No model scores
  anything.
- **Receipts, with unknown as unknown.** Cost is the sum of settled dispatch actuals for
  the run; when a dispatch is unsettled the sum is a floor and `settled` is false; when
  the ledger cannot be read every figure is null and renders as "unknown", never 0.
  Latency is finish minus first execution start. Written answers carry whatever
  receipts the author supplies, usually none.
- **Exploratory versus held-out.** Each comparison is tagged. The scoreboard counts
  sealed votes only and excludes held-out comparisons unless the reviewer asks for them,
  so the held-out set stays an honest check rather than a tuning target.
- **Disclosure check.** After reveal, an answer that names its own producer is flagged,
  because a blind vote on such an answer may not have been blind.

## Pieces

| Piece                                                                       | Role                                                                                                                                                                                               |
| --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `supabase/migrations/20260922002140_agentic_chat_answer_comparisons_v1.sql` | Three tables, two guard triggers, four service-role RPCs. Applied to the linked production database on 2026-09-22 (UTC) at DJ's request, in one transaction, and recorded in the migration ledger. |
| `apps/web/src/lib/types/answer-comparison.ts`                               | The contract shared by server, API, and UI.                                                                                                                                                        |
| `apps/web/src/lib/services/agentic-chat-v2/answer-comparison-core.ts`       | Pure rules: hashing, blind labels, receipts, disclosure, parsing, scoreboard.                                                                                                                      |
| `apps/web/src/lib/services/agentic-chat-v2/answer-comparison.server.ts`     | Owner-scoped storage adapter and the pilot-run reader over the inspector tables.                                                                                                                   |
| `apps/web/src/routes/api/agent/specialists/comparisons/+server.ts`          | GET list/detail, POST create, add_candidate, vote, reveal. Same cohort gate as the workbench.                                                                                                      |
| `apps/web/src/routes/workflow-lab/compare/`                                 | The page. Linked from the workflow lab header next to the specialist workbench.                                                                                                                    |
| `apps/web/src/lib/components/agent/AnswerComparisonLab.svelte`              | Scoreboard, comparison list, builder, blind review, vote and reveal.                                                                                                                               |

Storage is private to the owner: RLS is on, anon and authenticated have no grants, the
service role has only the operations the adapter uses, and every RPC asserts the service
role and takes the owner id from the verified session. Comparisons and candidates are
never updated; votes update only while unsealed.

## Validation (free, local)

- `answer-comparison-core.test.ts` (23): packet hash equals the database's canonical
  form, label determinism and per-reviewer variation, blinding before reveal and
  disclosure after, receipts (settled, floor, unknown), identity naming, source
  grouping, request parsing, scoreboard rules.
- `answer-comparison.server.test.ts` (13): every read owner-scoped, summaries and
  sources from inspector rows, unavailable ledgers stay unknown, stored labels honoured
  after a vote, packet binding on create and add, other owners' runs invisible, label to
  candidate translation on vote, sealed votes refused.
- `comparisons/server.test.ts` (7): cohort gate, origin, JSON, body bound, id
  validation, action dispatch with the verified owner, error mapping.
- `answer-comparison-storage.postgres.test.ts` (1): the executable SQL contract in
  `supabase/tests/20260922002140_agentic_chat_answer_comparisons_v1.test.sql` on a
  disposable local PostgreSQL 16 over the workflow v1 fixture: atomic idempotent create,
  hash checks, context and packet binding, vote-before-reveal, other-owner scoping,
  candidate lock, foreign preference rejected, sealing and immutability, two-candidate
  minimum, pre-sealed insert rejected, non-service roles refused.
- `pnpm --filter @buildos/web check`: 0 errors, 0 warnings. ESLint and Prettier clean
  on the new files.

Not done: a browser walk-through. The migration is now applied to production (2026-09-22 UTC, at DJ's request), so a prototype-cohort user can open the page; that check has not happened yet. No model calls exist to gate, so no paid run is involved in D.

## Known gaps, separately owned

- The UI creates comparisons with pilot runs and written answers together but has no
  "add a candidate later" control; the API and storage support it.
- One reviewer per comparison in practice (the owner). The vote table is keyed by
  reviewer so a shared-review grant can come later without a schema change.
- The candidate identity for a pilot run names the analyst specialist from the run's
  snapshot when one exists, otherwise the review policy. Published workbench specialists
  are named that way; a run without a snapshot shows as "Project review vN".
