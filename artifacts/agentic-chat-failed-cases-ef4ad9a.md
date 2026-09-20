<!-- artifacts/agentic-chat-failed-cases-ef4ad9a.md -->

# Agentic chat failed-case retest — release ef4ad9a

Completed September 4, 2026, approximately 20:36–20:54 America/New_York. This run repeated only the five scenarios that scored below full credit in the previous `4ac73bd` production battery. It does not replace the previous 13-case release score.

**Result: 10/20 (50%, F), down from 13/20 (65%, D) on the same five cases. None of the five reached full credit.** Fresh reads remain mostly accurate, and record links improved. Mutation handling regressed: deterministic task and document updates were blocked before the write, the task batch needed three recovery prompts, and two recovery turns ended in `provider_forced_synthesis_failed` after partial durable writes.

[Inspect the retained QA project](https://build-os.com/projects/ad4580e6-19aa-4f94-95a1-e00ed1337bb6). [Exact prompts and grades](/Users/djwayne/buildos-platform/artifacts/agentic-chat-failed-cases-ef4ad9a-cases.json). [Turn receipts](/Users/djwayne/buildos-platform/artifacts/agentic-chat-failed-cases-ef4ad9a-runs.json). [Independent saved-state evidence](/Users/djwayne/buildos-platform/artifacts/agentic-chat-failed-cases-ef4ad9a-evidence.json).

## Deployment verification

- GitHub `main`: `ef4ad9a10efd38268be8982b6b8565ec0472c78f` (`updates`, committed 2026-09-04T23:55:41Z); combined status success.
- Vercel production reported success for the same commit; deployment status target `3XYKXqx79jRRkp8iMC13EHDZhNMx`, updated 2026-09-05T00:09:16Z.
- Railway agentic worker deployment `e0a70228-016d-419d-aba8-716636a08bb4` reported SUCCESS for the same commit with one production instance running.
- The live worker health endpoint reported release `ef4ad9a`, healthy database and Realtime connections, and 25 mutation capabilities.
- All 12 turns in this retest used `worker_realtime`. Ten completed with `stop`; two failed with `provider_forced_synthesis_failed`.

## Comparable failed-case scorecard

Scoring is unchanged: 4 = correct and independently verified; 3 = minor friction or incomplete verification; 2 = partial or repaired; 1 = material failure with useful or accurate recovery; 0 = failed or misleading. A ≥90%, B ≥80%, C ≥70%, D ≥60%, F <60%.

| Case | Scenario                         | `4ac73bd` | `ef4ad9a` | Change | Verified result                                                                                                                                                                                                                                                 |
| ---: | -------------------------------- | --------: | --------: | -----: | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
|    2 | Five-task batch and dependencies |         3 |         2 |     -1 | The first turn falsely treated the project and its Context Document as two ambiguous project matches. Three recovery prompts eventually produced the five correct tasks, but two runs failed after partial writes and all three dependency edges remain absent. |
|    4 | Narrow task update               |         3 |         1 |     -2 | The agent read the exact task, declared the requested outcome, then a harness fallback demanded clarification. A second prompt supplied the task UUID and final values; it was blocked the same way. The task remains Sep 18 local and 90 minutes.              |
|   10 | Personal calendar availability   |         1 |         1 |      0 | Both connected personal sources failed with `credentials_unreadable`; Google was never contacted. The answer accurately declined to call any slot verified and created nothing.                                                                                 |
|   13 | Fresh-chat saved facts and links |         3 |         3 |      0 | All saved facts were accurate, including the unchanged Sep 18/90-minute cabinet task and unedited marketing text. Task and document links are now clickable; the project name was still plain text.                                                             |
|   14 | Grounded owner report            |         3 |         3 |      0 | The report used the correct project, task, and document records and rendered useful links. It still converted absence of evidence into stronger claims such as no payments, no completed work, and permits not approved.                                        |
|      | **Subset total**                 | **13/20** | **10/20** | **-3** | **50%, F. This is a targeted regression result, not a full-battery release grade.**                                                                                                                                                                             |

## What happened

### 1. Fresh construction project setup

General Chat created `[QA FAILED RETEST ef4ad9a] Cedar House Renovation` with the exact synthetic scope, $85,000 cap including $10,000 contingency, Sep 14–Nov 20 New York schedule, exclusions, and success criteria. The project and Context Document were saved correctly, with no initial tasks or events. The turn took 119.9 seconds and recorded one validation failure; the equivalent project-creation turn in the previous battery took 31.1 seconds.

### 2. Five tasks and three dependencies

The original one-shot task prompt did not write anything. After 172.4 seconds it asked which Cedar House project to use because search had presented the project and its Context Document as if both were candidate projects.

The exact project UUID was then supplied. That run created the permit and bathroom tasks, but terminated after 31.2 seconds with `provider_forced_synthesis_failed`. A recovery prompt loaded those records and created the remaining three tasks, then terminated after 47.3 seconds with the same failure. A final relationship-only prompt loaded all five tasks but was intercepted by `request_turn_clarification`, saying the exact targets and values could not be verified. No relationship mutation was attempted.

Independent state now contains exactly five `todo` tasks with the requested local due dates, priorities, and structured durations, plus zero events. It contains **zero of the three requested task-to-task edges**. This earns 2/4 because the task records were repaired across multiple turns while the relationship portion still failed.

### 3. Narrow cabinet update

The original update prompt named one existing task and requested only two field changes. The agent loaded task `7afff306-09c1-4699-9cc5-8b513f2c80c4`, which showed Sep 18 local, high priority, `todo`, and 90 minutes. It declared one task-update outcome. Before calling `update_onto_task`, the harness injected `request_turn_clarification` with the reason `Independent semantic review returned an invalid or unbound decision.`

The recovery prompt supplied the exact UUID, UTC end-of-day value, and `duration_minutes=120`. The same fallback blocked the write again. Saved state remains Sep 18 local and 90 minutes, and no duplicate or event was created. This is a regression from the previous release, where the durable mutation succeeded even though terminal accounting was wrong.

The declared contract in the first turn also contained the same task UUID repeated many times in its raw `target_ids` input before the contract tool normalized it to one ID. That is useful evidence of malformed review or model output around the contract boundary, although the observed blocker is the subsequent harness semantic-review fallback.

### 4. Personal calendar read

The calendar tool found two connected personal sources. Both failed with `credentials_unreadable`, so coverage was `unavailable`, with zero successful sources and zero Google events read. The tool diagnostic said the server-side token encryption key did not match the stored credentials and BuildOS never contacted Google.

The response behavior was safe and accurate: it did not claim free time, did not present hypothetical slots as verified, and did not create, update, cancel, or invite anyone. The integration itself remains unusable, so the case remains 1/4. This is a production credential/configuration problem rather than a missing calendar-read tool.

### 5. Fresh-chat retrieval

A brand-new General Chat found the project and accurately returned the $85,000 cap, $10,000 contingency, five-task count, cabinet task’s actual unchanged Sep 18 local date and 90-minute estimate, and the exact original Audience and Call to action text from the saved Marketing Brief. It did not assume the attempted edits had succeeded.

The cabinet task and marketing document were rendered as real links to their detail routes. The project reference remained plain text, so the case stays at 3/4 even though link behavior improved within that score.

### 6. Grounded owner report

The owner report accurately described the saved plan, Sep 14–Nov 20 schedule, budget, five `todo` tasks, their dates and durations, and the Marketing Brief’s initial-only revision state. It supplied direct project, Context Document, Marketing Brief, and task-list links.

Grounding language remains inconsistent. It correctly says there is no saved evidence of permit approval and labels the final answer `Unknown — not confirmed`, but also says the records confirm permits are not approved. It begins the invoices section with `None` and reports $0 spend even though the available records only establish that no invoice or payment evidence was found in the sources it read. Similar statements about no construction progress notes or photos are broader than the performed reads support.

### 7. Supporting mutation regression: document edit

Document creation itself worked: `QA — Cedar House Marketing Brief` was saved as the exact 613-character Markdown body with a real document link. The subsequent selective in-place edit loaded that exact document and declared one update outcome, then hit the same `Independent semantic review returned an invalid or unbound decision` fallback before any update tool call. The saved Audience, CTA, and changelog remain unchanged.

This was not part of the five-case numeric subset because selective document editing had passed in the previous full battery. It is included because it shows the mutation blocker is broader than one task schema or date representation.

## Start Here follow-up

The lifecycle hypothesis is confirmed. While project chat remained open, Start Here showed its creation snapshot: 0 open tasks and no project documents. Closing chat triggered an asynchronous refresh within seconds. The Context Document changed at `2026-09-05T00:51:36.014856Z`; reopening Start Here showed 5 open tasks, 0 overdue, a current next step, and the Marketing Brief under `Where the detail lives`.

The document navigation defect remains. Clicking **Open document** closes the Start Here modal and leaves the browser at `/projects/ad4580e6-19aa-4f94-95a1-e00ed1337bb6` with Overview selected. It does not open `/projects/ad4580e6-19aa-4f94-95a1-e00ed1337bb6/documents/7ba6d441-bee8-439d-86c9-60491c7097dd`.

## What improved

- Start Here refreshes correctly after project chat closes, and the refreshed UI matches independently queried state.
- Fresh retrieval now emits working task and document detail links.
- The owner report includes useful project, document, and task-list links.
- Calendar failure wording is honest and actionable; it does not fabricate verified availability.
- Fresh reads correctly reflect failed writes instead of repeating requested values as if saved.

## Problems to fix next

| Priority | Problem                                                                                                                                                                                | Classification / likely boundary                                                                                               | Acceptance check                                                                                                                    |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| P0       | Deterministic task and document updates are blocked after successful reads and declared outcomes by `harness_review_fallback`, even when the exact UUID and final values are supplied. | Harness semantic review / decision binding. This is not ordinary user ambiguity and not a missing mutation tool.               | Case 4 and the selective document edit both reach their update tools, save exactly one record, and complete without clarification.  |
| P0       | Two task-recovery turns end `provider_forced_synthesis_failed` after durable task writes.                                                                                              | Provider/harness orchestration and terminal synthesis. Partial writes make retries risky and expensive.                        | The five-task turn completes once, reports its durable effects, and never ends as a failed turn after successful mutations.         |
| P1       | The five-task workflow never creates dependency edges, and the relationship-only retry is blocked by semantic review before the link tool.                                             | Tool-use planning plus harness review. A relationship capability exists; this is not simply a missing field on task creation.  | Exactly three requested task-to-task edges are independently present after one prompt.                                              |
| P1       | Both personal calendar sources return `credentials_unreadable`; the stored tokens cannot be decrypted by the deployed worker.                                                          | Production credential/encryption configuration or credential rotation. The read tool exists and reports the failure correctly. | Both sources report successful coverage and the same prompt returns three genuinely verified slots.                                 |
| P1       | Project search treats a project Context Document as another candidate project and asks a false disambiguation question.                                                                | Search result typing/ranking or prompt context.                                                                                | The unique exact project name resolves directly to the project record, while documents remain clearly typed as documents.           |
| P2       | Start Here’s **Open document** action closes the modal and stays on Overview.                                                                                                          | Front-end navigation/deep-link handling.                                                                                       | The action opens the Context Document detail route and focuses the requested document.                                              |
| P2       | Owner reports overstate absence of evidence as evidence of absence.                                                                                                                    | Prompt/context grounding and evidence-aware synthesis.                                                                         | Reports use `not recorded`, `not found in the records checked`, or `unknown` unless a saved record proves the real-world condition. |
| P2       | The project link is missing in the fresh-record-links response.                                                                                                                        | Response composition/link rendering.                                                                                           | Project, task, and document references are all clickable and route to the requested records.                                        |
| P2       | Latency is high: project setup 119.9s, first task attempt 172.4s, relationship retry 108.8s, owner report 80.0s.                                                                       | Multi-pass review, orchestration, and response synthesis.                                                                      | Common single-entity turns finish under 30s and the five-task batch under 60s without reducing correctness.                         |

## Selected evidence

- Retained project: `ad4580e6-19aa-4f94-95a1-e00ed1337bb6`; five tasks, two documents, zero edges, zero events.
- Task-batch attempts: `ab4e567e-226e-4cd7-ad3b-fd728e3f1000` (172.4s, false ambiguity), `9a31d293-dc9a-4cda-a0b8-9f65f088f10d` (31.2s, failed after two writes), `65307e1e-52b2-4019-aa96-0a3285614401` (47.3s, failed after three writes), and `78adb24c-7382-4421-ac3b-6b0a9f734dd3` (108.8s, relationship retry blocked).
- Task-update attempts: `bd67667d-f390-4f73-88f9-b963a11857b0` and `f0c2b495-7147-40d4-8a63-55dc6188d4a2`; neither called `update_onto_task`.
- Marketing create/edit: `41b899e8-6dd7-4e18-8d0c-a34d5b910630` succeeded in 14.4s; `aacf658a-5b28-4c76-b16f-eff62e012a80` was blocked before update in 37.1s.
- Calendar: `396bebc2-2ad8-4ca3-b374-225bf3d8359a`; two sources, zero successful, both `credentials_unreadable`, coverage unavailable.
- Fresh facts: `dae1e6ab-f95b-4ed6-a4e1-437623bdbddd`, 19.0s. Owner report: `9959665d-0632-4efa-908d-541889668e6d`, 80.0s.

All calendar-account identifiers are intentionally omitted from these artifacts.
