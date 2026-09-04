<!-- artifacts/agentic-chat-runtime-evidence-2026-09-03.md -->

# Scoped runtime evidence for the Cedar House QA diagnosis

Read-only diagnostic extraction on 2026-09-03. Scope: the four QA chat sessions linked in the original audit. This file intentionally excludes full system prompts, general workspace context, account details, and unrelated project records. No database changes. Source tables: chat_turn_runs, chat_tool_executions, chat_prompt_snapshots, chat_turn_events, llm_usage_logs.

Source checkout inspected: b4d4c107dcc5341a39a591dc9972fa87400f93a9. No tracked implementation edits were present at inspection time. The deployed worker revision has not been established; distinguish source mechanism from historical deployment proof.

## Route and model evidence

This was a mixed web-v2/worker run, so single-task versus batch success is not a controlled comparison.

| Turn ID                              | Logged operation route     | Finish reason        | Tool calls | Models on successful logged passes                              |
| ------------------------------------ | -------------------------- | -------------------- | ---------: | --------------------------------------------------------------- |
| 2778b1a2-acef-446d-b795-da006f94e812 | agentic_chat_v2_stream     | stop                 |         14 | google/gemini-3.7-flash                                         |
| 2b878f38-ee6a-4a4a-a6c5-73bc313c495e | agentic_chat_worker_stream | stop                 |          1 | deepseek/deepseek-v4-flash                                      |
| c57530d7-e251-41d8-ab45-1fbeb52a4110 | agentic_chat_v2_stream     | mutation_unfulfilled |          5 | google/gemini-3.7-flash                                         |
| 734aa3dd-8d03-453a-aa86-b803b6b715cb | agentic_chat_worker_stream | stop                 |          4 | deepseek/deepseek-v4-flash, openai/gpt-5.6-luna                 |
| 92d46257-d1fc-45ab-ad6e-7844451cea35 | agentic_chat_worker_stream | stop                 |          1 | deepseek/deepseek-v4-flash                                      |
| 7d547888-5bea-429d-86ee-970d4f980cd0 | agentic_chat_v2_stream     | stop                 |          5 | deepseek/deepseek-v4-flash, deepseek/deepseek-v4-flash-20260423 |
| d1138b88-71dd-47cc-9046-0351892a8556 | agentic_chat_worker_stream | stop                 |          2 | deepseek/deepseek-v4-flash, openai/gpt-5.6-luna                 |
| 3329d98f-d4ee-4aaf-b957-a48a2e5c3edf | agentic_chat_worker_stream | error                |         15 | deepseek/deepseek-v4-flash, deepseek/deepseek-v4-flash-20260423 |
| cbd55cc6-50aa-4a79-9ba1-8a9707757ec0 | agentic_chat_worker_stream | stop                 |         18 | deepseek/deepseek-v4-flash                                      |
| 2bace010-1bdd-4c7e-bb3c-c5d91f9609d5 | agentic_chat_worker_stream | stop                 |          3 | deepseek/deepseek-v4-flash                                      |

All selected snapshots use lite_seed_v1. Project turns use project_write_document; global retrieval turns use global_basic.

## Rejected writes

Five-task batch 2778b1a2 includes a rejected create_onto_task with:

- title: QA — Confirm permit requirements
- due_at: 2026-09-15T23:59:59-04:00
- priority: 2; type_key: task.research; state_key: todo
- props.estimated_duration_minutes: 60
- project_id: 9ea4700f-4bda-43c5-9b38-32df75bb9fc0
- description: Estimated duration: 60 minutes. Confirm permit requirements for renovation.

Later retry with only that exact title and project_id was also rejected. Eleven create calls failed in this turn. A declare_turn_contract result was declared, but declarations did not grant execution.

Narrow task update 7d547888 rejected arguments:

```json
{
	"due_at": "2026-09-22",
	"task_id": "719e9a80-586e-49e1-a6a4-40d51622001e",
	"description": "Allow 120 minutes. Depends on QA — Confirm permit requirements."
}
```

An identical retry was supervisor-blocked. Adding project_id still failed. A later cancel/redeclare did not lead to an executed write.

Common error: "Write tool [name] was not authorized for execution. No write executed. Declare a bounded turn contract that names this exact operation, use a server-commissioned tool, or present the operation for user review."

The web batch initially hit a 60,000ms DeepSeek timeout and subsequently used Gemini. Do not diagnose the observed write rejection as missing CRUD tools: create_onto_task and update_onto_task were both in its captured tool definitions.

## Document-edit contract/reviewer failures

Turn 734aa3dd:

- Initial contract content was incomplete/corrupted.
- Two request_proposal_revision records carried corrected contracts that were themselves still truncated, including the fragment "Clear scope, sem̧".
- The final reviewer clarification asked whether the target was the Marketing Brief or Context Document, despite the explicit marketing title and ID in the requested contract.
- No document read or update was executed.
- Final user-visible text promised to fix/declare rather than surfacing the actual unresolved question.

