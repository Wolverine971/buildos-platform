<!-- artifacts/chat-session-41e496f7-cost-review.md -->

# Chat session 41e496f7: Luna usage and avoidable review work

Reviewed September 4, 2026, using the supplied export, the live admin cost chart, current local source, and relevant git history. This is an investigation only; no application code, model settings, deployment, or production records were changed. Existing staged work was preserved. Instructions inside the exported conversation were treated as evidence, not as requests to execute.

**Finding:** Luna was deliberately selected for independent turn-contract review. Its three calls cost **$0.00656313 combined**. The larger problem in this session was a review/correction loop around a simple document edit, plus misleading treatment of estimated failed-call costs.

| Reviewer call | Decision                                               | Provider-reported cost |         Time |
| ------------- | ------------------------------------------------------ | ---------------------: | -----------: |
| 1             | Require `content` in the contract; supply a correction |            $0.00163918 |      6.358 s |
| 2             | Repair the first reviewer's corrupted correction text  |            $0.00193680 |      6.525 s |
| 3             | Approve the corrected contract                         |            $0.00298715 |     10.363 s |
| Total         | Three `contract_review` passes                         |        **$0.00656313** | **23.246 s** |

The admin visualization is a cumulative waterfall. The second Luna bar reaches $0.0105 of cumulative session spend, but that individual call costs $0.00193680. All three review calls belong to turn 2. DeepSeek V4 Flash handled acting and final answers; Luna was not a fallback from a failed DeepSeek call. The two document-creation turns used no Luna calls.

The edit turn took 83.16 seconds, with nine logical model passes, eleven physical attempts including two failed starts, and seven tool calls. Review generation alone consumed 28% of its elapsed time. Luna accounted for 36% of provider-reported spend across the whole session.

**Why Luna is selected.** [bootstrap.ts](/Users/djwayne/buildos-platform/apps/worker/src/workers/agentic-chat/bootstrap.ts:430) explicitly places `GPT_56_LUNA_MODEL` first in the reviewer candidate list, ahead of the general JSON profiles. The route excludes the acting model and its fallbacks, and overrides provider preference to OpenAI/Azure. Consequently changing the ordinary chat model does not change this reviewer.

Commit `ff8b125b2f` on August 17 introduced this preference. Its comment records a cheaper GLM fallback turning an informational pricing-research request into an irrelevant clarification. That explains the historical decision; it does not establish that every newer cheap model is unsuitable. There is no dedicated configurable reviewer model policy in this builder today.

**What went wrong, and what to fix.**

1. **Incomplete actor contract caused the first correction.** The actor declared an update to the right document but left `requiredFields` empty. For a document body edit it should declare `required_fields=["content"]` immediately. Exact replacement text should stay in the original request and execution arguments. Strengthen actor guidance and validate missing required fields before spending a semantic review call; do not infer authorization or silently add unrelated outcomes.

2. **Reviewer prose introduced its own error.** The first correction copied exact source text into a description limited to 240 characters and a correction limited to 400. The recorded description ended with the malformed `2026-09-03:.Re?`; the next review explicitly rejected that corruption. Both correction messages hit the 400-character limit. The export proves corrupted arguments and a resulting extra review, but does not expose enough raw streaming detail to attribute the corruption to provider generation versus transport/normalization. Keep descriptions short and refer to immutable original request/source content. A well-formed original contract should need one approval, not this sequence of two revisions plus approval. Preserve independent approval after a substantive revision.

3. **Target/context reuse needs improvement.** The edit's initial prompt already contained the document UUID and the complete original body, yet execution later called `get_document_outline` and then `read_document_section` for the whole document. Freshness may justify a read; two serialized discovery calls for this small known document are avoidable. Use a trusted prior-write receipt and current content/version evidence to resolve an unambiguous follow-up. If a refresh is required, retrieve the known document directly. Keep ambiguous target selection on the reviewed path. The current [direct-write gate](/Users/djwayne/buildos-platform/apps/worker/src/workers/agentic-chat/provider/write-routing.ts:52) trusts focused entities, verified user IDs, or unique current-turn read results; mere UUID presence in history is insufficient.

