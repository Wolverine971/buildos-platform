<!-- artifacts/agentic-chat-postdeploy-4ac73bde7-assessment.md -->

# Agentic chat: assessment and proposed remediation

Assessed September 4, 2026 against checkout `4ac73bde7`, the [postdeploy report](./agentic-chat-postdeploy-4ac73bde7.md), its three JSON evidence files, and read-only production queries for the exact QA turns. This is an assessment and implementation plan; no application code, configuration, or production data was changed.

Calendar credentials and calendar integration remediation remain with the separate calendar work. Task date correctness and the existing “no calendar event” behavior remain regression requirements here.

## Main assessment

The seven non-calendar issues are valid, but two diagnoses need correcting before implementation:

1. **Dependencies are primarily blocked by tool exposure.** The saved production prompt for task-batch turn `aadd9245-13bc-4d5d-9370-d41dfec9b5b5` contains 35 tools and **does not contain `link_onto_entities`**. A working adapter and a health-endpoint capability count do not establish that a particular turn can call it. The relationship tool must be admitted before planning guidance can help.
2. **The false update failure is a nested-field mismatch, not the observed date conversion.** The contract requires `duration_minutes=120`; the successful call writes `props.duration_minutes=120`. The ledger records the top-level `props` field, drops its object value, and cannot satisfy `duration_minutes`. Both the contract and call use the identical date string `2026-09-22`.

The receipts also expose two contributing issues worth including in the existing scope: the owner report cannot use the full-document reader its no-heading result recommends, and the document-edit reviewer corrupts exact text during contract correction. The final document is correct, but that correction path is fragile and expensive.

| Priority                            | Work                                                            | Confidence                                                      | Recommended treatment                                                                           |
| ----------------------------------- | --------------------------------------------------------------- | --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| P1                                  | Successful task update reported as unfulfilled                  | Confirmed by production arguments and local replay              | Align contract field semantics, ledger extraction, and verification                             |
| P1                                  | Three requested dependencies absent                             | Missing tool confirmed in production snapshot                   | Admit relationship writes in the project surface, then verify the full create-and-link workflow |
| P1 within document/performance work | Reviewer correction mutates exact requested text                | Confirmed in persisted reviewer calls; final content recovered  | Preserve original text independently of short contract descriptions                             |
| P2                                  | Start Here document action does not open the requested document | Browser failure recorded; source follows modal/query navigation | Use the canonical document route and test visible destination                                   |
| P2                                  | Fresh retrieval returns IDs instead of links                    | Confirmed in final response                                     | Supply canonical references from saved entity metadata and render ordinary links                |
| P2                                  | Owner report overstates what records prove                      | Confirmed despite an existing grounding rule                    | Scope assertions to evidence actually read; repair missing document fallback                    |
| P2                                  | Start Here stale during open chats                              | Confirmed stale snapshot; post-close failure unproven           | Test lifecycle and expose freshness; address TTL/invalidation if reproduced                     |
| P2, measured alongside all fixes    | 68–99 second turns                                              | Production phase and provider telemetry available               | Reduce repair rounds and investigate slow acting-provider routing                               |

## 1. Correct mutation completion accounting first

Production turn `f9640b74-43d8-4512-b834-a7cb81f85858` declared:

```json
{
	"required_fields": ["due_at", "duration_minutes"],
	"changes": [
		{ "field": "due_at", "value": "2026-09-22" },
		{ "field": "duration_minutes", "value": "120" }
	]
}
```

The successful mutation arguments were:

```json
{
	"task_id": "cf2f0470-78c1-4a93-b29a-e3d727f2b0e7",
	"due_at": "2026-09-22",
	"props": { "duration_minutes": 120 },
	"calendar_sync": "none"
}
```

The returned task has `due_at=2026-09-23T03:59:59+00:00` and `props.duration_minutes=120`. A local replay through the existing built runtime reproduces `matchedEffects: 0` and `missingRequiredFields: ["cf2f0470-78c1-4a93-b29a-e3d727f2b0e7.duration_minutes"]`.

