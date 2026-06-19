<!-- apps/web/docs/technical/architecture/AGENTIC_CHAT_LAYER_TAXONOMY_PROPOSAL_2026-06-15.md -->

# Agentic Chat — Layer Taxonomy & Naming Proposal (2026-06-15)

**Status:** Implemented on 2026-06-15 with compatibility aliases retained.
**Author:** Claude (with DJ).
**Related:**

- Audit that surfaced these items: `apps/web/docs/technical/audits/AGENTIC_CHAT_DOMAINS_CAPABILITIES_SKILLS_TOOLS_AUDIT_2026-06-15.md`
- Prior harness audit: `apps/web/docs/technical/audits/AGENTIC_CHAT_HARNESS_QUALITY_AUDIT_2026-06-14.md`
- Skill authoring bar: `apps/web/src/lib/services/agentic-chat/tools/skills/AUTHORING_GUIDE.md`

> **Implementation note:** this started as a review proposal. It now records the
> rationale, the implemented outcome, and the remaining compatibility caveats.

---

## 1. TL;DR

Before this change, the agentic chat agent taught a layered model: **Domain → (Work
capability) → Capability → Skill → Tool/Op → (Resource)**. Two clarity problems made
routing harder than it needed to be:

1. **"Capability" is overloaded** — it names two _different_ runtime concepts
   (layer-2 "work capabilities" and layer-3 "capabilities"), and `project_audit`
   exists as an id in **both** catalogs _and_ as a skill. Terminology has already
   drifted: the gateway tools are **named** `work_capability_*` but their
   **descriptions** call the same thing "outcome cards."
2. **The prompt teaches six layers** but only ~four are load-bearing, and lean
   discovery mounts only two entry tools at launch. The two least-used layers are
   exactly the ones tangled in problem 1.

**Implemented fix:** standardize layer 2 on **`outcome_card`**, resolve the
`project_audit` triple-name, and simplify the _taught_ model to **3 primary layers +
2 optional accelerators**. The implementation keeps legacy aliases so older imports,
payloads, and tool calls keep working while the model-facing vocabulary moves to
outcome cards.

These were **clarity problems, not bugs** — the point of the change was to remove a
routing-confusion tax, not to fix a broken execution path.

### 1.1 Implementation update (2026-06-15)

The qualified-go path was implemented:

- Canonical layer-2 code now lives under
  `apps/web/src/lib/services/agentic-chat/tools/outcome-cards/`.
- `apps/web/src/lib/services/agentic-chat/tools/work-capabilities/` remains as a
  compatibility shim that re-exports the outcome-card APIs for old imports.
- Model-facing gateway tools are now `outcome_card_search` and `outcome_card_load`.
  Legacy `work_capability_search` and `work_capability_load` still execute as aliases,
  and gateway materialization normalizes them to the canonical names.
- The prompt now teaches **Domain → Skill → Tool/Op** as the primary path, with
  **Outcome card** and **Resource** as optional accelerators rather than co-equal
  layers.
- The layer-2 `project_audit` id was renamed to `project_health_audit`. The skill id
  and runtime capability id remain `project_audit`; the old layer-2 id is accepted as
  an alias for compatibility.
- Domain sensing/session payloads use `candidate_outcome_cards`,
  `candidate_outcome_card_ids`, and `active_outcome_cards`. Older persisted
  `candidate_work_capability_ids` and `active_work_capabilities` are still read.
- The prompt-eval harness now supports required/forbidden observed tool names, with
  scenarios added for cold email, YouTube growth, and UI/UX review outcome-card
  routing. The project-health audit scenario explicitly forbids outcome-card loads.
- The DB-backed domain research queue still has legacy `work_capability` naming
  (`work_capability_id`) pending a schema migration. That field is not model-facing.
- Follow-up review fixed one alias edge case: gateway materialization and materialized
  tool extraction now dedupe after legacy names normalize to canonical
  `outcome_card_*` names.
- Final integration pass moved the stream endpoint's live continuity path to
  `priorOutcomeCardIds`, kept the deprecated `priorWorkCapabilityIds` only as a
  compatibility input, and made compacted model payloads dedupe normalized
  `materialized_tools`.

### 1.2 Verification

