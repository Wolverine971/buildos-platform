<!-- tasker/14-complete-project-audit-build.md -->

# 14 — Complete Project Audit tracker: spec'd, zero implementation

**Priority:** P2 — next major loops build track (behind verifying what's already shipped)
**Type:** Engineering (new feature)
**Source:** `apps/web/docs/technical/architecture/agent-work/COMPLETE_PROJECT_AUDIT_TRACKER_SPEC_2026-07-01.md` (staged 2026-07-01, uncommitted)

## State

The spec formalizes what tasker/04 item 6 sketched: Complete Project Audit as a separate `project_audits` track (a report artifact, NOT another `project_suggestions.kind`). It specs:

- Three new tables: `project_audits`, `project_audit_trigger_evaluations`, `project_audit_suggestions`
- A 4-gate trigger evaluator: eligibility baseline / size class / scheduled / burst — with quiet-period and audit cooldown
- A `buildos_project_audit` worker generator
- A project-level tracker UI

**Nothing is built.** No migration (the spec says so itself), no service, no table in `database.schema.ts`. The only `projectAudit` code in the repo is the unrelated agentic-chat `audit.skill.ts`.

## Next action

1. Commit the spec (part of [[15-commit-staged-work]]).
2. Sequence AFTER the AI Inbox smoke tests are green ([[13-ai-inbox-verify-and-cleanup]]) — don't stack a new loops feature on unverified plumbing.
3. First build slice: migration for the three tables + trigger evaluator with the 4 gates, reusing the burst-scoring machinery just added in `project-loop-burst.service.ts`.

## Done when

`project_audits` migration applied, trigger evaluator + worker generator running behind a flag, tracker UI rendering a first real audit.
