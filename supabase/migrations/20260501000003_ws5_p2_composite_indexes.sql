-- supabase/migrations/20260501000003_ws5_p2_composite_indexes.sql
-- WS5 — Schema hygiene phase 1: add the four P2 composite indexes called out in
-- §4.2 of WEB_APP_PERFORMANCE_AUDIT_2026-04-17.md. All additive
-- (`CREATE INDEX IF NOT EXISTS`); zero behavior change.
--
-- 1) project_notification_batches: speeds up the active-batch lookups in
--    `20260424000000` RPCs. Partial index keeps it tight (most rows are
--    flushed quickly).
CREATE INDEX IF NOT EXISTS idx_project_notification_batches_active_lookup
	ON public.project_notification_batches (recipient_user_id, project_id)
	WHERE status IN ('pending', 'processing');

-- 2) onto_braindumps: list endpoints (`api/onto/braindumps`,
--    `routes/history`) filter by user + status and order by created_at desc.
--    Note: this table has no `deleted_at` column (no soft-delete pattern), so
--    no partial-index predicate. Audit text suggested one — incorrect.
CREATE INDEX IF NOT EXISTS idx_onto_braindumps_user_status_created
	ON public.onto_braindumps (user_id, status, created_at DESC);

-- 3) voice_note_groups: list endpoint orders by user + created_at desc.
CREATE INDEX IF NOT EXISTS idx_voice_note_groups_user_created_active
	ON public.voice_note_groups (user_id, created_at DESC)
	WHERE deleted_at IS NULL;

-- 4) billing_accounts: monitoring counts in
--    `apps/web/src/lib/server/billing-ops-monitoring.ts` filter by
--    billing_tier + billing_state and sort by created_at desc.
--    NOTE: column is `billing_state`, not `account_state` (audit text typo).
CREATE INDEX IF NOT EXISTS idx_billing_accounts_tier_state_created
	ON public.billing_accounts (billing_tier, billing_state, created_at DESC);
