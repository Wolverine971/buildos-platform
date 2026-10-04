-- libri-migration: true
-- libri-allow-security-definer: read_chapter_research_plan, read_chapter_research_input, persist_chapter_search_result, persist_chapter_research_result, enqueue_book_research
SET lock_timeout='5s';
SET statement_timeout='60s';
CREATE TABLE libri.chapter_research_evidence (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),library_id uuid NOT NULL,run_id uuid NOT NULL,step_id uuid NOT NULL UNIQUE,
 book_id uuid NOT NULL,chapter_id uuid NOT NULL,input_fingerprint text NOT NULL CHECK(input_fingerprint~'^[a-f0-9]{64}$'),
 input_snapshot jsonb NOT NULL CHECK(jsonb_typeof(input_snapshot)='object'),evidence jsonb NOT NULL CHECK(jsonb_typeof(evidence)='object'),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 FOREIGN KEY(library_id,run_id,step_id) REFERENCES libri.research_steps(library_id,run_id,id) ON DELETE CASCADE,
 FOREIGN KEY(library_id,book_id,chapter_id) REFERENCES libri.chapters(library_id,book_id,id) ON DELETE CASCADE
);
CREATE INDEX chapter_research_evidence_step_scope_idx ON libri.chapter_research_evidence(library_id,run_id,step_id);
CREATE INDEX chapter_research_evidence_chapter_idx ON libri.chapter_research_evidence(library_id,book_id,chapter_id);
ALTER TABLE libri.chapter_research_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE libri.chapter_research_evidence FORCE ROW LEVEL SECURITY;
REVOKE ALL ON libri.chapter_research_evidence FROM PUBLIC,anon,authenticated,libri_worker,libri_frontend_reader;
GRANT ALL ON libri.chapter_research_evidence TO service_role;

CREATE FUNCTION libri.chapter_research_fields(p_chapter libri.chapters) RETURNS jsonb
 LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path=pg_catalog,libri
AS $function$
 SELECT jsonb_build_object('summary',coalesce(p_chapter.summary,''),'outline',coalesce(p_chapter.research_payload->'researchOutline','[]'),
  'coreArgument',coalesce(p_chapter.enrichment_payload->>'coreArgument',''),
  'topics',coalesce(p_chapter.enrichment_payload->'topics','[]'),'keyConcepts',coalesce(p_chapter.enrichment_payload->'keyConcepts','[]'),
  'practicalTakeaways',coalesce(p_chapter.enrichment_payload->'practicalTakeaways','[]'),
  'discussionQuestions',coalesce(p_chapter.enrichment_payload->'discussionQuestions','[]'),'blindSpots',coalesce(p_chapter.enrichment_payload->'blindSpots','[]'),
  'peopleMentioned',coalesce(p_chapter.enrichment_payload->'peopleMentioned','[]'),'frameworkTerms',coalesce(p_chapter.enrichment_payload->'frameworkTerms','[]'));
$function$;
REVOKE ALL ON FUNCTION libri.chapter_research_fields(libri.chapters) FROM PUBLIC,anon,authenticated,service_role,libri_worker,libri_frontend_reader;
CREATE FUNCTION libri.chapter_research_requested_fields(p_fields jsonb,p_force boolean) RETURNS jsonb
 LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path=pg_catalog,libri
