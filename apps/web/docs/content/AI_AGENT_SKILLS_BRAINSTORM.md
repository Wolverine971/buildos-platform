<!-- apps/web/docs/content/AI_AGENT_SKILLS_BRAINSTORM.md -->

# BuildOS AI Agent Skills Brainstorm

## How To Choose Which Skills To Write

The best skills are not generic API summaries. They should be:

- high-frequency in real agent workflows
- hard to do correctly without practical guidance
- likely to break because of auth, permissions, or UI drift
- stackable with adjacent skills
- useful to both humans and autonomous agents
- close enough to BuildOS that the content can naturally point back into your product

---

## Dual-Value Rule

Each article should do both of these clearly:

- teach the reader how to implement the skill in their own agent stack
- show how BuildOS uses the same capability in a more integrated, context-compounding way

That keeps the content useful on its own while still making BuildOS the reference implementation.

Good article pattern:

- generic skill guidance first
- BuildOS implementation or recommendation second

---

## Current Active Backlog

These are the four ideas to treat as the immediate working backlog right now.

1. `How to Do Smart AI Research`
2. `Google Calendar For AI Agents: Search Before You Create`
3. `How to Get AI to Do Marketing for You`
4. `Tavily vs Perplexity vs Brave vs Building Your Own Browser Research Stack`

Why these four:

- they broaden the lane beyond pure integrations
- they establish BuildOS as a source of judgment, not just setup docs
- they cover research, execution, and marketing
- they are strong bridges into later tool, plugin, and stack pages

---

## First 12 To Publish

These are the best opening wedge because they are stackable, practical, and strong search targets.

| Skill                                                | Type       | Why it should be early                                                                       | Stacks with                      |
| ---------------------------------------------------- | ---------- | -------------------------------------------------------------------------------------------- | -------------------------------- |
| OAuth 2.0 for agents                                 | Foundation | Every serious SaaS integration depends on auth, refresh tokens, scopes, and consent handling | All provider skills              |
| Browser handoff for MFA, CAPTCHA, and manual consent | Foundation | Real agents get stuck on auth walls; this is highly practical and under-documented           | Google, Slack, HubSpot, Stripe   |
| Webhooks, signatures, and idempotency                | Foundation | Necessary for reliable syncs and action triggers                                             | Stripe, Slack, HubSpot, GitHub   |
| Google Calendar                                      | Provider   | Strong search demand, obvious BuildOS fit, and rich edge cases                               | Gmail, Contacts, Meet, BuildOS   |
| Gmail                                                | Provider   | Natural pairing with Calendar and a strong agent use case                                    | Calendar, Drive, Docs, BuildOS   |
| Google Drive and Docs                                | Provider   | Lets agents store, retrieve, share, and annotate working context                             | Gmail, Calendar, Sheets, BuildOS |
| Google Sheets                                        | Provider   | Common ops backplane for agents and automations                                              | Drive, HubSpot, Stripe, BuildOS  |
| Slack                                                | Provider   | Team coordination, alerts, approvals, and triage are ideal agent workflows                   | Linear, GitHub, BuildOS          |
| Linear                                               | Provider   | Excellent for turning conversations into tracked execution                                   | Slack, GitHub, BuildOS           |
| GitHub issues and pull-request triage                | Provider   | Valuable for builder traffic and compounds well with BuildOS planning                        | Linear, Slack, Vercel            |
| Stripe                                               | Provider   | High-value operational workflows and real recommendation surface area                        | Gmail, HubSpot, Support tools    |
| HubSpot                                              | Provider   | Strong revenue-ops use case and good stackability with email and calendar                    | Gmail, Calendar, Docs, BuildOS   |

---

## What Else Needs To Be Published Besides Skills

If this is going to scale, you should not only brainstorm skills. You should also brainstorm:

- tool reference pages
- plugin/setup pages
- stack recipe pages

For each major ecosystem, the fuller cluster should eventually include all four.

Example:

- skill: Google Calendar for agents
- tool page: Google Calendar tool reference
- plugin page: Google Workspace plugin setup
- stack page: Founder assistant stack with Gmail + Calendar + BuildOS

---

## Skill Families

These are the main clusters worth building over time.

### 1. Foundation Skills

These are reusable patterns that should exist before or alongside provider-specific content.

- OAuth 2.0 for agents
- service accounts and delegated access
- browser handoff for MFA and CAPTCHA
- webhook verification and replay protection
- idempotent writes and retry safety
- rate limiting and backoff strategies
- incremental sync, cursors, and pagination
- file upload and download workflows
- permission scopes and least-privilege recommendations
- audit logging and action traceability
- long-running job polling and status recovery
- human approval loops for risky actions

### 2. Research Skills

This should become one of the flagship soft-skill tracks because it applies across every other domain.

#### Core Heuristics To Teach

