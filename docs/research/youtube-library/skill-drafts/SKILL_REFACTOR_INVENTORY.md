<!-- docs/research/youtube-library/skill-drafts/SKILL_REFACTOR_INVENTORY.md -->

# Skill Refactor Inventory & Synthesis

Structural migration of 51 skills onto the canonical block ontology (Identity → Activation → Judgment → Procedure → Routing → Contract → Policy → Knowledge → Related Tools → Examples → Provenance). "Migrated" is gated on a `## Identity` H2 (§12.1). This report is **recommendation-only** — it does not act, rewrite content, merge/split skills, or extract references (all §7 non-goals). Golden reference: `going_viral/SKILL.md`.

- **Total:** 51 skills
- **Stale `skill_type: combo` (invalid enum) to re-type:** 6
- **Non-empty split/mis-type flags:** 9
- **Orchestration roots:** 3 (build_quality_ui_ux, cold_email_engagement_first_outreach, content_creation_pipeline)
- **Difficulty spread:** 8 easy · 30 medium · 13 hard

---

## 1. Inventory Table

| id                                       | skill_type    | altitude | activation  | combo?    | difficulty | examples | related_tools |
| ---------------------------------------- | ------------- | -------- | ----------- | --------- | ---------- | -------- | ------------- |
| accessibility_inclusive_ui_review        | procedure     | domain   | progressive | —         | medium     | no       | no            |
| ai_era_craft_and_quality_moat            | strategy      | meta     | progressive | —         | medium     | no       | no            |
| algorithm_aware_publishing               | strategy      | domain   | progressive | **combo** | hard       | no       | no            |
| build_quality_ui_ux                      | orchestration | meta     | progressive | —         | medium     | no       | no            |
| calendar_management                      | procedure     | task     | progressive | —         | easy       | yes      | yes           |
| calm_software_design_review              | procedure     | domain   | progressive | —         | medium     | no       | no            |
| cold_email_deliverability_readiness      | procedure     | task     | progressive | —         | easy       | no       | no            |
| cold_email_engagement_first_outreach     | orchestration | domain   | progressive | —         | hard       | yes      | no            |
| cold_email_icp_signal_design             | strategy      | domain   | progressive | —         | medium     | yes      | no            |
| cold_email_learning_review               | strategy      | domain   | progressive | —         | hard       | yes      | no            |
| cold_email_offer_lab                     | strategy      | domain   | progressive | —         | medium     | no       | no            |
| cold_email_outreach_compiler             | procedure     | domain   | progressive | —         | hard       | yes      | no            |
| cold_email_reply_os                      | strategy      | domain   | progressive | —         | hard       | yes      | no            |
| cold_email_research_anchors              | procedure     | domain   | progressive | —         | medium     | no       | yes           |
| cold_email_taste_review                  | strategy      | domain   | progressive | —         | medium     | yes      | no            |
| content_creation_pipeline                | orchestration | domain   | progressive | —         | hard       | yes      | no            |
| content_strategy_beyond_blogging         | strategy      | domain   | progressive | **combo** | medium     | no       | no            |
| context_engineering_for_agent_work       | strategy      | meta     | progressive | —         | medium     | no       | no            |
| delightful_product_review                | procedure     | domain   | progressive | —         | medium     | no       | no            |
| design_system_architecture_review        | procedure     | domain   | progressive | —         | medium     | no       | no            |
| document_workspace                       | procedure     | task     | progressive | —         | easy       | yes      | yes           |
| framework_extraction_lens                | strategy      | task     | progressive | —         | medium     | yes      | no            |
| google_calendar                          | policy        | domain   | progressive | —         | medium     | yes      | yes           |
| growth_diagnostics_for_stalled_products  | procedure     | domain   | progressive | —         | easy       | yes      | no            |
| hook_craft_short_form                    | procedure     | task     | progressive | **combo** | hard       | yes      | no            |
| idea_expansion_lens                      | strategy      | task     | progressive | —         | medium     | yes      | no            |
| information_architecture_review          | strategy      | domain   | progressive | —         | medium     | yes      | no            |
| landing_page_scorecard_funnel            | procedure     | domain   | progressive | —         | medium     | yes      | no            |
| lead_list_research                       | procedure     | domain   | progressive | —         | medium     | no       | no            |
| libri_knowledge                          | reference     | domain   | progressive | —         | hard       | yes      | yes           |
| linkedin_company_page_growth             | strategy      | domain   | progressive | —         | easy       | yes      | yes           |
| lived_conviction_lens                    | strategy      | task     | progressive | —         | medium     | yes      | no            |
| marketing_site_design_review             | procedure     | domain   | progressive | —         | medium     | no       | no            |
| medium_tailoring                         | procedure     | task     | progressive | —         | medium     | yes      | no            |
| nonfiction_writing_from_lived_conviction | strategy      | domain   | progressive | —         | medium     | no       | no            |
| people_context                           | procedure     | task     | progressive | —         | easy       | yes      | yes           |
| plan_management                          | procedure     | domain   | progressive | —         | medium     | yes      | yes           |
| project_audit                            | strategy      | domain   | progressive | —         | medium     | yes      | yes           |
| project_creation                         | procedure     | task     | progressive | —         | easy       | yes      | yes           |
| project_forecast                         | strategy      | domain   | progressive | —         | medium     | yes      | yes           |
| sensory_double_tap                       | strategy      | task     | progressive | —         | medium     | yes      | no            |
| story_driven_content_craft               | strategy      | domain   | progressive | **combo** | hard       | yes      | no            |
| storyboard_journey_lens                  | strategy      | task     | progressive | —         | medium     | yes      | no            |
| task_management                          | procedure     | domain   | progressive | —         | medium     | yes      | yes           |
| task_state_updates                       | procedure     | task     | progressive | —         | easy       | yes      | yes           |
| ui_ux_quality_review                     | procedure     | domain   | progressive | —         | medium     | yes      | no            |
| usability_quick_research                 | strategy      | domain   | progressive | —         | hard       | no       | no            |
| viral_content_for_boring_brands          | procedure     | domain   | progressive | —         | hard       | no       | no            |
| viral_video_script_structure             | procedure     | domain   | progressive | **combo** | hard       | yes      | no            |
| visual_craft_fundamentals                | procedure     | domain   | progressive | —         | medium     | no       | no            |
| youtube_channel_craft_for_founders       | strategy      | domain   | progressive | **combo** | hard       | yes      | no            |

