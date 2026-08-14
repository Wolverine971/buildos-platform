<!-- apps/web/docs/technical/audits/AI_INBOX_PROJECT_REVIEW_LOOP_AUDIT_2026-08-13.md -->

# AI Inbox Project Review Loop Audit

**Date:** 2026-08-13  
**Status:** Audit complete; independently verified 2026-08-13 (see addendum); Tier 1 committed in `d72960f5d`; remaining work handed off in [tasker/52](../../../../../tasker/52-ai-inbox-review-loop-remediation.md)  
**Surface:** Dashboard AI Inbox, Project Review loops, Complete Project Audit recommendations  
**Primary question:** Does the inbox help the owner understand what project is affected, what should change, and why the change matters now?

## Executive summary

The AI Inbox is good at detecting project problems, collecting evidence, and preserving human approval before mutations. It is not yet good at converting those detections into a small number of clear, trustworthy decisions.

At the audit baseline, the product behaved more like a project critic than a chief of staff:

- It generates diagnoses faster than the user resolves them.
- It presented internal review taxonomy before the information the user needs. **Resolved in Tier 1.**
- Most visible items do not contain a concrete change the system can make.
- Independent review families create overlapping observations without a final reconciliation step.
- A three-item-per-project attention budget masks the backlog instead of reducing it.
- At least one proposal shown in the supplied screenshot does not match the operation that would execute.

Tier 1 has since corrected the scan hierarchy, action language, progressive disclosure, count truth, metadata vocabulary, and risk emphasis. The remaining bullets describe structural Tier 2 problems in generation, admission, correctness, and lifecycle.

The recommended product contract is:

> **One project -> one recommended change or decision -> one concise reason it matters now.**

Evidence, confidence, review family, trigger, date, and generation metadata should remain available as supporting details. They should not compete with the primary decision.

The first structural change remains proposal integrity. The Tier 1 clarity work described below improves the decision surface, but it does not make unverified proposal operations safe or complete the missing cross-family synthesis.

## Tier 1 implementation update - 2026-08-13

The Tier 1 recommendations from this audit are now implemented in both the dashboard modal and project-level inbox:

