<!-- docs/technical/reviews/agentic-chat-turn-executor-audit-2026-09-02/evidence/evidence-notes.md -->

<!-- doc-status: point-in-time -->

# Production evidence notes (pulled 2026-09-02, read-only service-role queries)

Window: 14 days (since 2026-08-19T18:51Z). Tables: chat_turn_runs, llm_usage_logs, chat_tool_executions, chat_turn_events, chat_prompt_snapshots, agentic_chat_execution_observations.

## Traffic composition

- 296 turns, 4 users. 208 = agentic-e2e-harness (20 distinct messages, repeated), 83 = DJ, 5 = two other accounts.
- 261 worker_realtime, 35 legacy_sse. Contexts: project 223, global 62, project_create 11.
- So "production" telemetry is ~70% synthetic battery traffic. DJ is the only organic user of note.

## Outcomes

- Status: 260 completed, 34 failed, 2 cancelled. Worker slice: 227/261 completed, 34 failed (13%).
- DJ worker turns since 08-28 noon (post read-default ship): 31 turns, 7 failed (23%). Median 32s, p90 70s, 3 calls median, $0.0031 median.
- Harness since 08-28: 49 turns, 3 failed. Median 18.8s, 3 calls, $0.0018.
- Failure codes (worker, 14d): provider_tool_not_allowlisted 9 (all ≤08-28 04:52), internal_cohort_rejected 8 (08-20/21; string not in codebase anymore), provider_tool_finish_reason_invalid 3 (DJ, 08-30/31), provider_forced_synthesis_failed 2, read_tool_execution_failed 2, provider_tool_arguments_invalid 2, permanent 2, timeout_post_start 1 (493s semantic-discovery smoke), provider_round_budget_exceeded 1, provider_tool_validation_repair_exhausted 1, provider_stream_error 1, stale_context 1, unknown 1.
- `llm_pass_count` column is 0 for 220/261 worker turns: worker never writes it (grep confirms no reference in apps/worker/src). Dead telemetry column; real pass counts only in llm_usage_logs.

## Latency (timing event phases, 43 completed worker turns since 08-28)

- total_request_ms p50 20.8s, p90 70.3s
- queue_wait p50 0.33s; worker_start_to_provider_authority p50 0.45s; provider_authority_to_finish p50 19.4s (93% of total), p90 68.6s
- response_generation (model gen) p50 12.1s, p90 47.4s → ~7s p50 of non-model time inside the loop (tool exec + validation + durable fences)
- time_to_first_response p50 6.0s (lead-in text lands ~6s after admission)
- provider_finish_to_terminal p50 0.49s (WP-1 serial-delivery defect is gone)
- Model call latency: DeepInfra p50 3.9s/p90 11s; Alibaba p50 3.3s/p90 12.8s; OpenAI (reviewer) p50 3.6s/p90 8.1s; Azure (reviewer) p50 5.4s/p90 11.6s, but two reviewer calls on 08-28 took 73,030ms and 63,679ms (turn 67015082 "push the beta list email thing to friday": 190s total, 137s in two reviewer calls).

## Cost and tokens

- 1,516 model calls; per turn p50 4 calls, p90 10, max 19. Prompt tokens per turn p50 42.9k, p90 155.7k, max 445k. Cost per turn p50 $0.0052, p90 $0.021, max $0.055. Total $2.42 for 14 days.
- Worker spend by route (14d): acting DeepSeek v4 flash 1,037 calls $0.90 (48% cached on DeepInfra, 50% Alibaba, 8% DigitalOcean); semantic reviewer GPT-5.6-luna 350 calls $1.30 (0% cached on OpenAI and Azure). Reviewer = 59% of worker spend over 14d.
- Post-08-28: acting 165 calls $0.181 (46% cached); reviewer 20 calls on 8/49 turns $0.056 (24% of spend), avg 9.5k prompt tokens/call, 0% cached, p50 5.3s.
- Reviewer model selection: bootstrap.ts `buildAgenticChatSemanticReviewerRoutes` hardcodes GPT_56_LUNA_MODEL first; the config.ts comment still says "Gemini semantic reviewer" (stale).
- Provider pin: within-turn the pin can switch providers on a 429 (Theo Von turn: DeepInfra → openrouter 429 → Alibaba `deepseek-v4-flash-20260423`, a different model snapshot, pinned for remaining rounds; cache reset).
- Costliest 25 turns are all the harness "This project's documents are a mess" organize scenario: 12–19 calls, 22–34 tool calls, 11–16 rounds, 104–188s, $0.027–$0.055, 200k–445k prompt tokens each.

