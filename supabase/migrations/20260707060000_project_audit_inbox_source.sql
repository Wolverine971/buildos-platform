-- supabase/migrations/20260707060000_project_audit_inbox_source.sql
-- Surface complete project audits as one AI Inbox packet instead of one inbox
-- item per child project_suggestion.

ALTER TABLE IF EXISTS public.inbox_items
	DROP CONSTRAINT IF EXISTS inbox_items_source_type_check;

ALTER TABLE IF EXISTS public.inbox_items
	ADD CONSTRAINT inbox_items_source_type_check
	CHECK (
		source_type IN (
			'agent_run',
			'project_suggestion',
			'project_audit',
			'calendar_suggestion',
			'profile_fragment',
			'contact_merge_candidate'
		)
	);

-- Existing complete-audit child suggestions may already have standalone inbox
-- rows from earlier workers. Keep decided history intact, but remove active
-- child rows from the review queue now that the parent audit packet owns the
-- holistic review surface.
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
	AND item.status IN ('pending', 'deciding', 'snoozed', 'blocked');
