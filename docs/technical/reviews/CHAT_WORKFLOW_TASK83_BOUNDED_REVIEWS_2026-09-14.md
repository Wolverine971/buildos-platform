<!-- docs/technical/reviews/CHAT_WORKFLOW_TASK83_BOUNDED_REVIEWS_2026-09-14.md -->

# Task 83: bounded workflow reviews and prompt snapshots

**Created:** 2026-09-14  
**Status:** **Done.** DJ closed Task 83 on 2026-09-14 after focused validation and one live QA replay. The replay completed both specialists and saved a valid prewarmed prompt snapshot. The work is uncommitted and undeployed. The coordinator's full gate and the production migration are residuals with named owners (section 6).  
**Retired tracker:** `tasker/83-chat-workflow-bounded-reviews.md` was deleted under the tasker maintenance rule; its original scope is preserved in Appendix A. The role contract (section 3) is recorded in the [workflow v1 contract proposal](../../architecture/agentic-chat-workflow-v1-contract.md) owned by [85](../../../tasker/85-chat-workflow-durable-contracts.md). [87](../../../tasker/87-chat-workflow-recoverable-steps.md) inherits the workflow provider.  
**Evidence:** `output/workflow-bounded-reviews-2026-09-14/`

## 1. What failed, classified before changing limits

### Reviewer "response limit"

The failure was output truncation caused by hidden reasoning. It was not a parse or validation failure, and it was not a transport timeout. All retained QA workflow runs used DeepSeek V4.1 Flash with `reasoning.effort=low`, and completion tokens include reasoning.

| Turn (QA)           | Planner (completion/reasoning) | Analyst              | Reviewer                     | Editor   |
| ------------------- | ------------------------------ | -------------------- | ---------------------------- | -------- |
| `2e8c072e` cap 2200 | 752/496                        | 2200/2200 **length** | 2200/2200 **length**         | not run  |
| `c7274e19`          | 499/398                        | 2040/1257            | 2219/1594                    | 1066/80  |
| `bb97e120`          | 222/45                         | 2006/1209            | 2422/1629                    | 1548/562 |
| `6b39800f`          | 208/57                         | 1795/992             | 2603/1868                    | 1261/234 |
| `594561f2` replay   | 578/327                        | 1896/1092            | **3200/2605 length**, 17.5 s | 977/122  |

About 81% of the reviewer's 3,200-token allowance went to hidden reasoning. That left roughly 600 visible tokens for a 500-word prose report. Prompts were about 2.1k tokens, so input size was not the problem. The cap had already been raised once, from 2,200 to 3,200, and the same failure returned.

A second constraint: the acting client clamps every request to `AGENTIC_CHAT_ACTING_MAX_TOKENS` (4,000). A larger workflow cap would have been silently lowered.

### `agentic_chat_prompt_snapshot_invalid_runtime_augmentation`

This was a producer/consumer mismatch in the SQL consumer, not a prewarm defect. `persist_agentic_chat_prompt_snapshot_v3` rebuilds the admitted prompt from the artifact system prompt, history, and user message. It accepts extra messages only as system guidance inserted before the user message.

The workflow's first provider request is a separate two-message prompt: read-only review rules, then a question-and-evidence packet. Its message count is at most the base count, so v3 raised the error on **every** workflow turn, prepared hit or miss. The worker's snapshot was an honest record of the request. Rewriting the model request to fit a diagnostic contract would have been wrong.

## 2. Changes

- `apps/worker/src/workers/agentic-chat/workflow/role-report.ts` (new): bounded report schema, evidence index, validator, renderer, editor projection, and dispatch policy.
- `apps/worker/src/workers/agentic-chat/workflow/prototype-provider.ts`:
    - Specialists return JSON reports that must pass validation before acceptance.
    - Truncation is detected from `finish_reason=length` **or** completion tokens reaching the request cap.
    - A specialist whose report is truncated, empty, or invalid gets one compact retry. Transport errors never retry.
    - The editor sees only accepted reports.
    - At most six application-level provider calls are allowed per workflow.