---

## 2. DRY-Violation Clusters (recommend single owner; do NOT act)

### UI/UX design-review family

| #   | Shared concept                                                         | Skills involved                                                                       | Recommended single owner                                                                                                                             |
| --- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| A   | Color-contrast floor                                                   | accessibility_inclusive_ui_review, visual_craft_fundamentals                          | **accessibility_inclusive_ui_review** owns the WCAG contrast floor; visual_craft owns aesthetic/color-system craft above it (already delegates)      |
| B   | Reduced-motion / motion budget                                         | accessibility_inclusive_ui_review, calm_software_design_review                        | **accessibility_inclusive_ui_review** owns the a11y reduced-motion technical rule; calm owns motion-as-engagement restraint                          |
| C   | Calm-vs-craft / calm-vs-delight "same school, different layer" framing | ai_era_craft_and_quality_moat, calm_software_design_review, delightful_product_review | **ai_era_craft_and_quality_moat** (meta allocator) owns the school-contrast framing; calm & delightful own only their own lens verdicts              |
| D   | Delight-moat vs craft-moat                                             | ai_era_craft_and_quality_moat, delightful_product_review                              | Split by scope: **ai_era** owns craft-moat, **delightful_product_review** owns delight-moat (Changuel) — both cite the contrast                      |
| E   | Foundational visual rules (4px scale, type roles, 60/30/10, contrast)  | ui_ux_quality_review, marketing_site_design_review, visual_craft_fundamentals         | **ui_ux_quality_review** owns the foundational rule set; marketing_site (public sibling) and visual_craft reference it                               |
| F   | AI-slop handling                                                       | ui_ux_quality_review, visual_craft_fundamentals                                       | **ui_ux_quality_review** owns the 8-pattern smoke test / fingerprinting; visual_craft owns deep corrective token recipes (boundary already declared) |
| G   | Review scope structure-first vs build-quality                          | information_architecture_review, ui_ux_quality_review                                 | Partitioned (structure-first vs build-quality) — no re-owner needed; confirm the boundary line only                                                  |
| H   | Landing-page persuasion                                                | marketing_site_design_review, landing_page_scorecard_funnel                           | **marketing_site_design_review** owns general persuasion review; landing_page owns scorecard/quiz-funnel build                                       |

