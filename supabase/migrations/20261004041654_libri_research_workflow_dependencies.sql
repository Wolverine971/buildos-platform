-- libri-migration: true
-- libri-allow-security-definer: prepare_research_workflow, acknowledge_research_task_dispatch
-- libri-allow-public-read: queue_jobs
-- Add a nonterminal parent state and immutable, same-run prerequisites. No
-- provider or canonical catalog write is granted to the worker.
SET lock_timeout='5s';
SET statement_timeout='60s';
ALTER TABLE libri.research_steps DROP CONSTRAINT research_steps_status_valid;
ALTER TABLE libri.research_steps ADD CONSTRAINT research_steps_status_valid CHECK(status IN
 ('pending','queued','leased','retry_wait','waiting','completed','failed','cancelled','skipped','needs_review','dead_letter'));
ALTER TABLE libri.research_queue_controls DROP CONSTRAINT research_queue_controls_max_steps_per_task_check;
ALTER TABLE libri.research_queue_controls ADD CONSTRAINT research_queue_controls_max_steps_per_task_check CHECK(max_steps_per_task BETWEEN 1 AND 1000);

CREATE TABLE libri.research_step_dependencies (
 library_id uuid NOT NULL,run_id uuid NOT NULL,step_id uuid NOT NULL,prerequisite_step_id uuid NOT NULL,
 PRIMARY KEY(step_id,prerequisite_step_id),CHECK(step_id<>prerequisite_step_id),
 FOREIGN KEY(library_id,run_id,step_id) REFERENCES libri.research_steps(library_id,run_id,id) ON DELETE CASCADE,
 FOREIGN KEY(library_id,run_id,prerequisite_step_id) REFERENCES libri.research_steps(library_id,run_id,id) ON DELETE CASCADE
);
CREATE INDEX research_step_dependencies_step_scope_idx ON libri.research_step_dependencies(library_id,run_id,step_id);
CREATE INDEX research_step_dependencies_prerequisite_idx ON libri.research_step_dependencies(library_id,run_id,prerequisite_step_id);
ALTER TABLE libri.research_step_dependencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE libri.research_step_dependencies FORCE ROW LEVEL SECURITY;
CREATE POLICY research_step_dependencies_worker_read ON libri.research_step_dependencies FOR SELECT TO libri_worker USING(true);
REVOKE ALL ON libri.research_step_dependencies FROM PUBLIC,anon,authenticated,libri_worker,libri_frontend_reader;
GRANT SELECT ON libri.research_step_dependencies TO libri_worker;
GRANT ALL ON libri.research_step_dependencies TO service_role;
CREATE INDEX research_steps_workflow_waiting_idx ON libri.research_steps(run_id,id) WHERE status='waiting';

CREATE FUNCTION libri.research_workflow_step_ready(p_step_id uuid) RETURNS boolean
 LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog,libri
AS $function$
 SELECT EXISTS(SELECT 1 FROM libri.research_steps step
  JOIN libri.research_steps parent ON parent.library_id=step.library_id AND parent.run_id=step.run_id AND parent.id=step.parent_step_id
  WHERE step.id=p_step_id AND step.payload->>'workflowVersion'='1' AND parent.status='waiting'
   AND NOT EXISTS(SELECT 1 FROM libri.research_step_dependencies dependency
    JOIN libri.research_steps prerequisite ON prerequisite.library_id=dependency.library_id AND prerequisite.run_id=dependency.run_id AND prerequisite.id=dependency.prerequisite_step_id
    WHERE dependency.step_id=step.id AND prerequisite.status<>'completed'));
$function$;
REVOKE ALL ON FUNCTION libri.research_workflow_step_ready(uuid) FROM PUBLIC,anon,authenticated,service_role,libri_worker,libri_frontend_reader;
GRANT EXECUTE ON FUNCTION libri.research_workflow_step_ready(uuid) TO libri_worker,service_role;
CREATE FUNCTION libri.enforce_research_workflow_readiness() RETURNS trigger
 LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,libri
AS $function$
BEGIN
 IF NEW.status IN ('queued','leased') AND NEW.status IS DISTINCT FROM OLD.status
 AND NEW.payload->>'workflowVersion'='1' AND NOT libri.research_workflow_step_ready(NEW.id) THEN
  RAISE EXCEPTION 'Research prerequisites are incomplete' USING ERRCODE='55000';
 END IF;
 RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION libri.enforce_research_workflow_readiness() FROM PUBLIC,anon,authenticated,service_role,libri_worker,libri_frontend_reader;
GRANT EXECUTE ON FUNCTION libri.enforce_research_workflow_readiness() TO libri_worker,service_role;
CREATE TRIGGER research_steps_workflow_readiness BEFORE UPDATE ON libri.research_steps FOR EACH ROW EXECUTE FUNCTION libri.enforce_research_workflow_readiness();

