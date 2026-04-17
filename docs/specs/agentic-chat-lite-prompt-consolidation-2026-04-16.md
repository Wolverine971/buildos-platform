<!-- docs/specs/agentic-chat-lite-prompt-consolidation-2026-04-16.md -->

# Agentic Chat — Lite Prompt Consolidation Spec

Status: implemented 2026-04-16; post-replay fixes landed 2026-04-17 (see §13 Implementation Log, §14 Post-Replay Follow-Up, §15 Second Post-Replay Pass, §16 Ledger Imperative Revert)
Date: 2026-04-16
Owner: agentic chat

Related docs:

- [FastChat vs Lite fantasy-novel flow audit](../reports/agentic-chat-fastchat-vs-lite-fantasy-novel-flow-audit-2026-04-15.md)
- [Lite prompt builder](../../apps/web/src/lib/services/agentic-chat-lite/prompt/build-lite-prompt.ts)
- [FastChat master prompt builder](../../apps/web/src/lib/services/agentic-chat-v2/master-prompt-builder.ts)
- [Agentic chat operating model](./agentic-chat-operating-model.md)
- [Skill/tool architecture v2](./agentic-chat-skill-tool-architecture-v2.md)
- [Gateway tool surface](../../apps/web/src/lib/services/agentic-chat/tools/core/gateway-surface.ts)
- [Capability catalog](../../apps/web/src/lib/services/agentic-chat/tools/registry/capability-catalog.ts)
- [Skill registry](../../apps/web/src/lib/services/agentic-chat/tools/skills/registry.ts)

---

## 1. Purpose

Consolidate the two active agentic-chat prompt variants — `fastchat_prompt_v1` (V2 master prompt) and `lite_seed_v1` — into a single prompt path built on the Lite architecture. Absorb the small number of genuinely valuable behavioral bits from FastChat, move misplaced rules down to skills or the executor, and add per-context workflow guidance inside `Current Focus and Purpose` so the agent gets the right workflow hint for `global`, `project`, `project_create`, and `daily_brief` sessions.

This spec defines the target prompt shape, the exact per-section changes, the rule-scope migration plan, and a short ordered implementation plan. It does not itself fix the harness-level issues the audit surfaced (write-outcome ledger, tool-surface routing); those are called out as separate efforts.

---

## 2. Background

Today `build-lite-prompt.ts` (`lite_seed_v1`) is the target prompt path. A legacy `master-prompt-builder.ts` (`fastchat_prompt_v1`) still exists in the repo and is referenced here only as a source for behavioral content being pulled forward. There is no A/B or variant choice to preserve — the consolidation removes the legacy path.

The Lite builder already has the right shape: 9 named sections, a clean static-first order, cheap per-turn cost, and a capability / skill / tool mental model. What it needs is a small set of behavioral additions, per-context workflow guidance inside `Current Focus and Purpose`, and discipline about which rules live in the prompt versus in skills versus in the executor.

Empirical evidence (see the [2026-04-15 fantasy-novel audit](../reports/agentic-chat-fastchat-vs-lite-fantasy-novel-flow-audit-2026-04-15.md), including the post-fix `13fc` replay):