### Cold-email family (root + 8 children)

| #   | Shared concept                                                                                                    | Skills involved                                                        | Recommended single owner                                                                       |
| --- | ----------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| I   | North-star metric ("qualified conversations per unit of market trust")                                            | cold_email_engagement_first_outreach + every child (restated verbatim) | **cold_email_engagement_first_outreach** (root); children reference, not restate               |
| J   | Mode taxonomy (8 modes: high-volume/strategic/single-target/investor/recruiting/PR/partnership/customer-research) | root, offer_lab, outreach_compiler, research_anchors                   | **cold_email_engagement_first_outreach** (root)                                                |
| K   | "No AI-written opener" guardrail                                                                                  | root, icp_signal_design                                                | **cold_email_engagement_first_outreach** (root)                                                |
| L   | Becc Holland relevance taxonomy + two-people test                                                                 | icp_signal_design, research_anchors                                    | **cold_email_icp_signal_design** (segment-level); research_anchors references for per-prospect |
| M   | Craig Elias trigger events / left-company logic                                                                   | icp_signal_design, research_anchors, reply_os                          | **cold_email_icp_signal_design**                                                               |
| N   | Buying-committee map                                                                                              | icp_signal_design, offer_lab, reply_os                                 | **cold_email_icp_signal_design**                                                               |
| O   | Rob Fitzpatrick Mom Test / "compliments are weak evidence"                                                        | offer_lab, research_anchors, icp_signal_design, reply_os               | **cold_email_offer_lab** (evidence standard); others cite                                      |
| P   | April Dunford buyer-choice + Challenger Mobilizer material                                                        | offer_lab, icp_signal_design                                           | **cold_email_offer_lab**                                                                       |
| Q   | Vendor benchmark bands (Lavender, Schneider two-touch, Mailshake, Cognism, Gem)                                   | learning_review, outreach_compiler                                     | **cold_email_learning_review** (single owner of benchmark bands)                               |
| R   | Buyer-language extraction/log                                                                                     | learning_review, reply_os                                              | **cold_email_learning_review** (extraction worksheet); reply_os logs and feeds                 |
| S   | T0–T3 trust ladder                                                                                                | offer_lab, taste_review                                                | **cold_email_offer_lab** (taste_review borrow is acknowledged, low priority)                   |

### Content family

