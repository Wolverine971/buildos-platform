-- supabase/migrations/20261004192534_agent_oauth_consent_snapshot_precedence.sql
-- Tasker 116: extraction must precede JSON key subtraction. Without parentheses,
-- PostgreSQL tries to subtract the two unknown string literals and raises 42725
-- for every authorization code carrying a consent snapshot. Preserve all checks.
BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE OR REPLACE FUNCTION public.exchange_agent_oauth_credential(
 p_kind text, p_id uuid, p_client text, p_resource text, p_proof text,
 p_redirect text, p_requested_scope text, p_access jsonb, p_refresh jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
 g public.agent_oauth_grants%ROWTYPE; c public.external_agent_callers%ROWTYPE;
 source jsonb; ceiling text[]; scopes text[]; uid uuid; gid uuid; issued_scope text;
BEGIN
 IF p_kind IS NULL OR p_kind NOT IN ('code','refresh') THEN RAISE EXCEPTION 'invalid_grant'; END IF;
 IF p_kind = 'code' THEN
  SELECT to_jsonb(x) INTO source FROM public.agent_oauth_authorization_codes x WHERE id=p_id;
 ELSE
  SELECT to_jsonb(x) INTO source FROM public.agent_oauth_refresh_tokens x WHERE id=p_id;
 END IF;
 IF source IS NULL THEN RAISE EXCEPTION 'invalid_grant'; END IF;
 uid := (source->>'user_id')::uuid; gid := (source->>'grant_id')::uuid;
 PERFORM 1 FROM public.users WHERE id=uid AND deletion_status IS NULL FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'invalid_grant'; END IF;
 SELECT * INTO c FROM public.external_agent_callers WHERE id=(source->>'external_agent_caller_id')::uuid FOR UPDATE;
 SELECT * INTO g FROM public.agent_oauth_grants WHERE id=gid FOR UPDATE;
 PERFORM 1 FROM public.agent_oauth_clients WHERE client_id=p_client AND status='active' FOR SHARE;
 IF NOT FOUND OR c.status<>'trusted' OR g.status<>'active' OR c.user_id<>uid OR g.user_id<>uid
 OR g.external_agent_caller_id<>c.id OR g.client_id<>p_client OR g.resource<>p_resource THEN
  RAISE EXCEPTION 'invalid_grant';
 END IF;
 IF p_kind='code' THEN
  SELECT to_jsonb(x) INTO source FROM public.agent_oauth_authorization_codes x WHERE id=p_id FOR UPDATE;
 ELSE
  SELECT to_jsonb(x) INTO source FROM public.agent_oauth_refresh_tokens x WHERE id=p_id FOR UPDATE;
 END IF;
 IF source->>'client_id' IS DISTINCT FROM p_client OR source->>'resource' IS DISTINCT FROM p_resource THEN RAISE EXCEPTION 'invalid_grant'; END IF;
 IF source->>'used_at' IS NOT NULL OR source->>'revoked_at' IS NOT NULL THEN
  IF p_kind='refresh' THEN
   UPDATE public.agent_oauth_refresh_tokens SET revoked_at=now() WHERE family_id=(source->>'family_id')::uuid;
   UPDATE public.agent_oauth_access_tokens SET revoked_at=now() WHERE grant_id=gid;
   UPDATE public.agent_oauth_grants SET status='revoked' WHERE id=gid;
   UPDATE public.external_agent_callers SET status='revoked' WHERE id=c.id;
   RETURN jsonb_build_object('error','invalid_grant','reuse_detected',true); -- commit fail-closed reuse revocation
  END IF;
  RAISE EXCEPTION 'invalid_grant';
 END IF;
 IF (source->>'expires_at')::timestamptz<=now() THEN RAISE EXCEPTION 'invalid_grant'; END IF;
 IF p_kind='code' AND (source->>'code_challenge' IS DISTINCT FROM p_proof OR source->>'redirect_uri' IS DISTINCT FROM p_redirect)
 THEN RAISE EXCEPTION 'invalid_grant'; END IF;
 IF p_kind='code' AND source->'policy_snapshot' IS NOT NULL AND source->'policy_snapshot'<>'null' THEN
  IF ((source->'policy_snapshot') - 'epoch'::text) IS DISTINCT FROM jsonb_build_object('scope_mode',g.scope_mode,'allowed_ops',g.allowed_ops,'allowed_project_ids',g.allowed_project_ids,'project_scope_mode',g.project_scope_mode)
  THEN RAISE EXCEPTION 'invalid_grant: consent changed'; END IF;
  IF source->'policy_snapshot'?'epoch' THEN
   -- Feature table is installed by the subsequent feature migration. Dynamic lookup
   -- keeps the credential-hardening migration independently deployable.
   DECLARE valid_epoch boolean; BEGIN
    EXECUTE 'SELECT EXISTS(SELECT 1 FROM public.agent_permission_feature WHERE enabled AND epoch=$1)' INTO valid_epoch USING (source->'policy_snapshot'->>'epoch')::bigint;
    IF NOT valid_epoch THEN RAISE EXCEPTION 'invalid_grant: consent invalidated'; END IF;
   END;
  END IF;
 END IF;
 ceiling := regexp_split_to_array(source->>'scope','\s+');
 IF p_requested_scope IS NOT NULL AND NOT regexp_split_to_array(p_requested_scope,'\s+') <@ ceiling
 THEN RAISE EXCEPTION 'invalid_scope'; END IF;
 SELECT array_agg(s ORDER BY s) INTO scopes FROM unnest(ceiling) s
 WHERE s=ANY(regexp_split_to_array(g.scope,'\s+'))
 AND (p_requested_scope IS NULL OR s=ANY(regexp_split_to_array(p_requested_scope,'\s+')));
 IF NOT 'buildos.read'=ANY(coalesce(scopes,'{}')) THEN RAISE EXCEPTION 'invalid_scope'; END IF;
 issued_scope := array_to_string(scopes,' ');
 INSERT INTO public.agent_oauth_access_tokens(grant_id,client_id,user_id,external_agent_caller_id,token_hash,token_prefix,resource,scope,expires_at)
 VALUES(g.id,p_client,uid,c.id,p_access->>'hash',p_access->>'prefix',g.resource,issued_scope,now()+interval '1 hour');
 IF p_refresh IS NOT NULL AND 'offline_access'=ANY(scopes) THEN
  INSERT INTO public.agent_oauth_refresh_tokens(grant_id,client_id,user_id,external_agent_caller_id,token_hash,token_prefix,resource,scope,expires_at,family_id,rotated_from_id)
  VALUES(g.id,p_client,uid,c.id,p_refresh->>'hash',p_refresh->>'prefix',g.resource,issued_scope,now()+interval '90 days',
   CASE WHEN p_kind='refresh' THEN (source->>'family_id')::uuid ELSE gen_random_uuid() END,
   CASE WHEN p_kind='refresh' THEN p_id ELSE NULL END);
 END IF;
 IF p_kind='code' THEN UPDATE public.agent_oauth_authorization_codes SET used_at=now() WHERE id=p_id;
 ELSE UPDATE public.agent_oauth_refresh_tokens SET used_at=now(),revoked_at=now() WHERE id=p_id; END IF;
 RETURN jsonb_build_object('scope',issued_scope,'refresh',p_refresh IS NOT NULL AND 'offline_access'=ANY(scopes));
END $$;
REVOKE ALL ON FUNCTION public.exchange_agent_oauth_credential(text,uuid,text,text,text,text,text,jsonb,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.exchange_agent_oauth_credential(text,uuid,text,text,text,text,text,jsonb,jsonb) TO service_role;

COMMIT;
