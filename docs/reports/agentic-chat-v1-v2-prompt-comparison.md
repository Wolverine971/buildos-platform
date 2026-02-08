<!-- docs/reports/agentic-chat-v1-v2-prompt-comparison.md -->

# Agentic Chat Prompt Comparison (V1 vs V2 FastChat)

Date: 2026-02-07

## Scope & Sources

**V2 FastChat prompt (current):**

- `apps/web/src/lib/services/agentic-chat-v2/master-prompt-builder.ts`

**V1 planner prompt stack (previous):**

- `apps/web/src/lib/services/agentic-chat/prompts/prompt-generation-service.ts`
- `apps/web/src/lib/services/agentic-chat/prompts/config/planner-prompts.ts`
- `apps/web/src/lib/services/agentic-chat/prompts/config/context-prompts.ts`

**Prompt size reference:**

- `apps/web/docs/features/agentic-chat/AGENTIC_CHAT_V2_CONTEXT_AND_TOOLS_SPEC.md`

---

## Executive Summary

V1’s prompt stack is a multi‑section, context‑aware instruction set that teaches the model how BuildOS works, how to use tools safely, how to handle ontology structure, and how to behave conversationally.  
V2 FastChat replaced this with a minimal prompt containing only high‑level identity, a brief ontology description, and short behavioral notes. The result is a **large loss of operational guidance**, especially around tool discipline, ontology semantics, and user‑facing language rules.

**Net effect:** V2 is faster and simpler but likely to regress in precision, structure, and consistency unless we re‑introduce a few critical blocks.

---

## Prompt Structure: V1 vs V2

### V1 (Planner/Legacy)

- **Architecture:** assembled across multiple sections with context‑specific augmentations.
- **Granular content:** tool protocols, update strategies, ontology graph rules, doc hierarchy constraints, user language rules, task creation rules, and context‑specific guidance.
- **Role clarity:** planner vs executor responsibilities and strategy guidance.
- **Context‑aware:** explicit behavior for project/workspace, project_create, brain_dump, and ontology modes.

### V2 (FastChat)

- **Architecture:** single short prompt string + tags:
    - `<instructions>` identity + minimal guidance
    - `<context>` raw context fields
    - `<data>` JSON blob
- **No context‑specific operational guidance.**
- **No explicit tool usage protocol.**
- **No explicit ontology rules beyond a one‑line overview.**

---

## Instruction Coverage Matrix

| Category                  | V1 Prompt Coverage                                        | V2 Prompt Coverage        | Impact                          |
| ------------------------- | --------------------------------------------------------- | ------------------------- | ------------------------------- |
| Ontology graph structure  | Detailed hierarchy + relationship rules                   | Minimal one‑line overview | Loss of structure fidelity      |
| Document hierarchy        | Explicit “doc_structure is source of truth”, no doc edges | Single line note          | Risk of doc mis‑links           |
| Tool usage                | Read vs write rules, list/search first, never guess IDs   | “Use tools” only          | Tool misuse + empty args        |
| Update strategy           | append/merge/replace rules + merge_instructions           | None                      | Risk of overwriting content     |
| Task creation rules       | Explicit do/do not create tasks                           | None                      | Over‑creation of tasks          |
| User‑facing language      | “Never say ontology/type_key”                             | None                      | Internal jargon leaks           |
| Context‑specific behavior | project, project_create, brain_dump, ontology             | None                      | Tone + behavior drift           |
| Proactive insights        | Detailed “when/how”                                       | Minimal                   | Less consistent insight quality |

---

## Context Loss (Magnitude)

From `AGENTIC_CHAT_V2_CONTEXT_AND_TOOLS_SPEC.md`:

- **V1 planner system prompt:** ~3.3k–5.4k tokens (context dependent)
- **V2 FastChat system prompt:** ~85–95 tokens

This is a **35x–60x reduction** in instruction density. It’s not just “simpler”; it removes entire classes of guidance (tool discipline, ontology constraints, user tone rules).

---

## Specific Areas of Lost Guidance

### Ontology & Structure (High Risk)

V1 teaches:

- Preferred project graph hierarchy and valid skips
- Relationship rules (supports_goal, targets_milestone, etc.)
- Document tree rules (doc_structure as canonical source)
- Rules for risks, requirements, sources, metrics

V2 only states:

- “BuildOS is graph‑based” and “docs are in doc_structure”

### Tool Use Discipline (High Risk)

V1 teaches:

- Read immediately, confirm writes
- List/search before detail tools
- Never guess IDs
- Update tools must include ID + one field

V2 only states:

- “Use tools” and “pass valid arguments”

### Personality & UX (Medium Risk)

V1 teaches:

- Reduce user cognitive load; be supportive
- Never expose internal jargon
- Avoid over‑interrogating
- Clear boundaries on task creation

V2 only states:

- “Be direct and supportive”

### Context‑Specific Behavior (High Risk)

V1 includes detailed guidance for:

- project workspace
- project_create
- brain_dump
- ontology mode override

V2 includes only a `context_type` tag with no behavioral instructions.

---

## Recommended Additions to V2 Prompt (Lean, High‑Impact)

These can be added as short blocks (aim +150–250 tokens total):

1. **Tool Protocol (Critical)**

- Read immediately, confirm writes.
- list/search → details.
- Never guess IDs; ask or search.
- Updates require ID + at least one field; never `{}`.

2. **User‑Facing Language Rules**

- Do not say: “ontology”, “type_key”, “props”, or tool names.
- Use plain language about projects/tasks/documents.

3. **Doc Hierarchy Rules**

- doc_structure is the source of truth.
- Do not create doc edges.
- Place new docs via parent_id/position.

4. **Update Strategy Rules**

- append / merge_llm / replace guidance.
- merge_llm requires merge_instructions.

5. **Context_type Mini‑Guidance**

- 1 line per context_type (project, project_create, brain_dump, ontology).
- Tells the model how to behave given the tag.

---

## Optional: Context Blocks You Can Re‑Introduce Later

If you want to bring back more of the V1 behavior without fully expanding:

- “Task creation guardrails” (future user work only).
- “Risk/requirement/metric/source” usage triggers.
- “Project hierarchy guide” (goal/plan/task structure).

---

## Conclusion

V2’s prompt is intentionally minimal, but it removed a lot of the behavior‑defining guidance that made V1 reliable: tool discipline, ontology semantics, doc rules, and user‑facing language constraints.  
Adding a small set of **tight, high‑signal blocks** will restore most of the lost reliability without ballooning token size.

If you want, I can draft a lean **V2 prompt v1.1** that adds only the critical blocks above.