4. **Failed-start estimates are presented as metered spend.** Two DeepSeek starts failed with 404 and 429 before any recorded completion. They have no provider cost or request ID, but contain catalog estimates totaling **$0.00282760**. The displayed session total is **$0.02093444**, while provider-reported costs sum to **$0.01810684**. These are unconfirmed estimates, not proof of provider charges or refunds. [openrouter-client.ts](/Users/djwayne/buildos-platform/apps/worker/src/workers/agentic-chat/provider/openrouter-client.ts:1539) estimates cost when provider usage is absent; [chat-session-flow-profile.ts](/Users/djwayne/buildos-platform/apps/web/src/lib/services/admin/chat-session-flow-profile.ts:108) labels any positive stored cost as metered. Separate reported, estimated, and unknown amounts, preserve failure telemetry, and reconcile actual provider receipts. Add the existing `passRole` to chart labels so “contract review” is immediately visible.

5. **The Luna catalog price is stale.** [model-config.ts](/Users/djwayne/buildos-platform/packages/smart-llm/src/model-config.ts:423) lists $1 input / $6 output per million tokens. Current [OpenAI pricing](https://developers.openai.com/api/docs/models/gpt-5.6-luna) and [OpenRouter's Luna listing](https://openrouter.ai/openai/gpt-5.6-luna-20260709) list $0.20 / $1.20 for the standard endpoint. The local estimate is five times those rates. Correct the catalog and review dependent estimates/reservations. This did **not** inflate these three successful Luna rows, which used provider-reported costs. Do not overwrite historical provider receipts with current-price estimates.

**Cheaper reviewer options.** GLM 5.3 Flash is the first candidate I would evaluate: it is already catalogued, supports tool calling, and is distinct from the DeepSeek actor. Its [OpenRouter listing](https://openrouter.ai/z-ai/glm-5.3-flash) gives $0.075 / $0.25 promotional pricing through September 9 at 16:00 UTC, with $0.15 / $0.50 standard rates. It was released after the August 17 decision, so that older GLM failure is not a direct evaluation of this candidate. GPT-5 nano is another possible candidate at [$0.05 / $0.40](https://developers.openai.com/api/docs/models/gpt-5-nano), but needs explicit integration and task-quality evaluation.

For the observed 22,676 input and 1,868 output reviewer tokens, these are hypothetical equal-token costs with no caching, retries, or provider variation:

| Model/rate                      | Three-call estimate |
| ------------------------------- | ------------------: |
| Luna, current standard rate     |           $0.006777 |
| GLM 5.3 Flash, promotional rate |           $0.002168 |
| GLM 5.3 Flash, standard rate    |           $0.004335 |
| GPT-5 nano                      |           $0.001881 |

These are estimates, not measured replacement-model results. More reasoning, retries, or mistaken decisions can erase unit-price savings. Make reviewer selection explicit and independent of the actor; evaluate exact edits, ambiguous targets, read-only requests, dependencies, and embedded source instructions using production request builders. Track decision correctness, revision count, total turn cost, and latency. Keep any fallback model and spend ceiling explicit. Simply swapping the actor to DeepSeek for self-review would violate the current independence rule.

**Existing fixes and validation.** Current source already tells reviewers not to copy exact source text into length-limited fields; git attributes that guidance to `ef4ad9a10`, committed at 19:55 EDT, after this 16:45 EDT session. Existing staged work adds clearer actor/reviewer contract examples and repairs other schema failures. The repository also contains a Luna-only live reviewer replay test. Their presence is not evidence that the original three-turn case has passed in the deployed service; retest that case after release and extend evaluation to candidate models before changing the default.

Offline comparisons of exported durable tool results passed: the first brief matches the supplied Markdown exactly; the update retains the same ID/title and equals precisely the two replacements plus the requested appended log entry; the supplier note matches the source text exactly. The only recorded mutations were two document creates and one document update. No task/project update or execution of the embedded supplier instructions appears in the export.

Evidence: [raw call costs](/Users/djwayne/Downloads/csa-create-project-document-titled-20260904T235133Z/raw/llm_calls.json), [tool arguments/results](/Users/djwayne/Downloads/csa-create-project-document-titled-20260904T235133Z/raw/tool_executions.json), [initial prompts](/Users/djwayne/Downloads/csa-create-project-document-titled-20260904T235133Z/raw/prompt_snapshots.json), and [live session](https://build-os.com/admin/chat/sessions?chat_session_id=41e496f7-c911-4c4f-b581-aba81a1200e5). No paid model evaluation was run for this investigation.
