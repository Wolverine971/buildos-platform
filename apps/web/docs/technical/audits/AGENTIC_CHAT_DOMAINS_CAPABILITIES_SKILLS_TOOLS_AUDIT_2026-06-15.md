<!-- apps/web/docs/technical/audits/AGENTIC_CHAT_DOMAINS_CAPABILITIES_SKILLS_TOOLS_AUDIT_2026-06-15.md -->

# Agentic Chat — Domains / Capabilities / Skills / Tools Audit (2026-06-15)

**Scope:** Evaluate the four-layer routing surface the agentic chat agent uses —
domains → (work) capabilities → skills → tools — and answer: _does the agent have
enough context to do this work well?_ Checks for bugs, design flaws, and
opportunities.

**Verdict:** The architecture is strong. Progressive disclosure is real,
domain-sensing is auto-injected every turn, the search→load→materialize chain is
round-free at almost every hop, and the catalogs are referentially clean (zero
dead skill/capability/domain/resource cross-references). The marketing /
cold-email / YouTube skill families are genuinely high quality and source-backed.

The gaps are specific: **three runtime bugs** that cost the agent dead-end rounds,
**two dead op references** in skill markdown, a structural **"capability" naming
overload**, and a cluster of **starved BuildOS-native skills** missing output
contracts.

> Companion to `AGENTIC_CHAT_HARNESS_QUALITY_AUDIT_2026-06-14.md` (Tier 1/2 harness
> work). This doc covers the routing/catalog surface specifically.

---

## Architecture (as built)

The model is taught a **six-layer** stack in the system prompt
(`agentic-chat-lite/prompt/build-lite-prompt.ts:506-514`), though most reasoning
happens over four:

| Layer              | Catalog                                          | Purpose                                                                                           |
| ------------------ | ------------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| 1. Domain          | `tools/domains/catalog.ts` (13)                  | Subject taxonomy (marketing, sales, product/design, writing). Links skills + capabilities + gaps. |
| 2. Work capability | `tools/work-capabilities/catalog.ts` (10)        | Composite "outcome cards": domain + skills + tools + outputs + eval criteria.                     |
| 3. Capability      | `tools/registry/capability-catalog.ts` (12)      | BuildOS-native tool-capability buckets (planning, documents, calendar…) → skillIds + op paths.    |
| 4. Skill           | `tools/skills/registry.ts` + `definitions/` (45) | The actual loadable skill bodies (markdown).                                                      |
| 5. Tool / Op       | `tools/registry/tool-registry.ts` + `core/`      | Executable ops, exposed via a small meta-tool gateway.                                            |
| 6. Resource        | declared on skills + domains                     | Deep reference modules loaded on demand.                                                          |

**Runtime path:** `routes/api/agent/v2/stream/+server.ts` → system prompt built by
`buildLitePromptEnvelope` (`agentic-chat-lite/prompt/build-lite-prompt.ts`) → tool
surface from `selectFastChatTools` → `getGatewaySurfaceForProfile`
(`tools/core/gateway-surface.ts`) → round loop + on-demand materialization in
`agentic-chat-v2/stream-orchestrator/index.ts`.

**Discovery is auto + injected.** `senseDomains()` runs every turn
(`stream/+server.ts:~3145`) and the result is rendered as the `## Active Domain
Signals` prompt section (`build-lite-prompt.ts:460-485`). This wiring is sound.

**Progressive disclosure is mostly round-free.** Each discovery payload carries
`materialized_tools` + a `next_step`; the orchestrator mounts those tools for the
rest of the turn (`stream-orchestrator/index.ts:1285-1289`). Chain:
`domain_search→domain_load→work_capability_load→skill_load→{real tools}`.

---

## Bugs

### BUG-1 [HIGH] — `related_ops` op names are surfaced but uncallable and unrecoverable

