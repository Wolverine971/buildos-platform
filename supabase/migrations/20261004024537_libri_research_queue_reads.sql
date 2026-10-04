-- libri-migration: true
-- Read-only application projections; invoker rights preserve member RLS.
SET lock_timeout='5s';
SET statement_timeout='60s';
-- Historical receipts have no foreign keys to executable runs/steps and cannot
-- be admitted or consumed. The source hash pins each immutable imported record.
CREATE TABLE libri.research_queue_history (
 id uuid PRIMARY KEY,library_id uuid NOT NULL REFERENCES libri.libraries(id) ON DELETE CASCADE,
 source_id text NOT NULL CHECK(length(source_id) BETWEEN 1 AND 100),
 source_sha256 text NOT NULL CHECK(source_sha256 ~ '^[0-9a-f]{64}$'),
 archive_sha256 text NOT NULL CHECK(archive_sha256 ~ '^[0-9a-f]{64}$'),
 source text NOT NULL CHECK(length(source) BETWEEN 1 AND 100),
 original_status text NOT NULL CHECK(original_status IN ('running','completed','failed')),
 started_at timestamptz NOT NULL,finished_at timestamptz,
 attempted integer NOT NULL CHECK(attempted BETWEEN 0 AND 100000),
 succeeded integer NOT NULL CHECK(succeeded BETWEEN 0 AND 100000),
 failed integer NOT NULL CHECK(failed BETWEEN 0 AND 100000),
 blocked integer NOT NULL CHECK(blocked BETWEEN 0 AND 100000),
 skipped_manual_only integer NOT NULL CHECK(skipped_manual_only BETWEEN 0 AND 100000),
 results jsonb NOT NULL CHECK(jsonb_typeof(results)='array' AND jsonb_array_length(results)<=500),
 filters jsonb NOT NULL DEFAULT '{}'::jsonb CHECK(jsonb_typeof(filters)='object' AND octet_length(filters::text)<=100000),
 error_message text CHECK(length(error_message)<=5000),
 imported_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(library_id,source_id)
);
CREATE INDEX research_queue_history_library_time_idx ON libri.research_queue_history(library_id,started_at DESC,id);
ALTER TABLE libri.research_queue_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE libri.research_queue_history FORCE ROW LEVEL SECURITY;
CREATE POLICY research_queue_history_member_read ON libri.research_queue_history FOR SELECT TO authenticated
 USING(EXISTS(SELECT 1 FROM libri.library_members member WHERE member.library_id=research_queue_history.library_id AND member.user_id=(SELECT auth.uid())));
REVOKE ALL ON libri.research_queue_history FROM PUBLIC,anon,authenticated,libri_worker,libri_frontend_reader;
GRANT SELECT ON libri.research_queue_history TO authenticated;
GRANT ALL ON libri.research_queue_history TO service_role;

