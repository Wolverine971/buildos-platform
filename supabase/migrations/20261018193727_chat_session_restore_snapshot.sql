-- supabase/migrations/20261018193727_chat_session_restore_snapshot.sql
-- One MVCC snapshot for the visible conversation and its lifecycle. Private
-- worker tables stay private: only the server can call this owned reader.
BEGIN;
SET LOCAL lock_timeout = '3s';

-- Display projection, not storage mutation. Large read results/arguments have a
-- byte budget; small results stay compatible. Action receipts are already
-- bounded by their writers and must remain lossless (notably inverse patches).
CREATE OR REPLACE FUNCTION public.chat_restore_display_json_v1(
    p_value jsonb, p_budget integer DEFAULT 8192, p_depth integer DEFAULT 0
) RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path = '' AS $$
DECLARE
    v_result jsonb;
    v_entry record;
    v_part jsonb;
    v_remaining integer := greatest(128, least(p_budget, 8192));
BEGIN
    IF p_value IS NULL OR octet_length(p_value::text) <= v_remaining THEN RETURN p_value; END IF;
    -- Proposal envelopes are executable UI contracts, not preview text.
    IF p_value->>'card_rail' = 'proposal_v1' THEN RETURN p_value; END IF;
    IF jsonb_typeof(p_value) = 'object' THEN
        v_result := '{"__restore_truncated":true}'::jsonb;
        FOR v_entry IN SELECT key, value FROM jsonb_each(p_value)
            ORDER BY CASE WHEN key IN ('document_change','table_change','result','data','tool_result') THEN 0
                          WHEN key IN ('id','title','name','project_id','document_id','task_id','status','requires_user_action') THEN 1
                          WHEN key IN ('project','task','document','goal','plan','milestone','event','risk','requirement') THEN 2
                          WHEN jsonb_typeof(value) NOT IN ('object','array') AND octet_length(value::text) < 512 THEN 3 ELSE 4 END, key
        LOOP
            IF v_entry.key IN ('document_change','table_change') THEN
                v_part := v_entry.value;
            ELSIF v_remaining < 128 OR p_depth >= 6 THEN
                CONTINUE;
            ELSE
                v_part := public.chat_restore_display_json_v1(v_entry.value, v_remaining, p_depth + 1);
                v_remaining := v_remaining - octet_length(v_part::text) - octet_length(v_entry.key) - 8;
            END IF;
            v_result := v_result || jsonb_build_object(v_entry.key, v_part);
        END LOOP;
        RETURN v_result;
    ELSIF jsonb_typeof(p_value) = 'array' THEN
        v_result := '[]'::jsonb;
        FOR v_entry IN SELECT value FROM jsonb_array_elements(p_value) LIMIT 20 LOOP
            EXIT WHEN v_remaining < 128 OR p_depth >= 6;
            v_part := public.chat_restore_display_json_v1(v_entry.value, least(v_remaining, 1024), p_depth + 1);
            v_result := v_result || jsonb_build_array(v_part);
            v_remaining := v_remaining - octet_length(v_part::text) - 2;
        END LOOP;
        RETURN v_result;
    ELSIF jsonb_typeof(p_value) = 'string' THEN
        -- UTF-8 characters and JSON escaping can each occupy multiple bytes.
        RETURN to_jsonb(left(p_value #>> '{}', greatest(1, (v_remaining - 32) / 6)) || '…');
    END IF;
    RETURN p_value;
END $$;
REVOKE ALL ON FUNCTION public.chat_restore_display_json_v1(jsonb,integer,integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.chat_restore_display_json_v1(jsonb,integer,integer) TO service_role;

CREATE OR REPLACE FUNCTION public.get_chat_session_restore_v1(p_session_id uuid, p_user_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
WITH owned AS MATERIALIZED (
    SELECT id FROM public.chat_sessions WHERE id = p_session_id AND user_id = p_user_id
), newest_messages AS MATERIALIZED (
    SELECT m.id, m.session_id, m.user_id, m.role, m.content, m.tool_calls, m.tool_call_id, m.created_at, m.metadata
    FROM public.chat_messages m JOIN owned s ON s.id = m.session_id
    WHERE m.role IN ('user','assistant')
    ORDER BY m.created_at DESC, m.id DESC LIMIT 401
), messages AS MATERIALIZED (
    SELECT * FROM newest_messages ORDER BY created_at DESC, id DESC LIMIT 400
), runs AS MATERIALIZED (
    SELECT r.id, r.session_id, r.user_id, r.stream_run_id, r.client_turn_id,
           r.status, r.finished_reason,
           -- The request is already in messages; only a timeline label needs it here.
           left(r.request_message, 1000) AS request_message, r.assistant_message_id,
           r.started_at, r.finished_at, r.created_at, r.updated_at
    FROM public.chat_turn_runs r JOIN owned s ON s.id = r.session_id
    WHERE r.user_id = p_user_id AND (
        r.status IN ('queued','running') OR EXISTS (
            SELECT 1 FROM messages m WHERE m.id = r.user_message_id OR m.id = r.assistant_message_id
                OR m.metadata->>'turn_run_id' = r.id::text
                OR m.metadata->>'idempotency_key' IN ('chat-turn:' || r.id || ':user', 'chat-turn:' || r.id || ':assistant')
                OR m.metadata->>'client_turn_id' = r.client_turn_id
        )
    )
), newest_tools AS MATERIALIZED (
    SELECT t.* FROM public.chat_tool_executions t JOIN owned s ON s.id = t.session_id
    WHERE (t.message_id IN (SELECT id FROM messages))
       OR (t.message_id IS NULL AND (
            t.turn_run_id IN (SELECT id FROM runs)
            OR t.client_turn_id IN (SELECT client_turn_id FROM runs)
            -- Legacy executions had no turn linkage. Include only those within
            -- the visible time window, never an explicitly excluded message.
            OR (t.turn_run_id IS NULL AND t.client_turn_id IS NULL
                AND t.created_at >= (SELECT min(created_at) FROM messages))
       ))
    ORDER BY t.created_at DESC, t.id DESC LIMIT 1001
), tools AS MATERIALIZED (
    SELECT id, session_id, message_id, turn_run_id, stream_run_id, client_turn_id,
           provider_tool_call_id, tool_name, tool_category, gateway_op, help_path, sequence_index,
           public.chat_restore_display_json_v1(arguments) AS arguments,
           public.chat_restore_display_json_v1(result) AS result,
           (coalesce(octet_length(arguments::text) > 8192, false) OR coalesce(octet_length(result::text) > 8192, false)) AS restore_payload_truncated,
           result_count, zero_result, execution_time_ms, tokens_consumed, success, error_message,
           requires_user_action, affected_entities, created_at
    FROM newest_tools ORDER BY created_at DESC, id DESC LIMIT 1000
), newest_events AS MATERIALIZED (
    SELECT e.id, e.session_id, e.user_id, e.turn_run_id, e.stream_run_id,
           e.execution_generation, e.event_type, e.phase,
           public.chat_restore_display_json_v1(e.payload) AS payload, e.sequence_index, e.created_at
    FROM public.chat_turn_events e JOIN runs r ON r.id = e.turn_run_id
    WHERE e.session_id = p_session_id AND e.user_id = p_user_id
    ORDER BY e.created_at DESC, e.id DESC LIMIT 1001
), events AS (
    SELECT * FROM newest_events ORDER BY created_at DESC, id DESC LIMIT 1000
), workflows AS (
    SELECT w.turn_run_id, w.projection->'workflow' AS workflow
    FROM public.chat_turn_stream_state w JOIN runs r ON r.id = w.turn_run_id
    WHERE w.session_id = p_session_id AND w.user_id = p_user_id AND w.projection->'workflow' IS NOT NULL
)
SELECT jsonb_build_object(
    'messages', coalesce((SELECT jsonb_agg(m ORDER BY m.created_at, m.id) FROM messages m), '[]'::jsonb),
    'turnRuns', coalesce((SELECT jsonb_agg(r ORDER BY r.started_at DESC, r.id DESC) FROM runs r), '[]'::jsonb),
    'toolExecutions', coalesce((SELECT jsonb_agg(t ORDER BY t.created_at, t.id) FROM tools t), '[]'::jsonb),
    'turnEvents', coalesce((SELECT jsonb_agg(e ORDER BY e.created_at, e.id) FROM events e), '[]'::jsonb),
    'workflows', coalesce((SELECT jsonb_agg(w) FROM workflows w), '[]'::jsonb),
    'truncated', (SELECT count(*) > 400 FROM newest_messages),
    'historyWindow', jsonb_build_object(
        'messageLimit', 400, 'toolLimit', 1000, 'eventLimit', 1000,
        'toolsTruncated', (SELECT count(*) > 1000 FROM newest_tools),
        'eventsTruncated', (SELECT count(*) > 1000 FROM newest_events),
        'oldestMessageId', (SELECT id FROM messages ORDER BY created_at, id LIMIT 1)
    )
) FROM owned;
$$;
REVOKE ALL ON FUNCTION public.get_chat_session_restore_v1(uuid,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_chat_session_restore_v1(uuid,uuid) TO service_role;

-- Invoker rights deliberately preserve BOTH attachment ownership RLS and asset
-- project access RLS. OCR is trimmed before crossing the database connection.
CREATE OR REPLACE FUNCTION public.get_chat_restore_attachments_v1(p_session_id uuid, p_message_ids uuid[])
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
    -- A single JSON array avoids PostgREST's default 1000-row response cap.
    SELECT coalesce(jsonb_agg(rows.attachment ORDER BY rows.display_order, rows.id), '[]'::jsonb) FROM (
    SELECT a.display_order, a.id, jsonb_build_object(
        'message_id', a.message_id, 'asset_id', a.asset_id, 'project_id', a.project_id,
        'attachment_kind', a.attachment_kind, 'media_type', a.media_type,
        'role', a.role, 'display_order', a.display_order, 'metadata', a.metadata,
        'asset', CASE WHEN asset.id IS NULL THEN NULL ELSE jsonb_build_object(
            'id', asset.id, 'project_id', asset.project_id, 'original_filename', asset.original_filename,
            'content_type', asset.content_type, 'file_size_bytes', asset.file_size_bytes,
            'width', asset.width, 'height', asset.height, 'checksum_sha256', asset.checksum_sha256,
            'ocr_status', asset.ocr_status, 'extraction_summary', left(asset.extraction_summary, 700),
            'extracted_text', left(asset.extracted_text, 1600)
        ) END
    ) AS attachment FROM public.chat_message_attachments a
    JOIN public.chat_sessions s ON s.id = a.session_id AND s.user_id = (SELECT auth.uid())
    LEFT JOIN public.onto_assets asset ON asset.id = a.asset_id
    WHERE a.session_id = p_session_id AND a.user_id = (SELECT auth.uid())
        AND a.message_id = ANY(p_message_ids[1:400])
    ORDER BY a.display_order, a.id LIMIT 3200
    ) rows;
$$;
REVOKE ALL ON FUNCTION public.get_chat_restore_attachments_v1(uuid,uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_chat_restore_attachments_v1(uuid,uuid[]) TO authenticated, service_role;
COMMIT;
