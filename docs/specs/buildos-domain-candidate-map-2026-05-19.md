<!-- docs/specs/buildos-domain-candidate-map-2026-05-19.md -->

# BuildOS Candidate Domain Map

Status: exploratory seed map for domain research
Date: 2026-05-19
Owner: BuildOS agentic chat

## Purpose

This document sketches the 10-20 agentic domains BuildOS might expose as compact domain packs. These should not all be hand-added immediately. The point is to give the research queue and future domain generator a target shape.

The runtime source of truth remains the file-backed catalogs and future approved queue outputs. This document is a planning map.

## Selection Filter

A BuildOS domain should exist when the work needs specialized judgment, vocabulary, quality criteria, source material, and a repeatable skill stack.

Good domain candidates:

- Require domain-specific knowledge to do well.
- Show up repeatedly in agenda chat or project work.
- Benefit from progressive discovery of skills, micro-skills, resources, and tools.
- Have clear output lanes, such as a plan, review, audit, draft, diagnosis, research synthesis, or operating system.
- Have identifiable failure modes that skills can guard against.
- Can produce research queue items when coverage is missing.

Weak domain candidates:

- Basic BuildOS operations like task CRUD, calendar edits, document creation, and project creation.
- Thin nouns that do not imply specialized work.
- Areas where BuildOS only needs to call a tool, not reason with a specialized quality bar.

## Current Baseline

Current registered domains already cover a useful first slice:

```txt
marketing
marketing.content_strategy
marketing.short_form_video
marketing.youtube_growth
marketing.linkedin_company_page_growth
sales_and_growth
sales_and_growth.cold_email
product_and_design
product_and_design.ui_ux_quality
product_and_design.design_systems
product_and_design.usability_research
creator_growth
writing
```

Current registered work capabilities:

```txt
cold_email_campaign_build
cold_email_sender_readiness
youtube_growth_strategy_plan
youtube_video_improvement
linkedin_company_page_growth_plan
ui_ux_screen_review
design_system_architecture_review
short_form_video_asset_improvement
content_strategy_plan
project_audit
```

This means BuildOS should not start from a blank slate. The initial 10-20 domain map should extend the current catalogs, not replace them.

## Recommended First Seed Set

Start with these 10 because they are either already strongly represented or naturally adjacent to the current catalogs:

```txt
sales_and_growth.cold_email
marketing.content_strategy
marketing.short_form_video
marketing.youtube_growth
marketing.linkedin_company_page_growth
product_and_design.ui_ux_quality
product_and_design.design_systems
product_and_design.usability_research
product_and_design.marketing_site_quality
research.source_synthesis
```

The first eight are mostly grounded in existing skills. The last two should be queued for research because they are likely high-value and recurring, but the runtime coverage is not yet complete.

## Candidate Domains

### 1. `sales_and_growth.cold_email`

Status: seed now; strong existing coverage.

Agentic reason: cold outreach quality depends on ICP, signals, offer shape, research anchors, deliverability, reply handling, and learning loops.

Likely work capabilities: `cold_email_campaign_build`, `cold_email_sender_readiness`, cold reply handling, outreach learning review, strategic single-target outreach.

Research gaps: keep sender-readiness guidance current, add campaign analytics interpretation, and consider variants for recruiting, investor, partner, and podcast outreach.

### 2. `marketing.content_strategy`

Status: seed now; strong existing coverage.

Agentic reason: content strategy requires positioning, audience intent, format selection, distribution, cadence, and business objective alignment.

Likely work capabilities: `content_strategy_plan`, channel selection, publishing cadence, point-of-view development, repurposing system.

Research gaps: add sharper measurement models, category-specific content examples, and stronger owned/rented media decision rules.

### 3. `marketing.short_form_video`

Status: seed now; strong existing coverage.

Agentic reason: short-form video is a specialized craft with hooks, retention, structure, platform fit, audience signal, and publishing rhythm.

Likely work capabilities: `short_form_video_asset_improvement`, short-form publishing system, hook bank generation, retention rewrite.

Research gaps: add platform-specific diagnostics, account review patterns, and source-backed examples by niche.

### 4. `marketing.youtube_growth`

Status: seed now; partial existing coverage.

Agentic reason: YouTube growth needs channel positioning, video packaging, title/thumbnail thinking, retention, analytics interpretation, and publishing strategy.

