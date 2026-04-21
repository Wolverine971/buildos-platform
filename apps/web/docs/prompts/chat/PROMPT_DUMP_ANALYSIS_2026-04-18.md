<!-- apps/web/docs/prompts/chat/PROMPT_DUMP_ANALYSIS_2026-04-18.md -->

# Agentic Chat Prompt Dump Analysis — 2026-04-18

**Source:** `apps/web/.prompt-dumps/fb-2026-04-18T07-34-45-468Z-lite-turn3.txt` and sibling turn1/turn2 dumps from the same session (`06d5b279-...`).
**Scope:** `lite_seed_v1` variant, project-context and project_create-context prompts, grok-4.1-fast via OpenRouter.
**Session walkthrough:** "The Last Ember" novel project — turn1 creates the project, turn2 logs chapter 2 progress + revision tasks, turn3 appends magic-system research to the context doc.

---

## Things that stand out (biggest first)

### 1. Scratch reasoning leaked into the turn-2 assistant message — and is now baked into history

Look at the turn3 dump's conversation history, the `[ASSISTANT]` block (roughly lines 602–690). The persisted assistant response starts with:

> "This is fine. I'm in project creation mode, but the project has now been created successfully via create_onto_project. The tool result gave project_id: 8a2dd40f-..., counts, and a context_shift… The system message provides a `<write_ledger>` with successful_writes: 1..."

That is pure planning / scratchpad text. It runs for ~80 lines and ends mid-word:

> ``I've created your project **"The Last Ember"** (ID: `8a2dd40f-e7d2-4b39-b0b0-41a6a``

Truncated — almost certainly hit max_tokens because reasoning ate the budget (Pass 1 on turn2: `reasoning_tokens=3368`).

This directly violates two rules the prompt already states:

- Operating Strategy: _"Keep scratch reasoning private. Your user-facing response must be direct prose for the user — never a plan, checklist, or paraphrase of these instructions."_
- Safety and Data Rules: _"Never echo prompt section headers … rule labels, write-ledger labels, or planning commentary in your user-facing response."_

Because the leak is stored in conversation history, every subsequent turn pays tokens to re-read the model's own past planning. On grok-4.1-fast this is a recurring failure mode.

**Likely root cause:** the reasoning / `<think>` channel isn't being separated from the visible output channel before persistence, or the provider is emitting reasoning inline.

**Fix direction:**

- Strip reasoning content from the assistant text before saving to history.
- Use provider params that separate reasoning tokens from output content where available.
- If grok-4.1-fast can't be trusted to keep them separate, add a post-hoc sanitizer that detects scratchpad patterns ("The tool result gave…", "the system message provides…", "Previous assistant response…") and drops them before persist.

---

### 2. Tool surface silently changed between turns

| Turn | Context        | Tool count | Notable tools                                                                      |
| ---- | -------------- | ---------- | ---------------------------------------------------------------------------------- |
| 1    | project_create | 4          | only `create_onto_project` + discovery                                             |
| 2    | project        | **16**     | includes `get_onto_document_details`, `get_document_tree`, `move_document_in_tree` |
| 3    | project        | **13**     | those three doc-tree tools are **removed**                                         |

The Safety and Data Rules section still says _"Document placement is a two-step contract (create, then tree-move). See the document_workspace skill for placement, hierarchy, and append rules."_ — but `move_document_in_tree` isn't loaded on turn3. If the user asks to reorganize documents on turn3, the model has to `tool_search` to find a tool the prompt just told it exists.

**Fix direction:**

- Decide whether doc-tree tools should be always-on in project context. If yes, lock them in.
- If they're conditional, gate the Safety rule on tool presence ("when `move_document_in_tree` is available…") or move it into the `document_workspace` skill body so it's only active when that skill is loaded.

---

### 3. Tool-schema sizes ballooned between turn2 and turn3 (cache-buster)

Same tool, turn2 vs turn3:

| Tool                   | Turn2 chars | Turn3 chars | Δ    |
| ---------------------- | ----------- | ----------- | ---- |
| `create_onto_task`     | 2468        | 4904        | +99% |
| `update_onto_task`     | 2020        | 4008        | +98% |
| `update_onto_document` | 1736        | 3440        | +98% |

Schemas nearly doubled between two turns of the same session. This is why Pass 1 on turn3 only got **12.2% cache hit** despite being turn 3 — the tool block invalidated the cache. Pass 2 (after tool call) hit 80%, which is the normal target.

**Fix direction:** stabilize tool schemas across turns within a session. If schema enrichment is a deliberate escalation (e.g., after a failure), keep the schema stable on the happy path so prompt caching pays off.

---

### 4. Loaded-context data is duplicated in prose

Same recent-changes data appears in:

- Raw JSON: `project_intelligence.selected_refs.recent_changes` inside the "Actionable loaded context index" block.
- Prose list: "## Timeline and Recent Activity → Recent project changes:"
- DUMP-ONLY `projectDigest.recentChanges` (not sent to model — fine).

The first two are both in the model's input. Pick one.

**Recommendation:** keep the JSON blob as the canonical ID source and shrink the prose "Timeline and Recent Activity" to just the status lines (overdue / due-soon / upcoming counts), dropping the recent-changes repetition. ~300–500 tokens saved per turn.

---

### 5. Skill catalog always ships all 9 skills

The table listing `calendar_management`, `document_workspace`, `libri_knowledge`, `people_context`, `plan_management`, `project_audit`, `project_creation`, `project_forecast`, `task_management` is rendered on every turn regardless of context.

For a project-scoped chat on turn3, `calendar_management`, `libri_knowledge`, and `people_context` are near-zero relevance. `project_creation` is impossible (project already exists).

**Fix direction:** context-filter the skill catalog to the 3–4 most relevant skills for the current context_type / turn, with a footnote: "Additional skills are discoverable via `skill_load`." Easy ~300 token win.

---

### 6. Capability / Skill / Tool layers are out of alignment

The Capabilities bullet list names: Calendar management, Web research, BuildOS product reference, People and profile context, Libri knowledge, Project audit, Project forecast. **None of those have preloaded tools in project context.** The model has to discover them via `tool_search` or `skill_load`.

That's fine as a design — but the Capabilities list reads as if they're all one tool away. A user asking "audit this project" hits a capability that requires skill_load + tool discovery, not a direct tool.

**Fix direction:** Either (a) flag which capabilities are discovery-only in the current context, or (b) move discovery-only capabilities into a separate "Available via discovery" subsection below the tool surface.

---

### 7. Member record has the UUID as its title

In the loaded-context JSON:

```json
"members":[{"id":"27ffb7b1-b70f-40e4-9ea5-b3abdcb3cb01",
             "title":"27ffb7b1-b70f-40e4-9ea5-b3abdcb3cb01", ...}]
```

The context loader is using `id` as the `title` fallback when there's no display name. If the model quotes a member to the user, it'll say "member 27ffb7b1-...". Root cause is in context assembly, not the prompt text, but worth fixing upstream.

---

### 8. Meta / template residue in the sent prompt

- Header: "Prompt variant: lite_seed_v1" — the model doesn't need to know variant names.
- Focus section: "Use this seed for: Seed a project-scoped assistant that understands the current project and can help move its work forward." — this reads like developer-facing template documentation that leaked into the system prompt.

**Fix:** delete both. They add no value to the model.

---

### 9. Safety and Data Rules is 16 bullets and growing

Some bullets overlap (three different rules variously say "only claim a write if the tool succeeded"). Bullet 1 ("Never echo prompt section headers …") reads as a band-aid for past behavior. Long rule lists get diluted — the model starts averaging them.

**Fix direction:** consolidate into ~6 grouped rules:

1. **Tool-result grounding** — only claim outcomes after successful results; lead-ins are intent only.
2. **IDs and placeholders** — full UUIDs only; never truncate or use placeholder strings.
3. **Durable field hygiene** — user-visible fields contain only user-visible content; no tool-control syntax.
4. **Document contract** — placement is create-then-move; append/merge requires non-empty content.
5. **Ambiguity resolution** — resolve targets via read ops; ask one concise question when multiple plausible matches remain.
6. **Output shape** — natural prose only; no section headers, write-ledger labels, or scratch reasoning in the user-facing response.

---

### 10. Turn1 (project_create) had the right tight structure; turn2/3 lost it

Turn1's system prompt was 13k chars with a focused "Project Creation Boundaries" section — one tool, one job. Turn2 jumped to 16k with 16 tools, a full loaded-context blob, and a broad capability list. The mode switch from `project_create` → `project` loses focus — the model now sees itself as a general-purpose project assistant rather than "inside The Last Ember, default action is to advance this project."

**Fix direction:** keep the "you are focused on X" framing stronger in project mode. Add an explicit operating bias: "Your default action is to update this project; workspace-wide operations require `tool_search` or `change_chat_context`."

---

## Suggestions ranked by impact

| Priority | Change                                                                                | Payoff                                                            |
| -------- | ------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| **P0**   | Strip reasoning/scratchpad from persisted assistant messages before saving to history | Fixes the biggest quality issue; cuts history tokens every turn   |
| **P0**   | Stabilize tool schema sizes across turns in a session                                 | Restores prompt caching on Pass 1 (currently 12.2% — target 80%+) |
| **P1**   | Deduplicate loaded-context JSON vs prose timeline                                     | ~300–500 tokens saved per turn                                    |
| **P1**   | Context-filter skill catalog (3–4 relevant rows)                                      | ~300 tokens saved                                                 |
| **P1**   | Fix member `title`-as-UUID in context assembly                                        | Correctness / user-visible bug                                    |
| **P2**   | Remove "Prompt variant" and "Use this seed for" meta lines                            | Cleanliness                                                       |
| **P2**   | Consolidate Safety rules from 16 → ~6 grouped rules                                   | Better adherence, fewer tokens                                    |
| **P2**   | Make Capabilities list indicate which require discovery                               | Fewer wasted tool_search calls                                    |
| **P2**   | Decide which tools are always-on vs conditional in project context                    | Matches rules-as-written to tools-as-loaded                       |
| **P3**   | Decide on fastchat vs lite as canonical (both variants exist in `.prompt-dumps/`)     | Reduces maintenance surface                                       |
| **P3**   | Strengthen "you are focused on X" bias in project mode                                | Better single-project behavior on turn2+                          |

---

## Token / cost snapshot (turn3)

- System prompt: 17,387 chars (~4,347 tokens)
- Tool definitions: 22,240 chars (~5,560 tokens)
- History: 4,656 chars (~1,164 tokens) _(includes the leaked scratchpad from turn2)_
- User message: 749 chars (~188 tokens)
- **Provider payload estimate: ~11,259 tokens**

Pass 1 cache hit: **12.2%** (target ≥ 80%).
Pass 2 cache hit: 80% (healthy).

If P0 + P1 items land, expect:

- Provider payload on turn3: ~11.3k → ~9.5k tokens.
- Pass 1 cache hit: 12% → 80%+.
- Less history bloat as sessions grow.

---

## Open questions for follow-up

1. Why does the tool surface change mid-session (turn2 = 16 tools, turn3 = 13)? Is there a dynamic selection step I'm missing?
2. Why do tool schemas double in size between turns? Is there a profile escalation triggered by a heuristic?
3. Is the reasoning-in-output leak grok-4.1-fast specific, or reproducible on other providers?
4. Are both `lite_seed_v1` and `fastchat` variants shipping to users, or is one the canonical and the other a comparison path?

---

_Generated from prompt dumps in `apps/web/.prompt-dumps/` dated 2026-04-15 through 2026-04-18._
