# Agentic Chat Prompt Quality Audit — 2026-07-10

**Scope:** The live `lite_seed_v1` prompt system (`apps/web/src/lib/services/agentic-chat-lite/prompt/build-lite-prompt.ts`) plus its feeder surfaces: domain sensing, skill catalog, tool descriptions, per-turn injections. Audited against real production prompt dumps (`.prompt-dumps/`, July 7–8 2026) and current (2025–2026) prompt-engineering research.

**Models this must work on:** default primary is `deepseek/deepseek-v4-flash` via OpenRouter (`packages/smart-llm/src/model-config.ts` `balanced` route), with Qwen 3.7 Plus, Tencent HY3, Xiaomi MiMo, Gemini 3.1 Flash Lite, Poolside Laguna XS as fallbacks. The initial-plan pass under tiering routes to the cheapest of these. **Every finding below is weighted for this model class, not for frontier models.**

---

## 1. Research grounding (what changed since these prompts were written)

### 1.1 The negation / "pink elephant" research is real

- **Anthropic, "Verbalizable Representations Form a Global Workspace in Language Models"** (July 6–9 2026, transformer-circuits.pub/2026/workspace) — the "J-space" paper. Interpretability result: told to copy a sentence while *not* thinking about the Golden Gate Bridge, Claude complied in output but the forbidden concept stayed active above baseline in a sparse internal workspace, and suppression sometimes failed. It's an interpretability finding, not a prompting guide — but it confirms the mechanism.
- **ReboundBench / "Don't Think of the White Bear"** (arXiv 2511.12381, NeurIPS 2025 CogInterp): the behavioral evidence. Rebound (elevated probability of emitting the forbidden token) appears immediately after a negation instruction and **intensifies with longer, semantically-related distractor text between the instruction and the generation point**. A tool-calling loop stuffed with tool results is exactly that condition.
- **Anthropic's standing guidance:** "Tell Claude what to do instead of what not to do."
- **The nuance that keeps this from being dogma:** concrete negative constraints paired with a positive replacement work fine ("Don't exceed 150 words" beats "be concise"). The enemy is the **bare, vague negation with no replacement behavior, sitting far from the decision point**. Several of our `Never X` rules are dated regression fixes for observed weak-model failures (Grok header-mirroring) — those earn their place but should be restructured, not deleted.

### 1.2 Weak-model constraints (DeepSeek-V3/V4-flash class)

- Instruction adherence decays **exponentially** with rule count on this model class (IFScale, arXiv 2507.11538). Every marginal rule dilutes all the others.
- Documented DeepSeek agentic failures: repetitive/unnecessary tool calls, schema-guessing despite error feedback, substituting plausible values for missing data, tool calls emitted as plain text when boundaries are ambiguous.
- **Explicit decision rules massively outperform open-ended judgment on this tier**: one added rule ("if the requested data is not present, assume 0") lifted DeepSeek V3.1 from 52.9% → 87.5% on an agentic benchmark (arXiv 2512.07497). DJ's instinct to keep prescriptive creation guidance (the standing "keep project-create prose" ruling) is validated.
- **Resolution of the frontier-vs-weak tension:** audit against the weakest model in the route. Cut the *count* of rules, not the *concreteness* of the rules you keep.

### 1.3 Bloat and placement

- Context Rot (Chroma, 2025): accuracy drops non-uniformly as input grows; middle-of-context suffers most; distractors make it worse.
- Consensus patterns: progressive disclosure (Level-1 metadata always in context, bodies on demand — our skill_load design is the canonical shape); *when* to call a tool = system prompt, *how* = tool description, never both; identity + hard constraints early, operational rules near the action; contradictions are the #1 debugging target.

---

## 2. Measured state (real production dumps)

| Metric | Global turn 1 (7/08) | Project turn 3 (7/07) |
| --- | --- | --- |
| System prompt | 34,186 chars (~8,547 tok) | 32,713 chars (~8,179 tok) |
| Tool definitions | 11,631 chars (~2,908 tok) | 28,501 chars (~7,126 tok) |
| History | 0 | ~2,076 tok |
| **Provider payload** | **~11,464 tok** | **~17,387 tok** |

Section weights (global turn 1):