- Regression tests for gateway alias normalization and admin analytics categorization
  passed: `tool-selector.test.ts`, `chat-tool-analytics.test.ts` (21 tests).
- Consolidated focused routing/prompt suite passed across outcome cards, domains,
  prompt eval, prompt construction, stream-orchestrator compaction/round analysis,
  tool selection, analytics, and skill discoverability (14 files, 98 tests).
- `pnpm --dir apps/web check` passed with 0 errors. It still reports one unrelated
  Svelte warning in `BriefChatModal.svelte` about `$state` capturing an initial prop
  value.

---

## 2. Background — the layered architecture (current shape)

All paths below are under `apps/web/src/lib/services/agentic-chat/tools/` unless noted.

| Layer | Current name     | Defined in                                                              | Count | What it is                                                                                                                                                                     |
| ----- | ---------------- | ----------------------------------------------------------------------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1     | **Domain**       | `domains/catalog.ts`                                                    | 14    | Subject territory / niche (marketing, sales_and_growth, product_and_design, writing, agent_engineering, …). Links skills + capabilities + gaps.                                |
| 2     | **Outcome card** | `outcome-cards/catalog.ts`                                              | 10    | Composite "outcome lane": a named job = domain(s) + skills + tool hints + `outputs` + `evaluationCriteria`. e.g. `cold_email_campaign_build`, `ui_ux_screen_review`.           |
| 3     | **Capability**   | `registry/capability-catalog.ts`                                        | 12    | BuildOS _tool-capability bucket_ — what the agent can do at runtime. e.g. `planning`, `documents`, `calendar`, `project_audit`. Maps to `skillIds` + `directPaths` (op paths). |
| 4     | **Skill**        | `skills/registry.ts` + `skills/definitions/**/SKILL.md`                 | 45    | The loadable workflow playbook (markdown body, `whenToUse`, `workflow`, `## Output`, guardrails, examples).                                                                    |
| 5     | **Tool / Op**    | `registry/tool-registry.ts` + `core/`                                   | —     | The executable surface. Ops (`onto.task.update`) resolve to callable tool names (`update_onto_task`).                                                                          |
| 6     | **Resource**     | declared on skills/domains; loaded via `skills/skill-reference-load.ts` | —     | Deep reference modules / source maps, loaded on demand.                                                                                                                        |

### How discovery flows at runtime

- **System prompt** is built by `buildLitePromptEnvelope` in
  `apps/web/src/lib/services/agentic-chat-lite/prompt/build-lite-prompt.ts`. The
  taught model now centers the primary path **Domain → Skill → Tool/Op**, with
  outcome cards and resources as optional accelerators.
- **Domain-sensing runs every turn** (`domains/domain-sensing.ts`) and injects an
  `## Active Domain Signals` block (`build-lite-prompt.ts:460-485`) listing candidate
  domains, candidate outcome cards, and recommended skills.
- **Discovery tools** are defined in `core/definitions/gateway.ts` and mounted by
  `core/gateway-surface.ts`. Progressive disclosure is round-free: each discovery
  result carries `materialized_tools` + a `next_step`, and the orchestrator
  (`apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator/index.ts`) mounts
  those tools for the rest of the turn. Path:
  `domain_search → domain_load → outcome_card_load → skill_load → {real tools}`.
  Legacy `work_capability_*` tool names are accepted as aliases and normalized to
  `outcome_card_*`.
- **`skill_search` indexes all registered skills** (`skills/skill-search.ts:138`), so
  every skill is reachable by keyword even if no domain routes to it.

This architecture is sound and mostly well-wired (see the companion audit). The
issues below are about _naming and teaching_, not mechanics.

---

## 3. Problem 1 — "Capability" means three different things

### 3.1 The collision

| Concept                   | Catalog                          | Field other layers use to point at it                                                                                                 |
| ------------------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Layer-2 "work capability" | `work-capabilities/catalog.ts`   | work-capability ids; surfaced as `candidate_work_capabilities` in sensing                                                             |
| Layer-3 "capability"      | `registry/capability-catalog.ts` | `domain.capabilityIds` (`domains/catalog.ts:17` etc.); `workCapability.buildosCapabilityIds` (`work-capabilities/catalog.ts:11` etc.) |

