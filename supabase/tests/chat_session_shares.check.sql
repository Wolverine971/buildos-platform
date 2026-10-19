-- Synthetic local fixtures only, rolled back before all standing checks.
\set ON_ERROR_STOP on
BEGIN;
INSERT INTO auth.users(id,email) VALUES ('ae100000-0000-4000-8000-000000000001','share-fixture@example.com');
INSERT INTO public.users(id,email) VALUES ('ae100000-0000-4000-8000-000000000001','share-fixture@example.com') ON CONFLICT DO NOTHING;
INSERT INTO public.chat_sessions(id,user_id,context_type,status) VALUES
 ('ae200000-0000-4000-8000-000000000001','ae100000-0000-4000-8000-000000000001','global','active');
INSERT INTO public.chat_session_shares(token,session_id,user_id,title,included_message_ids,snapshot,policy_version) VALUES
 ('AAAAAAAAAAAAAAAAAAAAAA','ae200000-0000-4000-8000-000000000001','ae100000-0000-4000-8000-000000000001','Fixture',ARRAY['ae300000-0000-4000-8000-000000000001'::uuid],'{"version":1,"messages":[]}','chat_share_v1');
DO $$ BEGIN
 IF has_table_privilege('anon','public.chat_session_shares','SELECT') OR has_table_privilege('authenticated','public.chat_session_shares','INSERT,UPDATE,DELETE') THEN RAISE EXCEPTION 'share grants expose content/writes'; END IF;
 BEGIN
  INSERT INTO public.chat_session_shares(token,session_id,user_id,title,included_message_ids,snapshot,policy_version)
  SELECT 'BBBBBBBBBBBBBBBBBBBBBB',session_id,user_id,title,included_message_ids,snapshot,policy_version FROM public.chat_session_shares;
  RAISE EXCEPTION 'multiple live shares allowed';
 EXCEPTION WHEN unique_violation THEN NULL; END;
END $$;
SELECT set_config('request.jwt.claim.sub','ae100000-0000-4000-8000-000000000001',true);
SET LOCAL ROLE authenticated;
DO $$ BEGIN IF (SELECT count(*) FROM public.chat_session_shares) <> 1 THEN RAISE EXCEPTION 'owner cannot read own share'; END IF; END $$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','ae100000-0000-4000-8000-000000000002',true);
SET LOCAL ROLE authenticated;
DO $$ BEGIN IF EXISTS(SELECT 1 FROM public.chat_session_shares) THEN RAISE EXCEPTION 'foreign owner sees share'; END IF; END $$;
RESET ROLE;
UPDATE public.chat_session_shares SET revoked_at=now();
INSERT INTO public.chat_session_shares(token,session_id,user_id,title,included_message_ids,snapshot,policy_version)
 SELECT 'BBBBBBBBBBBBBBBBBBBBBB',session_id,user_id,title,included_message_ids,snapshot,policy_version FROM public.chat_session_shares;
DO $$ BEGIN IF (SELECT count(*) FROM public.chat_session_shares WHERE revoked_at IS NULL) <> 1 THEN RAISE EXCEPTION 'reshare failed'; END IF; END $$;
DELETE FROM public.chat_sessions WHERE id='ae200000-0000-4000-8000-000000000001';
DO $$ BEGIN IF EXISTS(SELECT 1 FROM public.chat_session_shares) THEN RAISE EXCEPTION 'session delete did not cascade'; END IF; END $$;
ROLLBACK;
