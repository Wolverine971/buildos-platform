<!-- docs/technical/reviews/AGENTIC_CHAT_QUALITY_STATE_2026-07-26.md -->

# Agentic Chat Quality — measured state and what to do next

**Date:** 2026-07-26
**Scope:** the 2026-07-25 → 07-26 push: the Tier 1 scenario suite, four product fixes, two new
enforcement gates, and where Phase A now sits.
**Everything below is measured**, `--retry=0`, ≥5 runs unless noted. Nothing here is an estimate.

---

## 1. The one-paragraph version

A scenario suite that did not exist 48 hours ago found **one shipped user-facing bug**, **one
self-inflicted architectural bug**, and **two real capability gaps** — then measured every attempted
fix instead of assuming it worked. Three separate times, a confident theory (mine or the docs')
turned out wrong and only live measurement caught it. Research capture went from lossy to
guaranteed. Forward-carry moved off zero for the first time but is not fixed. Phase A is unchanged
and now blocked on ~20 minutes of DJ's time, not on engineering.

---

## 2. What was actually wrong (all four found by the suite)

### 2.1 Priority scale inverted — a live user-facing bug

`tools/core/definitions/field-metadata.ts` told the model *"Optional numeric priority (1-5). **Higher
numbers mean more important.**"* BuildOS treats **1 as highest** (`insight-panel-config.ts` renders
`priority <= 2` as "P{n} High").

So "make this top priority" wrote **5** and sent the task to the bottom of the queue — silently, in a
turn that otherwise looked successful. **Fixed and verified.** This one was shipped and affecting
real usage.

### 2.2 The system forbade the write it was asking for

The research budget (`stream-orchestrator/index.ts`) injects a `must_synthesize` instruction at ≥8
research rounds / 60k payload chars. That instruction said:

> "Research budget reached... **Do not call more tools in the next response.** Write the final answer
> now..."

The agent researches; then, precisely when it has researched *most*, the system bans the one call
that could save any of it. **Fixed** — it now stops research without banning capture. Measured
**1/6 → 4/5**.

This also explained a result that looked like a regression: adding prompt guidance drove research
volume **up**, which tripped the budget more often, which banned the write more often. The guidance
did not make the model lazier; it pushed it harder into a structural trap.

### 2.3 Research findings evaporated

Turns ran 6–11 web searches and persisted nothing. **Fixed twice over** — the budget fix above, plus
deterministic capture (§3.1).

### 2.4 User-stated futures land nowhere

*"That's done, I'm just waiting to hear back from them."* The agent closes the task and drops the
second clause. **Still the main open gap** (§3.2).

---

## 3. What was built

### 3.1 Research Log — deterministic capture ✅ working

Any turn with ≥2 web research calls appends a compact entry (queries, URLs, findings) to a
per-project **Research Log** document. Server-side, no model call, so it cannot be skipped.

- Lives in the **route**, not the orchestrator — `StreamFastChatParams` has no DB handle at all.
- Rotates at 20 entries / 24 KB into a non-highlighted archive.
- `document.knowledge.research`, deliberately **not** a `*scratch*` type key: the context loader
  filters `scratch`/`workspace` out in six places, which is why the pre-existing task scratch pad
  can be written but **never read back**.

**Cross-session read-back: 3/3.** A cold session — no threaded session, no continuity context —
retrieves research written in an earlier one. That required a new harness capability
(`coldSession: true`), without which such a test passes on conversation history and proves nothing.

### 3.2 Forward-carry gate ⚠️ partial

`shouldRepairStatedFutureNotRecorded` fires when the user states a future, the turn **acted**, and no
new record was created. Conservative regex detection, model-judged repair.

**Measurement history — this is the most-tested behavior in the system:**

| Intervention | Result |
| --- | --- |
| No rule at all | 0/2 |
| Rule mid-list (position 14 of 20) | 0/5 |
| After the research-budget fix | 0/5 |
| Rule moved to the Final Response Contract — the best boundary position available | **0/5** |
| Code gate + permissive repair | 0/5 |
| Code gate + tightened repair | **1/5** |

