<!-- thoughts/shared/research/2025-12-24_downstream-prompt-alignment-analysis.md -->
# Downstream Prompt Alignment Analysis

**Date:** 2025-12-24
**Author:** Codex (Analysis)
**Status:** Draft
**Scope:** Agentic chat downstream prompts after base prompt restructure

---

## Executive Summary

The base prompt restructure now provides role, platform context, data model, operational guidelines, behavioral rules, error handling, and proactive intelligence. Several downstream prompts still restate these same rules or contain conflicting instructions. This creates bloat and can send mixed signals to agents. The update strategy should be:

1. **Base prompt = canonical source of global rules** (identity, platform, data model, tool patterns, language rules, task philosophy).
2. **Downstream prompts = context deltas only** (what is unique about this mode, what to emphasize, what to avoid).
3. **Resolve conflicts explicitly** (write-confirmation and task creation rules must not diverge).

Below is a prompt-by-prompt audit with specific update recommendations and priorities.

---

## Inventory & Usage Map

| Prompt | File | Used By | Current Role | Update Priority |
|---|---|---|---|---|
| Project Workspace Prompt | `apps/web/src/lib/services/agentic-chat/prompts/config/context-prompts.ts` | `buildPlannerSystemPrompt()` | Adds project-scoped rules and workflow | High |
| Project Creation Prompts | `apps/web/src/lib/services/agentic-chat/prompts/config/context-prompts.ts` | `buildPlannerSystemPrompt()` | Deep project creation guidance | High |
| Brain Dump Prompts | `apps/web/src/lib/services/agentic-chat/prompts/config/context-prompts.ts` | `buildPlannerSystemPrompt()` | Exploration + gentle structure guidance | Medium |
| Context Type Guidance | `apps/web/src/lib/services/agentic-chat/prompts/config/context-prompts.ts` | `buildSessionContext()` | One-paragraph context descriptions | Medium |
| Actionable Insight Agent | `apps/web/src/lib/services/agentic-chat/prompts/actionable-insight-agent.ts` | Research/insight flow | Read-only analysis agent | Medium |
| Executor Prompts | `apps/web/src/lib/services/agentic-chat/prompts/config/executor-prompts.ts` | `buildExecutorSystemPrompt()` | Focused task executor | Low |

---

## Cross-Cutting Findings

1. **Redundant rules inflate context**
   - Project Workspace + Brain Dump + Project Creation all repeat base rules (language, task philosophy, read/write behavior).
   - These should live once in the base prompt and only be referenced implicitly in downstream prompts.

2. **Conflicting write-confirmation behavior**
   - Base prompt says confirm before write operations.
   - Project Creation workflow says “Create Project Immediately,” which could override confirmation requirements.
   - This needs explicit alignment so the agent never receives mixed signals.

3. **Context type guidance is now part of every base prompt**
   - The guidance text is longer than it needs to be. Each line should be “one sentence of context + one behavioral cue.”
   - Excess text is multiplied across every prompt assembly.

4. **Legacy/unused prompts may mislead future maintainers**
   - Legacy prompts that are no longer referenced can drift and confuse maintainers.
   - Remove or clearly deprecate them to avoid stale guidance.

---

## Prompt-by-Prompt Recommendations

### 1) Project Workspace Prompt
**File:** `apps/web/src/lib/services/agentic-chat/prompts/config/context-prompts.ts`

**Current issues:**
- Repeats base rules (read vs write, task creation philosophy, tool usage order).
- Contains multiple workflow steps that duplicate Operational Guidelines in the base prompt.

**Recommended update:**
- Reduce to **context delta** only: project-scoped assumption, what types of requests to expect (summaries, risks, decisions), and any project-specific behaviors not covered by base.
- Keep the “use search if name is fuzzy” only if it is uniquely project-scoped; otherwise defer to base rule.

**Example delta focus:**
- “You are scoped to this project; do not ask which project.”
- “Default to project-level summaries and risks when user asks broad questions.”
- “If project_id is known, include it in search tools for disambiguation.”

**Priority:** High

---

### 2) Project Creation Prompts
**File:** `apps/web/src/lib/services/agentic-chat/prompts/config/context-prompts.ts`

**Current issues:**
- Redundant with base prompt (ontology/data model, user-facing language rules).
- Conflicting write behavior: “Create Project Immediately” vs base confirm-before-write.

**Recommended update:**
- Treat this prompt as **delta + deep project-creation specifics** only.
- Remove repeated language rules (already covered in base). Keep only if there is a project-create nuance.
- Resolve write-confirmation explicitly: “If the user is in project_create context because they asked to create a project, treat that as implicit confirmation; otherwise ask before create.”
- Keep prop naming conventions and facets guidance; those are project-create specific.

