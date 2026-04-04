<!-- apps/web/docs/content/AI_AGENT_CONTENT_PROGRAM_PLAN.md -->

# BuildOS AI Agent Content Program Plan

**Status:** Active  
**Owner:** DJ Wayne  
**Collaborator:** Ali  
**Last Updated:** 2026-04-03

---

## Purpose

This is the master review document for the BuildOS AI agent content program.

It exists to keep the work organized in one place so we can:

- review the overall plan quickly
- track which pieces already exist as drafts
- keep the publishing order clear
- standardize metadata and freshness requirements
- make sure each article helps both external builders and BuildOS

This document should be the main reference point when deciding what to write next.

---

## Core Positioning

The content program should do two things at the same time:

1. teach people how to build or improve their own AI agent capabilities
2. show that BuildOS is the strongest integrated implementation when they want this done well

That means the content should not feel gated or overly promotional.

The pattern should be:

- teach openly first
- explain the real implementation details
- be opinionated where it matters
- show how BuildOS handles the same problem in a more durable way

---

## System Model

The public system should be organized around these layers:

- **skills** = how to think, decide, and execute well
- **tools** = typed executable capabilities
- **plugins** = ecosystem access, auth, and packaging
- **stacks** = combined workflows across tools and systems
- **BuildOS** = the context and orchestration layer across all of it

This matters because the content program is not just a random set of blog posts.
It is a capability library.

---

## Canonical Reference Docs

These are the planning docs that support this master plan:

- [AI_AGENT_SKILLS_LIBRARY_PLAN.md](./AI_AGENT_SKILLS_LIBRARY_PLAN.md)
- [AI_AGENT_CAPABILITY_SYSTEM_PLAN.md](./AI_AGENT_CAPABILITY_SYSTEM_PLAN.md)
- [AI_AGENT_EDITORIAL_ROADMAP.md](./AI_AGENT_EDITORIAL_ROADMAP.md)
- [AI_AGENT_SKILLS_BRAINSTORM.md](./AI_AGENT_SKILLS_BRAINSTORM.md)

Use this document as the summary layer and those documents as deeper references.

---

## Metadata Standard

Every future agent-skills article should include this baseline publishing metadata:

- `title`
- `slug`
- `description`
- `published`
- `draft`
- `category`
- `tags`
- `author`
- `date`
- `lastmod`

Every draft should also have this working metadata in the draft body:

- `Content Type`
- `Target Audience`
- `CTA`
- `Word Count Target`

Every publishable article should also be reviewed for:

- screenshot needs
- provider-doc research trail
- last-reviewed date
- BuildOS implementation note
- social-post atomization opportunities

Important note:

- `lastmod` should be treated as a first-class freshness field because these integrations change
- the live blog UI already exposes freshness, so we should use that consistently

---

## Content Rules

Each article should follow the same basic contract:

- high-level explanation first
- low-level details second
- practical recommendations throughout
- edge cases and failure modes included
- BuildOS framing near the end, not forced at the beginning

Each article should also satisfy the dual-value rule:

- useful to people building their own agents
- useful as a bridge into BuildOS

---

## Current Publishing Path

The current path should be:

### Wave 1: Foundation

1. `How to Do Smart AI Research`
2. `How AI Agents Should Use OAuth`
3. `Google Calendar For AI Agents: Search Before You Create`

Purpose:

- teach how agents gather information
- teach how agents get permission safely
- teach how agents act inside a real operating system

### Wave 2: Tooling And Decision Support

4. `Tavily vs Perplexity vs Brave vs Building Your Own Browser Research Stack`

Purpose:

- help readers choose the right research surface
- support the research skill track with a concrete comparison post

### Wave 3: Business Operating System

5. `How to Get AI to Do Marketing for You`

Purpose:

- expand the lane beyond integrations
- teach AI operating judgment, not just setup mechanics

### Wave 4: Capability-System Framing

6. `How AI Agent Skills, Tools, Plugins, and Stacks Work Together`
7. `Google Workspace Plugin Setup for AI Agents`
8. `Google Calendar Tool Reference for AI Agents`
9. `Founder Assistant Stack: Gmail + Calendar + BuildOS`

Purpose:

- make the system model explicit
- turn the public content into a scalable library

---

## Draft Inventory

These are the BuildOS AI agent draft articles that already exist.

| Title                                                   | Slug                                                     | Category       | Status            | Content Type                    | Target Audience                                           | CTA                                                                  | Date       | File                                                                                                                                           |
| ------------------------------------------------------- | -------------------------------------------------------- | -------------- | ----------------- | ------------------------------- | --------------------------------------------------------- | -------------------------------------------------------------------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| How to Do Smart AI Research                             | `how-to-do-smart-ai-research`                            | `agent-skills` | Draft in progress | Jab (Educational / Value-First) | Founders, operators, builders, AI power users             | Learn how BuildOS compounds research context                         | 2026-03-29 | [BLOG_DRAFT_HOW_TO_DO_SMART_AI_RESEARCH.md](./BLOG_DRAFT_HOW_TO_DO_SMART_AI_RESEARCH.md)                                                       |
| How AI Agents Should Use OAuth                          | `how-ai-agents-should-use-oauth`                         | `agent-skills` | Draft in progress | Jab (Technical / Practical)     | Builders, founders, operators, AI agent developers        | Use BuildOS as the context layer for connected agent workflows       | 2026-04-01 | [BLOG_DRAFT_HOW_AI_AGENTS_SHOULD_USE_OAUTH.md](./BLOG_DRAFT_HOW_AI_AGENTS_SHOULD_USE_OAUTH.md)                                                 |
| Google Calendar For AI Agents: Search Before You Create | `google-calendar-for-ai-agents-search-before-you-create` | `agent-skills` | Draft in progress | Jab (Technical / Practical)     | Founders, operators, builders, AI agent developers        | Use BuildOS to turn calendar access into durable operational context | 2026-04-03 | [BLOG_DRAFT_GOOGLE_CALENDAR_FOR_AI_AGENTS_SEARCH_BEFORE_YOU_CREATE.md](./BLOG_DRAFT_GOOGLE_CALENDAR_FOR_AI_AGENTS_SEARCH_BEFORE_YOU_CREATE.md) |
| How to Get AI to Do Marketing for You                   | `how-to-get-ai-to-do-marketing-for-you`                  | `agent-skills` | Draft in progress | Jab (Educational / Strategic)   | Founders, operators, solo marketers, small teams using AI | Build your marketing operating system in BuildOS                     | 2026-03-29 | [BLOG_DRAFT_HOW_TO_GET_AI_TO_DO_MARKETING_FOR_YOU.md](./BLOG_DRAFT_HOW_TO_GET_AI_TO_DO_MARKETING_FOR_YOU.md)                                   |