- `supabase/migrations/20260914165546_agentic_chat_workflow_prompt_snapshot.sql`: replaces the v3 body without changing its signature. A `/workflow` turn whose request does not start with the admitted system prompt takes a workflow branch. That branch requires:
    - exactly two messages, `system` then `user`, with no extra keys;
    - `p_tool_definitions = []`;
    - a system message starting with the read-only rules preamble;
    - a user message starting with `USER QUESTION\n<admitted question>\n\n`;
    - a system-prompt SHA-256 that matches the content;
    - consistent size evidence.

    The branch persists through v2, keeping every identity, queue-ownership, artifact, and tool-surface check. It then replaces only the evidence fields and marks `prompt_sections.workflow_prompt`. Ordinary and runtime-augmented snapshots are unchanged.

- Tests:
    - `supabase/tests/20260914165546_agentic_chat_workflow_prompt_snapshot.test.sql` (new)
    - `apps/worker/tests/agenticChatWorkflowPromptSnapshot.postgres.test.ts` (new)
    - `apps/worker/tests/agenticChatWorkflowRoleReport.test.ts` (new)
    - `apps/worker/tests/agenticChatWorkflowPrototype.test.ts` (updated)

No shared type, executor, bootstrap, composition, OpenRouter client, model routing, or table changed.

## 3. Role and output contract (handoff to 85/87)

The contract version is `chat_workflow_role_report_v1`, covering the `project_analyst` and `risk_reviewer` roles.

```ts
type ChatWorkflowRoleReportV1 = {
	version: 'chat_workflow_role_report_v1';
	role: 'project_analyst' | 'risk_reviewer';
	summary: string; // 1-280 chars (prompt asks < 240)
	findings: Array<{
		claim: string; // 1-320 chars (prompt asks < 240)
		basis: 'recorded' | 'inferred';
		evidence: Array<{ id: string; label: string }>; // 1-4, ids from supplied context only
	}>; // 1-5 after unsupported findings are removed
	risks: Array<{ risk: string; evidence: Array<{ id: string; label: string }> }>; // 0-4, 1-280 chars
	unknowns: string[]; // 0-4, 1-240 chars
	recommendation: string; // 1-480 chars (prompt asks < 400)
	unsupportedReferences: number; // cited ids not in supplied evidence, removed
	unsupportedFindings: number; // findings with no supplied id, removed
};
```

Acceptance rules:

- JSON shape alone is not success. A report is accepted only when at least one finding cites an id from the supplied project packet. The packet covers project, goals, milestones, plans, tasks, documents, events, and `start_here` records, to a depth of 3. Record labels are capped at 80 characters.
- Unknown ids are removed and counted. A finding left with no supported id is dropped and counted. Exceeding any count or length limit rejects the whole report, with a truthful reason.
- Specialist drafts never become assistant deltas or step results until accepted. Only the editor streams text.
- The editor projection is derived from the accepted report (record names beside ids); it is not a separately stored field.

| Call            | Round | `maxOutputTokens` (incl. reasoning) | Attempts                                      |
| --------------- | ----: | ----------------------------------: | --------------------------------------------- |
| Planner         |     1 |                               1,200 | 1; invalid output uses the labeled fixed plan |
| Project analyst |  2, 5 |                               4,000 | 2; round 5 is the compact retry               |
| Risk reviewer   |  3, 6 |                               4,000 | 2; round 6 is the compact retry               |
| Editor          |     4 |                               3,200 | 1; incomplete stream fails, never replayed    |
| Whole workflow  |       |                                     | at most 6 provider calls (enforced)           |

The six-call limit counts application-level calls. The OpenRouter client can make further physical HTTP attempts inside one call, through transport retries or route fallbacks. Those are visible in `provider_attempt_ended` observations and are metered by Tasker 87's dispatch hook, not by this limit.

Retry policy (DJ chose one compact retry, 2026-09-14):

