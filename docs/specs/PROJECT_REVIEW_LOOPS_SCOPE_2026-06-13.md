---
date: 2026-06-13
topic: project-review-loops
status: phase-1-complete-phase-2-wedge
path: docs/specs/PROJECT_REVIEW_LOOPS_SCOPE_2026-06-13.md
---

# Project Review Loops

## Experience Target

Project Loops should feel less like an AI inbox and more like a project catching
itself up.

When the user returns to a project, they should see a concise review of what
changed, what the system believes is now true, what looks stale or contradictory,
and which decisions still need human judgment. The best version feels like a calm
project chief of staff: useful by default, explicit about uncertainty, and careful
with writes.

The first screen should answer:

- What changed since the last review?
- What does BuildOS now believe the project is about?
- What evidence supports that belief?
- What needs the user's judgment?
- What can safely be cleaned up?

## Research Notes

Microsoft's HAX Toolkit frames human-AI UX as system behavior across the whole
interaction lifecycle: initial understanding, in-use support, failure handling,
and behavior over time. That maps directly to Loops: the first version cannot be
just a card list because trust depends on visible evidence, repair paths, and
learning from correction.

The HAX guidelines paper argues for generally applicable interaction guidelines
validated with practitioners across AI-infused products. For Loops, the relevant
lessons are: communicate what the system can do, make uncertainty visible,
support efficient correction, and adapt from user feedback.

The HAX design patterns emphasize recurring human-AI interaction problems and
the need for patterns that affect UI, data, model behavior, and engineering. This
means "show evidence" is not just UI; the worker output contract and persistence
schema need to carry evidence and preview metadata.

Recent work on invisible AI failures is especially relevant for project
synthesis. If the system silently misunderstands a project, users may not correct
it because the failure is not obvious. Review items should therefore expose their
source references and invite lightweight correction.

Sources:

- Microsoft HAX Toolkit: https://www.microsoft.com/en-us/haxtoolkit/
- Microsoft Guidelines for Human-AI Interaction: https://www.microsoft.com/en-us/haxtoolkit/ai-guidelines/
- Microsoft Research, "Guidelines for Human-AI Interaction": https://www.microsoft.com/en-us/research/publication/guidelines-for-human-ai-interaction/
- Microsoft HAX Design Patterns: https://www.microsoft.com/en-us/haxtoolkit/design-patterns/
- Invisible failures in human-AI interactions: https://arxiv.org/abs/2603.15423

## Product Shape

Rename the surface from **AI Suggestions** to **Project Review**. Internally,
`project_suggestions` can remain the storage table for now, but the product
language should describe reviews, review items, evidence, and decisions.

The review has three layers:

1. **Brief**: a compact project-state summary.
2. **Review items**: evidence-backed proposed changes or decisions.
3. **Correction memory**: user feedback that teaches project-specific taste.

The brief should eventually include:

- current goal in one sentence
- recent changes
- open decisions
- stale assumptions
- contradictions or drift
- next best action

Review items should include:

- title
- why now
- rationale
- risk tier
- evidence references
- preview of before/after
- operation list
- reversibility / undo metadata
- freshness state
- accept, dismiss, defer, and correct actions

## V1 Scope Shift

Keep the existing worker and approval replay path. Do not widen autonomy yet.
Instead, improve the review contract and surface:

- Add evidence and preview fields to suggestion persistence.
- Add freshness/reversibility fields so approval can become safer.
- Change visible UI copy to Project Review.
- Start prompting generators to emit why-now, evidence, and preview summaries.
- Keep doc organization and outdated-doc flags as the initial wedge.

This gives us a better product direction without requiring drift analysis or
destructive task de-confliction yet.

## Implementation Update - 2026-06-25

The Phase 1 safety work and a narrow Phase 2 wedge are now implemented:

- Project Loops now create a dedicated `chat_sessions` row for each run and
  link it to the project through `chat_sessions_projects`.
- The worker persists a compact `project_loop_runs.brief` with current goal,
  recent changes, open decisions, stale assumptions, drift/contradictions, and
  next best action.
- The generator set now covers doc organization, outdated documents, drift, and
  task conflicts.
- Drift suggestions are informational review items with no operations; applying
  them acknowledges the item.
- Task-conflict suggestions are deliberately non-destructive. They set
  reversible metadata flags on one task and include undo operations that remove
  those flags.
- Doc organization and outdated-doc suggestions now include undo operations.
- Approval replay re-checks a stable project fingerprint and marks stale items
  `superseded` before any operation runs.
- Approval replay uses the loop run chat session and sends
  `X-Skip-Project-Loop-Burst: true` through the normal ontology write APIs so
  applying a suggestion does not enqueue a recursive burst review.
- The unified inbox decision endpoint supports single-item and capped batch
  decisions for project-loop suggestions. Batch apply is limited in the UI to
  selected low/medium reversible items and excludes document-tree moves.
- Dismissal feedback (`reason`, `note`) is persisted to
  `project_suggestions.user_feedback`.
- Project Inbox renders the brief and grouped review sections: Safe cleanup,
  Needs your call, Project drift, and Other proposals.

The remaining production gate is operational: verify the new
`20260625000000_project_loop_run_brief.sql` migration in each target
environment before turning the feature flag on outside local/dev.

## Data Contract

`project_suggestions` should become a review item record:

- `why_now text`: why this surfaced in this run.
- `evidence_refs jsonb`: compact references to documents, tasks, goals, or other
  project objects that support the claim.
- `preview jsonb`: human-readable before/after or impact preview.
- `freshness_state text`: `fresh`, `changed`, `stale`, or `unknown`.
- `reversible boolean`: whether the operation set can reasonably be undone.
- `undo_operations jsonb`: optional ordered reverse operations.
- `source_fingerprint text`: hash/fingerprint of the input snapshot used to
  produce the item.
- `user_feedback jsonb`: dismissal/correction signal to feed later loops.

The approval endpoint re-checks freshness before replaying operations. If the
project changed materially, it marks the item `superseded` and asks the user to
rerun the review instead of applying stale operations.

## UI Requirements

The compact panel should show:

- "Project Review" header.
- latest run summary or active review state.
- top 3-5 pending review items.
- item badges for risk and kind.
- a one-line "why now."
- evidence chips or a small evidence list.
- a preview summary.
- approve / dismiss actions.

The expanded review should show:

- project brief at top
- grouped sections: Safe cleanup, Needs your call, Project drift
- full before/after preview
- source references with titles and excerpts
- correction controls
- batch approval only for low and medium reversible items

## Milestone Status

1. **Review contract**: implemented. Schema/types/generator prompts support
   evidence, preview, why-now, freshness, reversibility, and undo metadata.
2. **Review panel**: implemented in `ProjectInboxPanel`; the legacy
   `ProjectSuggestionsPanel` was unmounted and has been removed.
3. **Freshness guard**: implemented. Approval rejects materially changed
   snapshots by marking suggestions `superseded`.
4. **Correction feedback**: implemented for dismissal reason/note. Future work
   can feed this signal back into project-specific loop preferences.
5. **Project brief**: implemented. The run brief is persisted and rendered at
   the top of Project Inbox.
6. **Drift**: implemented as informational no-op review items.
7. **Task de-confliction**: implemented only as reversible metadata flags.
   Destructive merges/deletes/completions remain out of scope until true
   per-change review and richer undo semantics exist.

## Design Bar

The user should never wonder "why did the AI say this?" Every claim should be
attached to project evidence. The system should ask for judgment when unsure
instead of manufacturing certainty. The best loop run produces fewer items than
expected, but each one feels obvious once seen.
