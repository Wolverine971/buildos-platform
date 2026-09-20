<!-- docs/technical/reviews/agentic-chat-turn-executor-audit-2026-09-02/lane-D-skills.md -->

<!-- doc-status: point-in-time -->

> **Point-in-time appendix.** Lane report for the 2026-09-02 turn executor audit, written against commit `53a77af1f`. Line numbers drift; verify before acting. Parent: [AGENTIC_CHAT_TURN_EXECUTOR_AUDIT_2026-09-02.md](../AGENTIC_CHAT_TURN_EXECUTOR_AUDIT_2026-09-02.md).

# Lane D — Skills & Domain Routing Audit (Agentic Chat)

Date: 2026-09-02. Read-only; every claim cites `file:line` in `/Users/djwayne/buildos-platform`. Measurements come from two one-off tsx scripts in this scratchpad (`sense.ts`, `catalog-size.ts`) that import the real catalog/parser modules (catalog.ts, outcome-cards/catalog.ts, search-ranking.ts, markdown-skill.ts, runtime registry) and re-implement the two scoring functions verbatim (the real `domain-load.ts` / `skill-search.ts` cannot be imported outside Vite because the skill registry loads `SKILL.md?raw`).

Path prefixes used below:

- `SK/` = `apps/web/src/lib/services/agentic-chat/tools/skills/`
- `DOM/` = `apps/web/src/lib/services/agentic-chat/tools/domains/`
- `LITE/` = `apps/web/src/lib/services/agentic-chat-lite/prompt/`
- `V2/` = `apps/web/src/lib/services/agentic-chat-v2/`
- `RT/` = `packages/agentic-chat-runtime/src/`
- `WK/` = `apps/worker/src/workers/agentic-chat/`
- `LEGACY/` = `apps/web/src/lib/services/agentic-chat/legacy-execution/http-stream/handler.server.ts`

---

## 0. Headline

The skill system has two production realities that share almost no code path:

|                                                                          | Legacy web SSE path (`execution_mode = legacy_sse`)                  | Worker path (`execution_mode = worker_realtime`, the rolled-out production lane)                                                                                                                                                                                                                                                   |
| ------------------------------------------------------------------------ | -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Static root-skill catalog (24 rows, ~3.2k chars)                         | Yes (`LITE/build-lite-prompt.ts:1155-1162`)                          | **No** — suppressed because `dynamicSkillTools:false` (`V2/worker-prompt-surface.ts:16-20`, `LITE/build-lite-prompt.ts:1155`)                                                                                                                                                                                                      |
| Operating-strategy "call skill_load" rule + project_audit/forecast hints | Yes (`:987-991`, `:106-112`)                                         | **No** (`:987`, `:462-465`)                                                                                                                                                                                                                                                                                                        |
| `skill_search` / `domain_search` on launch surface                       | Yes, lean (`RT/catalog/surfaces.ts:28`)                              | **No** — omitted (`RT/worker-tool-policy.ts:88-93`)                                                                                                                                                                                                                                                                                |
| `skill_load` / `skill_reference_load` executable                         | Yes (`LEGACY/…gateway-executor.ts:59-85`)                            | **No** — any call is rejected and repaired (`WK/provider/repair-policy.ts:15,23-62`)                                                                                                                                                                                                                                               |
| Server skill preload (domain sensing)                                    | Yes, with history dedupe + tool materialization (`LEGACY:1398-1416`) | Only on a **prepared-prompt miss** (`V2/worker-turn-preparation.server.ts:453-463, 564-573`); on a prepared hit the system prompt is the prewarmed one with `domainSensingResult: null` (`apps/web/src/routes/api/agent/v2/prewarm/+server.ts:310-322`) and no overlay is applied (`V2/worker-turn-preparation.server.ts:472-493`) |
| Project-domain-affinity preload                                          | Yes (`LEGACY:1790-1837`)                                             | **No** (no call site in `V2/`)                                                                                                                                                                                                                                                                                                     |
| Skill-gate finalization repair                                           | Yes (`LEGACY:2331-2372`, `RT/loop/repair-instructions.ts:55-160`)    | **No** (no `skillGate` reference in `apps/worker/src`)                                                                                                                                                                                                                                                                             |

So on the production worker lane, the _only_ way any skill content reaches the model is a lexical domain-sensing preload, and only when the prepared-prompt cache misses. The 14 BuildOS-operational skills (task/plan/document/calendar/project_creation/people/research_capture …) are not in any domain or outcome card, so they can never be preloaded — they are unreachable on the worker path entirely (§2, §6 P0-1).

---

## 1. Mechanics, end to end

### 1.1 Skill definitions → registry (build time, web only)

1. Each `SK/definitions/<id>/SKILL.md` is imported with Vite `?raw` by a `*.skill.ts` file (e.g. `SK/task.skill.ts:2`) and parsed by `defineMarkdownSkill` (`SK/markdown-skill.ts:366-430`): YAML frontmatter (`name`, `description`, `catalog_line`, `skill_type`, `altitude`, `activation`, `parent_id`, `preserve_markdown`, `recommended_load_format`, `legacy_paths`, `child_skills`, `reference_modules`) plus H2 sections. Legacy H2s (`When to Use`/`Workflow`/`Guardrails`/`Notes`/`Output`) and canonical ones (`Activation`/`Procedure`/`Policy`/`Provenance`/`Contract`) both parse (`:274-303, :369-376`). Only `Related Tools` bullets in backticks become `relatedOps` (`:262-270`).
2. `SK/registry.ts:64-118` hard-lists all 53 skills; `isSkillEnabled` always returns true (`:120-122`). `listRootSkills()` = no `parentId` (`:148-150`) → 24 roots, 29 children.
3. Because of the `?raw` imports, the runtime package deliberately does not carry the catalog; it only gets an injected id/parent lookup (`RT/loop/skill-lookup.ts:3-8`). The worker therefore has no skill content at all except what web bakes into the prompt.

### 1.2 Per-turn: user message → domain sensing (web admission)