-- The worker supplies an ordered DAG, but cannot choose library/task identity,
-- grow past the admitted bounds, target another book, or create recursive plans.
-- Caller completes its queue receipt and suspends the root in the same transaction.
CREATE FUNCTION libri.prepare_research_workflow(p_step_id uuid,p_generation integer,p_lease uuid,p_children jsonb)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,libri
AS $function$
DECLARE root libri.research_steps%ROWTYPE;run libri.research_runs%ROWTYPE;child jsonb;child_id uuid;
 ids uuid[]:='{}';position_value integer:=0;dependency integer;count_value integer;task_limit integer;
BEGIN
 SELECT * INTO root FROM libri.research_steps WHERE id=p_step_id FOR UPDATE;
 IF NOT FOUND OR root.status<>'leased' OR root.execution_generation<>p_generation OR root.lease_token IS DISTINCT FROM p_lease
 OR root.lease_expires_at<=clock_timestamp() OR root.parent_step_id IS NOT NULL OR root.kind<>'task_execute'
 OR root.payload->>'taskType'<>'find_book_info' OR NOT libri.research_task_execution_allowed(root.id) THEN
  RAISE EXCEPTION 'Research workflow authority is stale' USING ERRCODE='42501'; END IF;
 SELECT * INTO run FROM libri.research_runs WHERE id=root.run_id FOR UPDATE;
 SELECT max_steps_per_task INTO task_limit FROM libri.research_queue_controls WHERE library_id=root.library_id;
 IF p_children IS NULL OR jsonb_typeof(p_children)<>'array' OR octet_length(p_children::text)>300000 THEN
  RAISE EXCEPTION 'Invalid research workflow' USING ERRCODE='22023'; END IF;
 count_value:=jsonb_array_length(p_children);
 IF count_value NOT BETWEEN 1 AND 999 OR count_value+1>task_limit OR run.planned_steps+count_value>run.max_steps OR root.depth+1>run.max_depth THEN
  RAISE EXCEPTION 'Research workflow exceeds admitted bounds' USING ERRCODE='54000'; END IF;
 IF EXISTS(SELECT 1 FROM libri.research_steps WHERE parent_step_id=root.id) THEN
  RAISE EXCEPTION 'Research workflow already planned' USING ERRCODE='40001'; END IF;
 FOR child IN SELECT value FROM jsonb_array_elements(p_children) LOOP
  IF jsonb_typeof(child)<>'object' OR EXISTS(SELECT 1 FROM jsonb_object_keys(child) key WHERE key NOT IN ('phase','chapterId','dependsOn'))
   OR child->>'phase' IS NULL OR child->>'phase' NOT IN ('chapter_search','chapter_extract')
   OR child->>'chapterId' IS NULL OR NOT EXISTS(SELECT 1 FROM libri.chapters WHERE library_id=root.library_id AND book_id=(root.payload->>'bookId')::uuid AND id=(child->>'chapterId')::uuid)
   OR jsonb_typeof(child->'dependsOn') IS DISTINCT FROM 'array' OR jsonb_array_length(child->'dependsOn')>10 THEN
   RAISE EXCEPTION 'Invalid research stage' USING ERRCODE='22023'; END IF;
  IF child->>'phase'='chapter_search' AND jsonb_array_length(child->'dependsOn')<>0 THEN
   RAISE EXCEPTION 'Search cannot depend on extraction' USING ERRCODE='22023'; END IF;
  IF child->>'phase'='chapter_extract' AND jsonb_array_length(child->'dependsOn')<>1 THEN
   RAISE EXCEPTION 'Extraction requires one saved search' USING ERRCODE='22023'; END IF;
  child_id:=gen_random_uuid();
  INSERT INTO libri.research_steps(id,library_id,run_id,parent_step_id,idempotency_key,queue_family,kind,stage,position,depth,priority,payload,max_attempts)
  VALUES(child_id,root.library_id,root.run_id,root.id,'workflow:'||root.id||':'||position_value,'libri_research','task_execute',
   CASE child->>'phase' WHEN 'chapter_search' THEN 'discover_candidates' ELSE 'extract_claims' END,position_value,root.depth+1,root.priority,
   root.payload||jsonb_build_object('workflowVersion',1,'phase',child->>'phase','chapterId',child->>'chapterId','rootStepId',root.id),root.max_attempts);
  FOR dependency IN SELECT value::text::integer FROM jsonb_array_elements(child->'dependsOn') LOOP
   IF dependency<0 OR dependency>=position_value OR p_children->dependency->>'phase'<>'chapter_search'
    OR p_children->dependency->>'chapterId' IS DISTINCT FROM child->>'chapterId' THEN
    RAISE EXCEPTION 'Invalid research prerequisite' USING ERRCODE='22023'; END IF;
   INSERT INTO libri.research_step_dependencies(library_id,run_id,step_id,prerequisite_step_id) VALUES(root.library_id,root.run_id,child_id,ids[dependency+1]);
  END LOOP;
  ids:=array_append(ids,child_id);position_value:=position_value+1;
 END LOOP;
 -- Every search has exactly one extractor; duplicate chapter stages are rejected.
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_children) item GROUP BY item->>'chapterId'
  HAVING count(*)<>2 OR count(*) FILTER(WHERE item->>'phase'='chapter_search')<>1 OR count(*) FILTER(WHERE item->>'phase'='chapter_extract')<>1) THEN
  RAISE EXCEPTION 'Incomplete or duplicate chapter workflow' USING ERRCODE='22023'; END IF;
 UPDATE libri.research_runs SET planned_steps=planned_steps+count_value,last_progress_at=clock_timestamp(),updated_at=clock_timestamp() WHERE id=root.run_id;
 RETURN jsonb_build_object('stepIds',to_jsonb(ids),'plannedCount',count_value);
