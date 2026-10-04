-- libri-migration: true
-- libri-allow-security-definer: enqueue_book_research
-- Original book-page actions become one owner-authorized, idempotent transaction.
-- Controls remain disabled; only installed processors can be admitted.
SET lock_timeout='5s';
SET statement_timeout='60s';
CREATE TABLE libri.book_research_requests (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 library_id uuid NOT NULL REFERENCES libri.libraries(id) ON DELETE CASCADE,
 request_key uuid NOT NULL,
 requested_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 request_payload jsonb NOT NULL CHECK(jsonb_typeof(request_payload)='object'),
 receipt jsonb NOT NULL CHECK(jsonb_typeof(receipt)='object'),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(library_id,request_key)
);
CREATE INDEX book_research_requests_actor_idx ON libri.book_research_requests(requested_by) WHERE requested_by IS NOT NULL;
ALTER TABLE libri.book_research_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE libri.book_research_requests FORCE ROW LEVEL SECURITY;
CREATE POLICY book_research_requests_owner_read ON libri.book_research_requests FOR SELECT TO authenticated
 USING(requested_by=(SELECT auth.uid()) AND EXISTS(SELECT 1 FROM libri.library_members m WHERE m.library_id=book_research_requests.library_id AND m.user_id=(SELECT auth.uid()) AND m.role='owner'));
REVOKE ALL ON libri.book_research_requests FROM PUBLIC,anon,authenticated,libri_worker,libri_frontend_reader;
GRANT SELECT ON libri.book_research_requests TO authenticated;
GRANT ALL ON libri.book_research_requests TO service_role;

CREATE FUNCTION libri.enqueue_book_research(p_library_id uuid,p_request_key uuid,p_book_id uuid,p_action text,p_mode text DEFAULT 'gaps',p_priority text DEFAULT 'medium')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,libri
AS $function$
DECLARE actor_id uuid:=auth.uid(); payload jsonb; receipt jsonb; previous libri.book_research_requests%ROWTYPE;
 controls libri.research_queue_controls%ROWTYPE; task libri.research_tasks%ROWTYPE;
 book libri.books%ROWTYPE; task_type_value text; title_value text; deduped boolean;
BEGIN
 IF actor_id IS NULL THEN RAISE EXCEPTION 'Library owner required' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM libri.library_members WHERE library_id=p_library_id AND user_id=actor_id AND role='owner' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Library owner required' USING ERRCODE='42501'; END IF;
 IF p_request_key IS NULL OR p_book_id IS NULL OR p_action IS NULL OR p_action NOT IN ('book_synthesis','agent_profile')
  OR p_mode IS NULL OR p_mode NOT IN ('missing','gaps','force') OR p_priority IS NULL OR p_priority NOT IN ('critical','high','medium','low') THEN
  RAISE EXCEPTION 'Invalid book research request' USING ERRCODE='22023';
 END IF;
 payload:=jsonb_build_object('bookId',p_book_id,'action',p_action,'mode',p_mode,'priority',p_priority);
 -- Match task editing/admission lock order; serializes first-use receipts and active-task dedupe.
 PERFORM 1 FROM libri.libraries WHERE id=p_library_id FOR UPDATE;
 SELECT * INTO previous FROM libri.book_research_requests WHERE library_id=p_library_id AND request_key=p_request_key;
 IF FOUND THEN
  IF previous.requested_by IS DISTINCT FROM actor_id OR previous.request_payload IS DISTINCT FROM payload THEN
   RAISE EXCEPTION 'Request key belongs to another operation' USING ERRCODE='40001';
  END IF;
  RETURN previous.receipt||jsonb_build_object('deduped',true);
 END IF;
 SELECT * INTO controls FROM libri.research_queue_controls WHERE library_id=p_library_id FOR UPDATE;
 task_type_value:=CASE p_action WHEN 'book_synthesis' THEN 'synthesize_book' ELSE 'generate_agent_profile' END;
 IF NOT FOUND OR NOT controls.dispatch_enabled OR NOT task_type_value=ANY(controls.supported_task_types) THEN
  RAISE EXCEPTION 'Book research processor is disabled' USING ERRCODE='55000';
 END IF;
 SELECT * INTO book FROM libri.books WHERE library_id=p_library_id AND id=p_book_id FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Book unavailable' USING ERRCODE='22023'; END IF;
 SELECT * INTO task FROM libri.research_tasks WHERE library_id=p_library_id AND book_id=p_book_id AND chapter_id IS NULL AND video_id IS NULL
  AND task_type=task_type_value AND mode=p_mode AND status IN ('pending','in_progress') AND (NOT requires_confirmation OR confirmed_at IS NOT NULL)
  ORDER BY created_at,id LIMIT 1 FOR UPDATE;
 deduped:=FOUND;
 IF NOT deduped THEN
  title_value:=CASE p_action WHEN 'book_synthesis' THEN 'Synthesize book analysis' ELSE 'Generate agent profile prompt' END;
  INSERT INTO libri.research_tasks(library_id,book_id,task_type,priority,title,description,created_by,creation_key,creation_payload,mode)
  VALUES(p_library_id,p_book_id,task_type_value,p_priority,title_value||CASE p_mode WHEN 'force' THEN ' (force)' WHEN 'missing' THEN ' (missing only)' ELSE '' END,
   'Queued from the book page.',actor_id,p_request_key,payload,p_mode) RETURNING * INTO task;
 END IF;
 IF task.active_run_id IS NULL THEN
  receipt:=libri.admit_research_task_batch(p_library_id,p_request_key,'task_now',jsonb_build_object('ids',jsonb_build_array(task.id)));
  IF (receipt->>'selectedCount')::integer IS DISTINCT FROM 1 THEN RAISE EXCEPTION 'Book research was not admitted' USING ERRCODE='40001'; END IF;
 ELSE
  receipt:=jsonb_build_object('runId',task.active_run_id,'selectedCount',1);
 END IF;
 receipt:=receipt||jsonb_build_object('queued',true,'taskId',task.id,'taskType',task_type_value,'deduped',deduped,
  'message',CASE WHEN deduped THEN 'This book research is already queued or running.' ELSE 'Book research queued. Follow progress in Research Queue.' END);
 INSERT INTO libri.book_research_requests(library_id,request_key,requested_by,request_payload,receipt)
 VALUES(p_library_id,p_request_key,actor_id,payload,receipt);
 RETURN receipt;
END;
$function$;
REVOKE ALL ON FUNCTION libri.enqueue_book_research(uuid,uuid,uuid,text,text,text) FROM PUBLIC,anon,authenticated,service_role,libri_worker,libri_frontend_reader;
GRANT EXECUTE ON FUNCTION libri.enqueue_book_research(uuid,uuid,uuid,text,text,text) TO authenticated;