**Three prompt placements — absent, buried, boundary — all zero.** That is what justified building a
mechanism, and it is the strongest evidence in the codebase that placement alone cannot carry a
behavior.

### 3.3 Research floor + prompt/tool corrections

A repair gate for turns that research and write nothing; `web_search` metadata now states results are
not persisted (it previously said nothing while `web_visit` advertised that it stores snapshots); the
base prompt's persistence rule rewritten from optional to directive.

---

## 4. Current scoreboard

| Behavior | State |
| --- | --- |
| Cold cross-session entity resolution | ✅ works |
| Voice-mangled project names | ✅ works |
| **Restraint** — no writes on a passing mention, asks when ambiguous | ✅ 5/5 then 3/3, never regressed |
| Reschedule by reference | ✅ works |
| Three operations from one dictated sentence | ✅ works (after the priority fix) |
| Research survives the session | ✅ guaranteed by construction |
| Research retrievable in a later session | ✅ 3/3 |
| Model authors a *good* research document | ⚠️ ~2–4/5, model-bound |
| **Forward-carry** | ❌ 1/5 (lifetime 1/27) |

---

## 5. The meta-finding — reasoning lost to measurement three times

Worth recording because it generalizes beyond these bugs.

1. **"Instruction was being ignored."** Wrong — there was no instruction. The prompt framed
   persistence as optional (*"when you save findings into a document…"*). DJ's read was right and
   mine was not.
2. **"Guidance made it worse, so guidance is the wrong lever."** Wrong — guidance drove research up,
   which tripped a budget that banned the write. The real cause was a conflicting instruction the
   system injected. Two intermediate theories (forced synthesis, budget exhaustion) were both killed
   by log greps, not by argument.
3. **"The gate isn't firing."** Wrong — instrumentation showed `fires: true` and the model simply
   made no tool call. The gate worked; the instruction I wrote handed it a way out.

### The recurring pattern: escape hatches get taken

Every *"if X, you may skip this"* clause is an escape hatch, and models take them far more often than
the edge case that motivated them.

- The research budget's "do not call more tools" — the system telling the model not to do what the
  system wanted.
- The forward-carry repair's "or it was a passing remark not worth recording" — taken **5/5**, even
  though the gate's own preconditions made that case impossible.

Removing that one clause and adding *"prose is not a record"* moved forward-carry off zero. **Audit
every gate instruction for permissions it does not actually need.**

---

## 6. Open decisions

### D1 — Forward-carry: ship the deterministic write, or bank the gate?

**Ship it (narrow).** When the gate fires and the model *still* declines, the server creates the
record from the user's own words. Takes forward-carry to ~5/5 by construction — the same move that
made research capture reliable. Cost: a user-visible task created because a regex matched a sentence.
Recommended shape: only on the second pass after the model declines, titled from verbatim user text,
so the model keeps first refusal and the auto-write is genuinely last resort.

**Bank it.** The gate is built, tested, and regresses nothing. Forward-carry stays a known gap with a
far better-understood cause than it had yesterday.

*Recommendation: ship narrow.* But note the real risk — this is the one place where a bad fix
produces the eager-agent behavior that `restraint-noop-and-ambiguity` currently proves absent, and
that scenario must be re-run on any change here.

### D2 — Phase A: 20 minutes, $0, and everything else is blocked behind it

`A1_HUMAN_LABEL_PACKET.md` — 13 requests, label each `direct | workflow | clarify | capability_gap`.

The routing gate needs 65/72; the reanalysis shows **max reachable is 63/72**, so it is arithmetically
closed while item C09 counts as an error. One genuinely 50/50 item caps the score at 67.5; two cap it
at 63. **Nobody has ever measured whether these items have obvious answers.** Until that exists, no
further Phase A spend is interpretable.

*Note:* item 5 (C09) is contaminated — it has been discussed at length. A `clarify` answer there is
strong evidence (answered against the anchor); `direct` is weak. The packet says so, after the
labeling section.