Both are runtime concepts, both are called "capability," and they are referenced by
similarly-named fields. A model (or a maintainer) reading "capability" has to
disambiguate which catalog every time.

### 3.2 Where it actually bites

- **`project_audit` is a triple-name.** It is:
    - a layer-3 capability — `registry/capability-catalog.ts` id `project_audit` (~`:164`),
    - a layer-2 work capability — `work-capabilities/catalog.ts` id `project_audit` (~`:309`),
    - and a skill — `skills/registry.ts` `projectAuditSkill` / `skills/definitions/project_audit/`.
- **One gateway tool forces the model to hold both "capability" meanings at once.**
  `work_capability_search` takes **both** a `domain` arg **and** a `buildosCapability`
  arg (`core/definitions/gateway.ts:58-67`):

    ```
    domain:            Optional BuildOS domain id ("sales_and_growth.cold_email")
    buildosCapability: Optional BuildOS runtime capability id ("planning", "documents", "project_audit")
    ```

- **Terminology has already drifted.** The tools are _named_ `work_capability_search`
  / `work_capability_load`, but their _descriptions_ already call the thing an
  **"outcome card"** (`gateway.ts:49` "Find outcome cards within a domain";
  `gateway.ts:81` "Load one compact WorkCapability outcome card"). Meanwhile the
  prompt teaches "Work capability" (`build-lite-prompt.ts:509`). So the model is told
  three labels for one concept: `work_capability` (tool name), "work capability"
  (prompt), "outcome card" (tool description).

- **Layer 2 is represented twice.** The same composite-job concept exists both as
  `work-capabilities/catalog.ts` entries _and_ as `domain.recommendedSkillStacks`
  (`domains/types.ts:23-28`, used throughout `domains/catalog.ts`). Some ids appear in
  **both**, e.g. `short_form_video_asset_improvement` is a skill-stack
  (`domains/catalog.ts:175`) **and** a work-capability (`work-capabilities/catalog.ts:252`).

### 3.3 Why it matters

The agent has to route correctly on weaker/older models (BuildOS deliberately runs
across a model lane range — see `packages/smart-llm/src/model-config.ts` and
`apps/web/src/lib/services/openrouter-v2/model-lanes.ts`). Ambiguous vocabulary is a
tax paid on every routing decision, and the `project_audit` triple-name is a concrete
trap where the model can load the wrong artifact.

---

## 4. Problem 2 — Six taught layers, ~four load-bearing

The prompt teaches a **six-layer** model verbatim (`build-lite-prompt.ts:506-514`):

```
Think in six layers. They work together in sequence:
1. Domain - the subject territory or niche the user is operating in.
2. Work capability - the specialized outcome lane inside a domain.
3. Capability - what BuildOS can do for the user at runtime.
4. Skill - workflow guidance for doing that work well. ...
5. Tool / Op - the exact execution surface. ...
6. Resource - supporting reference material, examples, source maps, or deeper evidence.
```

But:

- The model mostly walks **Domain → Skill → Tool**. Layers 2 (work capability) and 6
  (resource) are the least-exposed.
- **Lean discovery mounts only two entry tools at launch** — `skill_search` +
  `domain_search` (`gateway-surface.ts` `GATEWAY_LAUNCH_DISCOVERY_TOOL_NAMES`, gated by
  `FASTCHAT_LEAN_DISCOVERY`). The work-capability tools are intentionally _not_
  preloaded (`tool-selector.test.ts:24,76`); they materialize on demand.
- So the prompt's heaviest conceptual scaffolding (6 co-equal layers) is wider than
  what the runtime actually exposes, and the extra layers are the ones most likely to
  be skipped or confused — the same ones tangled in Problem 1.

---

## 5. Why the two problems are coupled

They are the same change from two angles. Problem 1 fixes the _names_; Problem 2 fixes
how those names are _taught_. The "work capability" layer is the center of both. Fixing
one without the other leaves the prompt teaching the old vocabulary, so they should be
done as a single coordinated change.

---

## 6. Proposed solution

### 6.1 Rename layer 2 to one distinct term

