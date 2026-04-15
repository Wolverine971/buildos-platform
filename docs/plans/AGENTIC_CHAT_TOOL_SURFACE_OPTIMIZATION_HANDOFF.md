<!-- docs/plans/AGENTIC_CHAT_TOOL_SURFACE_OPTIMIZATION_HANDOFF.md -->

# Agentic Chat Tool Surface Optimization Handoff

Status: Ready for another agent
Date: 2026-04-14
Owner: BuildOS Agentic Chat

## Purpose

Reduce provider-side tool definition payload cost for BuildOS agentic chat,
starting with the biggest tool schemas:

- `create_onto_project`: roughly 11823 chars
- `create_onto_task`: roughly 4585 chars

These schemas are no longer duplicated inside the system prompt, but they are
still sent in the provider `tools` payload. The next optimization target is to
make preloaded tool profiles smaller while preserving the existing gateway/direct
tool flow.

## Current Baseline

The current chat path is:

```text
UI chat -> /api/agent/v2/stream
LLM provider -> OpenRouterV2Service
Tool mode -> gateway/direct tool surface
Tool schemas -> provider tools payload
Prompt text -> compact tool names only
Tool selector -> apps/web/src/lib/services/agentic-chat-v2/tool-selector.ts
Gateway surface -> apps/web/src/lib/services/agentic-chat/tools/core/gateway-surface.ts
Tool definitions -> apps/web/src/lib/services/agentic-chat/tools/core/definitions/ontology-write.ts
```

Important recent cleanup:

- The system prompt no longer embeds full tool JSON.
- Prompt dumps now show provider tool definition sizes explicitly.
- The script `pnpm --filter @buildos/web run report:agentic-tools` reports tool
  surface size by context/profile.

## Problem Statement

Provider tool definitions are now one of the largest remaining payload costs.

Recent report output:

```text
canonical_gateway | global | 14 | 12451 | 3113
canonical_gateway | project | 19 | 20151 | 5038
canonical_gateway | project_create | 8 | 23525 | 5882
canonical_gateway | project_audit | 23 | 22175 | 5544
canonical_gateway | project_forecast | 23 | 22175 | 5544
canonical_gateway | calendar | 10 | 9485 | 2372
```

Top offenders:

```text
create_onto_project: ~11823 chars
create_onto_task: ~4585 chars
create_onto_document: ~2011 chars
update_onto_task: ~2412 chars
```

`project_create` is especially expensive because it preloads
`create_onto_project`, whose schema includes extensive workflow guidance,
examples, and the full create payload shape.

## Key Files

- `apps/web/src/lib/services/agentic-chat/tools/core/definitions/ontology-write.ts`
    - `create_onto_task` definition starts near the top of the file.
    - `create_onto_project` definition starts around the later create-project block.
- `apps/web/src/lib/services/agentic-chat/tools/core/gateway-surface.ts`
    - defines which direct tools are preloaded for each context.
- `apps/web/src/lib/services/agentic-chat-v2/tool-selector.ts`
    - currently returns the canonical gateway surface for the context.
- `apps/web/src/lib/services/agentic-chat-v2/tool-surface-size-report.ts`
    - reusable reporting helper for schema size.
- `apps/web/scripts/report-agentic-tool-surface-sizes.ts`
    - CLI report entrypoint.
- `apps/web/src/lib/services/agentic-chat/tools/skills/definitions/project_creation/SKILL.md`
    - better home for project creation workflow guidance.
- `apps/web/src/lib/services/agentic-chat/tools/skills/definitions/task_management/SKILL.md`
    - better home for task creation guidance.

## Cleanup Strategy

Do not remove the tools. Reduce what must be preloaded.

Recommended sequence:

1. Measure current payloads.
2. Split provider schema content into:
    - required machine schema
    - short description needed for tool choice
    - workflow guidance that belongs in skill files
    - examples that can be moved to `tool_schema`/skill output
3. Create smaller preloaded tool profiles.
4. Keep full schema detail available through `tool_schema`.
5. Add tests that enforce lower provider payload sizes and correct tool
   availability.

## Proposed First Slice

### 1. Shorten `create_onto_task`

Move long task judgment guidance out of provider schema:

- "when to create tasks vs. when not to"
- examples contrasting brainstorming vs tracked tasks
- long type taxonomy guidance

Keep only:

- what the tool does
- required fields
- short field descriptions
- hard constraints required for safe execution

Move workflow detail to:

```text
apps/web/src/lib/services/agentic-chat/tools/skills/definitions/task_management/SKILL.md
```

