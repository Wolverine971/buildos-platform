-- supabase/migrations/20260718010000_inbox_items_deferred_status.sql
-- tasker/28 WP-4: per-project attention budget for the AI Inbox.
-- 'deferred' marks an admissible item held back because the project already has
-- its budget of pending attention items. Deferred rows are hidden from the
-- default inbox surface and promoted back to 'pending' as slots free up.

ALTER TABLE public.inbox_items
	DROP CONSTRAINT IF EXISTS inbox_items_status_check;

ALTER TABLE public.inbox_items
	ADD CONSTRAINT inbox_items_status_check
	CHECK (status IN ('pending', 'deciding', 'decided', 'blocked', 'expired', 'snoozed', 'deferred'));
