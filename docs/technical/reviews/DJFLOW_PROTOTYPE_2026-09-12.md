<!-- docs/technical/reviews/DJFLOW_PROTOTYPE_2026-09-12.md -->

# DJFlow first working prototype — verification

Date: 2026-09-12. Local internal pilot; no production deployment.

## Result

The read-only project-review workflow completed twice through the actual chat admission,
Supabase queue, worker, model provider, durable stream, and terminal message save.
The final recorded turn took 34.3 seconds from client send to completion.
Its plan, both specialist findings, and final answer were delivered. The specialist
reports were also found in the saved assistant message metadata.

Project: `6db9ed25-4a69-47c1-a17f-30d049465ce6`  
Chat session: `df645ca0-f7fc-4519-8b5b-038a400a1f4e`

The live comparison found the project and eight domain tables unchanged. This checks
saved tasks, documents, goals, plans, risks, milestones, events, and edges. It does not
mean the chat or provider accounting tables are unchanged: those intentionally record
the run.

## Checks

- 196 targeted worker tests passed across workflow, executor, provider client,
  composition, and configuration suites.
- 99 targeted web tests passed across stream handling, progress rendering, and session restoration.
- Worker typecheck passed.
- Web check passed with zero errors and zero warnings after building the existing
  local orchestrator test-harness dependency.
- Svelte autofixer reported no issues in the new page or card. Its two advisories
  in ThinkingBlock concern the existing scroll-follow effect and element binding.
- Live smoke passed twice after correcting reasoning/output budgets. The latest
  pass also verified reports saved with the final assistant message.
- Full Cedar House regression gate: **failed, 49/52**, across 13 cases, three
  repetitions, and 45 recorded turns. This is not a release-gate pass.

## Full-gate findings

The frozen web, worker, and final executable tree matched the original checkout:
Git `c324762250e8c9546d63cf1dada4b6c885d36974`, dirty-source SHA-256
`978e049d9b45565e5175afd12c2ac37beef62b30a053631cc970ad2b894fce67`.
The gate ran from 21:32 to 21:57 UTC. Its raw
[gate result](../../../output/agentic-gate/djflow-prototype-2026-09-12/gate.json),
[scorecard](../../../output/agentic-gate/djflow-prototype-2026-09-12/scorecard.json),
turn evidence, and provider captures are preserved. No thresholds or assertions
were changed to improve this result.

- Case 8, repetition 3, correctly edited the document but took **117.6 seconds**
  against the 30-second limit. The other repetitions took 23.0 and 29.3 seconds.
- Case 14, repetition 1, took **81.1 seconds** against the 40-second limit. Its
  budget assertion also produced a false positive: the regex matched
  `budget is therefore unknown (not zero, just not recorded` inside a statement
  about actual spend. The answer explicitly stated the $85,000 cap and $10,000
  contingency. This does not excuse its latency failure or establish that the
  entire answer meets the quality rubric; the judge was not reached.
- Case 14, repetition 3, had a real grounding failure. After correctly labeling
  actual construction status unknown, it asserted that construction does not
  begin until the planned start date. A planned date does not establish actual
  site activity. The judge correctly rejected that contradiction.
- Case 14, repetition 2, passed both assertions and the judge, in 26.9 seconds.

These were ordinary-chat cases, not `/workflow` runs. The gate therefore exposes
remaining baseline latency and grounding problems; this run alone cannot prove
whether any regression was introduced by the current change set. The prototype's
two separate live smoke passes establish its narrower execution/read-only contract.
Keep the pilot internal and retain the rollback lane. The next gate work should
repair the spend-versus-cap oracle with positive and negative examples, investigate
the two retained slow provider traces, and fix the unsupported start-date inference
before another complete regression run.

## What the experiment established

One durable chat turn can coordinate a planner, two isolated specialist contexts,
and a final synthesis without introducing child queue jobs or a general scheduler.
Shared provider leases bound concurrency. Disabling model tools alone was insufficient
for read-only behavior: the existing automatic research/future capture hooks also
needed an explicit exclusion, which is now covered by executor and live tests.

The initial live failure showed why hidden reasoning belongs in the completion budget.
Both specialists spent all 2,200 tokens on reasoning and produced no report. The pilot
now requests low reasoning effort and uses completion ceilings of 900/3,200/3,200/3,200.
The later successful runs do not prove that these settings are optimal across providers.

## Remaining architectural work

1. Move admission to a worker-owned immutable workflow input. The current pilot still
   pays the existing web preparation cost, then refreshes context in the worker.
2. Add durable step claims, accepted-result checkpoints, and physical-dispatch cost
   reservations before promising crash/resume behavior or hard dollar limits.
3. Compare outcome quality and latency to a matched single-agent baseline. These
   specialists share the same configured model, so role separation alone is not
   evidence of improved judgment.
4. Add scoped web research only with evidence provenance and explicit egress rules.

A completed turn's usage sum is convenience telemetry, not the cost ledger. Provider
attempt/usage receipts remain the authoritative evidence, particularly when a failed
pass emits no terminal usage event. Do not derive a hard spend guarantee from four
logical passes; transport retries can create additional physical requests.

## Version naming for the next migration

