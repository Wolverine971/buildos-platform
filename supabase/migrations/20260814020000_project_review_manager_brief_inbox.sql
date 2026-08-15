-- supabase/migrations/20260814020000_project_review_manager_brief_inbox.sql
-- Admit the post-generator Project Review manager brief as one AI Inbox item.
-- Underlying project_suggestions remain source history and execution objects;
-- their standalone inbox rows are retired only when a v2 manager brief exists.

BEGIN;
ALTER TABLE public.inbox_items
	DROP CONSTRAINT IF EXISTS inbox_items_source_type_check;
ALTER TABLE public.inbox_items
	ADD CONSTRAINT inbox_items_source_type_check
	CHECK (
		source_type IN (
			'agent_run',
			'project_suggestion',
			'project_review',
			'project_audit',
			'calendar_suggestion',
			'profile_fragment',
			'contact_merge_candidate',
			'integration_attention'
		)
	);
-- Complete Project Audit owns one packet. Retire any legacy standalone child
-- rows so a full-repair read can safely backfill the ready parent packet.
UPDATE public.inbox_items AS item
SET
	status = 'expired',
	source_status = 'grouped_into_project_audit',
	decided_at = COALESCE(item.decided_at, now()),
	snoozed_until = NULL,
	blocked_reason = COALESCE(
		item.blocked_reason,
		'Grouped into the complete project audit inbox packet'
	)
FROM public.project_audit_suggestions AS link
WHERE item.source_type = 'project_suggestion'
	AND item.source_ref_id = link.suggestion_id
	AND item.status IN ('pending', 'deciding', 'snoozed', 'blocked', 'deferred');
-- This is intentionally narrow: historical v1 run briefs do not qualify.
UPDATE public.inbox_items AS item
SET
	status = 'expired',
	source_status = 'grouped_into_project_review',
	decided_at = COALESCE(item.decided_at, now()),
	snoozed_until = NULL,
	blocked_reason = COALESCE(item.blocked_reason, 'Grouped into the project manager brief')
FROM public.project_suggestions AS suggestion
JOIN public.project_loop_runs AS run ON run.id = suggestion.run_id
WHERE item.source_type = 'project_suggestion'
	AND item.source_ref_id = suggestion.id
	AND run.status = 'waiting_review'
	AND run.brief->>'version' = '2'
	AND run.brief->>'attention_level' IN ('decision', 'urgent')
	AND item.status IN ('pending', 'deciding', 'snoozed', 'blocked', 'deferred');
COMMIT;
