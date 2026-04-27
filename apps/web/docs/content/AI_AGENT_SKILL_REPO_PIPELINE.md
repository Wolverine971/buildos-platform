<!-- apps/web/docs/content/AI_AGENT_SKILL_REPO_PIPELINE.md -->

# BuildOS Agentic Skills Repo Pipeline

## Purpose

BuildOS should become a repo of practical agentic skills: reusable operating knowledge that helps an agent decide what to do, how to do it, and what to avoid.

The library should publish two kinds of skills:

- **Core skills:** durable integration and infrastructure skills an agent needs to operate safely.
- **Soft skills:** opinionated ways to do work, distilled from BuildOS usage, YouTube/podcast notes, long chats, retrospectives, and practical strategy lessons.

The public artifact is a blog/guide. The internal artifact can also become a runtime `SKILL.md` when BuildOS agents should actually use it.

## Skill Definition

A BuildOS skill is not just a prompt. It should teach:

- when the agent should use the skill
- how the agent should think about the work
- the recommended workflow
- what to avoid
- what to do when confidence is low
- how BuildOS turns the work into durable project context

Tools are executable surfaces. Skills are judgment and workflow. A skill may point to tools, but it should not just be a tool schema.

## Artifact Model

Each skill can have up to three artifacts.

| Artifact | Purpose | Location |
| --- | --- | --- |
| Runtime skill | The concise playbook loaded by the BuildOS agent | `apps/web/src/lib/services/agentic-chat/tools/skills/definitions/<id>/SKILL.md` |
| Public guide | Search-indexable article that teaches the skill to humans and agents | `apps/web/src/content/blogs/agent-skills/<slug>.md` |
| Working draft | Planning and draft space before publishing | `apps/web/docs/content/BLOG_DRAFT_*.md` |

Not every public guide needs a runtime skill. Runtime skills are for workflows the BuildOS agent should execute inside the product.

## Core Skill Pipeline

Core skills are the stable operating layer. They usually come from APIs, integrations, auth, sync, and tool safety.

### Foundation Core Skills

| Skill | Status | Notes |
| --- | --- | --- |
| OAuth 2.0 for agents | Draft exists | `BLOG_DRAFT_HOW_AI_AGENTS_SHOULD_USE_OAUTH.md` |
| Browser handoff for MFA/CAPTCHA/consent | Planned | Needed for real-world auth walls |
| Webhooks, signatures, and idempotency | Planned | Foundation for Stripe, Slack, GitHub, Calendar sync |
| Rate limits, retries, and backoff | Planned | Cross-provider reliability skill |
| Human approval loops for risky actions | Planned | Useful across email, calendar, billing, CRM |

### Provider Core Skills

| Skill | Status | Notes |
| --- | --- | --- |
| Google Calendar for agents | Runtime skill updated; public draft exists | `calendar_management/SKILL.md` and `BLOG_DRAFT_GOOGLE_CALENDAR_FOR_AI_AGENTS_SEARCH_BEFORE_YOU_CREATE.md` |
| Gmail for agents | Planned | Drafts, replies, labels, threading, send safety |
| Google Drive and Docs for agents | Planned | Search, permissions, comments, working context |
| Google Sheets for agents | Planned | Append/update/dedupe patterns |
| Slack for agents | Planned | Triage, approvals, escalation, summary-to-task |
| Linear for agents | Planned | Issue creation, updates, project delivery |
| GitHub triage for agents | Planned | Issues, PRs, release notes, incident follow-up |
| Stripe for agents | Planned | Billing, refunds, subscriptions, customer timelines |
| HubSpot for agents | Planned | Contacts, companies, deals, notes, sales follow-up |

### Stack Skills

| Stack | Status | Notes |
| --- | --- | --- |
| Founder assistant stack: Gmail + Calendar + BuildOS | Planned | Best first stack recipe |
| Sales follow-up stack: HubSpot + Gmail + Calendar + BuildOS | Planned | Revenue ops wedge |
| Product delivery stack: Slack + Linear + GitHub + BuildOS | Planned | Builder/team wedge |
| Support stack: Intercom/Zendesk + Stripe + BuildOS | Planned | Support-to-execution wedge |