- **Retries:** a truncated (`workflow_response_truncated`), empty (`workflow_incomplete_response`), or rejected (`workflow_report_invalid`) specialist report.
- **Never retries:** a provider or transport error, cancellation, or a retry that would start with less than **75 s** remaining on the parent provider budget.
- **Compact retry prompt:** at most 3 findings, 2 risks, and 2 unknowns, plus the validator's own reason. Previous model output is not resent.
- **Visibility:** the retry appears as step activity ("retrying with a compact report"), and usage from the truncated attempt stays in the turn total.
- **Step results:** an accepted report renders with record names. A failed specialist gets a message specific to its failure code, and the review is labeled partial.

**Sizing rationale:** the largest reviewer reasoning in a complete response was 2,605 tokens, and a compact report takes under about 1,000 visible tokens, so it fits the 4,000 client ceiling. The planner's 1,200 covers its observed maximum of 752, and the editor's 3,200 covers its observed maximum of 1,548.

Not claimed: reasoning is not directly bounded, because `reasoning.max_tokens` is not sent. A provider can still spend the whole cap on reasoning. That outcome is detected, retried once, and then labeled partial.

**Pricing:** at 85's frozen peak rates, the worst-case completion is 1,200 + 4 × 4,000 + 3,200 tokens. Adding six prompts of roughly 2.3k–4.5k tokens gives about $0.03 before client-internal retries, well inside the proposed $0.25 cap. The reservation arithmetic at the 128 KiB request ceiling is in the contract proposal.

## 4. Validation

- **Focused tests:** `test-gate run pnpm exec vitest run` in `apps/worker` passed 146/146 across 5 files:
    - prototype 27;
    - role report 17;
    - Postgres snapshot 2;
    - snapshot adapter 4;
    - executor 96.
- **Scenarios covered:**
    - bounded complete reports;
    - `length` finishes, and `stop` finishes that used the whole budget;
    - a double truncation producing a partial review;
    - invalid evidence rejected, then a compact retry accepted with unsupported references removed;
    - an unverifiable report never accepted;
    - no retry when the remaining budget can't fit one;
    - transport failures not retried;
    - cancellation during a retry;
    - streaming partial synthesis, and editor truncation without replay;
    - both specialists failing;
    - the exact planner snapshot shape.
- **Real-shape reproduction:** the Postgres test runs a disposable cluster with migrations 0804, 0813, and 0817. It drives the real `ChatWorkflowPrototypeProvider` and the real `SupabaseAgenticChatPromptSnapshotAdapter`, with a v3 artifact shaped like replay `594561f2`:
    - With a prepared-prompt hit, the old function raises `invalid_runtime_augmentation`.
    - An admission-window miss with history fails the same way.
    - After the new migration, both cases persist, replay as `already_persisted`, and store the exact request.
    - The SQL contract file re-runs the 0804, 0813, and 0817 cases against the new body. It adds rejections for tools, a different question, a forged hash, and missing read-only rules. It also checks that an ordinary-shaped request on a `/workflow` turn still goes through the admitted-prompt check.
- **Closeout correction:** the limit field was renamed from `maxPhysicalDispatches` to `maxProviderCalls`, because it counts application-level calls, not physical HTTP attempts. The error code is now `workflow_provider_call_limit`. After the rename, the prototype, role-report, and Postgres suites re-ran 46/46, and worker `typecheck` passed.
- **Other checks:** worker `typecheck` passes, and `typecheck:tests` passes with 0/0 debt. Prettier is applied. ESLint reports nothing for the changed source files; the test files are outside the worker ESLint project.

## 5. Live QA receipt

- **Source:** HEAD `199a6ba44` plus this dirty tree. Hashes of the three runtime files are in `source-provenance.json`.
- **Migration:** applied to the isolated QA project (`daudvq…`) only. It ran through a scratch Supabase workdir linked to that project, because the repository's own link points at production. Checks after applying: workflow branch present, augmentation check present, `anon` cannot execute it, `service_role` can.
- **Replay:** local web and worker from `pnpm agentic:workflow` against QA. The project (`bdeddefe…`, Workflow lab · Cedar House demo) and question were the same as `594561f2`, submitted once from Chrome.

