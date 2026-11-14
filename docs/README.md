<!-- docs/README.md -->

# BuildOS Platform Documentation

## 🏗️ You Are Here: Monorepo Root

This folder contains **cross-cutting concerns** that affect multiple apps/packages.

For **app-specific documentation**:

- Web App (Vercel): `/apps/web/docs/`
- Worker Service (Railway): `/apps/worker/docs/`

For **package documentation**:

- Shared Types: `/packages/shared-types/` (types and schema definitions)
- Shared Agent Ops: `/packages/shared-agent-ops/` (agent operations, ontology, gateway helpers)
- Shared Utils: `/packages/shared-utils/` (utility functions)
- Smart LLM: `/packages/smart-llm/` (LLM service abstraction)
- Supabase Client: `/packages/supabase-client/` (database client)
- Twilio Service: `/packages/twilio-service/` (SMS client)
- BuildOS MCP Server: `/packages/buildos-mcp-server/` (local stdio MCP bridge)

## What's in This Folder

Product and engineering:

- `/architecture/` - System-wide architecture, data flows, diagrams; ADRs in `/architecture/decisions/`
- `/specs/` - Feature and system specifications
    - `/specs/homework/` - Homework agent orchestration system (Draft)
    - `/specs/tree-agent/` - Tree agent LLM orchestration system (Draft)
    - `/specs/djflow/` - DJ Flow multi-agent orchestration (design only)
- `/plans/` - Implementation plans, handoffs, evidence
- `/product/` - Product definitions, activation and review work, Project Review taxonomy
- `/research/` - Dated research, plus the YouTube library (`/research/youtube-library/`)
- `/technical/` - Technical reviews, implementation notes, engineering research
- `/testing/` - Test guides and the agentic chat gate
- `/api/` - Ontology endpoints and SMS API reference
- `/features/` - Cross-app feature specs (notifications, SMS event scheduling)
- `/integrations/` - Shared integrations (Google, Stripe, Twilio/SMS, Libri, OpenClaw)
- `/operations/` - Database, environment, security and worker operations
- `/migrations/` - Active schema migration plans
- `/privacy/` - Privacy claims and the data inventory
- `/prompts/` - Agent prompt material
- `/reports/` - One-off investigation reports
- `/guides/` - How-to guides
- `/user-guide/` - End-user documentation
- `/example-projects/` - Example project research and seed-migration reviews

Business, marketing and writing:

- `/marketing/` - Brand, growth, social media, campaigns (own lane; start at `marketing/START_HERE.md`)
- `/business/` - Business strategy, pitch material, communications guides
- `/brainstorms/` - Dated product brainstorms
- `/blogs/` - Blog drafts and source material
- `/philosophy/`, `/writing/` - Product philosophy and writing craft notes
- `/research-library/` - Saved transcripts, articles, papers
- `/founder/` - Founder working material
- `/print/` - Printable HTML exports

## 📝 Documentation Standards

**IMPORTANT:** Before creating any documentation, read:

- **[Documentation Guidelines](DOCUMENTATION_GUIDELINES.md)** ⭐ - Where to put docs, naming conventions, required formats

**Key Rules:**

- ✅ Research → `/docs/research/`
- ✅ Plans, handoffs, evidence → `/docs/plans/` (evidence in `/docs/plans/evidence/`)
- ✅ System architecture → `/docs/architecture/` (ADRs in `/docs/architecture/decisions/`)
- ✅ Web app docs → `/apps/web/docs/`
- ✅ Worker docs → `/apps/worker/docs/`
- ✅ Point-in-time docs (audits, plans, handoffs) carry a status banner — run `pnpm fix:doc-health`
- ❌ Don't create random docs at root level
- ❌ Don't re-create `thoughts/` or `docs/archive/` — delete superseded docs; git history keeps them

## Quick Navigation

### Understanding the System

1. [Monorepo Guide](MONOREPO_GUIDE.md) - Turborepo structure and workflows
2. [Deployment Topology](DEPLOYMENT_TOPOLOGY.md) - How apps deploy and communicate
3. [Web-Worker Architecture](architecture/diagrams/WEB-WORKER-ARCHITECTURE.md) - Complete service communication patterns
4. [Queue System Flow](architecture/diagrams/QUEUE-SYSTEM-FLOW.md) - Job processing architecture

### By Task

See [Task Index](TASK_INDEX.md) for navigation by "what you want to do"

### By Deployment Target

- **Web (Vercel)**: `/apps/web/docs/` - User interface, API routes, real-time UI
- **Worker (Railway)**: `/apps/worker/docs/` - Background jobs, email, scheduled tasks

### Research & Design

- **Research Library**: `/docs/research-library/` - Transcripts, blogs, papers, insights, and design thinking
- **Technical Notes**: `/docs/technical/` - Cross-cutting technical research and implementation notes
- **Reports**: `/docs/reports/` - Audit reports, assessments, and review artifacts
- **Example Projects**: `/docs/example-projects/` - Seed project research, guides, and migration reviews

## Environment Variables

For environment configuration, see:

- [Deployment Environment Checklist](operations/environment/DEPLOYMENT_ENV_CHECKLIST.md) - Complete environment setup guide

## Documentation Philosophy

This documentation follows a **deployment topology** structure:

- **App-specific docs** live with their apps (`/apps/web/docs/`, `/apps/worker/docs/`)
- **Shared concerns** live here at the monorepo root (`/docs/`)
- **Package docs** live with their packages (`/packages/*/docs/`)

This structure helps LLM agents and developers quickly determine scope and find relevant documentation.

## Docs without another index

Architecture decisions:

- [ADR-001: user-level notification preferences](architecture/decisions/ADR-001-user-level-notification-preferences.md)
- [ADR-002: timezone centralization](architecture/decisions/ADR-002-timezone-centralization.md)
- [ADR-003: ontology tables in the public schema](architecture/decisions/ADR-003-ontology-schema-public-prefix.md)

Specs and plans with open work:

- [Chat attachments (multimodal)](specs/AGENTIC_CHAT_MULTIMODAL_SUPPORT_SPEC.md) - images shipped; PDF and video unbuilt
- [Contacts in chat memory](specs/USER_CONTACTS_AGENTIC_MEMORY_SPEC.md)
- [Brief chat](specs/BRIEF_CHAT_SPEC.md) - February 2026 draft for chatting with the daily brief
- [Public skill gallery](specs/USER_FIRST_SKILL_GALLERY_SPEC_2026-07-08.md)
- [Public pages](specs/PUBLIC_PAGES_SPEC.md) - March 2026 draft; the data model has since changed
- [Security layered-defense plan](plans/2026-04-23-security-layered-defense-plan.md) - phase 1 shipped; phases 2-3 unbuilt
- [In-app activity feed](features/notifications/IN_APP_ACTIVITY_FEED_SPEC.md) - draft
- [Routes exempt from the standard API response](technical/api-response-exceptions.md)

Source material:

- [Design brief for image assets](guides/buildos-design-brief.md)
- [Agentic chat core elements, part 2: context](specs/agentic-chat-core-elements-part-2-context.md) - concept essay, not built ([part 1](specs/agentic-chat-core-elements.md))
- [Feed curation playbook](brainstorms/2026-05-13-feed-curation-playbook.md)
- [Example project migration review](example-projects/MIGRATION_REVIEW_MASTER.md)
- [Blog draft: why I built BuildOS](blogs/why-I-built-buildos.md) and [positioning notes](blogs/todays-blog.md)
- [Productivity in the future](philosophy/productivity-in-the-future.md)
- [Structure-first blog editing process](writing/john-mcphee-editing.md)