**Priority:** High

---

### 3) Brain Dump Prompts
**File:** `apps/web/src/lib/services/agentic-chat/prompts/config/context-prompts.ts`

**Current issues:**
- Contains multiple overlapping sections (approach, anti-patterns, transitions) that restate the same core rules.
- Repeats task creation restraint already in base prompt.

**Recommended update:**
- Compress to a **single short section** that preserves tone and intent:
  - Be a sounding board.
  - Ask gentle, minimal questions.
  - Do not force structure until user signals readiness.
- Keep the transition cues (“I should make a plan”) but remove repeated task-creation rules.

**Priority:** Medium

---

### 4) Context Type Guidance
**File:** `apps/web/src/lib/services/agentic-chat/prompts/config/context-prompts.ts`

**Current issues:**
- Longer than needed; now appears in every base prompt.
- Duplicates concepts covered elsewhere (base platform context, project workspace prompt).

**Recommended update:**
- Reduce each context to **1-2 sentences**:
  - One sentence describing scope.
  - One short behavioral cue (e.g., “default to project-specific tools”).
- Ensure “project_create” and “brain_dump” explicitly note “detailed guidance follows” to prevent overloading this section.

**Priority:** Medium

---

### 5) Actionable Insight Agent Prompt
**File:** `apps/web/src/lib/services/agentic-chat/prompts/actionable-insight-agent.ts`

**Current issues:**
- Contains a heavier BuildOS ontology description than required for a read-only summary agent.
- Includes hard-coded state_key values that may drift.

**Recommended update:**
- Trim to minimal context: “read-only, list then detail, return concise insights with IDs.”
- Replace static state_key lists with generic guidance (“use state_key as returned by tools”).
- Add explicit instruction that results are internal for planner synthesis (not user-facing).

**Priority:** Medium

---

### 6) Executor Prompts
**File:** `apps/web/src/lib/services/agentic-chat/prompts/config/executor-prompts.ts`

**Current issues:**
- Mostly aligned; minimal changes needed.

**Recommended update (optional):**
- Add a brief note on how to report partial failures and missing data (mirror base error-handling guidance).
- Keep the prompt short; executor context should remain minimal.

**Priority:** Low

---

## Suggested Refactor Pattern (Optional)

To keep downstream prompts lean and consistent, consider:

1. **Base prompt = canonical rules**
   - All global rules (language, task philosophy, read/write behavior, error handling, proactive intelligence) live only in base.

2. **Context prompts = delta blocks**
   - Each context prompt contains only what is unique to that mode.

3. **Shared prompt snippets for repeatable context-specific rules**
   - Example: a small helper for “project scope reminder” or “brain dump mode cue.”

4. **Explicit conflict resolution**
   - If a context must override a base rule, say so explicitly in the context prompt.

---

## Proposed Update Order

1. Project Creation prompts (resolve write-confirmation conflict first)
2. Project Workspace prompt (trim repetition)
3. Context Type Guidance (shrink global token footprint)
4. Brain Dump prompt (compress overlapping sections)
5. Actionable Insight Agent prompt (trim and align data model language)
6. Executor prompt (optional refinements)
7. Project Creation Enhanced (deprecate or align)

---

## Progress Updates

- 2025-12-24: Updated Project Creation prompts to clarify write confirmation and reduce redundant user-communication rules.
- 2025-12-24: Removed legacy project creation prompt file (unused).
- 2025-12-24: Simplified Project Workspace prompt to context-only deltas and removed duplicated global rules.
- 2025-12-24: Compressed Context Type Guidance to 1-2 sentence scope + behavior cues per context.
- 2025-12-24: Compressed Brain Dump guidance to a single concise section.
- 2025-12-24: Trimmed Actionable Insight Agent prompt to read-only essentials.
- 2025-12-24: Trimmed Executor prompt and added minimal constraints/error-handling guidance.
- 2025-12-24: Aligned docs to replace deleted `project-creation-enhanced.ts` references with `context-prompts.ts`.
- 2025-12-24: Removed duplicate last-turn system message injection in planner history (last-turn context now only in base prompt).
- 2025-12-24: Updated response synthesis prompts and fallbacks to avoid internal tool names and raw error strings.

---

## Expected Outcomes

- 15–30% token reduction in full planner prompt assembly for non-project-create contexts.
- Fewer contradictory instructions for write operations.
- Clearer separation of “global rules” vs “context-specific behavior.”
- Better maintainability: updates to core rules happen in one place.
