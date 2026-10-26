-- supabase/tests/email_campaign_daily_cap.check.sql
-- DISPOSABLE DATABASE ONLY. Current schema + synthetic campaign queue, no email transport.
\set ON_ERROR_STOP on
ALTER ROLE service_role BYPASSRLS;
BEGIN;
CREATE FUNCTION pg_temp.assert_true(value boolean, message text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF NOT coalesce(value, false) THEN RAISE EXCEPTION 'assertion_failed: %', message; END IF; END $$;
GRANT EXECUTE ON FUNCTION pg_temp.assert_true(boolean, text) TO service_role;

SELECT pg_temp.assert_true(
 NOT has_function_privilege('anon', 'public.claim_email_campaign_sends(integer,integer,integer)', 'EXECUTE')
 AND NOT has_function_privilege('authenticated', 'public.claim_email_campaign_sends(integer,integer,integer)', 'EXECUTE')
 AND NOT has_function_privilege('authenticated', 'public.get_email_campaign_daily_allowance(integer)', 'EXECUTE')
 AND NOT has_table_privilege('authenticated', 'private.email_campaign_send_reservations', 'SELECT'),
 'clients cannot claim or inspect the server budget');

INSERT INTO public.email_campaigns(id, name, status) VALUES
 ('c1000000-0000-4000-8000-000000000001', 'Budget A', 'sending'),
 ('c1000000-0000-4000-8000-000000000002', 'Budget B', 'sending'),
 ('c1000000-0000-4000-8000-000000000003', 'Paused', 'paused');
INSERT INTO public.email_campaign_recipients(id, campaign_id, email, status, scheduled_for, included) VALUES
 ('c2000000-0000-4000-8000-000000000001','c1000000-0000-4000-8000-000000000001','a@example.test','queued',now()-interval '1 hour',true),
 ('c2000000-0000-4000-8000-000000000002','c1000000-0000-4000-8000-000000000002','b@example.test','queued',now()-interval '1 minute',true),
 ('c2000000-0000-4000-8000-000000000003','c1000000-0000-4000-8000-000000000003','paused@example.test','queued',now()-interval '1 day',true),
 ('c2000000-0000-4000-8000-000000000004','c1000000-0000-4000-8000-000000000001','excluded@example.test','queued',now()-interval '1 day',false),
 ('c2000000-0000-4000-8000-000000000005','c1000000-0000-4000-8000-000000000001','future@example.test','queued',now()+interval '1 day',true);

SET LOCAL ROLE service_role;
SELECT pg_temp.assert_true((SELECT count(*)=0 FROM public.claim_email_campaign_sends(20,120,0)), 'zero cap claims nothing');
SELECT pg_temp.assert_true((SELECT count(*)=0 FROM public.claim_email_campaign_sends(20,120,NULL)), 'null cap fails closed');
SELECT pg_temp.assert_true((SELECT count(*)=1 FROM public.claim_email_campaign_sends(20,1,1)), 'batch cannot exceed budget');
SELECT pg_temp.assert_true((SELECT status='sending' AND attempt_count=1 AND lease_expires_at>=now()+interval '30 seconds'
 FROM public.email_campaign_recipients WHERE email='a@example.test'), 'due included recipient claimed with minimum lease');
SELECT pg_temp.assert_true((SELECT count(*)=0 FROM public.claim_email_campaign_sends(20,120,1)), 'in-flight claim consumes shared budget');
UPDATE public.email_campaign_recipients SET status='queued', lease_expires_at=NULL WHERE email='a@example.test';
SELECT pg_temp.assert_true(public.get_email_campaign_daily_allowance(1)=1, 'pre-send release restores allowance');
SELECT pg_temp.assert_true((SELECT count(*)=1 FROM public.claim_email_campaign_sends(20,120,1)), 'released row can be claimed again');
UPDATE public.email_campaign_recipients SET status='skipped', lease_expires_at=NULL WHERE email='a@example.test';
SELECT pg_temp.assert_true(public.get_email_campaign_daily_allowance(1)=1, 'suppression skip restores allowance');
SELECT pg_temp.assert_true((SELECT count(*)=1 FROM public.claim_email_campaign_sends(20,120,1)), 'other campaign shares released allowance');
UPDATE public.email_campaign_recipients SET lease_expires_at=now()-interval '1 minute' WHERE email='b@example.test';
SELECT pg_temp.assert_true((SELECT count(*)=0 FROM public.claim_email_campaign_sends(20,120,2)), 'expired lease is never automatically re-claimed');
UPDATE public.email_campaign_recipients SET status='failed', lease_expires_at=NULL WHERE email='b@example.test';
SELECT pg_temp.assert_true(public.get_email_campaign_daily_allowance(1)=0, 'uncertain failure stays counted');
UPDATE public.email_campaign_recipients SET status='queued' WHERE email='b@example.test';
SELECT pg_temp.assert_true((SELECT count(*)=0 FROM public.claim_email_campaign_sends(20,120,1)), 'manual retry cannot erase previous uncertainty');
SELECT pg_temp.assert_true((SELECT count(*)=1 FROM public.claim_email_campaign_sends(20,120,2)), 'retry requires another allowance');
UPDATE public.email_campaign_recipients SET status='sent', sent_at=now(), lease_expires_at=NULL WHERE email='b@example.test';
SELECT pg_temp.assert_true(public.get_email_campaign_daily_allowance(2)=0, 'both attempts count');
RESET ROLE;
-- Completion, not initial claim time, determines when a confirmed send ages out.
UPDATE private.email_campaign_send_reservations SET reserved_at=now()-interval '25 hours';
SET LOCAL ROLE service_role;
SELECT pg_temp.assert_true(public.get_email_campaign_daily_allowance(2)=1, 'old uncertain attempt expires but recent send stays counted');
DELETE FROM public.email_campaign_recipients WHERE email='b@example.test';
SELECT pg_temp.assert_true(public.get_email_campaign_daily_allowance(2)=1, 'deleting a person cannot reset the budget');
RESET ROLE;
SELECT pg_temp.assert_true(NOT EXISTS(SELECT 1 FROM private.email_campaign_send_reservations WHERE recipient_id IS NOT NULL), 'deletion removes all recipient references');
ROLLBACK;
