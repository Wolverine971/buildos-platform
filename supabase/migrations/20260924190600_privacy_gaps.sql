-- supabase/migrations/20260924190600_privacy_gaps.sql
-- Tasker 103 (GAPS): the last places BuildOS kept more than /privacy says.
--
--   1. Notifications get a window (cleanup_privacy_notifications, 90 days):
--      notification_events and notification_deliveries 90 days after they were
--      created; user_notifications (the in-app inbox) 90 days after created,
--      once read or dismissed. An item the person never opened or dismissed
--      stays in their inbox until they do.
--   2. Stripe webhook payloads, which carry the customer email and have no
--      user_id, are deleted 90 days after they arrive
--      (cleanup_privacy_webhook_events). Stripe stops retrying after 3 days, so
--      the event_id dedupe in stripe-service.ts never needs an older row.
--   3. Brain dumps can be deleted. onto_braindumps gets deleted_at; the
--      owner-only delete_my_braindump() RPC backs DELETE /api/onto/braindumps/[id];
--      the History RPC hides deleted rows; cleanup_privacy_soft_deleted_braindumps
--      erases them 30 days after deletion, like every other soft delete
--      (20260924190400_purge_soft_deleted_items.sql).
--
-- Run by the worker's daily privacy retention job
-- (apps/worker/src/scheduler/privacyRetention.ts). Applying this migration adds
-- one nullable column and an index, replaces get_history_page_v1 with the same
-- signature, and changes no row. The job deletes.

BEGIN;

-- ---------------------------------------------------------------------------
-- Notifications
-- ---------------------------------------------------------------------------

