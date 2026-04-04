<!-- docs/reports/agentic-chat-v2-overview-refactor-plan-2026-03-30.md -->

# Agentic Chat V2 Overview Refactor Plan

Date: 2026-03-30

## Goal

Make BuildOS chat reliable for common native questions like:

- "What is happening with my projects?"
- "What's going on with 9takes?"
- "What changed recently in this project?"
- "What is blocked or due soon?"

The current gateway + skill model is useful for complex workflows and risky writes, but it is too indirect for routine BuildOS status and discovery questions.

## Problems To Fix

1. Global project visibility is incomplete.
    - Current global context loads only projects `created_by` the current user.
    - Shared/member-visible projects can be missing from both global prompt context and status answers.

2. Common status questions do not have a first-class retrieval path.
    - The model has to assemble project/workspace answers from generic list/search ops.
    - That creates unnecessary planning, discovery, and failure surface.

3. The capability system is missing the most common read intent.
    - There is no dedicated workspace/project overview capability.
    - The model has to choose between project graph, planning, audit, forecast, or generic search.

4. Prompt guidance is too protocol-heavy for straightforward reads.
    - The runtime overemphasizes discovery mechanics instead of BuildOS-native retrieval.

## Refactor Strategy

### Phase 1: Fix The Data Foundation

- Update fastchat global context visibility to include all accessible projects, not just owned projects.
- Apply the same fix in:
    - SQL RPC `load_fastchat_context`
    - fallback loader in app code

Expected result:

- Global prompt context reflects the user's real accessible workspace.

### Phase 2: Add First-Class Overview Retrieval

Add dedicated utility-style read ops:

- `util.workspace.overview`
    - Returns a concise workspace snapshot across accessible projects.
    - Emphasizes active work, blocked work, due-soon work, upcoming events, open risks, and recent changes.

- `util.project.overview`
    - Returns a concise status snapshot for one project.
    - Supports `project_id` when known.
    - Supports `query` to resolve a named project when the ID is not yet known.
    - Returns ambiguity/not-found signals cleanly instead of forcing the model to improvise.

Expected result:

- The model can answer native BuildOS overview questions with one purposeful retrieval op.

### Phase 3: Capability + Prompt Alignment

- Add a first-class overview capability to the capability catalog.
- Teach the gateway prompt:
    - use overview ops for workspace/project status questions
    - do not start with generic ontology discovery when the user is asking for a status summary
- Update `tool_help(root)` workflow guidance to point at overview ops early.

Expected result:

- The model reaches the right retrieval surface with less exploration.

### Phase 4: Runtime Hardening

- Keep skills for complex, stateful, or risky workflows:
    - calendar
    - task/plan workflows
    - documents
    - people context
    - audit / forecast
- Do not force overview questions through skill lookup first.

Expected result:

- Overview questions feel native and direct.
- Workflow questions still benefit from skill guidance.

## Testing Plan

### Unit / Integration Coverage

1. Context visibility
    - Global fallback loader includes accessible shared projects and does not hard-filter by `created_by`.
    - Global RPC scope is aligned with shared access rules.

2. Tool registry / help discovery
    - `util.workspace.overview` is discoverable via `tool_help`.
    - `util.project.overview` is discoverable via `tool_help`.
    - Root help and capability help expose overview retrieval as the preferred path for status questions.

3. Overview executor behavior
    - Workspace overview returns a stable summary for multiple accessible projects.
    - Project overview resolves by exact `project_id`.
    - Project overview resolves by project name query.
    - Project overview returns an ambiguity payload when multiple project names match.
    - Project overview returns a not-found payload when no project matches.

4. Prompt alignment
    - Master prompt includes the overview capability and guidance to prefer overview ops for status questions.

### Manual Chat Scenarios

Run these in the workspace after deployment:

1. Workspace summary
    - Prompt: `What is happening with my projects?`
    - Expectation:
        - Chat uses `util.workspace.overview` or equivalent direct overview path.
        - Response summarizes active/blocked/due-soon work across projects.
        - No capability-tree wandering before basic retrieval.

2. Specific named project
    - Prompt: `What's going on with 9takes?`
    - Expectation:
        - Chat uses `util.project.overview` with query or resolved ID.
        - Response summarizes project status, top tasks, milestones, risks, and recent changes.
        - No repeated search/list/schema churn.

3. Shared project visibility
    - Prompt: `What is happening with my projects?`
    - Preconditions:
        - User is a member on at least one project they did not create.
    - Expectation:
        - Shared project appears in the workspace summary.

4. Ambiguous project name
    - Prompt: `What's going on with Alpha?`
    - Preconditions:
        - Multiple accessible projects have similar names.
    - Expectation:
        - Chat asks one concise clarifying question or presents compact candidates.
        - It does not invent a project choice.

5. Status follow-up
    - Prompt sequence:
        - `What's going on with 9takes?`
        - `What's blocked?`
    - Expectation:
        - Follow-up uses the already established project context or prior overview result.
        - It does not restart from root discovery.

6. Audit lane still works
    - Prompt: `Audit the health of 9takes.`
    - Expectation:
        - Chat may use project overview first, then audit-specific skill/gateway guidance.
        - Audit stays deeper than plain status summary.

## Acceptance Criteria

- Shared/member-visible projects appear in global chat context and overview results.
- Routine overview questions use a direct overview retrieval path.
- Named project status questions avoid multi-step discovery churn.
- The prompt is clearer about when to use overview vs skill vs exact-op discovery.
- Tests cover workspace-wide and named-project scenarios.
