<!-- tasker/14-complete-project-audit-build.md -->

# 14 — Complete Project Audit tracker: core build through Phase 4

**Priority:** P2 — next major Project Review/audit build track (behind verifying what's already shipped)
**Type:** Engineering (new feature)
**Source:** `apps/web/docs/technical/architecture/agent-work/COMPLETE_PROJECT_AUDIT_TRACKER_SPEC_2026-07-01.md` (staged 2026-07-01, uncommitted)

## State

The spec formalizes what tasker/04 item 6 sketched: Complete Project Audit as a separate `project_audits` track (a report artifact, NOT another generic Project Review suggestion). The core build is now in place:

- Schema/types exist for `project_audits`, `project_audit_trigger_evaluations`, and `project_audit_suggestions`.
- Manual and scheduled audit queueing run through the project-loop worker path.
- The worker creates durable audit packets, bounded child `audit_recommendation` suggestions, inbox items, and audit-suggestion links.
- The worker now runs an evidence-catalog-constrained LLM synthesis pass over the deterministic audit scaffold when an audit user is available, with deterministic fallback on model failure.
- Follow-up decisions refresh audit counts and feed recurrence memory.
- New audits supersede older ready audits and pending linked follow-ups.
- Queue/skip/failure/ready/read/reviewed/child-suggestion outcome metrics are emitted.
- The project tracker renders latest audit state, confidence, top findings, dimensions, generated/open follow-up counts, and Phase 4 `change_summary` context.
- The tracker has a visible audit-detail modal for full dimensions, recommendations, risks/open questions, evidence, and linked child suggestion statuses.
- 2026-07-05 lifecycle hardening: complete-audit workers claim audit/run rows as a paired ownership step, queue producers fail dedup-loser rows after inspecting returned queue metadata, and pending child suggestions are superseded if a parent run/audit fails after insert.

User applied the latest `audit_recommendation` suggestion-kind migration.

## Next action

1. Live-smoke manual run -> worker completion -> tracker -> details modal -> inbox follow-up against a migrated database.
    - Also verify no orphaned `queued` run/audit rows after a duplicate manual trigger.
    - Also verify pending audit follow-ups are not left visible if the parent audit is forced to fail after child insert.
2. Optional Phase 5 configuration: project audit appetite, audit-ready notification preference, and strategic-project flag.
3. Decide whether audit history needs a fuller in-app surface beyond latest audit plus superseded/readable packets.

## Done when

`project_audits` migration applied, trigger evaluator + worker generator running behind a flag, tracker UI rendering a first real audit, child follow-ups visible in AI Inbox, recurrence suppression influencing later audits, and audit detail readable from the project surface.