- **Project -> ask -> why hierarchy:** Every review card now starts with an explicit, wrapping project name, followed by the requested change or finding and the full stored `why_now` value. The UI no longer line-clamps any of those three required answers. Risk, source, review family, date, confidence, evidence, and extended context are hidden behind a single native `Details` disclosure. See the [dashboard card](../../../src/lib/components/dashboard/DashboardInboxModal.svelte), [project inbox card](../../../src/lib/components/project/ProjectInboxPanel.svelte), and [shared details disclosure](../../../src/lib/components/inbox/InboxReviewDetails.svelte).
- **Decision-shaped actions:** Project Review mutations use `Approve change`; findings use `Mark handled`; `Chat` is now `Discuss`; and chat resolution uses the same `Mark handled` language. The stored API action remains `address` for backward compatibility. Embedded multi-change agent reviews retain grammatically specific labels such as `Approve 2 changes`. See [finding controls](../../../src/lib/components/inbox/InboxFindingControls.svelte), [proposal controls](../../../src/lib/components/inbox/InboxDecisionControls.svelte), and the [shared change-set review labels](../../../src/lib/components/notifications/types/agent-run/ChangeSetReview.svelte).
- **One explanation path:** The former visible preview/evidence block is consolidated into `Details` as additional context and evidence. Proposed operations remain separately inspectable before approval, while findings with no operations no longer render the contradictory `Show 0 proposed changes` disclosure.
- **Truthful queue counts:** The server now returns `heldTotal` alongside the pending total, and both inbox surfaces render language such as `3 items need attention · 5 held for later`. See [held-row counting](../../../src/lib/server/inbox.service.ts#L206-L233), [list result assembly](../../../src/lib/server/inbox.service.ts#L1295-L1368), and the [shared count formatter](../../../src/lib/components/inbox/inbox-presentation.ts).
- **Clearer metadata vocabulary:** The primary path no longer claims that manual, burst, and end-of-day runs are all `Scheduled review`. When a date is useful it appears as `Reviewed <date>` inside `Details`; otherwise the trigger cause is omitted.
- **Risk demotion:** The undifferentiated `Review` badge is removed from the primary scan path. Meaningful low/high risk can still appear in `Details`.

### Second-pass hardening

A follow-up review on the same date corrected four edge cases before this work was considered complete:

- removed the preview-only `Show 0 proposed changes` disclosure from findings;
- changed the finding action from the vague `Respond` to the terminal-state-accurate `Mark handled`;
- removed UI truncation from the project, requested change, and stored `why_now` value, since those are the three-answer contract rather than optional metadata;
- made the no-pending project state distinguish a genuinely clear inbox from one that still has held items.

The implementation deliberately stops at the Tier 1 boundary. It does **not** resolve proposal/display mismatches, add final light-review synthesis, change inbox admission, packetize complete audits, or replace the three-item attention budget. Those remain Tier 2 work and should not be inferred from the clearer presentation.

### Verification completed

- Focused Vitest suite: **9 files, 39 tests passed**.
- `pnpm check`: **0 errors and 0 warnings**.
- Official Svelte analysis: no actionable issues in the changed components.
- Authenticated browser verification in light and dark modes at desktop and 390 px phone widths on both the dashboard modal and project-level inbox confirmed the new hierarchy, progressive disclosure, action labels, pending/held count, and absence of horizontal overflow. No application-origin browser console warnings or errors were present; the original dark preference was restored afterward.

## User-centered evaluation criteria

Every inbox item should answer these questions in order:

1. **What project are we talking about?**
2. **What do you want to change or what decision do you need from me?**
3. **Why do you want to change it now?**

The broader system should also demonstrate that an item:

- helps the project move forward;
- increases clarity rather than creating another interpretation task;
- protects the current goal or milestone;
- identifies real drift without repeatedly nagging about the same condition;
- proposes a safe next move when the system has enough information;
- stays out of the inbox when it has only an observation and no meaningful ask.

## Scope and methodology

The audit phase was read-only. The later Tier 1 implementation is recorded above. The audit included:

1. Visual inspection of the supplied AI Inbox screenshot.
2. Static tracing of the Project Review creation pipeline, suggestion schemas, suppression, inbox indexing, attention budgeting, presentation, and resolution controls.
3. Review of the existing Project Review taxonomy, brainstorm, prior audits, and the already-scoped holistic-synthesis task.
4. A read-only production snapshot of the seven projects visible in the screenshot at approximately **2026-08-13 14:06 UTC / 10:06 ET**.
5. Historical production counts for August 1-13 and July 1-August 13.
6. Manual inspection of stored operations against the current entities they target.
7. A heuristic token/evidence overlap scan followed by manual review of suspected duplicate open suggestions.

Production counts are a point-in-time baseline and will change as runs execute or users resolve items. No secrets, user IDs, project IDs, or suggestion IDs are recorded in this document.

### Production snapshot definitions

The baseline can be reproduced with read-only queries using these definitions:

- **Current workload:** `inbox_items` for the seven screenshot projects, `source_type = 'project_suggestion'`, `audience = 'project_members'`, and status in `pending` or `deferred`.
- **Visible workload:** the same set with `status = 'pending'`.
- **Executable suggestion:** the linked `project_suggestions.operations` value is a non-empty JSON array.
- **Finding:** kind is `drift` or `audit_recommendation`, or `operations` is empty, matching the current inbox mapper.
- **August history:** `project_suggestions.created_at >= 2026-08-01T00:00:00Z` for the seven projects.
- **July history:** `project_suggestions.created_at >= 2026-07-01T00:00:00Z` for the seven projects.
- **Explicit user resolution:** status in `applied`, `addressed`, or `rejected`; `superseded` is treated as system lifecycle cleanup rather than a user decision.
- **Light-review run volume:** `project_loop_runs` in the August window, grouped by `trigger_reason` and terminal status.
- **Audit run volume:** `project_audits` in the August window, with child counts from `project_audit_suggestions`.
- **Duplicate scan:** unresolved suggestions compared by normalized title/rationale tokens and overlapping evidence/entity references, followed by manual confirmation. This is a conservative audit heuristic, not a production duplicate classifier.

## Audited baseline system flow

This diagram records the pre-Tier-1 flow and labels visible in the supplied screenshot. The current presentation and action-language changes are recorded in the implementation update above; the generation and admission stages remain current.

```text
Project activity or nightly scan
        |
        v
Project brief generated before findings
        |
        v
Four independent generators
  - document organization
  - outdated documents
  - drift
  - task conflicts
        |
        v
Entity-key suppression and rotation
        |
        v
Suggestion rows + inbox-index rows
        |
        v
Risk/freshness ranking; top 3 per project visible
        |
        v
Accept / Address / Dismiss / Chat / Snooze
```

Complete Project Audits use a deeper synthesis path, but their recommendations are currently indexed as individual Project Review items rather than presented as one audit packet.

### Creation triggers

Burst reviews use a score threshold of four within a 30-minute lookback. Current weights mean any of these can trigger a light review:

- one document archive, restore, or tree move;
- one task move;
- two document creations;
- four document or task updates;
- one project, goal, milestone, or risk change in several cases.

See the [burst threshold and weights](../../../src/lib/server/project-loop-burst.service.ts#L20-L22) and [burst queuing decision](../../../src/lib/server/project-loop-burst.service.ts#L408-L475).

An hourly scheduler also finds active or planning projects touched during the just-finished local day and can enqueue up to ten per user. See [end-of-day configuration](../../../../worker/src/workers/project-loop/enqueue.ts#L20-L23) and [candidate selection and enqueueing](../../../../worker/src/workers/project-loop/enqueue.ts#L403-L501).

### Generation sequence

The light-review worker generates the project brief first, then runs document organization, outdated-document, drift, and task-conflict generators independently. It concatenates their outputs and suppresses duplicates primarily by affected entity keys. See [generator ordering](../../../../worker/src/workers/project-loop/projectLoopWorker.ts#L2898-L2974).

This is the central missing abstraction: the system has pre-generation context and independent findings, but no final light-review synthesis that can reconcile those findings into a coherent project-level ask. The gap is already explicitly scoped in [tasker/34-project-review-holistic-synthesis.md](../../../../../tasker/34-project-review-holistic-synthesis.md#L14-L50) and summarized in the [Project Review taxonomy](../../../../../docs/product/PROJECT_REVIEW_TAXONOMY.md#L64-L75).

### Inbox admission and presentation

Each project may have three `pending` inbox rows. Additional unresolved rows become `deferred` and are promoted as slots open. Ranking is risk tier descending, then inbox-row freshness descending. See [attention-budget behavior](../../../../../packages/shared-agent-ops/src/inbox-index.ts#L803-L875).

At the audited baseline, the dashboard card displayed:

1. suggestion title;
2. risk badge such as `Review`;
3. source label `Project Review`;
4. kind label such as `Drift` or `Organize`;
5. trigger/date label such as `Scheduled review · Aug 13`;
6. `Why now`;
7. `Preview`;
8. evidence chips;
9. proposed changes;
10. decision-note field and actions.

Those exact labels are historical baseline evidence from the supplied screenshot and pre-implementation source review. The current replacement is linked in the Tier 1 implementation update and code reference index.

## Production evidence

### Current unresolved workload

The modal displayed **19 pending items across seven projects**, but the underlying unresolved workload was **60 items**:

| Project                     | Visible pending | Hidden deferred | Total unresolved |
| --------------------------- | --------------: | --------------: | ---------------: |
| 9takes                      |               3 |              13 |               16 |
| Christian School Launch     |               3 |               9 |               12 |
| Operation Second Round      |               3 |               7 |               10 |
| BuildOS                     |               3 |               6 |                9 |
| Fading Crown                |               3 |               5 |                8 |
| BuildOS Demo Video Campaign |               3 |               1 |                4 |
| 6-Week GTM Push             |               1 |               0 |                1 |
| **Total**                   |          **19** |          **41** |           **60** |

The attention budget prevents one project from monopolizing the screen, which is directionally correct. However, it does not reduce the interpretation burden. Resolving an item can reveal another hidden item, creating a replenishing queue that the headline count does not disclose.

### Composition of the visible queue

All 19 visible suggestions had complete `why_now`, rationale, preview, evidence, and confidence fields. The issue was not missing metadata.

| Kind                          | Visible count | Has executable operations?     |
| ----------------------------- | ------------: | ------------------------------ |
| Drift                         |            12 | No                             |
| Complete-audit recommendation |             5 | No                             |
| Document organization         |             2 | Yes                            |
| **Total**                     |        **19** | **2 executable / 17 findings** |

Additional observations:

- All 19 visible suggestions were risk tier 2.
- Seventeen of 19 had zero operations.
- Average title length was 77.8 characters.
- Average `why_now` length was 169.2 characters.
- Average rationale length was 298.9 characters.
- Average preview length was 128.4 characters.
- The primary card displays title + `why_now` + preview, so the diagnosis is often repeated in roughly 375 visible characters before evidence and actions.

The mapping layer explicitly treats drift, audit recommendations, and any zero-operation proposal as a finding with `address` and `reject` actions. See [finding classification](../../../../../packages/shared-agent-ops/src/inbox-index.ts#L455-L504). Drift is intentionally prompted to propose no writes in [generators.ts](../../../../worker/src/workers/project-loop/generators.ts#L1034-L1106).

### Generation versus consumption since August 1

| Outcome                      |  Count | Share of 88 generated suggestions |
| ---------------------------- | -----: | --------------------------------: |
| Still pending                |     60 |                             68.2% |
| Automatically superseded     |     17 |                             19.3% |
| Applied                      |      5 |                              5.7% |
| Rejected                     |      4 |                              4.5% |
| Addressed                    |      2 |                              2.3% |
| **Explicit user resolution** | **11** |                         **12.5%** |

Suggestion mix:

| Kind                          | Generated since Aug 1 |
| ----------------------------- | --------------------: |
| Drift                         |                    38 |
| Outdated document             |                    20 |
| Document organization         |                    17 |
| Complete-audit recommendation |                    12 |
| Task conflict                 |                     1 |

Fifty of 88 suggestions were findings with no executable operation; 38 were executable proposals.

All 12 Complete Project Audit recommendations generated in this period remained pending at the time of the snapshot.

### Longer baseline since July 1

There were 177 Project Review suggestions:

| Kind                          | Count |
| ----------------------------- | ----: |
| Drift                         |    71 |
| Complete-audit recommendation |    36 |
| Outdated document             |    31 |
| Document organization         |    31 |
| Task conflict                 |     8 |

| Status     | Count |
| ---------- | ----: |
| Superseded |    81 |
| Pending    |    60 |
| Applied    |    18 |
| Rejected   |    10 |
| Addressed  |     8 |

Of all 177 suggestions, 107 had zero operations and 70 were executable.

The strongest positive outcome signal is direct document cleanup. Among document-organization and outdated-document proposals that reached an explicit applied/rejected outcome, **12 were applied and one was rejected**. This does not prove all such proposals are useful, because pending and superseded proposals are excluded, but it strongly suggests that concrete, understandable changes outperform open-ended findings.

Task-conflict findings showed no user adoption in this period: all eight were superseded without explicit user action.

### Run volume

From August 1 through the snapshot:

- 62 light-review run rows existed: 53 end-of-day and nine burst.
- 47 light-review runs were non-failed and produced 76 suggestions.
- Twelve run rows were deduplication losers, not substantive worker failures.
- Three were real timeout failures.
- Five Complete Project Audit runs existed: four non-failed/ready and one deduplication loser.
- The four successful audits produced 12 child recommendations.
- Combined, **51 non-failed review/audit executions in 13 days produced 88 suggestions for seven projects**.

The system is generating review artifacts at a substantially faster rate than the current owner resolves them.

## Duplicate and overlap assessment

A heuristic scan of the 60 unresolved suggestions found seven suspected pairs. Manual review identified at least six clear duplicate or materially overlapping pairs:

1. Two 9takes findings about the same outdated home-page content.
2. Two Fading Crown findings about the same beta-reader mismatch.
3. Two 9takes organization proposals covering the same Instagram document cluster.
4. Two 9takes audit recommendations describing the same scope-expansion/copy problem.
5. Two Fading Crown findings about Maya's motivation.
6. Two Demo Video Campaign findings about the same draft-document state.

Other suggestions explicitly note that prior drift items were superseded while the underlying issue remains. This is evidence that row rotation is treating repeated wording as lifecycle management without resolving the underlying project condition.

Current suppression correctly attempts to key executable proposals by affected entities. See [pre-insert suppression](../../../../worker/src/workers/project-loop/projectLoopWorker.ts#L2963-L2975). That is not sufficient for semantic overlap across:

- two findings that mention the same strategic gap but touch no entities;
- light-review findings and audit recommendations;
- different generators interpreting the same project condition;
- regenerated findings whose wording changes;
- a previously dismissed or superseded item whose underlying evidence did not change.

## Critical proposal-integrity findings

### 1. Screenshot proposal targets the wrong document

The screenshot shows this proposal:

> **Group Instagram content under 'Mood Board Carousel Strategy'**

The prose says it will move `The Mirror Moment` and `Instagram Saves Engine`.

The first stored operation instead targets the current document titled:

> `03 — Quality Contract & Failure Recovery`

The screenshot itself contains a warning clue: its first evidence chip names that Quality Contract document, even though the preview says `The Mirror Moment`.

Accepting the proposal would move the wrong document.

### 2. Proposal promises a folder that its operations do not create

A current BuildOS organization proposal says it will create a new `Agent Skills` subfolder and move four documents. The operation list creates no subfolder and moves only three documents under an existing `Operations & Playbooks` document.

### 3. Preview and operation set diverge

A current Fading Crown proposal's before/after preview omits or mixes documents while its operation list moves four concrete targets.

### Root cause

The stored suggestion allows independently generated prose fields and operation fields:

- `title`
- `rationale`
- `why_now`
- `preview`
- `operations`

See the [shared suggestion contract](../../../../../packages/shared-types/src/project-loops.types.ts#L120-L189) and [database row construction](../../../../worker/src/workers/project-loop/projectLoopWorker.ts#L3057-L3075).

The presentation decoder does not resolve operation entity IDs to current entity names. It derives a target only from `args.title` or `args.name`, trusts `op.label` as the summary, and shows `new_parent_id` through a generic formatter. See [decodeLoopOperation](../../../../../packages/shared-agent-ops/src/proposal-context/decode-operations.ts#L112-L178).

This means the model-authored explanation can say one thing while the executor does another, and the expanded proposed-change view may still repeat the misleading label or display a raw destination UUID.

### Required invariant

Before an executable proposal becomes visible or approvable:

1. Resolve every operation target ID against the current project entity.
2. Confirm the entity exists, belongs to the project, and is in the expected current state.
3. Resolve destination IDs to current names.
4. Construct the user-visible operation summary from those resolved entities, not from model prose.
5. Compare the generated preview with the resolved operation set.
6. If there is a mismatch, fail closed and route the proposal to internal diagnostics rather than the user inbox.

This is a correctness requirement with no current Hyperplexed UI recipe: **-> new P?**.

## Assessment against the product goals

The scores below describe the audited baseline. Tier 1 corrected the presentation findings, but it did not change the structural generation, admission, or correctness findings.

### 1. Does it make the affected project clear?

**Partially.**

The left project rail groups items well and the selected-project header is visible. However, each card leads with the suggestion title and four system-oriented labels instead of restating the project as part of a simple decision brief. On a long list, users must preserve the project context while reading several dense cards.

Preserve project grouping, but make the project name the first compact context line inside the decision object.

### 2. Does it make the proposed change clear?

**Usually no for findings; unsafe for some proposals.**

Only two of 19 visible items contained executable operations. The other 17 described a problem and required the user to type why they were addressing it. For executable items, the concept of a proposed-change disclosure is correct, but the integrity mismatches make it untrustworthy.

### 3. Does it explain why the change matters?

**Yes, but too repetitively.**

All visible items had complete rationale and evidence. The weakness is hierarchy and editing: title, `Why now`, rationale, and preview commonly restate the same diagnosis instead of progressively answering change, consequence, and evidence.

### 4. Does it help the project move forward?

**Mixed.**

Direct document cleanup has a strong applied/rejected ratio. Broad drift and audit observations often stop at diagnosis. The current `Address` path asks the user to invent the plan, so the system identifies work without reducing the work of deciding what to do.

### 5. Does it help the project stay on track?

**Potentially, but recurrence undermines confidence.**

The loops detect stale artifacts, drift, and contradictions. But repeated findings, hidden deferred items, and automatic supersession make it difficult to tell whether the project is improving or the reviewer is repeatedly rediscovering the same state.

### 6. Does it protect the user's attention?

**Superficially, not structurally.**

The three-item budget controls screen occupancy. It does not control how many unresolved interpretations the system creates. The 19-item headline masks 41 more deferred items.

## Findings by leverage

Hyperplexed P-pattern references are from [HYPERPLEXED_FIX_PATTERNS.md](../components/hyperplexed/HYPERPLEXED_FIX_PATTERNS.md).

## Tier 1 - shipped 2026-08-13

- [x] **Card header:** Project, requested change/finding, and why now lead the scan path without truncating those essential answers; internal taxonomy is in `Details`. **-> P6+P4+P8**
- [x] **Action semantics:** `Approve change`, `Mark handled`, and `Discuss` replace the ambiguous primary labels. Pure observations still entering the inbox remain a Tier 2 admission problem. **-> P6+P13**
- [x] **Explanation block:** Extended rationale and evidence are consolidated into one details disclosure; proposed operations remain separately inspectable. **-> P4+P7**
- [x] **Count/header:** Pending attention and deferred/held totals are displayed separately. Eliminating the deferred backlog through synthesis remains Tier 2. **-> P22-adjacent / new P?**
- [x] **Metadata vocabulary:** Misleading `Scheduled review` copy is removed; reviewed date and internal kind appear only in details when useful. **-> P6+P4**
- [x] **Risk badge:** The undifferentiated `Review` badge no longer competes in the primary path. **-> P4+P8**

## Tier 2 - structural within the surface and workflow

- **Proposal integrity:** The displayed change can diverge from the stored operation. Resolve and validate operation targets, derive the display from executable truth, and fail closed on mismatch. **-> new P?**
- **Review synthesis:** Independent generators cannot reconcile cross-family overlap or answer one coherent `what changed / what matters / what needs judgment` question. Add a bounded final project-level synthesis after generators. **-> new P?**
- **Inbox admission:** Findings enter the attention inbox even when they have no change, no bounded decision, and no next task. Require a concrete ask before admission. **-> P6+new P?**
- **Audit presentation:** Complete Project Audit recommendations are broken into individual inbox items. Present one ranked audit packet with expandable evidence and secondary recommendations. **-> P4+P7**
- **Attention budget:** Risk + freshness chooses the newest generator output, not the highest-value unblocker, most urgent milestone risk, or cheapest verified win. Rank for user value and project consequence. **-> new P?**
- **Deferred queue:** The budget parks excess rows and later promotes them, producing a replenishing queue. Attach secondary findings to a project brief instead of treating them as future top-level asks. **-> P7+new P?**
- **Creation rate:** Reviews are triggered by normal editing activity and nightly scans before checking whether the project already has an unresolved brief or attention capacity. Add pre-generation admission and material-change gates. **-> new P?**
- **Semantic deduplication:** Entity-key suppression cannot reconcile zero-operation findings or overlap across review families and audit recommendations. Cluster semantically before publishing. **-> new P?**
- **Lifecycle truth:** Supersession clears rows without demonstrating that the underlying condition improved. Track the project condition separately from generated wording. **-> new P?**
- **Freshness stability:** Attention ranking uses `inbox_items.updated_at`; source synchronization can touch rows and therefore change admission order without a meaningful project event. Separate `source_freshness_at` from index-maintenance timestamps. **-> new P?**

The web read path performs source backfill and budget reconciliation in [inbox.service.ts](../../../src/lib/server/inbox.service.ts#L949-L1276), while the attention budget ranks on the inbox row's `updated_at` in [inbox-index.ts](../../../../../packages/shared-agent-ops/src/inbox-index.ts#L842-L846).

## Tier 3 - polish/signature

- **No signature animation or visual effect is recommended yet.** Correctness, synthesis, and hierarchy should be stabilized first. Once the product contract is working, the one earned delight could be a restrained operation-preview transition showing a verified before/after state. It must be reduced-motion safe. **-> P11+P14-P18, deferred**

## Recommended target operating model

```text
Material project change
        |
        v
Collect candidate findings from review families
        |
        v
Resolve entities + validate executable operations
        |
        v
Semantic clustering and cross-family reconciliation
        |
        v
Final project synthesis
  - primary recommendation
  - why it matters now
  - supporting findings
  - unresolved judgment, if any
        |
        v
Admission gate
  - concrete action or decision?
  - materially new?
  - higher value than current brief?
        |
        v
At most one primary inbox brief per project
        |
        v
Verified action / bounded decision / discussion
        |
        v
Measure project outcome and recurrence
```

### Three allowed attention-item shapes

| Shape            | Required content                                              | Primary action   | Example                                                            |
| ---------------- | ------------------------------------------------------------- | ---------------- | ------------------------------------------------------------------ |
| Verified change  | Exact operation targets and verified before/after state       | Approve change   | Move two named documents under a named strategy document           |
| Bounded decision | The decision, meaningful options, recommendation, consequence | Choose / discuss | Keep course revenue as the active goal or remove it for this cycle |
| Concrete task    | A specific next step, owner, and purpose                      | Add/assign task  | Finalize the video script before recording begins                  |

An observation that cannot yet become one of these shapes should remain inside project review history or supporting evidence. It should not occupy the attention inbox.

## Target card hierarchy

### Verified-change example

```text
9takes

Move "Instagram Saves Engine" under "Mood Board Carousel Strategy."

This keeps the active Instagram architecture with its governing strategy and
removes one root-level orphan.

[Approve change] [Discuss] [Dismiss]

Details: exact operations · evidence · review source · date
```

### Bounded-decision example

```text
9takes

Decide whether course revenue is an active goal for this cycle.

The goal is still present, but the project has no course milestone, deliverable,
or validation task. Keeping it active makes current progress look off-track.

Recommendation: remove it from the active cycle until outreach validation is complete.

[Accept recommendation] [Discuss] [Keep goal] [Dismiss]

Details: evidence · related tasks and goals · review source · date
```

## Recommended implementation sequence

Tier 1 UI hierarchy, action language, progressive disclosure, and queue-count truth are implemented. The structural phases below remain the handoff plan; Phase 4 is marked with its shipped boundary.

### Phase 0 - proposal correctness gate

**Goal:** Make it impossible for displayed changes and executable operations to diverge.

1. Add a server-side operation-resolution layer that loads each target and destination by ID.
2. Validate project ownership, entity existence, allowed operation, and current state.
3. Produce a canonical `verified_change_summary` from resolved operations.
4. Compare canonical operations to the generated title/preview and quarantine mismatches.
5. Render only the canonical verified summary in the approval surface.
6. Revalidate immediately before execution to protect against stale state.
7. Record a structured diagnostic reason for rejected/quarantined proposals.

Primary code areas:

- [Suggestion contract](../../../../../packages/shared-types/src/project-loops.types.ts#L120-L189)
- [Suggestion row construction](../../../../worker/src/workers/project-loop/projectLoopWorker.ts#L3057-L3097)
- [Operation decoder](../../../../../packages/shared-agent-ops/src/proposal-context/decode-operations.ts#L112-L178)
- [Proposed-change disclosure](../../../src/lib/components/inbox/InboxChangeDetails.svelte)
- Mutation replay/execution path should be traced and covered before implementation.

### Phase 1 - final light-review synthesis

**Goal:** Produce one coherent project brief after the review families have contributed candidates.

1. Implement the already-scoped final synthesis from [tasker 34](../../../../../tasker/34-project-review-holistic-synthesis.md).
2. Move the current brief from before the generators to after candidate collection, or replace it with final synthesis.
3. Cluster candidates by underlying project condition, not only entity IDs.
4. Separate verified changes, bounded decisions, and supporting observations.
5. Select one primary recommendation and retain secondary findings as context.
6. Return no attention item when nothing materially warrants user judgment.

Primary code areas:

- [Current pre-generator brief and generator order](../../../../worker/src/workers/project-loop/projectLoopWorker.ts#L2898-L2974)
- [Project brief generator](../../../../worker/src/workers/project-loop/generators.ts#L800-L943)
- [Project Review taxonomy and known gap](../../../../../docs/product/PROJECT_REVIEW_TAXONOMY.md#L64-L75)
- [Holistic-synthesis task](../../../../../tasker/34-project-review-holistic-synthesis.md#L50-L140)

### Phase 2 - inbox admission and ranking

**Goal:** Protect attention before generating or publishing more review work.

1. Allow one primary Project Review brief per project, not three unrelated top-level rows.
2. Make secondary findings children/evidence of that brief.
3. Replace risk/freshness-only ordering with an explicit value score:
    - imminent milestone impact;
    - blocking dependency;
    - confidence and evidence quality;
    - concrete executability;
    - estimated user effort;
    - novelty versus previously seen conditions.
4. Keep index-maintenance timestamps out of semantic freshness.
5. Make queue counts distinguish attention items from held supporting findings.

Primary code areas:

- [Attention budget and ranking](../../../../../packages/shared-agent-ops/src/inbox-index.ts#L803-L875)
- [Inbox source synchronization and backfill](../../../src/lib/server/inbox.service.ts#L949-L1206)
- [Read-time budget reconciliation](../../../src/lib/server/inbox.service.ts#L1260-L1276)
- [`deferred` status migration](../../../../../supabase/migrations/20260718010000_inbox_items_deferred_status.sql)

### Phase 3 - audit packets

**Goal:** Present a Complete Project Audit as one coherent artifact.

The code contains two competing shapes:

- `mapProjectAuditToInboxItem` contains code to construct a parent audit item, but returns `null` while status is `ready`.
- `syncInboxItemForProjectAudit` then marks the audit parent as no-action and explains that recommendations are available as individual inbox items.

See [parent mapping](../../../../../packages/shared-agent-ops/src/inbox-index.ts#L508-L548) and [ready-audit handling](../../../../../packages/shared-agent-ops/src/inbox-index.ts#L680-L719).

The recommended policy is one parent audit packet with:

- one lead recommendation;
- a clear project-level conclusion;
- expandable secondary recommendations;
- a distinction between verified changes and judgment calls;
- one resolution state for the packet, with optional per-recommendation actions.

The code already has a helper for expiring child inbox items when grouping them into an audit packet: [expireInboxItemsForProjectAuditChildSuggestions](../../../../../packages/shared-agent-ops/src/inbox-index.ts#L722-L755). The implementation reviewer should determine whether this reflects an unfinished migration or an intentionally reversed decision before changing behavior.

### Phase 4 - UI hierarchy and action semantics

**Goal:** Make the primary scan path answer project, change, and why.

**Status:** Tier 1 presentation work shipped on 2026-08-13 for existing item shapes. Canonical verified-change rendering and bounded-decision generation still depend on Phases 0-2.

1. [x] Make project name compact but explicit on each decision object.
2. [x] Make the existing requested change or finding the dominant, unclamped title. Canonical verified titles remain Phase 0.
3. [x] Show the full stored `why_now` value in the primary path without UI line-clamping.
4. [x] Remove or demote risk, source, kind, trigger, date, evidence, and confidence.
5. [x] Keep proposed operations inspectable before approval. Operation verification remains Phase 0.
6. [x] Replace generic `Address` with terminal-state-accurate `Mark handled` language.
7. [x] Retain `Discuss` as an escape hatch, not as the system's substitute for a recommendation.

Primary code areas:

- [Dashboard Project Review card](../../../src/lib/components/dashboard/DashboardInboxModal.svelte#L1142-L1385)
- [Project-level Project Review card](../../../src/lib/components/project/ProjectInboxPanel.svelte#L1078-L1195)
- [Shared review details](../../../src/lib/components/inbox/InboxReviewDetails.svelte)
- [Finding controls](../../../src/lib/components/inbox/InboxFindingControls.svelte#L40-L119)
- [Decision controls](../../../src/lib/components/inbox/InboxDecisionControls.svelte#L34-L90)
- [Proposed-change disclosure](../../../src/lib/components/inbox/InboxChangeDetails.svelte)

### Phase 5 - trigger admission and measurement

**Goal:** Generate fewer, more valuable briefs and measure whether they change project outcomes.

1. Before queueing a light review, check whether an unresolved project brief already exists.
2. Require material evidence change sufficient to improve or replace that brief.
3. Do not run merely because low-signal edits sum to the burst threshold.
4. Decide whether the nightly scan is a safety net or the primary trigger; avoid redundant burst + nightly reviews for the same state.
5. Measure generation, admission, user decision, application, follow-through, recurrence, and project-state improvement separately.

Primary code areas:

- [Burst score configuration](../../../src/lib/server/project-loop-burst.service.ts#L20-L22)
- [Activity weights](../../../src/lib/server/project-loop-burst.service.ts#L90-L99)
- [Burst threshold decision](../../../src/lib/server/project-loop-burst.service.ts#L408-L475)
- [End-of-day candidate loading](../../../../worker/src/workers/project-loop/enqueue.ts#L403-L501)
- [Scheduler invocation](../../../../worker/src/scheduler.ts#L280-L306)

## Success criteria

### Correctness

- **0** mismatches between displayed operations and executed operations.
- **100%** of executable targets and destinations resolved to current entity names before display.
- Stale or missing operation targets fail closed.
- Preview, evidence, and canonical operation summary agree.

### Attention quality

- At most one primary unresolved Project Review brief per project.
- Fewer than 2% materially duplicate surfaced recommendations.
- Every surfaced attention item has a verified change, bounded decision, or concrete task.
- Resolving an item does not unexpectedly reveal a long queue of equivalent findings.
- The header truthfully distinguishes attention items from supporting/held findings.

### Usefulness

- At least 50% of surfaced items receive a user decision within seven days.
- Track acceptance and dismissal by decision shape and review family.
- Track time from surfacing to decision and from approval to completed effect.
- Track whether the same underlying condition recurs within 7, 14, and 30 days.
- Track whether the accepted change unblocked a task, protected a milestone, reduced stale artifacts, or clarified the active goal.

### Generation efficiency

- Measure candidates generated, clusters formed, briefs admitted, and items shown separately.
- Reduce generated-to-explicitly-resolved ratio substantially from the current August baseline of 88 generated to 11 explicitly resolved.
- Record a `no_attention_required` outcome as a successful review result rather than inventing work.

## Required test coverage

### Proposal integrity

- Move operation resolves the correct document title.
- Move destination resolves to a current parent title.
- Model label names a different target than the operation ID: proposal is quarantined.
- Preview lists more or fewer changes than operations: proposal is quarantined.
- Target was renamed after generation: display uses current truth and clearly indicates freshness.
- Target was archived/deleted/moved after generation: approval is blocked pending revalidation.
- Target belongs to another project: operation is rejected.
- Multi-operation proposal is atomic or clearly reports partial-failure policy.

### Synthesis and deduplication

- Two generators describe the same underlying condition with different wording.
- Light review and Complete Project Audit identify the same condition.
- A repeated finding has no material evidence change.
- A dismissed condition recurs with genuinely new evidence.
- Several findings exist but only one is a current blocker.
- Project is healthy and synthesis returns no attention item.

### Inbox admission and ranking

- Secondary findings remain attached to the project brief rather than becoming hidden future top-level items.
- Index backfill does not change semantic freshness or ranking.
- An imminent milestone blocker outranks a newer organizational cleanup.
- A verified low-effort fix can outrank an unbounded diagnosis.
- Counts remain truthful across pending, deciding, snoozed, deferred/supporting, and expired states.

### UI semantics

- Card answers project, change/decision, and why without opening details.
- Action copy matches the actual effect.
- Verified operations remain inspectable before approval.
- Long project/document titles wrap safely.
- Keyboard navigation and focus states work for all controls.
- Mobile view preserves the three essential answers.
- Reduced-motion behavior covers any future before/after transition.

## What should be preserved

- Project grouping in the left rail.
- Human approval before mutations.
- `why_now` as a required content field.
- Evidence references.
- The proposed-change disclosure concept.
- A finite attention budget in principle.
- Chat/Discuss for ambiguity.
- Direct document cleanup proposals, after operation verification.
- Historical Project Review and Complete Project Audit artifacts outside the attention queue.

## Decisions for the reviewing agent

The implementation reviewer should explicitly confirm or challenge these recommended product decisions:

1. **Inbox purpose:** The attention inbox is for decisions and executable changes, not general observations.
2. **Project cardinality:** A project should have at most one primary unresolved review brief.
3. **Secondary findings:** Supporting findings belong inside the brief, not in a deferred top-level queue.
4. **Audit shape:** A Complete Project Audit should appear as one packet, not one item per recommendation.
5. **Proposal truth:** User-visible changes must be derived from resolved operations, never trusted model labels.
6. **Trigger policy:** A new run should require enough new information to improve or replace the current brief.
7. **Resolution meaning:** `Addressed` must represent a concrete recorded next step or project-state change, not merely a note acknowledging the diagnosis.
8. **Outcome measurement:** Success should be tied to project progress and recurrence, not suggestion volume.

## Code reference index

| Area                     | Why it matters                                                                                              | Code                                                                                                                                |
| ------------------------ | ----------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Suggestion data model    | Prose and operations can diverge                                                                            | [project-loops.types.ts](../../../../../packages/shared-types/src/project-loops.types.ts#L120-L189)                                 |
| Burst trigger threshold  | Normal editing can quickly queue reviews                                                                    | [project-loop-burst.service.ts](../../../src/lib/server/project-loop-burst.service.ts#L20-L22)                                      |
| Burst activity weights   | One move/archive or several small edits can meet the threshold                                              | [project-loop-burst.service.ts](../../../src/lib/server/project-loop-burst.service.ts#L90-L99)                                      |
| Burst queuing            | Review and audit evaluation happen after the threshold is met                                               | [project-loop-burst.service.ts](../../../src/lib/server/project-loop-burst.service.ts#L408-L475)                                    |
| Nightly trigger          | Touched active/planning projects are scanned and enqueued                                                   | [enqueue.ts](../../../../worker/src/workers/project-loop/enqueue.ts#L403-L501)                                                      |
| Generator ordering       | Brief runs before four independent review families                                                          | [projectLoopWorker.ts](../../../../worker/src/workers/project-loop/projectLoopWorker.ts#L2898-L2974)                                |
| Suppression              | Entity-key deduplication cannot catch all semantic overlap                                                  | [projectLoopWorker.ts](../../../../worker/src/workers/project-loop/projectLoopWorker.ts#L2963-L2975)                                |
| Suggestion persistence   | Model prose and operations are stored together without canonical display validation                         | [projectLoopWorker.ts](../../../../worker/src/workers/project-loop/projectLoopWorker.ts#L3057-L3097)                                |
| Drift generator          | Drift is explicitly informational with no writes                                                            | [generators.ts](../../../../worker/src/workers/project-loop/generators.ts#L1034-L1106)                                              |
| Finding actions          | Zero-operation and audit suggestions become Address/Reject findings                                         | [inbox-index.ts](../../../../../packages/shared-agent-ops/src/inbox-index.ts#L455-L504)                                             |
| Audit parent mapping     | Ready audits are excluded from the parent-item mapping                                                      | [inbox-index.ts](../../../../../packages/shared-agent-ops/src/inbox-index.ts#L508-L548)                                             |
| Audit child policy       | Ready audit parent is marked no-action because children are indexed individually                            | [inbox-index.ts](../../../../../packages/shared-agent-ops/src/inbox-index.ts#L680-L719)                                             |
| Audit packet helper      | Existing helper can expire children when grouping into a packet                                             | [inbox-index.ts](../../../../../packages/shared-agent-ops/src/inbox-index.ts#L722-L755)                                             |
| Attention budget         | Three per project, ranked by risk then row freshness                                                        | [inbox-index.ts](../../../../../packages/shared-agent-ops/src/inbox-index.ts#L803-L875)                                             |
| Inbox synchronization    | Backfill/sync can touch index rows before budget reconciliation; the read result now also reports held rows | [inbox.service.ts](../../../src/lib/server/inbox.service.ts#L949-L1368)                                                             |
| Read-time reconciliation | Deferred/pending state is patched during reads                                                              | [inbox.service.ts](../../../src/lib/server/inbox.service.ts#L1260-L1276)                                                            |
| Operation decoding       | UI trusts operation labels and does not resolve target/destination IDs                                      | [decode-operations.ts](../../../../../packages/shared-agent-ops/src/proposal-context/decode-operations.ts#L112-L178)                |
| Dashboard card rendering | Project-first hierarchy, why-now, details, changes, and controls                                            | [DashboardInboxModal.svelte](../../../src/lib/components/dashboard/DashboardInboxModal.svelte#L1142-L1385)                          |
| Project inbox rendering  | Matching project-first hierarchy in the embedded project surface                                            | [ProjectInboxPanel.svelte](../../../src/lib/components/project/ProjectInboxPanel.svelte#L1078-L1195)                                |
| Review details           | Progressive disclosure for review metadata, context, and evidence                                           | [InboxReviewDetails.svelte](../../../src/lib/components/inbox/InboxReviewDetails.svelte)                                            |
| Count language           | Shared truthful pending/held summary                                                                        | [inbox-presentation.ts](../../../src/lib/components/inbox/inbox-presentation.ts)                                                    |
| Project context          | Explicit, wrapping project label in the primary scan path                                                   | [InboxProjectBadge.svelte](../../../src/lib/components/inbox/InboxProjectBadge.svelte#L22-L49)                                      |
| Finding controls         | Handling/dismissal note + Mark handled/Dismiss/Discuss/Snooze                                               | [InboxFindingControls.svelte](../../../src/lib/components/inbox/InboxFindingControls.svelte#L40-L119)                               |
| Proposal controls        | Approve change/Dismiss/Discuss/Snooze                                                                       | [InboxDecisionControls.svelte](../../../src/lib/components/inbox/InboxDecisionControls.svelte#L34-L90)                              |
| Change details           | Existing progressive-disclosure surface for operations                                                      | [InboxChangeDetails.svelte](../../../src/lib/components/inbox/InboxChangeDetails.svelte)                                            |
| Inbox schema             | Denormalized source index and update trigger                                                                | [20260624010000_ai_inbox_items.sql](../../../../../supabase/migrations/20260624010000_ai_inbox_items.sql)                           |
| Deferred status          | Hidden attention overflow is modeled as a source state                                                      | [20260718010000_inbox_items_deferred_status.sql](../../../../../supabase/migrations/20260718010000_inbox_items_deferred_status.sql) |
| Complete-audit schema    | Parent audit and audit-to-suggestion linkage                                                                | [20260703000000_complete_project_audits.sql](../../../../../supabase/migrations/20260703000000_complete_project_audits.sql)         |
| Known synthesis gap      | Existing scoped implementation direction                                                                    | [tasker/34-project-review-holistic-synthesis.md](../../../../../tasker/34-project-review-holistic-synthesis.md)                     |
| Product taxonomy         | Canonical distinction between light review and complete audit                                               | [PROJECT_REVIEW_TAXONOMY.md](../../../../../docs/product/PROJECT_REVIEW_TAXONOMY.md)                                                |

## Related prior work

- [Dashboard Inbox Modal Audit - 2026-07-07](../components/hyperplexed/DASHBOARD_INBOX_MODAL_AUDIT_2026-07-07.md)
- [AI Inbox Notification Modal Fix - 2026-07-03](../components/hyperplexed/AI_INBOX_NOTIFICATION_MODAL_FIX_2026-07-03.md)
- [Agent Work Display Audit - 2026-07-14](../components/hyperplexed/AGENT_WORK_DISPLAY_AUDIT_2026-07-14.md)
- [Project Review Loops Scope - 2026-06-13](../../../../../docs/specs/PROJECT_REVIEW_LOOPS_SCOPE_2026-06-13.md)
- [Project Review Loop Audit Suggestion Families - 2026-06-25](../../../../../docs/research/project-review-loop-audit-suggestion-families-2026-06-25.md)
- [Project Loops Brainstorm - 2026-06-12](../../../../../docs/brainstorms/2026-06-12-project-loops-brainstorm.md)

## Independent verification and ratified direction - addendum 2026-08-13

A second agent independently verified this audit the same day: every cited code path was re-read and confirmed accurate, and the production claims were re-queried fresh (script preserved at `scripts/audits/verify-inbox-review-loop.mjs`).

Key verification results:

- **The proposal-integrity finding #1 was confirmed live in production.** The mismatched Instagram/Mood Board proposal was still pending; its first operation ID resolves to `03 — Quality Contract & Failure Recovery`, not the `The Mirror Moment` named in its label and preview. A second, older pending proposal covers the same reorganization with correct IDs — one pair demonstrating both the integrity bug and the semantic-duplication gap.
- The unresolved workload had grown to 18 pending / 44 deferred / 62 total across nine projects by the evening re-query.
- New finding: deferred rows are only promoted when a producer sync or inbox read touches the project, so deferred items in untouched projects never resurface (three projects had deferred-only backlogs).
- Correction applied above: the suggestions table is `project_suggestions`, not `project_loop_suggestions` as originally written in the reproduction definitions.

DJ ratified the audit direction on 2026-08-13 with these amendments, and the work is handed off in [tasker/52-ai-inbox-review-loop-remediation.md](../../../../../tasker/52-ai-inbox-review-loop-remediation.md):

1. **Drift admission cut pulled forward** as an immediate quick win rather than waiting for synthesis (adoption data: document cleanup 12 applied : 1 rejected; drift and task conflicts effectively zero).
2. **Phases 1+2+3 collapsed into one build** ("one brief per project"): synthesis output is the admission unit, and an audit packet is that brief when a complete audit ran.
3. **The six-factor value-scoring rubric is skipped** at current scale.
4. **Decision 7 rejected:** `Mark handled` stays lightweight; admission is the real fix for diagnosis-only items.
5. Phase 0 remains first and unchanged in substance, with deterministic (non-LLM) mismatch checks and a retroactive sweep over unresolved proposals.

## Final recommendation

Keep the AI Inbox and Project Review capability, but change the unit of value from **a generator output** to **a verified project decision brief**.

The shortest credible path is:

1. Block incorrect proposals by deriving display truth from resolved operations.
2. Finish the already-scoped final light-review synthesis.
3. Admit only verified changes, bounded decisions, or concrete tasks to the attention inbox.
4. Present Complete Project Audits as packets.
5. Replace hidden backlog management with one primary brief plus supporting findings.
6. Simplify the card to project, change/decision, and why.
7. Measure whether accepted recommendations improve project state and stop recurring.

Do not mistake the shipped Tier 1 clarity work for proposal correctness. Further visual polish should wait until proposal integrity and synthesis are fixed. A clearer interface that confidently describes the wrong operation would still make the product more dangerous, not more useful.
