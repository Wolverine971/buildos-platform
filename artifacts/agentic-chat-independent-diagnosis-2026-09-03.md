<!-- artifacts/agentic-chat-independent-diagnosis-2026-09-03.md -->

# Independent diagnosis of the Cedar House agentic-chat assessment

Reviewed September 3, 2026. This review independently traced the browser findings into current source and used the parent investigator's scoped, read-only runtime records. No application changes, provider calls, database mutations, or calendar writes were made. A deterministic local reproduction exercised the actual worker request builder.

**The first fixes belong mainly in orchestration and data contracts. Better user prompts are not the main remedy.** The strongest finding is a worker optimization that removes previously read facts from subsequent model requests and prevents identical rereads from restoring them. There is also a separate web execution-authorization defect, a reviewer ambiguity failure, inconsistent date semantics, and insufficient calendar error detail. Model behavior still matters: missing evidence does not justify invented quotations.

## What changes the interpretation of the original audit

- **The task batch/single comparison changed execution engines.** Failed batches and the task correction used `agentic_chat_v2_stream`; successful single tasks used `agentic_chat_worker_stream`. The observation is valid, but it does not establish that batch size caused the difference. Replay identical requests on a fixed engine before measuring that relationship.
- **The F grade describes this user's experience, not a model benchmark or failure rate.** The 13 cases are dependent, heterogeneous, and include service availability. Keep the original score as a baseline, but separately track operation completion, factual grounding, boundary handling, and integration availability. Calendar honesty performed better than calendar connectivity; injection resistance performed better than exact source preservation.
- **The CRUD/read tools were generally present.** Task create/update calls reached an authorization gate. Successful document section reads returned the exact requested text. The document-edit turn terminated during contract/reviewer handling, before calling the edit tool. This is not principally a missing-tool inventory problem.
- **Existing prompts already require grounding and honest gaps.** Adding another general “do not hallucinate” instruction would duplicate current guidance while leaving evidence loss intact. Narrow edits also loaded unrelated content-marketing playbooks; remove that irrelevant context, but do not call it the sole cause.
- **Do not generalize prior worker test success to the browser battery.** Earlier repair reports covered synthetic worker boundaries, often explicitly undeployed. The observed browser run mixed worker and web paths. Current checkout: `b4d4c107dcc5341a39a591dc9972fa87400f93a9`; historical deployed worker revision remains unverified.

Evidence: [original browser assessment](/Users/djwayne/buildos-platform/artifacts/agentic-chat-audit-2026-09-03.md), [scoped runtime evidence](/Users/djwayne/buildos-platform/artifacts/agentic-chat-runtime-evidence-2026-09-03.md).

## Diagnosis by failure

### 1. Successful reads disappear before the answer — highest priority

**Observed:** The worker read the correct outline, Audience, CTA and budget, then claimed the headings/facts were absent, repeated reads, and later fabricated quotations. The correction request using only an outline and two section reads succeeded. The raw tool ledger is therefore not proof of what the final model request contained.

**Confirmed current-source defect:** `buildContinuationRequest` calls `supersedeConsumedToolResults` on all prior messages. Every old non-control tool result over 400 characters becomes a stub containing status and, when recognized, entity IDs/titles. Content, headings, dates and descriptions disappear after one subsequent continuation. An identical memo-served reread returns another stub, not the original content. The comments assume that because the model saw a result in an earlier request, its full body is now “dead weight.” A later model request cannot rely on that removed evidence.

The exact Audience result from the audit becomes 583 characters after the normal security wrapper. The actual-source reproduction shows:

| Stage                             | Exact Audience text available in the model's tool messages? |
| --------------------------------- | ----------------------------------------------------------- |
| Immediately after successful read | Yes                                                         |
| After one additional read         | No                                                          |
| After identical cached reread     | No                                                          |