Relevant code:

- [write-ledger.ts](../packages/agentic-chat-runtime/src/loop/write-ledger.ts): `getWriteLedgerChangedFields` and `extractChangedValues` only inspect top-level arguments; scalar extraction ignores objects.
- [turn-contract.ts](../packages/agentic-chat-runtime/src/loop/turn-contract.ts): `resolveOutcome` requires matching fields and scalar values.
- [review/turn-contract.ts](../apps/worker/src/workers/agentic-chat/provider/review/turn-contract.ts): field semantics supplied to the reviewer must use the same vocabulary.

Proposed fix: define one canonical nested path for this task field, support the existing `duration_minutes` declaration as an entity-specific alias, and apply that mapping consistently in review, mutation authorization, and completion accounting. Extract the written scalar from the nested argument and validate against the successful receipt. Avoid flattening every JSON object indiscriminately or accepting every successful tool call as fulfillment.

Acceptance: replay the exact production contract; finish `stop` with one fulfilled update and no contradictory footer. Wrong duration, wrong target, failed write, absent field, and subsequently overwritten values must remain unfulfilled. Preserve the local date, task title, priority, todo state, relationship set, and zero-event behavior. Keep timezone/date-only regression cases, but do not change date storage to fix this incident.

## 2. Restore dependencies as an executable workflow

[surfaces.ts](../packages/agentic-chat-runtime/src/catalog/surfaces.ts) deliberately omits relationship tools from both fixed surfaces. [provider/tool-surface.ts](../apps/worker/src/workers/agentic-chat/provider/tool-surface.ts) admits only tools present in the artifact and keeps the surface fixed during the turn. The production prompt confirms the omission. The adapter already exists in [mutationToolCatalog.ts](../apps/worker/src/workers/agentic-chat/mutations/tool-catalog.ts), with project scope and endpoint normalization.

Proposed sequence:

1. Add the supported relationship write to the project surface and verify both web artifact creation and actual worker tools. Global relationship writes need separate project-scope handling; do not expose the existing context-project-only adapter globally without that work.
2. Describe the concrete workflow: create the five tasks, retain returned IDs, then link the three dependent tasks to their prerequisites. `depends_on` direction is **dependent → prerequisite**, as defined by [edge-direction.ts](../packages/shared-agent-ops/src/ontology/edge-direction.ts).
3. Make the initial reviewed contract cover all five creates and all three directed relationships. Verify how relationships to newly created IDs are bound. Existing symbolic labels support creates and move destinations; they do not provide a general relationship endpoint binding. If existing review cannot securely bind the three endpoint pairs from create receipts, add the smallest explicit endpoint-reference support. A count of any three links is insufficient.
4. Reuse the effect ledger for partial completion and retries; test duplicate-edge handling before relying on retries. The relationship catalog marks downstream idempotency as unsupported.

Acceptance: exactly five tasks, exactly the requested three `depends_on` edges with correct direction, no duplicate task/edge on retry, no unrelated relationship, no events, and a response that distinguishes saved tasks from saved dependencies. A failed third link must report the two saved links and the remaining one accurately.

## 3. Make saved records reachable

The Start Here callbacks in [ProjectWorkspace.svelte](../apps/web/src/routes/projects/[id]/ProjectWorkspace.svelte) call `openEntity('document', id)`, which pushes query parameters and opens a lazy modal. The dedicated `/projects/<project-id>/documents/<document-id>` route already exists. The [current test](../apps/web/src/routes/projects/[id]/ProjectWorkspace.test.ts) checks `pushState` and query parameters without proving that a document is visible. The exact reason the modal failed in the browser still needs reproduction; a URL-only test cannot settle it.

Route both Start Here entry points to the canonical document page. Test the actual document title/body, direct loading, and Back navigation. Preserve query-based editors for other actions unless their behavior is part of the failure.

