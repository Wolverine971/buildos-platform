<!-- apps/web/docs/technical/README.md -->

# 📚 Technical Documentation

This directory contains all technical documentation for BuildOS, organized by system component and functionality.

## 🏗️ Directory Structure

### `/architecture/`

System architecture documentation including high-level design, core feature flows, and architecture decision records (ADRs).

### `/api/`

API documentation including route references, endpoint specifications, webhook documentation, and error handling guides.

### `/database/`

Database documentation including schema definitions, migration strategies, Row Level Security policies, and performance indexes.

### `/services/`

Service layer documentation covering business logic services like brain dump processing, project management, calendar integration, and AI prompt management.

### `/email/`

Gmail integration planning, including multi-account read access, OAuth and data-security boundaries,
explicitly authorized email actions, Google verification, and phased rollout gates. Start with the
[Gmail integration master plan](email/README.md).

### `/components/`

Component documentation including Svelte 5 patterns, brain dump components, project components, and design system guidelines.

### `/testing/`

Testing documentation covering strategy, Vitest setup, LLM testing patterns, and coverage requirements.

### `/deployment/`

Production and DevOps documentation including Vercel configuration, environment variables, monitoring setup, and operational runbooks.

### `/development/`

Developer guide covering getting started, SvelteKit patterns, Svelte 5 runes, git workflow, and NPM script documentation.

## 🎯 Purpose

This technical documentation is designed for:

- Developers working on BuildOS
- System architects planning changes
- DevOps engineers managing deployments
- Technical stakeholders understanding the system

## 📝 Maintenance

Documentation is automatically generated where possible and should be updated when:

- API endpoints change
- Database schema evolves
- New services are added
- Architecture decisions are made

## More reference docs

- [PWA_PULL_TO_REFRESH.md](./PWA_PULL_TO_REFRESH.md) — rules for the installed-app pull-to-refresh gesture
- [TOAST_SYSTEM.md](./components/TOAST_SYSTEM.md) — toast notification API
- [codebase-inventory-tool.md](./audits/codebase-inventory-tool.md) — how to run the codebase inventory / duplicate finder
- [supabase-auth-permissions-validation.md](./deployment/runbooks/supabase-auth-permissions-validation.md) — SQL checks for shared-project access, invites and RLS
- [CALENDAR_EVENT_TRACKING.md](./calendar/CALENDAR_EVENT_TRACKING.md) — organizer/attendee tracking on task calendar events (Oct 2025; the phase-generation section is obsolete)
- [AGENT_CHAT_MINIMIZE_TO_NOTIFICATION_SPEC_2026-07-10.md](./audits/AGENT_CHAT_MINIMIZE_TO_NOTIFICATION_SPEC_2026-07-10.md) — spec for minimizing chat into the notification stack (built; its research section cites the removed stream route)
