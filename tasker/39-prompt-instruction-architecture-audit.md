<!-- tasker/39-prompt-instruction-architecture-audit.md -->

# 39 — Prompt instruction architecture: what earns its place

> **STATUS 2026-07-26 — AUDIT COMPLETE, BUILD SHIPPED (uncommitted).** All five exit conditions
> decided AND build stages 1–4 + 6 built the same day — decisions and full build log in
> `docs/architecture/agent-first-orchestration/PROMPT_INSTRUCTION_ARCHITECTURE_AUDIT_2026-07-26.md`.
> Highlights: the tool-definition numbers in §1 below were a measurement artifact (8 of 23 tools
> double-serialized; root cause found and FIXED — `ToolExecutionService.getToolDefinition` was
> mutating shared singleton definitions; `update_onto_task` is really ~527 tokens and tools do NOT
> outweigh the system prompt). The 19-bullet "How to act" list is now 8 always-true bullets
> (4,656 → 964 chars) plus a conditional `situational_rules` section (write turn / web-research
> turn) emitted from server-side signals, scaffold-flagged for A/B. Verified: 1,097 unit tests
> green, typecheck clean, 3-scenario live smoke (2 pass; `task-complete-cold-reference` still fails
> on the pre-existing forward-carry gap — unchanged, owned by the scratchpad mechanism work).
> **Owed: the ≥5×, --retry=0 Tier-1 battery — run it AFTER the scratchpad agent lands, so one
> battery validates both changes without a mid-run moving target.** Out of scope per DJ: Libri
> (outdated, untouched) and §5 scratchpad (separate agent).

**Created 2026-07-25.** DJ's framing, verbatim:

> "The 'how to act' part is increasingly big, and it feels like it's becoming an anti-pattern. I want
> to do a pass and look at this how-to-act list and see what actually needs to stay there and what
> earns its place... Instead of this being a long list, it should be more structured: this is how to
> act in certain scenarios... If we're in this situation, what are the rules for this situation? If
> we're going deep down a flow, that's when it becomes a skill file."

**Type:** Audit + restructure. Not a build task yet — the exit condition is a decided structure, not
shipped code.

**Why now:** a measured failure traced straight to instruction placement. A research-persistence rule
was added to the base prompt and had **zero measurable effect** across 5 runs (0/5), sitting at
position 13 of a 20-item list. The bug was eventually fixed elsewhere. That is the anti-pattern
producing a real cost, not a stylistic worry.

---

## 1. The measurements (already taken — audit from these, not from impressions)

Source: `apps/web/.prompt-dumps/` (gitignored; enable with `FASTCHAT_LOCAL_PROMPT_DUMPS=true`, the
dev server logs each file path). Every dump self-reports a full cost breakdown. Numbers below are
from a real `project`-context turn, variant `lite_seed_v1`, 23 tools.

**Total provider payload: ~59,261 chars (~14,816 tokens)**

| Component            |  chars | tokens |   share |
| -------------------- | -----: | -----: | ------: |
| **Tool definitions** | 32,890 | ~8,223 | **56%** |
| System prompt        | 26,165 | ~6,542 |     44% |

### The finding that should reframe this audit

**Tool schemas cost more than the entire system prompt.** The behavior instructions DJ is worried
about are not where the budget goes.

| Single tool            | chars | tokens |
| ---------------------- | ----: | -----: |
| `update_onto_task`     | 4,188 | ~1,047 |
| `create_onto_document` | 3,968 |   ~992 |
| `tool_search`          | 2,796 |   ~699 |
| `create_onto_task`     | 2,468 |   ~617 |
| `web_search`           | 2,338 |   ~585 |

`update_onto_task` **alone** is roughly the size of the whole "How to act" section. `update_onto_task`

- `create_onto_document` together (8,156 chars) **exceed it**. Any honest "what earns its place" pass
  has to include tool schemas or it is optimizing the smaller half.

### System-prompt sections, largest first

| Section                             | chars | tokens |
| ----------------------------------- | ----: | -----: |
| `operating_strategy` ("How to act") | 4,656 | ~1,164 |
| `capabilities_skills_tools`         | 4,562 | ~1,141 |
| `active_domain_signals`             | 4,499 | ~1,125 |
| `skill_catalog`                     | 3,550 |   ~888 |
| `location_loaded_context`           | 2,321 |   ~581 |
| `safety_data_rules`                 | 2,133 |   ~534 |
| `timeline_recent_activity`          | 2,076 |   ~519 |
| `project_start_here`                | 1,286 |   ~322 |
| `final_response_contract`           | 1,005 |   ~252 |
| `focus_purpose`                     | 1,006 |   ~252 |
| `identity_mission`                  |   602 |   ~151 |

Note: `operating_strategy`, `execution_protocol`, and `agent_behavior` all report 4,656 chars — they
are the same section under three alias names in the breakdown, not three sections.

**Roughly 12,600 chars (~3,150 tokens, over a fifth of the whole payload) is spent telling the model
how to find and load its own instructions** — `capabilities_skills_tools` + `active_domain_signals` +
`skill_catalog`. That is the layer to interrogate hardest.

---

## 2. What "How to act" actually contains

20 bullets. Grouped by what they do:

| Group                             | Count | Bullets                                                                                                                                 |
| --------------------------------- | ----: | --------------------------------------------------------------------------------------------------------------------------------------- |
| **Instruction-system navigation** | **7** | domain_search, outcome_card_load, skill_search, skill_load gate, skill-load-before-answering, loaded-skills ledger, root-vs-child depth |
| Web research                      |     4 | when to search, parallelism, persistence, user-stated durables                                                                          |
| Entity resolution / writes        |     2 | ID resolution order, clarification threshold                                                                                            |
| Turn mechanics                    |     4 | start with loaded context, lead-in sentence, anchor after tool call, keep scratch private                                               |
| Context switching                 |     1 | change_chat_context                                                                                                                     |
| Other                             |     2 | direct-tools-first, ask-one-clarification                                                                                               |