AS $function$
 SELECT coalesce(jsonb_agg(key ORDER BY key),'[]') FROM jsonb_each(p_fields)
 WHERE p_force OR value IN ('null'::jsonb,'[]'::jsonb,'""'::jsonb) OR (jsonb_typeof(value)='string' AND length(btrim(value#>>'{}'))=0);
$function$;
REVOKE ALL ON FUNCTION libri.chapter_research_requested_fields(jsonb,boolean) FROM PUBLIC,anon,authenticated,service_role,libri_worker,libri_frontend_reader;
CREATE FUNCTION libri.build_chapter_research_input(p_library_id uuid,p_book_id uuid,p_chapter_id uuid,p_force boolean) RETURNS jsonb
 LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=pg_catalog,libri
AS $function$
DECLARE book libri.books%ROWTYPE;chapter libri.chapters%ROWTYPE;authors jsonb;fields jsonb;dataset jsonb;revision jsonb;
BEGIN
 SELECT * INTO book FROM libri.books WHERE library_id=p_library_id AND id=p_book_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Research book unavailable' USING ERRCODE='22023'; END IF;
 SELECT * INTO chapter FROM libri.chapters WHERE library_id=p_library_id AND book_id=p_book_id AND id=p_chapter_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Research chapter unavailable' USING ERRCODE='22023'; END IF;
 SELECT coalesce(jsonb_agg(name ORDER BY position,id),'[]') INTO authors FROM
 (SELECT p.name,p.id,bp.position FROM libri.book_people bp JOIN libri.people p ON p.library_id=bp.library_id AND p.id=bp.person_id
 WHERE bp.library_id=p_library_id AND bp.book_id=p_book_id AND bp.role='author' ORDER BY bp.position,p.id LIMIT 30) named;
 fields:=libri.chapter_research_fields(chapter);
 dataset:=jsonb_build_object('book',jsonb_build_object('id',book.id,'title',book.title,'subtitle',book.subtitle,'authors',authors),
  'chapter',jsonb_build_object('id',chapter.id,'number',chapter.number,'title',chapter.title,'fields',fields),
  'requestedFields',libri.chapter_research_requested_fields(fields,p_force),'evidence',NULL);
 revision:=jsonb_build_object('book',to_jsonb(book)-'search_vector','chapter',to_jsonb(chapter)-'search_vector','authors',authors);
 IF octet_length(dataset::text)>100000 THEN RAISE EXCEPTION 'Chapter context exceeds bound' USING ERRCODE='54000'; END IF;
 RETURN jsonb_build_object('dataset',dataset,'fingerprint',encode(sha256(convert_to(revision::text,'UTF8')),'hex'),'searchFingerprint',NULL,'searchOutcome',NULL);
END;
$function$;
REVOKE ALL ON FUNCTION libri.build_chapter_research_input(uuid,uuid,uuid,boolean) FROM PUBLIC,anon,authenticated,service_role,libri_worker,libri_frontend_reader;

CREATE FUNCTION libri.read_chapter_research_plan(p_step_id uuid,p_generation integer,p_lease uuid) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,libri
AS $function$
DECLARE step libri.research_steps%ROWTYPE;book_id_value uuid;count_value integer;chapters jsonb;
BEGIN
 SELECT * INTO step FROM libri.research_steps WHERE id=p_step_id;
 IF NOT FOUND OR step.status<>'leased' OR step.execution_generation IS DISTINCT FROM p_generation OR step.lease_token IS DISTINCT FROM p_lease
 OR step.lease_expires_at<=clock_timestamp() OR step.kind<>'task_execute' OR step.queue_family<>'libri_research'
 OR step.payload->>'taskType' IS DISTINCT FROM 'find_book_info' OR step.parent_step_id IS NOT NULL
 OR NOT libri.research_task_execution_allowed(step.id) THEN RAISE EXCEPTION 'Chapter plan lease unavailable' USING ERRCODE='42501'; END IF;
 book_id_value:=(step.payload->>'bookId')::uuid;
 IF step.payload->>'chapterId' IS NOT NULL AND NOT EXISTS(SELECT 1 FROM libri.chapters WHERE library_id=step.library_id AND book_id=book_id_value AND id=(step.payload->>'chapterId')::uuid) THEN RAISE EXCEPTION 'Requested chapter unavailable' USING ERRCODE='22023'; END IF;
 PERFORM 1 FROM libri.books WHERE library_id=step.library_id AND id=book_id_value FOR UPDATE;
 PERFORM 1 FROM libri.chapters WHERE library_id=step.library_id AND book_id=book_id_value ORDER BY id FOR SHARE;
 SELECT count(*) INTO count_value FROM libri.chapters WHERE library_id=step.library_id AND book_id=book_id_value;
 IF count_value NOT BETWEEN 1 AND 300 THEN RAISE EXCEPTION 'Chapter research requires a complete bounded table of contents' USING ERRCODE='54000'; END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'requestedFields',requested) ORDER BY position,id),'[]') INTO chapters FROM
 (SELECT id,position,libri.chapter_research_requested_fields(libri.chapter_research_fields(c),step.payload->>'mode'='force') requested
 FROM libri.chapters c WHERE library_id=step.library_id AND book_id=book_id_value
 AND (step.payload->>'chapterId' IS NULL OR id=(step.payload->>'chapterId')::uuid)) candidates WHERE jsonb_array_length(requested)>0;
 RETURN jsonb_build_object('bookId',book_id_value,'chapterCount',count_value,'chapters',chapters);