END;
$function$;
REVOKE ALL ON FUNCTION libri.prepare_research_workflow(uuid,integer,uuid,jsonb) FROM PUBLIC,anon,authenticated,service_role,libri_worker,libri_frontend_reader;
GRANT EXECUTE ON FUNCTION libri.prepare_research_workflow(uuid,integer,uuid,jsonb) TO libri_worker;

CREATE OR REPLACE FUNCTION libri.acknowledge_research_task_dispatch(p_batch_id uuid)
 RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,libri
AS $function$
BEGIN
 -- Reviewed read-only shared-queue inspection. The only write is this Libri
 -- receipt after every immutable batch item has matching durable queue evidence.
 UPDATE libri.research_task_batches batch SET dispatched_at=coalesce(batch.dispatched_at,clock_timestamp())
 WHERE batch.id=p_batch_id
 AND batch.task_count=(SELECT count(*) FROM libri.research_task_batch_items item WHERE item.library_id=batch.library_id AND item.batch_id=batch.id)
 AND NOT EXISTS(
  SELECT 1 FROM libri.research_task_batch_items item
  LEFT JOIN libri.research_steps step ON step.library_id=item.library_id AND step.run_id=item.batch_id AND step.id=item.step_id
  LEFT JOIN public.queue_jobs queue ON queue.id=step.active_queue_job_id
  WHERE item.library_id=batch.library_id AND item.batch_id=batch.id
   AND (step.status='failed' AND step.error_class='libri_execution_authority_expired' AND step.active_queue_job_id IS NULL) IS NOT TRUE
   AND (
   step.id IS NULL OR queue.id IS NULL OR step.kind<>'task_execute' OR step.queue_family<>'libri_research'
   OR queue.dedup_key IS DISTINCT FROM 'libri:research-step:'||step.id::text
   OR queue.user_id IS DISTINCT FROM (SELECT created_by FROM libri.libraries WHERE id=batch.library_id)
   OR queue.metadata->>'payloadVersion' IS DISTINCT FROM step.payload_version::text
   OR queue.metadata->>'correlationId' IS DISTINCT FROM (SELECT correlation_id::text FROM libri.research_runs WHERE id=batch.id)
   OR ((step.status='queued' AND queue.status::text='pending')
    OR (step.status='leased' AND queue.status::text='processing' AND queue.processing_token=step.active_processing_token)
    OR (step.status='completed' AND queue.status::text='completed')
    OR (step.result->>'workflowVersion'='1' AND step.status IN ('waiting','failed','needs_review','dead_letter','cancelled','skipped') AND queue.status::text='completed' AND queue.result->>'awaitingChildren'='true')
    OR (step.status IN ('failed','needs_review','dead_letter','retry_wait') AND queue.status::text='failed')
    OR (step.status IN ('cancelled','skipped') AND queue.status::text='cancelled')) IS NOT TRUE
   OR queue.job_type::text<>'libri_research' OR queue.metadata->>'researchStepId' IS DISTINCT FROM step.id::text
   OR queue.metadata->>'researchRunId' IS DISTINCT FROM batch.id::text
   OR queue.metadata->>'libraryId' IS DISTINCT FROM batch.library_id::text
  )
 );
 RETURN FOUND;
END;
$function$;
REVOKE ALL ON FUNCTION libri.acknowledge_research_task_dispatch(uuid) FROM PUBLIC,anon,authenticated,service_role,libri_worker,libri_frontend_reader;
GRANT EXECUTE ON FUNCTION libri.acknowledge_research_task_dispatch(uuid) TO libri_worker;

NOTIFY pgrst,'reload schema';

-- Preserve the original app's in-progress DTO while the parent awaits its children.
CREATE OR REPLACE FUNCTION libri.read_research_queue_runs(p_library_id uuid,p_limit integer DEFAULT 50,p_run_id uuid DEFAULT NULL,p_status text DEFAULT NULL)
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
    coalesce(jsonb_agg(jsonb_build_object('taskId',item.task_id,'taskType',item.task_type,'title',item.task_title,'status',CASE WHEN step.status='waiting' THEN 'leased' ELSE step.status END,'attempts',step.attempts,'message',left(coalesce(step.result->>'message',step.error_message,''),1200)) ORDER BY step.position,item.step_id),'[]'::jsonb) AS results
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