4. `V2/turn-preparation.ts:147-157` calls `senseDomains({ currentUserMessage, conversationSummary, priorDomainIds, priorOutcomeCardIds, limit: 3 })` on **every** admission (both lanes). The legacy lane does the same through `LITE/build-lite-prompt.ts:1105-1131`.
5. `senseDomains` (`DOM/domain-sensing.ts:472-577`): query = current message (falls back to summary) truncated to 800 chars → `searchDomains` (`DOM/domain-load.ts:196-224`) lexical scorer → keep matches with `confidence >= 0.45 OR any alias hit` (`DOM/domain-sensing.ts:82, 211-213`) → outcome-card candidates per kept domain (`:300-352`, scoring in `apps/web/src/lib/services/agentic-chat/tools/outcome-cards/outcome-card-search.ts:37-73`) → native regex signals for `project_health_audit` / `project_slip_forecast` (`DOM/domain-sensing.ts:96-140`) → `skill_load_required = any kept domain with skills AND (confidence >= 0.55 OR alias hit)` (`:87, 145-155`).
6. `getSkillGateCandidateSkillIds` (`:575-680`) ranks up to 3 skill ids: primary-domain's own first skill if the domain is `strong` and has no outcome card (`:590-603`), else the top outcome card's `default_skill_id`, then card skills, then `recommended_skill_ids`, then all domain skills.

### 1.3 Server preload

7. `resolveSkillGatePreload` (`DOM/skill-gate-preload.ts:41-56`) fires iff `skill_load_required === true`; loads candidate[0] via `loadSkill(id, { format:'short' })` and renders `renderPreloadedSkillPromptContent` (`:101-160`): "Preloaded skill: … Apply its workflow", top-3 when-to-use, **all** workflow steps, top-6 guardrails, full output contract, (web only) child list + "Need more depth? skill_load full" + alternates. Wrapped by `renderDomainSensingPromptContent` with "Skill-load gate: SATISFIED BY PRELOAD" (`DOM/domain-sensing.ts:700-720`).
8. Legacy lane: passes `alreadyLoadedSkillIds` from history so a skill loaded earlier in the session is not re-injected (`LEGACY:1397-1402`), and materializes the skill's `materialized_tools` bundle onto the surface (`:1403-1416`). It also runs the project-domain-affinity preload which _overrides_ the lexical one (`:1790-1810`).
9. Worker lane: `resolveSkillGatePreload(turnDomainSensing, { allowFollowupSkillLoad:false })` (`V2/worker-turn-preparation.server.ts:453-456`) — **no** `alreadyLoadedSkillIds` (re-injects every turn), **no** tool materialization, and the Active Domain Signals block is only carried when a preload exists (`:458-463`). It is applied only in the prepared-miss branch via `applyActiveDomainSignalsOverlay` (`:564-573`, overlay at `LITE/build-lite-prompt.ts:293-345`).

### 1.4 Static catalog + coaching in the system prompt (legacy lane only)

10. `buildCapabilitiesSkillsToolsSection` (`LITE/build-lite-prompt.ts:1133-1206`) renders the 24-row `| Root Skill ID | Description |` table from `catalogLine ?? truncate(summary,220)` (`:1155-1162`) when `dynamicSkillTools && staticSkillCatalog`. Operating Strategy adds "Call skill_load before answering whenever a registered skill covers the work … routing failure, not a shortcut" (`:987-991`); project chat adds hard-coded `skill_load({ skill:'project_audit' })` / `project_forecast` hints (`:106-112`). Worker scaffold turns all of this off and instead prints "Skills - trusted playbooks may be preloaded into Active Domain Signals by the runtime" (`:1177`).

### 1.5 Model-led discovery tools (legacy lane only)

11. Launch surface with lean discovery (default on: `V2/scaffold-variant.ts:77`, `RT/catalog/surfaces.ts:28,285-288`) mounts only `skill_search` and `domain_search`. `skill_search` (`SK/skill-search.ts:154-192`) is a lexical scorer over id/name/summary/when_to_use/related_ops (`:88-123`) and auto-materializes `skill_load` (`:188`). `skill_load` (`SK/skill-load.ts:319-347`) returns `SkillHelpPayload` — short = when_to_use/workflow/guardrails/output_contract/child+reference indices/related ops resolved to `materialized_tools`+`read_ops`/`write_ops`/`destructive_ops` (`:165-199, 210-317`); full adds `markdown` (`preserve_markdown` → raw body, `:297-314`). `skill_reference_load` (`SK/skill-reference-load.ts:106-170`) serves `references/*.md` bundled via `import.meta.glob('?raw')` (`:14-18`), gated by `visibility` per surface (`SK/skill-reference-visibility.ts`). The tool result is a JSON payload; the model reads the markdown in the tool result — nothing is spliced into the system prompt.
12. `domain_search` → `domain_load` → `outcome_card_search/load` → `skill_load` is a parallel four-hop route (`RT/catalog/definitions/discovery.ts:11-117`). `skill_load` executions and `skill_activity` events feed the `used_domains` ledger (`DOM/domain-used-signals.ts:213-262`) which persists loaded skills across history compression (`LEGACY:2337-2352`).

### 1.6 Gate enforcement (legacy lane only)

13. If `skill_load_required` and nothing loaded, finalization is blocked once and a repair instruction demands `skill_load` (`RT/loop/repair-instructions.ts:55-160`); the legacy handler only arms this when `skill_load` is actually on the surface (`LEGACY:2358-2372`).

### 1.7 Worker execution

14. The worker executes only `AGENTIC_CHAT_WORKER_EXECUTABLE_TOOL_NAMES_V1` (`RT/worker-tool-policy.ts:100-107`): controls, shared reads, `change_chat_context`, `web_search/visit`, and the reviewed mutations (`:14-36`). `domain_search`, `skill_search`, `skill_load` are explicitly omitted (`:88-93`). If the model nevertheless emits `skill_load`/`skill_search`, `buildUnavailableSkillRepairRequest` (`WK/provider/repair-policy.ts:23-62`) burns one repair round telling it "not callable in this turn … use only the tools present". `buildWorkerToolSurfaceOverride` (`WK/provider/tool-surface.ts:72-92`) adds "Do not delay a safe direct action merely because an absent discovery, skill, or context tool was suggested".
15. The worker's frozen history does carry prior `skill_load` executions for continuity (`V2/worker-turn-preparation.server.ts:1009-1027`), but since the worker never executes `skill_load`, that list is only non-empty for sessions that started on the legacy lane.

### 1.8 How many mechanisms route to a skill, and can they disagree?

Eleven distinct mechanisms, not three:

| #   | Mechanism                                                       | Lane                              | Code                                  |
| --- | --------------------------------------------------------------- | --------------------------------- | ------------------------------------- |
| 1   | Static root catalog table                                       | legacy                            | `LITE/build-lite-prompt.ts:1155-1162` |
| 2   | Operating Strategy `skill_load` rule                            | legacy                            | `:987-991`                            |
| 3   | Hard-coded project_audit/forecast hints                         | legacy (project chat)             | `:106-112`                            |
| 4   | Domain sensing → Active Domain Signals gate + ranked candidates | legacy                            | `DOM/domain-sensing.ts:700-780`       |
| 5   | Native regex outcome-card signals (audit/forecast)              | both (feeds 4/6)                  | `DOM/domain-sensing.ts:96-140`        |
| 6   | Server preload from sensing                                     | both (worker: prepared-miss only) | `DOM/skill-gate-preload.ts:41`        |
| 7   | Project-domain-affinity preload (overrides 6)                   | legacy                            | `LEGACY:1790-1810`                    |
| 8   | Model-led `skill_search` → `skill_load`                         | legacy                            | `SK/skill-search.ts`                  |
| 9   | Model-led `domain_search` → … → `skill_load`                    | legacy                            | `RT/catalog/definitions/discovery.ts` |
| 10  | Skill-gate finalization repair                                  | legacy                            | `RT/loop/repair-instructions.ts:55`   |
| 11  | Unavailable-skill repair (negative: un-routes)                  | worker                            | `WK/provider/repair-policy.ts:23`     |

They disagree in four concrete ways: (a) the catalog row says "load `task_management`" while a wrong preload says "gate SATISFIED, do not look further" — a preload can only ever win because `PRELOADED_NEXT_STEP` explicitly forbids `outcome_card_load` and further `skill_load` (`DOM/domain-sensing.ts:108`); (b) #7 silently replaces #6's choice (`LEGACY:1805-1809`); (c) #4 ranks candidates by outcome-card default first, but #8's `skill_search` scores by id/name overlap, so the same message can yield different top skills; (d) on the worker, the preload text says "Apply its workflow" while the workflow may name tools that are not on the reviewed surface (e.g., `document_workspace` names `onto.edge.link`; `research_capture` names `util.web.search` which the worker does have, but `create_task_document` requires a capability flag).

---

## 2. Catalog inventory (53 skills)

Columns: domain(s) = which `DOM/catalog.ts` domain or outcome card lists it (empty = unreachable by sensing/preload); trigger = catalog (root row, legacy only) / preload (domain or outcome-card member) / native (regex) / search (all skills, legacy only); reachable = **W** worker lane, **L** legacy lane. Sizes from `catalog-size.ts`; refs = declared `reference_modules`; evals = `evals.md` present.

