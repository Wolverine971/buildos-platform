<!-- docs/marketing/RETARGETING_IMPLEMENTATION_AGENT_PROMPT.md -->

# BuildOS Retargeting Pilot Implementation Prompt

Paste the prompt below into another AI agent if you want them to implement the founder-led reactivation pilot end-to-end.

---

## Paste-Ready Prompt

```text
You are implementing the remaining code and operational support for the BuildOS dormant-user retargeting pilot.

This is not a greenfield project. Start by reading the existing strategy, runbook, and copy docs, then inspect the current email infrastructure and welcome-sequence implementation so you can extend existing patterns instead of inventing a parallel system.

Your job is to fully implement the founder-led reactivation pilot in the current repo.

Primary goals:
1. Make it possible to build a dormant-user cohort, assign holdout users, and prepare manual founder-led send batches.
2. Send the retargeting emails through the tracked BuildOS email pipeline so send/open/click data lands in the existing email tables.
3. Preserve campaign metadata so downstream attribution is possible.
4. Support measurement of all three pilot outcomes:
   - first return session
   - first brain dump or project action
   - multi-day usage
5. Keep v1 manual and founder-led. Do not turn this into a generic lifecycle automation unless it is clearly necessary for the batch workflow.

Non-negotiable business constraints:
1. Do not use placeholder testimonials or attributed quotes.
2. Do not depend on historical acquisition-source data. It does not exist outside BuildOS for this pilot.
3. The messaging/value props are already defined and should remain centered on:
   - building context now so AI can help better later
   - clarifying thinking through structured project context
   - stronger collaboration when multiple people can work in parallel on shared context
4. Reuse existing email tracking/storage infrastructure instead of building a separate tracking system.
5. Suppress unsubscribed, bounced, complaint, internal, and recent-contact users as defined in the existing planning docs.

Read these docs first:
- /Users/djwayne/buildos-platform/docs/marketing/RETARGETING_CAMPAIGN_STRATEGY.md
- /Users/djwayne/buildos-platform/docs/marketing/RETARGETING_PILOT_RUNBOOK.md
- /Users/djwayne/buildos-platform/docs/marketing/RETARGETING_PILOT_EMAIL_COPY.md

Then inspect these implementation-pattern files:
- /Users/djwayne/buildos-platform/apps/web/src/lib/services/email-service.ts
- /Users/djwayne/buildos-platform/apps/web/src/lib/server/welcome-sequence.service.ts
- /Users/djwayne/buildos-platform/apps/web/src/lib/server/welcome-sequence.logic.ts
- /Users/djwayne/buildos-platform/apps/web/src/routes/api/cron/welcome-sequence/+server.ts
- /Users/djwayne/buildos-platform/supabase/migrations/20260428000007_add_welcome_email_sequences.sql
- /Users/djwayne/buildos-platform/packages/shared-types/src/database.schema.ts
- /Users/djwayne/buildos-platform/packages/shared-types/src/functions/get_user_engagement_metrics.sql

Important repo facts you should anchor on:
- Email sends already go through EmailService.sendEmail().
- EmailService already persists metadata into emails.template_data.
- EmailService already writes to emails, email_recipients, and email_logs, and supports open/click tracking.
- The welcome sequence is the closest existing pattern for campaign-state tables, step metadata, cron processing, and send logging.
- user_notification_preferences.email_enabled is the best existing opt-out signal for this pilot.
- Useful product activity signals already exist in:
  - agent_chat_sessions
  - onto_braindumps
  - onto_project_logs
  - ontology_daily_briefs

The pilot metadata spec is already defined in the docs. At minimum, every retargeting send should stamp:
- campaign_id
- cohort_id
- batch_id
- step
- variant
- send_type=manual_founder_led
- holdout
- conversion_window_days

The UTM and link param strategy is also already defined in the docs and should be preserved.

Implementation scope:

1. Create the implementation plan from the docs and then execute it.
- Do not stop at analysis.
- Make the necessary code changes.
- Add or update tests.
- If a migration is warranted, create one.

2. Add the minimum persistence needed for a founder-led retargeting pilot.
- You may need a campaign/cohort/batch table, a retargeting sequence table, or both.
- Keep the design lean.
- Prefer simple state that supports:
  - cohort freeze timestamp
  - holdout assignment
  - batch assignment
  - step send state
  - reply/manual stop state if needed
  - auditability for founder-led sends
- Model your table shape after the welcome sequence if that is the cleanest fit, but do not blindly copy 5-step lifecycle assumptions.

3. Implement a safe cohort-build path.
- The runbook already contains the cohort SQL logic.
- Turn that into something operational inside the app or supporting codebase.
- It can be:
  - a service plus admin endpoint
  - a typed SQL helper
  - a documented manual SQL path with persistence support
- The result must support deterministic holdout assignment and batching.

4. Implement a send workflow for Touch 1, Touch 2, and Touch 3.
- v1 is manual founder-led, so the send workflow can be admin-triggered or batch-triggered.
- Do not assume a fully automated schedule is required.
- Ensure the email copy source is the retargeting docs, not placeholder content.
- Ensure metadata is stamped consistently on every send.
- Ensure follow-up touches only target the correct users based on prior sends and activity state.

5. Implement attribution and outcome reporting.
- We need to measure:
  - return_session
  - first_action
  - multi_day_usage
- Use the activity tables already identified in the docs and shared-types schema.
- Preserve the holdout comparison.
- If useful, implement a reporting query, helper, or admin view that compares send group versus holdout.
- Attribution can remain simple for v1:
  - most recent retargeting email before the event within the allowed window
  - organic for holdout users

6. Handle suppression and guardrails.
- Respect email_enabled.
- Suppress bounced/complaint users.
- Suppress internal/test/admin accounts.
- Avoid users contacted too recently, per the docs.
- Make batch behavior explicit and auditable.

7. Consider the post-click experience.
- The strategy docs call out that generic app entry is weak for dormant users.
- If there is already an existing good entry point, use it.
- If there is not, implement the smallest reasonable returning-user path or CTA target that matches the pilot without creating unnecessary product surface area.
- Be pragmatic here. If a full landing flow is too large, at least preserve params and document the gap clearly.

Expected deliverables:
1. Code changes implementing the pilot support.
2. Any required migration(s).
3. Tests for the new logic.
4. Brief documentation updates where needed.
5. A short implementation summary describing:
   - what was built
   - what remains manual
   - how to run the first batch
   - how to evaluate outcomes

Quality bar:
- Follow existing repo conventions.
- Reuse existing services instead of duplicating them.
- Keep the design minimal and defensible.
- Do not add fake proof or speculative CRM data.
- Do not over-automate v1.

Suggested execution order:
1. Read the strategy, runbook, and copy docs.
2. Read EmailService and the welcome-sequence implementation.
3. Decide the minimum persistence model.
4. Implement cohort freeze + holdout + batch support.
5. Implement tracked send support for the 3 touches.
6. Implement reporting/attribution support.
7. Add tests.
8. Summarize the operational workflow for the founder.

When you finish, report:
1. The exact files changed.
2. Any migration added.
3. How the founder triggers the cohort build and sends batch 01.
4. How return_session, first_action, and multi_day_usage are computed.
5. Any remaining manual or known gaps.
```

