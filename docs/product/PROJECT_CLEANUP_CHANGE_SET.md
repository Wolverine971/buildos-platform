<!-- docs/product/PROJECT_CLEANUP_CHANGE_SET.md -->

# Project Cleanup Change Set

**Status:** Product and runtime contract. The schema is in prod (migration
`20260929120000_project_cleanup_rollup.sql`, applied and recorded 2026-09-29). The worker, web
and chat code is built but not yet deployed.
**Adopted:** 2026-09-29
**Parent:** [`tasker/112-project-review-rollup-cleanup-change-set.md`](../../tasker/112-project-review-rollup-cleanup-change-set.md)
**Supersedes:** the one-brief-per-project card in
[`PROJECT_REVIEW_MANAGER_BRIEF.md`](PROJECT_REVIEW_MANAGER_BRIEF.md). Its by-exception and
copy rules still apply.
**Terminology:** [`PROJECT_REVIEW_TAXONOMY.md`](PROJECT_REVIEW_TAXONOMY.md)

## Product kernel

Each project has one living **Project cleanup** item: the change set of everything the project's
reviewers think should be tidied, corrected or decided.

- A finding stays on the list until it is done, dismissed, or shown to no longer apply.
- Nothing disappears without a recorded reason. A review pass never erases the previous pass's
  work.
- The item is the **only** per-project attention object that Project Review, Complete Project
  Audit and the freshness radar put in the AI Inbox.

## The card

One `inbox_items` row per project:

- `source_type = 'project_cleanup'`, `source_ref_id = project_id`, audience `project_members`.
- It is upserted in place and has no expiry.
- It counts against the project's attention budget of 3 like any other item.

It leaves the inbox when nothing actionable is open (only notes, or nothing at all), or when the
project is archived. It comes back when a review pass, an audit or the radar opens something.

Sections, in order:

| Section                             | What belongs there                                                                                                                                                               | Code floor                                                                                                                                        |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Ready to apply** (`safe_cleanup`) | Verified, reversible cleanup: archive a document or folder, archive a task, move documents within the tree, the radar's status or date updates.                                  | Allowed only when every change verifies against the live project, carries no caution (for example a live public page), and uses only those tools. |
| **Needs your call** (`needs_call`)  | Anything that needs judgment: goal renames or status, the project's description or type, text edits, anything with a caution, audit recommendations, anything spanning projects. | Always allowed. An unverified change lands here.                                                                                                  |
| **Worth knowing** (`note`)          | Findings with nothing to apply, such as informational drift.                                                                                                                     | A change is never a note.                                                                                                                         |

User actions:

- **Apply selected / Select all ready.** Checkboxes appear only on changes that re-verified
  against the live project.
    - Each item is applied through `decideProjectSuggestion` with the fingerprint the card
      showed.
    - One failure doesn't stop the rest.
    - An item revised since the card opened comes back as "Updated — review again".
    - Unpicked items stay open.
- **Not needed.** Records a real rejection with a reason: not relevant, wrong evidence,
  intentional, too risky, or other. Later passes suppress it, and the checks see it as the
  user's decision.
- **Done**, on a finding with nothing to apply. Marks it handled.
- **Discuss.** Opens chat on the whole card or on one item.
- **Fix in chat**, on a radar item. Opens chat focused on that record.
- **Snooze.**

## Findings as lineages

A **finding lineage** is one concern about specific records, carried across review passes.

- It lives on `project_suggestions` rows: `lineage_id` plus `rollup` jsonb. The `rollup` holds
  `first_seen_at`, `last_confirmed_at`, `seen_run_ids`, `passes_since_confirmed`, `summary`,
  `section` and `close`.
- There is no separate table. Approval, verification, undo and the decision trail stay on the
  suggestion row.

Identity is decided in code from record ids, never from wording:

- **Same change, new words.** The live row is confirmed in place: its wording, evidence and
  freshness fingerprint are refreshed. Its operations never change under a card.
- **Different change to the same records.** For example another destination, another name, or
  other edits. A new row joins the lineage, and the old row is superseded with reason `revised`.
- **Same finding at two scopes.** For example a folder and a document inside it. The lineages
  merge, and the older one keeps the id.

Every close records a reason and detail in `rollup.close`. The card lists what closed since the
last pass.