## Tool executions (1,807 rows, 14d; split at 08-28)

- Control/reviewer share of all tool executions: 38.7% before 08-28 → 22.3% after.
- declare_turn_contract: 200 (40 failed = 20%) before → 32 (5 failed = 16%) after. request_proposal_revision 50 → 13.
- declare_read_only_turn 58 → 2; approve_read_only_turn_review 54 → 1 (retired control still fired twice after the ship; d41d9e86 shows the REVIEWER calling it).
- Reads: get_document_outline 215→67, read_document_section 208→65 (outline+section pair = 42% of all post-ship tool executions), get_project_overview 40→23, list_onto_tasks 12→16, search_all_projects 5→15, explore_project 0→9 (new semantic discovery), get_workspace_overview 7→9.
- Writes post-ship: create_onto_task 13, update_onto_task 12, move_document_in_tree 6, create_onto_document 4, create_onto_project 4, create_onto_goal 3, create_calendar_event 2 (1 failed), delegate_task 10 (6 FAILED = 60%), skill_load 4 (2 failed), skill_search 2, update_onto_document 0.
- Never/rarely called in 14d: change_chat_context 0 (mounted on every surface, 1,479 chars), cancel_turn_contract 0 (768 chars, mounted everywhere), domain_search 1, list_onto_goals/plans/risks/milestones 1 each, get_onto_task_details 5, list_onto_documents 1.

## Prompt snapshots (12 of DJ's worker turns, 08-30 → 09-01)

- Global (global_basic): system prompt 12,372 chars (~3.1k tokens); 8 tools = 9,297 chars (~2.3k tokens); + 581-char batching system message inserted after history. Static prefix (identity, capabilities, strategy, final_response_contract, safety) = 5,231 chars ≈ 1,310 tokens; everything after is dynamic. approx 3.2k prompt tokens on pass 1.
- Project (17–18 tools): system prompt 16.5k–23.5k chars; tools 23.2k–25.4k chars (~6k tokens); + three runtime system messages after history: 767/782-char "Worker execution surface override", 4,677-char "Worker write routing" rules, 581-char batching. approx 5.9k–9.2k tokens pass 1.
- Sections (project, f1bf2f4e "where are we at with this book?"): identity 602, capabilities 1,035, strategy 653, final_response_contract 1,330, safety 1,611, tool_surface 475, active_domain_signals 6,227 (!), situational_rules 808, project_start_here 3,147 (truncated at 2,400 body chars; Decisions/Current state/Open questions sections cut), focus 760, loaded_context JSON 4,127, knowledge_map 682, timeline 1,146, inventory 237.
- Live defects visible in that snapshot:
    - Domain sensing preloaded `story_driven_content_craft` (blog/video marketing playbook: dopamine ladder, seven-mistake reject pass) for a status question about a novel, with "Apply its workflow directly to this turn's work." 1,557 tokens. F7 still live.
    - situational_rules writeIntent=true for a pure question (situational-rules.ts:98: `Boolean(params.turnIntentRequiresWrite) || writeToolsMounted`) → "Rules for This Turn: This turn can write" + the 4,677-char write-routing message mounted on every project turn.
    - System prompt "Current Tool Surface" lists `declare_turn_contract` as preloaded; the worker override message says the callable set excludes it. Two contradictory tool lists in one prompt.
    - Prompt references `skill_load`, `outcome_card_load`, "See the task_management skill", "See the document_workspace skill", "Active Domain Signals" (absent in global) — none callable on the worker surface.
    - START HERE appears 4× (Start Here section, entity_refs JSON, Knowledge Map, Recent changes). Members entity_ref has the UUID as its title. F10 still live.
    - Loaded context JSON is a truncated list (6 of 9 plans, 6 of 8 tasks) with no descriptions; the model then reads the doc outline+section to answer "where are we at" (2 rounds).
    - `capabilities.*` identifier line (G1 in prior audit) still present.