CREATE FUNCTION libri.read_research_queue_dashboard(p_library_id uuid)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=pg_catalog,libri
AS $function$
DECLARE response jsonb;
BEGIN
 IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM libri.library_members WHERE library_id=p_library_id AND user_id=auth.uid()) THEN
  RAISE EXCEPTION 'Library membership required' USING ERRCODE='42501';
 END IF;
 WITH scoped AS MATERIALIZED (
  SELECT t.*,t.task_type IN ('scan_toc','find_book_info','find_youtube','find_podcasts','review_ocr','review_ai_content','deep_enrich_chapters','synthesize_book','generate_agent_profile','enrich_book') AS automatic,
   CASE t.priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END AS priority_rank
  FROM libri.research_tasks t WHERE t.library_id=p_library_id
 ), samples AS (
  SELECT t.id,t.title,t.description,t.task_type,t.priority,t.status,t.book_id,b.title AS book_title,b.slug AS book_slug,
   t.result_message,t.created_at,t.updated_at,t.active_run_id,t.requires_confirmation,t.confirmed_at,t.automatic,
   (SELECT step.started_at FROM libri.research_task_batch_items item JOIN libri.research_steps step ON step.id=item.step_id AND step.run_id=item.batch_id AND step.library_id=item.library_id WHERE item.library_id=t.library_id AND item.batch_id=t.active_run_id AND item.task_id=t.id) AS started_at,
   row_number() OVER(PARTITION BY t.status ORDER BY
    CASE WHEN t.status='pending' THEN t.priority_rank END,
    CASE WHEN t.status='pending' THEN t.created_at END,
    CASE WHEN t.status<>'pending' THEN t.updated_at END DESC,t.id) AS sample_position
  FROM scoped t LEFT JOIN libri.books b ON b.library_id=t.library_id AND b.id=t.book_id
 ), counts AS (
  SELECT count(*) FILTER(WHERE status IN ('pending','in_progress','blocked')) AS open,
   count(*) FILTER(WHERE status='pending') AS pending,
   count(*) FILTER(WHERE status='pending' AND automatic) AS pending_auto,
   count(*) FILTER(WHERE status='pending' AND NOT automatic) AS pending_manual,
   count(*) FILTER(WHERE status='in_progress') AS in_progress,
   count(*) FILTER(WHERE status='blocked') AS blocked,
   count(*) FILTER(WHERE status='complete' AND completed_at>=statement_timestamp()-interval '24 hours') AS complete_last_24h,
   coalesce(round(avg(greatest(0,floor(extract(epoch FROM statement_timestamp()-created_at)/60))) FILTER(WHERE status='pending')),0) AS avg_pending_age_minutes
  FROM scoped
 ) SELECT jsonb_build_object(
  'now',statement_timestamp(),'queue',to_jsonb(counts),
  'failedLast24h',(SELECT count(*) FROM libri.research_task_batch_items item JOIN libri.research_steps step ON step.library_id=item.library_id AND step.run_id=item.batch_id AND step.id=item.step_id
   WHERE item.library_id=p_library_id AND step.status IN ('failed','needs_review','dead_letter') AND step.completed_at>=statement_timestamp()-interval '24 hours'),
  'controls',(SELECT jsonb_build_object('dispatchEnabled',dispatch_enabled,'batchSize',max_batch_tasks,'concurrency',max_concurrent_steps,'deadlineMinutes',deadline_minutes) FROM libri.research_queue_controls WHERE library_id=p_library_id),
  'activeRun',(SELECT jsonb_build_object('id',id,'startedAt',started_at,'createdAt',created_at) FROM libri.research_runs WHERE library_id=p_library_id AND kind='task_batch' AND status IN ('queued','running','cancelling') ORDER BY created_at DESC,id LIMIT 1),
  'nextInLine',coalesce((SELECT jsonb_agg(to_jsonb(samples) ORDER BY sample_position) FROM samples WHERE status='pending' AND sample_position<=10),'[]'::jsonb),
  'runningNow',coalesce((SELECT jsonb_agg(to_jsonb(samples) ORDER BY sample_position) FROM samples WHERE status='in_progress' AND sample_position<=20),'[]'::jsonb),
  'failures',coalesce((SELECT jsonb_agg(to_jsonb(samples) ORDER BY sample_position) FROM samples WHERE status='blocked' AND sample_position<=20),'[]'::jsonb)
 ) INTO response FROM counts;
 RETURN response;
END;
$function$;
REVOKE ALL ON FUNCTION libri.read_research_queue_dashboard(uuid) FROM PUBLIC,anon,authenticated,service_role,libri_worker,libri_frontend_reader;
GRANT EXECUTE ON FUNCTION libri.read_research_queue_dashboard(uuid) TO authenticated;