`skill_load` returns both `related_ops` (canonical op names like `onto.task.update`)
and `materialized_tools` (callable tool names like `update_onto_task`) —
`tools/skills/skill-load.ts:162-166`. Only the latter is mountable. If the model
calls the op name, the on-miss recovery path
(`stream-orchestrator/index.ts:1228-1243`) only resolves **tool names**
(`gateway-surface.ts:156` `resolveGatewayToolDefinition`), and `patchToolCall` does
no op→tool normalization — so the call hard-fails with "Tool not available in this
context" (terminal), or retry-loops.

**Fix:** Make the on-miss path op-aware. When a requested name doesn't resolve as a
tool, normalize it as an op (`normalizeGatewayOpName`) and resolve to its
`tool_name` via the tool registry; materialize that tool and instruct the model to
retry with the callable name. Converts a terminal dead-end into a one-round
recovery, consistent with existing on-miss UX.

### BUG-2 [MEDIUM] — `domain_load` never materializes `skill_load`, and mis-mounts `resource_search`

`tools/domains/domain-load.ts:195-205`: when a domain has skills it mounts
`resource_search` but **not** `skill_load`, despite its own `next_step` and the
prompt both steering domain→skill. Worse, the condition mounts `resource_search`
whenever `skills.length > 0` _even if the domain has zero resources_ — so the model
gets the wrong tool mounted and not the right one. (Demonstrated by the existing
`sales_and_growth.cold_email` test: 8 skills, 0 resources, yet asserts
`resource_search` and not `skill_load`.)

**Fix:** Mount `skill_load` when `skills.length > 0`; gate `resource_search` on
resources actually existing.

### BUG-3 [MEDIUM] — `work_capability_search` had no round-free predecessor

`work_capability_search` is taught in the operating-strategy prompt
(`build-lite-prompt.ts:~444`) and defined in `GATEWAY_TOOL_DEFINITIONS`, but it was
in neither `GATEWAY_DISCOVERY_TOOL_NAMES` (`gateway-surface.ts:14-24`) nor any
predecessor's `materialized_tools`. The only way to reach it was the model guessing
the name and paying an on-miss round.

**Important design constraint:** keeping work-capability tools _off_ the launch
surface is **intentional** — `tool-selector.test.ts:24,76` explicitly assert they
are materialized on demand, not preloaded (the lean-discovery philosophy). So the
fix is NOT to preload `work_capability_search`; that fights the design and blows the
preloaded-payload-size budget (`tool-surface-size-report.test.ts`).

**Fix:** Materialize `work_capability_search` from `domain_load` (alongside
`work_capability_load`) whenever the domain has work capabilities
(`domain-load.ts:195-199`). After loading a domain is exactly when searching that
domain's work capabilities makes sense — this gives the taught path a clean,
round-free predecessor while keeping the launch surface lean.

### BUG-4 [HIGH content] — two skills reference ops that don't exist

- `skills/definitions/google_calendar/SKILL.md` "Related Tools" lists five
  `google_calendar.*` ops — the real ops are `cal.event.*` (also listed). The five
  silently drop out of `materialized_tools`.
- `skills/definitions/libri_knowledge/SKILL.md` lists `resolve_libri_resource` /
  `query_libri_library` as ops — those are _tool names_; real ops are
  `libri.resource.resolve` / `libri.library.query` (also listed).

Dead op references silently vanish (`skill-load.ts:131-141`), so the agent may see a
tool reference it can't invoke.

**Fix:** Remove the dead op lines from both SKILL.md files.

### BUG-5 [LOW] — dead/parallel prompt builder _(deferred by request — NOT fixed)_

`buildFastSystemPrompt` (`agentic-chat-v2/prompt-builder.ts`) is exported and tested
but not on the live path (which uses `buildLitePromptEnvelope`). Editing it
expecting runtime effect edits dead code. **Left as-is for now.**

---

## Design flaws (noted, not yet actioned)