The remaining stub says `583 chars, no entity ids`; even the document locator is lost for this payload shape. This closely matches the reported title-only/anchor loop. Existing worker tests explicitly assert that older result bodies disappear; they validate the optimization, not continued answerability.

**Historical attribution:** The source mechanism is reproduced, not hypothetical. Its contribution to these worker turns is strongly supported by the matching sequence, but the exact deployed worker revision and final wire payload have not been captured. Do not claim this proves every hallucination's sole cause. The acting/final model also failed to state its missing evidence honestly.

**Smallest fix:** Retain successful, task-relevant evidence for the current turn; initially remove this destructive supersession for project/task/document results. Keep memoization of database work, but return the full cached payload when reread. Optimize later using a source-backed evidence store that retains requested fields, exact quotations, source IDs and freshness. Avoid replacing source evidence with the model's own prose.

**Regression:** Real continuation builder: read overview, Audience and CTA; run six unrelated reads; repeat a section; force final response. Assert exact facts still exist in the outgoing request, and that the resulting answer matches them. Cover model/provider fallback between passes. Record only hashes, lengths and relevant QA fields for diagnosis.

Sources: [request builder](/Users/djwayne/buildos-platform/apps/worker/src/workers/agentic-chat/provider/request-builders.ts:244), [repeat-read handling](/Users/djwayne/buildos-platform/apps/worker/src/workers/agentic-chat/provider/request-builders.ts:344), [existing body-removal test](/Users/djwayne/buildos-platform/apps/worker/tests/agenticChatTurnProvider.test.ts:10780), [executable reproduction](/Users/djwayne/buildos-platform/artifacts/agentic-chat-evidence-retention-probe-2026-09-03.ts), [reproduction output](/Users/djwayne/buildos-platform/artifacts/agentic-chat-evidence-retention-probe-2026-09-03.json).

### 2. Task writes fail at the web authorization gate

**Observed:** Both batches and the narrow correction reached `create_onto_task`/`update_onto_task`, then failed `write_execution_scope_mismatch`. A declared contract did not make execution succeed. The runtime records establish that these failures used web-v2, while successful single-task recovery used worker.

**Confirmed mechanism:** The web gate authorizes an operation using a server-commissioned tool name, a special project-create path, a strict lexical match against the latest user message, or a signed later-turn confirmation. A declared turn contract affects expected completion/materialization but does not itself authorize execution. The error nevertheless tells the model to declare a contract as a remedy.

The lexical matcher rejects fields outside its small whitelist, including `priority`, `type_key`, and `props`. It requires most values to occur literally in the user's text, which rejects generated descriptions and normalized ISO timestamps. A global negation regex also rejects an otherwise authorized task commission containing “do not create calendar events.” These conditions explain why well-bounded natural-language requests can fail; stripping fields or retrying the same tool cannot reliably repair them.

**Smallest fix:** Establish one coherent, bounded authorization path across engines. Recognize action/target/field/value authority from trusted user instructions and validated scope; apply exclusions to the excluded operation, not the entire request. If a reviewed contract is the intended authority, connect that validated authorization to execution. Do not grant broad tool-name access just because an unreviewed model declared a contract. Make repair instructions describe a path that actually works, and terminate identical rejected retries with a clear failure state.

**Regression:** Same fixed-engine prompt matrix: 1 task, 5 tasks, ISO/natural date, high priority, estimate in description, existing target by exact title, and task creation with explicit no-event constraint. Assert exact writes once and no unrelated mutation. Run both engines while both remain user-reachable.

Sources: [execution authorization](/Users/djwayne/buildos-platform/apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator/index.ts:573), [lexical commission and field/value checks](/Users/djwayne/buildos-platform/apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator/turn-security-policy.ts:273), [global negation](/Users/djwayne/buildos-platform/apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator/turn-security-policy.ts:98), [server commission assignment](/Users/djwayne/buildos-platform/apps/web/src/lib/services/agentic-chat/legacy-execution/http-stream/handler.server.ts:1767).

