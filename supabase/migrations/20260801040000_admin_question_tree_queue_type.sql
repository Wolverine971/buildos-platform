-- supabase/migrations/20260801040000_admin_question_tree_queue_type.sql
-- Question Tree admin experiment: dedicated generic-queue label.
-- Keep this enum addition in its own migration because PostgreSQL cannot use a
-- newly-added enum value until the transaction that adds it has committed.

ALTER TYPE public.queue_type
	ADD VALUE IF NOT EXISTS 'admin_question_tree';