- **"Capability" means three things.** Layer-2 work-capabilities (10) vs layer-3
  capabilities (12), and `project_audit` exists as an id in _both_. The gateway's
  `work_capability_search` even takes both a `domain` and a `buildosCapability`
  arg. Biggest routing-confusion risk. Candidate fix: rename "work capability" →
  "playbook" / "outcome card".
- **Six taught layers > what launches.** The prompt teaches six; lean discovery
  mounts two entry tools. The extra layers are the least exposed and most skippable.
- ~~**Two undiscoverable registered skills:** `context_engineering_for_agent_work`
  and `google_calendar`~~ — **RESOLVED 2026-06-15.** Correction: both were already
  reachable via `skill_search` (it indexes all registered skills) — "undiscoverable"
  was an overstatement; they were just not in _domain_ routing.
  - `google_calendar` is **intentionally** search-only: it backs a published
    agent-skill blog (`resolveRuntimeSkillForPost`) and is the portable/external
    calendar skill; `calendar_management` is the native chat default. Left
    registered; documented.
  - `context_engineering_for_agent_work` was a genuine orphan (no domain, no
    published blog) → wired into a new minimal `agent_engineering` domain
    (`domains/catalog.ts`).
  - Added `skill-discoverability.test.ts` to catch future accidental orphans (with
    `google_calendar`/`libri_knowledge` allow-listed as deliberately search-only).
- **Content gap (systemic):** ~~the 7 BuildOS-native procedural skills lacked
  `## Output` contracts~~ — **FIXED 2026-06-15.** All 7 (`task_management`,
  `plan_management`, `project_audit`, `calendar_management`, `document_workspace`,
  `people_context`, `project_creation`) now declare an `## Output` contract that
  codifies their deliverable shape + stop conditions; `output_contract` ships on
  every load format.
- ~~**One true stub:** `information_architecture_review`~~ — **EXPANDED 2026-06-15,
  not folded.** Evaluation: the IA concern (conceptual model, flow, wayfinding,
  recovery — Norman/Cooper/Morville) is distinct from `ui_ux_quality_review`'s
  build-quality concern, and the parent router sequences it _first_; folding would
  lose the holistic structure-first lens and break the thin-router split. Rebuilt to
  the `ui_ux_quality_review` template: structural-map Output contract, Worked
  Example, and an `ia_heuristics` reference module (Norman gulfs/stages, Cooper
  model-gap, IA-relevant Nielsen heuristics, Morville wayfinding).

## Opportunities

1. Collapse the taught layer model toward the four actually reasoned over.
2. Make `skill_load` self-sufficient (BUG-1 fix removes the footgun at consumption).
3. Add `## Output` contracts to the native procedural skills (highest leverage,
   lowest effort).
4. Reciprocal domain links + a **referential-integrity unit test** asserting every
   skill/capability/domain/op id resolves — would have caught BUG-4 automatically.

---

## Fix log

**Bugs (2026-06-15):**

- [x] BUG-1 — op-aware on-miss recovery in stream orchestrator (+ regression test)
- [x] BUG-2 — `domain_load` materializes `skill_load`; `resource_search` gated on resources
- [x] BUG-3 — `work_capability_search` materialized from `domain_load` (NOT preloaded — lean-discovery design)
- [x] BUG-4 — dead op references removed from `google_calendar` + `libri_knowledge` SKILL.md (+ integrity test)
- [ ] BUG-5 — deferred by request

**Content pass (2026-06-15):**

- [x] `## Output` contracts added to all 7 BuildOS-native procedural skills (+ test)
- [x] `information_architecture_review` expanded to a full structure-first child (Output contract, Worked Example, `ia_heuristics` reference module); parent note updated
- [x] Orphan cleanup: `context_engineering_for_agent_work` wired into new `agent_engineering` domain; `google_calendar` confirmed intentionally search-only (backs published blog)
- [x] Tests: `skill-related-ops-integrity.test.ts`, `skill-output-contract.test.ts`, `skill-discoverability.test.ts`

**Still open (design decisions):** "capability" naming overload; 6→4 taught layers.
