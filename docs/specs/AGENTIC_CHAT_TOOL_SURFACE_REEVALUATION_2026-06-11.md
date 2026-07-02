<!-- docs/specs/AGENTIC_CHAT_TOOL_SURFACE_REEVALUATION_2026-06-11.md -->

# Agentic Chat Tool Surface — Re-evaluation (2026-06-11)

**Status:** Background decision — no implementation planned. Supersedes the deleted 2026-04-14 tool-surface optimization handoff, whose numbers and targets were stale.

**Why this doc exists:** The 2026-06-10 holistic assessment recommended shipping the old tool-surface slimming handoff as "the cheapest real win." DJ pushed back: the handoff is old, the chat currently works well, and slimming tools risks degrading behavior. This re-evaluation re-measured the surface against **production prompt snapshots** before deciding anything.

---

## 1. What production actually looks like now

Measured from `chat_prompt_snapshots.tool_definitions` (25 most recent snapshots, 2026-06-06 → 2026-06-10, JSON-serialized chars per definition):

| Context                   | Tools exposed | Tool surface total               | System prompt    | Approx prompt tokens/pass |
| ------------------------- | ------------- | -------------------------------- | ---------------- | ------------------------- |
| `project` (write surface) | 21–24         | 20.8–23.0K chars (~5.2–5.7K tok) | 34.7–35.8K chars | ~9.0–9.2K                 |
| `project` (read surface)  | 17            | 13.8K chars (~3.5K tok)          | 33.1K chars      | ~8.3K                     |
| `daily_brief`             | 16            | 14.3K chars (~3.6K tok)          | 34.7K chars      | ~9.6K                     |
| `project_create`          | 1             | 5.3K chars (~1.3K tok)           | 27.0K chars      | ~6.8K                     |

Largest individual tool definitions today:

- `create_onto_project`: **5,263 chars** (old handoff claimed ~11,823 — already halved since April)
- `create_onto_task`: **2,468 chars** (old target was ≤2,500 — **already met**)
- `update_onto_task`: 2,020 · `create_onto_document`: 2,000 · `change_chat_context`: 1,756 · `update_onto_document`: 1,736

## 2. Verdict on the old handoff

**The 2026-04-14 handoff's premise no longer holds.** Its two headline offenders were either already slimmed in the interim or measured differently; its acceptance target for `create_onto_task` is already satisfied. The remaining tool surface (3.5–5.7K tokens) is reasonable for a 17–24-tool write surface and is **not** the dominant prompt cost.

**The actual dominant cost is the system prompt: 27–36K chars (~7–9K tokens), ~2.4× the entire tool surface.** Any token-reduction effort should profile the lite-prompt sections (`chat_prompt_snapshots.prompt_sections` already records per-section sizes) before touching tool definitions at all.

## 3. Decision

1. **Do not slim tool definitions now.** Risk of behavior regression for marginal token savings; the chat works well today. (DJ's call, supported by the measurements above.)
2. **Do not restore** the old tool-surface optimization handoff — its numbers and targets are stale.
3. If prompt-cost work happens later, the order of attack is:
    - **a.** Profile system-prompt sections from `prompt_sections` (largest single lever, ~8K tokens/pass).
    - **b.** Only then consider tool trims, starting with `create_onto_project` (5.3K chars, single-tool surface in `project_create` context where it's proportionally largest).

## 4. No-regression bar (required before any future slimming ships)

Any future change to tool definitions must pass all of:

1. **Replay parity.** Run the prompt replay/eval harness (`prompt-replay-runner.ts`, `prompt-eval-runner.ts`) on a fixed set of recorded turns spanning: task create/update, document create/append/move, project create, calendar ops, and at least 2 turns that previously triggered repair instructions. Zero new validation failures; tool-choice parity on the replayed turns.
2. **Live canary.** `chat_turn_runs.validation_failure_count` rate (baseline: 6.8% of turns, all single-failure) and `finished_reason` distribution (baseline: `tool_round_limit` + `tool_calls` ≈ 12%) must not worsen over a 1-week window post-change.
3. **Supervisor signal.** `supervisor_force_synthesis` rate (baseline: ~14% of turns) must not increase — rising force-synthesis is the early signal that the model is flailing with less tool guidance.
4. **Rollback:** definitions are code; revert the commit.

Baselines above are from the 2026-06-10/11 telemetry pull (66 turns/30d) and should be refreshed at decision time.