Standardize on **`outcome_card`** (already used in the tool descriptions). Rationale
for _not_ using "playbook": skill bodies already describe themselves as "workflow
playbook" (e.g. `skills/definitions/task_management/SKILL.md:3`), so "playbook" would
re-collide with the skill layer. After the rename, the vocabulary is unambiguous:

- **Capability** = what the agent can do (layer 3) — the only thing called "capability."
- **Outcome card** = a pre-assembled skill+tool recipe for a known job, with a quality
  bar (layer 2).

Concrete edits:

- `work-capabilities/` → outcome-card terminology: `WorkCapabilityDefinition` →
  `OutcomeCardDefinition`, `listWorkCapabilities` → `listOutcomeCards`, etc.
- Model-facing tool names: `work_capability_search` → `outcome_card_search`,
  `work_capability_load` → `outcome_card_load` (`core/definitions/gateway.ts`,
  `gateway-surface.ts`, and the orchestrator's materialization plumbing).
- Sensing fields: `candidate_work_capabilities`, `priorWorkCapabilityIds`,
  `work_capability_ids` → outcome-card equivalents (`domains/domain-sensing.ts`,
  `domains/types.ts`).
- Keep `buildosCapabilityIds` pointing at layer 3, but it no longer shares the word
  "capability" with layer 2's name.
- **Resolve the `project_audit` triple-name** — rename the layer-2 entry (e.g.
  `project_health_audit`) so capability + skill + outcome-card are distinct.
- **Optional:** merge `domain.recommendedSkillStacks` into the outcome-card catalog so
  the concept lives in one place (removes the double representation in §3.2).

### 6.2 Simplify the taught model to 3 + 2

Rewrite `buildCapabilitiesSkillsToolsSection` (`build-lite-prompt.ts:487-527`) and the
relevant `buildOperatingStrategySection` bullets (`:443-447`) to teach:

- **Primary path:** Domain → Skill → Tool/Op.
- **Two optional accelerators:** an **outcome card** ("a pre-assembled skill+tool
  recipe for a common job, with a quality bar") and a **resource** ("deep reference,
  loaded on demand"). Presented as things to reach for, not co-equal layers.

### 6.3 Sequencing (de-risked)

1. **Model-invisible internal rename first** — TS types, catalog, function names. Zero
   behavior change; the integrity/discoverability tests (below) catch breakage. DJ can
   review this diff with no eval risk.
2. **Model-facing change, eval-gated** — rename the gateway tool names + rewrite the
   prompt layer section + resolve `project_audit`.
3. **Run the prompt-eval harness** before/after and only keep the change if routing
   holds or improves: `agentic-chat-v2/prompt-eval-scenarios.ts`,
   `prompt-eval-comparison.ts`, `prompt-eval-runner.ts`, `prompt-evaluator.ts`.

### 6.4 Existing guard tests (already in place from the 2026-06-15 audit)

These make the rename safer — they fail loudly if a reference breaks:

- `skills/skill-related-ops-integrity.test.ts` — every skill `relatedOp` resolves.
- `skills/skill-discoverability.test.ts` — no accidental orphan skills.
- `skills/skill-output-contract.test.ts` — native procedural skills keep `## Output`.
- `domains/domain-load.test.ts` — catalog cross-references resolve.

---

## 7. Decisions resolved

1. **Go:** proceed. The `capability` overload and the six-layer prompt were creating
   avoidable routing ambiguity.
2. **Layer-2 label:** use `outcome_card`. It was already present in gateway
   descriptions and does not collide with skill/playbook language.
3. **Model-facing tools:** rename to `outcome_card_search` and `outcome_card_load`,
   while keeping `work_capability_*` as non-primary aliases.
4. **Rename rather than delete:** keep layer 2 for now. Outcome cards still provide a
   compact job-level quality bar that domains and skills do not fully replace. Revisit
   deletion only if eval/tool-usage data shows the layer is not pulling its weight.

---

## 8. Alternatives considered

- **Do nothing.** Lowest risk. The overload is a standing confusion tax and the
  `project_audit` triple-name is a real trap, but nothing is broken.
- **Prompt-only fix (no code rename).** Sharpen the prompt to distinguish the two
  "capability" meanings and resolve `project_audit`, without renaming the
  `work_capability_*` tools. Lower effort/risk; the lexical collision in code +
  tool names remains.
- **Delete layer 2.** Remove work-capabilities entirely; rely on Domain → Skill +
  `recommendedSkillStacks`. Biggest simplification, biggest behavior change — needs the
  eval to confirm the layer isn't carrying real routing value.
- **Different label** (`recipe`, `job`, `workflow_pack`). `outcome_card` is preferred
  because it is already in the tool descriptions and collides with nothing else.

---

## 9. Risks

- **Routing regression on weak models.** Changing the taught mental model + tool names
  could degrade routing; this is the reason for eval-gating (§6.3).
- **Churn surface.** The rename threads through ~6 files + tests + prompt; a stale
  reference would break discovery. Mitigated by the guard tests (§6.4) and the
  internal-first sequencing.
- **Published-skill coupling.** Note `google_calendar` (and other skills) back
  published agent-skill blogs via `apps/web/src/lib/server/agent-skills.ts`
  (`resolveRuntimeSkillForPost`). The layer-2 rename does not touch skill ids, so this
  is unaffected — flagged only so the reviewer knows skill-id stability matters
  elsewhere.

---

## 10. Reference index (file:line)

**Layer catalogs**

- `apps/web/src/lib/services/agentic-chat/tools/domains/catalog.ts` — domains (incl. `capabilityIds:17`)
- `apps/web/src/lib/services/agentic-chat/tools/domains/types.ts` — `DomainSkillStack` / `recommendedSkillStacks` (`:23-28`)
- `apps/web/src/lib/services/agentic-chat/tools/outcome-cards/catalog.ts` — canonical layer-2 outcome-card catalog.
- `apps/web/src/lib/services/agentic-chat/tools/outcome-cards/types.ts`
- `apps/web/src/lib/services/agentic-chat/tools/work-capabilities/` — compatibility shims for legacy imports.
- `apps/web/src/lib/services/agentic-chat/tools/registry/capability-catalog.ts` — layer-3 (incl. `project_audit:164`)
- `apps/web/src/lib/services/agentic-chat/tools/skills/registry.ts` — skills (45)

**Discovery / runtime**

- `apps/web/src/lib/services/agentic-chat/tools/domains/domain-sensing.ts` — sensing, `SensedOutcomeCard`, `candidate_outcome_cards`
- `apps/web/src/lib/services/agentic-chat/tools/core/definitions/gateway.ts` — canonical `outcome_card_search` / `outcome_card_load` plus legacy `work_capability_*` aliases.
- `apps/web/src/lib/services/agentic-chat/tools/core/gateway-surface.ts` — discovery sets, lean launch
- `apps/web/src/lib/services/agentic-chat/tools/skills/skill-search.ts` — `listAllSkills():138`
- `apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator/index.ts` — materialization loop

**Prompt**

- `apps/web/src/lib/services/agentic-chat-lite/prompt/build-lite-prompt.ts` — operating strategy `:438-456`; six-layer teaching `:487-527` (the list at `:506-514`); active domain signals `:460-485`

**Eval harness**

- `apps/web/src/lib/services/agentic-chat-v2/prompt-eval-scenarios.ts`
- `apps/web/src/lib/services/agentic-chat-v2/prompt-eval-comparison.ts`
- `apps/web/src/lib/services/agentic-chat-v2/prompt-eval-runner.ts`
- `apps/web/src/lib/services/agentic-chat-v2/prompt-evaluator.ts`

**Guard tests (regression safety net)**

- `apps/web/src/lib/services/agentic-chat/tools/skills/skill-related-ops-integrity.test.ts`
- `apps/web/src/lib/services/agentic-chat/tools/skills/skill-discoverability.test.ts`
- `apps/web/src/lib/services/agentic-chat/tools/skills/skill-output-contract.test.ts`
- `apps/web/src/lib/services/agentic-chat/tools/domains/domain-load.test.ts`

**Model lanes (why weak-model routing matters)**

- `packages/smart-llm/src/model-config.ts`
- `apps/web/src/lib/services/openrouter-v2/model-lanes.ts`

**Origin audit**

- `apps/web/docs/technical/audits/AGENTIC_CHAT_DOMAINS_CAPABILITIES_SKILLS_TOOLS_AUDIT_2026-06-15.md`
  </content>