- get the lay of the land first, then dive into specifics
- research first when the topic is recent or fast-changing
- AI tends to be less accurate on more recent topics
- recent events, new products, and new APIs should be treated as research-required by default
- post-training and safety behavior can reduce accuracy or willingness on sensitive topics
- when the topic has safety implications, expect performance to degrade and verify more aggressively
- compare multiple sources, not one
- record exact dates when recency matters

#### Search And Research Topics

- Tavily vs Perplexity vs Brave Search
- when to use search APIs vs browser automation
- when to build your own research loop with Puppeteer
- source triangulation and evidence logging
- summarization vs extraction vs verification
- research workflows for recent launches, specs, and announcements

#### Best Angles

- how to do breadth-first research before depth-first research
- how to tell an agent when it must browse first
- how to compare search tools by task type
- when browser automation is worth the complexity

### 3. Google Workspace Stack

This is likely the best opening cluster for BuildOS.

- Google Calendar
- Gmail
- Google Drive
- Google Docs
- Google Sheets
- Google Contacts
- Google Meet
- Google Admin for shared org setups

### High-Value Document Angles

- Google Calendar for agents: events, recurring events, attendees, conferencing, time zones
- Gmail for agents: draft creation, reply handling, labels, threading, send safety
- Drive and Docs for agents: file search, permissions, shared drives, comments, suggestions
- Sheets for agents: append/update/dedupe patterns, formulas, bulk import/export

#### Opinionated Google Calendar Rules To Teach

- search before create
- never create a new event until the agent has checked for likely matches
- use event IDs and external mappings when available
- compare title, time window, participants, and calendar scope before creating duplicates
- treat recurring events and exceptions as high-risk mutations
- when uncertain, ask, search again, or update instead of creating blindly

### 4. Marketing And Brand Operations

This is a major soft-skill category and should become a first-class lane, not an afterthought.

#### Core Topics

- brand foundation
- brand positioning
- brand strategy
- audience definition
- content prioritization
- editorial systems
- intelligent promotion
- community engagement
- campaign measurement
- turning marketing activity into durable strategy

#### Best Angles

- how to build a brand strategy an agent can use
- how to teach an agent your voice, audience, and constraints
- how to promote without sounding generic
- how to prioritize marketing work before automating it
- how BuildOS can hold ongoing brand and content context

### 5. Team Coordination Stack

- Slack
- Discord
- Linear
- Jira
- Asana
- Trello
- ClickUp
- Monday.com

### Best Angles

- Slack triage and approval flows
- Linear issue creation from conversations
- Jira workflow-safe ticket updates
- Asana and Monday migration or comparison guides for agents

### 6. Knowledge And Workspace Stack

- Notion
- Airtable
- Coda
- Confluence
- Obsidian sync patterns

### Best Angles

- Notion database mutation patterns for agents
- Airtable automation-safe writes and linked records
- Confluence doc creation and update governance
- "When to use BuildOS instead of forcing a knowledge base to act like an execution layer"

### 7. Revenue And CRM Stack

- Stripe
- HubSpot
- Salesforce
- Pipedrive
- QuickBooks
- Xero
- DocuSign
- PandaDoc

### Best Angles

- Stripe subscriptions, refunds, invoices, and customer timelines
- HubSpot contact, company, deal, and note association
- DocuSign status tracking and signed-document handoff
- QuickBooks invoice and payment sync patterns

### 8. Support And Messaging Stack

- Intercom
- Zendesk
- Front
- Help Scout
- Resend
- Twilio SMS

### Best Angles

- support triage and escalation routing
- conversation summaries into BuildOS docs
- outbound email and SMS safety rails
- ticket-to-task conversion patterns

### 9. Builder And Deployment Stack

- GitHub
- GitLab
- Vercel
- Cloudflare
- Supabase
- PostHog
- Sentry

### Best Angles

- issue triage and release notes
- deploy checks and rollback workflows
- incident summaries and action extraction
- analytics events into operating decisions

#### Reference Systems To Think Against

- gstack as a public example of stackable skills and role-based agent workflows
- OpenClaw as a reference for external-agent capability discovery, typed tool gateways, and progressive tool use

### 10. Meeting And Scheduling Stack

- Calendly
- Google Meet
- Zoom
- Loom
- Otter

### Best Angles

- scheduling and rescheduling workflows
- meeting note capture and follow-up creation
- transcript to tasks, docs, and owners

### 11. Research And Lead Generation Stack

- LinkedIn workflows via browser automation
- Apollo
- Clay
- Clearbit
- Crunchbase

### Best Angles

- enrichment and prospect qualification
- browser fallback for anti-bot surfaces
- lead-research handoff into CRM and BuildOS

### 12. Commerce And Operations Stack

- Shopify
- Stripe Billing
- ShipStation
- Amazon Seller Central via browser workflows
- inventory and order exception handling

### Best Angles

- order-support stack recipes
- refund and exception routing
- fulfillment coordination into tasks and docs

---

## Compound Stack Recipes

These are especially valuable because they show how skills combine.

### Founder Ops Stack

