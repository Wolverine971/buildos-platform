<!-- artifacts/agentic-chat-meeting-notes-177eaae4-investigation-2026-09-07.md -->

# Focused document and web lookup failure — September 7, 2026

Session: `177eaae4-3da0-4be5-aef1-daa005411e09`  
Turn: `bfa823cd-04f3-4898-aeec-664e1382a692`

The document was loaded, but the prompt mislabeled its completeness and encouraged additional reads. Those reads then activated a blanket outbound-request restriction. The first web lookup hit that restriction before execution, and the worker treated the known rejection as a fatal streaming error.

## Evidence

- The supplied audit's initial `raw/prompt_snapshots.json` contains the focused document in `context_payload.data.focus_entity_full` and in the rendered focus section. The project and document IDs were correct.
- The loader measured the original body as 155 characters, trimmed it to 127 characters for `content_preview`, and the renderer inferred that the remaining 28 characters were missing content. They were trailing whitespace. Its instruction was: `first 127 of 155 chars; use read_document_section for the rest`.
- The model called `get_onto_document_details`, then `read_document_section` for `domain-names`. Both succeeded. The section read returned only the heading.
- Three `web_search` announcements followed. None has a `tool_result` or a `chat_tool_executions` row in the audit. All three LLM requests succeeded; this was not a recorded LLM/provider failure.
- A read-only query of the production `chat_turn_runs` row confirmed `status=failed`, `finished_reason=error`, and **`failure_code=read_tool_egress_blocked_private_content`**.
- At the time of the incident, the worker adapter rejected all egress after a workspace-content read, before invoking the external research port. It also independently requires a search query to match one explicit query in the current user message. Removing the redundant reads alone would therefore not make these inferred searches executable.
- The UI-to-timeline adapter converted every activity whose status was not `failed` into `success: true`. This is why pending web announcements appeared as completed in the support packet.
- The admin endpoint and compact export omitted `failure_code`, leaving only the generic streaming error in the supplied audit.

## Additional prompt conflicts

- The worker prompt advised searching workspace content first, then doing concurrent external searches and visiting discovered URLs. Those instructions contradicted the execution policy.
- Admission sets the review-delegation situation whenever `delegate_task` is available. Its text then asserted that the user had commissioned a reviewed handoff, even for this brainstorming message, and demanded additional entity reads.
- A cold-email outreach skill was preloaded for a website/client-discovery conversation about optional email capture. This mismatch is confirmed in the snapshot. The craft-skill explicit-ask gate treated generic email language plus a request verb as sufficient. Regression cases now keep website signup/welcome-email questions out of cold-outreach preloads while preserving explicit cold-email requests. This was not the terminal failure.

## Local changes implemented

1. Preserve exact focused-document content, including whitespace and empty documents, up to 16,000 characters. Carry an explicit `content_truncated` flag. Longer documents retain a bounded excerpt with an accurate length and retrieval guidance.
2. Preserve that body and completeness flag through prepared-prompt compaction. Increment the materialized/session context-cache version so old previews are not reused as current context.
3. Render complete focused documents as already loaded and direct the model to reuse them. Additional reads are for omitted information or a needed refresh.
4. Persist known egress denials and failed web lookups as failed tool receipts, then continue the answer with loaded context and any successful research. Timeouts, missing configuration, invalid results, and unavailable research review are recoverable web failures. Cancellation, ownership fencing, persistence failures, and unrelated read failures retain their existing handling.
5. Preserve pending/running/cancelled/failed activity status in the timeline rather than inventing completion.
6. Include terminal failure codes in admin session payloads and readable/raw audit exports.
7. Restore ordinary inferred public research after workspace reads. Exact explicitly requested queries take a deterministic fast path; other queries and domain filters receive an automatic isolated semantic check against user conversation. The checker receives no workspace body, assistant/tool history, or acting-model system prompt. It uses the configured reviewer client with separately identified usage logs. Identical review decisions are memoized within a turn; independent checks can run concurrently.
8. Normalize outbound search arguments to a bounded query and at most five domain filters, with server settings of advanced search, four results, and no generated answer. Extra arguments are discarded. The reviewer authorizes the exact normalized payload that is dispatched.
9. Permit visits to multiple user-supplied URLs and exact URLs returned by successful searches in this turn. Reuse the existing URL capability ledger; fetched page prose does not mint new URL permissions. The existing public-network-only fetcher, DNS checks, redirect checks, and credential rejection remain in place.
10. Align the worker prompt and tool catalog with this research behavior, including explicit visits for full page evidence. Describe Agent Run delegation conditionally. Do not preload a cold-email playbook for generic email capture or newsletter signup.

## Validation

- 435 tests passed across 19 targeted files in the final research-fix validation, including focused context loading/caching, prompt assembly, timeline state, audit exports, skill selection, tool catalogs, worker execution/persistence, provider streaming, egress authorization, and SSRF-safe fetching.
- Worker TypeScript typecheck and the shared agentic-chat-runtime build passed. `git diff --check` passed.
- Regression cases cover exact trailing whitespace, document bodies beyond the old 1,200/1,500-character limits, empty documents, genuine truncation, document reads followed by three public searches and a result visit, mixed success/failure batches, malformed reviewer responses, hung reviews, and query/domain/URL leakage attempts.
- Live replay with the configured default reviewer (`openai/gpt-5.6-luna`) passed all seven semantic cases: four public queries/domain-filter cases approved and three synthetic private-data/instruction-injection attempts denied. Measured review latency was 1.4–2.2 seconds per call; independent calls can run concurrently.
- The live worker adapter then searched Mailchimp with a private document read already scheduled for the turn, returned four real public URLs, and fetched 6,000 characters from a returned page. Both checks passed. See [live replay results](./agentic-chat-research-live-replay-2026-09-07.json).
- The first live attempt was blocked by the local execution sandbox's network restriction; the authorized network-enabled replay passed. This is separate from the application defect in the incident.
- No production data was modified and no deployment was performed. These are local code changes, validated against real external services plus deterministic regression fixtures.

## Boundaries and deployment

The blanket restriction was trying to prevent private-context exfiltration through queries and model-selected URLs. It was not a general network outage, and it made normal document-backed research impossible. The replacement checks the actual outbound request and allows the required research workflow.

Semantic review is a probabilistic defense, not a proof that private data can never leak. The structural protections remain useful independently: no workspace body in the review prompt, bounded/normalized outbound fields, URLs grounded in server-observed search results, and public-network-only HTTP fetching. The live adversarial sample is deliberately small and should become a maintained evaluation set.

The existing Gmail query/taint policy is unchanged; this fix restores public web research. Search-result URL permissions are scoped to the current user and turn. Private facts mentioned only in workspace documents are not sufficient authority for arbitrary external queries. The first release should monitor denied-search rates and reviewer latency for legitimate follow-up research.

Focused document bodies are loaded exactly up to 16,000 characters. Larger documents have explicit truncation metadata and targeted retrieval guidance. The small incident document is fully loaded and no longer falsely advertises missing text.

Deploy the web app and dedicated chat worker with the updated shared runtime together. Fresh prepared context will use cache version 3. Then replay the original focused-document conversation in the deployed UI and verify that the initial prompt contains the full document, no redundant document read is encouraged, search results are shown only after execution succeeds, and partial research failures leave a usable reply.