Likely work capabilities: `youtube_growth_strategy_plan`, `youtube_video_improvement`, YouTube channel diagnostics, title/thumbnail packaging review.

Research gaps: channel analytics diagnostics, long-form packaging, thumbnail/title systems, and founder-led channel strategy.

### 5. `marketing.linkedin_company_page_growth`

Status: seed now; strong existing coverage.

Agentic reason: Company Page growth is not generic content. It needs Page hygiene, employee/founder amplification, SME mapping, proof, measurement, and platform behavior.

Likely work capabilities: `linkedin_company_page_growth_plan`, Page audit, 30-day plan, SME/resource map, measurement dashboard.

Research gaps: keep tactics current and add more industry-specific page examples.

### 6. `product_and_design.ui_ux_quality`

Status: seed now; strong existing coverage.

Agentic reason: UI/UX review needs hierarchy, IA, accessibility, visual craft, usability, flow logic, and evidence-grounded prioritization.

Likely work capabilities: `ui_ux_screen_review`, flow review, accessibility review, visual craft review, IA review.

Research gaps: create stronger screen-type heuristics for dashboards, editors, onboarding, settings, mobile, and admin tools.

### 7. `product_and_design.design_systems`

Status: seed now; strong existing coverage.

Agentic reason: design-system work depends on component taxonomy, tokens, governance, adoption, accessibility, release process, and product fit.

Likely work capabilities: `design_system_architecture_review`, component taxonomy plan, token governance plan, adoption audit.

Research gaps: add maturity-model variants for solo, startup, and platform teams.

### 8. `product_and_design.usability_research`

Status: seed now; strong existing coverage, but could be broadened.

Agentic reason: research work needs assumption framing, test design, interview craft, synthesis, and proportionality to decision risk.

Likely work capabilities: quick usability test plan, interview guide, assumption check, synthesis brief, research backlog.

Research gaps: connect usability research with broader customer-development and product-discovery domains.

### 9. `product_and_design.marketing_site_quality`

Status: queue next; partial skill coverage exists through marketing-site and visual/UI skills.

Agentic reason: marketing-site quality needs positioning, above-the-fold clarity, proof, conversion paths, information architecture, visual craft, and accessibility.

Likely work capabilities: landing-page review, homepage rewrite plan, conversion narrative review, proof and CTA audit.

Research gaps: register a formal domain and work capability, then map it to marketing-site, UI/UX, IA, and content skills.

### 10. `research.source_synthesis`

Status: queue next; high-value platform domain.

Agentic reason: users often need bounded research, evidence ranking, source comparison, synthesis, and recommendations without runaway browsing or Libri recursion.

Likely work capabilities: bounded research brief, source map, evidence review, comparative analysis, research memo, expert/resource discovery.

Research gaps: define budgets, citation/provenance rules, artifact shape, and Libri/web source boundaries.

### 11. `product_strategy.product_discovery`

Status: queue next.

Agentic reason: discovery needs assumptions, user segments, jobs, pain, validation methods, MVP scope, roadmap decisions, and opportunity sizing.

Likely work capabilities: product discovery brief, assumption map, MVP scoping, product requirements draft, decision memo.

Research gaps: define how this differs from project planning, usability research, and technical implementation.

### 12. `business_strategy.gtm_positioning`

Status: queue next.

Agentic reason: GTM and positioning require category framing, ICP, pain, wedge, messaging, competitive alternatives, pricing/package assumptions, and launch motion.

Likely work capabilities: positioning review, ICP/wedge design, launch plan, offer architecture, category narrative.

Research gaps: clarify overlap with cold email, content strategy, marketing-site quality, and fundraising narrative.

### 13. `writing.narrative_content_craft`

Status: queue next; partial existing coverage.

Agentic reason: writing quality depends on audience, thesis, structure, voice, proof, pacing, revision, and medium-specific constraints.

Likely work capabilities: essay structure review, founder narrative draft, article rewrite, script structure, editorial plan.

Research gaps: build a root writing craft skill beyond current story-driven content and video/content skills.

### 14. `people_and_networks.people_context`

Status: queue next; partial BuildOS and Libri boundary.

Agentic reason: people work needs relationship context, stakeholder maps, expert discovery, follow-up history, trust constraints, and source provenance.

Likely work capabilities: stakeholder map, expert/resource map, relationship brief, follow-up plan, people research brief.

