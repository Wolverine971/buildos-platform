<!-- docs/reports/documentation-prune-recommendations.md -->

# Documentation Prune Recommendations

Date: 2026-01-08
Scope: root docs, /docs, /packages, /delete

## High-confidence archive or delete candidates

- `delete/` - explicitly marked "Documentation Pending Deletion"; the folder was already staged for removal and references an October 2025 reorg.
- `delete/apps/web/start-here.md` - points at old paths like `technical/architecture/BUILD_OS_MASTER_CONTEXT.md` and `/apps/web/docs/technical/...` that no longer exist.
- `docs/marketing/social-media/LINKEDIN_FOUNDER_CONTEXT.md` - explicitly deprecated and replaced by `docs/marketing/social-media/FOUNDER_CONTEXT.md`.
- `packages/twilio-service/docs/implementation/twillio-integration-plan.md` - superseded by `packages/twilio-service/docs/implementation/twilio-integration-plan-updated.md` and uses a misspelled filename.
- `docs/DOCUMENTATION_CLEANUP_SUMMARY_2025-11-16.md` - claims archive directories exist that are not present; keep only if you want a historical artifact, otherwise archive it.
- Root ad-hoc notes with no references: `base-prompt.md`, `chat-gpt-copy-plan.md`, `jan7todos.md`, `redesign-0.md`, `redesign-1.md`, `redesign-2.md` - move to an archive folder or delete once confirmed.

## Consolidate or supersede duplicates

- Agent chat specs are split across overlapping documents: `docs/api/agent-chat-implementation.md` and `docs/technical/implementation/AGENT_CHAT_ONTOLOGY_INTEGRATION_SPEC*.md`. Pick a single canonical spec, link to it from the API doc, and archive the phase-specific duplicates.
- Design system notes are spread across `redesign-0.md`, `redesign-1.md`, `redesign-2.md`, and `redesign-3-bible.md`. If `redesign-3-bible.md` is the canonical version, move it under `apps/web/docs/design/` (or similar) and archive the earlier iterations.

## Time-bound material that can be archived

- `docs/reports/` (audits, bug-fix summaries, handoffs) once findings are addressed.
- `docs/technical/reviews/` (dated recent-changes reviews).
- `docs/technical/agentic-chat-responsiveness-audit.md`, `docs/technical/agentic-chat-last-turn-context-assessment.md`, `docs/technical/agentic-chat-flow-followup.md` after fixes land.
- `docs/notification-audit.md` after the listed fixes are verified.
- `docs/marketing/social-media/daily-engagement/` and `docs/marketing/social-media/2026-01-08_twitter-following-audit.md` (daily/dated warmups).
- `docs/marketing/investors/outreach/` (campaign-specific outreach plans).
- `docs/research/` if you want research docs to live exclusively under `thoughts/shared/research` per `docs/DOCUMENTATION_GUIDELINES.md`.

## Stale navigation that should be updated or removed

- `README.md` references `docs/ARCHITECTURE.md` and `MIGRATION_GUIDE.md`, which are missing.
- `docs/README.md` lists `/audits/` and `/archive/` but those directories do not exist, and it omits real top-level folders like `/api/`, `/reports/`, and `/technical/`.
- `docs/TASK_INDEX.md` links to `/docs/archive/`, which does not exist.
- `docs/business/README.md` lists `/product/`, `/marketing/`, `/sales/`, `/fundraising/` under `docs/business/`, but only `/strategy/` and `/war-room/` are present.
- `docs/marketing/INDEX.md` links to `../start-here.md`, which does not exist.
- `docs/DOCUMENTATION_GUIDELINES.md` mandates `/thoughts/shared/research/`, yet the repo also has `/docs/research/`; pick one and prune the other to avoid drift.

## Low-value stubs or corrupted content

- `docs/operations/worker/README.md` contains a corrupted character (`�`) in the only bullet; either re-encode and flesh it out or remove if unused.
