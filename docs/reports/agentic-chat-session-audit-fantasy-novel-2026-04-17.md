<!-- docs/reports/agentic-chat-session-audit-fantasy-novel-2026-04-17.md -->

# Agentic Chat Session Audit — "The Last Ember" Fantasy Novel Flow

- **Session:** `71a1bd2b-06b7-4bb4-984a-edb24deb24ae`
- **User:** DJ Wayne (`djwayne35@gmail.com`)
- **Date:** 2026-04-17 21:26 – 21:32 UTC
- **Source transcript:** `chat-session-audit-i-m-starting-my-first-fantasy-novel-the-last-emb-71a1bd2b-06b7-4b-2026-04-17.md`

## Session summary

| Metric                 | Value   |
| ---------------------- | ------- |
| User turns             | 5       |
| Messages               | 10      |
| Tool calls             | 12      |
| **Tool failures**      | **3**   |
| LLM calls              | 16      |
| Total tokens           | 155,661 |
| Total cost             | $0.0519 |
| Reasoning tokens (sum) | ~14,400 |

Models observed: `x-ai/grok-4.1-fast` (primary, tool-calling lane), `qwen/qwen3.6-plus-04-02` (JSON / agent_state_reconciliation lane).

## What the user tried to do

1. Create a new novel project (project_create context)
2. Log chapter-2 progress + queue chapter-3 plans
3. Retry after a tool failure
4. Create a replacement task for the failed update
5. Capture magic-system research notes

## What broke

### Severity 1

#### 1. `update_onto_task` fails 100% of the time — real database bug

Three attempts, all with the identical generic error:

```
Tool 'update_onto_task' failed:
  API PATCH /api/onto/tasks/<id> failed: Database operation failed
```

| Turn | Task ID                                                                    | Args                                           | Result              |
| ---- | -------------------------------------------------------------------------- | ---------------------------------------------- | ------------------- |
| 2    | `116036bf-a9d4-473b-b7ea-e0b5de2c99a4` — "Outline first three chapters"    | `{state_key: "in_progress", priority: 3}`      | FAILED              |
| 3    | `116036bf-…` (same)                                                        | `{description: "…", state_key: "in_progress"}` | FAILED (same error) |
| 5    | `eaaf5762-2da0-4f75-baef-b658c96422c2` — "Research medieval blacksmithing" | `{state_key: "done", priority: 3, props: {}}`  | FAILED              |

**Common factor:** every failed call includes `state_key` in the update payload. No `update_onto_task` call without `state_key` was attempted, so we can't prove it's unique to `state_key`, but the pattern is strongly suggestive.

**Code path:** `apps/web/src/routes/api/onto/tasks/[id]/+server.ts:507-545` → Supabase RPC `onto_task_update_atomic` (migration `20260430000002_onto_task_update_atomic.sql`, landed 2026-04-17 11:08, ~10 hours before this session).

**Leading hypothesis:** the CASE expression in the RPC fails to unify types. The column `onto_tasks.state_key` is of enum type `public.task_state` (`'todo' | 'in_progress' | 'blocked' | 'done'`). The RPC writes:

```sql
state_key = case when p_updates ? 'state_key'
                 then p_updates->>'state_key'   -- text
                 else t.state_key               -- task_state
            end
```

`jsonb ->>` returns `text`. There is no implicit cast from `text` to `task_state` in the CASE, so PostgreSQL throws a datatype mismatch at plan time (error code `42804` / `22P02`, message typically `CASE types text and task_state cannot be matched` or `invalid input value for enum task_state`). `apps/web/src/routes/api/onto/tasks/[id]/+server.ts` catches this and returns the generic `ApiResponse.databaseError(...)`, which masks the real cause.

All other columns in the RPC either already share a type (`text`, `jsonb`, `int`, `timestamptz`) or are explicitly cast in the CASE branch. Only `state_key` has the unchecked enum mismatch.

**Why it wasn't caught in tests:** `task-patch-completion-sync.test.ts` mocks Supabase entirely. It never reaches the RPC — it just checks that the endpoint's JS-side completion logic calls mocks in the right order.

**Fix:** Add an explicit `::task_state` cast, and add an RPC-level integration test. See "Fix plan" below.

**Verification steps before shipping the fix:**

1. Check Supabase logs for one of the three failing calls — the exact error text will confirm the hypothesis. Look for "datatype mismatch" / "CASE types" / "invalid input value for enum task_state".
2. Reproduce locally by calling the RPC with `p_updates = '{"state_key": "done"}'::jsonb` against a real task row.
3. After the fix migration deploys, stop masking `atomicError.message` in the PATCH endpoint — at minimum log the Postgres error code so future regressions don't hide for 10 hours.

---

#### 2. Reasoning / scratchpad leak into the user-visible assistant message

The model `x-ai/grok-4.1-fast` is a reasoning model. Its internal planning prose is being saved into the assistant message `content` field and shown to the user in **turns 2, 4, 6, and 10**.

**Turn 2, what the user actually saw:**

