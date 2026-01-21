-- supabase/migrations/20260419_allow_nullable_milestone_due_at.sql
-- Allow milestones to be created without a due date
alter table onto_milestones alter column due_at drop not null;