---

## Why These Files Matter

- `/Users/djwayne/buildos-platform/docs/marketing/RETARGETING_CAMPAIGN_STRATEGY.md`
  Source-of-truth for the pilot shape, constraints, attribution rules, and success criteria.
- `/Users/djwayne/buildos-platform/docs/marketing/RETARGETING_PILOT_RUNBOOK.md`
  Contains the actual cohort, holdout, batching, follow-up, and reporting SQL logic.
- `/Users/djwayne/buildos-platform/docs/marketing/RETARGETING_PILOT_EMAIL_COPY.md`
  Source-of-truth for Touch 1, Touch 2, and Touch 3 copy and messaging priorities.
- `/Users/djwayne/buildos-platform/apps/web/src/lib/services/email-service.ts`
  Existing send path. It already logs to `emails`, `email_recipients`, and `email_logs`, and persists send metadata into `emails.template_data`.
- `/Users/djwayne/buildos-platform/apps/web/src/lib/server/welcome-sequence.service.ts`
  Best local example of campaign state, metadata stamping, step-level send logic, and hydration from logged email metadata.
- `/Users/djwayne/buildos-platform/apps/web/src/routes/api/cron/welcome-sequence/+server.ts`
  Example of cron/job orchestration and logging into `cron_logs`.
- `/Users/djwayne/buildos-platform/supabase/migrations/20260428000007_add_welcome_email_sequences.sql`
  Example migration pattern for a sequence-tracking table.
- `/Users/djwayne/buildos-platform/packages/shared-types/src/database.schema.ts`
  Current schema surface for email tracking, user preferences, and activity tables.
- `/Users/djwayne/buildos-platform/packages/shared-types/src/functions/get_user_engagement_metrics.sql`
  Existing engagement aggregation pattern that already uses the key activity sources for this pilot.

---

## Implementation Notes For The Next Agent

- `EmailService.sendEmail()` should stay the central send primitive.
- `emails.template_data` is the right place for retargeting campaign metadata in v1.
- The welcome-sequence service already demonstrates the pattern of searching `email_logs.metadata` to recover step state if needed.
- Keep the pilot founder-led. That means manual batch control is a feature, not a missing piece.
- If you need a new table, optimize for visibility and auditability over abstraction.
- If you need an admin UI, keep it small and task-oriented.
- If a full UI is unnecessary, an admin route plus docs may be enough.

---

## Suggested Acceptance Criteria

- A founder can freeze a candidate cohort and get deterministic holdout + batch assignment.
- A founder can send Touch 1 to `batch_01` through the tracked email system.
- Follow-up sends can correctly target Touch 2 and Touch 3 candidates.
- Every send includes the campaign metadata defined in the docs.
- The system can compare send group versus holdout on:
    - return_session
    - first_action
    - multi_day_usage
- Tests cover the new state / send / reporting logic at an appropriate level.