| #   | Shared concept                                             | Skills involved                                                                                                   | Recommended single owner                                                                                                             |
| --- | ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| T   | Content games / "Pillar 0" taxonomy + monetization mapping | algorithm_aware_publishing, content_strategy_beyond_blogging                                                      | **algorithm_aware_publishing** (Pillar 0 kept inline; loads every mode); content_strategy defers                                     |
| U   | Anti-feed / rage-bait / manufactured-virality refusal      | algorithm_aware_publishing, going_viral, viral_content_for_boring_brands, calm_software_design_review (anti-FOMO) | **algorithm_aware_publishing** owns publishing brand-safety refusal (going_viral routes here); viral_content & calm defer            |
| V   | Line-level hook craft                                      | hook_craft_short_form, story_driven_content_craft, viral_video_script_structure, going_viral                      | **hook_craft_short_form** (owner); others defer                                                                                      |
| W   | Dopamine ladder / curiosity loops                          | story_driven_content_craft, viral_video_script_structure                                                          | **story_driven_content_craft** (authored as check in viral_video; defers)                                                            |
| X   | Lived conviction / earned-claim doctrine                   | lived_conviction_lens (find), nonfiction_writing_from_lived_conviction (write)                                    | Boundary is find-vs-write; **nonfiction_writing_from_lived_conviction** owns the doctrine, lived_conviction_lens the extraction move |
| Y   | "Show, don't tell" / visual-cue-per-beat                   | sensory_double_tap, story_driven_content_craft                                                                    | **sensory_double_tap** owns second-channel reinforcement; story_driven references                                                    |
| Z   | Flop diagnosis                                             | going_viral (per-piece), viral_content_for_boring_brands (brand-account)                                          | Split by lens (per-piece vs brand-account) is asserted but the concept is taught in both — **flag for DJ**, not a clean re-owner     |
| AA  | Per-medium format facts                                    | medium_tailoring/references/\*, going_viral platform reference modules                                            | Cross-skill DRY seam — **flag for DJ** (possible shared platform-facts module)                                                       |
| AB  | YouTube analytics bands (CTR/AVD)                          | youtube_channel_craft_for_founders → youtube_channel_diagnostics (not yet built)                                  | Declared acquisition gap (Tier 2) — routes to non-existent target; **flag, do not resolve**                                          |

### BuildOS ontology / tool family

| #   | Shared concept                                                                                                         | Skills involved                                                    | Recommended single owner                                                                                                                                               |
| --- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AC  | Ontology entity chain (project→goal→milestone→plan→task) definitions                                                   | plan_management, project_audit, project_creation, project_forecast | Reference-extraction candidate for a shared ontology module (§12.3). Interim prose owner: **plan_management** — but **flag** (no references/ dir on several)           |
| AD  | Task creation/linking mechanics + state_key mapping                                                                    | task_management, task_state_updates, plan_management               | **task_state_updates** owns state_key mapping (thin the parent); **task_management** owns task creation; plan_management routes deep task ownership to task_management |
| AE  | project_audit ↔ project_forecast structural near-duplication (context-lock preamble, read-tool set, Guardrails/Notes) | project_audit, project_forecast                                    | Merge/consolidate candidate — **flag for DJ, do not merge (§7)**                                                                                                       |

---

## 3. Split / Mis-type List (every non-empty flag)

**The six stale `skill_type: combo` (invalid enum) — re-type to dominant during migration:**

| id                                 | Action                | Rationale                                                                                                                                                                                                                                              |
| ---------------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| algorithm_aware_publishing         | combo → **strategy**  | Spine is decision content (9 Core Principles, 5 content games, Trust Formula, Keep/Modify/Reject, dual audit). Secondary procedure. NOT orchestration (going_viral orchestrates this). Largest file (~19KB); the strategic-layer + quality-gate owner. |
| content_strategy_beyond_blogging   | combo → **strategy**  | Body is principle/decision-driven (Core Principles, Strategy Workflow, Format Decisions, Opening Rules). Has child_skills (secondary orchestration flavor) but strategy dominates. Note in Identity per decision #4.                                   |
| hook_craft_short_form              | combo → **procedure** | Dominant verb "do" (draft/audit/rewrite via two ordered workflows). Two workflows = one skill, NOT a split. Strategy/reference secondary (Core Principles + Four Pillars).                                                                             |
| story_driven_content_craft         | combo → **strategy**  | Craft playbook (principles + six craft moves + seven-mistake QA filter). Heavy secondary procedure (two workflows) + Knowledge (three pillars). NOT a genuine split.                                                                                   |
| viral_video_script_structure       | combo → **procedure** | Two ordered workflows + 5-step skeleton + 6-phase live process + audit mode = clearly procedure. Normalize hyphenated sibling ids to underscores.                                                                                                      |
| youtube_channel_craft_for_founders | combo → **strategy**  | Dominant verb decide (phase classification, idea-funnel filters, packaging heuristics, positioning). Secondary procedure + policy. Coherent single channel-level skill, not a split.                                                                   |

**Matrix-conflict / structural flags (DJ decision required — flag, do not act):**