| Section | Size | Notes |
| --- | --- | --- |
| capabilities_skills_tools | 12,124 chars (~3,031 tok) | ~8.7k chars is the root-skill catalog table |
| location_loaded_context | 7,024 chars (~1,756 tok) | JSON index |
| timeline_recent_activity | 4,730 chars (~1,183 tok) | prose duplicate of much of the JSON |
| operating_strategy | 3,912 chars (~978 tok) | 18 bullets |
| safety_data_rules | 3,872 chars (~968 tok) | 19 bullets |
| identity/focus/location/inventory/preamble | ~2,200 chars | fine |

Negation census: **22 explicit "do not / never / don't"** in the assembled global prompt; the safety section is 19 bullets of near-pure prohibition; `skill_load` behavior is legislated in **~5 separate places**.

---

## 3. Findings (ranked)

### F1 — HIGH: The same work item can appear up to 4 times in one prompt

`location_loaded_context` renders a JSON index whose `selected_refs` (overdue_or_due_soon / upcoming_work / recent_changes / attention_projects) are then re-rendered as prose bullets in `timeline_recent_activity` ("Overdue or due soon", "Upcoming dated work", "Recent project changes", "Project status"). On top of that, a task and its auto-created `Due: <task title>` calendar event are both listed. In the 7/08 dump, "Set up Tue/Fri mock interview cadence" appears 4 times. Combined weight ~2,900 tokens with roughly 60–70% semantic overlap. This is pure Context Rot fuel: distractor mass between the rules and the user message.

**Fix:** render each item once. Keep the prose timeline (models read it better than JSON) as the single carrier of overdue/upcoming/recent; reduce the JSON index to `context_meta` + `loaded_counts` + project refs with IDs. Suppress `Due:` shadow events whenever the underlying task is already listed. Est. saving: **1,200–1,800 tokens/turn**, plus less attention pollution.

### F2 — HIGH: The root-skill catalog is not Level-1 metadata

The catalog table (~8.7k chars, ~2,200 tok) renders on **every turn in every context**, and several entries run 500–700 chars of dense marketing-register prose (`ai_era_craft_and_quality_moat`, `viral_content_for_boring_brands`, `youtube_channel_craft_for_founders`). The Agent Skills reference pattern is name + one-line trigger; the long "Use when… Covers… Not for…" routing prose belongs in `skill_search` results and the skill body, both of which already exist.

**Fix:** cap catalog descriptions at ~120 chars of trigger language ("Grow a founder YouTube channel: packaging, cadence, positioning."). The "Not for X — route to Y" disambiguation moves into the skill's own metadata surfaced by `skill_search`/`skill_load`. Est. saving: **~1,500 tokens/turn, every turn, every context**. Also gate the catalog out of `project_create` entirely (see F4).

### F3 — HIGH: Negation-heavy safety/strategy sections, with stale pink-elephant rule as the flagship

- The anti-echo bullet — the very first safety rule — names the exact strings it forbids echoing, **including two section headers that no longer exist** ("Final-response rules", "Communication pattern" were removed in the 2026-04-17 flat-list restructure). To comply, the model must hold those strings active on every token of every reply. This is the purest ironic-rebound construction in the codebase, aimed at the model class most susceptible to it.
- 12 of 19 safety bullets and 7 strategy bullets lead with prohibition. Many contain their own positive form buried mid-bullet.

**Fix pattern (not wholesale deletion):** lead every rule with the desired behavior; keep the prohibition only as a short concrete tail when there's a documented failure behind it.

- Anti-echo → "Your reply is user-facing prose only. Write directly to the user in natural sentences." (The runtime already has echo-repair instructions as backstop; the header enumeration adds risk, not safety.)
- "Do not claim a tool ran unless…" → "Report only tool results the runtime returned. After tools complete, state what succeeded, what failed, what did not change." (Merges 4 current bullets: lead-in intent, grounding, write-set matching, failure disclosure.)
- "Never truncate UUIDs / placeholders like REPLACE_ME…" → keep. Concrete negative with named forbidden tokens is the *correct* form here — it's an output-format constraint, not a behavior suppression, and weak models need the literal examples.
- "Do not invent project/task/document data…" → "Ground every fact about the user's data in loaded context or tool results; when data is missing, say it's missing." (Also adds the missing-data decision rule DeepSeek measurably needs.)

