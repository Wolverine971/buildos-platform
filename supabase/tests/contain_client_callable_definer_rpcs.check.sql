-- supabase/tests/contain_client_callable_definer_rpcs.check.sql
-- Assertions for 20260925013000 + 20260925013100 (Tasker 104 / 76). Run with:
--   pnpm db:rehearse supabase/migrations/20260925013000_contain_client_callable_definer_rpcs.sql \
--     supabase/migrations/20260925013100_service_only_billing_sms_rpcs.sql \
--     supabase/migrations/20260925013200_functions_private_by_default.sql \
--     --role-probe --check supabase/tests/contain_client_callable_definer_rpcs.check.sql
DO $$
DECLARE
  f text;
BEGIN
  -- Nobody outside the server may call these.
  FOREACH f IN ARRAY ARRAY[
    'public.get_revenue_metrics()',
    'public.get_admin_top_users(timestamp with time zone, timestamp with time zone, integer)',
    'public.cleanup_security_events(timestamp with time zone, integer, integer, boolean)',
    'public.upsert_email_suppression(text, text, text, text, jsonb)',
    'public.evaluate_user_consumption_gate(uuid, integer, integer)',
    'public.queue_sms_message(uuid, text, text, public.sms_priority, timestamp with time zone, jsonb)',
    'public.get_user_llm_usage(uuid, timestamp with time zone, timestamp with time zone)'
  ] LOOP
    ASSERT NOT has_function_privilege('anon', f, 'EXECUTE'), 'anon can still execute ' || f;
    ASSERT NOT has_function_privilege('authenticated', f, 'EXECUTE'), 'authenticated can still execute ' || f;
    ASSERT has_function_privilege('service_role', f, 'EXECUTE'), 'service_role lost ' || f;
  END LOOP;

  -- Signed-in features keep working; logged-out callers are refused.
  FOREACH f IN ARRAY ARRAY[
    'public.get_project_full(uuid, uuid)',
    'public.onto_task_move_atomic(uuid, uuid, uuid, text)',
    'public.get_user_trial_status(uuid)',
    'public.upsert_legacy_entity_mapping(text, uuid, text, uuid, jsonb)'
  ] LOOP
    ASSERT NOT has_function_privilege('anon', f, 'EXECUTE'), 'anon can still execute ' || f;
    ASSERT has_function_privilege('authenticated', f, 'EXECUTE'), 'authenticated lost ' || f;
  END LOOP;

  -- Deliberately left callable by logged-out visitors.
  FOREACH f IN ARRAY ARRAY[
    'public.is_admin()', 'public.current_actor_id()',
    'public.current_actor_has_project_access(uuid, text)',
    'public.get_project_invite_preview(text)', 'public.log_client_error(jsonb)'
  ] LOOP
    ASSERT has_function_privilege('anon', f, 'EXECUTE'), 'anon lost ' || f;
  END LOOP;
END
$$;

-- Guard: a signed-in user may read only their own trial/subscription status.
SET ROLE authenticated;
SELECT set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"00000000-0000-4000-8000-00000000000a"}', false);
SELECT count(*) FROM public.get_user_trial_status('00000000-0000-4000-8000-00000000000a');
SELECT count(*) FROM public.get_user_subscription_status('00000000-0000-4000-8000-00000000000a');
DO $$
BEGIN
  PERFORM * FROM public.get_user_trial_status('00000000-0000-4000-8000-00000000000b');
  RAISE EXCEPTION 'guard missing: read another user''s trial status';
EXCEPTION WHEN insufficient_privilege THEN NULL;
END
$$;
DO $$
BEGIN
  PERFORM * FROM public.get_user_subscription_status('00000000-0000-4000-8000-00000000000b');
  RAISE EXCEPTION 'guard missing: read another user''s subscription status';
EXCEPTION WHEN insufficient_privilege THEN NULL;
END
$$;
RESET ROLE;

-- Service callers are unrestricted.
SET ROLE service_role;
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', false);
SELECT count(*) FROM public.get_user_trial_status('00000000-0000-4000-8000-00000000000b');
RESET ROLE;

-- 20260925013200: a function created from now on is private until a migration grants it.
SET ROLE postgres;
CREATE FUNCTION public.zz_rehearsal_default_acl_probe() RETURNS int LANGUAGE sql AS $$ SELECT 1 $$;
CREATE FUNCTION private.zz_rehearsal_default_acl_probe() RETURNS int LANGUAGE sql AS $$ SELECT 1 $$;
RESET ROLE;
DO $$
BEGIN
  ASSERT NOT has_function_privilege('anon', 'public.zz_rehearsal_default_acl_probe()', 'EXECUTE'), 'new public fn is anon-executable';
  ASSERT NOT has_function_privilege('authenticated', 'public.zz_rehearsal_default_acl_probe()', 'EXECUTE'), 'new public fn is authenticated-executable';
  ASSERT has_function_privilege('service_role', 'public.zz_rehearsal_default_acl_probe()', 'EXECUTE'), 'new public fn lost service_role';
  ASSERT NOT has_function_privilege('authenticated', 'private.zz_rehearsal_default_acl_probe()', 'EXECUTE'), 'new private fn is PUBLIC-executable';
END
$$;