For case 13, the model returned plain IDs; this is not evidence that the Markdown renderer dropped links. [agent-chat-markdown.ts](../apps/web/src/lib/components/agent/agent-chat-markdown.ts) uses the existing sanitized Markdown renderer. Supply canonical project/task/document URLs from known IDs and project ownership, with one route builder shared where practical. Add concise response guidance to use those references. If the model still omits explicitly requested links, render a small deterministic record-reference list from the read evidence. Read-only references must not depend on created-entity cards or mutation receipts.

Acceptance: the project, cabinet task, and Marketing Brief are clickable in a fresh General Chat and open the correct saved records. Never infer a project ID from a UUID or fabricate a record URL.

## 4. Tighten report grounding and document correction

The production owner-report prompt already contains: “An absent record is not evidence about the world.” It nevertheless says permits are “not approved,” no construction has happened, and records do not exist “anywhere in BuildOS.” Adding that same rule again is unlikely to solve the problem.

Provide a compact distinction between recorded facts, bounded search results, and unknown real-world state. A todo permit-requirements task proves its recorded task state; it proves neither permit denial nor lack of application. A project-scoped or partial read cannot establish workspace-wide absence. Report “No approval evidence was found in the records checked; approval status is unknown.” Apply the same rule to payments, work completion, photos, and deliverables. Use existing coverage/pagination information where available and add missing scope metadata only where needed.

There is also a concrete read-surface gap: the owner-report snapshot lacks `get_onto_document_details`. Its Contractor Note outline says there are no headings and recommends that unavailable tool. The agent then tries an invented `"-"` anchor and an anchor-less request before falling back to search. Admit the supported full-document fallback on the surfaces that expose outline/section reads, and ensure no-heading feedback names a callable next step. Confirm that full content and coverage survive payload shaping.

For the selective Marketing Brief edit, persisted `request_proposal_revision` arguments contain corrupted changelog text (`2026-09-03:.Re?`). The next reviewer explicitly rejects that corruption. The corrected contract description is limited to 240 characters and `required_correction` to 400, yet the reviewer is instructed to carry exact replacement text and preservation requirements there. The original user request remains available, which allowed this case to recover.

Proposed fix: keep exact replacement strings and protected source content in original evidence or structured edit data, with stable references; keep short contract descriptions descriptive. Never make truncated reviewer prose authoritative for document content. Re-review must continue to reject substitutions. Determine from raw provider output versus persisted arguments which corruption originates with the model and which truncation is imposed by local parsing before changing caps.

Acceptance: owner reports distinguish recorded todo status from actual construction progress and unknown permits/payments, with claims limited to the records checked. A no-heading document is read without invalid anchors. The exact 687-character final Marketing Brief remains correct, the preservation token survives, and the reviewer converges without corrupting requested text. Retain the hostile-source storage and summary cases.

## 5. Verify Start Here freshness as a lifecycle

At assessment time, the three queried QA sessions had `last_classified_at=null`; the retained project had only its creation-time successful snapshot, computed around `20:42:25Z`. This supports the report's open-session caveat; it does not prove that a close-triggered job failed.

The implementation is:

`chat close → queue classification → classify/process session → queue project snapshot → refresh managed Start Here regions`

See [close route](../apps/web/src/routes/api/chat/sessions/[id]/close/+server.ts), [chatSessionClassifier.ts](../apps/worker/src/workers/chat/chatSessionClassifier.ts), and [projectContextSnapshotWorker.ts](../apps/worker/src/workers/ontology/projectContextSnapshotWorker.ts). The snapshot worker has a **15-minute TTL** and returns immediately for a recent snapshot. TTL expiry alone does not schedule another job in that branch. Thus “close and wait 15 minutes” is not by itself a guaranteed refresh path.

First test an open chat, a close within TTL after mutations, a close outside TTL, a failed classification, and reopening Start Here after job completion. Compare source records, job state, snapshot timestamp, and displayed content. Then fix the demonstrated boundary: coalesce a dirty snapshot refresh after writes/close, or schedule a delayed refresh when TTL suppresses it; expose last-updated/pending/stale state. Avoid rebuilding the entire snapshot per token or per task in a batch. UI revalidation after a background refresh is a separate requirement.