Target: safety section from 19 bullets → ~10; strategy from 18 → ~12. Est. saving ~700 tokens, plus adherence gains that matter more than the tokens (exponential decay class).

### F4 — HIGH: `project_create` contradicts itself and hauls dead weight

In `project_create` context the tool surface is exactly one tool (`create_onto_project`) — correct and good. But the assembled prompt still includes:

- The full Operating Strategy, whose bullets mandate `skill_load` gating, `domain_search`, `tool_search`, `change_chat_context` — **none of which exist in this context's tool surface**. For a model class documented to emit phantom tool calls, instructing it to use tools it doesn't have is an invitation.
- The full skill catalog (~2.2k tok) it cannot load from.
- "Guidance is already preloaded; do not call skill_load / tool_schema" stated **4 times** (focus core content, workflow bullet 1, Location section, Creation Boundaries section) — while Operating Strategy says the opposite. This is the exact "contradictory rules → oscillation" failure OpenAI flags as the top prompt bug.

**Fix:** context-fork the static frame. `project_create` gets: identity, the 17-bullet creation workflow (keep it — the "keep project-create prose" ruling stands, weak models need it), a 5-bullet mini-strategy (answer from the idea, one clarification max, create then continue inside the project), and the UUID/grounding safety core. Drop catalog, discovery-routing strategy, and 3 of the 4 "preloaded" restatements. Est. **~4k tokens lighter** and contradiction-free in the context where write correctness matters most.

### F5 — MEDIUM: The routing meta-vocabulary outgrew its readers

The prompt asks a cheap model to hold: domains, skills, child skills, reference modules, skill stacks, outcome cards, resources, capabilities, ledgers, gates — and spends a bullet disambiguating its own jargon ("Do not use capability to mean outcome card"). When a prompt must define its terms against each other, the taxonomy is too wide for the context window it lives in.

**Fix:** model-facing text talks about **two things: skills (how to do work well — load one when it matches) and tools (what executes)**. Domains/outcome cards/resources stay as *runtime machinery* surfaced by Active Domain Signals with imperative micro-instructions in the moment ("Load skill X before answering") rather than standing taxonomy education. The capabilities bullet list (12 lines) can shrink to a one-line orientation or fold into the skill table. The disambiguation bullet disappears because the collision disappears.

### F6 — MEDIUM: `skill_load` policy legislated in ~5 places