| id                                       | domain(s)                                                                                                                               | root/child                                | trigger                                          | SKILL.md chars | refs         | evals | reachable                         |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- | ------------------------------------------------ | -------------- | ------------ | ----- | --------------------------------- |
| accessibility_inclusive_ui_review        | product_and_design.ui_ux_quality                                                                                                        | child of build_quality_ui_ux              | preload, search                                  | 11,377         | 3            | no    | W(preload) L                      |
| ai_era_craft_and_quality_moat            | marketing                                                                                                                               | root                                      | catalog, preload, search                         | 14,270         | 5            | no    | W L                               |
| algorithm_aware_publishing               | marketing.content_strategy / short_form / youtube / creator_growth                                                                      | child of content_strategy_beyond_blogging | preload, search                                  | 21,157         | 3            | no    | W L                               |
| build_quality_ui_ux                      | product_and_design (+3 children domains)                                                                                                | root (orchestration)                      | catalog, preload, search                         | 14,769         | 2            | no    | W L                               |
| calendar_management                      | —                                                                                                                                       | root                                      | catalog, search                                  | 6,020          | 0            | no    | **L only**                        |
| calm_software_design_review              | —                                                                                                                                       | child of build_quality_ui_ux              | search                                           | 13,143         | 3            | no    | **L only**                        |
| cold_email_deliverability_readiness      | sales_and_growth.cold_email; default of `cold_email_sender_readiness` card                                                              | child                                     | preload, search                                  | 13,790         | 0            | no    | W L                               |
| cold_email_engagement_first_outreach     | sales_and_growth, .cold_email; default of `cold_email_campaign_build`                                                                   | root (orchestration)                      | catalog, preload, search                         | 16,540         | 6            | no    | W L                               |
| cold_email_icp_signal_design             | .cold_email                                                                                                                             | child                                     | preload, search                                  | 23,386         | 4            | no    | W L                               |
| cold_email_learning_review               | —                                                                                                                                       | child                                     | search                                           | 28,654         | 0            | yes   | **L only**                        |
| cold_email_offer_lab                     | .cold_email                                                                                                                             | child                                     | preload, search                                  | 20,602         | 0            | no    | W L                               |
| cold_email_outreach_compiler             | .cold_email                                                                                                                             | child                                     | preload, search                                  | 31,342         | 1 (internal) | yes   | W L                               |
| cold_email_reply_os                      | .cold_email                                                                                                                             | child                                     | preload, search                                  | 20,647         | 3            | yes   | W L                               |
| cold_email_research_anchors              | .cold_email                                                                                                                             | child                                     | preload, search                                  | 13,595         | 0            | no    | W L                               |
| cold_email_taste_review                  | —                                                                                                                                       | child                                     | search                                           | 26,644         | 1            | yes   | **L only**                        |
| content_creation_pipeline                | marketing; `idea_to_draft_pipeline` stack                                                                                               | root (orchestration)                      | catalog, preload, search                         | 22,249         | 0            | no    | W L                               |
| content_strategy_beyond_blogging         | marketing, .content_strategy, .short_form, .youtube, creator_growth; default of `content_strategy_plan`, `youtube_growth_strategy_plan` | root                                      | catalog, preload, search                         | 14,570         | 0            | no    | W L (most-preloaded skill)        |
| context_engineering_for_agent_work       | agent_engineering                                                                                                                       | root                                      | catalog, preload, search                         | 8,180          | 0            | no    | W L                               |
| delightful_product_review                | —                                                                                                                                       | child of build_quality_ui_ux              | search                                           | 11,734         | 2            | no    | **L only**                        |
| design_system_architecture_review        | product_and_design.design_systems; card default                                                                                         | child                                     | preload, search                                  | 13,103         | 2            | no    | W L                               |
| document_workspace                       | —                                                                                                                                       | root                                      | catalog, search                                  | 6,225          | 0            | no    | **L only**                        |
| fiction_story_craft                      | writing.fiction                                                                                                                         | root                                      | catalog, preload, search                         | 19,947         | 0            | yes   | W L                               |
| framework_extraction_lens                | idea_to_draft stack                                                                                                                     | child of content_creation_pipeline        | preload, search                                  | 8,549          | 0            | no    | W L                               |
| going_viral                              | marketing.content_strategy                                                                                                              | child of content_strategy_beyond_blogging | preload, search                                  | 16,410         | 4 (76 KB)    | no    | W L (refs L only)                 |
| google_calendar                          | —                                                                                                                                       | root                                      | catalog, search                                  | 8,676          | 1            | no    | **L only**                        |
| growth_diagnostics_for_stalled_products  | sales_and_growth                                                                                                                        | root                                      | catalog, preload, search                         | 11,940         | 1            | yes   | W L                               |
| hook_craft_short_form                    | .short_form, .youtube; default of `short_form_video_asset_improvement`                                                                  | child                                     | preload, search                                  | 25,904         | 1            | yes   | W L                               |
| idea_expansion_lens                      | stack                                                                                                                                   | child of content_creation_pipeline        | preload, search                                  | 9,792          | 0            | no    | W L                               |
| information_architecture_review          | .ui_ux_quality                                                                                                                          | child                                     | preload, search                                  | 13,330         | 1            | no    | W L                               |
| landing_page_scorecard_funnel            | sales_and_growth                                                                                                                        | root                                      | catalog, preload, search                         | 16,331         | 2            | yes   | W L                               |
| lead_list_research                       | sales_and_growth, .cold_email                                                                                                           | root                                      | catalog, preload, search                         | 8,075          | 0            | no    | W L                               |
| linkedin_company_page_growth             | marketing, .linkedin; card default                                                                                                      | root                                      | catalog, preload, search                         | 6,912          | 1            | no    | W L (**no Contract block**)       |
| lived_conviction_lens                    | stack                                                                                                                                   | child of content_creation_pipeline        | preload, search                                  | 8,273          | 0            | no    | W L                               |
| marketing_site_design_review             | —                                                                                                                                       | child of build_quality_ui_ux              | search                                           | 10,448         | 2            | no    | **L only**                        |
| medium_tailoring                         | stack                                                                                                                                   | child of content_creation_pipeline        | preload, search                                  | 10,516         | 6            | no    | W L                               |
| nonfiction_writing_from_lived_conviction | writing                                                                                                                                 | root                                      | catalog, preload, search                         | 6,523          | 0            | no    | W L                               |
| people_context                           | —                                                                                                                                       | root                                      | catalog, search                                  | 4,933          | 0            | no    | **L only**                        |
| plan_management                          | —                                                                                                                                       | root                                      | catalog, search                                  | 13,026         | 0            | no    | **L only**                        |
| project_audit                            | (domainless card `project_health_audit`)                                                                                                | root                                      | catalog, native regex, preload, search           | 10,003         | 0            | no    | W L                               |
| project_creation                         | —                                                                                                                                       | root                                      | catalog, search (+ legacy compound-lane preload) | 6,864          | 0            | no    | **L only**                        |
| project_forecast                         | (domainless card `project_slip_forecast`)                                                                                               | root                                      | catalog, native regex, preload, search           | 7,941          | 0            | no    | W L                               |
| research_capture                         | —                                                                                                                                       | root                                      | catalog, search                                  | 9,561          | 0            | no    | **L only**                        |
| sensory_double_tap                       | stack                                                                                                                                   | child of content_creation_pipeline        | preload, search                                  | 7,057          | 0            | no    | W L                               |
| story_driven_content_craft               | writing, .short_form, .youtube                                                                                                          | child of content_strategy_beyond_blogging | preload, search                                  | 30,700         | 1            | yes   | W L                               |
| storyboard_journey_lens                  | stack                                                                                                                                   | child of content_creation_pipeline        | preload, search                                  | 9,939          | 0            | no    | W L                               |
| task_management                          | —                                                                                                                                       | root                                      | catalog, search                                  | 10,030         | 1            | no    | **L only**                        |
| task_state_updates                       | —                                                                                                                                       | child of task_management                  | search                                           | 4,411          | 0            | no    | **L only**                        |
| ui_ux_quality_review                     | .ui_ux_quality; `ui_ux_screen_review` card                                                                                              | child                                     | preload, search                                  | 13,503         | 3            | yes   | W L                               |
| usability_quick_research                 | .ui_ux_quality, .usability_research                                                                                                     | child                                     | preload, search                                  | 18,433         | 0            | no    | W L (largest preload: 7.2k chars) |
| viral_content_for_boring_brands          | .content_strategy                                                                                                                       | root                                      | catalog, preload, search                         | 15,148         | 3            | no    | W L                               |
| viral_video_script_structure             | .short_form, .youtube; default of `youtube_video_improvement`                                                                           | child                                     | preload, search                                  | 29,139         | 0            | yes   | W L                               |
| visual_craft_fundamentals                | .ui_ux_quality                                                                                                                          | child                                     | preload, search                                  | 14,552         | 3            | no    | W L                               |
| youtube_channel_craft_for_founders       | .youtube, creator_growth                                                                                                                | root                                      | catalog, preload, search                         | 22,472         | 0            | yes   | W L                               |

Totals: 24 roots / 29 children; 39 preloadable, **14 never preloadable** (all 9 BuildOS-operational skills + 5 review/learning children); 14/53 declare `## Related Tools`; 34/53 have `## Examples`; 52/53 have `## Contract` (`linkedin_company_page_growth` lacks one); 13/53 have `evals.md`; all 53 have `activation: progressive` (the enum is decorative — nothing reads `activation` for routing; only `skill-search.ts:100` includes it in the haystack). No skill is dead at the registry level (`SK/skill-registry-disk-parity.test.ts` enforces disk ↔ registry parity), and every skill is publicly previewable under `/agent-skills/<slug>` (`apps/web/src/lib/server/agent-skills.ts:160-185`), so "marketing-only" skills do not exist — but on the production worker lane the 14 flagged **L only** are dead.

Related-ops validity: every backticked op in every `## Related Tools` resolves in the runtime registry after alias normalization (`catalog-size.ts`, 0 unknown); every `create_/update_/get_/…` tool mention in the five reviewed bodies resolves to a registered tool name.

---

## 3. Content quality — five SKILL.md files as instructions to a DeepSeek-class model

Bar used: the repo's own `SK/AUTHORING_GUIDE.md:14-25` ("7 weak-model ingredients": worked examples, closed vocabularies, numeric thresholds, templates, decision tables, refusal/escalation rules, output contract + stop conditions) and `:89-100` sizing (8–20 KB shell, primary job in one load).

### task_management (`SK/definitions/task_management/SKILL.md`, 10.0 KB, procedure/domain)