Acceptance: after the relevant job completes, Start Here reflects five tasks and three documents under the report's counting convention. Before completion, old counts must not appear to be current. TTL suppression must not silently discard the only refresh request.

## 6. Optimize the measured slow path

Durable production observations give this decomposition. Provider attempt sums include failed attempts; the remaining wall time includes tools and orchestration. These are four observations, not percentile estimates.

| Turn                    |  Total | Acting-provider attempts / time | Review attempts / time | Failed attempts |
| ----------------------- | -----: | ------------------------------: | ---------------------: | --------------: |
| Cabinet update          | 93.48s |                      5 / 80.46s |              1 / 4.08s |               1 |
| Ambiguous inspection    | 99.12s |                      6 / 86.01s |              1 / 4.99s |               1 |
| Selective document edit | 83.16s |                      8 / 46.67s |             3 / 22.96s |               2 |
| Owner report            | 68.00s |                      7 / 50.73s |              1 / 2.92s |               1 |

Cabinet-update queue wait was 226ms; document-edit queue wait was 246ms. The update's final synthesis alone took 28.83s. After a retry, three acting requests used the recorded Azure provider route, with approximately 10 seconds each between network start and response opening. This is a routing/latency lead, not proof of a specific provider fault. The ambiguity turn additionally read the cabinet task before the two inspections; it did not simply issue three duplicate reads.

Investigate route pinning/fallback and provider timing in [openrouter-client.ts](../apps/worker/src/workers/agentic-chat/provider/openrouter-client.ts). Remove avoidable correction and invalid-read rounds through the earlier fixes. Check the opening-contract policy: `LAZY_COMPLEX_WRITE_CONTRACT_SURFACE_PROFILES` still names the retired profiles rather than `global`/`project`; determine whether that is intentional before changing it. Preserve the existing direct-write target restrictions and independent semantic review.

Do not remove the reviewer as the first optimization: it accounts for only about 4 seconds of the 93-second update. Do not compact away document evidence; that previously broke exact-content behavior.

Acceptance: repeat the three narrow scenarios at least five times on one pinned release with zero harness retries, record median/max and provider attempts, and target every run under 30 seconds. Keep failures visible. A stronger percentile SLO requires a larger sample. Include time to useful response, since the update's first persisted response arrived only after about 92.7 seconds.

## Proposed delivery order

1. **Completion accounting:** smallest deterministic correctness fix; use the captured failed contract as the regression fixture.
2. **Tool completeness and dependencies:** relationship exposure/workflow plus callable no-heading document fallback. Recheck surface budgets and exact worker prompt tools.
3. **Navigation and record references:** canonical Start Here destination and links in retrieval answers, with browser assertions about visible content.
4. **Grounding and correction integrity:** evidence-scoped reporting and protected exact document text; retain the adversarial document battery.
5. **Freshness lifecycle and measured performance:** reproduce the close/TTL paths, fix the observed invalidation boundary, then optimize remaining provider latency and unnecessary passes.

Capture timing throughout, not only at the last step. Use focused runtime/worker tests for contract and tool-surface changes; run the web Svelte check after component edits. Finish with the same production browser battery on one verified web/worker release, independent saved-state reads, explicit edge checks, and additional navigation/freshness checks. Report calendar separately so its configuration status does not obscure progress here.

## Assessment limits

- Production access in this assessment was read-only and scoped to the retained QA project and cited turns.
- The mutation mismatch was replayed through the existing local built runtime and corroborated against source. No new application tests or fixes were added.
- Navigation was traced from source and existing tests; the modal failure was not newly reproduced in a browser. Post-close freshness remains a test obligation.
- The requested Svelte autofixer was attempted but could not fetch `@sveltejs/mcp` because the npm registry hostname was unavailable. No Svelte files were edited; this does not block the assessment.
- Existing uncommitted repository work was preserved.