## Case studies

1. **Truncation kills complex writes (P0).** DJ turns 83a0a7fc, 41271a44 (08-31), b1c37abe (08-30): "stage the proposal / per-entity change set". Final acting call on Alibaba returns completion_tokens = 2001 exactly (reasoning 189–831 inside), tool calls present, finish_reason ≠ tool_calls → stream-tool-calls.ts:176 throws provider_tool_finish_reason_invalid ('unknown') → turn fails "An error occurred while streaming." Client sends max_tokens 4000 (openrouter-client.ts:46), so the ≥maxTokens 'length' correction (line 538) never fires. Alibaba's advertised max_completion is 393k, so this is an endpoint quirk; the harness fails permanently instead of retrying on another provider. 3/3 of DJ's complex proposal requests died this way. No provider_attempt_ended observation is written for the failing attempt (telemetry gap).
2. **Read loop with no read tool (P0 UX).** DJ turn 3cd50ea6 (09-01, global): "Do I already have something ready for me to send to Theo Von?" Model found the task and the document (1d2d2315) on round 1, then issued 7 more search_all_projects/explore_project calls with paraphrased queries because global_basic mounts no document read tool (surfaces.ts:68–78) and it never used change_chat_context. Prompt grew 6.4k → 26.7k tokens; round 6 hit a 429 and switched provider/model snapshot; the read-loop repair forced synthesis and that failed. 60s, 11 calls, $0.021, user got a generic error. The same question in project context (093fe2e2) succeeded in 51.7s with 11 calls.
3. **Contract convergence + reviewer confusion (fixed since? verify).** Harness turn d41d9e86 (08-28 04:52): acting model declared a two-target contract 3× despite two request_proposal_revision results naming the single correct target; then the reviewer (decided_by: contract_reviewer) called `declare_read_only_turn` with reason "This turn asks for semantic review of a proposed contract… it does not commission execution" — it mistook its own review prompt for the user's request — and the turn died with provider_tool_not_allowlisted. Last not_allowlisted failure in the window; tasker 70 fixes landed later that day.
4. **Reviewer tail latency.** Turn 67015082 (08-28 22:45, "push the beta list email thing to friday"): 7 calls, 190s; contract_review on Azure 73.0s, mutation_review on Azure 63.7s; acting calls 1.9–18s. The reviewer alone was 72% of the turn.
5. **delegate_task 60% failure** post-ship (6/10), with DJ's own messages "Retry delegate_task once now that the backend type mismatch is repaired" — a live contract mismatch DJ was debugging by hand in chat.

## Cache

- Reviewer requests: 0% cached on OpenAI and Azure across 350 calls (avg 12.9k prompt tokens each). Acting on DeepInfra 48%, Alibaba 50%, DigitalOcean 8%, Sail 51%.
- `prompt_cache_key: sessionId` is sent; OpenAI caching needs a stable ≥1024-token prefix — the reviewer prompt likely leads with per-turn material (check request-builders / review/turn-contract.ts).
- prepared_prompt_hit false for 262/296 turns (miss reasons: missing_key 11, stale_harness 8, expired 1; 242 turns have null surface profile). Prewarm true only 19/296.