END;
$function$;
REVOKE ALL ON FUNCTION libri.read_chapter_research_plan(uuid,integer,uuid) FROM PUBLIC,anon,authenticated,service_role,libri_worker,libri_frontend_reader;
GRANT EXECUTE ON FUNCTION libri.read_chapter_research_plan(uuid,integer,uuid) TO libri_worker;
CREATE FUNCTION libri.read_chapter_research_input(p_step_id uuid,p_generation integer,p_lease uuid) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,libri
AS $function$
DECLARE step libri.research_steps%ROWTYPE;payload jsonb;evidence libri.chapter_research_evidence%ROWTYPE;prerequisite libri.research_steps%ROWTYPE;
BEGIN
 SELECT * INTO step FROM libri.research_steps WHERE id=p_step_id;
 IF NOT FOUND OR step.status<>'leased' OR step.execution_generation IS DISTINCT FROM p_generation OR step.lease_token IS DISTINCT FROM p_lease
 OR step.lease_expires_at<=clock_timestamp() OR step.kind<>'task_execute' OR step.queue_family<>'libri_research'
 OR step.payload->>'taskType' IS DISTINCT FROM 'find_book_info' OR step.payload->>'workflowVersion' IS DISTINCT FROM '1'
 OR step.payload->>'phase' IS NULL OR step.payload->>'phase' NOT IN ('chapter_search','chapter_extract')
 OR NOT libri.research_task_execution_allowed(step.id) OR NOT libri.research_workflow_step_ready(step.id) THEN
 RAISE EXCEPTION 'Chapter research lease unavailable' USING ERRCODE='42501'; END IF;
 payload:=libri.build_chapter_research_input(step.library_id,(step.payload->>'bookId')::uuid,(step.payload->>'chapterId')::uuid,step.payload->>'mode'='force');
 IF step.payload->>'phase'='chapter_extract' THEN
  SELECT p.* INTO prerequisite FROM libri.research_step_dependencies d JOIN libri.research_steps p ON p.id=d.prerequisite_step_id WHERE d.step_id=step.id;
  SELECT * INTO evidence FROM libri.chapter_research_evidence WHERE step_id=prerequisite.id;
  IF NOT FOUND AND prerequisite.result->>'outcome' IS DISTINCT FROM 'current' THEN RAISE EXCEPTION 'Saved chapter search unavailable' USING ERRCODE='55000'; END IF;
  payload:=jsonb_set(payload,'{dataset,evidence}',coalesce(evidence.evidence,'null'::jsonb))||jsonb_build_object('searchFingerprint',evidence.input_fingerprint,'searchOutcome',prerequisite.result->>'outcome');
 END IF;
 IF octet_length(payload::text)>200000 THEN RAISE EXCEPTION 'Chapter evidence exceeds context bound' USING ERRCODE='54000'; END IF;
 RETURN payload;
END;
$function$;
REVOKE ALL ON FUNCTION libri.read_chapter_research_input(uuid,integer,uuid) FROM PUBLIC,anon,authenticated,service_role,libri_worker,libri_frontend_reader;
GRANT EXECUTE ON FUNCTION libri.read_chapter_research_input(uuid,integer,uuid) TO libri_worker;