-- The delete rules of several keys that point at deliveries and events exist
-- only in production (notification_logs, sms_messages,
-- notification_tracking_links, notification_deliveries.event_id). Each batch
-- detaches those references first, so the delete succeeds under any rule and a
-- CASCADE never takes an SMS row with it. Short links (delivery_id NOT NULL)
-- go with their delivery; an older link then redirects to the home page.
CREATE OR REPLACE FUNCTION public.cleanup_privacy_notifications(
	p_batch_size integer DEFAULT 500
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
	v_batch integer := LEAST(GREATEST(COALESCE(p_batch_size, 500), 1), 5000);
	v_cutoff timestamptz := clock_timestamp() - interval '90 days';
	v_inbox integer := 0;
	v_delivery_ids uuid[];
	v_links integer := 0;
	v_deliveries integer := 0;
	v_event_ids uuid[];
	v_events integer := 0;
BEGIN
	WITH candidates AS (
		SELECT inbox.id
		FROM public.user_notifications inbox
		WHERE inbox.created_at <= v_cutoff
			AND (inbox.read_at IS NOT NULL OR inbox.dismissed_at IS NOT NULL)
		LIMIT v_batch
		FOR UPDATE SKIP LOCKED
	)
	DELETE FROM public.user_notifications inbox
	USING candidates
	WHERE inbox.id = candidates.id;
	GET DIAGNOSTICS v_inbox = ROW_COUNT;

	SELECT array_agg(candidates.id)
	INTO v_delivery_ids
	FROM (
		SELECT deliveries.id
		FROM public.notification_deliveries deliveries
		WHERE deliveries.created_at <= v_cutoff
		LIMIT v_batch
		FOR UPDATE SKIP LOCKED
	) candidates;

	IF v_delivery_ids IS NOT NULL THEN
		UPDATE public.notification_logs
		SET notification_delivery_id = NULL
		WHERE notification_delivery_id = ANY (v_delivery_ids);
		UPDATE public.sms_messages
		SET notification_delivery_id = NULL
		WHERE notification_delivery_id = ANY (v_delivery_ids);
		UPDATE public.user_notifications
		SET delivery_id = NULL
		WHERE delivery_id = ANY (v_delivery_ids);
		DELETE FROM public.notification_tracking_links
		WHERE delivery_id = ANY (v_delivery_ids);
		GET DIAGNOSTICS v_links = ROW_COUNT;
		DELETE FROM public.notification_deliveries
		WHERE id = ANY (v_delivery_ids);
		GET DIAGNOSTICS v_deliveries = ROW_COUNT;
	END IF;

	-- An event waits until no delivery points at it (deliveries are never older
	-- than their event, so it goes within a run or two of its last delivery).
	SELECT array_agg(candidates.id)
	INTO v_event_ids
	FROM (
		SELECT events.id
		FROM public.notification_events events
		WHERE events.created_at <= v_cutoff
			AND NOT EXISTS (
				SELECT 1
				FROM public.notification_deliveries deliveries
				WHERE deliveries.event_id = events.id
			)
		LIMIT v_batch
		FOR UPDATE SKIP LOCKED
	) candidates;

	IF v_event_ids IS NOT NULL THEN
		UPDATE public.notification_logs
		SET notification_event_id = NULL
		WHERE notification_event_id = ANY (v_event_ids);
		UPDATE public.user_notifications
		SET event_id = NULL
		WHERE event_id = ANY (v_event_ids);
		UPDATE public.project_notification_batches
		SET flushed_event_id = NULL
		WHERE flushed_event_id = ANY (v_event_ids);
		DELETE FROM public.notification_events
		WHERE id = ANY (v_event_ids);
		GET DIAGNOSTICS v_events = ROW_COUNT;
	END IF;

	RETURN jsonb_build_object(
		'user_notifications_deleted', v_inbox,
		'notification_deliveries_deleted', v_deliveries,
		'notification_tracking_links_deleted', v_links,
		'notification_events_deleted', v_events
	);
END;
$function$;

-- ---------------------------------------------------------------------------
-- Stripe webhook payloads
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.cleanup_privacy_webhook_events(
	p_batch_size integer DEFAULT 500
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
	v_batch integer := LEAST(GREATEST(COALESCE(p_batch_size, 500), 1), 5000);
	v_deleted integer := 0;
BEGIN
	WITH candidates AS (
		SELECT events.id
		FROM public.webhook_events events
		WHERE COALESCE(events.created_at, events.processed_at)
			<= clock_timestamp() - interval '90 days'
		LIMIT v_batch
		FOR UPDATE SKIP LOCKED
	)
	DELETE FROM public.webhook_events events
	USING candidates
	WHERE events.id = candidates.id;
	GET DIAGNOSTICS v_deleted = ROW_COUNT;

	RETURN jsonb_build_object('webhook_events_deleted', v_deleted);
END;
$function$;

-- ---------------------------------------------------------------------------
-- Brain dumps: delete, hide, purge
-- ---------------------------------------------------------------------------

ALTER TABLE public.onto_braindumps
	ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_onto_braindumps_deleted_at
	ON public.onto_braindumps (deleted_at)
	WHERE deleted_at IS NOT NULL;

-- Owner-only soft delete. SECURITY DEFINER so it does not depend on an UPDATE
-- policy for onto_braindumps (its owner policies predate the migration history).
CREATE OR REPLACE FUNCTION public.delete_my_braindump(p_braindump_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
	v_user_id uuid := auth.uid();
BEGIN
	IF v_user_id IS NULL THEN
		RAISE EXCEPTION 'braindump_delete_requires_user' USING ERRCODE = '42501';
	END IF;

	UPDATE public.onto_braindumps
	SET deleted_at = now(),
		updated_at = now()
	WHERE id = p_braindump_id
		AND user_id = v_user_id
		AND deleted_at IS NULL;

	IF NOT FOUND THEN
		RAISE EXCEPTION 'braindump_not_found' USING ERRCODE = 'P0002';
	END IF;

	RETURN jsonb_build_object('deleted', true);
END;
$function$;

REVOKE ALL ON FUNCTION public.delete_my_braindump(uuid) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.delete_my_braindump(uuid) TO authenticated;

-- Named apart from the cleanup_privacy_deleted_* family, whose tests pin that
-- family to 20260924190400. Same window and meaning.
CREATE OR REPLACE FUNCTION public.cleanup_privacy_soft_deleted_braindumps(
	p_batch_size integer DEFAULT 500
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
	v_batch integer := LEAST(GREATEST(COALESCE(p_batch_size, 500), 1), 5000);
	v_deleted integer := 0;
BEGIN
	WITH candidates AS (
		SELECT dumps.id
		FROM public.onto_braindumps dumps
		WHERE dumps.deleted_at <= clock_timestamp() - interval '30 days'
		LIMIT v_batch
		FOR UPDATE SKIP LOCKED
	)
	DELETE FROM public.onto_braindumps dumps
	USING candidates
	WHERE dumps.id = candidates.id;
	GET DIAGNOSTICS v_deleted = ROW_COUNT;

	RETURN jsonb_build_object('onto_braindumps_deleted', v_deleted);
END;
$function$;

-- History: 20260707020000's definition with deleted brain dumps left out of the
-- page, the selected row, and the counts.
CREATE OR REPLACE FUNCTION public.get_history_page_v1(
	p_user_id uuid,
	p_type_filter text DEFAULT 'all',
	p_status text DEFAULT NULL,
	p_search text DEFAULT NULL,
	p_limit integer DEFAULT 50,
	p_offset integer DEFAULT 0,
	p_selected_id uuid DEFAULT NULL,
	p_selected_type text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $function$
	WITH params AS (
		SELECT
			p_user_id AS user_id,
			CASE
				WHEN p_type_filter IN ('all', 'braindumps', 'chats') THEN p_type_filter
				ELSE 'all'
			END AS type_filter,
			CASE
				WHEN NULLIF(BTRIM(p_status), '') IN ('pending', 'processing', 'processed', 'failed')
					THEN NULLIF(BTRIM(p_status), '')
				ELSE NULL
			END AS status_filter,
			CASE
				WHEN NULLIF(BTRIM(p_status), '') IN ('pending', 'processing', 'processed', 'failed')
					THEN NULLIF(BTRIM(p_status), '')::public.onto_braindump_status
				ELSE NULL
			END AS braindump_status_filter,
			CASE
				WHEN LENGTH(NULLIF(BTRIM(p_search), '')) >= 3 THEN NULLIF(BTRIM(p_search), '')
				ELSE NULL
			END AS search_filter,
			LEAST(GREATEST(COALESCE(p_limit, 50), 1), 100) AS page_limit,
			GREATEST(COALESCE(p_offset, 0), 0) AS page_offset,
			p_selected_id AS selected_id,
			CASE
				WHEN p_selected_type IN ('braindump', 'chat_session') THEN p_selected_type
				ELSE NULL
			END AS selected_type
	),
	braindumps AS (
		SELECT
			b.id,
			'braindump'::text AS item_type,
			b.created_at AS sort_created_at,
			jsonb_build_object(
				'id', b.id,
				'content',
					CASE
						WHEN LENGTH(COALESCE(b.content, '')) > 240 THEN LEFT(b.content, 240) || '...'
						ELSE COALESCE(b.content, '')
					END,
				'title', b.title,
				'topics', COALESCE(to_jsonb(b.topics), '[]'::jsonb),
				'summary', b.summary,
				'status', b.status,
				'chat_session_id', b.chat_session_id,
				'metadata', b.metadata,
				'processed_at', b.processed_at,
				'error_message', b.error_message,
				'created_at', b.created_at,
				'updated_at', b.updated_at
			) AS row_data
		FROM public.onto_braindumps b
		CROSS JOIN params p
		WHERE p.type_filter IN ('all', 'braindumps')
			AND b.user_id = p.user_id
			AND auth.uid() = p.user_id
			AND b.deleted_at IS NULL
			AND (
				p.status_filter IS NULL
				OR (
					p.braindump_status_filter IS NOT NULL
					AND b.status = p.braindump_status_filter
				)
			)
			AND (
				p.search_filter IS NULL
				OR (
					COALESCE(b.title, '') || ' ' ||
					COALESCE(b.summary, '') || ' ' ||
					COALESCE(b.content, '')
				) ILIKE '%' || p.search_filter || '%'
			)
	),
	chat_sessions AS (
		SELECT
			c.id,
			'chat_session'::text AS item_type,
			COALESCE(
				c.last_message_at,
				c.updated_at,
				c.created_at,
				'1970-01-01 00:00:00+00'::timestamptz
			) AS sort_created_at,
			jsonb_build_object(
				'id', c.id,
				'title', c.title,
				'auto_title', c.auto_title,
				'chat_topics', COALESCE(to_jsonb(c.chat_topics), '[]'::jsonb),
				'summary', c.summary,
				'context_type', c.context_type,
				'entity_id', c.entity_id,
				'message_count', c.message_count,
				'status', c.status,
				'created_at', c.created_at,
				'updated_at', c.updated_at,
				'last_message_at', c.last_message_at
			) AS row_data
		FROM public.chat_sessions c
		CROSS JOIN params p
		WHERE p.type_filter IN ('all', 'chats')
			AND c.user_id = p.user_id
			AND auth.uid() = p.user_id
			AND c.status <> 'archived'
			AND (COALESCE(c.message_count, 0) >= 3 OR c.summary IS NOT NULL)
			AND (
				p.status_filter IS NULL
				OR (
					p.status_filter = 'processed'
					AND NULLIF(BTRIM(c.summary), '') IS NOT NULL
				)
			)
			AND (
				p.search_filter IS NULL
				OR (
					COALESCE(c.title, '') || ' ' ||
					COALESCE(c.auto_title, '') || ' ' ||
					COALESCE(c.summary, '')
				) ILIKE '%' || p.search_filter || '%'
			)
	),
	combined AS (
		SELECT * FROM braindumps
		UNION ALL
		SELECT * FROM chat_sessions
	),
	paged_candidates AS (
		SELECT combined.*
		FROM combined
		ORDER BY combined.sort_created_at DESC, combined.id DESC
		LIMIT (SELECT page_limit + 1 FROM params)
		OFFSET (SELECT page_offset FROM params)
	),
	paged AS (
		SELECT paged_candidates.*
		FROM paged_candidates
		ORDER BY paged_candidates.sort_created_at DESC, paged_candidates.id DESC
		LIMIT (SELECT page_limit FROM params)
	),
	page_meta AS (
		SELECT
			COUNT(*)::integer AS candidate_count,
			LEAST(COUNT(*)::integer, (SELECT page_limit FROM params)) AS page_count,
			COUNT(*) > (SELECT page_limit FROM params) AS has_more
		FROM paged_candidates
	),
	selected_braindump AS (
		SELECT
			b.id,
			'braindump'::text AS item_type,
			b.created_at AS sort_created_at,
			jsonb_build_object(
				'id', b.id,
				'content',
					CASE
						WHEN LENGTH(COALESCE(b.content, '')) > 240 THEN LEFT(b.content, 240) || '...'
						ELSE COALESCE(b.content, '')
					END,
				'title', b.title,
				'topics', COALESCE(to_jsonb(b.topics), '[]'::jsonb),
				'summary', b.summary,
				'status', b.status,
				'chat_session_id', b.chat_session_id,
				'metadata', b.metadata,
				'processed_at', b.processed_at,
				'error_message', b.error_message,
				'created_at', b.created_at,
				'updated_at', b.updated_at
			) AS row_data
		FROM public.onto_braindumps b
		CROSS JOIN params p
		WHERE p.selected_id IS NOT NULL
			AND p.selected_type = 'braindump'
			AND p.type_filter IN ('all', 'braindumps')
			AND b.id = p.selected_id
			AND b.user_id = p.user_id
			AND auth.uid() = p.user_id
			AND b.deleted_at IS NULL
			AND (
				p.status_filter IS NULL
				OR (
					p.braindump_status_filter IS NOT NULL
					AND b.status = p.braindump_status_filter
				)
			)
			AND (
				p.search_filter IS NULL
				OR (
					COALESCE(b.title, '') || ' ' ||
					COALESCE(b.summary, '') || ' ' ||
					COALESCE(b.content, '')
				) ILIKE '%' || p.search_filter || '%'
			)
		LIMIT 1
	),
	selected_chat_session AS (
		SELECT
			c.id,
			'chat_session'::text AS item_type,
			COALESCE(
				c.last_message_at,
				c.updated_at,
				c.created_at,
				'1970-01-01 00:00:00+00'::timestamptz
			) AS sort_created_at,
			jsonb_build_object(
				'id', c.id,
				'title', c.title,
				'auto_title', c.auto_title,
				'chat_topics', COALESCE(to_jsonb(c.chat_topics), '[]'::jsonb),
				'summary', c.summary,
				'context_type', c.context_type,
				'entity_id', c.entity_id,
				'message_count', c.message_count,
				'status', c.status,
				'created_at', c.created_at,
				'updated_at', c.updated_at,
				'last_message_at', c.last_message_at
			) AS row_data
		FROM public.chat_sessions c
		CROSS JOIN params p
		WHERE p.selected_id IS NOT NULL
			AND p.selected_type = 'chat_session'
			AND p.type_filter IN ('all', 'chats')
			AND c.id = p.selected_id
			AND c.user_id = p.user_id
			AND auth.uid() = p.user_id
			AND c.status <> 'archived'
			AND (COALESCE(c.message_count, 0) >= 3 OR c.summary IS NOT NULL)
			AND (
				p.status_filter IS NULL
				OR (
					p.status_filter = 'processed'
					AND NULLIF(BTRIM(c.summary), '') IS NOT NULL
				)
			)
			AND (
				p.search_filter IS NULL
				OR (
					COALESCE(c.title, '') || ' ' ||
					COALESCE(c.auto_title, '') || ' ' ||
					COALESCE(c.summary, '')
				) ILIKE '%' || p.search_filter || '%'
			)
		LIMIT 1
	),
	selected AS (
		SELECT * FROM selected_braindump
		UNION ALL
		SELECT * FROM selected_chat_session
		LIMIT 1
	),
	braindump_stats AS (
		SELECT
			COUNT(*)::integer AS total_braindumps,
			COUNT(*) FILTER (WHERE b.status = 'processed'::public.onto_braindump_status)::integer AS processed_braindumps,
			COUNT(*) FILTER (WHERE b.status = 'pending'::public.onto_braindump_status)::integer AS pending_braindumps
		FROM public.onto_braindumps b
		CROSS JOIN params p
		WHERE b.user_id = p.user_id
			AND auth.uid() = p.user_id
			AND b.deleted_at IS NULL
	),
	chat_stats AS (
		SELECT
			COUNT(*)::integer AS total_chat_sessions,
			COUNT(*) FILTER (
				WHERE NULLIF(BTRIM(c.summary), '') IS NOT NULL
					AND LOWER(BTRIM(c.summary)) NOT IN ('undefined', 'null', 'nan', '[object object]')
			)::integer AS chat_sessions_with_summary
		FROM public.chat_sessions c
		CROSS JOIN params p
		WHERE c.user_id = p.user_id
			AND auth.uid() = p.user_id
			AND c.status <> 'archived'
			AND (COALESCE(c.message_count, 0) >= 3 OR c.summary IS NOT NULL)
	),
	total_meta AS (
		SELECT
			CASE
				WHEN p.search_filter IS NULL AND p.status_filter IS NULL THEN
					CASE p.type_filter
						WHEN 'braindumps' THEN bs.total_braindumps
						WHEN 'chats' THEN cs.total_chat_sessions
						ELSE bs.total_braindumps + cs.total_chat_sessions
					END
				ELSE p.page_offset + pm.page_count + CASE WHEN pm.has_more THEN 1 ELSE 0 END
			END::integer AS total_items,
			(p.search_filter IS NULL AND p.status_filter IS NULL) AS total_items_exact,
			pm.has_more
		FROM params p
		CROSS JOIN page_meta pm
		CROSS JOIN braindump_stats bs
		CROSS JOIN chat_stats cs
	)
	SELECT jsonb_build_object(
		'rows',
			COALESCE(
				(
					SELECT jsonb_agg(
						jsonb_build_object(
							'type', paged.item_type,
							'data', paged.row_data
						)
						ORDER BY paged.sort_created_at DESC, paged.id DESC
					)
					FROM paged
				),
				'[]'::jsonb
			),
		'totalItems', (SELECT total_items FROM total_meta),
		'totalItemsExact', (SELECT total_items_exact FROM total_meta),
		'stats',
			jsonb_build_object(
				'totalBraindumps', (SELECT total_braindumps FROM braindump_stats),
				'processedBraindumps', (SELECT processed_braindumps FROM braindump_stats),
				'pendingBraindumps', (SELECT pending_braindumps FROM braindump_stats),
				'totalChatSessions', (SELECT total_chat_sessions FROM chat_stats),
				'chatSessionsWithSummary', (SELECT chat_sessions_with_summary FROM chat_stats)
			),
		'selectedRow',
			(
				SELECT jsonb_build_object(
					'type', selected.item_type,
					'data', selected.row_data
				)
				FROM selected
			),
		'hasMore', (SELECT has_more FROM total_meta)
	);
$function$;

-- ---------------------------------------------------------------------------
-- Grants: service_role only, like the other retention functions.
-- ---------------------------------------------------------------------------

DO $grants$
DECLARE
	v_signature text;
BEGIN
	FOREACH v_signature IN ARRAY ARRAY[
		'public.cleanup_privacy_notifications(integer)',
		'public.cleanup_privacy_webhook_events(integer)',
		'public.cleanup_privacy_soft_deleted_braindumps(integer)'
	]
	LOOP
		EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', v_signature);
		EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', v_signature);
	END LOOP;
END;
$grants$;

COMMIT;