Research gaps: decide what stays in BuildOS versus Libri, especially for books, public experts, and external people graphs.

### 15. `books_and_experts.knowledge_curation`

Status: later; Libri-heavy.

Agentic reason: book and expert work needs corpus curation, source credibility, reading paths, concept maps, expert lenses, and synthesis across materials.

Likely work capabilities: reading map, expert map, book synthesis brief, source-backed concept explanation, domain bibliography.

Research gaps: keep BuildOS as the routing and review layer while Libri supplies corpus depth through bounded resource handles.

### 16. `agent_and_automation.workflow_design`

Status: queue next.

Agentic reason: agent workflows need task decomposition, tool routing, guardrails, memory/context strategy, evals, retry rules, and human review points.

Likely work capabilities: agent workflow spec, automation design review, tool-surface design, eval plan, guardrail review.

Research gaps: define BuildOS-specific patterns for agentic flows without making the domain layer recursive or overly broad.

### 17. `technical_architecture.software_quality`

Status: queue next.

Agentic reason: software architecture work needs codebase context, API contracts, data modeling, performance, reliability, tests, security, and deployment constraints.

Likely work capabilities: architecture review, implementation plan, database model review, API design review, reliability/testing plan.

Research gaps: decide how this domain interacts with Codex/code execution versus BuildOS agentic chat, especially when code tools are not available.

### 18. `project_ops.project_execution`

Status: kernel-adjacent; treat carefully.

Agentic reason: project execution can require specialized operational judgment around blockers, stale work, sequencing, scope, risk, and forecasts.

Likely work capabilities: `project_audit`, forecast review, stale-work cleanup, next-action planning, scope decomposition.

Research gaps: do not turn basic project CRUD into a domain. Keep this as BuildOS-native unless the user is asking for operational judgment.

### 19. `knowledge_work.document_workspace`

Status: kernel-adjacent; treat carefully.

Agentic reason: document-heavy work can need synthesis, structure, revision, decision records, briefs, specs, and durable knowledge artifacts.

Likely work capabilities: spec drafting, memo synthesis, decision record, document review, knowledge capture plan.

Research gaps: separate generic document operations from specialized document craft and synthesis.

### 20. `fundraising_and_partnerships.outreach`

Status: later; likely child or sibling of cold email and GTM.

Agentic reason: investor and partnership outreach need narrative, targeting, warm paths, evidence, timing, relationship context, and follow-up strategy.

Likely work capabilities: investor outreach plan, partner outreach plan, warm-intro brief, fundraising narrative review, diligence follow-up plan.

Research gaps: decide whether this is its own domain or a specialized work capability under cold email, GTM positioning, and people context.

## Suggested Domain Tiers

Tier 1, seed now:

```txt
sales_and_growth.cold_email
marketing.content_strategy
marketing.short_form_video
marketing.youtube_growth
marketing.linkedin_company_page_growth
product_and_design.ui_ux_quality
product_and_design.design_systems
product_and_design.usability_research
```

Tier 2, queue research next:

```txt
product_and_design.marketing_site_quality
research.source_synthesis
product_strategy.product_discovery
business_strategy.gtm_positioning
writing.narrative_content_craft
agent_and_automation.workflow_design
technical_architecture.software_quality
```

Tier 3, later or Libri-backed:

```txt
people_and_networks.people_context
books_and_experts.knowledge_curation
fundraising_and_partnerships.outreach
project_ops.project_execution
knowledge_work.document_workspace
```

The Tier 3 items are still useful, but they need sharper boundaries. Some should remain BuildOS-native work capabilities rather than domain packs.

## What The Research Flow Should Generate

Each queued domain research item should produce a draft with:

- Domain id, name, aliases, boundaries, related domains, and coverage status.
- Candidate work capabilities with output shape and evaluation criteria.
- Skills and micro-skills to load, not preload.
- Resource handles and provenance rules.
- Known gaps and follow-up queue items.
- Suggested admin review checklist.
- Suggested eval scenarios before runtime promotion.

## Not Domains

These should remain BuildOS capabilities or tools unless specialized judgment becomes the main work:

```txt
calendar management
task CRUD
project creation
document CRUD
basic search
file attachment handling
safe writes
tool schema lookup
```

The boundary rule is simple: if the user needs BuildOS to operate on an object, use a BuildOS capability or tool. If the user needs BuildOS to reason well inside a subject area, route through a domain and then a work capability.
