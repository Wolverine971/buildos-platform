-- libri-migration: true
-- libri-allow-security-definer: admit_research_task_batch, sync_research_task_outcome, pending_research_task_batches, acknowledge_research_task_dispatch, research_task_execution_allowed, reconcile_pending_research_tasks
-- libri-allow-public-read: queue_jobs
-- Current, explicitly selected tasks become bounded research runs. This creates
-- a durable dispatch outbox; it does not directly touch the shared queue.
SET lock_timeout='5s';
SET statement_timeout='60s';

CREATE TABLE libri.research_queue_controls (
 library_id uuid PRIMARY KEY REFERENCES libri.libraries(id) ON DELETE CASCADE,
 dispatch_enabled boolean NOT NULL DEFAULT false,
 supported_task_types text[] NOT NULL DEFAULT '{}',
 max_batch_tasks integer NOT NULL DEFAULT 10 CHECK(max_batch_tasks BETWEEN 1 AND 30),
 max_concurrent_steps integer NOT NULL DEFAULT 1 CHECK(max_concurrent_steps BETWEEN 1 AND 2),
 max_steps_per_task integer NOT NULL DEFAULT 60 CHECK(max_steps_per_task BETWEEN 1 AND 100),
 task_budget_microusd bigint NOT NULL DEFAULT 1000000 CHECK(task_budget_microusd BETWEEN 1 AND 10000000),
 daily_budget_microusd bigint NOT NULL DEFAULT 10000000 CHECK(daily_budget_microusd BETWEEN 1 AND 100000000),
 deadline_minutes integer NOT NULL DEFAULT 60 CHECK(deadline_minutes BETWEEN 1 AND 180),
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK(supported_task_types <@ ARRAY['scan_toc','find_book_info','find_youtube','find_podcasts','review_ocr','review_ai_content','deep_enrich_chapters','synthesize_book','generate_agent_profile','enrich_book']::text[])
);
ALTER TABLE libri.research_queue_controls ENABLE ROW LEVEL SECURITY;
ALTER TABLE libri.research_queue_controls FORCE ROW LEVEL SECURITY;
CREATE POLICY research_queue_controls_member_read ON libri.research_queue_controls FOR SELECT TO authenticated
 USING(EXISTS(SELECT 1 FROM libri.library_members m WHERE m.library_id=research_queue_controls.library_id AND m.user_id=(SELECT auth.uid())));
CREATE POLICY research_queue_controls_worker_read ON libri.research_queue_controls FOR SELECT TO libri_worker USING(true);
REVOKE ALL ON libri.research_queue_controls FROM PUBLIC,anon,authenticated,libri_worker,libri_frontend_reader;
GRANT SELECT ON libri.research_queue_controls TO authenticated,libri_worker;
GRANT ALL ON libri.research_queue_controls TO service_role;

CREATE TABLE libri.research_task_batches (
 id uuid PRIMARY KEY,
 library_id uuid NOT NULL,
 request_key uuid NOT NULL,
 requested_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 source text NOT NULL CHECK(source IN ('round_now','book_now','batch_now','task_now','scheduled_dispatch')),
 request_payload jsonb NOT NULL CHECK(jsonb_typeof(request_payload)='object'),
 task_count integer NOT NULL CHECK(task_count BETWEEN 1 AND 30),
 reserved_budget_microusd bigint NOT NULL CHECK(reserved_budget_microusd>0),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 dispatched_at timestamptz,
 UNIQUE(library_id,id),UNIQUE(library_id,request_key),
 FOREIGN KEY(library_id,id) REFERENCES libri.research_runs(library_id,id) ON DELETE CASCADE
);
CREATE INDEX research_task_batches_pending_idx ON libri.research_task_batches(library_id,created_at,id) WHERE dispatched_at IS NULL;
CREATE INDEX research_task_batches_daily_idx ON libri.research_task_batches(library_id,created_at) INCLUDE(reserved_budget_microusd);
CREATE INDEX research_task_batches_actor_idx ON libri.research_task_batches(requested_by) WHERE requested_by IS NOT NULL;
ALTER TABLE libri.research_task_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE libri.research_task_batches FORCE ROW LEVEL SECURITY;
CREATE POLICY research_task_batches_member_read ON libri.research_task_batches FOR SELECT TO authenticated
 USING(EXISTS(SELECT 1 FROM libri.library_members m WHERE m.library_id=research_task_batches.library_id AND m.user_id=(SELECT auth.uid())));
