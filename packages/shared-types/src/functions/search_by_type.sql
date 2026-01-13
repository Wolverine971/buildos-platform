-- packages/shared-types/src/functions/search_by_type.sql
-- Source: Supabase pg_get_functiondef

CREATE OR REPLACE FUNCTION public.search_by_type(search_query text, current_user_id uuid, search_type text, page_offset integer DEFAULT 0, page_limit integer DEFAULT 20)
 RETURNS TABLE(item_id uuid, title text, description text, tags text[], status text, project_id uuid, created_at timestamp with time zone, updated_at timestamp with time zone, relevance_score double precision, is_completed boolean, is_deleted boolean, matched_fields text[])
 LANGUAGE plpgsql
AS $function$
DECLARE
    normalized_query text;
BEGIN
    normalized_query := lower(unaccent(trim(search_query)));
    
    IF search_type = 'braindump' THEN
        RETURN QUERY
        SELECT 
            bd.id as item_id,
            bd.title::text as title,
            COALESCE(LEFT(bd.ai_summary, 200), LEFT(bd.content, 200))::text as description,
            bd.tags as tags,
            bd.status::text as status,
            bd.project_id as project_id,
            bd.created_at,
            bd.updated_at,
            (
                COALESCE(similarity(bd.title, normalized_query) * 3, 0) +
                COALESCE(similarity(bd.content, normalized_query) * 2, 0) +
                COALESCE(similarity(bd.ai_summary, normalized_query) * 2, 0) +
                COALESCE(similarity(bd.ai_insights, normalized_query) * 1.5, 0) +
                CASE WHEN bd.tags @> ARRAY[normalized_query] THEN 2 ELSE 0 END +
                CASE bd.status::text
                    WHEN 'pending' THEN 0.3
                    WHEN 'parsed' THEN 0.5
                    WHEN 'saved' THEN 0.5
                    WHEN 'parsed_and_deleted' THEN -0.5
                    ELSE 0
                END +
                CASE 
                    WHEN bd.created_at > NOW() - INTERVAL '7 days' THEN 0.5
                    WHEN bd.created_at > NOW() - INTERVAL '30 days' THEN 0.2
                    ELSE 0
                END
            ) as relevance_score,
            false as is_completed,
            CASE WHEN bd.status = 'parsed_and_deleted' THEN true ELSE false END as is_deleted,
            ARRAY_REMOVE(ARRAY[
                CASE WHEN bd.title ILIKE '%' || normalized_query || '%' THEN 'title' END,
                CASE WHEN bd.content ILIKE '%' || normalized_query || '%' THEN 'content' END,
                CASE WHEN bd.ai_summary ILIKE '%' || normalized_query || '%' THEN 'summary' END,
                CASE WHEN bd.ai_insights ILIKE '%' || normalized_query || '%' THEN 'insights' END,
                CASE WHEN bd.tags @> ARRAY[normalized_query] THEN 'tags' END
            ], NULL) as matched_fields
        FROM brain_dumps bd
        WHERE 
            bd.user_id = current_user_id
            AND (
                bd.title ILIKE '%' || normalized_query || '%'
                OR bd.content ILIKE '%' || normalized_query || '%'
                OR bd.ai_summary ILIKE '%' || normalized_query || '%'
                OR bd.ai_insights ILIKE '%' || normalized_query || '%'
                OR bd.tags @> ARRAY[normalized_query]
                OR similarity(bd.title, normalized_query) > 0.2
                OR similarity(bd.content, normalized_query) > 0.2
                OR similarity(bd.ai_summary, normalized_query) > 0.2
            )
        ORDER BY relevance_score DESC, bd.created_at DESC
        OFFSET page_offset
        LIMIT page_limit;
        
    ELSIF search_type = 'project' THEN
        RETURN QUERY
        SELECT 
            p.id as item_id,
            p.name::text as title,
            COALESCE(LEFT(p.description, 200), LEFT(p.executive_summary, 200))::text as description,
            p.tags as tags,
            p.status::text as status,
            p.id as project_id,
            p.created_at,
            p.updated_at,
            (
                COALESCE(similarity(p.name, normalized_query) * 3, 0) +
                COALESCE(similarity(p.description, normalized_query) * 2, 0) +
                COALESCE(similarity(p.executive_summary, normalized_query) * 1.5, 0) +
                COALESCE(similarity(p.context, normalized_query) * 1, 0) +
                CASE WHEN p.tags @> ARRAY[normalized_query] THEN 2 ELSE 0 END +
                CASE p.status::text
                    WHEN 'active' THEN 0.5
                    WHEN 'paused' THEN 0
                    WHEN 'completed' THEN -0.5
                    WHEN 'archived' THEN -1
                    ELSE 0
                END +
                CASE 
                    WHEN p.updated_at > NOW() - INTERVAL '7 days' THEN 0.5
                    WHEN p.updated_at > NOW() - INTERVAL '30 days' THEN 0.2
                    ELSE 0
                END
            ) as relevance_score,
            CASE WHEN p.status = 'completed' THEN true ELSE false END as is_completed,
            CASE WHEN p.status = 'archived' THEN true ELSE false END as is_deleted,
            ARRAY_REMOVE(ARRAY[
                CASE WHEN p.name ILIKE '%' || normalized_query || '%' THEN 'name' END,
                CASE WHEN p.description ILIKE '%' || normalized_query || '%' THEN 'description' END,
                CASE WHEN p.executive_summary ILIKE '%' || normalized_query || '%' THEN 'summary' END,
                CASE WHEN p.context ILIKE '%' || normalized_query || '%' THEN 'context' END,
                CASE WHEN p.tags @> ARRAY[normalized_query] THEN 'tags' END
            ], NULL) as matched_fields
        FROM projects p
        WHERE 
            p.user_id = current_user_id
            AND (
                p.name ILIKE '%' || normalized_query || '%'
                OR p.description ILIKE '%' || normalized_query || '%'
                OR p.executive_summary ILIKE '%' || normalized_query || '%'
                OR p.context ILIKE '%' || normalized_query || '%'
                OR p.tags @> ARRAY[normalized_query]
                OR similarity(p.name, normalized_query) > 0.2
                OR similarity(p.description, normalized_query) > 0.2
                OR similarity(p.executive_summary, normalized_query) > 0.2
            )
        ORDER BY relevance_score DESC, p.updated_at DESC
        OFFSET page_offset
        LIMIT page_limit;
        
    ELSIF search_type = 'task' THEN
        RETURN QUERY
        SELECT 
            t.id as item_id,
            t.title::text as title,
            COALESCE(LEFT(t.description, 200), LEFT(t.details, 200))::text as description,
            NULL::text[] as tags,
            t.status::text as status,
            t.project_id as project_id,
            t.created_at,
            t.updated_at,
            (
                COALESCE(similarity(t.title, normalized_query) * 3, 0) +
                COALESCE(similarity(t.description, normalized_query) * 2, 0) +
                COALESCE(similarity(t.details, normalized_query) * 1.5, 0) +
                COALESCE(similarity(t.task_steps, normalized_query) * 1, 0) +
                CASE t.priority::text
                    WHEN 'high' THEN 0.5
                    WHEN 'medium' THEN 0.2
                    WHEN 'low' THEN 0
                    ELSE 0
                END +
                CASE t.status::text
                    WHEN 'backlog' THEN 0.3
                    WHEN 'in_progress' THEN 0.7
                    WHEN 'done' THEN -0.5
                    WHEN 'blocked' THEN 0.1
                    ELSE 0
                END +
                CASE 
                    WHEN t.updated_at > NOW() - INTERVAL '7 days' THEN 0.5
                    WHEN t.updated_at > NOW() - INTERVAL '30 days' THEN 0.2
                    ELSE 0
                END
            ) as relevance_score,
            CASE WHEN t.status = 'done' THEN true ELSE false END as is_completed,
            CASE WHEN t.deleted_at IS NOT NULL THEN true ELSE false END as is_deleted,
            ARRAY_REMOVE(ARRAY[
                CASE WHEN t.title ILIKE '%' || normalized_query || '%' THEN 'title' END,
                CASE WHEN t.description ILIKE '%' || normalized_query || '%' THEN 'description' END,
                CASE WHEN t.details ILIKE '%' || normalized_query || '%' THEN 'details' END,
                CASE WHEN t.task_steps ILIKE '%' || normalized_query || '%' THEN 'steps' END
            ], NULL) as matched_fields
        FROM tasks t
        WHERE 
            t.user_id = current_user_id
            AND (
                t.title ILIKE '%' || normalized_query || '%'
                OR t.description ILIKE '%' || normalized_query || '%'
                OR t.details ILIKE '%' || normalized_query || '%'
                OR t.task_steps ILIKE '%' || normalized_query || '%'
                OR similarity(t.title, normalized_query) > 0.2
                OR similarity(t.description, normalized_query) > 0.2
                OR similarity(t.details, normalized_query) > 0.2
            )
        ORDER BY relevance_score DESC, t.updated_at DESC
        OFFSET page_offset
        LIMIT page_limit;
    END IF;
END;
$function$