### What Each Current Draft Does

#### 1. How to Do Smart AI Research

Role in the program:

- establishes the research skill track
- explains what AI research actually does under the hood
- introduces the lay-of-the-land first principle
- sets up later comparison pieces and research tool articles

Current strengths:

- strong conceptual framing
- clear research workflow
- includes the Ralph loop
- useful bridge into tool comparison content

Next step:

- tighten examples and make the practical workflow even more concrete

#### 2. How AI Agents Should Use OAuth

Role in the program:

- establishes the auth foundation for serious integrations
- teaches the permission model before provider-specific tool work
- supports future Google Workspace, Slack, GitHub, and HubSpot content

Current strengths:

- good explanation of acting model and flow choice
- strong PKCE and browser-handoff framing
- now includes current provider guidance from Google, Slack, GitHub, and Microsoft

Next step:

- add one concrete delegated example and one concrete app-level example

#### 3. Google Calendar For AI Agents: Search Before You Create

Role in the program:

- establishes the first real operating skill for the library
- bridges the research/auth foundation into actual system action
- turns Google Workspace into a practical starting cluster

Current strengths:

- strongly opinionated around search before create
- grounded in both Google Calendar API guidance and current BuildOS behavior
- includes duplicate prevention, scope selection, timezone handling, recurrence, and sync architecture

Next step:

- add one or two concrete end-to-end examples, such as rescheduling a meeting safely and creating a linked project work block

#### 4. How to Get AI to Do Marketing for You

Role in the program:

- opens the marketing and brand operations track
- expands the library beyond pure integrations
- positions BuildOS as a context system for marketing consistency

Current strengths:

- strong setup path
- good emphasis on clarity, documentation, and organization
- good bridge from research into marketing execution

Next step:

- deepen the comparison between build-your-own stacks, platforms, and point tools

---

## Next Drafts To Create

These are the most important pieces that do not yet exist as draft files.

| Priority | Title                                                                       | Why It Matters                                                           | Depends On                    |
| -------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------ | ----------------------------- |
| 1        | `Tavily vs Perplexity vs Brave vs Building Your Own Browser Research Stack` | Turns the research track into a concrete decision-support article        | Smart AI Research             |
| 2        | `How AI Agent Skills, Tools, Plugins, and Stacks Work Together`             | Makes the system model explicit and gives new readers orientation        | Capability System Plan        |
| 3        | `Google Workspace Plugin Setup for AI Agents`                               | Introduces packaging, auth boundaries, and Google ecosystem setup        | OAuth                         |
| 4        | `Google Calendar Tool Reference for AI Agents`                              | Defines the tool layer clearly and gives a structured API-facing surface | Google Calendar skill         |
| 5        | `Founder Assistant Stack: Gmail + Calendar + BuildOS`                       | Shows how the pieces combine in a real BuildOS workflow                  | Calendar, Gmail, plugin setup |

---

## Immediate Recommendation

The next writing sequence should be:

1. finish `How to Do Smart AI Research`
2. finish `How AI Agents Should Use OAuth`
3. tighten `Google Calendar For AI Agents: Search Before You Create`
4. draft `Tavily vs Perplexity vs Brave vs Building Your Own Browser Research Stack`
5. then return to `How to Get AI to Do Marketing for You`

That sequence gives the library:

- one research foundation piece
- one auth foundation piece
- one real operating skill
- one comparison piece
- one broader strategic operating-system piece

That is enough to define the lane.

---

## Per-Article Deliverables

For every article we publish in this program, we should aim to produce:

- the blog post itself
- 4 to 8 social posts
- screenshots where relevant
- a visible freshness signal
- a short BuildOS CTA

Recommended social slices:

- one conceptual post
- one practical post
- one opinionated or contrarian post
- one BuildOS implementation angle
- one screenshot or carousel angle

---

## Review Checklist

Use this checklist when reviewing any draft in this program:

- does it teach something genuinely useful without BuildOS?
- does it still point naturally back to BuildOS?
- is the article high-level first and low-level second?
- are recommendations and edge cases included?
- does it include clear freshness and source expectations?
- is the title strong enough to stand on its own?
- does the article fit the current publishing path?

---

## Working Rule

Do not expand the backlog faster than we can establish the path.

The immediate job is not to brainstorm forever.
The immediate job is to turn the foundation cluster into published pieces, then build outward from there.
