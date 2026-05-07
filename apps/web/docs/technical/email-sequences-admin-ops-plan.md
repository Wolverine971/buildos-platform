<!-- apps/web/docs/technical/email-sequences-admin-ops-plan.md -->

# Email Sequences Admin Operations Plan

Date: 2026-05-06

## Goal

Give admins a granular operational view of both welcome and reactivation email sequences:

- Who is enrolled or eligible.
- Where each person is in the sequence.
- Which emails have been sent, opened, clicked, skipped, failed, or caused a return to BuildOS.
- Which people are eligible for reactivation.
- A safe manual workflow for selecting people and triggering reactivation sends.

This plan covers `/admin/email-sequences` and the supporting APIs, services, and database read models.

## Confirmed Product Decisions

- Bulk actions apply only to the reactivation sequence.
- Welcome sequence needs granular visibility, but not bulk re-enrollment from this workflow.
- Bulk reactivation should calculate the right next email for each selected person based on their current reactivation state.
- Admins need both "send now" and "schedule for later" options.
- Scheduled sends should be customized per person based on where they are in the reactivation flow and the existing sequence cadence.
- "Send now" should be available as an explicit timing override, while still respecting hard contact blocks.
- The activity view should be reactivation-focused, not just the existing generic user activity modal.
- Reply tracking is out of scope for v1. The main success signal is whether the person visits and tries BuildOS again.
- Existing reactivation signals are sufficient for v1: touch history, BuildOS activity, opens/clicks, reply/manual-stop status if already present, cohort/batch/variant, and demo URL.

## Current System Inventory

### Shared email sequence admin

- UI: `apps/web/src/routes/admin/email-sequences/+page.svelte`
- Loader/actions: `apps/web/src/routes/admin/email-sequences/+page.server.ts`

The current admin page focuses on editing and previewing email copy. It now groups variants by sequence step and opens the editor/preview in a modal. It also has a basic recipient list, but that list does not yet expose a complete per-person timeline.

### Welcome sequence

- Existing admin dashboard: `apps/web/src/routes/admin/welcome-sequence/+page.server.ts`
- Service: `apps/web/src/lib/server/welcome-sequence.service.ts`
- Generic queue RPC wrapper: `apps/web/src/lib/server/email-sequence-rpcs.ts`
- Generic queue migration: `supabase/migrations/20260501000004_add_email_sequence_queue_phase2.sql`

The welcome system has the strongest lifecycle model. It already stores:

- `email_sequences`
- `email_sequence_steps`
- `email_sequence_enrollments`
- `email_sequence_events`
- `emails`
- `email_tracking_events`

This is enough to build a detailed per-person view for welcome sequence state and history.

Important constraint: `enroll_user_in_email_sequence` currently rejects users created more than 14 days ago and users predating the deployment timestamp. Since the confirmed bulk workflow is reactivation-only, this plan does not change the welcome enrollment RPC.

### Reactivation sequence

- Logic: `apps/web/src/lib/server/retargeting-pilot.logic.ts`
- Service: `apps/web/src/lib/server/retargeting-pilot.service.ts`
- Send endpoint: `apps/web/src/routes/api/admin/retargeting/send/+server.ts`
- Member update endpoint: `apps/web/src/routes/api/admin/retargeting/members/[id]/+server.ts`
- Cohort endpoint: `apps/web/src/routes/api/admin/retargeting/cohorts/+server.ts`
- Report endpoint: `apps/web/src/routes/api/admin/retargeting/report/+server.ts`
- Table migration: `supabase/migrations/20260428000008_add_retargeting_founder_pilot.sql`
- Metrics RPC fix: `supabase/migrations/20260505000002_fix_retargeting_metrics_shape.sql`

The reactivation system uses `retargeting_founder_pilot_members` for campaign state. It tracks member-level fields like:

- `holdout`
- `manual_stop`
- `reply_status`
- `touch_1_sent_at`
- `touch_2_sent_at`
- `touch_3_sent_at`
- activity baselines

The metrics RPC already returns useful outcome fields:

- `touch_1_opened`
- `touch_1_clicked`
- `any_open`
- `any_click`
- `return_session_at`
- `first_action_at`
- `active_days_30d`
- `attributed_step`
- `attribution_type`

Gap: reactivation send history is derivable from `emails.template_data` and tracking tables, but there is no direct per-touch send queue/audit table or direct email ID field on the member row. That makes a detailed "what exact email did this person receive, when was it scheduled, and how did it perform" view more fragile than the welcome sequence view.

### User activity