- Lite is cheaper and more reliable on project-shape quality.
- Both prompts share the same underlying write-integrity and grounding failures; those are harness problems, not prompt problems.
- Rule-adding as a response to each new failure is not scalable and already produced two safety blocks that the agent sometimes ignores (the legacy prompt's "add one goal" rule was violated in its own original run).

The design principle going forward:

> **If a rule is needed on every turn, keep it in the prompt. If it is needed only when doing X, it belongs in the skill for X. If it can be enforced from a schema, it belongs in the executor.**

---

## 3. Goals and Non-Goals

### Goals

1. Make the Lite-based builder the only prompt path; remove `fastchat_prompt_v1` from routing and delete the legacy builder after the behavioral content has been pulled forward.
2. Give the consolidated prompt per-context workflow guidance for `global`, `project`, `project_create`, and `daily_brief`, placed inside the `Current Focus and Purpose` section.
3. Move rules that are workflow-specific down to skills; move rules that are schema-enforceable down to the executor (where they are not already).
4. Keep (and extend) the static-first section order so the prompt prefix is cache-stable across sessions.
5. Preserve the three-layer mental model (capability → skill → tool) and add a crisp "how to pick a skill" rule.

### Non-goals

- Fixing capability → skill runtime routing (separate effort, §9.1).
- Surfacing skill → tool registry to the agent (separate effort, §9.2).
- Adding the `project_write` / `project_notes` tool-surface profiles (separate effort, §9.3 — tracked in audit §5).
- Building the write-outcome ledger (separate effort, §9.4 — tracked in audit §4).
- Document type_key coercion fix (separate effort, §9.5 — tracked in audit P3).

---

## 4. Final Prompt Architecture

### 4.1 Section order

```
[STATIC prefix — identical across every session]
1. identity_mission
2. operating_strategy
3. safety_data_rules
4. capabilities_skills_tools

[SEMI-STATIC — stable per contextType]
5. tool_surface_dynamic

[DYNAMIC — changes per session]
6. focus_purpose              ← per-context workflow guidance lives here
7. location_loaded_context
8. timeline_recent_activity   ← now always rendered, with fallbacks
9. context_inventory_retrieval
```

Two changes relative to today's Lite order:

- **Move `tool_surface_dynamic` from position 9 to position 5.** Tool surfaces are stable per contextType; placing them right after the static prefix extends the cacheable region.
- **Always render `timeline_recent_activity`** (including for `project_create`, with explicit "no dated work yet" fallbacks). Conditional inclusion destabilizes the prefix across sessions of different contextTypes.

### 4.2 Static/dynamic discipline

| Section                       | Kind        | Source of variation                                                                                                               |
| ----------------------------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `identity_mission`            | static      | none                                                                                                                              |
| `operating_strategy`          | static      | none                                                                                                                              |
| `safety_data_rules`           | static-ish  | may render one conditional bullet (member-role constraint) when loaded data includes any multi-person project — see §5.3          |
| `capabilities_skills_tools`   | static      | derived from registries; changes only when we ship new capabilities/skills                                                        |
| `tool_surface_dynamic`        | semi-static | per contextType                                                                                                                   |
| `focus_purpose`               | dynamic     | contextType + focus entity; carries per-context workflow block including the `daily_brief` guardrails when that context is active |
| `location_loaded_context`     | dynamic     | loaded data                                                                                                                       |
| `timeline_recent_activity`    | dynamic     | loaded timeline/project intelligence; for `project_create` only the Timeline frame header renders (no project-status bullets)     |
| `context_inventory_retrieval` | dynamic     | retrievalMap                                                                                                                      |

---

## 5. Section-by-Section Changes

### 5.1 `identity_mission`

No change. Keep current content.

### 5.2 `operating_strategy`

Add three items. Keep everything else.

**Add: Communication pattern (1-sentence paragraph).**

> "Always open a turn with a 1–2 sentence lead-in describing what you are about to do before making tool calls. Lead-ins are intent only — do not claim outcomes until tool results are back. Never output scratchpad, self-correction, or partial JSON."

Rationale: absorbs the best of FastChat's Communication pattern section without the bulleted examples; the examples bloat the prompt without adding behavior.

**Add: Entity resolution order (4-bullet list).**

> "When identifying an entity for a write:
>
> 1. Reuse exact IDs already in loaded context, recent history, or prior tool results.
> 2. If not yet known, search within the current project first when project scope is known.
> 3. If project scope is unknown or search does not resolve, search across the workspace.
> 4. If search returns multiple plausible matches, ask one concise clarification before writing."

Rationale: this is truly an every-turn invariant and is under-specified in Lite today.

**Add: How to pick a skill (1-sentence rule).**

> "Start from the capability that matches the user's intent; each capability declares its primary skill(s). Call `skill_load` when the work is ≥2 related writes or when required fields are uncertain. Default to `format: short`; request `include_examples: true` only after a prior failure on the same op or when the payload shape is novel."

Rationale: the audit shows `skill_load(task_management, include_examples: true)` is called for routine follow-ups. This rule gives the agent a two-part litmus test (write count + required-field certainty) plus a default on example loading. Deeper capability → skill runtime routing is a separate effort (§9.1) — until that lands, this one-sentence rule is the whole routing policy; no additional trigger-phrase matching is required of the agent.

### 5.3 `safety_data_rules`

**Keep as prompt-level invariants:**

- Grounding: only claim what a successful tool result confirms.
- Pre-tool intent / post-tool outcome bookend.
- Failed-write disclosure language.
- No placeholder IDs; full UUIDs only. (Promote from FastChat; Lite currently has a weaker version.)
- No markup leakage in durable string fields.
- Do not invent data not in context or tool results.
- Use exact IDs from context; ask if ambiguous.
- Treat permissions and member roles as hard constraints.
- Record user-reported inconsistencies as open questions or fix tasks; do not pick canon unless stated.
- No "linked" / "cross-linked" / "nested under X" claims without a successful link/move tool result.

**Trim to 1-line pointers (specifics move to skills):**

| Currently in safety                            | New 1-liner in safety                                                                             | Specifics live in                                         |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| Two-step document placement contract (5 lines) | "Document placement is a two-step contract (create + tree-move). See `document_workspace` skill." | `document_workspace` SKILL.md                             |
| Append/merge content rule (1.5 lines)          | "Document append/merge writes require non-empty `content`."                                       | `document_workspace` SKILL.md (also enforced at executor) |
| Task state_key coverage rule (2 lines)         | "Update `state_key` whenever the user reports task work advanced. See `task_management` skill."   | `task_management` SKILL.md                                |

**Add: Member-role constraint (1 conditional bullet).**

> "When project members are loaded and any project in scope has more than one member, prefer assigning work to members whose `role_name` / `role_description` aligns with the responsibility. Treat permission role and access as a hard constraint. Ask once if multiple members overlap."

Rationale: absorbs the legacy builder's Member roles subsection in compressed form, but only when the data supports it. A solo user with solo projects never sees this rule — it's cognitive noise for them.

**Rendering condition: `hasMultiPersonScope(data)`.**

Research findings on data sources available to this helper today:

| Context                                   | Data shape                                                                                                                                                                                                                    | Detection feasible today?                                                       |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `project` / `ontology` (with `projectId`) | `data.members` is a top-level array of `LightProjectMember` rows loaded via `onto_project_members` (`context-loader.ts:2354`, `context-models.ts:215`). Each row has `actor_id`, `role_key`, `role_name`, `role_description`. | **Yes.** `data.members.length > 1` (with a distinct-actor-id safety check).     |
| `ontology` (no `projectId`)               | Loader falls back to workspace-style data; member roster is not populated.                                                                                                                                                    | No — render skipped.                                                            |
| `global` / `general`                      | `data.projects` is an array of `GlobalContextProjectBundle` (`context-models.ts:235`, `context-loader.ts:1793-1806`). Bundles carry `project, recent_activity, goals, milestones, plans` — **no `members` field today.**      | Not yet. Needs a loader addition (see below). Render skipped until that lands.  |
| `daily_brief` / `daily_brief_update`      | Uses brief-scoped payload; member roster is not guaranteed.                                                                                                                                                                   | No — render skipped unless brief payload evolves to include a member reference. |
| `brain_dump`                              | Capture-scoped payload; no member roster.                                                                                                                                                                                     | No — render skipped.                                                            |
| `calendar`                                | Event-scoped payload; no member roster.                                                                                                                                                                                       | No — render skipped.                                                            |
| `project_create`                          | By definition no collaborators yet.                                                                                                                                                                                           | Never render.                                                                   |

**Implementation in this spec.**

For the initial rollout, `hasMultiPersonScope(data)` evaluates `data.members?.length > 1` in project / ontology contexts and returns `false` in every other context (see §9.6 for the follow-up that unblocks global/brief rendering). This keeps the rule correct wherever it renders, and silent everywhere else — which is the intended behavior for solo users.

**Skipped fields worth noting.** The loader already carries `role_key`, `access`, `role_name`, `role_description` per member in project context. Assignment routing (`prefer members whose role aligns…`) therefore has usable data today; the blocker is only scope detection at higher contexts, not the data schema.

**Removed: Daily-brief guardrails are no longer in `safety_data_rules`.** They now live in `focus_purpose` as the `daily_brief` workflow block (§5.6). This keeps all per-context guidance in one place.

### 5.4 `capabilities_skills_tools`

Tighten, do not remove.

- Keep the three-layer explanation (it works as a mental model).
- Keep the Capabilities list as-is — 1 line per capability.
- **Swap Skills from the current prose list into the legacy builder's table form.** Both current formats source the same data (`listAllSkills()` → `id` + `summary`) so there is no field regression:

    Current Lite render (prose, per `build-lite-prompt.ts:296-322`):

    ```
    Skill metadata:
    - task_management: Task workflow playbook for ...
    - document_workspace: Project document hierarchy playbook for ...
    ```

    New render (table, ported from `master-prompt-builder.ts:229-234`):

    ```
    ### Skill Catalog

    Use `skill_load` to fetch a skill playbook before executing multi-step or stateful workflows.

    | Skill ID | Description |
    |---|---|
    | `task_management` | Task workflow playbook for deciding when work should become a task and how to manage task scope, ownership, schedule, and relationships safely. |
    | `document_workspace` | Project document hierarchy playbook for doc tree operations, unlinked docs, task docs, and document CRUD rules. |
    ...
    ```

- Add a 1-line closer: "See `operating_strategy` for when to call `skill_load`. Tool names live in the tool surface section below."

**Regression check.** `SkillDefinition` (`apps/web/src/lib/services/agentic-chat/tools/skills/types.ts`) exposes `id, name, summary, legacyPaths, relatedOps, whenToUse, workflow, guardrails, examples, notes`. Neither the prose form nor the table form currently uses anything beyond `id` and `summary`, so the swap changes formatting only. If a future spec wants to expose additional columns (e.g. `name`, `whenToUse` triggers, or `relatedOps` count), add them explicitly rather than relying on the table form to carry them implicitly.

### 5.5 `tool_surface_dynamic` (moved to position 5)

No content change. Just reorder. Keep the "discovery vs direct tools" split. Keep "Use direct tools first; use `tool_search` only when the exact op is missing."

### 5.6 `focus_purpose` — new per-context guidance home

This is the meaningful structural change. `focus_purpose` becomes the single home for per-context workflow guidance — all four blocks currently defined in `master-prompt-builder.ts`:

- `OVERVIEW_GUIDANCE` — `global` / `general`
- `PROJECT_ANALYSIS_SKILL_GUIDANCE` — `project` / `ontology`
- `PROJECT_CREATE_WORKFLOW` — `project_create` (already handled inline in Lite today; keep the current Lite text and expand slightly)
- `DAILY_BRIEF_GUARDRAILS` — `daily_brief` / `daily_brief_update`, and also when `shouldApplyDailyBriefGuardrails(data)` is true in any context

New `focus_purpose` shape for every contextType:

```
Current focus:
- <existing focus bullets>

Use this seed for:
- <existing purpose line>

<per-context workflow block — see table below>
```

#### Per-context workflow content

##### `global` / `general` — "Workspace orientation"

> "Workflow hints for workspace-level chat:
>
> - For routine status questions about the workspace or a named project, prefer overview retrieval first instead of generic ontology discovery.
> - Workspace-wide status → `get_workspace_overview({})`.
> - Named or in-scope project status → `get_project_overview({ project_id })` when the ID is known, otherwise `get_project_overview({ query })`.
> - If structured context already has a clear `next_step_short` or equivalent summary, answer from context instead of loading audit skills or repeating project graph reads."

Source: FastChat `OVERVIEW_GUIDANCE` constant, compressed.

##### `project` / `ontology` — "Project audit / forecast routing"

> "Workflow hints for project chat:
>
> - Audit and forecast are project skills, not separate context types. Stay in `project`.
> - For audits, health reviews, stress tests, blockers, stale work, or gap analysis → load `skill_load({ skill: 'project_audit' })` before the analysis if the answer is multi-step or evidence-heavy.
> - For forecasts, schedule risk, slippage, scenarios, or "are we on track" → load `skill_load({ skill: 'project_forecast' })` before the analysis if the answer depends on assumptions or multiple signals.
> - Use the current `project_id` and project-focused direct tools; do not invent `project_audit` or `project_forecast` sessions."

Source: legacy builder's `PROJECT_ANALYSIS_SKILL_GUIDANCE` constant, compressed.

**Why `project` and `ontology` share the same block.**

`ontology` is a `ChatContextType` variant defined in `packages/shared-types/src/chat.types.ts`, intended for ontology-aware interactions over the entity graph (tasks, goals, plans, relationships). In the current codebase it shares the `project_basic` tool surface with `project` (`gateway-surface.ts:118-120`), and when it carries a `projectFocus.projectId` the context loader promotes it to project-scoped data (`context-loader.ts:458`). A frontend entry point for `ontology` chat does not exist in production today — routes/components do not start `ontology` sessions directly. When `ontology` is used, it behaves functionally like a scoped project session with emphasis on entity-graph reasoning.

Given that:

- Both contexts load the same project data (same tool surface, same data shape when a project is scoped).
- Both benefit from the same audit / forecast skill routing when the user asks "is this on track?" or "what's blocking this?"
- Splitting them would require inventing a distinct `ontology` workflow block today for zero behavioral win.

Spec choice: bind both `project` and `ontology` to the same `PROJECT_ANALYSIS_SKILL_GUIDANCE_LITE` block. If a future product direction gives `ontology` its own chat entry point with different workflow expectations (entity editing, relationship audits, schema introspection), split into a dedicated block at that time.

##### `project_create` — "Project creation workflow"

Expand Lite's current inline content with the remaining useful items from FastChat's `PROJECT_CREATE_WORKFLOW`:

> "Project creation workflow:
>
> - Turn a rough idea into the smallest valid project structure with a clear name, `type_key`, description / props, and only the entities and relationships the user actually described.
> - `project.type_key` must start with `project.`, for example `project.creative.novel`.
> - Always include `entities: []` and `relationships: []` arrays even when empty.
> - If the user stated an outcome, add one goal. If they listed concrete actions, add only those task entities. Add plans or milestones only when they clearly described workstreams, phases, or date-driven structure.
> - Entity labels: `goal` / `plan` / `metric` use `name`; `task` / `milestone` / `document` / `risk` use `title`; `requirement` uses `text`; `source` uses `uri`. Milestones also require `due_at`.
> - For `goal` entities, use dedicated fields like `target_date` and `measurement_criteria` instead of burying them only in `props`. If the user gives a month/day without a year, infer the next plausible future date in the user's locale.
> - Every `relationships` item must reference entities with `temp_id` and `kind`. Never use raw temp_id strings like `['g1', 't1']`.
> - Use `clarifications[]` only when critical information cannot be reasonably inferred — still send the project skeleton.
> - Ask one concise clarification only when a required detail blocks a safe create payload.
> - After creation succeeds, continue inside the created project instead of staying in abstract creation mode."

Source: merge of Lite's current inline content + FastChat `PROJECT_CREATE_WORKFLOW`.

##### `daily_brief` / `daily_brief_update` — "Daily brief guardrails"

> "Workflow hints when daily-brief context is loaded:
>
> - Prefer acting on entities explicitly mentioned in the brief.
> - For out-of-brief entities, proceed only when target identity is clear.
> - If target identity is ambiguous, ask one concise clarification before writing.
> - For delete / reassign / delegate actions, confirm target unless intent is crystal clear."

Also render this block in any other context when `shouldApplyDailyBriefGuardrails(data)` returns true (for example, a `global` chat that loaded a brief). In that case append it after the context's own workflow block.

Source: FastChat `DAILY_BRIEF_GUARDRAILS` constant, compressed and reframed as workflow + target-safety hints.

##### `calendar` / `brain_dump` — existing purpose line only

Keep Lite's existing purpose-line behavior. No new workflow block required at this time.

##### Other contextTypes — no workflow block

Render only the `Current focus` + `Use this seed for` lines.

#### Implementation note

In `build-lite-prompt.ts`, the per-context workflow content should be sourced from a single constant map keyed by contextType so it's easy to version and easy to unit-test:

```ts
const FOCUS_WORKFLOW_GUIDANCE: Partial<Record<ChatContextType, string>> = {
	global: OVERVIEW_GUIDANCE_LITE,
	general: OVERVIEW_GUIDANCE_LITE,
	project: PROJECT_ANALYSIS_SKILL_GUIDANCE_LITE,
	ontology: PROJECT_ANALYSIS_SKILL_GUIDANCE_LITE,
	project_create: PROJECT_CREATE_WORKFLOW_LITE,
	daily_brief: DAILY_BRIEF_GUARDRAILS_LITE,
	daily_brief_update: DAILY_BRIEF_GUARDRAILS_LITE
};
```

For the cross-context daily-brief case (e.g. a `global` chat that has loaded a brief), append `DAILY_BRIEF_GUARDRAILS_LITE` after the primary workflow block when `shouldApplyDailyBriefGuardrails(data)` returns true.

FastChat's original constants in `master-prompt-builder.ts` should be rewritten as the Lite-facing versions above (shorter, bullet-form, stripped of the "you are in X context" framing because `focus_purpose` already supplies that).

### 5.7 `location_loaded_context`

No change.

### 5.8 `timeline_recent_activity`

Render for every contextType, but tier the content by what actually makes sense in that context. Reverting my earlier proposal to render padded "no data loaded" fallbacks — that just adds noise.

**Two rendering modes:**

- **Frame-only mode** — render only the Timeline frame header. Used for `project_create` (no existing project data to summarize) and any context where project-intelligence data is absent.

    ```
    Timeline frame:
    - Current time: <ISO>
    - Timezone: <user TZ when available, else UTC>
    - Scope: <scope>
    ```

    The Timeline frame itself is always useful because relative phrases like "today" and "next week" depend on the model knowing the current time and timezone.

- **Full mode** — render the Timeline frame plus `Project status`, `Overdue or due soon`, `Upcoming dated work`, and `Recent project changes` blocks (current Lite behavior). Used when `project_intelligence` or equivalent data is loaded.

**Selection logic:**

```
if contextType === 'project_create':
    renderFrameOnly()
elif projectIntelligence or projectDigest has any signal data:
    renderFull()
else:
    renderFrameOnly()
```

**Cache note.** My earlier concern that conditional rendering destabilizes the prefix is overstated: `focus_purpose` at position 6 already varies per session, so cache breaks there before timeline is reached. Tiering timeline does not meaningfully affect cacheability.

### 5.9 `context_inventory_retrieval`

No change.

---

## 6. Rule Migration Matrix

The current safety/data rules are re-homed per the "prompt / skill / schema" principle.

| Rule                                                                     | Current home         | New home                                                                       | Notes                                                                                             |
| ------------------------------------------------------------------------ | -------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| Grounding: no claim without result                                       | prompt               | prompt                                                                         | invariant                                                                                         |
| Pre-tool intent / post-tool outcome bookend                              | prompt               | prompt                                                                         | invariant                                                                                         |
| Failed-write disclosure                                                  | prompt               | prompt                                                                         | invariant; full ledger is separate effort (§9.4)                                                  |
| No placeholder IDs / full UUIDs                                          | FastChat only        | prompt (Lite)                                                                  | promote to Lite                                                                                   |
| No markup in durable strings                                             | prompt               | prompt + executor                                                              | executor is authoritative; prompt is defensive                                                    |
| ID resolution order                                                      | FastChat only        | prompt (Lite)                                                                  | promote to Lite `operating_strategy`                                                              |
| Entity relationships (Project→Goal→Milestone→Plan→Task)                  | FastChat Data Rules  | `project_creation` skill                                                       | already in skill; remove from prompt                                                              |
| Document hierarchy (edges not allowed; doc_structure is source of truth) | FastChat Data Rules  | `document_workspace` skill                                                     | already in skill; remove from prompt                                                              |
| Two-step document placement contract                                     | both prompts         | `document_workspace` skill (detailed) + prompt (1-liner pointer)               |                                                                                                   |
| Append / merge require `content`                                         | both prompts         | `document_workspace` skill (detailed) + executor (enforced) + prompt (1-liner) |                                                                                                   |
| Task state_key coverage                                                  | both prompts         | `task_management` skill (detailed) + prompt (1-liner pointer)                  |                                                                                                   |
| User-reported inconsistency → open question                              | both prompts         | prompt                                                                         | invariant; keep concise                                                                           |
| Member-role constraints                                                  | FastChat Data Rules  | prompt (Lite `safety_data_rules`) conditional                                  | 1 bullet, renders only when loaded data shows a multi-person project in scope                     |
| Daily-brief guardrails                                                   | FastChat conditional | prompt `focus_purpose` conditional (Lite)                                      | rendered for `daily_brief` / `daily_brief_update` or when `shouldApplyDailyBriefGuardrails(data)` |
| Workspace overview-first                                                 | FastChat conditional | prompt `focus_purpose` for `global`                                            | workflow, not safety                                                                              |
| Project audit / forecast skill routing                                   | FastChat conditional | prompt `focus_purpose` for `project`                                           | workflow, not safety                                                                              |
| Project create workflow                                                  | FastChat conditional | prompt `focus_purpose` for `project_create`                                    | already there; expanded                                                                           |
| Empty `props: {}` is not an update                                       | was prompt           | executor (done)                                                                | no prompt mention                                                                                 |
| Markup artifact rejection                                                | was prompt           | executor (done)                                                                | keep defensive prompt rule                                                                        |
| Document type_key coercion                                               | —                    | executor (§9.5)                                                                | not a prompt issue                                                                                |

---

## 7. Skill Updates Required

The following skill files need small additions to absorb rules being moved out of the prompt:

### 7.1 `task_management/SKILL.md`

Add under "Workflow":

> - When the user reports that real-world task work advanced (started, in progress, blocked, or finished), include `state_key` in the `update_onto_task` call alongside any description change. Do not update only the description when the task state should also move.

### 7.2 `document_workspace/SKILL.md`

The two-step placement contract and the append/merge content requirement are already present. Verify both are still written clearly; trim prompt to the 1-liner pointer only after this skill content is confirmed authoritative.

### 7.3 `project_creation/SKILL.md`

Already covers the entity-type labels, relationships shape, and "add one goal when outcome stated" rule. No change required — but the `focus_purpose` `project_create` block (§5.6) should be kept deliberately shorter than the skill, since the skill is the full playbook loaded via `skill_load`.

---

## 8. Acceptance Criteria

Before merging the consolidation:

1. The Lite-based builder is the only prompt path. `fastchat_prompt_v1` is removed from routing (`prompt-variant.ts`) and the legacy builder is deleted once the behavioral content in §5 is confirmed pulled forward.
2. The static prefix (sections 1–4) renders byte-identically across sessions of different contextTypes (subject to the conditional member-role bullet described below).
3. `focus_purpose` for `global`, `general`, `project`, `ontology`, `project_create`, `daily_brief`, and `daily_brief_update` renders the corresponding workflow block. Cross-context daily-brief rendering (when `shouldApplyDailyBriefGuardrails(data)` is true outside a brief context) appends the daily-brief block after the primary workflow block.
4. `safety_data_rules` length is reduced by at least 3 trimmed rules (document placement, append content, task state_key) with their 1-line pointers remaining.
5. Communication-pattern, entity-resolution, and skill-picking rules are present in `operating_strategy`.
6. Member-role constraint is present in `safety_data_rules` as a conditional bullet, rendering only when `hasMultiPersonScope(data)` returns true. Unit-tested against: (a) solo-user / solo-project → absent, (b) project with >1 member → present, (c) `project_create` → always absent, (d) global / brief contexts → absent until §9.6 lands, then present when any loaded bundle has `member_count > 1`.
7. Daily-brief guardrails render inside `focus_purpose` when contextType is `daily_brief` / `daily_brief_update` or when `shouldApplyDailyBriefGuardrails(data)` returns true in any other context.
8. `timeline_recent_activity` renders a Timeline frame for every contextType. Project-status / overdue / upcoming / recent-change blocks render only when project-intelligence data is loaded. `project_create` always renders the frame-only mode.
9. All moved skill-level rules are present in the corresponding `SKILL.md`.
10. `capabilities_skills_tools` renders Skills as a `| Skill ID | Description |` markdown table sourced from `listAllSkills()`. Snapshot or count-based test asserts skill-row parity with the pre-change prose form (same IDs, same summaries).
11. Replay of the `13fc` fantasy-novel scenario on the consolidated prompt keeps or improves the post-fix baseline (cost, tool count, write integrity, final-response grounding). See audit `Post-Fix Replay Result: 13fc9ea8` for baseline numbers.
12. Prompt-cost breakdown buckets are updated for the new Lite section order (follow-up to audit P2).

Out of scope for these acceptance criteria (covered by separate efforts §9):

- Write-outcome ledger grounding final responses.
- `project_write` / `project_notes` tool-surface profile.
- Capability → skill runtime routing.
- Skill → tool registry surfacing.

---

## 9. Deferred / Separate Efforts

The following are intentionally excluded from this spec because they are runtime/architecture changes, not prompt consolidation.

### 9.1 Capability → skill runtime routing

Problem: capabilities list `skillIds`, but the prompt does not use that linkage. The agent loads skills ad hoc instead of "capability X → skill Y."

Recommended effort: new doc under `docs/specs/agentic-chat-capability-skill-routing-spec.md`. Options include:

- Inject a capability → skill map into the prompt (lightweight; still model-driven).
- Expose a `capability_load` tool that returns the capability's primary skill markdown (runtime-driven; eliminates skill_load guessing).

### 9.2 Skill → tool registry surfacing

Problem: skills list "Related Tools" at the bottom, but those tools are not exposed as a usable tool registry. The agent still runs `tool_search` after loading a skill.

Recommended effort: when `skill_load` returns, the runtime automatically registers the skill's related tools in the direct tool surface for the current turn. Skill markdown becomes the source of truth for "which tools are in scope while this skill is active."

### 9.3 `project_write` / `project_notes` tool-surface profiles

Tracked by audit §5. Add profiles in `gateway-surface.ts`:

- `project_write` — `create_onto_task`, `update_onto_task`, `update_onto_document`, plus reads already in `project_basic`.
- `project_notes` — `list_onto_documents`, `get_onto_document_details`, `update_onto_document`, `create_onto_document`, `get_document_tree`, `move_document_in_tree`.

Route based on user intent (heuristic on verbs like "finished", "progress", "capture", "research notes", "move this under").

### 9.4 Write-outcome ledger for final responses

Tracked by audit §4. The persistent failure mode in both prompts is the final response omitting successful writes or claiming unsupported links/placements. Wording rules have been added twice and still fail. The fix is a ledger:

- Track every material write result per turn.
- Inject a compact `<write_ledger>` block into the final-response pass.
- Deterministic assertions: final prose must mention each material write; must not claim links, placements, types unless ledger confirms.

### 9.5 Document `type_key` coercion

Tracked by audit P3. The agent requests `document.knowledge.research`; some paths persist `document.default`. Confirm or fix at the create endpoint. Prompt-only mitigation does not scale.

### 9.6 Expose per-project `member_count` in global context bundles

Blocker for rendering the member-role bullet in `global` / `general` / `daily_brief` contexts. `GlobalContextProjectBundle` (`context-models.ts:235`) currently exposes `project, recent_activity, goals, milestones, plans`. Add either:

- `member_count: number` per bundle (simplest), or
- A top-level `workspace_member_summary` aggregate on the context payload for cross-project workspace awareness.

Once shipped, extend `hasMultiPersonScope(data)` to inspect the new field. No prompt change required when this lands — the helper absorbs it. Scope: one-day loader change plus an RPC/view tweak to return member counts per project.

---

## 10. Implementation Plan (Ordered)

1. **Update `build-lite-prompt.ts`** — add the three `operating_strategy` items (§5.2), trim + add to `safety_data_rules` (§5.3), compress `capabilities_skills_tools` skill list to a table (§5.4), reorder `tool_surface_dynamic` to position 5 (§5.5), refactor `focus_purpose` to render per-context workflow blocks (§5.6), always-render `timeline_recent_activity` with fallbacks (§5.8).
2. **Add a single `FOCUS_WORKFLOW_GUIDANCE` constant map** keyed by `ChatContextType`. Source content from the FastChat constants, rewritten in the compressed forms in §5.6. Unit-test that each supported contextType renders the expected block.
3. **Update `task_management/SKILL.md`** with the task state_key rule (§7.1).
4. **Verify `document_workspace/SKILL.md`** has the placement + append rules clearly (§7.2).
5. **Update `safety_data_rules` pointers to reference the skills** (`see document_workspace skill`, `see task_management skill`).
6. **Add or reuse tests covering:**
    - static prefix byte-equality across contextTypes;
    - per-context `focus_purpose` content;
    - `timeline_recent_activity` renders for `project_create`;
    - daily-brief guardrail conditional render;
    - safety_data_rules character count reduced by the trimmed rules.
7. **Run the fantasy-novel replay** (`13fc` scenario) against the consolidated prompt; compare tokens, cost, tool count, and P0/P1 failures to the post-fix baseline.
8. **Remove `fastchat_prompt_v1`** — once replay passes, delete the routing branch from `prompt-variant.ts` and remove `master-prompt-builder.ts`. Any exported helpers the Lite builder currently imports from there (e.g. `buildProjectIntelligencePromptSections`, `extractProjectIntelligence`, `serializeLoadedContext`) should already live in `build-lite-prompt.ts`; verify no dangling imports before deletion.
9. **Update prompt-cost buckets** to the new Lite section order (audit P2).
10. **File tickets for §9.1–§9.5** if they are not already on the board.

Estimated scope for steps 1–9: ~1–2 days focused work plus one replay pass.

---

## 11. Open Questions for Reviewer

All resolved in §2 / §5.3 / §5.4 / §5.6 / §9.6. Keeping this section as a placeholder for reviewer follow-ups raised during the read-through.

---

## 12. Summary

Lite becomes the single prompt path. It gets three invariants promoted from FastChat, per-context workflow guidance inside `Current Focus and Purpose` (including the daily-brief block), a data-conditional member-role bullet, and the existing skill-pointers in safety. Three workflow-specific rules move out of the prompt to their home skills. The static prefix grows by one stable block (tool surface). `timeline_recent_activity` renders a frame for every context but skips project-intelligence blocks when there is no project to summarize. Harness-level issues (grounding ledger, tool-surface routing, capability→skill linkage) are tracked separately and are the next architectural investments.

---

## 13. Implementation Log — 2026-04-16

This section records what actually landed and any deltas from the original spec.

### 13.1 Files changed

**Prompt builder (`apps/web/src/lib/services/agentic-chat-lite/prompt/build-lite-prompt.ts`)**

- Reordered `LITE_PROMPT_SECTION_ORDER` so `tool_surface_dynamic` now sits at position 5 (between `capabilities_skills_tools` and `focus_purpose`).
- Added `OVERVIEW_GUIDANCE_LITE`, `PROJECT_ANALYSIS_SKILL_GUIDANCE_LITE`, `PROJECT_CREATE_WORKFLOW_LITE`, `DAILY_BRIEF_GUARDRAILS_LITE` constants and the `FOCUS_WORKFLOW_GUIDANCE` map.
- Added helpers `hasMultiPersonScope(data)` and `shouldApplyDailyBriefGuardrails(data)`.
- `buildOperatingStrategySection`: added Communication pattern, Entity resolution order, and How to pick a skill blocks per §5.2.
- `buildSafetyDataRulesSection(data)`: threaded `data` through, trimmed document placement / append-content / task state-key rules to one-line skill pointers, promoted the full-UUID rule from the legacy builder, and added the conditional member-role bullet (kind flipped from `static` to `mixed`).
- `buildCapabilitiesSkillsToolsSection`: swapped the prose skill list for a `| Skill ID | Description |` markdown table (same source, zero field regression).
- `buildFocusPurposeSection(focus, projectDigest, data)`: renders the per-context workflow block plus an optional cross-context daily-brief append.
- `buildTimelineRecentActivitySection(timeline, focus, projectDigest)`: now always renders; `resolveTimelineRenderMode` returns `frame_only` for `project_create` or when no project-intelligence/digest signals are loaded, else `full`.
- Removed the `shouldIncludeTimelineRecentActivitySection` early-exit entirely.

**Skill docs**

- `apps/web/src/lib/services/agentic-chat/tools/skills/definitions/task_management/SKILL.md`: added the state-coverage bullet under Workflow per §7.1.
- `apps/web/src/lib/services/agentic-chat/tools/skills/definitions/document_workspace/SKILL.md`: added the append/merge non-empty-content rule under Workflow and a matching Guardrail. The two-step placement contract was already present.

**FastChat removal**

- Deleted `apps/web/src/lib/services/agentic-chat-v2/master-prompt-builder.ts`.
- Deleted `apps/web/src/lib/services/agentic-chat-v2/master-prompt-builder.test.ts`.
- `apps/web/src/lib/services/agentic-chat-lite/prompt/types.ts`: inlined the `MasterPromptContext` type locally (was previously imported from the deleted master builder).
- `apps/web/src/lib/services/agentic-chat-v2/context-loader.ts` and `apps/web/src/lib/services/agentic-chat-lite/shadow/compare-lite-shadow.ts`: updated `MasterPromptContext` imports to point at the lite types module.
- `apps/web/src/lib/services/agentic-chat-v2/prompt-variant.ts`: trimmed to labels-only. `FASTCHAT_PROMPT_VARIANT` stays as a legacy observability label for historical snapshots; the runtime routing helpers (`normalizeFastChatPromptVariantRequest`, `isLitePromptVariant`, `FastChatPromptVariantResolution`) were removed. `FastChatPromptVariant` union retained for observability typing.
- `apps/web/src/lib/services/agentic-chat-v2/prompt-variant.test.ts`: rewritten to assert the two exported labels.
- `apps/web/src/lib/services/agentic-chat-v2/index.ts`: removed the `buildMasterPrompt` export.
- `apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator/index.ts`: the `systemPrompt` fallback now calls `buildLitePromptEnvelope(...).systemPrompt` instead of `buildMasterPrompt`.
- `apps/web/src/routes/api/agent/v2/stream/+server.ts`: removed `canUseLitePromptVariant` gate, `isLitePromptVariant` branch, and the `buildMasterPrompt` else-branch. Variant validation is now inline; both `lite_seed_v1` and `fastchat_prompt_v1` are accepted for backward compatibility, both resolve to lite. Debug context always records `LITE_PROMPT_VARIANT`.
- `apps/web/src/lib/services/agentic-chat-lite/preview/build-lite-prompt-preview.ts`: removed `include_current_v2` feature and its `current_v2` field from the return shape.

**Frontend (added during review — see §13.3)**

- `apps/web/src/lib/components/agent/agent-chat-session.ts`: `AGENT_CHAT_DEFAULT_PROMPT_VARIANT` and `AGENT_CHAT_LITE_PROMPT_VARIANT` now both alias `LITE_PROMPT_VARIANT`. `AgentChatPromptVariantSelection` collapses to a single literal. `normalizeAgentChatPromptVariantSelection` always returns lite. `resolveAgentChatPromptVariantForRequest` always returns `null`.
- `apps/web/src/lib/components/agent/AgentChatModal.svelte`: removed the dev/admin Prompt-variant dropdown UI, `selectedPromptVariant` state, `handlePromptVariantChange` handler, `canUsePromptVariantControls` and `showPromptVariantControls` derived, and both `prompt_variant` attach sites on the outgoing user message metadata and stream request body. The modal no longer sends `prompt_variant` — the endpoint defaults to lite.

### 13.2 Tests

New and updated tests (all passing):

- `build-lite-prompt.test.ts`: expanded from 5 → 17 tests. Added coverage for the new section order, per-context workflow rendering (`global` / `project` / `daily_brief`), cross-context brief append, member-role conditional (solo, multi-member, `project_create`), skill-catalog table format, absorbed operating-strategy rules, trimmed safety pointers, and static-prefix byte equality across contextTypes.
- `build-lite-prompt-preview.test.ts`: removed the `buildMasterPrompt` mock + `current_v2` assertions; aligned section order to the new ordering.
- `prompt-variant.test.ts`: rewritten to assert labels only.
- `routes/api/agent/v2/stream/server.test.ts`: replaced the admin-gate test with one asserting that `lite_seed_v1` passes through without consulting `admin_users`.
- `routes/api/admin/chat/lite-prompt-preview/server.test.ts`: removed stale `include_current_v2: true` from the test body.
- `agent-chat-session.test.ts`: rewrote the variant-helper test to reflect collapsed behavior (both constants alias lite, normalize/resolve simplified).

Final sweep: **61 test files, 310 tests passing** across `agentic-chat`, `agentic-chat-v2`, `agentic-chat-lite`, `routes/api/agent`, `routes/api/admin/chat`, and `lib/components/agent`.

### 13.3 Deltas from the spec

- **Frontend UI cleanup added mid-implementation.** The original spec did not call for frontend work, but the legacy "FastChat v2 / Lite seed" admin dropdown in `AgentChatModal.svelte` was pointing at a removed runtime path. The dropdown was removed and the variant-helper functions in `agent-chat-session.ts` were collapsed to lite-only. Behavior is identical (every session ran lite anyway under backward-compatible server validation), but the UI no longer misleads admins.
- **`safety_data_rules` kind flipped to `mixed`.** Spec §4.2 listed it as "static-ish"; I used the existing `mixed` literal from the `LitePromptSectionKind` union so the conditional member-role bullet is accurately reflected in observability tooling.
- **Daily-brief block location.** Spec §5.6 placed all per-context guidance (including daily-brief) inside `focus_purpose`. Implementation followed the spec.
- **Skill table format.** Spec §5.4 proposed `| Skill ID | Description |`. Implemented exactly — verified same source (`listAllSkills` → `id` + `summary`) as the old prose form.

### 13.4 Deferred work

Still in scope for the separate efforts listed in §9:

- §9.1 Capability → skill runtime routing.
- §9.2 Skill → tool registry surfacing.
- §9.3 `project_write` / `project_notes` tool surface profiles.
- §9.4 Write-outcome ledger for final responses.
- §9.5 Document `type_key` coercion fix.
- §9.6 Per-project `member_count` in global bundles (blocks member-role rendering in non-project contexts).

None of these block the lite-only runtime. They are the next architectural investments per §9.

### 13.5 Validation

- **Typecheck**: 0 new errors on touched files; pre-existing errors in unrelated files (`entity-resolution.ts`, `voiceRecording.service.ts`, `overdue-task-batches.ts`, layout/retargeting/public-pages) verified via `git diff HEAD` showing no touches.
- **Lint**: clean on every file edited in this change.
- **Tests**: 61 files × 310 tests passing.
- **Runtime**: not yet replayed against the fantasy-novel scenario; replay verification remains open per acceptance criterion §8.11.

---

## 14. Post-Replay Follow-Up — 2026-04-17

The 2026-04-17 replay session (`3283045b-7c5c-4628-a231-1df5010a081e`) ran the consolidated prompt end-to-end for the first time. It improved every operational metric (lowest tokens + cost on record, zero discovery overhead) but surfaced three new problems that this follow-up addresses. See the [benchmark comparison in the audit](../reports/agentic-chat-fastchat-vs-lite-fantasy-novel-flow-audit-2026-04-15.md) for the full numeric comparison.

### 14.1 Findings from the replay

- **P0 scratchpad leak on Turn 1.** Grok-4.1-fast echoed ~2,000 tokens of planning commentary into the user-visible response, paraphrasing prompt section headers verbatim (`Final-response rules:`, `Operating Strategy:`, `Response should:`) before writing the actual reply. Root cause: two content sources in the message list invited mirroring — the write-ledger's own `Final-response rules:` bulleted block, and the new imperative sub-headings (`Communication pattern:`, `Entity resolution order:`, `How to pick a skill:`) added to `operating_strategy` in §5.2.
- **P0/P1 final-response grounding still weak.** Turn 2 claimed "Created 5 new revision tasks" but named only one in bullets. Turn 3 rendered an empty `**Created:**` header with no document name. The write-ledger was being injected, but its format (bulleted imperative "Final-response rules:" block) was being mirrored instead of consumed.
- **P3 Turn 1 prompt size.** The always-render timeline frame added ~100 tokens on `project_create` with zero signal value; the cache-stability argument does not hold because `focus_purpose` at position 6 already varies per context.

### 14.2 Changes landed

**Prompt builder (`apps/web/src/lib/services/agentic-chat-lite/prompt/build-lite-prompt.ts`)**

- `buildOperatingStrategySection`: removed the three imperative sub-headings (`Communication pattern:`, `Entity resolution order:`, `How to pick a skill:`) and inlined their guidance into the single `How to act:` bullet list. Added a closing sentence: "Your user-facing response must be direct prose for the user — never a plan, checklist, or paraphrase of these instructions."
- `buildSafetyDataRulesSection`: added a new first bullet that names the specific headers Grok mirrored (`Safety and Data Rules`, `Operating Strategy`, `Final-response rules`, `Communication pattern`, write-ledger labels) and tells the model to write directly to the user.
- Reverted `timeline_recent_activity` to skip entirely for `project_create` via a new `shouldRenderTimelineSection(focus)` guard. Non-`project_create` contexts still fall through to `frame_only` when no project signal is loaded, so time-relative queries still work without project data. Commented the reasoning inline.

**Write-ledger (`apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator/write-ledger.ts`)**

- Replaced the imperative block output with an XML-wrapped YAML-like data block plus a single prose grounding sentence. Before: `[Write Ledger …]` + `Successful writes (N):` + bulleted entries + `Final-response rules:` + 4-bullet rules list. After: `<write_ledger>` + `successful_writes: # count=N` + YAML rows + `failed_writes: # count=N` + `</write_ledger>` + one sentence beginning "Ground your next user-facing response strictly in the ledger above…". The model now treats the block as structured context to consume rather than a rules list to paraphrase.
- Added `escapeYamlString`, `describeEntryAsYaml`, `describeFailureAsYaml` helpers. Removed old `describeEntry` / `describeFailure` and the "Final-response rules" block.

**Sanitizer (`apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator/assistant-text-sanitization.ts`)**

- Extended `SCRATCHPAD_SENTENCE_PATTERNS` with ~20 new patterns targeting the Grok-4.1-fast prompt-section mirroring observed in the replay: header echoes (`^final-response rules:`, `^operating strategy:`, `^safety and data rules:`, `^communication pattern:`, `^entity resolution order:`, `^how to pick a skill:`, `^response (should|structure):`, `^final response structure:`), narration openers (`^follow additional instructions`, `^this is (post|pre)-tool`, `^the tool call (succeeded|failed|returned)`, `^counts include`, `^in (my|the) tool call`, `^in the (human|user) message`, `^lead-in was`, `^no more tool calls`, `^ground(ing|ed) (in|the response)`, `^mention every ... writ`, `^do not claim …`, `^disclose (each|every) failed`, `^use (this|the) ledger`, `^keep (it|the response) (proactive|direct|useful)`), and ledger wrapper labels (`^<write_ledger`, `^successful[_\s]writes:`, `^failed[_\s]writes:`).
- Added `stripLeadingListMarker` helper to detect patterns even when emitted as bulleted lines (`- Mention every Successful write…`, `- Operating Strategy:`). Patterns now match against both the raw normalized sentence and the de-bulleted form.

### 14.3 New tests

- `write-ledger.test.ts`: replaced the legacy-format assertions with structured-format assertions (`<write_ledger>`, `successful_writes: # count=N`, YAML rows, single-sentence grounding instruction). Added an empty-section test covering `failed_writes: # count=0` / `[]` sentinel.
- `assistant-text-sanitization.test.ts` (new file, 5 tests): covers the exact Grok-style leak from the 2026-04-17 replay (full turn-1 scratchpad stripped to just the real response), legitimate prose with the word "rules" in it (no false positives), legacy scratchpad patterns, ledger-wrapper mirroring, and clean-text passthrough.
- `build-lite-prompt.test.ts`:
    - Replaced the operating-strategy test to assert the sub-headings are **absent** and the inline guidance is still present (`1-2 sentence lead-in`, `intent only`, `Resolve entity targets`, `skill_load`, `two or more related writes`, `never a plan, checklist, or paraphrase of these instructions`).
    - Added a safety anti-echo test: asserts the anti-echo bullet is the first bullet in `safety_data_rules` and lists the mirrored header strings.
    - Updated the `project_create` test to assert timeline is **not** rendered (section absent, no "Timeline frame:" / "Project status:" strings).

### 14.4 Validation

- **Tests**: 62 files × 317 tests passing (up from 61 × 310 before this follow-up; net +7 tests from the sanitizer file and new safety/timeline assertions, minus renamed assertions).
- **Typecheck**: 0 new errors.
- **Lint**: clean on every file in this follow-up.
- **Replay**: not yet re-run. The next replay should verify (a) Turn 1 content no longer contains `Final-response rules:` / `Operating Strategy:` header echoes, (b) Turn 2/3 final responses name every ledger row, and (c) `project_create` prompt is measurably smaller (~100 tokens).

### 14.5 Open architectural question

If the replay still shows leakage after these three layers (prompt prevention + ledger reformat + sanitizer expansion), the next escalation is an assistant-message prefill in `streamFastChat` to bias the first streamed token away from `Follow additional instructions.`. This was intentionally held back this round because provider-side prefill semantics vary (OpenRouter passes through to Grok differently than Claude/OpenAI), and the three lower-risk layers should be measured first.

---

## 15. Second Post-Replay Pass — 2026-04-17 (evening)

The 2026-04-17 replay after the §14 fixes (session `1af1c70b-dd20-463d-81bd-d23e2454ce30`) confirmed the scratchpad leak was eliminated and Turn 3 hit every grounding acceptance criterion in spec §8 for the first time. But two real issues remained — Turn 1 graph edges dropped from 9 → 2, and Turn 2 still named only 3 of 7 successful writes — and a user-facing review flagged additional content to trim. This pass addresses all of it.

### 15.1 Findings

- **Turn 1 graph shape regressed.** Same inputs as the earlier runs, but only 2 edges produced. The consolidated `PROJECT_CREATE_WORKFLOW_LITE` block still said "Every relationships item must reference entities with temp_id and kind" (shape rule) but had dropped the implicit nudge to actually emit goal↔task containment edges.
- **Turn 2 under-enumerated.** Scratchpad was gone, but the model named 3 of 7 writes because the ledger's single soft grounding sentence did not force per-item enumeration.
- **Section ordering read backwards.** Describing _how to act_ before _what is available_ left the model doing strategy reasoning against tools it hadn't seen yet.
- **Boilerplate tool-surface line.** `"Tool surface for this context: / - Tool schemas are supplied through model tool definitions, not duplicated in this prompt text."` added zero information.
- **Recent-change entries showed kind-only labels.** Rows rendered as `task (task_id: ...) task created` because the project-log JSON payloads didn't expose `title` and the formatter had no entity-level fallback.
- **`context_inventory_retrieval` was bloated.** Four info sections (`Loaded data snapshot`, `Retrieval boundaries / Loaded / Not preloaded / Fetch only when needed / Notes`) with rules the agent already has in `operating_strategy` + `safety_data_rules`.

### 15.2 Changes landed

**Section order reversed for "what → how" (`build-lite-prompt.ts`)**

New order: `identity_mission → capabilities_skills_tools → tool_surface_dynamic → operating_strategy → safety_data_rules → focus_purpose → location_loaded_context → timeline_recent_activity → context_inventory_retrieval`. Describe what the agent can do (capabilities + skills + tools) before telling it how to use them (strategy + safety).

**Tool-surface boilerplate removed (`build-lite-prompt.ts`)**

Dropped the `Tool surface for this context: / - Tool schemas…` lead-in from `buildToolSurfaceDynamicSection`. The Discovery / Preloaded lists render directly.

**Goal↔task containment re-emphasized (`build-lite-prompt.ts`)**

Added a bold `**Connect the graph.**` bullet to `PROJECT_CREATE_WORKFLOW_LITE`: _"When the user has both a goal and tasks, emit containment relationships linking every task (child) to that goal (parent). A project with 1 goal + N tasks should produce N+ goal-task containment edges; leaving tasks unlinked defeats the graph model."_ Also expanded the relationship-shape bullet to explicitly show the `{ from, to }` form with an explicit `type`.

**Write-ledger enumeration hardened (`write-ledger.ts`)**

- Switched YAML entries to numbered list (`1. tool: …`, `2. tool: …`, `3. tool: …`) so every row has a positional anchor.
- Replaced the single soft grounding sentence with a hard enumeration imperative: _"Enumeration requirement: your next user-facing response MUST reference each of the N successful writes above by title (or, when no title exists, by what changed) at least once. Missing a title makes the response incomplete. Do not batch multiple writes under a single collective noun ('created 5 tasks' without naming each); name every one."_ Separate imperative for failed writes and a final no-unsupported-claims sentence.

**Recent-change labels enriched with entity titles (`context-loader.ts`)**

The underlying data gap: `onto_project_logs` rows expose `after_data` / `before_data` JSONB payloads, but those payloads don't reliably carry `title`/`name`, so `extractProjectLogTitle` returns null. Added a fallback layer:

- New `buildEntityTitleLookup` helper that builds a `Map<\`${kind}:${id}\`, string>`from any of`projects / goals / milestones / plans / tasks / documents / events / risks` already loaded in the snapshot.
- New optional `titlesByKindId` param on `buildProjectIntelligenceSnapshot` and `buildRecentChanges`. Inside, the snapshot builder merges its own core entities (projects/goals/milestones/tasks/events) with the caller-supplied map so plans + documents also get covered.
- `buildRecentChanges` uses the map as a fallback only when `extractProjectLogTitle` returns null — never overrides a real log title.
- Updated three call sites (`mapProjectContext`, RPC-backed global context builder, fallback global context builder) to pass the extended map using the plans/documents they already have loaded.

Result: entries now render as `task (task_id: xxx) "Write Chapter 2 dialogue" created in The Last Ember.` rather than `task (task_id: xxx) task created in The Last Ember.`

**`context_inventory_retrieval` trimmed to counts + one-line fetch rule (`build-lite-prompt.ts`)**

Dropped `Structured context loaded:`, `Source:`, `Empty loaded sets:` from the snapshot block. Dropped the `Retrieval boundaries: / Loaded / Not preloaded / Fetch only when needed / Notes` stanza entirely. What remains:

```
Loaded counts: documents: 1, events: 0, goals: 1, members: 1, milestones: 0, plans: 0, tasks: 7.
Fetch an entity directly when it is not already in the loaded counts above and the user asks about it; otherwise answer from loaded context.
```

The `project_create` branch was trimmed in the same pass — kept the three-line creation-boundary list, dropped the retrieval-map sub-sections.

Also removed the now-unused `formatContextSource` helper.

### 15.3 New tests

- `build-lite-prompt.test.ts`:
    - Section-order assertions updated for the new `identity → capabilities → tool_surface → operating_strategy → safety → …` order, both in the main global test and the `project_create` test.
    - `project_create` test now asserts presence of the `Connect the graph` bullet and the containment wording.
    - `project_create` test also asserts absence of the removed tool-surface boilerplate.
    - New test: `renders the trimmed context_inventory_retrieval section as counts + one fetch rule` — asserts `Loaded counts:` is present and `Structured context loaded:` / `Source:` / `Empty loaded sets:` / `Not preloaded:` / `Fetch only when needed:` / `Notes:` / `Retrieval boundaries:` are absent.
    - Existing "project entity focus" test updated: asserts `Loaded counts:` is present and `Loaded data snapshot:` / `Structured context loaded:` / `Top-level keys:` are absent.
    - First global-seed test flipped the `toContain('Tool schemas are supplied through model tool definitions')` assertion to `not.toContain` and added the same for `Tool surface for this context:`.
- `build-lite-prompt-preview.test.ts`: section-order expectation updated to the new order.
- `write-ledger.test.ts`:
    - Main test renamed to "renders an XML/YAML-framed ledger with numbered entries and enumeration imperative"; asserts numbered entries (`1. tool: …`), the `MUST reference each of the N` phrasing, `Missing a title makes the response incomplete`, `Do not batch multiple writes`, failed-write disclosure imperative, and `Do not claim any state_key`. Negative assertions ensure the old "Final-response rules" / "Use this ledger as the source of truth" / "Ground your next user-facing response strictly" phrasings are gone.
    - New test: `pluralizes the enumeration sentence for multi-write turns` — asserts `successful_writes: # count=3`, numbered `1.`/`2.`/`3.` rows, and `MUST reference each of the 3 successful writes`.

### 15.4 Validation

- **Tests**: 62 files × 319 tests passing (up +2 tests from §14's 317 for the new ledger + inventory coverage).
- **Typecheck**: 0 new errors; the three pre-existing `entity-resolution.ts` narrowing errors remain as documented in §13.5.
- **Lint**: clean after removing the orphaned `formatContextSource` helper.
- **Replay**: not yet re-run. Next replay should verify (a) Turn 1 produces ≥N goal-task containment edges for an N-task + 1-goal create, (b) Turn 2 names every ledger entry in prose, (c) Recent project changes render entity titles (not just `kind`), and (d) the prompt is measurably smaller thanks to the context-inventory trim.

### 15.5 Still open

Same items as §14.5 plus:

- **Prefill** for Grok stays deferred until a replay shows whether the enumeration imperative and section reordering are sufficient.
- **RPC-level title population.** The fallback lookup fixes the symptom but `onto_project_logs` would ideally expose titles in its snapshot payloads at write time, so global/fallback contexts without document/plan data loaded also benefit. Not urgent.

---

## 16. Ledger Imperative Revert — 2026-04-17 (late)

The §15 hardening of the write-ledger grounding instruction broke Turn 1 catastrophically in replay `1aea16fb-0d50-44ba-a353-7502175e7192`. This section reverts exactly that one change and keeps every other §15 win intact.

### 16.1 Regression attribution

The `1aea16fb` replay surfaced three regressions vs `1af1c70b`:

| #   | Regression                                                                                                                                                                                                  | Turn | Attribution                                                             |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- | ----------------------------------------------------------------------- |
| A   | Evaluation-mode scratchpad: model narrated "Previous assistant response already did this perfectly", hallucinated a `<policy>` tag, transcribed a response mid-sentence, truncated at "Outline first three" | 1    | **§15 change #6 (hardened ledger imperative), high confidence**         |
| B   | Zero related-task updates (was 3 in `1af1c70b`: magic system, blacksmithing, Aethermoor)                                                                                                                    | 3    | §15 change #6 downstream effect + model variance, medium-low confidence |
| C   | Final response omits the newly created document's title — says "This is now linked to your project…" with no ID or title                                                                                    | 3    | §15 change #6, medium confidence                                        |

**Direct evidence for regression A**: the Turn 1 scratchpad literally quotes §15's hardened imperative back as grading criteria:

> _"The final response must: - Reference each successful write by title: project 'The Last Ember', goal…, each of the 7 tasks by title. - Do not batch: name every one."_

That wording maps 1:1 onto the §15 write-ledger phrasing:

> _"MUST reference each of the N successful writes above by title … Do not batch multiple writes under a single collective noun ('created 5 tasks' without naming each); name every one."_

Three specific phrasings in §15 change #6 collectively read like a grading rubric:

1. `MUST reference each of the N` — capitalized counting imperative
2. `Missing a title makes the response incomplete` — judge-like verdict language
3. `Do not batch multiple writes under a single collective noun ('created 5 tasks' without naming each)` — quoted counter-example in style-guide form

Grok-4.1-fast treated this as evaluation criteria, entered evaluation mode, and hallucinated a "previous assistant response" to grade. Regressions B and C are plausibly downstream fallout (state contamination across turns + possible self-minimization to make the "rubric" easier to satisfy).

### 16.2 Scope of the revert

**Changed:** `write-ledger.ts` `formatWriteLedgerMessage` — the 3-sentence rubric-style grounding was replaced by a single declarative sentence.

Before (§15, broken):

```
Enumeration requirement: your next user-facing response MUST reference
each of the N successful writes above by title (or, when no title
exists, by what changed) at least once. Missing a title makes the
response incomplete. Do not batch multiple writes under a single
collective noun ("created 5 tasks" without naming each); name every one.

Each of the M failed writes above must be disclosed as not persisted,
with the reason.

Do not claim any state_key, type_key, new_parent_id, update_strategy,
or linking that does not appear in a ledger row.
```

After (§16, shipped):

```
Your next user-facing response names each listed successful write by
title (or by what changed when no title exists) and discloses each
listed failed write as not persisted. Do not claim any state_key,
type_key, new_parent_id, update_strategy, or linking that does not
appear in a ledger row.
```

The differences that matter:

| Aspect           | §15 (rubric)                                             | §16 (declarative)                     |
| ---------------- | -------------------------------------------------------- | ------------------------------------- |
| Verb mood        | `MUST reference`                                         | `names`                               |
| Counting         | `each of the N`                                          | `each listed`                         |
| Grading language | `Missing a title makes the response incomplete`          | removed                               |
| Counter-example  | `Do not batch … ('created 5 tasks' without naming each)` | removed                               |
| Sentence count   | 3 imperatives                                            | 1 declarative + 1 negative constraint |

The enumeration intent survives in _"names each listed successful write by title"_. The enumeration pressure comes from the **numbered-entry data structure** (`1. tool: …`, `2. tool: …`), which was kept.

### 16.3 What was **not** changed

Every other §15 win is intact:

- §15 section reorder (identity → capabilities → tool_surface → operating_strategy → safety → dynamic). Kept.
- §15 tool-surface boilerplate removal. Kept.
- §15 `**Connect the graph**` containment bullet in `PROJECT_CREATE_WORKFLOW_LITE`. Kept (unambiguously worked — Turn 1 edges went 2 → 9).
- §15 expanded relationship shape (`{from, to, type}`). Kept.
- §15 numbered ledger entries (`1. tool: …`). Kept.
- §15 `titlesByKindId` recent-change fallback. Kept.
- §15 trimmed `context_inventory_retrieval`. Kept.
- `assistant-text-sanitization.ts` was **not expanded** this pass, by explicit direction.

### 16.4 Known trade-off

**Turn 2 under-enumeration remains open.** Both `1af1c70b` (soft grounding) and `1aea16fb` (hardened rubric) landed Turn 2 at about 3 of 6–7 writes named. The hardened rubric did not actually fix Turn 2 and broke Turn 1 in the process; the only prompt-layer phrasing that would force enumeration triggers evaluation mode.

Conclusion: **reliable Turn-level enumeration completeness is an architectural gap (audit §9.4), not a prompt problem.** The fix belongs at the harness layer — post-response completeness check against the ledger, with a re-prompt when entries are missing. The revert holds Turn 2 at "known incomplete, not broken" until that lands.

### 16.5 Tests

`write-ledger.test.ts`:

- Renamed main test to `"renders an XML/YAML-framed ledger with numbered entries and declarative grounding"`.
- Added positive assertions: `Your next user-facing response names each listed successful write`, `discloses each listed failed write as not persisted`, `Do not claim any state_key`.
- Added negative assertions: `MUST reference`, `Missing a title makes the response incomplete`, `Do not batch multiple writes under a single collective noun`, `Enumeration requirement` (plus the existing legacy ones: `Final-response rules`, `Use this ledger as the source of truth`, `Ground your next user-facing response strictly`).
- Kept numbered-entry assertions: `1. tool: create_onto_task`, `2. tool: …`, `3. tool: …`.
- Renamed the pluralization test to `"keeps numbered entries stable across single-write and multi-write turns"` since the declarative sentence no longer pluralizes per count.

### 16.6 Validation

- **Tests**: 62 files × 319 tests passing.
- **Typecheck**: 0 new errors.
- **Lint**: clean on touched files.
- **Replay**: not yet re-run. Next replay should verify (a) Turn 1 produces clean prose without evaluation-mode scratchpad, (b) Turn 3 related-task coverage recovers to ≈ `1af1c70b` levels, (c) `Connect the graph` still drives ≥N edges. If Turn 2 enumeration is still ~3 of N, that confirms the architectural gap and we defer fixing it to a harness-layer completeness check.

### 16.7 Lesson captured for future prompt-layer work

Imperative language with **any** of these patterns will trigger Grok-4.1-fast evaluation mode:

- Capitalized `MUST` or `SHOULD NOT` at sentence start.
- "Missing X makes the response incomplete" (grading verdict).
- Quoted counter-example in parentheses (style-guide shape).
- Numbered requirements labeled as "criteria" or "rules".

Architectural takeaway: prompts that read like a grading rubric get graded instead of executed. Preserve information density with structured data (numbered lists, YAML/XML wrappers) and express requirements as declarative sentences about what the response "names" or "discloses", not as an "enumeration requirement" with quantifiers and counter-examples.
