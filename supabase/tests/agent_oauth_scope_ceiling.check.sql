-- supabase/tests/agent_oauth_scope_ceiling.check.sql
\set ON_ERROR_STOP on
BEGIN;
CREATE FUNCTION pg_temp.assert_true(value boolean,message text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF NOT coalesce(value,false) THEN RAISE EXCEPTION 'assertion_failed: %',message; END IF; END $$;
CREATE FUNCTION pg_temp.fail_refresh() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN IF current_setting('permission_test.fail_refresh',true)='yes' THEN RAISE EXCEPTION 'forced_refresh_failure'; END IF;RETURN NEW;END $$;
CREATE TRIGGER permission_test_refresh BEFORE INSERT ON public.agent_oauth_refresh_tokens FOR EACH ROW EXECUTE FUNCTION pg_temp.fail_refresh();
DO $$
<<fixture>>
DECLARE uid uuid:=gen_random_uuid(); caller uuid:=gen_random_uuid(); grant_id uuid:=gen_random_uuid(); code_id uuid:=gen_random_uuid(); old_refresh uuid:=gen_random_uuid(); result jsonb; caught boolean;
BEGIN
 INSERT INTO auth.users(id,email) VALUES(uid,'credential-fixture@example.test');
 INSERT INTO public.users(id,email) VALUES(uid,'credential-fixture@example.test') ON CONFLICT DO NOTHING;
 INSERT INTO public.external_agent_callers(id,user_id,provider,caller_key,token_prefix,token_hash) VALUES(caller,uid,'test','oauth-fixture','fixture','oauth-hash');
 INSERT INTO public.agent_oauth_clients(client_id,client_name,redirect_uris) VALUES('fixture-client','Fixture','["https://client.example.test/callback"]');
 INSERT INTO public.agent_oauth_grants(id,user_id,client_id,external_agent_caller_id,resource,scope,scope_mode)
 VALUES(grant_id,uid,'fixture-client',caller,'https://build.example.test/mcp','buildos.read buildos.write offline_access','read_write');
 INSERT INTO public.agent_oauth_authorization_codes(id,code_hash,client_id,user_id,grant_id,external_agent_caller_id,redirect_uri,resource,scope,code_challenge,expires_at)
 VALUES(code_id,'code-hash','fixture-client',uid,grant_id,caller,'https://client.example.test/callback','https://build.example.test/mcp','buildos.read offline_access','proof',now()+interval '5 minutes');
 PERFORM set_config('permission_test.fail_refresh','yes',true);
 caught:=false;BEGIN
  PERFORM public.exchange_agent_oauth_credential('code',code_id,'fixture-client','https://build.example.test/mcp','proof','https://client.example.test/callback',NULL,'{"hash":"access-rollback","prefix":"at"}','{"hash":"refresh-rollback","prefix":"rt"}');
 EXCEPTION WHEN OTHERS THEN caught:=true;END;
 PERFORM pg_temp.assert_true(caught AND NOT EXISTS(SELECT 1 FROM public.agent_oauth_access_tokens WHERE token_hash='access-rollback'),'pair failure rolls back access insert');
 PERFORM pg_temp.assert_true((SELECT used_at IS NULL FROM public.agent_oauth_authorization_codes WHERE id=code_id),'pair failure does not consume code');
 PERFORM set_config('permission_test.fail_refresh','no',true);
 caught:=false;BEGIN PERFORM public.exchange_agent_oauth_credential('code',code_id,'fixture-client','https://build.example.test/mcp','wrong','https://client.example.test/callback',NULL,'{"hash":"wrong-proof","prefix":"at"}',NULL);EXCEPTION WHEN OTHERS THEN caught:=true;END;
 PERFORM pg_temp.assert_true(caught,'PKCE rechecked in transaction');
 caught:=false;BEGIN PERFORM public.exchange_agent_oauth_credential('code',code_id,'fixture-client','https://build.example.test/mcp',NULL,NULL,NULL,'{"hash":"null-proof","prefix":"at"}',NULL);EXCEPTION WHEN OTHERS THEN caught:=true;END;
 PERFORM pg_temp.assert_true(caught,'NULL PKCE and redirect fail closed');
 result:=public.exchange_agent_oauth_credential('code',code_id,'fixture-client','https://build.example.test/mcp','proof','https://client.example.test/callback',NULL,'{"hash":"access-ok","prefix":"at"}','{"hash":"refresh-ok","prefix":"rt"}');
 PERFORM pg_temp.assert_true(result->>'scope'='buildos.read offline_access','stale read code cannot gain later write scope');
 SELECT id INTO old_refresh FROM public.agent_oauth_refresh_tokens WHERE token_hash='refresh-ok';
 UPDATE public.agent_oauth_refresh_tokens SET expires_at=now()-interval '1 second' WHERE id=old_refresh;
 caught:=false;BEGIN PERFORM public.exchange_agent_oauth_credential('refresh',old_refresh,'fixture-client','https://build.example.test/mcp',NULL,NULL,NULL,'{"hash":"expired","prefix":"at"}',NULL);EXCEPTION WHEN OTHERS THEN caught:=true;END;
 PERFORM pg_temp.assert_true(caught AND (SELECT status='trusted' FROM public.external_agent_callers WHERE id=caller),'plain expiry does not revoke family');
 UPDATE public.agent_oauth_refresh_tokens SET expires_at=now()+interval '1 day' WHERE id=old_refresh;
 caught:=false;BEGIN PERFORM public.exchange_agent_oauth_credential('refresh',old_refresh,'fixture-client','https://build.example.test/mcp',NULL,NULL,'buildos.read buildos.write','{"hash":"widened","prefix":"at"}',NULL);EXCEPTION WHEN OTHERS THEN caught:=true;END;
 PERFORM pg_temp.assert_true(caught,'refresh cannot request scope outside original ceiling');
 result:=public.exchange_agent_oauth_credential('refresh',old_refresh,'fixture-client','https://build.example.test/mcp',NULL,NULL,'buildos.read','{"hash":"narrow","prefix":"at"}','{"hash":"no-offline","prefix":"rt"}');
 PERFORM pg_temp.assert_true(result->>'scope'='buildos.read' AND result->>'refresh'='false','narrow refresh honored and offline access dropped');
 -- A consented code cannot pick up an expanded base policy while waiting to exchange.
 UPDATE public.agent_oauth_authorization_codes SET used_at=NULL,policy_snapshot=(SELECT jsonb_build_object('scope_mode',scope_mode,'allowed_ops',allowed_ops,'allowed_project_ids',allowed_project_ids,'project_scope_mode',project_scope_mode) FROM public.agent_oauth_grants WHERE id=fixture.grant_id) WHERE id=code_id;
 UPDATE public.agent_oauth_grants SET scope_mode='read_only' WHERE id=fixture.grant_id;
 caught:=false;BEGIN PERFORM public.exchange_agent_oauth_credential('code',code_id,'fixture-client','https://build.example.test/mcp','proof','https://client.example.test/callback',NULL,'{"hash":"changed-consent","prefix":"at"}',NULL);EXCEPTION WHEN OTHERS THEN caught:=true;END;
 PERFORM pg_temp.assert_true(caught,'changed base consent invalidates old authorization code');
 -- Retained scoped consent is also invalid after a kill-switch epoch change.
 PERFORM public.set_agent_permission_feature(true);
 UPDATE public.agent_oauth_authorization_codes SET policy_snapshot=(SELECT jsonb_build_object('scope_mode',scope_mode,'allowed_ops',allowed_ops,'allowed_project_ids',allowed_project_ids,'project_scope_mode',project_scope_mode,'epoch',(SELECT epoch FROM public.agent_permission_feature)) FROM public.agent_oauth_grants WHERE id=fixture.grant_id) WHERE id=code_id;
 PERFORM public.set_agent_permission_feature(false);
 caught:=false;BEGIN PERFORM public.exchange_agent_oauth_credential('code',code_id,'fixture-client','https://build.example.test/mcp','proof','https://client.example.test/callback',NULL,'{"hash":"killed-consent","prefix":"at"}',NULL);EXCEPTION WHEN OTHERS THEN caught:=true;END;
 PERFORM pg_temp.assert_true(caught,'kill switch invalidates retained consent code');
 UPDATE public.agent_oauth_refresh_tokens SET expires_at=now()-interval '1 second' WHERE id=old_refresh;
 result:=public.exchange_agent_oauth_credential('refresh',old_refresh,'fixture-client','https://build.example.test/mcp',NULL,NULL,NULL,'{"hash":"reuse","prefix":"at"}','{"hash":"reuse-refresh","prefix":"rt"}');
 PERFORM pg_temp.assert_true(result->>'error'='invalid_grant','refresh reuse denied');
 PERFORM pg_temp.assert_true(result->>'reuse_detected'='true','expired used token still commits reuse revocation');
 PERFORM pg_temp.assert_true((SELECT status='revoked' FROM public.external_agent_callers WHERE id=caller),'reuse revokes connection');
 PERFORM pg_temp.assert_true(NOT has_function_privilege('authenticated','public.exchange_agent_oauth_credential(text,uuid,text,text,text,text,text,jsonb,jsonb)','EXECUTE'),'token minting service-only');
END $$;
ROLLBACK;
