-- supabase/migrations/20260425000007_fix_onto_projects_insert_rls_policy_reconciliation.sql
-- Reconcile onto_projects INSERT policies after actor/user compatibility changes.

alter table public.onto_projects enable row level security;

do $$
declare
  v_policy_name text;
begin
  for v_policy_name in
    select policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = 'onto_projects'
      and cmd = 'INSERT'
  loop
    execute format('drop policy if exists %I on public.onto_projects', v_policy_name);
  end loop;
end;
$$;

create policy "project_insert_owner"
  on public.onto_projects
  for insert
  to authenticated
  with check (
    created_by = current_actor_id()
    or created_by = auth.uid()
    or exists (
      select 1
      from public.onto_actors a
      where a.id = created_by
        and a.user_id = auth.uid()
    )
  );

create policy "project_insert_admin"
  on public.onto_projects
  for insert
  to authenticated
  with check (is_admin());