- **Operational, best of the five.** Procedure steps name real ops (`onto.task.create/update/list/search`) and real direct tools with correct argument names (`create_onto_task({project_id,title,description,type_key})`, `update_onto_task({task_id,state_key})` — verified against `RT/catalog/definitions/ontology-write.ts` arg lists). Contract has explicit stop conditions. Policy has refusal rules ("do not create tasks for research…"). Examples are contract-perfect and even model the empty-write anti-pattern.
- **Defect:** Procedure step 7 ("Only use description merge strategies when append or merge behavior is actually needed") references a capability `update_onto_task` does not have — its args are `task_id, project_id, title, description, type_key, state_key, priority, assignee_*, goal_id, supporting_milestone_id, start_at, due_at, props`; no `update_strategy`. The Examples block later says the opposite ("Task fields are direct replacements… read the current description first"). A weak model reading step 7 will try `update_strategy` on a task and get a schema rejection.
- **Weak-model gaps:** the "task vs. do-it-now" decision (the skill's core judgment) is stated as prose in Examples; no decision table. `type_key` values (`task.refine`, `task.create`) appear only in examples with no vocabulary list.

### project_creation (`SK/definitions/project_creation/SKILL.md`, 6.9 KB, procedure/task)

- **Operational.** Minimal-payload doctrine is precise, the relationship object form is spelled out, `clarifications[]` exists on the real schema (`ontology-write.ts:950`), the second-project confirmation rule is a real refusal rule.
- **Gaps:** the `type_key` taxonomy (`project.{realm}.{domain}[.{variant}]`) has no closed vocabulary — exactly the thing a weak model cannot derive; Knowledge lists props per genre but not the realm/domain enum. Examples are outlines, not a single complete `create_onto_project({...})` exemplar (the guide's "single strongest lever"). On the worker lane this skill is never loaded anyway; the reviewed-shell lane uses `PROJECT_CREATE_REVIEWED_SHELL_WORKFLOW_LITE` prose (`LITE/build-lite-prompt.ts:1080-1100`) which partially duplicates it — two sources of truth.
- Legacy-lane note: the prompt's project_create lane deliberately has no `skill_load` (`LITE/build-lite-prompt.ts:191-197`), so this skill is only ever a compound-lane preload or a `skill_search` hit from another context.

### document_workspace (`SK/definitions/document_workspace/SKILL.md`, 6.2 KB, procedure/task)

- **Operational and accurate.** `parent_id`/`position` on create, `move_document_in_tree({document_id,new_parent_id,new_position})`, `update_strategy: append|merge_llm` requiring `content`, `get_document_tree(include_documents=true)` — all match the live schemas (`ontology-write.ts:297-302, 491-513, 1281-1324`). The "only claim nested after the response confirms" stop condition is a real hallucination guard.
- **Gaps:** Examples are step lists, not a filled tool call. `onto.task.docs.*` / `create_task_document` role/type vocab absent. The Policy line about `delete_onto_document` exposing only `document_id` is a runtime fact that will rot silently.
- **Reachability:** not in any domain; on the worker lane a "reorganize my docs" turn gets no playbook, while the worker's mutation surface _does_ include `move_document_in_tree` (`RT/worker-tool-policy.ts:17`).

### going_viral (`SK/definitions/going_viral/SKILL.md`, 16.4 KB body + 76 KB references, orchestration/domain)

- **Prose orchestration, no tools.** Its Procedure is nine `→ sibling` route markers plus three "[here]" steps; its actual knowledge is declared "deliberately thin" and pushed into four reference modules. The Contract is a 13-item packet (good), the seven-tensions list is a genuine closed vocabulary (good), the refusal rules are explicit (good).
- **As a weak-model instruction it fails its own guide:** primary job needs ≥2 hops on the legacy lane (`skill_load` + `skill_reference_load` of the platform module, mandated by Policy "Do not emit platform-specific guidance without loading the matching reference module first") and up to 5 (four siblings). On the worker lane the references are unreachable, so a preload of `going_viral` hands the model a Policy it _cannot_ satisfy ("load the reference first") with no fallback rule. No worked example.
- Cites 2025/2026 platform claims as facts with "treat 2019 playbooks as unverified" — fine as editorial stance, but it puts date-stamped claims in a skill shell with no expiry marker.

### cold_email_outreach_compiler (`SK/definitions/cold_email_outreach_compiler/SKILL.md`, 31.3 KB, procedure/domain)

- **Best pure-craft skill in the set** for a weak model: closed rejection list for subjects, 9-point binary lint, cadence table keyed by mode, assumptive-language replacement table, refuse-and-route table with six named triggers, a full worked compile (131-word email, lint pass/fail per item) and a worked refusal. This is what the authoring guide asks for.
- **Problems:** 31 KB is 1.5× the guide's ceiling; the "Knowledge" tables are self-flagged as extraction candidates. The only reference module (`mode_templates`) is `visibility: internal`, so on the public/portable surface the compile step 4 ("Load `mode_templates` and draft the body in that mode's scaffold") is unsatisfiable (`SK/skill-reference-visibility.ts:23-29`). Short-format preload (what the worker gets) drops Judgment/Routing/Knowledge/Examples — the preload block is 4.4 KB of Procedure+Policy+Contract that repeatedly says "per the rubric in Judgment", which the model never sees.
- No `## Related Tools` — correct for a craft skill, but it means `materialized_tools` is empty and the legacy lane cannot mount `create_onto_document` for the deliverable from the skill itself.

### Cross-cutting content findings

- **Short format is the only format the worker ever sees, and it discards the blocks the authoring guide says carry the weak-model machinery** (Judgment/Routing/Knowledge/Examples). 47/53 skills set `preserve_markdown: true`, i.e. authors intended the raw body to be served; only 2 set `recommended_load_format: full` (`fiction_story_craft`, `research_capture`). The preload path hard-codes `short` (`DOM/skill-gate-preload.ts:83`).
- **Marketing-domain skills tell the model to load siblings/references** (going_viral, content_strategy_beyond_blogging step 1 "defer to `algorithm_aware_publishing`", compiler routing table) — instructions that are unexecutable on the worker lane. There is no lane-aware rendering.
- **Contradictions with the system prompt:** (a) worker system prompt says "Skills - trusted playbooks may be preloaded … Apply a preloaded playbook directly" while preloaded playbooks say "call skill_load with format full for the complete playbook" only on legacy; on worker the footer is suppressed (`DOM/skill-gate-preload.ts:118-140`) — consistent. (b) Legacy Operating Strategy "producing skill-covered work from base knowledge without loading the matching skill is a routing failure" vs. lean discovery mounting `skill_search` but not `skill_load` (`RT/catalog/surfaces.ts:28`) — the model must hop through `skill_search` first; the prompt does not say so (it says "use `skill_load`" in the catalog header `LITE/build-lite-prompt.ts:1198`). (c) `task_management` step 7 vs. its own Examples (above).

---

## 4. Routing accuracy — why F7 misfires

### 4.1 The scorer (`DOM/domain-load.ts:96-135`)

```
score = 220 (id == query) + 180 (name == query) + 90 (id includes query) + 80 (name includes query)
      + 70 × aliasesHit
      + Σ over non-stopword query tokens:  +50 if token ∈ domainIdTokens, +40 if ∈ domainNameTokens, +50 if ∈ haystackTokens
confidence = clamp(score / 220, 0.35, 0.95)          (search-ranking.ts:20-23)
keep  if confidence ≥ 0.45 (score ≥ 99)  OR aliasesHit > 0     (domain-sensing.ts:211-213)
gate  if kept domain has skills AND (confidence ≥ 0.55 (score ≥ 121) OR aliasesHit > 0)   (:145-155)
```

The haystack (`:103-111`) is `id + name + summary + aliases + capabilityIds + skillIds`, tokenized and stemmed (`normalizeTokenForMatch`, `:139-146`). Skill ids contribute their underscore-split words: `cold_email_engagement_first_outreach` → `first`; `lead_list_research` → `list`; the `sales_and_growth` summary contributes `find`. So **three ordinary English words in a long message score 150 = confidence 0.68**, above both floors, with zero aliases. Every unique token adds; nothing normalizes by message length; there is no IDF.

### 4.2 Reproduction (`sense.ts`, current catalog — no domain-routing code has changed since the 08-27 audit)

| Message                                                                                                                              | Top kept domain (score/conf)                               | Why                                 | Preload that would fire                                                                                                                                 |
| ------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "Use Gmail read tools. First list my connected accounts, then search each readable account for the unique marker CUTOVER*NO_MATCH*…" | `sales_and_growth` 150/0.68                                | `first`, `list`, `find` in haystack | `cold_email_deliverability_readiness` (via `cold_email_sender_readiness` card, card score 206/0.94 on `use, read, first, list, accounts, search, each`) |
| "search my email for the invoice from Stripe"                                                                                        | `sales_and_growth.cold_email` 140/0.64                     | `email` hits id+name+haystack       | `cold_email_deliverability_readiness`                                                                                                                   |
| "We need to figure out the idea of the book I want to write…"                                                                        | `writing` 120/0.55                                         | alias `book`                        | `story_driven_content_craft` or `nonfiction_writing…` (partial-coverage domain, no card)                                                                |
| "Help me plan the marketing for our product launch"                                                                                  | `marketing` 210/0.95                                       | correct                             | `content_strategy_beyond_blogging` (reasonable)                                                                                                         |
| "Cutover attachment smoke: identify the main symbol in this image…"                                                                  | none                                                       | —                                   | none (the 08-25 dump's message text was truncated; not reproducible on current catalog)                                                                 |
| "Plan out the next sprint for the mobile app"                                                                                        | none kept (`marketing.content_strategy` 50/0.35 on `plan`) | —                                   | none — **false negative**: `plan_management` is not in any domain                                                                                       |
| "Create a new document called Meeting Notes in the project"                                                                          | `writing` 100/0.45 kept, no gate                           | `not(es)`, `project`                | none — `document_workspace` unreachable                                                                                                                 |
| "Write a blog post about why I built BuildOS"                                                                                        | none                                                       | —                                   | none — false negative (`nonfiction_writing…` exists)                                                                                                    |

Diagnosis, in order of contribution:

1. **Generic-token leakage from skill ids and summaries** (`first`, `list`, `find`, `read`, `tool`, `plan`, `project`, `idea`, `email`, `book`) — each worth +50, the same as a domain-name hit. This is the F7 root cause, not the absolute threshold (the reviewer's R5 was right that the floors exist; the problem is that the score is inflatable by common words).
2. **Alias hits bypass both floors** (`:145-155, :211-213`) — `book`, `growth`, `ui`, `email`-family aliases route any message containing the word.
3. **Long messages score higher** than short ones for the same intent; the 800-char cap is the only length control.
4. **The gate binds "whether", but candidate[0] decides "which" with no confidence of its own**; a partial-coverage domain with no card falls straight to its first listed skill (`:590-603`).
5. **Direct-tool intents are not excluded.** The prior investigation notes that "direct-tool asks returned no sensing result" (`:84-86`), but that was luck of the wording, not a rule.
6. **Test coverage is asymmetric:** `DOM/domain-sensing.test.ts` has 5 `toBeNull` negatives (`:250, :420` etc.) versus ~20 positive gated cases; none of the F7 messages are regression cases.

### 4.3 Minimal deterministic fix (recommended)

Change one function, `computeScore` in `DOM/domain-load.ts:96-135`, and one predicate in `DOM/domain-sensing.ts:145-155`:

1. **Split the haystack into a discriminative set and a prose set.** Discriminative = `domain.id` tokens, `domain.name` tokens, aliases. Prose = summary, capabilityIds, skillIds. Keep the +50 only for discriminative hits; give prose hits +10 (or 0). This alone drops the Gmail message to 0 kept domains and the invoice message to `cold_email` 140 → hmm, `email` is in the id/name, so add:
2. **Require an alias OR ≥2 distinct discriminative tokens to open the gate**, i.e. in `shouldRequireSkillLoad` replace `domain.confidence >= 0.55 || aliases_hit.length > 0` with `aliases_hit.length > 0 || discriminative_hits >= 2`. "search my email for the invoice" has one discriminative token (`email`) → no gate; "draft a cold email to the head of growth" has alias `cold email` → gate. Expose `discriminative_hits` on `DomainSearchMatch` (`DOM/types.ts`) so telemetry can see it.
3. **Add a direct-tool negative guard** in `senseDomains` before search: if the message matches `/\b(gmail|inbox|calendar|event|task|document|doc)\b/` AND a read verb (`list|search|find|show|open|read|what('s| is) on`) AND no craft verb (`draft|write|plan|review|audit|strategy|campaign`), return `skill_load_required:false` regardless. This is the cheapest guard for the exact misfire class the audit observed and costs nothing when sensing is right.
4. **Add the three F7 messages plus the two reproduced ones above as `toBeNull` / `skill_load_required:false` cases** in `DOM/domain-sensing.test.ts`.
5. Do **not** raise the absolute floor: that would silence "book idea" (0.55) and "LinkedIn post" (0.64), which are correct routes.

"Ask the model" is not viable on the worker lane (no discovery tools), so the fix must be deterministic.

---

## 5. Cost

Measured with the real parser over the real definitions (`catalog-size.ts`); tokens ≈ chars/4 (the repo's own estimator, `V2/context-usage.ts:42-45`).

| Item                                                                            | Chars                                         | ~Tokens                                          | Where                                                                |
| ------------------------------------------------------------------------------- | --------------------------------------------- | ------------------------------------------------ | -------------------------------------------------------------------- |
| 24-row root catalog table alone                                                 | 3,248                                         | ~812 (≈900 at 3.6 c/t — matches the audit's 891) | legacy lane, every turn                                              |
| Whole `capabilities_skills_tools` section (legacy)                              | 4,113                                         | ~1,030                                           | legacy lane, every turn                                              |
| Same section on worker lane                                                     | ~600                                          | ~150                                             | no table                                                             |
| Preload block (worker variant, incl. wrapper) — mean over 39 preloadable skills | 3,937                                         | **~985**                                         | per preloaded turn (confirms F7's "~1,000 tokens of wrong playbook") |
| Preload block — max                                                             | 7,219 (`usability_quick_research`)            | ~1,805                                           |                                                                      |
| Preload block — min                                                             | 1,831 (`cold_email_deliverability_readiness`) | ~460                                             |                                                                      |
| `content_strategy_beyond_blogging` preload (the 08-25 offender)                 | 3,672                                         | ~920                                             | audit measured 1,045 with a real tokenizer                           |
| `skill_load` full payload (legacy) — typical body                               | 5–30 KB                                       | 1.3k–7.5k                                        | per call, replayed as a tool result in every later pass of the turn  |
| `going_viral` references                                                        | 76,290                                        | ~19k                                             | reachable only via `skill_reference_load` (legacy)                   |

Two cost facts the prior audit did not have:

- **Worker lane re-preloads every prepared-miss turn** because `alreadyLoadedSkillIds` is not passed (`V2/worker-turn-preparation.server.ts:453-456` vs `LEGACY:1399-1402`). A 10-turn marketing session pays ~1k tokens × 10, not × 1.
- **Prepared-hit worker turns pay zero, and get zero** — the preload cost and benefit both vanish (§0). The sensing computation itself still runs at admission (`V2/turn-preparation.ts:150`) and is only used for session-state bookkeeping.

---

## 6. Findings, ranked

### P0

**P0-1. Operational skills never reach the production worker model.** The 14 skills with no domain/outcome-card membership — `task_management`, `task_state_updates`, `plan_management`, `document_workspace`, `project_creation`, `calendar_management`, `google_calendar`, `people_context`, `research_capture`, plus 5 review children — cannot be preloaded (`getSkillGateCandidateSkillIds` only draws from domains and cards, `DOM/domain-sensing.ts:575-680`), and the worker cannot call `skill_load` (`RT/worker-tool-policy.ts:88-93`). These are exactly the skills that carry tool packaging, argument names, and stop conditions (§3). User impact: the "so a dumb model could do it" scaffolding for tasks/docs/plans is authored, tested for disk parity, and shipped nowhere. Fix: (a) add a `buildos_operations` domain (or per-entity domains `tasks`, `documents`, `plans`, `calendar`) in `DOM/catalog.ts` whose aliases are the entity nouns, so sensing can preload them; or (b) cheaper and more precise — a deterministic **intent→skill map on the worker admission path** keyed off the selected surface profile / turn intent (`V2/turn-preparation.ts:167-186` already classifies the turn) that calls `resolveSkillPreloadById` (`DOM/skill-gate-preload.ts:61`) for `task_management` / `document_workspace` / `plan_management` / `calendar_management`. (b) needs no catalog surgery and cannot misfire on prose.

**P0-2. Skill routing on the worker lane is a function of cache state.** Prepared-hit turns use the prewarmed prompt built with `domainSensingResult: null` under the worker scaffold (`apps/web/src/routes/api/agent/v2/prewarm/+server.ts:294-322`; gating at `LITE/build-lite-prompt.ts:191-197`) and the hit branch applies no overlay (`V2/worker-turn-preparation.server.ts:472-493`), while miss turns get the full preload (`:564-573`). Same message, different behavior, invisible in any dashboard. Fix: move `applyActiveDomainSignalsOverlay` out of the `else` branch so it runs on both branches (the overlay already strips and re-inserts the `active_domain_signals` section idempotently, `LITE/build-lite-prompt.ts:330-345`); keep the prepared `harness_sha256` stable by excluding the overlay section from the sha (it already is — the canonical sha is built without sensing, `V2/prepared-prompt-cache.ts:230-239`).

### P1

**P1-1. Domain sensing misfires on generic tokens (F7 confirmed, mechanism corrected).** Root cause is `+50` per common-word haystack hit with skill-id and summary words in the haystack (`DOM/domain-load.ts:103-111, 128-132`), not a missing floor. Reproduced: Gmail-read message → `cold_email_deliverability_readiness`; "search my email for the invoice" → same. Fix: §4.3 steps 1–4 (discriminative/prose split + 2-token rule + direct-tool guard + regression tests).

**P1-2. Worker preload re-injects every turn and has no telemetry.** No `alreadyLoadedSkillIds` (`V2/worker-turn-preparation.server.ts:453-456`); no `skill_preloaded_id` event on the worker lane (legacy emits it at `LEGACY:1942, 3320`; grep of `V2/` and `apps/worker/src` finds none). Fix: pass loaded ids from the frozen history's `loaded_skill_executions` + the previous turn's preload (record it in `domainMetadata`, `:800-812`), and emit `skill_preloaded_id` + `skill_preload_source` into the artifact/stream events.

**P1-3. Short-format preload drops the blocks the authoring guide calls load-bearing.** `loadSkill(id,{format:'short'})` is hard-coded (`DOM/skill-gate-preload.ts:83`); short omits Judgment/Routing/Knowledge/Examples (`SK/skill-load.ts:210-317`). 47/53 skills set `preserve_markdown: true` expecting the raw body. On the worker lane there is no "call full" escape. Fix: honor `recommended_load_format` (2 skills already set `full`) and add a per-skill `preload_format` frontmatter key; cap by chars, not by block type (e.g., include Examples' first worked example ≤ 60 lines).

**P1-4. Lean discovery mounts `skill_search` but the prompt tells the model to call `skill_load`.** `RT/catalog/surfaces.ts:28` vs `LITE/build-lite-prompt.ts:1198` ("Root skill catalog (use `skill_load` to fetch the playbook)") and `:989` ("Call skill_load before answering…"). A weak model emits `skill_load` → unknown-tool miss → wasted round (legacy lane). Fix: either mount `skill_load` at launch (it is one small schema) or reword both lines to "skill_search → skill_load".

### P2

**P2-1. `going_viral` and other orchestration skills are unexecutable as preloads.** Their Policy mandates loading references/siblings (`going_viral/SKILL.md` Policy line 1) that the worker cannot load and the short format does not carry. Fix: lane-aware rendering — when `allowFollowupSkillLoad === false`, inline the top reference's first ~40 lines or replace the mandate with "reference modules unavailable on this surface; state platform claims as unverified".

**P2-2. `task_management` step 7 references a non-existent task `update_strategy`; contradicts its own Examples.** `SK/definitions/task_management/SKILL.md` Procedure 7 vs Examples ("Task fields are direct replacements"); `update_onto_task` has no strategy arg (`RT/catalog/definitions/ontology-write.ts:1040-1060`). Fix: delete step 7 or rewrite as "task description is a full replacement; read first, then write the composed value".

**P2-3. `linkedin_company_page_growth` has no `## Contract`** (only skill without one; preloadable). `project_creation` has no complete worked `create_onto_project` exemplar; 19/53 skills have no Examples at all (list in §2). Fix: run the eval-harness exemplar recipe from `SK/AUTHORING_GUIDE.md:16` on the 39 preloadable skills first.

**P2-4. The A/B harness for the catalog (F9) was never run, and on the worker lane the question is moot.** `V2/scaffold-variant.ts:89, 98-101` (`no-static-catalog`, `model-led-skill-discovery`) only affect the legacy lane; the worker already runs with `staticSkillCatalog` effectively off. Fix: run the ablation on the legacy battery once to close the ticket, then treat the worker lane's "no catalog + preload only" as the baseline to measure, and add a `no-preload` variant for it.

**P2-5. Three-plus routing mechanisms can disagree; preload always wins.** `PRELOADED_NEXT_STEP` (`DOM/domain-sensing.ts:108`) forbids further lookup even when the candidate list had alternates. Fix: when candidate[1] exists with confidence within 0.1 of candidate[0], render both skills' `when_to_use` lines and let the model pick (legacy), or preload only `Contract` + `Policy` of both (worker).

### P3

**P3-1. `activation` / `altitude` frontmatter are decorative.** Nothing routes on them (`SK/skill-search.ts:100` only stuffs them into the search haystack); `always_on` is a dead enum (memory confirms). Either remove from the schema or make `activation: always_on` mean "inline Contract+Policy into the worker prompt for this context type".

**P3-2. `cold_email_outreach_compiler.mode_templates` is `visibility: internal`**, so the public/portable skill's step 4 is unsatisfiable (`SK/skill-reference-visibility.ts:23-29`). Either publish it or add a fallback scaffold in the shell.

**P3-3. Sensing runs on every admission but its output is unused on prepared hits** (`V2/turn-preparation.ts:150`) — cheap CPU, but it means the `used_domains` ledger records domains the model never saw.

**P3-4. `evals.md` (13 skills) are documentation, not tests.** No runner exists (`apps/web/scripts/check-agent-skills.ts` is a publication lint; `apps/web/src/lib/server/agent-skills.ts:42` only serves them); `EVALS_GUIDE.md:15-60` describes a with/without judge protocol that has never been automated.

---

## 7. What's right

- **The skill file format is well-designed for weak models** — the block ontology (`SK/AUTHORING_GUIDE.md:26-50`), the linter (`SK/skill-authoring-validation.ts`), disk↔registry parity test, related-ops → `materialized_tools` resolution with read/write/destructive classification (`SK/skill-load.ts:165-199`), and provenance tags on references are all genuinely good infrastructure. `cold_email_outreach_compiler` and `task_management` show the format can produce operational instructions.
- **The worker deliberately refuses to advertise tools it cannot run** (`V2/worker-prompt-surface.ts:16-20`, `RT/worker-tool-policy.ts:88-93`) and repairs the model when it tries (`WK/provider/repair-policy.ts:23-62`). That is the correct safety posture; the gap is what it left behind (P0-1).
- **Preload short-circuits an LLM round** — the WP-7 rationale (`DOM/skill-gate-preload.ts:1-16`) is right; the legacy lane's history dedupe and tool materialization are the correct pattern to copy to the worker.
- **The catalog-line diet** (`catalog_line`, all 24 roots have one; `LITE/build-lite-prompt.ts:1150-1154`) already cut the table to ~800 tokens; the prior audit's 10.7% figure is now legacy-lane-only.
- **`getSkillGateCandidateSkillIds`'s "primary strong domain beats a secondary domain's card"** rule (`DOM/domain-sensing.ts:585-603`) fixed a real fiction→marketing misroute; the structure for ranking exists, it just needs better inputs.
- **The scaffold-variant ablation harness exists and is wired** (`V2/scaffold-variant.ts`); it is one env var from producing evidence.
- Alias matching is already whole-token (`DOM/domain-load.ts:81-90`), fixing the earlier `ui`-in-`build` substring bug.

---

## 8. Open questions needing telemetry

1. **Prepared-prompt hit rate on the worker lane** (`inspectPreparedPromptForWorkerAdmission` reasons, `V2/prepared-prompt-consumer.server.ts:153-230`). If hits dominate, P0-2 means skills are effectively off in production today; if misses dominate, P1-2's re-injection cost dominates.
2. **Preload frequency per skill and per source** (`domain_sensing` vs `project_domain_affinity`), split by lane — the legacy lane logs `skill_preloaded_id` (`LEGACY:1942`), the worker logs nothing.
3. **Misfire rate**: for each preload, did the turn's executed tools overlap the skill's `materialized_tools`/`read_ops`, or did the model ignore the playbook entirely (F7's "models were smart enough to ignore it")? Computable from `chat_tool_executions` joined to the preload event once (2) exists.
4. **`skill_search`/`skill_load`/`skill_reference_load` call counts and which ids** on the legacy lane, per context type — the audit's "5 fires in 19 turns" is the only sample.
5. **Unavailable-skill repair count** on the worker (`unavailableSkillRepairAttempted`, `WK/provider/repair-policy.ts:24`) — how often does the model still try to call `skill_load` after being told it cannot?
6. **Turn quality delta with vs. without preload** for the top-5 preloaded skills (the with/without protocol from `EVALS_GUIDE.md:15-22`, run through the production battery, not a judge on fixtures).
7. **How often a domain is sensed at confidence 0.45–0.55 with no alias** (kept but ungated) — those turns pay ~300 tokens of "Candidate domains/outcome cards" text on the legacy lane for no action.