Turn `1bbcc9d0-fa6a-4a3b-9f6c-3333bb2dd7a0` (session `a4d85a34…`) was a **prepared prompt hit** (`a6a76c44…`, `history_source=prepared_prompt`, zero history).

| Milestone (database time)         | UTC                         |                                                                          From admission |
| --------------------------------- | --------------------------- | --------------------------------------------------------------------------------------: |
| Browser automation submitted form | 19:07:39.475                | about −7.6 s (includes form fill and web preparation; not a click-accurate client time) |
| Admitted                          | 19:07:47.100                |                                                                                       0 |
| Provider authority                | 19:07:48.972                |                                                                                  1.87 s |
| First durable event               | 19:07:49.152                |                                                                                  2.05 s |
| Context gathered                  | 19:07:50.676                |                                                                                  3.58 s |
| Review plan ready                 | 19:07:52.748                |                                                                                  5.65 s |
| Reviewer / analyst completed      | 19:07:58.783 / 19:07:59.613 |                                                                           11.7 / 12.5 s |
| Prompt snapshot row created       | 19:08:01.009                |                                                                                 13.91 s |
| First answer text persisted       | 19:08:01.089                |                                                                                 13.99 s |
| Terminal (`completed`)            | 19:08:03.877                |                                                                                 16.78 s |

These are backend persistence times, not client time-to-first-token. The UI showed **Project review ready** with all five steps completed and no partial label. The saved answer says "2/2 specialists reported".

| Round | Role     | Finish | Completion / reasoning / prompt | Cap   | Duration | Upstream |
| ----: | -------- | ------ | ------------------------------- | ----- | -------: | -------- |
|     1 | Planner  | stop   | 246 / 93 / 2,022                | 1,200 |    1.8 s | Venice   |
|     2 | Analyst  | stop   | 2,125 / 1,093 / 2,256           | 4,000 |    6.3 s | Venice   |
|     3 | Reviewer | stop   | 1,705 / 806 / 2,239             | 4,000 |    5.6 s | Venice   |
|     4 | Editor   | stop   | 792 / 73 / 4,385                | 3,200 |    2.9 s | Venice   |

- **Calls and cost:** no retry ran. Four provider calls, each completed on its first physical attempt (`provider_attempt=1`). Provider-reported model cost was $0.0114.
- **Snapshot:** `chat_prompt_snapshots.id=08e2227d-282a-5f25-9964-1d08a75a5437`, linked from the turn.
    - Two messages, `system` then `user`.
    - The system message starts with the read-only rules and contains `ROLE: Planner`.
    - `tool_definitions=[]`.
    - `prompt_sections.workflow_prompt.admitted_message_count=2`.
    - The replay's worker log has zero snapshot-persistence failures (`log-scan.json`).
- **Domain rows:** unchanged. Before and after SHA-256 match for the project row, 5 tasks, and 2 documents. Goals, plans, milestones, risks, events, and edges are empty before and after.
- **Tool calls:** zero.

Compared with `594561f2`, admission to terminal fell from 34.46 s to 16.78 s. That run's upstream was SiliconFlow; this one was Venice, which used fewer reasoning tokens. The speed difference is **not** attributed to this change. The acceptance evidence is the complete two-specialist review and the valid prewarmed snapshot.

## 6. Residual ownership after closure

