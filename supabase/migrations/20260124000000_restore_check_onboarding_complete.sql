-- supabase/migrations/20260124000000_restore_check_onboarding_complete.sql
-- Restore check_onboarding_complete helper
-- Context: trigger update_user_onboarding_status depends on this function and
-- requests started failing after it was dropped in cleanup (see 20260112000000_cleanup_unused_rpc_functions.sql).
-- The function returns true when the user has either explicitly completed onboarding
-- (onboarding_completed_at set) or has provided all four onboarding inputs.

create or replace function public.check_onboarding_complete(p_user_id uuid)
returns boolean
language sql
stable
as $$
select coalesce(
  (
    select
      coalesce(onboarding_completed_at is not null, false)
      or (
        coalesce(nullif(trim(input_projects), ''), '') <> '' and
        coalesce(nullif(trim(input_work_style), ''), '') <> '' and
        coalesce(nullif(trim(input_challenges), ''), '') <> '' and
        coalesce(nullif(trim(input_help_focus), ''), '') <> ''
      )
    from public.user_context
    where user_id = p_user_id
  ),
  false
);
$$;

comment on function public.check_onboarding_complete(uuid) is
  'Returns true when a user''s onboarding is complete based on explicit completion timestamp or all four onboarding inputs.';
