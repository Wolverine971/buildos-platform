-- supabase/migrations/20260707000000_history_page_perf_rpc.sql
-- Bounded history-page feed RPC. Keeps /history from transferring a user's
-- entire capture/chat history just to render one page.

CREATE INDEX IF NOT EXISTS idx_history_onto_braindumps_user_created
	ON public.onto_braindumps (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_history_chat_sessions_user_created_visible
	ON public.chat_sessions (user_id, created_at DESC)
	WHERE status <> 'archived'
		AND (message_count >= 3 OR summary IS NOT NULL);

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
			NULLIF(BTRIM(p_status), '') AS status_filter,
			CASE
				WHEN NULLIF(BTRIM(p_status), '') IN ('pending', 'processing', 'processed', 'failed')
					THEN NULLIF(BTRIM(p_status), '')::public.onto_braindump_status
				ELSE NULL
			END AS braindump_status_filter,
			NULLIF(BTRIM(p_search), '') AS search_filter,
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
				OR b.content ILIKE '%' || p.search_filter || '%'
				OR b.title ILIKE '%' || p.search_filter || '%'
				OR b.summary ILIKE '%' || p.search_filter || '%'
			)
	),
	chat_sessions AS (
		SELECT
			c.id,
			'chat_session'::text AS item_type,
			COALESCE(c.created_at, c.updated_at, c.last_message_at, now()) AS sort_created_at,
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
				OR c.title ILIKE '%' || p.search_filter || '%'
				OR c.auto_title ILIKE '%' || p.search_filter || '%'
				OR c.summary ILIKE '%' || p.search_filter || '%'
			)
	),
	combined AS (
		SELECT * FROM braindumps
		UNION ALL
		SELECT * FROM chat_sessions
	),
	paged AS (
		SELECT combined.*
		FROM combined
		CROSS JOIN params p
		ORDER BY combined.sort_created_at DESC, combined.id DESC
		LIMIT (SELECT page_limit FROM params)
		OFFSET (SELECT page_offset FROM params)
	),
	selected AS (
		SELECT combined.*
		FROM combined
		CROSS JOIN params p
		WHERE p.selected_id IS NOT NULL
			AND p.selected_type IS NOT NULL
			AND combined.id = p.selected_id
			AND combined.item_type = p.selected_type
		ORDER BY combined.sort_created_at DESC, combined.id DESC
		LIMIT 1
	),
	filtered_total AS (
		SELECT COUNT(*)::integer AS total_items
		FROM combined
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
		'totalItems', (SELECT total_items FROM filtered_total),
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
		'hasMore',
			(SELECT total_items FROM filtered_total) >
				((SELECT page_offset FROM params) + (SELECT page_limit FROM params))
	);
$function$;
