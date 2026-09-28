-- supabase/migrations/20260927000000_steward_profile_context_invalidation.sql
--
-- Project stewards beta (tasker/110-project-steward-beta.md).
-- A user's steward switch and approved charter live in
-- user_project_behavioral_profiles, and project chat context includes them.
-- Give that table the same statement-level invalidation triggers as the other
-- project tables (20260830213000_agentic_chat_prepared_admission_hardening),
-- so approving or toggling applies from the next message without writing a
-- project change-log row. That row counted as a major project change: it woke
-- paid audits and briefs and notified collaborators.
--
-- The trigger function already exists, is SECURITY DEFINER, and is revoked
-- from client roles; this migration only attaches it. No new callable surface.

drop trigger if exists trg_agentic_chat_context_invalidation_ins
	on public.user_project_behavioral_profiles;
drop trigger if exists trg_agentic_chat_context_invalidation_upd
	on public.user_project_behavioral_profiles;
drop trigger if exists trg_agentic_chat_context_invalidation_del
	on public.user_project_behavioral_profiles;

create trigger trg_agentic_chat_context_invalidation_ins
	after insert on public.user_project_behavioral_profiles
	referencing new table as new_rows
	for each statement execute function private.trigger_agentic_chat_project_scope_stmt();

create trigger trg_agentic_chat_context_invalidation_upd
	after update on public.user_project_behavioral_profiles
	referencing old table as old_rows new table as new_rows
	for each statement execute function private.trigger_agentic_chat_project_scope_stmt();

create trigger trg_agentic_chat_context_invalidation_del
	after delete on public.user_project_behavioral_profiles
	referencing old table as old_rows
	for each statement execute function private.trigger_agentic_chat_project_scope_stmt();