```
It has 1 goal, 7 tasks, 1 document, 9 edges.
Context has shifted to this project.
User-facing response rules:
- Name each successful write by title or what changed.
- Direct prose, no planning or instructions echoed.
- After creation, continue inside the created project.
- Keep conversation useful for next step.
My previous message was the tool call.
…
End by prompting next action.I've created your new project **"The Last Ember"** (ID: 940e46b7-…), …
```

The tell-tale sign is the missing newline between `End by prompting next action.` and `I've created your new project…`. The reasoning prose is being concatenated directly to the final reply.

**Turn 4 — mangled response:**

```
I've captured everything with:

17), and Chapter 3 plans.

- **Task**: "Revise Chapter 2: dialogue, pacing, sensory details, and age continuity" …
```

The Document bullet that should appear on the second line was destroyed by the sanitizer; only the fragment `17), and Chapter 3 plans.` survived. This is a second-order failure — the over-aggressive sanitizer chopped a legitimate bullet while still missing the actual scratchpad.

**Turn 10 — no final reply at all**, just ~30 lines of reasoning ending with a half-warm sentence `This research looks solid — love the emotion-based properties and Forge Temples idea.`

**Root causes:**

| #   | Cause                                                                                                                                                                                                                                                                 | Location                                                                                       |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| A   | Grok-4.1-fast routes reasoning through `delta.content` instead of the dedicated reasoning channel. `reasoning: { effort: 'low', exclude: true }` is sent to OpenRouter but only controls the reasoning channel, not text that Grok decides to emit as normal content. | `packages/smart-llm/src/smart-llm-service.ts:112, :1904`                                       |
| B   | Our content filter (`filterThinkingTokens`, `normalizeStreamingContent`) only strips XML-tagged thinking blocks and structured `type: "reasoning"` parts. It does not recognize untagged reasoning prose.                                                             | `packages/smart-llm/src/response-parsing.ts:316/385`                                           |
| C   | The second-line-of-defense sanitizer (`SCRATCHPAD_SENTENCE_PATTERNS`) is regex-based and reactive — it adds patterns after each observed leak. This session produced several new phrasings that no existing pattern matches (listed below).                           | `apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator/assistant-text-sanitization.ts` |
| D   | The sentence splitter inside the sanitizer splits on `.?!` followed by whitespace + capital/digit. That fragments legitimate list bullets that contain parenthetical IDs and produces unrecoverable garbage (turn 4).                                                 | same file, `splitAssistantTextIntoSentences`                                                   |

**New leaked phrases not caught by current regexes:**

- `It has 1 goal, 7 tasks, 1 document, 9 edges.`
- `Context has shifted to this project.`
- `User-facing response rules:`
- `Name each successful write by title or what changed.`
- `My previous message was the tool call.`
- `End by prompting next action.`
- `Write_ledger confirms this.`
- `Loaded context from initial:`
- `Tool results:` / `Successful:` / `Failed:` as standalone lines
- `My tool calls captured that well.`
- `Stay in project context.`
- `The assistant's previous response created a document successfully…`
- `Now, this is the next turn?`
- `Key rules from Safety and Data Rules:`

**Cost implication:** reasoning tokens are billed regardless of whether they reach the user. `exclude: true` does not save money — it only controls stream visibility. We are currently paying for reasoning AND getting it leaked into the UI. The actual cost lever is either (a) switching to a non-reasoning model or (b) setting `effort: 'off'`.

**Fix plan:**

1. Swap the tool-calling lane's primary to `anthropic/claude-haiku-4.5` (already in the fallback list) or `openai/gpt-4.1-nano`. These respect the reasoning channel and don't leak. A/B for a day and measure leak rate + cost.
2. Keep Grok as a fallback only.
3. Add the 14 phrases above to `assistant-text-sanitization.ts` tests.
4. Add a structural detector: if a message body contains two adjacent chunks separated by a missing space where the left chunk matches meta tokens (`ledger`, `rules`, `my response`, `tool call`, `previous message`, `stay in project context`), treat the left as scratchpad and keep only the right.
5. Move bullet/line scanning before sentence splitting so list items don't get fragmented.

---

### Severity 2

#### 3. Successful write not confirmed to the user (turn 8)

User said "yes create a new task for the one that failed." The agent successfully created task `0876262a-0e99-4a23-a12d-e71c3c6d1b8a` ("Finalize outline for first three chapters"). But the user-facing reply was:

> Ready to start on this?
> I can help flesh out the Chapter 3 outline right now, mark it in progress, or tackle the Chapter 2 revisions next.

No mention of the new task ID or title. Violates the system prompt's rule: _"Name each successful write by title or what changed."_

Likely the orchestrator's `tryEmitEarlyAssistantLeadIn` emitted a pre-tool lead-in and the post-tool outcome got trimmed or replaced.

#### 4. Turn 6 retry cost 45,698 tokens and fixed nothing

User: "Okay, fix what you messed up." Agent's response:

- `skill_load` → loaded `task_management` skill (~1k tokens of playbook text)
- `tool_search` for "update existing task state" → redundant; `update_onto_task` was already available
- `list_onto_tasks` → read-only
- `update_onto_task` retry on `116036bf-…` → failed with identical error
- Final user reply never states the retry failed again, just offers three options

**Cost:** 39,903 prompt tokens + 5,795 completion tokens = 45,698 on one turn that fixed nothing.

**Fix:** When the same op + same entity ID has already failed this session, suppress discovery tools and go straight to either a focused retry with a different payload or an escalation ("I hit the same DB error; want me to create a fresh task instead?"). Add a per-turn dedupe check keyed on `(op, entityId)`.

#### 5. Dangling zombie task

After turn 8 created the replacement task, the original failed task `116036bf-…` was left in `todo` state and never soft-deleted. The project graph now has two overlapping "outline chapters" tasks. The agent had offered "soft-delete the old one" in turn 6 but didn't follow through on the user's "yes."

**Fix:** Agent-side: when the user accepts a replacement-for-failed-entity action, also archive the original atomically (or surface the ambiguity).

#### 6. Silent extra document in `create_onto_project`

Turn 2's leaked reasoning included: _"counts include 'documents':1, which is likely the context_document I included. In tool call: I had project description, but no explicit context_document."_

The tool result shows `documents: 1` in the counts even though the tool call didn't include a document entity. Either the bulk create tool is silently injecting a context doc (should be documented) or the `counts.documents` field is miscounting.

Worth a quick look at `create_onto_project` — even the model noticed the discrepancy.

---

## What cost what

| Turn                         | Tokens  | Reasoning | Cost     | Notes                                   |
| ---------------------------- | ------- | --------- | -------- | --------------------------------------- |
| 1 (create project)           | 12,532  | 1,281     | ~$0.0032 | Healthy.                                |
| 2 (log Ch2)                  | 26,519  | 3,307     | ~$0.0077 | Leaked scratchpad; 1 RPC fail.          |
| 3 ("fix what you messed up") | 45,698  | ~2,000    | ~$0.0170 | No useful work produced.                |
| 4 (create replacement task)  | 21,938  | 406       | ~$0.0055 | Task created but not named in reply.    |
| 5 (research notes)           | 21,828  | 1,227     | ~$0.0070 | Full scratchpad leak; 1 RPC fail.       |
| Background qwen calls        | ~14,000 | ~9,500    | ~$0.020  | agent_state_reconciliation / JSON lane. |

Worst offender: turn 3 (45,698 tokens on zero forward progress) and the qwen reconciliation calls (57s latency on turn 1 alone, 2.6k reasoning tokens).

---

## Fix plan (priority order)

### P0: Fix `onto_task_update_atomic` RPC

Write a new migration that:

- Explicitly casts the enum branch: `(p_updates->>'state_key')::task_state`
- Does the same for any other enum columns (audit `type_key` — if it's text, no change needed; if it's an enum somewhere, fix)
- Returns a clearer error when the cast itself fails ("Invalid state_key: <value>")

Stop masking `atomicError.message` in the PATCH endpoint. Surface the code and a truncated message to logs so the next regression is visible immediately.

### P1: Kill the Grok reasoning leak

- Swap tool-calling lane primary to `anthropic/claude-haiku-4.5`
- A/B measure leak rate + cost for 24h
- If Haiku quality holds, demote Grok to fallback only

### P2: Sanitizer hardening

- Add the 14 observed phrases to `assistant-text-sanitization.test.ts`
- Add a structural detector for the "missing-space-between-two-chunks" leak signature
- Fix the sentence splitter so list bullets with parenthetical IDs aren't fragmented

### P3: Agent behavior

- Per-turn dedupe: `(op, entityId)` failed once already → skip discovery, either retry with modified payload or escalate
- Confirm successful writes by title in the final response even when only one tool call ran
- When user accepts a "soft-delete the old one" offer, actually perform the soft-delete

### P4: Cost / observability

- Check whether `reasoning: { effort: 'off' }` works for Grok via OpenRouter (via Context7 / OpenRouter docs)
- Log `reasoningTokens` per turn against a budget; alert on outliers
- Check `create_onto_project` counts.documents discrepancy — either document the auto-injected context doc or fix the count

---

## Appendix — Quick references

- Session transcript: `chat-session-audit-i-m-starting-my-first-fantasy-novel-the-last-emb-71a1bd2b-06b7-4b-2026-04-17.md`
- RPC migration: `supabase/migrations/20260430000002_onto_task_update_atomic.sql`
- PATCH endpoint: `apps/web/src/routes/api/onto/tasks/[id]/+server.ts:206-545`
- Stream orchestrator: `apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator/index.ts:480-572`
- Sanitizer: `apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator/assistant-text-sanitization.ts`
- Model config: `apps/web/src/lib/services/agentic-chat/config/model-selection-config.ts`
- LLM stream emitter: `packages/smart-llm/src/smart-llm-service.ts:2380-2455`, `:112`, `:1904`
- Reasoning filter: `packages/smart-llm/src/response-parsing.ts:316-430`
