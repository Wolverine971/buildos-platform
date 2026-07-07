-- supabase/migrations/20260707020000_history_page_perf_p2.sql
-- P2 history-page performance follow-ups:
-- - search-specific trigram indexes for the RPC's wildcard search path
-- - feed-sort indexes that match the RPC order by shape
-- - queue job expression index for visible chat classification state
-- - RPC update that derives hasMore from limit+1 instead of exact filtered counts

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_history_onto_braindumps_user_created_id
	ON public.onto_braindumps (user_id, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_history_onto_braindumps_search_trgm
	ON public.onto_braindumps
	USING gin (
		(
			COALESCE(title, '') || ' ' ||
			COALESCE(summary, '') || ' ' ||
			COALESCE(content, '')
		) gin_trgm_ops
	);

CREATE INDEX IF NOT EXISTS idx_history_chat_sessions_user_activity_visible
	ON public.chat_sessions (
		user_id,
		(COALESCE(last_message_at, updated_at, created_at, '1970-01-01 00:00:00+00'::timestamptz)) DESC,
		id DESC
	)
	WHERE status <> 'archived'
		AND (COALESCE(message_count, 0) >= 3 OR summary IS NOT NULL);

CREATE INDEX IF NOT EXISTS idx_history_chat_sessions_search_trgm
	ON public.chat_sessions
	USING gin (
		(
			COALESCE(title, '') || ' ' ||
			COALESCE(auto_title, '') || ' ' ||
			COALESCE(summary, '')
		) gin_trgm_ops
	)
	WHERE status <> 'archived'
		AND (COALESCE(message_count, 0) >= 3 OR summary IS NOT NULL);

CREATE INDEX IF NOT EXISTS idx_history_queue_jobs_classify_session_created
	ON public.queue_jobs (user_id, ((metadata->>'sessionId')), created_at DESC)
	WHERE job_type = 'classify_chat_session';

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