**35% of the "how to act" budget teaches the model how to navigate the instruction system rather than
how to do the user's work.** That is the anti-pattern, stated precisely.

### Placement evidence

The two research-persistence rules landed at **positions 13 and 14 of 20** — the middle of a flat
list. Measured effect on the target scenario: **0/5**. The project's own research dossier
(`docs/architecture/agent-first-orchestration/research/SYNTHESIS.md` §3) already documents why:
_Lost in the Middle_ — GPT-3.5 scored **53.8% mid-context vs a 56.1% closed-book baseline**.
Mid-list instructions performed worse than no instructions at all.

**A flat 20-item list has a middle, and the middle does not work.**

---

## 3. The restructure to evaluate

DJ's model: situation → rules; deep flow → skill file. Concretely, four tiers to decide between:

1. **Always-true invariants** (safety, honesty about writes, never fabricate) — must be unconditional
   and near a boundary (start or end), never mid-list.
2. **Situational rule blocks** — "You are doing web research: …", "You are resolving an entity: …",
   "You are about to write: …". Emitted only when the situation is live, so the model reads 4 rules
   that apply instead of scanning 20 that mostly don't.
3. **Skill files** — deep procedural flows, as today.
4. **Tool descriptions** — per-tool rules belong on the tool, not in a global list. Cheaper to
   attribute and it only loads when the tool does.

Open questions this pass must answer:

- Which of the 20 bullets are genuinely always-true vs situational? (First pass: ~6 always-true.)
- Can situational blocks be emitted from signals already computed server-side (domain sensing knows
  the shape of the request before the first LLM pass)?
- Does the instruction-navigation layer (~3,150 tokens) shrink if situational blocks name the right
  skill directly instead of teaching a search procedure?
- **Can the biggest tool schemas be trimmed?** `update_onto_task` at ~1,047 tokens is the single
  largest item in the entire payload.

---

## 4. Hard constraint discovered 2026-07-25 — read before designing

**`activation: always_on` is a dead enum.** It exists in `skill.schema.ts`, is parsed by
`markdown-skill.ts`, and is echoed in `skill_load` payloads and `skill-search` — but **no runtime
code acts on it.** All 52 runtime skills are `progressive`.

Measured consequence: across 10 instrumented turns the model made **exactly one `skill_load` call**,
and never for the skill written specifically for the behavior under test.

**So "put it in a skill" cannot be the answer for anything that must hold every turn.** Today a
rule has exactly two homes that reliably reach the model: the base prompt, or code. Any design that
routes always-on behavior into a skill must first wire `always_on` for real.

---

## 5. Related: research scratchpad (DJ, 2026-07-25)

> "When we do web research… we should auto-save. Make it a rule that when you do web research, you do
> something to synthesize the findings, and we save that in a scratch pad."

This is a **mechanism** proposal, not an instruction one, and it is strictly stronger than a prompt
rule: it does not depend on the model choosing to comply. Current state after the 2026-07-25 fix is
4/5 — an auto-save makes it 5/5 by construction.

Design questions (decide before building):

- **Where does it land?** A project document (existing infra, user-visible, risks doc bloat) vs a
  dedicated scratchpad record (cleaner, more work). DJ's "see what was learned per step" framing
  points at per-step records, which is also the `artifacts/` concept from the agent-first work —
  currently an **empty directory** in `packages/agent-orchestrator/src/`.
- **Deterministic capture or synthesized?** Raw capture (queries + URLs + snippets) needs no model
  call and cannot fail. Synthesis reads better but costs a call and can be skipped.
  Recommended: capture deterministically, synthesize opportunistically, promote to a real document
  on demand.
- **Interaction with the `research_capture` skill** (written 2026-07-25, currently unreachable —
  see §4).

---

## 6. Exit condition

Not "the prompt is shorter." The pass is done when:

1. Each of the 20 "How to act" bullets is classified: **always-true / situational / belongs-on-a-tool
   / belongs-in-a-skill / cut**.
2. A decision exists on whether situational blocks are emitted conditionally, and from which signals.
3. The instruction-navigation layer (~3,150 tokens) has a target size and a rationale.
4. The five largest tool schemas have a trim verdict each.
5. The scratchpad mechanism has a landing place decided (§5).

**Every change is verifiable.** `pnpm --filter @buildos/web test:agentic` with
`AGENTIC_SCENARIOS=<id>` and `--retry=0` runs the real endpoint against ground truth. Run ≥5× per
change — the config defaults to `retry: 1`, which at a 40% failure rate reports green ~84% of the
time. Do not accept a single green run as evidence.

---

## 7. Related documents

- `apps/web/.prompt-dumps/` — the measurements; every file self-reports its breakdown
- `apps/web/src/lib/services/agentic-chat-lite/prompt/build-lite-prompt.ts` — where "How to act" is built
- `apps/web/src/lib/services/agentic-chat/tools/core/definitions/tool-metadata.ts` — tool descriptions
- `apps/web/src/lib/services/agentic-chat/tools/skills/AUTHORING_GUIDE.md` — the skill-sizing rules this must stay consistent with
- `docs/architecture/agent-first-orchestration/research/SYNTHESIS.md` §3 — context-rot evidence
- `docs/architecture/agent-first-orchestration/TIER_1_RESULTS_2026-07-25.md` — the scenario suite that verifies changes