| Reason                                | Who decides                                                                                      |
| ------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `subject_archived`, `subject_deleted` | Code. Both archive forms count (tasker 113). A record moved to another project counts as gone.   |
| `already_done`                        | The integrity check (`NO_OP_OPERATION`).                                                         |
| `no_longer_applies`                   | The integrity check, or a newer audit that no longer raises it.                                  |
| `resolved`                            | The roll-up call, which must give a reason.                                                      |
| `merged`, `revised`                   | The roll-up.                                                                                     |
| `aged_out`                            | Code. Requires **30 quiet days and 3 quiet passes**. A kind the pass did not check does not age. |

## The review pass

`apps/worker/src/workers/project-loop/projectLoopWorker.ts` runs these steps:

1. Load context.
    - The 40 most recent documents in full.
    - One compact line for every other live document, with size, EMPTY and public-page facts
      from `project_review_document_facts`.
    - Goals with ids and states.
    - The live START HERE id.
    - The open cleanup list, marked "already tracked".
    - The user's own decisions: `applied`, `rejected` and `addressed` only.
2. Run the four checks (document organization, outdated records, drift, task conflicts). The
   checks find; they do not judge old findings.
3. Suppress only what the user decided or delegated in the last 60 days.
4. Run the deterministic roll-up pass (`reviewRollup.ts`) and write it (`reviewRollupStore.ts`).
5. Re-verify every live change. A change that no longer resolves closes with its reason.
6. Make **one roll-up call** (`generateProjectCleanupSynthesis`, `cleanupSynthesis.ts`).
    - It sees every open item by handle, with the current state of what it touches.
    - It returns a verdict per item (`still_true` or `resolved` with a reason), merges of
      same-kind findings, a section per item, groups, `bottom_line`, `recommendation` and
      `next_best_action`.
    - Unknown handles are ignored. Code's section floor wins over the model.
    - Audit and radar items are grouped but never judged here.
    - If the call fails or the cost cap is hit, every item stays open in its default section.
7. Apply the judgment and the age-out, then stamp the lineage state.
8. Save the run as `completed` with brief `version: 3`, whose `brief.cleanup` is the
   synthesis. Replace older v2 briefs, then sync the card.

Once step 4 has written, a later failure in the same run leaves the lineage rows in place.

### Operations the checks may propose

All labels, previews and undos are written by code.

- `archive_onto_document { document_id, children: archive_children | promote_children }`: one
  document, or a folder with everything under it. Never the live START HERE, a thinking log, or
  a folder holding one.
- `archive_onto_task { task_id }`.
- `update_onto_goal { goal_id, name }` or `{ goal_id, state_key }`: one change per fix. The
  goal must be one the pass was shown.
- `update_onto_project { description }` or `{ type_key }`.
- Existing: `move_document_in_tree`, and drift's exact-text `update_onto_document` edits.

Archiving a document that has a live public page leaves the page published. The item carries a
caution, so it lands in "Needs your call".

## The other producers

- **Complete Project Audit.**
    - Its recommendations are items in the card. Its own packet card retires as
      `grouped_into_project_cleanup`, and the report opens inline from the item.
    - A recommendation a newer audit raises again (same normalized title) stays on its row and is
      linked to the new audit.
    - One it no longer raises closes as `no_longer_applies`.
- **Freshness radar.**
    - The bundle (`freshness_update`) is one item, keyed by its own id.
    - The radar's inbox "retire" lane does not apply to review findings any more, because they
      have no rows of their own. The roll-up closes them on its next pass.

## Chat

`get_project_cleanup` (project chat surface) returns the same change set:

- the bottom line and counts;
- the groups and items, with evidence;
- what closed recently.

It is sized under 11,000 characters. Chat builds on it and tells the user to apply items from
the card; it does not re-propose them.

## Invariants

- One `project_cleanup` row per project. No per-finding, per-review or per-audit inbox rows:
  those are expired as `grouped_into_project_cleanup`.
- A review pass never supersedes a finding without a recorded close reason.
- Card text comes from code (counts, verified headlines) or the sanitized roll-up synthesis,
  never raw model operation labels.
- Batch approvals sync the card once (`deferInboxSync`), not once per item.

## Deploy order

1. The migration. Done 2026-09-29.
2. Worker and web **together**. The old worker would rotate lineage rows out, and the old web
   has no `project_cleanup` renderer.