- Existing modal: `apps/web/src/lib/components/admin/UserActivityModal.svelte`
- Existing activity API: `apps/web/src/routes/api/admin/users/[userId]/activity/+server.ts`
- Existing context API: `apps/web/src/routes/api/admin/users/[id]/context/+server.ts`

The existing admin activity modal can be reused for the "see their activity in BuildOS" requirement, with either a direct button in the sequence table or a reactivation-specific wrapper that highlights activity after the first reactivation send.

## Product UX Plan

### 1. Sequence Operations View

Keep `/admin/email-sequences` as the central page, with a new operations section separate from the copy editing modal.

Core controls:

- Sequence selector: Welcome, Reactivation.
- Status filters: Active, Completed, Paused, Errored, Eligible, Not eligible, Holdout, Manually stopped.
- Step filters: Welcome step number or Reactivation touch 1/2/3.
- Engagement filters: Sent, Opened, Clicked, Returned, No return.
- Cohort/batch filters for reactivation.
- Search by name or email.

Core table columns:

- Checkbox selection.
- Person.
- Sequence.
- Current position.
- Next trigger or next scheduled send.
- Last sent email.
- Opens/clicks.
- Returned to BuildOS.
- Last BuildOS activity.
- Row actions.

### 2. Per-Person Timeline

Each person row should expand or open a drawer/modal showing a timeline:

- Enrollment or cohort assignment.
- Step due.
- Sent event with subject, variant, timestamp, and email ID.
- Open/click events.
- Skips, deferrals, failures, retries.
- Return session or first post-send BuildOS action.
- Current sequence position and next trigger.

For welcome, source this from `email_sequence_events`, `emails`, and `email_tracking_events`.

For reactivation, source this from `retargeting_founder_pilot_members`, `emails.template_data`, `email_recipients`, `email_tracking_events`, and post-send activity queries.

### 3. Reactivation Stage and Activity Action

Each reactivation row should expose:

- A visible stage badge, such as Not started, Touch 1 sent, Touch 2 scheduled, Replied, Returned, Manually stopped, Already completed.
- A row action to open a reactivation-focused BuildOS activity view.
- A row action to preview the next reactivation touch for that person.

The "who is going to get the reactivation email" button should show the selected or filtered audience, the next computed touch for each person, the scheduled send time, and any skip/block reason.

### 4. Bulk Manual Send Workflow

For reactivation:

1. Admin filters to a cohort, batch, stage, or audience segment.
2. Admin selects multiple people with checkboxes.
3. A bulk action bar appears.
4. Admin chooses when to trigger the next reactivation email:
    - Send now.
    - Schedule using the reactivation flow cadence.
    - Choose a custom minimum date/time.
5. System computes each selected person's next reactivation touch:
    - No prior reactivation send: queue Touch 1.
    - Touch 1 sent and still in flow: queue Touch 2.
    - Touch 2 sent and still in flow: queue Touch 3.
    - Touch 3 sent: mark complete/no next touch.
6. System computes the scheduled time per person:
    - Touch 1: send at the chosen start time or the next reasonable send window.
    - Touch 2: send no earlier than 72 hours after Touch 1.
    - Touch 3: send no earlier than 7 days after Touch 1, only when the person opened or clicked and has not returned or taken a post-send action.
    - If the admin chooses Send now, use the current time for each computed next touch while still applying hard contact blocks.
7. Admin reviews a dry-run preview showing selected, queued/sent, skipped, and why.
8. Admin confirms.
9. UI updates each selected row with scheduled/sent/skipped/failed status.

Default safety behavior should respect hard exclusion rules:

- Do not send to holdout members.
- Do not send to manual-stop members.
- Do not send to people who replied.
- Do not send to unsubscribed, bounced, or invalid email recipients.
- Do not send a later touch if its prerequisites are not met.
- Require `demo_url` when sending Touch 2 if the current template requires it.

For v1, do not expose an override for holdout, manual-stop, or replied records. If an admin wants to include one of those people later, they should explicitly change that person's reactivation status first. Compliance-level blocks like unsubscribe/bounce should not be overrideable.

### 5. Reactivation-Focused Activity View

Add a dedicated view opened from each reactivation row. It should answer:

- What made this person part of the reactivation audience?
- What was their BuildOS activity before reactivation?
- Which reactivation emails have they received?
- Did they open, click, return, or take a meaningful action?
- What did they do after the email?
- What is the next recommended sequence action?

Suggested sections:

- Profile summary: name, email, user ID, campaign, cohort, batch, variant.
- Sequence state: current touch, next touch, next scheduled send, reply/manual-stop status.
- Reactivation timeline: scheduled, sent, opened, clicked, returned, post-send actions.
- Pre-reactivation signals: last session, last project activity, last chat, last relevant action.
- Post-reactivation activity: sessions, project updates, chat sessions, generated outputs, briefs.
- Admin controls: stop sequence, add note, schedule next email, send now.

## Data Contract Plan

Add shared read-model types for the admin UI:

```ts
type SequenceKind = 'welcome' | 'reactivation';

type SequencePersonRow = {
	id: string;
	sequenceKind: SequenceKind;
	userId: string | null;
	email: string;
	name: string | null;
	status: string;
	currentStepLabel: string;
	nextStepLabel: string | null;
	nextTriggerLabel: string | null;
	nextSendAt: string | null;
	lastSentAt: string | null;
	scheduledFor: string | null;
	sentCount: number;
	openCount: number;
	clickCount: number;
	replyStatus: string | null;
	returnedAt: string | null;
	lastActivityAt: string | null;
	eligibility: SequenceEligibility;
};

type SequenceEligibility = {
	canSend: boolean;
	reason: string;
	nextStepKey: string | null;
};

type SequenceTimelineEvent = {
	id: string;
	type:
		| 'enrolled'
		| 'scheduled'
		| 'sent'
		| 'opened'
		| 'clicked'
		| 'skipped'
		| 'failed'
		| 'returned'
		| 'activity';
	occurredAt: string;
	stepKey: string | null;
	stepLabel: string | null;
	subject: string | null;
	emailId: string | null;
	metadata: Record<string, unknown>;
};
```

Implementation should keep welcome and reactivation mapping separate internally, then normalize into these UI-facing types.

## API Plan

### Welcome read API

Add or extend a server helper used by `/admin/email-sequences/+page.server.ts`:

- Load enrollments for the selected sequence.
- Load related sequence steps.
- Load sequence events by enrollment/user.
- Load related `emails` and `email_tracking_events`.
- Produce `SequencePersonRow[]` and timeline summaries.

This can reuse logic from `apps/web/src/routes/admin/welcome-sequence/+page.server.ts` instead of duplicating the existing stats code.

### Reactivation read API

Add a helper in `apps/web/src/lib/server/retargeting-pilot.service.ts`:

- `getMemberOperationalRows(input)`
- `getMemberTimeline(memberId)`
- `getTriggerPreview(input)`
- `getReactivationActivity(memberId)`

The helper should combine:

- `retargeting_founder_pilot_members`
- `get_retargeting_founder_pilot_member_metrics`
- sent emails where `emails.template_data` contains campaign/cohort/batch/step/member or user identifiers
- `email_recipients`
- `email_tracking_events`
- post-send activity signals

Recommended schema improvement:

- Add `retargeting_founder_pilot_sends` as a queue and audit table, or add separate queued-send state plus per-touch email ID fields to `retargeting_founder_pilot_members`.

Preferred table:

```sql
create table retargeting_founder_pilot_sends (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references retargeting_founder_pilot_members(id),
  campaign_id text not null default 'founder_reactivation_2026',
  cohort_id text not null,
  batch_id text not null,
  email_id uuid references emails(id),
  step text not null,
  variant text,
  status text not null default 'queued',
  trigger_source text not null default 'admin_bulk',
  scheduled_for timestamptz not null,
  queued_by_admin uuid references auth.users(id),
  sent_by_admin uuid references auth.users(id),
  sent_at timestamptz,
  skipped_at timestamptz,
  failed_at timestamptz,
  failure_reason text,
  metadata jsonb not null default '{}'::jsonb
);
```

This creates a durable, queryable record for scheduled, sent, skipped, and failed reactivation emails and avoids relying only on JSON metadata matching.

### Reactivation send API

Add a new endpoint or extend `POST /api/admin/retargeting/send` to support selected-member sequence triggering:

```ts
type SendRetargetingRequest = {
	campaign_id?: string;
	cohort_id: string;
	batch_id: string;
	member_ids: string[];
	trigger_mode: 'send_now' | 'schedule';
	scheduled_for?: string;
	schedule_mode?: 'flow_cadence' | 'custom_minimum';
	step_mode: 'next_for_each_person';
	variant?: string;
	demo_url?: string;
	dry_run?: boolean;
};
```

Add a service method:

```ts
RetargetingPilotService.triggerSelectedMembers(input);
```

Behavior:

- Compute the next touch per selected member.
- If `trigger_mode = 'schedule'`, compute each person's scheduled time from the flow cadence and write queued records.
- If `trigger_mode = 'send_now'`, immediately send the computed next touch and write sent/failed audit records.
- Dry run returns selected, queued/sent candidates, skipped records, computed touch, scheduled time, and reasons.
- Real send writes queued/sent email records and audit rows.
- Response includes per-member status.

Keep the existing batch/touch send behavior for current internal workflows until this new selected-member workflow replaces it.

## Metrics Plan

### Welcome metrics

Expose:

- Enrolled count.
- Active/completed/paused/errored count.
- Sent count by step.
- Open/click/unsubscribe by step.
- Time-to-next-send distribution.
- Error/retry count.

### Reactivation metrics

Expose:

- Eligible count by touch.
- Sent count by touch.
- Open/click count by touch.
- Returned to BuildOS count.
- First post-send action count.
- Active days in 30 days.
- Holdout versus contacted comparison.
- Conversion by cohort, batch, and variant.
- Manually stopped count.

Definitions:

- Opened: `email_tracking_events.event_type = 'opened'`
- Clicked: `email_tracking_events.event_type = 'clicked'`
- Returned: first BuildOS session after first reactivation send
- Re-engaged: first meaningful BuildOS action after first reactivation send

The exact "returned" and "meaningful action" definitions should stay aligned with `get_retargeting_founder_pilot_member_metrics`.

## Implementation Phases

### Phase 1: Read Models and Plan Validation

- Create shared admin sequence row/timeline types.
- Extract reusable welcome row/timeline builder from the existing welcome admin server code.
- Add reactivation operational row builder.
- Add or confirm `retargeting_founder_pilot_sends` queue/audit table.

### Phase 2: Operations UI

- Add sequence operations section to `/admin/email-sequences`.
- Add filters, search, and segmented sequence selector.
- Add person table with checkboxes.
- Add timeline drawer/modal.
- Wire the existing user activity modal into row actions.

### Phase 3: Reactivation Eligibility View

- Add trigger preview endpoint/helper.
- Show inclusion/exclusion reasons.
- Add per-row next-touch labels.
- Add cohort and batch filters.
- Add reactivation-focused activity view.

### Phase 4: Manual Reactivation Send

- Extend send endpoint to accept selected member IDs.
- Compute the next touch per selected member.
- Add schedule/send-now control.
- Implement per-person scheduling from the existing cadence.
- Add dry-run preview.
- Add confirmation modal.
- Add per-member send results.
- Persist queued/sent/skipped/failed audit records.

### Phase 5: Metrics

- Add welcome metrics cards and per-step table.
- Add reactivation metrics cards and per-touch table.
- Add returned/re-engaged metrics using existing activity attribution.
- Add holdout/contacted comparison.

### Phase 6: Verification

- `pnpm --filter @buildos/web check`
- Unit tests for row/timeline builders.
- API tests for selected-member dry runs and sends.
- SQL/RPC migration verification if schema changes are added.
- Browser verification of the admin workflow.

## Risks and Decisions

- Reactivation history needs a stronger send audit model if admins need reliable per-person/per-touch detail.
- Bulk triggering requires conservative guardrails because admins can otherwise email people who were intentionally stopped, held out, already replied, unsubscribed, or bounced.
- Running the welcome sequence for existing old users is out of scope for this workflow.
- Touch 2 has template-specific data requirements, especially `demo_url`.
- Existing tracking depends on open/click tracking events being emitted reliably by the email platform.
- Reply tracking is not part of v1 metrics unless existing `reply_status` data is already present.

## Remaining Questions

No blocking product questions remain for v1. Implementation can proceed with the decisions above.

## Working Checklist

- [x] Confirm bulk action applies only to reactivation.
- [x] Confirm bulk action computes each person's next reactivation email.
- [x] Confirm activity view should be reactivation-focused.
- [x] Confirm remaining product questions.
- [x] Add a reactivation send queue/audit table.
- [x] Build reactivation operational rows and timelines.
- [x] Add operations UI to `/admin/email-sequences`.
- [x] Add selected-member reactivation trigger dry run.
- [x] Add selected-member reactivation scheduling and send-now workflow.
- [x] Add reactivation-focused activity view.
- [x] Add hourly cron processor for queued reactivation sends.
- [x] Verify with `pnpm --filter @buildos/web check`.
- [ ] Build full welcome sequence engagement timelines.
- [ ] Add full metrics panels for welcome and reactivation.
- [ ] Browser-review the authenticated admin workflow with real admin session data.