CREATE POLICY research_task_batches_worker_read ON libri.research_task_batches FOR SELECT TO libri_worker USING(true);
REVOKE ALL ON libri.research_task_batches FROM PUBLIC,anon,authenticated,libri_worker,libri_frontend_reader;
GRANT SELECT ON libri.research_task_batches TO authenticated,libri_worker;
GRANT ALL ON libri.research_task_batches TO service_role;

CREATE TABLE libri.research_task_batch_items (
 library_id uuid NOT NULL,batch_id uuid NOT NULL,step_id uuid NOT NULL,
 -- Snapshot identity survives later task/book deletion; live linkage is validated
 -- by admission and by the completion trigger's active_run_id comparison.
 task_id uuid NOT NULL,task_type text NOT NULL,task_title text NOT NULL,
 task_version timestamptz NOT NULL,
 PRIMARY KEY(batch_id,task_id),UNIQUE(library_id,batch_id,step_id),
 FOREIGN KEY(library_id,batch_id) REFERENCES libri.research_task_batches(library_id,id) ON DELETE CASCADE,
 FOREIGN KEY(library_id,batch_id,step_id) REFERENCES libri.research_steps(library_id,run_id,id) ON DELETE CASCADE
);
CREATE INDEX research_task_batch_items_task_idx ON libri.research_task_batch_items(library_id,task_id,batch_id);
ALTER TABLE libri.research_task_batch_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE libri.research_task_batch_items FORCE ROW LEVEL SECURITY;
CREATE POLICY research_task_batch_items_member_read ON libri.research_task_batch_items FOR SELECT TO authenticated
 USING(EXISTS(SELECT 1 FROM libri.library_members m WHERE m.library_id=research_task_batch_items.library_id AND m.user_id=(SELECT auth.uid())));
CREATE POLICY research_task_batch_items_worker_read ON libri.research_task_batch_items FOR SELECT TO libri_worker USING(true);
REVOKE ALL ON libri.research_task_batch_items FROM PUBLIC,anon,authenticated,libri_worker,libri_frontend_reader;
GRANT SELECT ON libri.research_task_batch_items TO authenticated,libri_worker;
GRANT ALL ON libri.research_task_batch_items TO service_role;