### D3 — Open-brief corpus is still blocked

`corpus/open-brief-v1.json` remains `incomplete_pending_dj_input` with 5 placeholder briefs. Blocks B
and C were answered in `BLOCKS_B_C_QUESTIONS_2026-07-25.md` but have not been folded in. Two of those
answers change the design and should not be lost:

- **Both sample plans were rejected** for being framed as week-by-week schedules. DJ wants steps with
  effort estimates and stated unknowns, not a calendar. That is a checkable artifact-shape rule.
- **C5's answer redefines the quality bar.** "It gets this project" turned out to mean *self-assessed
  feasibility* — does it know whether the plan is doable, does it stress-test itself, does it ask for
  what it needs — **not** specificity, which is what the grounding/swap metrics were designed to
  measure.

### D4 — Commit hygiene

Today's work landed in two commits titled "updates": `a5863f46` (63 files) and `02739e03` (**185
files**, including unrelated pre-staged work — blogs, hyperplexed docs, profile components,
`apps/web/apps/web/scratch-q2.mjs`). That is what the explicit-pathspec rule exists to prevent. Not
fixable without rewriting history; worth knowing before anyone bisects.

---

## 7. Options going forward, ranked

1. **Forward-carry deterministic write** (D1) — the last confirmed product gap, ~half a day, needs D1
   decided.
2. **Phase A label pass** (D2) — 20 min of DJ, $0, unblocks a stalled workstream or kills it cleanly.
3. **tasker/39 e2e battery** — the prompt restructure is built (strategy section 4,656 → 964 chars)
   but owes a ≥5× scenario battery. Restructures that shrink the prompt by 80% deserve verification
   before they are trusted.
4. **Open-brief corpus** (D3) — fold in the Block B/C answers before they go stale, with the two
   design corrections written in rather than quietly dropped.
5. **Commit the current tree properly** — a day of verified work sits uncommitted on top of two
   over-broad commits.

---

## 8. Addendum — D1 shipped same day (evening)

DJ decided **ship narrow**. Built, measured, committed (`b155b909`).

**Forward-carry: 1/5 → 5/5. Restraint: 5/5, no regression.**

The first attempt (deterministic write triggered by the gate's fired-flag) measured **3/5**, and the
two failures were both §5's lesson again — escape hatches in *code* this time, not instructions:

1. The gate waived itself whenever the final text contained a `?`
   (`looksLikePureClarifyingQuestion`), so "Closed it — want me to set a follow-up?" dropped the
   future with no repair, no flag, no fallback.
2. The fallback was coupled to the gate's flag, so any finalization path the gate never saw also
   bypassed the floor.

Fix: the route now triggers the last-resort write from **ground truth only** — conservative
waiting-state patterns on the user's words plus wrote-without-durable-record on actual tool
executions. The `?` waiver is removed from this gate (its preconditions mean the turn already
acted). The model keeps first refusal via the repair round; when it declines, the server creates
the task titled from the user's verbatim words (`stated-future.service.ts`, idempotent per turn
via `onto_task_create_atomic`).

Notably, once the `?` waiver was gone the model recorded the future ITSELF in most runs (follow-up
task + event, or START HERE). The deterministic write fired in one of five passes. The floor works
mostly by making the gate inescapable, not by writing.

Known residual: `didCreateDurableRecord` credits an `update_onto_document` on any document, while
the scenario credits only START HERE among seeded docs. If a future failure shows a doc-update
signature with no scenario surface, that mismatch is the next tightening.

Scoreboard correction to §4: **Forward-carry ✅ 5/5 by construction.** The open-brief corpus
fold-in (D3) also landed the same evening — see `corpus/open-brief-v1.json` `design_corrections`
and methodology §6.4.

## 9. Addendum 2 — the project-organize excavation (late evening)