| Residual                                                                                                                                                                                                                                                                   | Owner                                                                                |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Apply `20260914165546` to production before or with any worker deploy that includes this provider. Without it the review still runs, but the snapshot keeps failing. Target QA only through a workdir linked to the QA ref; the repository link is production.             | [85](../../../tasker/85-chat-workflow-durable-contracts.md), SQL and migration owner |
| Include this change set in the next complete mandatory gate. Prove an intentional partial review live; truncation, compact retry, and partial labeling are proven only with deterministic fakes today.                                                                     | [89](../../../tasker/89-chat-workflow-integration-acceptance.md), coordinator        |
| Physical request metering beyond the six-call limit, and a direct reasoning bound if needed. The OpenRouter client relabels a capped response as `length` only against its client-wide cap, not a smaller per-request `maxOutputTokens` (the workflow checks its own cap). | [87](../../../tasker/87-chat-workflow-recoverable-steps.md), dispatch hook owner     |
| Add evidence-reference `kind`/`version` from the accepted evidence set when durable context lands. 83 validates id membership only.                                                                                                                                        | [85](../../../tasker/85-chat-workflow-durable-contracts.md) contract freeze          |

Informational: the SQL mirrors `replace(/^\s*\/workflow\s*/i,'').trim()` using ASCII whitespace classes. Unusual Unicode whitespace at the edges could reject a snapshot. That affects telemetry only; the review still runs.

## Appendix A: original tracker scope (retired `tasker/83`)

**Created:** 2026-09-12. **Depended on:** the recorded 82 + 84 repair baseline and the Task 90 closeout. **Unblocked:** 87's persistent runner, which inherits this role and output contract.

**Outcome.** The existing analyst and risk reviewer can finish useful reports within explicit output budgets. A prewarmed project review records a valid diagnostic prompt snapshot. If a specialist genuinely fails, the user still gets an accurately labeled partial review with retained findings. This is a bounded prototype repair, not durable recovery. The motivating replay `594561f2` ended **Partial review ready** and logged `agentic_chat_prompt_snapshot_invalid_runtime_augmentation`.

**Work.**

1. Inspect the actual reviewer prompt, context size, configured output allowance, finish reason, and usage. Distinguish output truncation, reasoning allocation, parse or validation failure, and transport timeout before changing a limit.
2. Define compact bounded role reports: supported findings, source references, risks, unknowns, and a concise recommendation. Limit item counts and text lengths, and validate references against supplied context. Planner and specialist drafts remain private until accepted, and none can call tools or change project state.
3. Size the request and response budget from observed usage. Avoid blindly raising every token limit or introducing unbounded retries. Any bounded correction must fit current total deadlines and capacity, have visible usage, and be represented in the dispatch contract handed to 85/87. Never label truncated JSON as success.
4. Reproduce the prewarm snapshot failure using the real prepare/admit/worker augmentation shape, and fix the producer/consumer mismatch in the right layer. Preserve scope, tool policy, and runtime provenance validation. Do not suppress logging, bypass validation, or make prompt capture required for model execution.
5. Preserve incremental editor output, honest partial states, cancellation, and saved-report hydration. Do not replay synthesis after visible text in the same generation. Pass the accepted result shape and limits to 85 before its freeze.

**Ownership and boundaries.** Owned `workflow/prototype-provider.ts`, its focused tests, and the narrow producer/validator correction around `promptSnapshot.ts`. Web prewarm and shared snapshot types were to be traced, with any shared-type change coordinated with 85, and executor/bootstrap wiring proposed through the coordinator. The workflow risk reviewer is not the ordinary mutation safety reviewer. Out of scope: semantic reviewer model separation, write authorization, Tasker 80's cheaper-reviewer canary, new tables, recovery loops, model routing experiments, and package upgrades.

**Validation and completion.**

- Focused tests with fakes: bounded complete reports, actual truncation, invalid report evidence, specialist failure, prewarm hit and miss, invalid augmentation rejection, cancellation, and streaming partial synthesis.
- The coordinator runs the complete mandatory gate before 85 integrates.
- One replay of the same project and question through the real prewarmed browser path, keeping its outcome regardless of success.
- Record configured budgets, actual output and finish reasons, snapshot persistence, first visible progress and answer, terminal state, and unchanged domain rows. Do not report backend persistence time as client first-token time.
- Acceptance: a valid prewarmed snapshot, a complete normal review, truthful failure controls, and the full gate. DJ closed the task with the full gate transferred to 89.