The target proposal uses illustrative v1/v2 command labels. Those labels are not the
current immutable artifact version: the shared contract currently writes
`agentic_chat_input_v3` and still reads `agentic_chat_input_v2`. Before implementing
worker-owned admission, assign explicit new command/receipt/artifact versions from
that actual baseline. Do not overwrite the existing v2/v3 input formats or treat an
empty prepared artifact as worker-owned admission.

## Inspect and run

See [prototype guide](../../../docs/archive/agentic-chat-djflow/djflow-prototype.md).
The original checkout's lab was started at `http://127.0.0.1:5188/workflow-lab`
after the gate stopped. An authenticated HTTP check returned 200, rendered the lab,
found the retained demo, and verified the healthy worker's matching provenance.
See [local readiness](../../../output/workflow-prototype-buffered-baseline-2026-09-12/local-readiness.json).
The browser is left at the QA sign-in page; an authenticated manual browser run
has not been completed. Use the QA email/password from `.env.agentic-gate.local`.
Machine-readable evidence is in [verification.json](../../../output/workflow-prototype-buffered-baseline-2026-09-12/verification.json),
with the actual turn and saved reports in [smoke.json](../../../output/workflow-prototype-buffered-baseline-2026-09-12/smoke.json).
This report preserves the buffered prototype baseline; see
[subsequent streaming and regression work](./DJFLOW_NEXT_PIECES_2026-09-12.md) for the latest changes.
The source manifest records hashes for this change set; the regression gate retains
its own complete executable-source provenance.

## Actual final answer from the retained QA chat

## Combined recommendation (both specialists completed — review is complete, not partial)

**Bottom line:** The next move is not "start work" — it's to close one decision and one missing baseline before any commitment. Both specialists converge on permit confirmation as the gate; they diverge on whether the cabinet order is truly gated by it and on how much the budget cap can be trusted. Treat the $85,000 as a ceiling, not spend authority.

### Prioritized next steps

1. **Execute `QA — Confirm permit requirements` (`461cb4a1-3013-46aa-b712-c575d64a2fbf`) as a defined deliverable, not a checkbox.** Its description is empty today. Require written output: jurisdiction, permits required, fee schedule, review/approval lead times, required drawings/licences, inspection sequence, and named owner. Note its due date `2026-09-16T03:59:59Z` is Sep 15, 11:59 p.m. ET — roughly two days after the Sep 14 start, with no recorded basis for that window.
2. **Do not release `QA — Order kitchen cabinets` (`d71ce9c6-27fa-4aef-8caf-6812857ffa73`, due Sep 18 ET) or `QA — Electrical rough-in` (`400a2cf0-b6a7-42c3-a267-62c66ed6de90`, due Sep 28 ET) until the permit outcome is recorded** — unless cabinet ordering is confirmed not to depend on permits, in which case start selections and lead-time review in parallel under a conditional/cancellable commitment.
3. **Build a one-page line-item budget before committing spend:** estimates for cabinets, electrical, bathroom, permits, design/inspection-correction costs against $75,000 working + $10,000 contingency. No bids, allowances, or permit fees are recorded.
4. **Add the missing structure:** milestones (permit issued, rough-in passed, kitchen passed, bathroom passed, owner walkthrough), task start dates (all five tasks have null `start_at`), a dependency for `QA — Bathroom inspection` (`8502e411-b9c9-4815-a32b-d82720553934`), and an owner-walkthrough / budget-checkpoint task — both are success criteria with no task recorded.
5. **Protect the fragile hand-off:** rough-in (Sep 28 ET) to kitchen inspection (`bd4879e6-f621-4f97-854d-d065245e6e38`, Sep 30 ET) is a two-day gap. Pre-book the inspection and hold correction buffer.
6. **Set an escalation rule up front:** if permit fees, bids, or lead times breach the $75,000 base or threaten the Nov 20 target, change scope or date explicitly rather than consuming contingency silently.

### Evidence base

Project `6db9ed25-4a69-47c1-a17f-30d049465ce6` "Workflow lab · Cedar House demo", state `planning`, start 2026-09-14, target 2026-11-20, cap $85,000 incl. $10,000 contingency. Five tasks, all `todo`. Zero goals, milestones, plans, events, or budget documents; documents are only `START HERE` (`4dacae52-8dc7-4a7b-be68-bcc473834d86`, draft; says state unknown, next step uncaptured) and a draft marketing brief (`ad6db22b-af68-4a12-83f1-069d3c6a179a`).

### Where the specialists disagree

- **Cabinet dependency:** Analyst accepts the recorded dependency and sequences cabinets after permit closure; reviewer challenges it, noting cabinet ordering may not legally depend on permits and that the Sep 18 date leaves only three days of margin.
- **Emphasis on the permit→schedule chain:** Analyst frames the two-day inspection window as tight-but-manageable; reviewer treats the two-day _permit-confirmation_ window itself as unsupported and potentially already invalidating downstream dates.

Both agree: permit confirmation first, no spending before a cost baseline, and contingency should not absorb permit-driven scope.

### Unknowns

Jurisdiction and actual permit requirements; whether electrical permits are separate from building permits; permit fees and review lead times; cabinet lead times and current pricing; any bids or existing estimates; hidden-condition exposure; whether bathroom inspection needs its own permit/rough-in dependency; and whether "confirm" means issuing or merely identifying permits. No external research or project changes have been made.