CREATE FUNCTION libri.persist_chapter_search_result(p_step_id uuid,p_generation integer,p_lease uuid,p_reservation_id uuid,p_fingerprint text,p_snapshot jsonb,p_evidence jsonb,p_cost bigint,p_request_id text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,libri
AS $function$
DECLARE step libri.research_steps%ROWTYPE;reservation libri.provider_cost_reservations%ROWTYPE;current_input jsonb;settlement record;evidence_id uuid;outcome text;
BEGIN
 SELECT * INTO step FROM libri.research_steps WHERE id=p_step_id FOR UPDATE;
 current_input:=libri.read_chapter_research_input(p_step_id,p_generation,p_lease);
 IF step.payload->>'phase'<>'chapter_search' THEN RAISE EXCEPTION 'Search stage required' USING ERRCODE='42501'; END IF;
 SELECT * INTO reservation FROM libri.provider_cost_reservations WHERE id=p_reservation_id FOR UPDATE;
 IF NOT FOUND OR reservation.step_id IS DISTINCT FROM p_step_id OR reservation.execution_generation IS DISTINCT FROM p_generation OR reservation.lease_token IS DISTINCT FROM p_lease
 OR reservation.reservation_key IS DISTINCT FROM 'chapter-search:'||(step.payload->>'chapterId') OR reservation.provider<>'tavily' OR reservation.model<>'advanced' OR reservation.status<>'started' THEN
  RAISE EXCEPTION 'Chapter search cost receipt unavailable' USING ERRCODE='42501'; END IF;
 IF p_fingerprint IS NULL OR p_fingerprint!~'^[a-f0-9]{64}$' OR jsonb_typeof(p_snapshot) IS DISTINCT FROM 'object' OR octet_length(p_snapshot::text)>100000
 OR (current_input->>'fingerprint'=p_fingerprint AND p_snapshot IS DISTINCT FROM current_input->'dataset')
 OR jsonb_typeof(p_evidence) IS DISTINCT FROM 'object' OR octet_length(p_evidence::text)>180000
 OR jsonb_typeof(p_evidence->'results') IS DISTINCT FROM 'array' OR jsonb_array_length(p_evidence->'results')>8
 OR p_evidence->>'costBasis' IS DISTINCT FROM 'configured_credit_rate'
 OR (p_evidence->>'credits')::integer NOT BETWEEN 0 AND 2 OR (p_evidence->>'creditMicrousd')::bigint NOT BETWEEN 1 AND 1000000
 OR p_cost IS DISTINCT FROM (p_evidence->>'credits')::bigint*(p_evidence->>'creditMicrousd')::bigint THEN
  RAISE EXCEPTION 'Invalid chapter search evidence' USING ERRCODE='22023'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_evidence->'results') r WHERE jsonb_typeof(r)<>'object'
 OR r->>'url' IS NULL OR r->>'url'!~'^https?://' OR length(r->>'url')>2048 OR jsonb_typeof(r->'content') IS DISTINCT FROM 'string' OR length(r->>'content')>30000) THEN
  RAISE EXCEPTION 'Invalid chapter source' USING ERRCODE='22023'; END IF;
 INSERT INTO libri.chapter_research_evidence(library_id,run_id,step_id,book_id,chapter_id,input_fingerprint,input_snapshot,evidence)
 VALUES(step.library_id,step.run_id,step.id,(step.payload->>'bookId')::uuid,(step.payload->>'chapterId')::uuid,p_fingerprint,p_snapshot,p_evidence) RETURNING id INTO evidence_id;
 SELECT * INTO settlement FROM libri.settle_provider_cost(p_reservation_id,p_generation,p_lease,p_cost,0,0,p_request_id);
 IF settlement.accepted IS DISTINCT FROM true THEN RAISE EXCEPTION 'Search settlement refused' USING ERRCODE='55000'; END IF;
 outcome:=CASE WHEN current_input->>'fingerprint'<>p_fingerprint THEN 'outdated' WHEN jsonb_array_length(p_evidence->'results')=0 THEN 'insufficient_evidence' ELSE 'complete' END;
 RETURN jsonb_build_object('evidenceId',evidence_id,'outcome',outcome,'model','advanced','message','Saved chapter search evidence.');
END;
$function$;
REVOKE ALL ON FUNCTION libri.persist_chapter_search_result(uuid,integer,uuid,uuid,text,jsonb,jsonb,bigint,text) FROM PUBLIC,anon,authenticated,service_role,libri_worker,libri_frontend_reader;
GRANT EXECUTE ON FUNCTION libri.persist_chapter_search_result(uuid,integer,uuid,uuid,text,jsonb,jsonb,bigint,text) TO libri_worker;