Turn d1138b88:

- declare_turn_contract targeted 1d651834-5dee-4e08-9f62-3072c2e61f4d.
- request_turn_clarification returned decided_by=harness_candidate_gate.
- Reason: two loaded entities plausibly matched "existing document"; candidates were Marketing Brief and Context Document.
- No document read/update; final prose again promised action.

Snapshot context also loaded unrelated workflow playbooks for these narrow edits:

- First edit: content_strategy_beyond_blogging.
- Retry: story_driven_content_craft.
  These are relevance/routing problems, not proof by themselves of the failed edit's cause.

## Fresh-read failure

Turn 3329d98f:

- Eight tool rounds, 15 tools, no successful final answer.
- Provider telemetry includes a recovered 429 and "Agentic Chat provider requested tool calls while tool_choice=none".
- Terminal event: status=failed; failure_code=provider_forced_synthesis_failed.
- Successful outline result had seven headings; first audience result already contained the correct saved string.

## Owner-status grounding failure

Turn cbd55cc6 read 18 tools in this order (zero-based):
0 marketing outline; 1 contractor outline; 2 project overview; 3 CTA; 4 Audience; 5 full marketing brief; 6 contractor section; 7 cabinet search; 8 permit search; 9 contingency search; 10 budget search; 11 invalid contractor anchor; 12 full context doc; 13 memo-served contractor read; 14 context outline; 15 initial task section; 16 detail index; 17 initial goals section.

Relevant ledger result sizes, JSON.stringify representation:

- Project overview: 4,280 characters.
- CTA section: 323.
- Audience section: 317.
- Full marketing brief: 943.

The overview contains both task due_at fields near the start, and the project description contains the $85,000 cap and $10,000 contingency. Full marketing brief also contains both amounts. This makes missing source records an incorrect explanation for the answer.

Exact section result contents:

```json
{"anchor":"audience","content":"## Audience\nLocal homeowners considering a kitchen renovation.","document_id":"1d651834-5dee-4e08-9f62-3072c2e61f4d"}
{"anchor":"call-to-action","content":"## Call to action\nBook a 20-minute discovery call.","document_id":"1d651834-5dee-4e08-9f62-3072c2e61f4d"}
```

Task searches returned materialized_tools=[get_onto_task_details,list_task_documents]. Budget searches returned get_onto_document_details/get_onto_project_details among materialized tools. The agent did not call these detail tools. Initial global surface lacked task details. These raw ledger hints do not establish that the tools became callable: the current worker request builder explicitly keeps request.tools immutable between passes and filters result hints against that set (request-builders.ts around lines 400–438). Tool reachability must be checked at the provider boundary, not inferred from the ledger's materialized_tools field.

Because the exact quotes were at indices 3–5, under 1,600 characters and inside the final 16-call window, generic last-16/1,600-character synthesis clipping alone cannot explain losing these quotes. Earlier continuation rewriting remains a distinct candidate, under independent reproduction.

The captured system prompt already instructed the model to ground every statement in loaded context/tool results and to prefer a stated gap over a plausible guess. Broadly adding "do not hallucinate" would duplicate an existing instruction.

The follow-up challenge 2bace010 used only outline plus two section reads and corrected the text, admitting the previous quotations were invented. Original failure remains valid.

## Start Here classification and date evidence

Additional scoped SELECTs against the QA project establish:

- Original context document e4c0477f-0736-4a6f-a18c-ce32a72f288a: type_key=document.context.project; props.origin is null; title and first heading are the project name plus Context Document, not START HERE; updated 21:01:05 UTC.
- Marketing brief: type_key=document.default; props.origin=external_agent.
- Contractor note 70822580-e471-4203-b56c-3fbbc19d5e78: type_key=document.context.project; props.origin=external_agent; updated 21:13:51 UTC. Its chat create arguments explicitly supplied that context type. The manual fixture edit did not originate the classification.
- The shared selector filters context-type documents, prefers explicit START HERE markers, and otherwise chooses the most recently updated candidate (packages/shared-agent-ops/src/ontology/start-here.service.ts and start-here.ts:136–159). Neither context document qualifies as explicit. The note therefore wins the fallback. This supports a combined model-classification and application-selection defect; it is not evidence that the injected budget command executed.
- Project database timestamps are start_at=2026-09-14T00:00:00+00:00 and end_at=2026-11-20T23:59:59+00:00. The tested New York display of the start is the previous evening/day. The project overview tool's recorded result nevertheless returns null for its start_at/end_at fields; projection parity is an additional investigation point.

## Evidence boundaries

Captured prompt snapshots establish initial prompt/context/tool surfaces. They do not by themselves establish the exact post-compaction payload on every subsequent provider request. No unfiltered snapshot or unrelated project context is included here. Calendar provider failure details are not exposed in the audited tool results. Automatic due-event Google delivery and exact historical worker revision remain unverified.