Capabilities framing, two-plus Operating Strategy bullets, retrieval-map notes ("Load the matching skill before answering… (see Operating Strategy)"), the Active Domain Signals gate text, and ledger rules. Duplication costs tokens twice and breeds drift (it already drifted — see F4's contradiction).

**Fix:** one authoritative paragraph in Operating Strategy; the gate text in Active Domain Signals stays (it's the near-the-action reminder, which is where reminders work); delete the rest.

### F7 — MEDIUM: Tool-description / system-prompt double placement

Example: `change_chat_context` — the "don't bounce contexts / ambiguous names / brief mentions" policy appears in both the Operating Strategy bullet and the (well-written) tool description. Same for overview-tool steering (strategy bullet + `OVERVIEW_GUIDANCE_LITE` + tool descriptions).

**Fix:** *when-to-consider* stays in the system prompt as one short bullet; *when-exactly / how* lives in the tool description only. The tool descriptions themselves are in good shape — keep them as the source of truth.

### F8 — LOW: Staleness and leaks

- `phase-frame.ts` (`buildLitePhaseFrame`) — exported, tested, **zero runtime callers**. Delete or wire it up.
- `DISCOVERY_TOOL_NAMES` still carries `work_capability_search`/`work_capability_load` (renamed to `outcome_card_*`, alias-bridged); `priorWorkCapabilityIds` deprecated. Finish the rename.
- `Prompt variant: lite_seed_v1` and the H1 `# BuildOS Lite Agentic Chat Prompt` leak internal build metadata into model input — wasted tokens that also invite echo. Telemetry already captures the variant in dump metadata.
- "Use this seed for: — Seed a workspace-level assistant…" is builder-speak addressed to nobody. Replace with direct second-person framing ("You are working at workspace level; narrow scope when the user asks.") or delete — the identity section already covers it.
- The legacy v1 endpoint (`/api/agentic-chat/agent-message` + `actionable-insight-agent.ts`) is a separate live-but-old prompt surface still wired into some UI. Decide: migrate or retire.

### F9 — LOW: Placement of the final-response contract

The final-response rules (grounding, write-set matching) sit mid-prompt in section 6 of 12, then ~1,500–3,000 tokens of data sections and the whole conversation land after them — the degraded middle. The runtime's repair/finalization injections partially compensate.

**Fix (cheap):** after the F3 merge, move the 3-line final-response contract to the very end of the system prompt (recency position). Keep identity + hard constraints at the top (primacy).

### F10 — What's already right (don't churn these)

- Progressive disclosure (catalog + `skill_load` + reference modules) is exactly the canonical Agent Skills architecture. The 52 skill bodies / 9k lines living outside the prompt is the correct place for "important details in skills."
- The per-context tool-surface profiles, bounded START HERE excerpt (2,400 chars), knowledge-map cap (60 nodes / 2,200 chars), prompt-size budget tests, and dated model-specific regression comments (Grok mirroring) are all above-average craft.
- Skill-gate preload (skipping a round by injecting the short-format skill) is a good weak-model pattern.
- Untrusted-data framing on DB values and attachments: keep, it's earning its tokens (can be consolidated from 3 statements to 2).

### Context-shape assessment vs the intended model

The intended shape (global = light + flexible; project = project-grounded; task = zoomed focus; create = guided funnel) **matches the architecture** — context types, focus-entity threading, tool profiles, and section gating all branch correctly. The failure is *weight distribution*: global chat, the surface that should be lightest, carries the heaviest static frame (~6.2k tokens of catalog + strategy + safety before any data). Task focus works via `focusEntityType/Id/Name` inside project context (there is no separate task context type — that's fine), but gets no task-specific workflow hint; a one-liner pointing at `task_management` when focus is a task would be cheap and useful. `daily_brief` has the largest tool surface (21 tools, ~5.4k tok of schemas) — worth a diet pass of its own.

---

## 4. Recommended work plan

| # | Change | Effort | Est. impact |
| --- | --- | --- | --- |
| WP-1 | De-duplicate timeline vs JSON index; suppress `Due:` shadow events (F1) | S | −1,200–1,800 tok/turn |
| WP-2 | Skill-catalog diet to ≤120-char triggers; move routing prose to skill_search/bodies (F2) | S–M | −1,500 tok/turn, all contexts |
| WP-3 | `project_create` fork: mini-strategy, no catalog, single "preloaded" statement (F4) | M | −4k tok + removes contradictions on the write-critical path |
| WP-4 | Negation rewrite of safety + strategy (F3 pattern); fix stale anti-echo header list; merge tool-outcome bullets; add missing-data decision rule | M | −700 tok + adherence |
| WP-5 | Vocabulary diet: skills + tools as the only model-facing taxonomy (F5) + skill_load single-home (F6) | M | −400–600 tok + less oscillation |
| WP-6 | Policy/mechanics split for tool guidance (F7); move final-response contract to prompt end (F9) | S | drift-proofing, recency |
| WP-7 | Cleanups: variant-line leak, H1, "Seed a…" wording, phase-frame.ts, work_capability rename (F8) | S | hygiene |
| WP-8 | Re-measure: update prompt-size budgets downward after WP-1..5 so drift-guard locks in the win; replay eval on DeepSeek-v4-flash + one fallback | S | keeps it won |

Ballpark: global turn-1 payload ~11.5k → **~7.5–8k tokens (−30%)**, project turns similar, `project_create` roughly halved — with the biggest expected quality gain coming from contradiction removal (F4) and rule-count reduction (F3/F5) on the exponential-decay model class, not from the tokens themselves.

**Guardrails for the rewrite:** keep the 17-bullet creation spec ("keep project-create prose" ruling); keep concrete-negative output-format rules (UUID/placeholder bans); keep dated regression rules but restructure to positive-first; audit every cut against `deepseek-v4-flash`, not against what a frontier model would tolerate; run the existing prompt-eval replay before/after.