| id                            | Flag                                                                                                                                                                | Conflict                                                                                                            |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| ai_era_craft_and_quality_moat | Secondary type is orchestration (routes to 5 siblings) — **do NOT retype**; dominant is strategy (owns priority ladder, decision filter, quadrant, rubrics).        | Guard against over-correction to orchestration.                                                                     |
| google_calendar               | Policy dominant but carries a genuine ordered 8-step Workflow; §3.3 matrix **forbids Procedure in a policy skill**.                                                 | DJ: re-type to procedure (with heavy Policy block) **or** fold Workflow into Judgment.                              |
| libri_knowledge               | Typed **reference** but body carries a conditional Workflow (matrix forbids Procedure/Judgment in reference) and lacks required Provenance/source-tagged Knowledge. | DJ: re-type to procedure **or** restructure. Custom "Query Patterns" + status-handling Workflow are the hard remap. |

**No split flag but noted secondary-type tension (informational, dominant stands):** accessibility_inclusive_ui_review & calm_software_design_review (procedure vs strategy), cold_email_deliverability_readiness (procedure vs policy), lived_conviction_lens / nonfiction_writing / sensory_double_tap / storyboard_journey_lens (strategy vs procedure), project_audit / project_forecast (strategy vs procedure — forecast has NO Output section, reinforcing strategy), visual_craft_fundamentals (procedure vs strategy), design_system_architecture_review (procedure vs reference).

---

## 4. Dependency Graph Sketch (orchestration roots → owned siblings)

```
build_quality_ui_ux  [orchestration · meta]  — pure router
├── ui_ux_quality_review            (foundational UI pass; sequence-first)
├── visual_craft_fundamentals       (visual polish, AI slop)
├── accessibility_inclusive_ui_review (a11y floor)
├── marketing_site_design_review    (landing/marketing sections)
├── calm_software_design_review     (restraint lens)
├── delightful_product_review       (delight lens)
├── design_system_architecture_review (tokens/governance)
├── information_architecture_review (IA/interaction; sequence first)
└── usability_quick_research        (lightweight research)
        (adjacent meta-strategy allocator, NOT part of this router:
         ai_era_craft_and_quality_moat → routes to visual_craft, ui_ux,
         calm, marketing_site, delightful — allocates, does not perform)

cold_email_engagement_first_outreach  [orchestration · domain]  — family root
├── cold_email_icp_signal_design    (right person/moment; scorecard, kill-list)
├── cold_email_offer_lab            (the offer; trust ladder)
├── cold_email_research_anchors     (per-prospect anchors, bridge)
├── cold_email_outreach_compiler    (draft/package; 9-pt lint) → refuses-and-routes to 6 siblings
├── cold_email_taste_review         (reputation-risk review) [child]
├── cold_email_deliverability_readiness (sender trust gate)
├── cold_email_reply_os             (post-send; 12-class taxonomy)
└── cold_email_learning_review      (post-campaign; benchmark bands, gate tree)
     (adjacent: lead_list_research → routes INTO icp_signal_design,
      research_anchors, engagement_first_outreach — list-building, outside family)

content_creation_pipeline  [orchestration · domain]  — owns the process
├── idea_expansion_lens             (fan angles)            [Expand]
├── storyboard_journey_lens         (map journey/entry)     [Expand]
├── lived_conviction_lens           (mine lived experience) [Expand]
├── framework_extraction_lens       (name/tear-down a framework) [Expand]
├── sensory_double_tap              (2nd-channel reinforce) [Enhance]
├── medium_tailoring                (reshape to medium)     [Tailor]
└── draft executors (hand-off, not children):
    story_driven_content_craft, nonfiction_writing_from_lived_conviction,
    hook_craft_short_form, viral_video_script_structure,
    algorithm_aware_publishing, content_strategy_beyond_blogging

going_viral  [golden reference · orchestration — already migrated, NOT in batch]
    orchestrates → algorithm_aware_publishing (strategy+quality-gate owner),
    hook_craft_short_form, story_driven_content_craft,
    viral_video_script_structure; parent_id → content_strategy_beyond_blogging
```

