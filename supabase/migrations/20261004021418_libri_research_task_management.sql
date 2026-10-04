-- libri-migration: true
-- libri-allow-security-definer: manage_research_tasks
-- Task planning/manual status management only. No queue admission or provider calls.
SET lock_timeout='5s';
SET statement_timeout='60s';

CREATE TABLE libri.research_tasks (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 library_id uuid NOT NULL REFERENCES libri.libraries(id) ON DELETE CASCADE,
 book_id uuid, chapter_id uuid, video_id uuid,
 task_type text NOT NULL CHECK (task_type IN ('scan_toc','scan_pages','find_book_info','find_youtube','find_podcasts','review_ocr','review_ai_content','deep_enrich_chapters','synthesize_book','generate_agent_profile','enrich_book','paste_text','paste_transcript','custom')),
 status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','in_progress','complete','skipped','blocked')),
 priority text NOT NULL CHECK (priority IN ('critical','high','medium','low')),
 title text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 240),
 description text CHECK (length(description)<=5000),
 source text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','auto_gap','auto_librarian')),
 created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 creation_key uuid NOT NULL,
 creation_payload jsonb NOT NULL CHECK (jsonb_typeof(creation_payload)='object'),
 requires_confirmation boolean NOT NULL DEFAULT false,
 confirmed_at timestamptz,
 mode text NOT NULL DEFAULT 'missing' CHECK (mode IN ('missing','gaps','force')),
 result_message text CHECK (length(result_message)<=1200),
 data_added boolean, skipped_reason text CHECK (length(skipped_reason)<=1200),
 active_run_id uuid,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 completed_at timestamptz,
 UNIQUE(library_id,id), UNIQUE(library_id,creation_key),
 FOREIGN KEY(library_id,book_id) REFERENCES libri.books(library_id,id) ON DELETE CASCADE,
 FOREIGN KEY(library_id,book_id,chapter_id) REFERENCES libri.chapters(library_id,book_id,id) ON DELETE CASCADE,
 FOREIGN KEY(library_id,video_id) REFERENCES libri.youtube_videos(library_id,id) ON DELETE CASCADE,
 FOREIGN KEY(library_id,active_run_id) REFERENCES libri.research_runs(library_id,id),
 CHECK (chapter_id IS NULL OR book_id IS NOT NULL),
 CHECK ((status IN ('complete','skipped'))=(completed_at IS NOT NULL))
);
CREATE INDEX research_tasks_library_status_idx ON libri.research_tasks(library_id,status,priority,created_at,id);
CREATE INDEX research_tasks_library_book_idx ON libri.research_tasks(library_id,book_id,updated_at DESC);
CREATE INDEX research_tasks_library_video_idx ON libri.research_tasks(library_id,video_id);
CREATE INDEX research_tasks_library_chapter_idx ON libri.research_tasks(library_id,book_id,chapter_id);
CREATE INDEX research_tasks_active_run_idx ON libri.research_tasks(library_id,active_run_id) WHERE active_run_id IS NOT NULL;
CREATE INDEX research_tasks_creator_idx ON libri.research_tasks(created_by) WHERE created_by IS NOT NULL;
CREATE TRIGGER research_tasks_set_updated_at BEFORE UPDATE ON libri.research_tasks
 FOR EACH ROW EXECUTE FUNCTION libri.set_updated_at();
ALTER TABLE libri.research_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE libri.research_tasks FORCE ROW LEVEL SECURITY;
CREATE POLICY research_tasks_member_read ON libri.research_tasks FOR SELECT TO authenticated
 USING (EXISTS (SELECT 1 FROM libri.library_members m WHERE m.library_id=research_tasks.library_id AND m.user_id=(SELECT auth.uid())));
REVOKE ALL ON libri.research_tasks FROM PUBLIC,anon,authenticated,libri_worker,libri_frontend_reader;
GRANT SELECT ON libri.research_tasks TO authenticated;
GRANT ALL ON libri.research_tasks TO service_role;