- Gmail
- Google Calendar
- Google Drive
- Google Docs
- Slack
- BuildOS

### Sales Follow-Up Stack

- HubSpot
- Gmail
- Google Calendar
- Google Docs
- BuildOS

### Product Delivery Stack

- Slack
- Linear
- GitHub
- Vercel
- BuildOS

### Customer Support Stack

- Intercom or Zendesk
- Stripe
- Gmail
- BuildOS

### Recruiting Stack

- Gmail
- Calendar
- Docs
- Drive
- BuildOS

### Research Stack

- LinkedIn browser workflows
- Apollo or Clay
- Sheets
- HubSpot
- BuildOS

### Research And Strategy Stack

- Tavily or Brave Search
- Perplexity
- Puppeteer for site-specific collection
- BuildOS

### Brand And Promotion Stack

- brand strategy documents
- social distribution tools
- analytics
- BuildOS

---

## BuildOS-Native Skill Ideas

These are important because they differentiate you from a generic integrations blog.

- turn a Gmail thread into a BuildOS project
- turn a calendar event or meeting series into a BuildOS phase plan
- turn meeting notes into tasks, documents, and owners
- turn support tickets into ongoing operating docs
- turn CRM updates into project briefs
- build a founder daily brief from Gmail + Calendar + BuildOS context
- build a sales daily brief from HubSpot + Gmail + Calendar + BuildOS context
- build an execution brief from Slack + Linear + GitHub + BuildOS context

These pages should explain not just the external tool, but how BuildOS becomes the system that compounds the context.

---

## Suggested Publishing Order By Wave

### Wave 1: Core Google + Foundations

- OAuth 2.0 for agents
- browser handoff for auth blockers
- Google Calendar
- Gmail
- Google Drive and Docs
- Google Sheets

### Wave 1.5: Research + Calendar Operations

- research-first heuristics
- recent-topics research rule
- Tavily vs Perplexity vs Brave vs Puppeteer
- search-before-create for Google Calendar
- duplicate-event prevention

### Wave 2: Team Execution

- Slack
- Linear
- GitHub issue and PR triage
- stack recipe: Slack + Linear + GitHub + BuildOS

### Wave 3: Revenue Operations

- Stripe
- HubSpot
- stack recipe: HubSpot + Gmail + Calendar + BuildOS

### Wave 4: Support And Messaging

- Intercom or Zendesk
- Resend
- Twilio SMS
- stack recipe: Support + Stripe + BuildOS

### Wave 5: Marketing And Brand Operations

- brand strategy for AI agents
- intelligent promotion workflows
- marketing prioritization
- BuildOS marketing operating model

---

## Skills That Are Probably Too Early

These may be worth doing later, but they should not be early priority.

- enterprise-only admin tools with low search demand
- niche APIs with weak stackability
- purely conceptual prompt pages with no operational workflow
- tools where the only viable path is brittle scraping and no meaningful recommendation exists yet

---

## Best Bets For Traffic + Product Fit

If the goal is to start getting traffic for AI skill building stuff, the strongest overlap between search demand, stackability, and BuildOS relevance is:

1. Google Calendar
2. Gmail
3. Google Drive and Docs
4. OAuth 2.0 for agents
5. Slack
6. Linear
7. Stripe
8. HubSpot
9. GitHub triage
10. stack recipes that combine the above with BuildOS
11. research skills for recent topics and web tooling
12. marketing strategy for AI agents

---

## Specific Backlog Additions Requested

These are now explicit priority backlog items.

### Research

- `How to Do Smart AI Research`
- `When To Research First: Why Recent Topics Break Naive AI Workflows`
- `Tavily vs Perplexity vs Brave vs Building Your Own Browser Research Stack`
- `When To Use Search APIs vs Puppeteer`
- `How Safety Training Changes AI Behavior On Sensitive Topics`

### Google Calendar

- `Google Calendar For AI Agents: Search Before You Create`
- `How To Keep AI Agents From Creating Duplicate Calendar Events`
- `How AI Agents Should Search Calendars By Time, Title, And Context`
- `Recurring Events, Event IDs, And Other Calendar Edge Cases`

### Marketing

- `How to Get AI to Do Marketing for You`
- `How To Build A Brand Strategy An AI Agent Can Actually Use`
- `Marketing Skills For AI Agents: Positioning, Prioritization, And Promotion`
- `How To Set Up An Agent To Promote Your Work Without Sounding Generic`
- `From Brand Foundation To Content System: An AI Marketing Operating Model`
- `How BuildOS Can Turn Marketing Activity Into Durable Strategic Context`

---

## Recommendation

Treat the first year of this library like a portfolio of skill clusters, not isolated posts.

Start with one coherent wedge:

- foundations
- Google Workspace
- one or two BuildOS-native stack recipes

That gives you:

- practical search traffic
- reusable internal linking
- obvious differentiation
- a clean base for expanding into team ops, revenue ops, and support workflows