CREATE FUNCTION libri.admit_research_task_batch(p_library_id uuid,p_request_key uuid,p_source text,p_filters jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,libri
AS $function$
DECLARE
 actor_id uuid:=auth.uid();controls libri.research_queue_controls%ROWTYPE;
 previous libri.research_task_batches%ROWTYPE;task_row libri.research_tasks%ROWTYPE;
 field text;value jsonb;ids uuid[];selected_ids uuid[];selected_count integer;
 run_id uuid:=gen_random_uuid();step_id uuid;position_value integer:=0;
 budget bigint;already_reserved bigint;payload jsonb;
BEGIN
 IF actor_id IS NULL THEN RAISE EXCEPTION 'Library owner required' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM libri.library_members WHERE library_id=p_library_id AND user_id=actor_id AND role='owner' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Library owner required' USING ERRCODE='42501'; END IF;
 IF p_request_key IS NULL OR p_source IS NULL OR p_source NOT IN ('round_now','book_now','batch_now','task_now')
 OR p_filters IS NULL OR jsonb_typeof(p_filters)<>'object' OR octet_length(p_filters::text)>20000 THEN RAISE EXCEPTION 'Invalid research dispatch' USING ERRCODE='22023'; END IF;
 FOR field,value IN SELECT * FROM jsonb_each(p_filters) LOOP
  IF field NOT IN ('ids','bookId','type','priority','search') THEN RAISE EXCEPTION 'Unknown dispatch filter' USING ERRCODE='22023'; END IF;
  IF field='ids' THEN
   IF jsonb_typeof(value)<>'array' OR jsonb_array_length(value) NOT BETWEEN 1 AND 500 THEN RAISE EXCEPTION 'Invalid task selection' USING ERRCODE='22023'; END IF;
   IF EXISTS(SELECT 1 FROM jsonb_array_elements(value) item WHERE jsonb_typeof(item)<>'string') THEN RAISE EXCEPTION 'Invalid selected ID' USING ERRCODE='22023'; END IF;
   SELECT array_agg(DISTINCT item::uuid ORDER BY item::uuid) INTO ids FROM jsonb_array_elements_text(value) item;
   IF cardinality(ids)<>jsonb_array_length(value) THEN RAISE EXCEPTION 'Duplicate task selection' USING ERRCODE='22023'; END IF;
  ELSIF jsonb_typeof(value)<>'string' OR length(value#>>'{}')>200 THEN RAISE EXCEPTION 'Invalid dispatch filter' USING ERRCODE='22023'; END IF;
 END LOOP;
 IF p_filters ? 'type' AND p_filters->>'type' NOT IN ('scan_toc','find_book_info','find_youtube','find_podcasts','review_ocr','review_ai_content','deep_enrich_chapters','synthesize_book','generate_agent_profile','enrich_book','scan_pages','paste_text','paste_transcript','custom') THEN RAISE EXCEPTION 'Invalid task type' USING ERRCODE='22023'; END IF;
 IF p_filters ? 'priority' AND p_filters->>'priority' NOT IN ('critical','high','medium','low') THEN RAISE EXCEPTION 'Invalid task priority' USING ERRCODE='22023'; END IF;
 IF (p_source='book_now' AND NOT p_filters ? 'bookId') OR (p_source IN ('batch_now','task_now') AND ids IS NULL)
 OR (p_source='task_now' AND cardinality(ids)<>1) THEN RAISE EXCEPTION 'Dispatch subject required' USING ERRCODE='22023'; END IF;
 payload:=jsonb_build_object('source',p_source,'filters',p_filters);
 PERFORM 1 FROM libri.libraries WHERE id=p_library_id FOR UPDATE;
 SELECT * INTO previous FROM libri.research_task_batches WHERE library_id=p_library_id AND request_key=p_request_key;
 IF FOUND THEN
  IF previous.requested_by IS DISTINCT FROM actor_id OR previous.request_payload<>payload THEN RAISE EXCEPTION 'Dispatch key belongs to another request' USING ERRCODE='40001'; END IF;
  RETURN jsonb_build_object('runId',previous.id,'selectedCount',previous.task_count,'deduped',true);
 END IF;
 SELECT * INTO controls FROM libri.research_queue_controls WHERE library_id=p_library_id FOR UPDATE;
 IF NOT FOUND OR NOT controls.dispatch_enabled THEN RAISE EXCEPTION 'Research dispatch is disabled' USING ERRCODE='55000'; END IF;
 IF p_filters ? 'bookId' AND NOT EXISTS(SELECT 1 FROM libri.books WHERE library_id=p_library_id AND id=(p_filters->>'bookId')::uuid) THEN RAISE EXCEPTION 'Invalid dispatch book' USING ERRCODE='22023'; END IF;
 IF ids IS NOT NULL AND (SELECT count(*) FROM libri.research_tasks WHERE library_id=p_library_id AND id=ANY(ids))<>cardinality(ids) THEN RAISE EXCEPTION 'Invalid dispatch selection' USING ERRCODE='22023'; END IF;
 SELECT array_agg(chosen.id ORDER BY chosen.rank,chosen.created_at,chosen.id) INTO selected_ids FROM (
  SELECT t.id,t.created_at,CASE t.priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END AS rank
  FROM libri.research_tasks t LEFT JOIN libri.books b ON b.library_id=t.library_id AND b.id=t.book_id WHERE t.library_id=p_library_id AND t.status='pending' AND t.active_run_id IS NULL
   AND t.task_type=ANY(controls.supported_task_types) AND (NOT t.requires_confirmation OR t.confirmed_at IS NOT NULL)
   AND (ids IS NULL OR t.id=ANY(ids)) AND (NOT p_filters ? 'bookId' OR t.book_id=(p_filters->>'bookId')::uuid)
   AND (NOT p_filters ? 'type' OR t.task_type=p_filters->>'type') AND (NOT p_filters ? 'priority' OR t.priority=p_filters->>'priority')
   AND (NOT p_filters ? 'search' OR strpos(lower(concat_ws(' ',t.title,t.description,t.result_message,b.title)),lower(btrim(p_filters->>'search')))>0)
  ORDER BY rank,t.created_at,t.id LIMIT controls.max_batch_tasks FOR UPDATE OF t
 ) chosen;
 selected_count:=coalesce(cardinality(selected_ids),0);
 IF selected_count=0 THEN RETURN jsonb_build_object('runId',NULL,'selectedCount',0,'deduped',false); END IF;
 budget:=selected_count*controls.task_budget_microusd;
 SELECT coalesce(sum(reserved_budget_microusd),0) INTO already_reserved FROM libri.research_task_batches
 WHERE library_id=p_library_id AND created_at>=date_trunc('day',clock_timestamp() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
 IF already_reserved+budget>controls.daily_budget_microusd THEN RAISE EXCEPTION 'Daily research admission budget exhausted' USING ERRCODE='54000'; END IF;
 INSERT INTO libri.research_runs(id,library_id,idempotency_key,queue_family,kind,subject_type,subject_id,requested_by,
  max_steps,max_depth,max_sources,max_attempts_per_step,max_concurrent_steps,cost_budget_microusd,deadline_at,planned_steps,plan)
 VALUES(run_id,p_library_id,'task-batch:'||p_request_key,'libri_research','task_batch','library',p_library_id,actor_id,
  selected_count*controls.max_steps_per_task,4,50,3,controls.max_concurrent_steps,budget,
  clock_timestamp()+make_interval(mins=>controls.deadline_minutes),selected_count,jsonb_build_object('version',1,'source',p_source,'taskIds',to_jsonb(selected_ids)));
 INSERT INTO libri.research_task_batches(id,library_id,request_key,requested_by,source,request_payload,task_count,reserved_budget_microusd)
 VALUES(run_id,p_library_id,p_request_key,actor_id,p_source,payload,selected_count,budget);
 FOREACH field IN ARRAY selected_ids::text[] LOOP
  SELECT * INTO task_row FROM libri.research_tasks WHERE library_id=p_library_id AND id=field::uuid FOR UPDATE;
  step_id:=gen_random_uuid();
  INSERT INTO libri.research_steps(id,library_id,run_id,idempotency_key,queue_family,kind,stage,position,priority,payload)
  VALUES(step_id,p_library_id,run_id,'task:'||task_row.id,'libri_research','task_execute','resolve_subject',position_value,
   CASE task_row.priority WHEN 'critical' THEN 1 WHEN 'high' THEN 25 WHEN 'medium' THEN 100 ELSE 200 END,
   jsonb_build_object('version',1,'kind','task_execute','taskId',task_row.id,'taskType',task_row.task_type,'bookId',task_row.book_id,'chapterId',task_row.chapter_id,'videoId',task_row.video_id,'mode',task_row.mode));
  INSERT INTO libri.research_task_batch_items(library_id,batch_id,step_id,task_id,task_type,task_title,task_version)
  VALUES(p_library_id,run_id,step_id,task_row.id,task_row.task_type,task_row.title,task_row.updated_at);
  UPDATE libri.research_tasks SET active_run_id=run_id,status='in_progress',completed_at=NULL,result_message='Queued for the research worker.' WHERE library_id=p_library_id AND id=task_row.id;
  position_value:=position_value+1;
 END LOOP;
 INSERT INTO libri.activity_events(library_id,actor_user_id,event_type,source,message)
 VALUES(p_library_id,actor_id,'admin.action','researchTasks.dispatch',format('Queued %s research task(s).',selected_count));
 RETURN jsonb_build_object('runId',run_id,'selectedCount',selected_count,'deduped',false);
END;
$function$;
REVOKE ALL ON FUNCTION libri.admit_research_task_batch(uuid,uuid,text,jsonb) FROM PUBLIC,anon,authenticated,service_role,libri_worker,libri_frontend_reader;
GRANT EXECUTE ON FUNCTION libri.admit_research_task_batch(uuid,uuid,text,jsonb) TO authenticated;

CREATE FUNCTION libri.sync_research_task_outcome() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,libri
AS $function$
DECLARE task_identity uuid;
BEGIN
 IF NEW.kind<>'task_execute' OR NEW.status=OLD.status OR NEW.status NOT IN ('completed','failed','cancelled','skipped','needs_review','dead_letter') THEN RETURN NEW; END IF;
 SELECT task_id INTO task_identity FROM libri.research_task_batch_items WHERE library_id=NEW.library_id AND batch_id=NEW.run_id AND step_id=NEW.id;
 IF task_identity IS NULL THEN RETURN NEW; END IF;
 UPDATE libri.research_tasks SET
  status=CASE NEW.status WHEN 'completed' THEN 'complete' WHEN 'cancelled' THEN 'skipped' WHEN 'skipped' THEN 'skipped' ELSE 'blocked' END,
  completed_at=CASE WHEN NEW.status IN ('completed','cancelled','skipped') THEN clock_timestamp() ELSE NULL END,
  result_message=left(coalesce(NEW.result->>'message',NEW.error_message,CASE WHEN NEW.status='completed' THEN 'Research completed.' ELSE 'Research requires attention.' END),1200),
  active_run_id=NULL
 WHERE library_id=NEW.library_id AND id=task_identity AND active_run_id=NEW.run_id;
 RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION libri.sync_research_task_outcome() FROM PUBLIC,anon,authenticated,service_role,libri_worker,libri_frontend_reader;
CREATE TRIGGER research_steps_sync_task_outcome AFTER UPDATE ON libri.research_steps
 FOR EACH ROW EXECUTE FUNCTION libri.sync_research_task_outcome();

CREATE FUNCTION libri.research_task_execution_allowed(p_step_id uuid)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,libri
AS $function$
 SELECT EXISTS(
  SELECT 1 FROM libri.research_steps step
  JOIN libri.research_runs run ON run.library_id=step.library_id AND run.id=step.run_id
  JOIN libri.research_task_batches batch ON batch.library_id=run.library_id AND batch.id=run.id
  JOIN libri.research_queue_controls controls ON controls.library_id=run.library_id AND controls.dispatch_enabled
  JOIN libri.library_members member ON member.library_id=batch.library_id AND member.user_id=batch.requested_by AND member.role='owner'
  WHERE step.id=p_step_id AND run.kind='task_batch' AND run.queue_family='libri_research'
   AND run.status IN ('queued','running') AND run.cancel_requested_at IS NULL AND run.deadline_at>clock_timestamp()
   AND step.payload->>'taskType'=ANY(controls.supported_task_types)
 );
$function$;
REVOKE ALL ON FUNCTION libri.research_task_execution_allowed(uuid) FROM PUBLIC,anon,authenticated,service_role,libri_worker,libri_frontend_reader;
GRANT EXECUTE ON FUNCTION libri.research_task_execution_allowed(uuid) TO libri_worker;

-- Retire admitted work that lost authority before it ever reached the queue.
-- Already queued work is fenced by claim; leased provider work uses its own fence.
CREATE FUNCTION libri.reconcile_pending_research_tasks(p_limit integer DEFAULT 30)
 RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,libri
AS $function$
DECLARE target record; retired integer:=0;
BEGIN
 IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Invalid reconciliation limit' USING ERRCODE='22023'; END IF;
 FOR target IN
  SELECT step.id,step.run_id FROM libri.research_steps step
  JOIN libri.research_runs run ON run.library_id=step.library_id AND run.id=step.run_id
  JOIN libri.research_task_batches batch ON batch.library_id=run.library_id AND batch.id=run.id
  WHERE run.kind='task_batch' AND run.status IN ('queued','running')
   AND step.status IN ('pending','retry_wait') AND step.active_queue_job_id IS NULL
   AND NOT libri.research_task_execution_allowed(step.id)
  ORDER BY step.created_at,step.id LIMIT p_limit FOR UPDATE OF step,run SKIP LOCKED
 LOOP
  UPDATE libri.research_steps SET status='failed',completed_at=clock_timestamp(),
   error_class='libri_execution_authority_expired',error_message='Research permission, configuration, or deadline changed before execution.',updated_at=clock_timestamp()
  WHERE id=target.id;
  UPDATE libri.research_runs SET failed_steps=failed_steps+1,updated_at=clock_timestamp() WHERE id=target.run_id;
  UPDATE libri.research_runs SET status=CASE WHEN completed_steps>0 THEN 'partial' ELSE 'failed' END,
   finished_at=clock_timestamp(),updated_at=clock_timestamp()
  WHERE id=target.run_id AND NOT EXISTS(SELECT 1 FROM libri.research_steps WHERE run_id=target.run_id
   AND status NOT IN ('completed','failed','cancelled','skipped','needs_review','dead_letter'));
  retired:=retired+1;
 END LOOP;
 RETURN retired;
END;
$function$;
REVOKE ALL ON FUNCTION libri.reconcile_pending_research_tasks(integer) FROM PUBLIC,anon,authenticated,service_role,libri_worker,libri_frontend_reader;
GRANT EXECUTE ON FUNCTION libri.reconcile_pending_research_tasks(integer) TO libri_worker;

CREATE FUNCTION libri.pending_research_task_batches(p_limit integer DEFAULT 5)
 RETURNS TABLE(batch_id uuid,library_id uuid,step_ids uuid[])
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,libri
AS $function$
BEGIN
 IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 20 THEN RAISE EXCEPTION 'Invalid dispatch limit' USING ERRCODE='22023'; END IF;
 RETURN QUERY SELECT batch.id,batch.library_id,array_agg(item.step_id ORDER BY step.position,item.step_id)
 FROM libri.research_task_batches batch
 JOIN libri.research_runs run ON run.library_id=batch.library_id AND run.id=batch.id
 JOIN libri.research_queue_controls controls ON controls.library_id=batch.library_id AND controls.dispatch_enabled
 JOIN libri.library_members member ON member.library_id=batch.library_id AND member.user_id=batch.requested_by AND member.role='owner'
 JOIN libri.research_task_batch_items item ON item.library_id=batch.library_id AND item.batch_id=batch.id
 JOIN libri.research_steps step ON step.library_id=item.library_id AND step.run_id=item.batch_id AND step.id=item.step_id
 WHERE batch.dispatched_at IS NULL AND run.kind='task_batch' AND run.status IN ('queued','running')
  AND run.cancel_requested_at IS NULL AND run.deadline_at>clock_timestamp()
 GROUP BY batch.id,batch.library_id,batch.created_at,batch.task_count
 HAVING count(*)=batch.task_count AND bool_and(libri.research_task_execution_allowed(step.id) OR (step.status='failed' AND step.error_class='libri_execution_authority_expired' AND step.active_queue_job_id IS NULL))
 ORDER BY batch.created_at,batch.id LIMIT p_limit;
END;
$function$;
REVOKE ALL ON FUNCTION libri.pending_research_task_batches(integer) FROM PUBLIC,anon,authenticated,service_role,libri_worker,libri_frontend_reader;
GRANT EXECUTE ON FUNCTION libri.pending_research_task_batches(integer) TO libri_worker;

CREATE FUNCTION libri.acknowledge_research_task_dispatch(p_batch_id uuid)
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
