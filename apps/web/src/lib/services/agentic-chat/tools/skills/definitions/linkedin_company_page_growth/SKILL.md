---
name: LinkedIn Company Page Growth
catalog_line: 'Grow a LinkedIn company page: audits, content systems, advocacy, comment motion, measurement.'
description: Root skill for growing LinkedIn company pages with Page audits, content systems, employee and SME advocacy, comment/community motion, paid assist, current resource and SME research, experiments, and measurement. Use when the user asks how to grow a LinkedIn company account or Company Page, increase followers, reach, engagement, leads, or qualified visibility, diagnose low LinkedIn Page performance, create a LinkedIn content calendar, or find tactical LinkedIn growth resources.
skill_type: strategy # procedure | reference | strategy | resource | policy | orchestration
altitude: domain # task | domain | meta
activation: progressive # always_on | progressive | invoked
preserve_markdown: true
legacy_paths:
    - linkedin-company-page-growth
    - linkedin_company_page_growth
    - linkedin_growth
    - social.linkedin.company_page_growth.skill
reference_modules:
    - id: linkedin_company_page_growth.playbook
      name: LinkedIn Company Page Growth Playbook
      summary: Detailed operating playbook with strategy, tactics, SME/resource map, experiments, metrics, and source links.
      when_to_load:
          - When the user needs a tactical deep dive, 30/60/90 plan, benchmark context, current resource map, or complete LinkedIn Page operating system.
          - When the user asks for current LinkedIn growth tactics, resources, SMEs, benchmarks, algorithm guidance, or source-backed strategy.
      path: references/growth-playbook.md
      visibility: internal
path: apps/web/src/lib/services/agentic-chat/tools/skills/definitions/linkedin_company_page_growth/SKILL.md
---

# LinkedIn Company Page Growth

<!--
  BLOCK ONTOLOGY (canonical order). Each block answers exactly one question; no concept is taught twice.
  Identity → Activation → Judgment → Procedure → Routing → Contract → Policy → Knowledge → Related Tools → Examples → Provenance.
  This file is skill_type: strategy, so Judgment (the strategic principles) plus the Procedure carry the weight.
  Knowledge is externalized by design: the volatile tactical depth — benchmarks, algorithm guidance, SME/resource
  map, 30/60/90 plans, source links — lives in the `linkedin_company_page_growth.playbook` reference module, which
  the agent loads on demand. This SKILL.md is a standalone root: it routes to no sibling skills, so there is no
  Routing block.
-->

## Identity

Treat the LinkedIn Company Page as credibility infrastructure and a conversion hub, not the entire distribution engine. For most BuildOS-style B2B and founder-led use cases, the growth system combines Page hygiene, useful native content, executive and employee distribution, active commenting, project/customer proof, and selective paid boosts.

## Activation

- The user asks how to grow a LinkedIn company account, Company Page, brand page, followers, reach, engagement, or qualified visibility.
- The user wants tactical LinkedIn advice beyond a simple post queue or content calendar.
- The user asks whether a LinkedIn growth skill exists.
- The user needs a LinkedIn Page audit, content calendar, employee advocacy plan, SME/resource map, current benchmark context, or 30/60/90-day growth plan.
- The user is working on BuildOS marketing, founder-led distribution, creator wedges, social media strategy, or Page-to-DM pipeline design.

## Judgment

- The Page is usually not the highest-reach surface by itself. The practical strategy is Page credibility plus people-led distribution.
- For BuildOS, favor concrete product transformations, creator workflow proof, founder judgment, reply-to-DM systems, and case-study loops over generic brand posting.

## Procedure

1. Clarify the growth outcome: brand trust, qualified reach, follower quality, conversations, demos, newsletter signups, event registrations, hiring, partnerships, or sales assist.
2. Identify the audience with enough precision to shape content and distribution: roles, seniority, industry, company size, creator type, geography, buying stage, pains, and existing communities.
3. Audit Page foundations before prescribing more posts: positioning, banner, tagline, About copy, CTA, keywords, proof, products/services, employee linkage, follower quality, posting history, and analytics.
4. Separate Page strategy from human distribution. Use the Page as a proof hub while founders, executives, SMEs, employees, customers, and partners expand reach.
5. Build 3-5 content pillars tied to the user's market thesis, proof assets, and audience pain. Prefer native, useful, specific content over generic announcements.
6. Add a conversation engine: Page comments, fast replies, DM handoffs, customer/partner/employee resharing, and follow-up content from real responses.
7. Design experiments with one hypothesis, one audience, one format, one primary KPI, and a keep/kill/iterate rule.
8. Use paid assist only after organic evidence identifies the post, audience, or message worth amplifying.
9. Return the appropriate artifact: audit memo, 30/60/90 plan, tactical calendar, reply/DM playbook, resource/SME map, or measurement dashboard.

## Policy

- Browse before citing current LinkedIn rules, algorithm behavior, benchmark numbers, or SME/resource recommendations.
- Prefer official LinkedIn, LinkedIn Engineering, LinkedIn Help, LinkedIn Marketing Solutions, LinkedIn Marketing Academy, and LinkedIn B2B Institute sources before vendor or creator sources.
- Label third-party benchmark reports, creator algorithm reports, and vendor playbooks as directional unless methodology is clear.
- Do not recommend fake engagement, engagement pods, scraping, unauthorized automation, auto-connect, auto-DM, auto-like, auto-comment, or follower-buying tactics.
- Do not optimize only for follower count. Track follower quality, qualified reach, comment quality, click quality, DMs, calls, assisted pipeline, or hiring outcomes depending on the goal.

## Related Tools

- `util.web.search`
- `util.web.visit`

## Examples

### User asks how to grow the BuildOS LinkedIn company account

- Load this skill, then load `linkedin_company_page_growth.playbook` if the answer needs tactical depth.
- Ground the answer in the BuildOS audience, positioning, existing LinkedIn queue, and current project docs.
- Return a focused 30/60/90 plan and the next 3-5 concrete actions.

### User asks whether there is a skill for LinkedIn growth

- Say yes and load `linkedin_company_page_growth`.
- If the user wants tactics, load the playbook reference module and synthesize it with the current project context.

### User asks for current resources or SMEs

- Browse first, then use the playbook's source hierarchy to rank official sources, benchmarks, and practitioners.
- Return each resource with why it matters and any bias or methodology caveat.
