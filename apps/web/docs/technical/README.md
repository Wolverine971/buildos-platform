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

## Historical audits and implementation notes

These preserve findings and decisions from their stated dates. Verify them against current
code before treating a finding as open or reusing an implementation pattern.

### UI and performance

- [Animation performance audit](./ANIMATION_PERFORMANCE_AUDIT.md) — 2025 findings; the shared animation utilities were removed in April 2026
- [Modal lazy-loading progress](./MODAL_LAZY_LOADING_SUMMARY.md) — November 2025 conversion checklist and bundle-size estimates
- [UI patterns and conventions](./components/UI_PATTERNS_AND_CONVENTIONS.md) — 2025 component survey; use the [Inkprint design system](./components/INKPRINT_DESIGN_SYSTEM.md) for current design guidance
- [Marketing site design review](./audits/MARKETING_SITE_DESIGN_REVIEW_2026-04-29.md) — April 2026 landing-page review and design-review skill evaluation

### Agentic Chat

These July 2026 audits cover the former web stream orchestrator. For the worker runtime,
start with the [worker chat documentation](../../../worker/src/workers/agentic-chat/README.md).

- [Flow audit followups](./audits/AGENTIC_CHAT_FLOW_AUDIT_FOLLOWUPS_2026-07-06.md) — admission, prompt preparation, and lifecycle findings
- [Prompt quality audit](./audits/AGENTIC_CHAT_PROMPT_QUALITY_AUDIT_2026-07-10.md) — prompt construction and tool-description findings
- [Read-tool parallelization plan](./audits/AGENTIC_CHAT_READ_TOOL_PARALLELIZATION_PLAN_2026-07-06.md) — bounded read concurrency and write-ordering constraints
- [Stream orchestrator simplification plan](./audits/AGENTIC_CHAT_STREAM_ORCHESTRATOR_SIMPLIFICATION_PLAN_2026-07-07.md) — extraction and correctness work
- [Wave 4 correctness and cost plan](./audits/AGENTIC_CHAT_WAVE_4_CORRECTNESS_COST_PLAN_2026-07-06.md) — budget, context, and finalization work