### 3. Document editing gets trapped before editing, then communicates the wrong terminal state

**Observed and logged:** The first edit declared corrupted/incomplete replacement content. Two reviewer revisions still contained truncation, including `Clear scope, sem̧`. The reviewer subsequently introduced a choice between Marketing Brief and Context Document. The retry contract contained the correct marketing UUID, but `harness_candidate_gate` demanded a choice between those same two entities under the vague reference “existing document.” Neither turn read or edited the document. Final prose promised action rather than showing the actual question or failure.

**Confirmed mechanism:** Reviewer instructions enumerate plausible matches for every descriptive reference. The deterministic candidate gate converts a group of two matches into clarification when only one is targeted, without independently resolving that reference against the user's explicit title and conversational antecedent. A clarification disposition goes through another tool-free model synthesis; the observed synthesis failed to preserve the terminal question. This is a harness/reviewer target-resolution problem plus final-state projection failure. The exact origin of the corrupted contract text still needs raw provider-output/length evidence; the model's “truncation” explanation alone is not proof of a context-window limit.

**Smallest fix:** Bind explicit user-selected document titles/IDs and resolved antecedents before candidate expansion. Reject spurious ambiguity when the full user request uniquely names the record; retain clarification for truly ambiguous references. For a section edit, declare the target and changed field (`content`), read the original, then construct/review the exact mutation. Do not require multiple copies of the full replacement in pre-execution control messages when the contract need only describe postconditions. Render a durable clarification question directly or deterministically enforce it in final prose. A stopped turn must say that nothing changed; it must not promise execution after termination.

**Regression:** Marketing Brief plus unrelated Context Document loaded; exact three-section edit; follow-up “complete those edits”; assert same ID, preserved sentinel and other sections, one changelog append, no artificial clarification. Separately test two genuinely matching documents and require the durable question. Test a truncated provider contract to get bounded recovery and an honest terminal state.

Sources: [reviewer reference instruction](/Users/djwayne/buildos-platform/apps/worker/src/workers/agentic-chat/provider/review/turn-contract.ts:43), [candidate gate](/Users/djwayne/buildos-platform/apps/worker/src/workers/agentic-chat/provider/review/decision-handling.ts:108), [clarification synthesis transition](/Users/djwayne/buildos-platform/apps/worker/src/workers/agentic-chat/provider/turn-provider.ts:1054), [runtime evidence](/Users/djwayne/buildos-platform/artifacts/agentic-chat-runtime-evidence-2026-09-03.md).

### 4. Date-only values and task events lack a consistent contract

**Observed:** Project start displayed a day early; cabinet due date became September 17 at 20:00 for a September 18 request; the permit task became September 15 at 19:59. An internal 30-minute due event existed despite no-event instructions.

**Confirmed code behavior:** Web task API date-only due inputs use UTC end-of-day. Shared gateway normalization only validates the date with JavaScript parsing and passes the trimmed string through, without the web path's boundary conversion or an explicit user timezone. The persisted/displayed outcomes are consistent with UTC end-of-day versus UTC midnight; retain exact write arguments and database timestamp values to establish each conversion boundary. Task creation also invokes event synchronization automatically. A due-only task creates an event ending at the due instant and starting 30 minutes earlier. That is deterministic application behavior, not evidence that the model separately called a calendar-create tool. The sync call defers calendar synchronization; actual Google delivery remains unverified.

**Smallest fix:** Decide whether a task due date is a civil date or an instant. Preserve date-only meaning explicitly, and use the user's timezone only when converting a deliberately chosen time. Share normalization across entry points. Distinguish deadline markers from booked work intervals. Expose and honor an explicit calendar-side-effect policy on task mutations, and return actual side effects in the tool receipt so chat can describe them accurately. Prompt wording alone cannot suppress a backend side effect absent a supported control.