CREATE FUNCTION libri.persist_chapter_research_result(p_step_id uuid,p_generation integer,p_lease uuid,p_reservation_id uuid,p_fingerprint text,p_requested_fields jsonb,p_output jsonb,p_cost bigint,p_prompt_tokens bigint,p_completion_tokens bigint,p_request_id text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,libri
AS $function$
DECLARE step libri.research_steps%ROWTYPE;reservation libri.provider_cost_reservations%ROWTYPE;current_input jsonb;settlement record;
 chapter libri.chapters%ROWTYPE;artifact_id uuid;previous_id uuid;version_value integer;outcome text;field text;value jsonb;
 chapter_summary text;research jsonb;enrichment jsonb;snapshot jsonb;
BEGIN
 SELECT * INTO step FROM libri.research_steps WHERE id=p_step_id FOR UPDATE;
 IF step.payload->>'phase' IS DISTINCT FROM 'chapter_extract' THEN RAISE EXCEPTION 'Extraction stage required' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM libri.research_runs WHERE id=step.run_id FOR UPDATE;
 PERFORM 1 FROM libri.books WHERE library_id=step.library_id AND id=(step.payload->>'bookId')::uuid FOR UPDATE;
 SELECT * INTO chapter FROM libri.chapters WHERE library_id=step.library_id AND book_id=(step.payload->>'bookId')::uuid AND id=(step.payload->>'chapterId')::uuid FOR UPDATE;
 current_input:=libri.read_chapter_research_input(p_step_id,p_generation,p_lease);
 SELECT * INTO reservation FROM libri.provider_cost_reservations WHERE id=p_reservation_id FOR UPDATE;
 IF NOT FOUND OR reservation.step_id IS DISTINCT FROM p_step_id OR reservation.execution_generation IS DISTINCT FROM p_generation OR reservation.lease_token IS DISTINCT FROM p_lease
 OR reservation.reservation_key IS DISTINCT FROM 'chapter-extract:'||chapter.id::text OR reservation.provider<>'openrouter' OR reservation.status<>'started' THEN
  RAISE EXCEPTION 'Chapter extraction cost receipt unavailable' USING ERRCODE='42501'; END IF;
 IF jsonb_typeof(p_requested_fields) IS DISTINCT FROM 'array' OR jsonb_array_length(p_requested_fields)>10 OR EXISTS(SELECT 1 FROM jsonb_array_elements_text(p_requested_fields) key WHERE NOT libri.chapter_research_fields(chapter) ? key) OR (current_input->>'fingerprint'=p_fingerprint AND p_requested_fields IS DISTINCT FROM current_input->'dataset'->'requestedFields') OR p_fingerprint IS NULL OR p_fingerprint!~'^[a-f0-9]{64}$' OR jsonb_typeof(p_output) IS DISTINCT FROM 'object' OR octet_length(p_output::text)>50000
 OR p_output->>'status' IS NULL OR p_output->>'status' NOT IN ('complete','insufficient_evidence')
 OR jsonb_typeof(p_output->'fields') IS DISTINCT FROM 'object' OR jsonb_typeof(p_output->'sourceUrls') IS DISTINCT FROM 'array'
 OR jsonb_array_length(p_output->'sourceUrls')>8 OR jsonb_typeof(p_output->'notes') IS DISTINCT FROM 'string' OR length(p_output->>'notes')>800
 OR (p_output->'confidence'<>'null'::jsonb AND (jsonb_typeof(p_output->'confidence') IS DISTINCT FROM 'number' OR (p_output->>'confidence')::numeric NOT BETWEEN 0 AND 1)) THEN
  RAISE EXCEPTION 'Invalid chapter research output' USING ERRCODE='22023'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_output->'sourceUrls') url WHERE jsonb_typeof(url)<>'string'
 OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(current_input->'dataset'->'evidence'->'results') source WHERE source->>'url'=url#>>'{}' AND length(btrim(source->>'content'))>0)) THEN
  RAISE EXCEPTION 'Chapter citation is outside saved evidence' USING ERRCODE='22023'; END IF;
 FOR field,value IN SELECT * FROM jsonb_each(p_output->'fields') LOOP
  IF field IN ('summary','coreArgument') THEN
   IF jsonb_typeof(value)<>'string' OR length(value#>>'{}')>(CASE field WHEN 'summary' THEN 2200 ELSE 1200 END) THEN RAISE EXCEPTION 'Invalid chapter text' USING ERRCODE='22023'; END IF;
  ELSIF field IN ('topics','keyConcepts','outline','practicalTakeaways','discussionQuestions','blindSpots','peopleMentioned','frameworkTerms') THEN
   IF jsonb_typeof(value)<>'array' OR jsonb_array_length(value)>10 OR EXISTS(SELECT 1 FROM jsonb_array_elements(value) item WHERE jsonb_typeof(item)<>'string' OR length(item#>>'{}') NOT BETWEEN 1 AND 320) THEN RAISE EXCEPTION 'Invalid chapter list' USING ERRCODE='22023'; END IF;
  ELSE RAISE EXCEPTION 'Unknown chapter output field' USING ERRCODE='22023'; END IF;
 END LOOP;
 IF (SELECT count(*) FROM jsonb_object_keys(p_output->'fields'))<>10 THEN RAISE EXCEPTION 'Incomplete chapter output' USING ERRCODE='22023'; END IF;
 outcome:=CASE WHEN current_input->>'fingerprint'<>p_fingerprint OR current_input->>'searchFingerprint' IS DISTINCT FROM p_fingerprint THEN 'outdated' ELSE p_output->>'status' END;
 IF outcome='complete' AND (jsonb_array_length(p_output->'sourceUrls')=0 OR EXISTS(SELECT 1 FROM jsonb_array_elements_text(current_input->'dataset'->'requestedFields') key WHERE p_output->'fields'->key IN ('null'::jsonb,'[]'::jsonb,'""'::jsonb))) THEN outcome:='insufficient_evidence'; END IF;
 SELECT id INTO previous_id FROM libri.derived_artifacts WHERE library_id=step.library_id AND chapter_id=chapter.id AND artifact_type='chapter_analysis' AND is_current FOR UPDATE;
 SELECT coalesce(max(version),0)+1 INTO version_value FROM libri.derived_artifacts WHERE library_id=step.library_id AND chapter_id=chapter.id AND artifact_type='chapter_analysis';
 IF outcome='complete' THEN UPDATE libri.derived_artifacts SET is_current=false WHERE id=previous_id; END IF;
 snapshot:=jsonb_build_object('version',1,'chapterId',chapter.id,'requestedFields',p_requested_fields,'searchFingerprint',current_input->>'searchFingerprint','notesVisibility','none');
 INSERT INTO libri.derived_artifacts(library_id,book_id,chapter_id,artifact_type,title,content,structured_data,version,status,is_current,model,content_sha256,source_fingerprint,idempotency_key,input_snapshot,supersedes_artifact_id,generated_by)
 VALUES(step.library_id,chapter.book_id,chapter.id,'chapter_analysis','Chapter research',coalesce(nullif(p_output->'fields'->>'summary',''),nullif(p_output->>'notes',''),'Insufficient chapter evidence.'),
 p_output,version_value,CASE outcome WHEN 'complete' THEN 'generated' ELSE outcome END,outcome='complete',reservation.model,encode(sha256(convert_to(p_output::text,'UTF8')),'hex'),p_fingerprint,
 'chapter-research:'||step.id||':'||p_generation,snapshot,previous_id,'libri-worker') RETURNING id INTO artifact_id;
 IF outcome<>'outdated' THEN
  chapter_summary:=chapter.summary;research:=chapter.research_payload;enrichment:=chapter.enrichment_payload;
  IF outcome='complete' THEN
   FOR field IN SELECT jsonb_array_elements_text(current_input->'dataset'->'requestedFields') LOOP
    value:=p_output->'fields'->field;
    IF field='summary' THEN chapter_summary:=value#>>'{}';
    ELSIF field='outline' THEN research:=research||jsonb_build_object('researchOutline',value);
    ELSE enrichment:=enrichment||jsonb_build_object(field,value); END IF;
   END LOOP;
  END IF;
  research:=research||jsonb_build_object('researchSourceUrls',p_output->'sourceUrls','researchNotes',p_output->>'notes');
  UPDATE libri.chapters SET summary=chapter_summary,research_payload=research,enrichment_payload=enrichment,
   research_status=outcome,research_confidence=(p_output->>'confidence')::numeric,research_model=reservation.model,research_updated_at=clock_timestamp(),research_version=research_version+1 WHERE id=chapter.id;
  UPDATE libri.derived_artifacts SET status='outdated' WHERE library_id=step.library_id AND book_id=chapter.book_id AND artifact_type='book_analysis' AND is_current AND status IN ('generated','reviewed');
  UPDATE libri.derived_artifacts a SET status='outdated' FROM libri.agent_profiles p WHERE a.agent_profile_id=p.id AND p.library_id=step.library_id AND p.book_id=chapter.book_id
   AND a.is_current AND a.artifact_type='agent_knowledge_doc' AND a.status IN ('generated','reviewed');
 END IF;
 SELECT * INTO settlement FROM libri.settle_provider_cost(p_reservation_id,p_generation,p_lease,p_cost,p_prompt_tokens,p_completion_tokens,p_request_id);
 IF settlement.accepted IS DISTINCT FROM true THEN RAISE EXCEPTION 'Chapter extraction settlement refused' USING ERRCODE='55000'; END IF;
 RETURN jsonb_build_object('artifactId',artifact_id,'chapterId',chapter.id,'outcome',outcome,'model',reservation.model,'version',version_value,'message',CASE outcome WHEN 'complete' THEN 'Saved grounded chapter research.' WHEN 'outdated' THEN 'Chapter changed during research; saved result requires review.' ELSE 'Chapter research found insufficient evidence.' END);
END;
$function$;
REVOKE ALL ON FUNCTION libri.persist_chapter_research_result(uuid,integer,uuid,uuid,text,jsonb,jsonb,bigint,bigint,bigint,text) FROM PUBLIC,anon,authenticated,service_role,libri_worker,libri_frontend_reader;
GRANT EXECUTE ON FUNCTION libri.persist_chapter_research_result(uuid,integer,uuid,uuid,text,jsonb,jsonb,bigint,bigint,bigint,text) TO libri_worker;
NOTIFY pgrst,'reload schema';

-- Imported and newly generated topic/concept fields live in enrichment_payload.
CREATE OR REPLACE FUNCTION libri.build_book_research_input(p_library_id uuid,p_book_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,libri
AS $function$
DECLARE book libri.books%ROWTYPE; payload jsonb; snapshot jsonb; revision jsonb;
BEGIN
 SELECT * INTO book FROM libri.books WHERE library_id=p_library_id AND id=p_book_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Research book unavailable' USING ERRCODE='22023'; END IF;
 SELECT jsonb_build_object(
  'chapterCount',(SELECT count(*) FROM libri.chapters WHERE library_id=book.library_id AND book_id=book.id),
  'fragmentCount',(SELECT count(*) FROM libri.source_chunks WHERE library_id=book.library_id AND book_id=book.id AND chunk_type='ocr' AND NOT is_archived),
  'noteCount',(SELECT count(*) FROM libri.notes WHERE library_id=book.library_id AND book_id=book.id AND visibility='shared_link'),
  'aiContentCount',(SELECT count(*) FROM libri.derived_artifacts WHERE library_id=book.library_id AND book_id=book.id AND is_current AND input_snapshot->>'migration_source'='convex.aiContent'),
  'externalSourceCount',(SELECT count(*) FROM libri.source_book_links WHERE library_id=book.library_id AND book_id=book.id),
  'notesVisibility','shared_link','version',2
 ) INTO snapshot;
 -- The full revision fingerprint detects changes outside the bounded prompt samples.
 SELECT jsonb_build_object(
  'book',to_jsonb(book)-'search_vector',
  'chapters',(SELECT jsonb_agg(jsonb_build_array(id,updated_at) ORDER BY id) FROM libri.chapters WHERE library_id=book.library_id AND book_id=book.id),
  'fragments',(SELECT jsonb_agg(jsonb_build_array(id,updated_at) ORDER BY id) FROM libri.source_chunks WHERE library_id=book.library_id AND book_id=book.id AND chunk_type='ocr' AND NOT is_archived),
  'notes',(SELECT jsonb_agg(jsonb_build_array(id,updated_at) ORDER BY id) FROM libri.notes WHERE library_id=book.library_id AND book_id=book.id AND visibility='shared_link'),
  'aiContent',(SELECT jsonb_agg(jsonb_build_array(id,updated_at) ORDER BY id) FROM libri.derived_artifacts WHERE library_id=book.library_id AND book_id=book.id AND is_current AND input_snapshot->>'migration_source'='convex.aiContent'),
  'sources',(SELECT jsonb_agg(jsonb_build_array(s.id,s.updated_at) ORDER BY s.id) FROM libri.source_book_links l JOIN libri.sources s ON s.library_id=l.library_id AND s.id=l.source_id WHERE l.library_id=book.library_id AND l.book_id=book.id),
  'people',(SELECT jsonb_agg(jsonb_build_array(p.id,p.name,bp.role) ORDER BY p.id,bp.role) FROM libri.book_people bp JOIN libri.people p ON p.library_id=bp.library_id AND p.id=bp.person_id WHERE bp.library_id=book.library_id AND bp.book_id=book.id),
  'domains',(SELECT jsonb_agg(d.name ORDER BY d.id) FROM libri.book_domains bd JOIN libri.domains d ON d.library_id=bd.library_id AND d.id=bd.domain_id WHERE bd.library_id=book.library_id AND bd.book_id=book.id)
 ) INTO revision;
 SELECT jsonb_build_object(
  'book',jsonb_build_object('id',book.id,'title',book.title,'subtitle',book.subtitle,'year',book.year),
  'authors',coalesce((SELECT jsonb_agg(name ORDER BY position,id) FROM (SELECT p.id,p.name,bp.position FROM libri.book_people bp JOIN libri.people p ON p.library_id=bp.library_id AND p.id=bp.person_id WHERE bp.library_id=book.library_id AND bp.book_id=book.id AND bp.role='author' ORDER BY bp.position,p.id LIMIT 30) q),'[]'),
  'domains',coalesce((SELECT jsonb_agg(name ORDER BY name) FROM (SELECT d.name FROM libri.book_domains bd JOIN libri.domains d ON d.library_id=bd.library_id AND d.id=bd.domain_id WHERE bd.library_id=book.library_id AND bd.book_id=book.id ORDER BY d.name LIMIT 30) q),'[]'),
  'chapters',coalesce((SELECT jsonb_agg(item ORDER BY position) FROM (SELECT position,jsonb_build_object('chapterId',id,'number',number,'title',title,'page',page_start,'summary',left(summary,700),'coreArgument',left(enrichment_payload->>'coreArgument',520),'topics',enrichment_payload->'topics','keyConcepts',enrichment_payload->'keyConcepts') item FROM libri.chapters WHERE library_id=book.library_id AND book_id=book.id ORDER BY position LIMIT 300) q),'[]'),
  'fragments',coalesce((SELECT jsonb_agg(item ORDER BY id) FROM (SELECT id,jsonb_build_object('chapterId',chapter_id,'content',left(content,320)) item FROM libri.source_chunks WHERE library_id=book.library_id AND book_id=book.id AND chunk_type='ocr' AND NOT is_archived ORDER BY id LIMIT 80) q),'[]'),
  'notes',coalesce((SELECT jsonb_agg(item ORDER BY updated_at DESC,id) FROM (SELECT id,updated_at,jsonb_build_object('chapterId',chapter_id,'content',left(content,320)) item FROM libri.notes WHERE library_id=book.library_id AND book_id=book.id AND visibility='shared_link' ORDER BY updated_at DESC,id LIMIT 24) q),'[]'),
  'aiContent',coalesce((SELECT jsonb_agg(item ORDER BY updated_at DESC,id) FROM (SELECT id,updated_at,jsonb_build_object('kind',artifact_type,'title',title,'content',left(content,240)) item FROM libri.derived_artifacts WHERE library_id=book.library_id AND book_id=book.id AND is_current AND input_snapshot->>'migration_source'='convex.aiContent' ORDER BY updated_at DESC,id LIMIT 20) q),'[]'),
  'externalSources',coalesce((SELECT jsonb_agg(item ORDER BY id) FROM (SELECT s.id,jsonb_build_object('type',s.source_type,'title',left(s.title,300),'url',s.canonical_url) item FROM libri.source_book_links l JOIN libri.sources s ON s.library_id=l.library_id AND s.id=l.source_id WHERE l.library_id=book.library_id AND l.book_id=book.id ORDER BY s.id LIMIT 24) q),'[]')
 ) INTO payload;
 IF octet_length(payload::text)>200000 THEN RAISE EXCEPTION 'Synthesis input exceeds bounded context' USING ERRCODE='54000'; END IF;
 RETURN jsonb_build_object('dataset',payload,'snapshot',snapshot,
  'fingerprint',encode(sha256(convert_to(revision::text,'UTF8')),'hex'),
  'currentAnalysis',(SELECT jsonb_build_object('id',id,'status',status,'version',version,'fingerprint',source_fingerprint,'generatedAt',generated_at) FROM libri.derived_artifacts WHERE library_id=book.library_id AND book_id=book.id AND artifact_type='book_analysis' AND is_current));
END;
$function$;
REVOKE ALL ON FUNCTION libri.build_book_research_input(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role,libri_frontend_reader,libri_worker;

-- Preserve the original book-page action through the same durable admission receipt.
CREATE OR REPLACE FUNCTION libri.enqueue_book_research(p_library_id uuid,p_request_key uuid,p_book_id uuid,p_action text,p_mode text DEFAULT 'gaps',p_priority text DEFAULT 'medium')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,libri
AS $function$
DECLARE actor_id uuid:=auth.uid(); payload jsonb; receipt jsonb; previous libri.book_research_requests%ROWTYPE;
 controls libri.research_queue_controls%ROWTYPE; task libri.research_tasks%ROWTYPE;
 book libri.books%ROWTYPE; task_type_value text; title_value text; deduped boolean;
BEGIN
 IF actor_id IS NULL THEN RAISE EXCEPTION 'Library owner required' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM libri.library_members WHERE library_id=p_library_id AND user_id=actor_id AND role='owner' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Library owner required' USING ERRCODE='42501'; END IF;
 IF p_request_key IS NULL OR p_book_id IS NULL OR p_action IS NULL OR p_action NOT IN ('book_synthesis','agent_profile','chapter_details')
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
 task_type_value:=CASE p_action WHEN 'book_synthesis' THEN 'synthesize_book' WHEN 'chapter_details' THEN 'find_book_info' ELSE 'generate_agent_profile' END;
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
  title_value:=CASE p_action WHEN 'book_synthesis' THEN 'Synthesize book analysis' WHEN 'chapter_details' THEN 'Research missing chapter details' ELSE 'Generate agent profile prompt' END;
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