CREATE FUNCTION libri.read_research_queue_runs(p_library_id uuid,p_limit integer DEFAULT 50,p_run_id uuid DEFAULT NULL,p_status text DEFAULT NULL)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=pg_catalog,libri
AS $function$
DECLARE response jsonb;
BEGIN
 IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM libri.library_members WHERE library_id=p_library_id AND user_id=auth.uid()) THEN
  RAISE EXCEPTION 'Library membership required' USING ERRCODE='42501';
 END IF;
 IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 200 OR (p_status IS NOT NULL AND p_status NOT IN ('queued','running','cancelling','completed','partial','failed','cancelled','needs_review','budget_exhausted','archived')) THEN
  RAISE EXCEPTION 'Invalid run filter' USING ERRCODE='22023';
 END IF;
 WITH candidates AS MATERIALIZED (
  SELECT batch.id,batch.library_id FROM libri.research_task_batches batch JOIN libri.research_runs run ON run.library_id=batch.library_id AND run.id=batch.id
  WHERE batch.library_id=p_library_id AND (p_run_id IS NULL OR batch.id=p_run_id) AND (p_status IS NULL OR run.status=p_status)
  ORDER BY batch.created_at DESC,batch.id LIMIT CASE WHEN p_run_id IS NULL THEN p_limit ELSE 1 END
 ), live AS (
  SELECT batch.id,batch.created_at,run.status,jsonb_build_object(
   'id',batch.id,'archived',false,'source',batch.source,'status',run.status,'createdAt',batch.created_at,'startedAt',run.started_at,'finishedAt',run.finished_at,
   'error',run.error_message,'selectedCount',batch.task_count,'concurrency',run.max_concurrent_steps,
   'costBudgetMicrousd',run.cost_budget_microusd,'deadlineAt',run.deadline_at,'dispatchedAt',batch.dispatched_at,
   'attempted',outcomes.attempted,'succeeded',outcomes.succeeded,'failed',outcomes.failed,'blocked',outcomes.blocked,'skippedManualOnly',0,
   'results',CASE WHEN p_run_id IS NULL THEN '[]'::jsonb ELSE outcomes.results END
  ) AS row_value
  FROM candidates candidate JOIN libri.research_task_batches batch ON batch.id=candidate.id AND batch.library_id=candidate.library_id
  JOIN libri.research_runs run ON run.library_id=batch.library_id AND run.id=batch.id
  CROSS JOIN LATERAL (
   SELECT count(*) FILTER(WHERE step.attempts>0) AS attempted,
    count(*) FILTER(WHERE step.status='completed') AS succeeded,
    count(*) FILTER(WHERE step.status IN ('failed','dead_letter')) AS failed,
    count(*) FILTER(WHERE step.status='needs_review') AS blocked,
    coalesce(jsonb_agg(jsonb_build_object('taskId',item.task_id,'taskType',item.task_type,'title',item.task_title,'status',step.status,'attempts',step.attempts,'message',left(coalesce(step.result->>'message',step.error_message,''),1200)) ORDER BY step.position,item.step_id),'[]'::jsonb) AS results
   FROM libri.research_task_batch_items item JOIN libri.research_steps step ON step.library_id=item.library_id AND step.run_id=item.batch_id AND step.id=item.step_id
   WHERE item.library_id=batch.library_id AND item.batch_id=batch.id
  ) outcomes
  WHERE batch.library_id=p_library_id AND (p_run_id IS NULL OR batch.id=p_run_id)
 ), historical AS (
  SELECT history.id,history.started_at AS created_at,
   CASE WHEN original_status='running' THEN 'archived' ELSE original_status END AS status,
   jsonb_build_object('id',history.id,'archived',true,'source',history.source,
    'status',CASE WHEN original_status='running' THEN 'archived' ELSE original_status END,'originalStatus',original_status,
    'createdAt',started_at,'startedAt',started_at,'finishedAt',finished_at,'error',error_message,
    'attempted',attempted,'succeeded',succeeded,'failed',failed,'blocked',blocked,'skippedManualOnly',skipped_manual_only,
    'filters',CASE WHEN p_run_id IS NULL THEN '{}'::jsonb ELSE filters END,'results',CASE WHEN p_run_id IS NULL THEN '[]'::jsonb ELSE results END) AS row_value
  FROM libri.research_queue_history history WHERE library_id=p_library_id AND (p_run_id IS NULL OR id=p_run_id)
   AND (p_status IS NULL OR (CASE WHEN original_status='running' THEN 'archived' ELSE original_status END)=p_status)
  ORDER BY started_at DESC,id LIMIT CASE WHEN p_run_id IS NULL THEN p_limit ELSE 1 END
 ), combined AS (SELECT * FROM live UNION ALL SELECT * FROM historical)
 SELECT coalesce(jsonb_agg(row_value ORDER BY created_at DESC,id),'[]'::jsonb) INTO response FROM (
  SELECT * FROM combined WHERE p_status IS NULL OR status=p_status ORDER BY created_at DESC,id LIMIT CASE WHEN p_run_id IS NULL THEN p_limit ELSE 1 END
 ) listed;
 RETURN response;
END;
$function$;
REVOKE ALL ON FUNCTION libri.read_research_queue_runs(uuid,integer,uuid,text) FROM PUBLIC,anon,authenticated,service_role,libri_worker,libri_frontend_reader;
GRANT EXECUTE ON FUNCTION libri.read_research_queue_runs(uuid,integer,uuid,text) TO authenticated;
NOTIFY pgrst,'reload schema';