## Soft Skill Pipeline

Soft skills are practical opinions about how to do work well. These are the main differentiator for the BuildOS repo.

They can come from:

- a long BuildOS chat that produced a useful operating lesson
- a YouTube video or podcast about how to do a job better
- a founder workflow that keeps recurring
- a retrospective on a failed or successful agent run
- a strategy document that can be turned into agent behavior

### Active Soft Skill Tracks

| Track | Skill Ideas | Source Pattern |
| --- | --- | --- |
| Research judgment | Smart AI research; research-first for recent topics; source triangulation | Research chats, web-search work, transcript synthesis |
| Calendar operations | Search before create; duplicate prevention; recurrence handling | BuildOS calendar implementation and calendar blog draft |
| Marketing operations | AI marketing operating system; brand strategy an agent can use; promotion without sounding generic | Founder chats, marketing docs, YouTube strategy videos |
| Lead generation | Creator discovery; ICP scoring; campaign retrospectives; search-term annealing | Mitchell Keller transcript and BuildOS growth docs |
| Content production | Blog-to-social extraction; publish kits; video scripts; editorial cadence | Anti-feed workflow and content cluster docs |
| Agent harness design | Skills vs tools vs plugins; narrow tool surfaces; progressive discovery | BuildOS agentic chat architecture, gstack/OpenClaw references |
| Product strategy | Research preview shipping; prompt harness audits; 10 evals over 100 weak evals | Cat Wu/Jenny Wen transcript synthesis |

## Conversion Workflow

Use this flow whenever a long chat, transcript, or real workflow contains a reusable lesson.

1. **Capture the source.**
   - Save transcript, chat export, or notes under the relevant research folder.
   - Record source date, title, and why it matters.

2. **Extract the operating lesson.**
   - What should an agent do differently after reading this?
   - What decision rule did we learn?
   - What failure mode does this prevent?

3. **Classify the skill.**
   - Core skill if it is about auth, APIs, sync, tools, or provider behavior.
   - Soft skill if it is an opinionated way to do work, make decisions, or run a workflow.

4. **Write the skill brief.**
   - Working title
   - When to use
   - Workflow
   - Guardrails
   - Examples
   - BuildOS angle

5. **Decide artifact level.**
   - Blog only: useful public guide, no runtime behavior needed.
   - Runtime skill: BuildOS agent should actually use the playbook.
   - Stack recipe: multiple skills/tools combine into a higher-order workflow.

6. **Draft the guide.**
   - Teach the generic skill first.
   - Add BuildOS as the integrated reference implementation.
   - Include specific failure modes and examples.

7. **Promote into runtime if needed.**
   - Keep the runtime `SKILL.md` concise.
   - Put only the agent's decision workflow and guardrails in the runtime skill.
   - Leave long explanation, research notes, and citations in the public guide.

8. **Publish and atomize.**
   - Publish under `agent-skills`.
   - Extract social posts, examples, and screenshots from the guide.

## Immediate Next Skills To Outline

1. **Google Calendar for agents**
   - Status: first public skill guide created under `apps/web/src/content/blogs/agent-skills/`.
   - Next action: review and refine the article before broader promotion.

2. **OAuth 2.0 for agents**
   - Status: draft exists.
   - Next action: tighten delegated vs app-level examples.

3. **How to do smart AI research**
   - Status: draft exists.
   - Next action: turn into the first soft-skill flagship.

4. **AI marketing operating system**
   - Status: draft exists.
   - Next action: recast as a soft skill for agents managing brand/context.

5. **Creator discovery and ICP annealing**
   - Status: planning docs exist.
   - Next action: create a skill brief from `buildos-lead-gen-system-plan.md`.

6. **Blog-to-social publish kit**
   - Status: `.claude/skills/anti-feed` exists.
   - Next action: turn the working skill into a public soft-skill guide.

## Open Implementation Tasks

- Move more publishable drafts from `apps/web/docs/content/` into `apps/web/src/content/blogs/agent-skills/`.
- Extend metadata support for review cadence, tested-against notes, file trees, permissions, and source links.
- Build a `/skills` hub after 8-12 strong articles exist.
- Add an agent-readable index once the repo has enough skills to be useful to external agents.