DJ asked for a root-cause assessment of the two remaining failures. `document-from-vague-description`
got the research-gate `?` waiver removed (`df5cb647`) — post-fix valid sample 1/3, band unchanged,
model-bound; the same conclusion as before, now with the waiver hole closed on principle.

`project-organize` produced a **five-layer causal chain**, each layer verified by re-measurement
before fixing the next (commits `df5cb647`, `93dc8dd8`, `859e9b49`, `745d36f5`, `9b241a7b`):

1. **Surface router miss.** "Help me get it organized" resolved `project_basic` — zero write
   tools. The verb-then-noun regex cannot see noun-first/past-participle phrasing. Fixed:
   order-free organize detector mounts the document surface.
2. **The ladder steered commissions to prose.** `stop_and_answer` / `must_synthesize` said
   "answer from existing results," and the toolless synthesis pass confiscated the mounted write
   tools (no prior write attempt = no carve-out). Fixed: all ladder levels steer commissioned
   writes to execute; the carve-out gains an organize source.
3. **Voluntary prose finalization had no floor.** The model batches reads into few rounds, never
   trips the ladder, ends with a plan. Fixed: `organize_commission` finalization gate — a
   commissioned reorganization may not end with zero writes; repair pass restricted to the write
   tools.
4. **Moves without parents.** With the floor firing, the model moved documents to the root.
   Fixed: instructions state `new_parent_id` semantics; scenario failure output now prints the
   actual move calls AND server-side results (never diagnose this blind again).
5. **Fabricated parent UUIDs — the residual.** The model then made *perfect-shaped* moves, every
   one with `new_parent_id` — pointing at four parents that do not exist. It wants folder-parents,
   and instead of creating them (allowed and instructed), it invents ids. The entity-scope guard
   correctly rejects them; the retry supervisor locks the turn. **Handing it the exact valid-id
   inventory in the repair did not stop the fabrication.**

Layer 5 is a **model-capability bound** on `deepseek-v4-flash`: a two-phase write plan
(create parent → use returned id → move) that it will not execute and will not substitute with
existing parents. The four shipped fixes are correct regardless — each moved the failure to a
deeper, more real layer — and layers 1–3 fix organize-commission behavior for ALL models.

**RESOLVED same night — DJ rejected tier-up, chose fixing the tool. Final: 4/4 valid runs**
(one stream-infra flake), from a lifetime of zero:

6. **`move_document_in_tree` accepts `new_parent_title`** (`b74291ec`): resolves to the existing
   document with that title or creates the parent atomically, in the chat executor AND the
   shared-agent-ops gateway op. Grouping became single-phase and id-free — the entire fabrication
   surface is gone, for every model. Titles misplaced in `new_parent_id` also resolve.
   Result: 2/5, with the two passes being complete real reorganizations.
7. **`tool_choice: 'required'` on the forced write-intent pass** (`b1f2d94a`): the remaining
   failures were the model NARRATING the moves in prose on a write-tools-only pass — 'auto' lets
   a text-only response through; 'required' does not. Result: 4/4 valid.

The general lessons: when a weak model's plan needs an entity that doesn't exist, it fabricates
the id — id inventories don't cure it, existence does (title-resolving tools beat two-phase
create-then-reference); and a "write-tools-only pass" is not a write floor until `tool_choice`
makes prose impossible.

Also recorded: the entity-scope guard resolves ids only from PRELOADED context, not from
in-turn tool reads — today the preloaded highlights covered the real docs so it never bit, but
any entity first seen through an in-turn read cannot be mutated in the same turn. Filed as a
known trap.

## 10. Related

- `tasker/39-prompt-instruction-architecture-audit.md` · `tasker/40-working-notes-artifacts.md`
- `docs/specs/WORKING_NOTES_RESEARCH_LOG_SPEC_2026-07-26.md`
- `docs/architecture/agent-first-orchestration/A1_HUMAN_LABEL_PACKET.md`
- `docs/architecture/agent-first-orchestration/TIER_1_RESULTS_2026-07-25.md`
- `apps/web/src/lib/tests/agentic-e2e/` — the suite all of this rests on