**Regression:** Same date-only input through web, worker and UI in UTC and New York; date stays September 18. Test a timed deadline separately, including DST. With no-calendar intent, assert the defined internal-marker policy and zero external sync; with an explicitly scheduled block, assert one event and correct interval.

Sources: [web UTC date boundary](/Users/djwayne/buildos-platform/apps/web/src/routes/api/onto/shared/input-normalization.ts:32), [gateway date parser](/Users/djwayne/buildos-platform/packages/shared-agent-ops/src/gateway/op-execution-gateway.normalization.ts:202), [automatic sync](/Users/djwayne/buildos-platform/apps/web/src/routes/api/onto/tasks/create/+server.ts:422), [30-minute due specification](/Users/djwayne/buildos-platform/packages/shared-agent-ops/src/calendar/task-event-sync.ts:231).

### 5. Calendar connectivity is unresolved; error observability is demonstrably inadequate

**Observed:** Both connected sources failed twice, while final prose correctly refused to call any time verified free. No evidence establishes expired OAuth credentials, insufficient scopes, network failure, or timeout as the cause.

**Confirmed defect:** The calendar read service catches each source error and reduces it to `error`/`timeout`, discarding the original reason. The chat executor further reduces source outcomes to counts and a generic partial warning. Operators and the model cannot determine whether reconnecting is appropriate. A “completed” execution badge is not equivalent to complete calendar coverage.

**Smallest fix:** Preserve sanitized per-source error category/status and retryability in server diagnostics and tool output; never log tokens or event contents unnecessarily. Report zero successful sources as unavailable, partial success as degraded, and only verified coverage as complete. Then perform one source-specific read to identify the real provider failure before changing authentication/configuration. Use a deterministic busy-calendar fixture for collision/all-day tests while live connectivity is repaired.

Sources: [source error collapse](/Users/djwayne/buildos-platform/packages/shared-agent-ops/src/calendar/google-calendar-read.service.ts:378), [chat aggregation](/Users/djwayne/buildos-platform/apps/web/src/lib/services/agentic-chat/tools/core/executors/calendar-executor.ts:584).

### 6. Start Here substitution is a data-classification/selection integrity issue

**Observed:** Open Start Here opened the contractor note after its creation and manual fixture repair. The browser audit cannot assign this to either operation alone.

**Confirmed attribution:** The contractor-create tool arguments explicitly used `type_key: document.context.project`; the marketing brief correctly used `document.default`. The original context document also had the context type, but no `start_here_template` origin and no START HERE title/heading. Both the shared selector's fallback and project-full RPC select the newest context document in this situation. The contractor note's edit advanced its timestamp; the chat create had already introduced the wrong classification. This is model classification plus an unsafe recency-based identity rule, not proof that the fixture editor changed document type. The page's smarter selector runs only when the RPC returned no context document, which is an additional consistency risk.

**Smallest fix:** Reserve the canonical orientation role explicitly at project creation, rather than letting ordinary note classification and update recency choose it. Align selection across RPC, UI and chat. Reproduce both the actual markerless-original fixture and an explicit Start Here plus a newer note. An ordinary note create/edit must not replace either project's canonical orientation document. Repair existing QA classification separately from the prevention fix.

Sources: [RPC selection](/Users/djwayne/buildos-platform/supabase/migrations/20260715020000_project_full_v2_window_tasks.sql:440), [fallback-only selector](/Users/djwayne/buildos-platform/apps/web/src/routes/projects/[id]/+page.server.ts:315), [shared selection](/Users/djwayne/buildos-platform/packages/shared-agent-ops/src/ontology/start-here.ts:148).

### 7. Remaining model/prompt and provider issues

The hostile-source test demonstrates correct refusal to execute the quoted instructions, but incorrect source preservation. Treat the text as quoted data, preserve it exactly, and separate a warning from stored content. Add an exact-preservation round trip; do not weaken the untrusted-content boundary.