-- A manual library-level task can legitimately have no book. Other event types
-- retain their original subject requirements.
ALTER TABLE libri.activity_events DROP CONSTRAINT activity_events_subject;
ALTER TABLE libri.activity_events ADD CONSTRAINT activity_events_subject CHECK (
 (event_type IN ('search.query','domain.filtered') AND book_id IS NULL AND chapter_id IS NULL)
 OR (event_type IN ('book.viewed','chapter.viewed','note.created','book.updated') AND book_id IS NOT NULL)
 OR (event_type='admin.action' AND (chapter_id IS NULL OR book_id IS NOT NULL))
);

CREATE FUNCTION libri.manage_research_tasks(p_library_id uuid,p_action text,p_payload jsonb)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,libri
AS $function$
DECLARE
 actor_id uuid:=auth.uid();
 entry jsonb; changes jsonb; field text; value jsonb; normalized jsonb;
 task_row libri.research_tasks%ROWTYPE; book_row libri.books%ROWTYPE;
 subject_book uuid; subject_chapter uuid; subject_video uuid;
 request_key uuid; expected_version timestamptz; ids uuid[]; task_id uuid;
 receipts jsonb:='[]'::jsonb; count_value integer:=0; event_source text;
BEGIN
 IF actor_id IS NULL THEN RAISE EXCEPTION 'Library owner required' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM libri.library_members WHERE library_id=p_library_id AND user_id=actor_id AND role='owner' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Library owner required' USING ERRCODE='42501'; END IF;
 IF p_action IS NULL OR p_action NOT IN ('create','update') OR p_payload IS NULL
 OR jsonb_typeof(p_payload)<>'object' OR octet_length(p_payload::text)>60000 THEN
   RAISE EXCEPTION 'Invalid task request' USING ERRCODE='22023';
 END IF;
 -- Serialize bounded task mutations across owners, including first-use idempotency.
 -- Future dispatch must lock this same library row before task rows.
 PERFORM 1 FROM libri.libraries WHERE id=p_library_id FOR UPDATE;
 IF p_action='create' THEN
   IF EXISTS (SELECT 1 FROM jsonb_object_keys(p_payload) k WHERE k NOT IN ('bookId','chapterId','videoId','type','priority','title','description','idempotencyKey','requiresUserConfirmation')) THEN
     RAISE EXCEPTION 'Unsupported task field' USING ERRCODE='22023';
   END IF;
   FOREACH field IN ARRAY ARRAY['type','priority','title','idempotencyKey'] LOOP
     IF jsonb_typeof(p_payload->field) IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'Missing task field' USING ERRCODE='22023'; END IF;
   END LOOP;
   FOREACH field IN ARRAY ARRAY['bookId','chapterId','videoId','description'] LOOP
     IF p_payload ? field AND jsonb_typeof(p_payload->field) IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'Invalid task field' USING ERRCODE='22023'; END IF;
   END LOOP;
   IF p_payload ? 'requiresUserConfirmation' AND jsonb_typeof(p_payload->'requiresUserConfirmation')<>'boolean' THEN RAISE EXCEPTION 'Invalid confirmation' USING ERRCODE='22023'; END IF;
   request_key:=(p_payload->>'idempotencyKey')::uuid;
   subject_book:=(p_payload->>'bookId')::uuid; subject_chapter:=(p_payload->>'chapterId')::uuid; subject_video:=(p_payload->>'videoId')::uuid;
   normalized:=jsonb_strip_nulls(jsonb_build_object('bookId',subject_book,'chapterId',subject_chapter,'videoId',subject_video,
    'type',p_payload->>'type','priority',p_payload->>'priority','title',btrim(p_payload->>'title'),
    'description',nullif(btrim(p_payload->>'description'),''),'requiresUserConfirmation',coalesce((p_payload->>'requiresUserConfirmation')::boolean,false)));
   SELECT * INTO task_row FROM libri.research_tasks WHERE library_id=p_library_id AND creation_key=request_key;
   IF FOUND THEN
     IF task_row.creation_payload<>normalized OR task_row.created_by IS DISTINCT FROM actor_id THEN RAISE EXCEPTION 'Idempotency key belongs to a different request' USING ERRCODE='40001'; END IF;
     RETURN jsonb_build_object('id',task_row.id,'deduped',true,'updatedAt',task_row.updated_at);
   END IF;
   IF subject_book IS NOT NULL THEN
     SELECT * INTO book_row FROM libri.books WHERE library_id=p_library_id AND id=subject_book FOR SHARE;
     IF NOT FOUND THEN RAISE EXCEPTION 'Invalid task book' USING ERRCODE='22023'; END IF;
   END IF;
   IF subject_chapter IS NOT NULL THEN
     PERFORM 1 FROM libri.chapters WHERE library_id=p_library_id AND book_id=subject_book AND id=subject_chapter FOR SHARE;
     IF NOT FOUND THEN RAISE EXCEPTION 'Invalid task chapter' USING ERRCODE='22023'; END IF;
   END IF;
   IF subject_video IS NOT NULL THEN
     PERFORM 1 FROM libri.youtube_videos WHERE library_id=p_library_id AND id=subject_video FOR SHARE;
     IF NOT FOUND THEN RAISE EXCEPTION 'Invalid task video' USING ERRCODE='22023'; END IF;
   END IF;
   INSERT INTO libri.research_tasks(library_id,book_id,chapter_id,video_id,task_type,priority,title,description,created_by,creation_key,creation_payload,requires_confirmation)
   VALUES(p_library_id,subject_book,subject_chapter,subject_video,normalized->>'type',normalized->>'priority',normalized->>'title',normalized->>'description',actor_id,request_key,normalized,(normalized->>'requiresUserConfirmation')::boolean)
   RETURNING * INTO task_row;
   INSERT INTO libri.activity_events(library_id,actor_user_id,event_type,source,book_id,book_slug,book_title,chapter_id,message)
   VALUES(p_library_id,actor_id,'admin.action','researchTasks.create',subject_book,left(book_row.slug,180),left(book_row.title,240),subject_chapter,left(format('Created research task "%s".',task_row.title),400));
   RETURN jsonb_build_object('id',task_row.id,'deduped',false,'updatedAt',task_row.updated_at);
 END IF;
 IF EXISTS (SELECT 1 FROM jsonb_object_keys(p_payload) k WHERE k NOT IN ('tasks','changes'))
 OR jsonb_typeof(p_payload->'tasks') IS DISTINCT FROM 'array'
 OR jsonb_typeof(p_payload->'changes') IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Invalid task edits' USING ERRCODE='22023'; END IF;
 IF jsonb_array_length(p_payload->'tasks') NOT BETWEEN 1 AND 500 THEN RAISE EXCEPTION 'Use 1 to 500 task edits' USING ERRCODE='22023'; END IF;
 changes:=p_payload->'changes';
 IF changes='{}'::jsonb THEN RAISE EXCEPTION 'No task changes' USING ERRCODE='22023'; END IF;
 FOR field,value IN SELECT * FROM jsonb_each(changes) LOOP
   IF field NOT IN ('status','priority','resultMessage','dataAdded','skippedReason') THEN RAISE EXCEPTION 'Unsupported task change' USING ERRCODE='22023'; END IF;
   IF field='dataAdded' THEN
     IF jsonb_typeof(value)<>'boolean' THEN RAISE EXCEPTION 'Invalid task result' USING ERRCODE='22023'; END IF;
   ELSIF jsonb_typeof(value)<>'string' OR length(value#>>'{}')>1200 THEN RAISE EXCEPTION 'Invalid task text' USING ERRCODE='22023'; END IF;
 END LOOP;
 FOR entry IN SELECT * FROM jsonb_array_elements(p_payload->'tasks') LOOP
   IF jsonb_typeof(entry)<>'object' OR (SELECT count(*) FROM jsonb_object_keys(entry))<>2
   OR jsonb_typeof(entry->'id') IS DISTINCT FROM 'string' OR jsonb_typeof(entry->'expectedUpdatedAt') IS DISTINCT FROM 'string' THEN
     RAISE EXCEPTION 'Exact task versions required' USING ERRCODE='22023';
   END IF;
   task_id:=(entry->>'id')::uuid;
   expected_version:=(entry->>'expectedUpdatedAt')::timestamptz;
   IF NOT isfinite(expected_version) OR task_id=ANY(ids) THEN RAISE EXCEPTION 'Invalid or duplicate task version' USING ERRCODE='22023'; END IF;
   ids:=array_append(ids,task_id);
 END LOOP;
 -- Deterministic order plus a single transaction makes bulk changes all-or-nothing.
 FOR task_id IN SELECT unnest(ids) ORDER BY 1 LOOP
   SELECT * INTO task_row FROM libri.research_tasks WHERE library_id=p_library_id AND id=task_id FOR UPDATE;
   SELECT (item->>'expectedUpdatedAt')::timestamptz INTO expected_version FROM jsonb_array_elements(p_payload->'tasks') item WHERE (item->>'id')::uuid=task_id;
   IF NOT FOUND OR task_row.id IS NULL OR task_row.updated_at IS DISTINCT FROM expected_version THEN RAISE EXCEPTION 'Task changed; reload before saving' USING ERRCODE='40001'; END IF;
   IF task_row.active_run_id IS NOT NULL THEN RAISE EXCEPTION 'A worker run owns this task; cancel or wait before editing' USING ERRCODE='40001'; END IF;
   UPDATE libri.research_tasks SET
    status=coalesce(changes->>'status',status),priority=coalesce(changes->>'priority',priority),
    result_message=CASE WHEN changes ? 'resultMessage' THEN nullif(btrim(changes->>'resultMessage'),'') ELSE result_message END,
    data_added=CASE WHEN changes ? 'dataAdded' THEN (changes->>'dataAdded')::boolean ELSE data_added END,
    skipped_reason=CASE WHEN changes ? 'skippedReason' THEN nullif(btrim(changes->>'skippedReason'),'') ELSE skipped_reason END,
    completed_at=CASE WHEN coalesce(changes->>'status',status) IN ('complete','skipped') THEN coalesce(completed_at,clock_timestamp()) ELSE NULL END
   WHERE library_id=p_library_id AND id=task_id RETURNING * INTO task_row;
   SELECT * INTO book_row FROM libri.books WHERE library_id=p_library_id AND id=task_row.book_id;
   event_source:=CASE WHEN cardinality(ids)=1 THEN 'researchTasks.update' ELSE 'researchTasks.bulkUpdate' END;
   INSERT INTO libri.activity_events(library_id,actor_user_id,event_type,source,book_id,book_slug,book_title,chapter_id,message)
   VALUES(p_library_id,actor_id,'admin.action',event_source,task_row.book_id,left(book_row.slug,180),left(book_row.title,240),task_row.chapter_id,left(format('Updated research task "%s".',task_row.title),400));
   receipts:=receipts||jsonb_build_array(jsonb_build_object('id',task_id,'updatedAt',task_row.updated_at)); count_value:=count_value+1;
 END LOOP;
 RETURN jsonb_build_object('updated',count_value,'tasks',receipts);
END;
$function$;
REVOKE ALL ON FUNCTION libri.manage_research_tasks(uuid,text,jsonb) FROM PUBLIC,anon,authenticated,service_role,libri_worker,libri_frontend_reader;
-- Intentional session API: verifies and locks live owner membership before any lookup;
-- validates input, pins actor/source and never dispatches providers or queue work.
GRANT EXECUTE ON FUNCTION libri.manage_research_tasks(uuid,text,jsonb) TO authenticated;

CREATE FUNCTION libri.read_research_tasks(p_library_id uuid,p_filters jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=pg_catalog,libri
AS $function$
DECLARE page_limit integer; page_offset integer; field text; value jsonb; result jsonb;
BEGIN
 IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM libri.library_members WHERE library_id=p_library_id AND user_id=auth.uid()) THEN RAISE EXCEPTION 'Library membership required' USING ERRCODE='42501'; END IF;
 IF p_filters IS NULL OR jsonb_typeof(p_filters)<>'object' OR octet_length(p_filters::text)>2000 THEN RAISE EXCEPTION 'Invalid task filters' USING ERRCODE='22023'; END IF;
 FOR field,value IN SELECT * FROM jsonb_each(p_filters) LOOP
   IF field NOT IN ('limit','cursor','status','type','priority','bookId','search','autoOnly') THEN RAISE EXCEPTION 'Unknown task filter' USING ERRCODE='22023'; END IF;
   IF field='limit' THEN
     IF jsonb_typeof(value)<>'number' OR (value#>>'{}') !~ '^[0-9]+$' THEN RAISE EXCEPTION 'Invalid limit' USING ERRCODE='22023'; END IF;
   ELSIF field='autoOnly' THEN
     IF jsonb_typeof(value)<>'boolean' THEN RAISE EXCEPTION 'Invalid automatic filter' USING ERRCODE='22023'; END IF;
   ELSIF jsonb_typeof(value)<>'string' OR length(value#>>'{}')>200 THEN RAISE EXCEPTION 'Invalid task filter value' USING ERRCODE='22023'; END IF;
 END LOOP;
 page_limit:=coalesce((p_filters->>'limit')::integer,100);
 IF p_filters ? 'cursor' AND (p_filters->>'cursor') !~ '^[0-9]{1,6}$' THEN RAISE EXCEPTION 'Invalid cursor' USING ERRCODE='22023'; END IF;
 page_offset:=coalesce((p_filters->>'cursor')::integer,0);
 IF page_limit NOT BETWEEN 1 AND 500 OR page_offset NOT BETWEEN 0 AND 100000 THEN RAISE EXCEPTION 'Invalid page' USING ERRCODE='22023'; END IF;
 WITH scoped AS MATERIALIZED (
   SELECT t.id,t.book_id,t.chapter_id,t.video_id,t.task_type,t.priority,t.status,t.title,t.description,
    t.requires_confirmation,t.confirmed_at,t.result_message,t.data_added,t.skipped_reason,t.active_run_id,t.created_at,t.updated_at,t.completed_at,
    b.title AS book_title,b.slug AS book_slug,
    CASE t.priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END AS priority_rank,
    CASE t.status WHEN 'in_progress' THEN 0 WHEN 'pending' THEN 1 WHEN 'blocked' THEN 2 WHEN 'complete' THEN 3 ELSE 4 END AS status_rank,
    t.task_type IN ('scan_toc','find_book_info','find_youtube','find_podcasts','review_ocr','review_ai_content','deep_enrich_chapters','synthesize_book','generate_agent_profile','enrich_book') AS automatic
   FROM libri.research_tasks t LEFT JOIN libri.books b ON b.library_id=t.library_id AND b.id=t.book_id WHERE t.library_id=p_library_id
 ), ranked AS (
   SELECT *,CASE WHEN status='pending' THEN row_number() OVER(PARTITION BY status ORDER BY priority_rank,created_at,id) END AS queue_position FROM scoped
 ), filtered AS MATERIALIZED (
   SELECT * FROM ranked WHERE
    (NOT p_filters ? 'status' OR status=p_filters->>'status') AND (NOT p_filters ? 'type' OR task_type=p_filters->>'type')
    AND (NOT p_filters ? 'priority' OR priority=p_filters->>'priority') AND (NOT p_filters ? 'bookId' OR book_id=(p_filters->>'bookId')::uuid)
    AND (NOT coalesce((p_filters->>'autoOnly')::boolean,false) OR automatic)
    AND (NOT p_filters ? 'search' OR strpos(lower(concat_ws(' ',title,description,book_title,task_type,result_message)),lower(btrim(p_filters->>'search')))>0)
 ), page AS (
   SELECT * FROM filtered ORDER BY status_rank,priority_rank,
    CASE WHEN status='pending' THEN created_at END ASC,
    CASE WHEN status<>'pending' THEN updated_at END DESC,id LIMIT page_limit OFFSET page_offset
 ) SELECT jsonb_build_object('total',(SELECT count(*) FROM filtered),'cursor',page_offset::text,
   'nextCursor',CASE WHEN (SELECT count(*) FROM filtered)>page_offset+page_limit THEN (page_offset+page_limit)::text ELSE NULL END,
   'rows',coalesce((SELECT jsonb_agg(to_jsonb(page)-'priority_rank'-'status_rank') FROM page),'[]'::jsonb)) INTO result;
 RETURN result;
END;
$function$;
REVOKE ALL ON FUNCTION libri.read_research_tasks(uuid,jsonb) FROM PUBLIC,anon,authenticated,service_role,libri_worker,libri_frontend_reader;
GRANT EXECUTE ON FUNCTION libri.read_research_tasks(uuid,jsonb) TO authenticated;
NOTIFY pgrst,'reload schema';