Acceptance target:

```text
create_onto_task provider definition <= 2500 chars
```

### 2. Shorten `create_onto_project`

Move long project creation playbook content out of provider schema:

- detailed workflow steps
- long examples
- "start simple" narrative
- prop extraction guidance
- extended ProjectSpec explanation

Keep only:

- concise tool purpose
- required payload shape
- required arrays
- basic entity/relationship contract
- hard constraints that the validator cannot repair

Move workflow detail to:

```text
apps/web/src/lib/services/agentic-chat/tools/skills/definitions/project_creation/SKILL.md
```

Acceptance target:

```text
create_onto_project provider definition <= 5000 chars
```

### 3. Design Smaller Preloaded Profiles

The current context-level surfaces are too broad. Keep `skill_load`,
`tool_search`, and `tool_schema` preloaded, then preload fewer direct tools.

Candidate profiles:

```text
global_basic:
  skill_load, tool_search, tool_schema,
  get_workspace_overview, get_project_overview,
  search_buildos, search_onto_projects

project_basic:
  skill_load, tool_search, tool_schema,
  get_project_overview, get_onto_project_details,
  list_onto_tasks, search_onto_tasks,
  list_onto_documents

project_write:
  project_basic + update_onto_task + create_onto_task + update_onto_document

project_document:
  project_basic + get_onto_document_details + create_onto_document +
  update_onto_document + get_document_tree + move_document_in_tree

project_calendar:
  skill_load, tool_search, tool_schema,
  get_project_overview, list_calendar_events, get_calendar_event_details,
  create_calendar_event, update_calendar_event,
  get_project_calendar, set_project_calendar

project_create_minimal:
  skill_load, tool_search, tool_schema,
  create_onto_project
```

Do not add an LLM semantic router as part of this slice. Use deterministic
context/product surface inputs first. Keep `tool_search` available so missing
direct tools can be materialized mid-turn.

## Guardrails

- Do not break the existing v2 chat route.
- Do not reintroduce old gateway-off or OpenRouter-vs-SmartLLM branches.
- Do not remove `tool_schema`; it is the fallback for exact argument details.
- Do not delete executor support for any direct tool.
- Do not hide tools from execution once materialized.
- Do not make the model call generic executor tools for normal operations.
- Keep tests deterministic and focused on provider payload size, tool
  availability, and current direct-tool behavior.

## Tests To Add Or Update

Add or update focused tests around:

```text
apps/web/src/lib/services/agentic-chat-v2/tool-surface-size-report.test.ts
apps/web/src/lib/services/agentic-chat-v2/tool-selector.test.ts
apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator.test.ts
apps/web/src/lib/services/agentic-chat/tools/skills/skill-load.test.ts
apps/web/src/lib/services/agentic-chat/tools/core/tool-schema-compat.test.ts
apps/web/src/lib/services/agentic-chat/tools/core/executors/ontology-project-create.test.ts
apps/web/src/lib/services/agentic-chat/tools/core/tool-executor.test.ts
```

Suggested new assertions:

```text
create_onto_project <= 5000 chars
create_onto_task <= 2500 chars
project_create provider surface <= 9000 chars
project_basic provider surface <= 9000 chars
project_write/provider profile is smaller than current project canonical surface
tool_schema still returns full usage/schema guidance when requested
project_creation skill still contains workflow guidance removed from provider schema
task_management skill still contains task judgment guidance removed from provider schema
```

## Verification Commands

Run:

```bash
pnpm --filter @buildos/web run report:agentic-tools
pnpm --filter @buildos/web test -- src/lib/services/agentic-chat-v2/tool-surface-size-report.test.ts src/lib/services/agentic-chat-v2/tool-selector.test.ts src/lib/services/agentic-chat/tools/core/tool-schema-compat.test.ts src/lib/services/agentic-chat/tools/skills/skill-load.test.ts
```

If provider profiles change runtime behavior, also run:

```bash
pnpm --filter @buildos/web test -- src/lib/services/agentic-chat-v2/stream-orchestrator.test.ts src/lib/services/agentic-chat/tools/core/executors/ontology-project-create.test.ts src/lib/services/agentic-chat/tools/core/tool-executor.test.ts
```

## Expected Outcome

After this cleanup:

- prompt dumps make provider tool costs obvious
- current direct tool behavior remains intact
- large provider schemas are materially smaller
- workflow guidance lives in skills, not duplicated in provider schemas
- the codebase can support smaller preloaded profiles for the lite harness