The fresh retrieval's terminal failure is logged as `provider_forced_synthesis_failed`: the provider emitted tool calls while `tool_choice=none`, following an earlier recovered 429. Fixing evidence retention should reduce needless rounds, but it does not excuse this protocol failure. Test forced finalization with the actual model/provider route; allow a bounded validated fallback or produce an honest partial answer from retained evidence. Do not replay side-effecting tools during synthesis recovery.

**A real tool-reachability gap also exists.** The audited global surface lacked `get_onto_task_details`; `global_basic` source likewise omits it. Worker production tools are restricted to the admitted surface, continuations retain that same surface, and its host policy deliberately strips hints for unavailable follow-up tools. Thus the raw search ledger's `materialized_tools` does not mean the worker could call task detail. Do not blame the model for failing to call a tool unavailable to it. Admit required detail reads before the turn, or support a bounded, permission-checked expansion. This does not explain the invented budget/quotes: those facts were already returned by tools that were callable. No new CRUD implementation is needed, but existing detail capability needs to be reachable where the user needs it.

Sources: [global basic surface](/Users/djwayne/buildos-platform/packages/agentic-chat-runtime/src/catalog/surfaces.ts:74), [immutable worker policy](/Users/djwayne/buildos-platform/apps/worker/src/workers/agentic-chat/provider/tool-surface.ts:73), [admission filter](/Users/djwayne/buildos-platform/apps/worker/src/workers/agentic-chat/provider/tool-surface.ts:144).

After the deterministic fixes, run a small controlled model comparison using identical retained evidence and tool surface. Measure exact-source quotation, honest unknowns, use of existing read results, contract validity and final-answer protocol compliance. Change one factor at a time: current prompt/model; relevant-only prompt/current model; same prompt/alternative model. Keep successful ambiguity and injection boundaries in the test set.

## Order of work and release checks

| Order | Owner layer                     | Concrete deliverable                                                               | Required proof                                                                                                                          |
| ----- | ------------------------------- | ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | Worker orchestration            | Retain current-turn evidence; full cached rereads; admit needed detail reads       | Exact quote/date/budget survive continuation and forced finalization; global task detail is callable; fresh/status browser replays pass |
| 2     | Web/runtime authorization       | Consistent bounded write authority and truthful repair path                        | Both fixed-engine batch/update cases persist exactly; exclusion and injection cases remain safe                                         |
| 3     | Worker reviewer + terminal UI   | Correct explicit-target resolution; deterministic clarification/failure projection | Three-section edit persists; real ambiguity asks; stopped turn makes no future promise                                                  |
| 4     | Shared data/API + calendar      | One date-only meaning; explicit event side effects                                 | Cross-entry-point dates match; no unintended booking/sync                                                                               |
| 5     | Calendar integration            | Sanitized source errors and restored reads                                         | Each source independently succeeds or yields an actionable reason; collision fixture passes                                             |
| 6     | Document model/RPC              | Canonical Start Here selection                                                     | Ordinary note create/edit cannot replace explicit orientation document                                                                  |
| 7     | Prompt routing + model/provider | Remove irrelevant skills; evidence/protocol evaluation                             | Grounded outputs and bounded recovery on fixed versions, without weakening safety boundaries                                            |

Before calling the system improved, rerun the original user prompts in fresh sessions on a pinned engine/build, then repeat the integrated browser workflow. Save both raw tool receipts and the corresponding outgoing model evidence for synthetic QA data. A unit-test total or a single narrow corrective reread is not sufficient acceptance evidence.

The retained implementation-free artifacts make the first fix reviewable now: an exact-source, zero-network reproduction of evidence being removed and failing to return on reread. The historical worker revision, exact final provider wire payload, and provider-specific calendar failure reason remain material evidence gaps. Stored project dates also include UTC boundaries while its overview read returned null dates; add read-projection parity to the date regression rather than relying solely on display tests.