**Standalone roots (no sibling deps):** context_engineering_for_agent_work, growth_diagnostics_for_stalled_products, linkedin_company_page_growth, nonfiction_writing_from_lived_conviction, libri_knowledge, calendar_management, document_workspace, people_context, project_creation, google_calendar.

**BuildOS ontology tool cluster (tool-routed, not skill-routed):** task_management ↔ task_state_updates (parent/child); plan_management → task_management; project_audit ↔ project_forecast (twins); project_creation. Cross-reference each other's ontology definitions (cluster AC/AD/AE).

---

## 5. Recommended Migration Wave Order (easy → orchestration/routing-heavy last)

Rule set applied: (a) easy + clean 1:1 header maps first; (b) orchestration roots + routing-heavy children last; (c) DRY-cluster members kept in **separate** waves so a shared concept is only re-slotted once at a time and drift is caught.

### Wave 1 — Easy, clean, low entanglement (8)

`calendar_management` · `document_workspace` · `people_context` · `project_creation` · `task_state_updates` · `growth_diagnostics_for_stalled_products` · `linkedin_company_page_growth` · `cold_email_deliverability_readiness`

### Wave 2 — Medium leaves, batch A (9)

`ui_ux_quality_review` · `accessibility_inclusive_ui_review` · `delightful_product_review` · `design_system_architecture_review` · `landing_page_scorecard_funnel` · `plan_management` · `google_calendar` · `context_engineering_for_agent_work` · `lead_list_research`

### Wave 3 — Medium leaves, batch B (7)

`visual_craft_fundamentals` · `calm_software_design_review` · `marketing_site_design_review` · `information_architecture_review` · `usability_quick_research` · `project_audit` · `cold_email_icp_signal_design`

### Wave 4 — Content lenses + ontology twins, batch C (8)

`idea_expansion_lens` · `framework_extraction_lens` · `storyboard_journey_lens` · `lived_conviction_lens` · `medium_tailoring` · `project_forecast` · `task_management` · `cold_email_offer_lab`

### Wave 5 — Executors, strategy, cold-email research (8)

`nonfiction_writing_from_lived_conviction` · `sensory_double_tap` · `content_strategy_beyond_blogging` · `hook_craft_short_form` · `ai_era_craft_and_quality_moat` · `cold_email_research_anchors` · `cold_email_taste_review` · `libri_knowledge`

### Wave 6 — Hard content craft + cold-email diagnostics (4)

`story_driven_content_craft` · `algorithm_aware_publishing` · `youtube_channel_craft_for_founders` · `cold_email_learning_review`

### Wave 7 — Hard routing-heavy children (4)

`viral_video_script_structure` · `viral_content_for_boring_brands` · `cold_email_reply_os` · `cold_email_outreach_compiler`

### Wave 8 — Orchestration roots (LAST) (3)

`build_quality_ui_ux` · `content_creation_pipeline` · `cold_email_engagement_first_outreach`

**DRY-separation audit (spot checks):** contrast pair accessibility(W2)/visual_craft(W3) ✓ · motion pair accessibility(W2)/calm(W3) ✓ · school pair calm(W3)/delightful(W2)/ai_era(W5) ✓ · content-games algorithm_aware(W6)/content_strategy(W5) ✓ · hook/story/viral_video across W5/W6/W7 ✓ · lived_conviction(W4)/nonfiction(W5) ✓ · sensory(W5)/story_driven(W6) ✓ · project_audit(W3)/project_forecast(W4) ✓ · plan(W2)/task_mgmt(W4)/task_state(W1)/creation(W1)/audit(W3)/forecast(W4) all separated ✓ · cold-email children spread W1–W7, root last in W8 ✓ · every orchestration root lands after all its owned siblings ✓.

Wave totals: 8 + 9 + 7 + 8 + 8 + 4 + 4 + 3 = **51**.

---

_Recommendations only. Reference-extraction (clusters AC/AA/Q etc.) and new-module creation are DJ-gated per §12.3 — flagged here, not executed._
