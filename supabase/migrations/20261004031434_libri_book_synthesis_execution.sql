-- libri-migration: true
-- libri-allow-security-definer: read_book_synthesis_input, persist_book_synthesis_result
-- Worker-only capabilities: an active fenced synthesis step selects its own book.
-- No raw catalog/notes/artifact grant, shared-schema write, or activation.
SET lock_timeout = '5s';
SET statement_timeout = '60s';

CREATE FUNCTION libri.read_book_synthesis_input(p_step_id uuid,p_generation integer,p_lease_token uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,libri
AS $function$
DECLARE
 step libri.research_steps%ROWTYPE; book libri.books%ROWTYPE;
 payload jsonb; snapshot jsonb; revision jsonb;
BEGIN
 SELECT * INTO step FROM libri.research_steps WHERE id=p_step_id;
 IF NOT FOUND OR step.status<>'leased' OR step.execution_generation IS DISTINCT FROM p_generation
  OR step.lease_token IS DISTINCT FROM p_lease_token OR step.lease_expires_at<=clock_timestamp()
  OR step.kind<>'task_execute' OR step.queue_family<>'libri_research'
  OR step.payload->>'taskType' IS DISTINCT FROM 'synthesize_book'
  OR NOT libri.research_task_execution_allowed(step.id) THEN
  RAISE EXCEPTION 'Synthesis lease is unavailable' USING ERRCODE='42501';
 END IF;
 SELECT * INTO book FROM libri.books WHERE library_id=step.library_id AND id=(step.payload->>'bookId')::uuid;
 IF NOT FOUND THEN RAISE EXCEPTION 'Synthesis book is unavailable' USING ERRCODE='22023'; END IF;
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
  'chapters',coalesce((SELECT jsonb_agg(item ORDER BY position) FROM (SELECT position,jsonb_build_object('chapterId',id,'number',number,'title',title,'page',page_start,'summary',left(summary,700),'coreArgument',left(enrichment_payload->>'coreArgument',520),'topics',research_payload->'topics','keyConcepts',research_payload->'keyConcepts') item FROM libri.chapters WHERE library_id=book.library_id AND book_id=book.id ORDER BY position LIMIT 300) q),'[]'),
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
REVOKE ALL ON FUNCTION libri.read_book_synthesis_input(uuid,integer,uuid) FROM PUBLIC,anon,authenticated,service_role,libri_frontend_reader;
GRANT EXECUTE ON FUNCTION libri.read_book_synthesis_input(uuid,integer,uuid) TO libri_worker;

CREATE FUNCTION libri.persist_book_synthesis_result(
 p_step_id uuid,p_generation integer,p_lease_token uuid,p_queue_row_id uuid,p_processing_token uuid,
 p_reservation_id uuid,p_input_fingerprint text,p_snapshot jsonb,p_analysis jsonb,
 p_cost bigint,p_prompt_tokens bigint,p_completion_tokens bigint,p_request_id text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,libri
AS $function$
DECLARE
 step libri.research_steps%ROWTYPE; reservation libri.provider_cost_reservations%ROWTYPE;
 current_input jsonb; book_id_value uuid; version_value integer; artifact_id uuid;
 status_value text; settlement record; previous_id uuid;
BEGIN
 SELECT * INTO step FROM libri.research_steps WHERE id=p_step_id FOR UPDATE;
 IF NOT FOUND OR step.status<>'leased' OR step.execution_generation IS DISTINCT FROM p_generation
  OR step.lease_token IS DISTINCT FROM p_lease_token OR step.lease_expires_at<=clock_timestamp()
  OR step.active_queue_job_id IS DISTINCT FROM p_queue_row_id
  OR step.active_processing_token IS DISTINCT FROM p_processing_token
  OR p_queue_row_id IS NULL OR p_processing_token IS NULL THEN
  RAISE EXCEPTION 'Synthesis completion lease is stale' USING ERRCODE='42501';
 END IF;
 PERFORM 1 FROM libri.research_runs WHERE id=step.run_id FOR UPDATE;
 book_id_value:=(step.payload->>'bookId')::uuid;
 PERFORM 1 FROM libri.books WHERE library_id=step.library_id AND id=book_id_value FOR UPDATE;
 current_input:=libri.read_book_synthesis_input(p_step_id,p_generation,p_lease_token);
 SELECT * INTO reservation FROM libri.provider_cost_reservations WHERE id=p_reservation_id FOR UPDATE;
 IF NOT FOUND OR reservation.step_id IS DISTINCT FROM p_step_id
  OR reservation.execution_generation IS DISTINCT FROM p_generation
  OR reservation.lease_token IS DISTINCT FROM p_lease_token
  OR reservation.reservation_key IS DISTINCT FROM 'book-synthesis:'||book_id_value::text
  OR reservation.provider<>'openrouter' OR reservation.status<>'started' THEN
  RAISE EXCEPTION 'Synthesis cost receipt is unavailable' USING ERRCODE='42501';
 END IF;
 IF p_input_fingerprint IS NULL OR p_input_fingerprint!~'^[0-9a-f]{64}$'
  OR jsonb_typeof(p_snapshot) IS DISTINCT FROM 'object' OR octet_length(p_snapshot::text)>10000
  OR (current_input->>'fingerprint'=p_input_fingerprint AND p_snapshot IS DISTINCT FROM current_input->'snapshot')
  OR jsonb_typeof(p_analysis) IS DISTINCT FROM 'object'
  OR octet_length(p_analysis::text)>100000
  OR (p_analysis->>'status') IS NULL OR p_analysis->>'status' NOT IN ('generated','insufficient_evidence')
  OR jsonb_typeof(p_analysis->'overview') IS DISTINCT FROM 'object'
  OR length(btrim(coalesce(p_analysis->'overview'->>'elevatorPitch',''))) NOT BETWEEN 1 AND 900
  OR jsonb_typeof(p_analysis->'keyIdeas') IS DISTINCT FROM 'array'
  OR jsonb_typeof(p_analysis->'chapterInsights') IS DISTINCT FROM 'array' THEN
  RAISE EXCEPTION 'Invalid structured synthesis' USING ERRCODE='22023';
 END IF;
 -- The book lock serializes versions with manual edits and other completions.
 SELECT id INTO previous_id FROM libri.derived_artifacts WHERE library_id=step.library_id AND book_id=book_id_value AND artifact_type='book_analysis' AND is_current FOR UPDATE;
 SELECT coalesce(max(version),0)+1 INTO version_value FROM libri.derived_artifacts WHERE library_id=step.library_id AND book_id=book_id_value AND artifact_type='book_analysis';
 status_value:=CASE WHEN current_input->>'fingerprint'=p_input_fingerprint THEN p_analysis->>'status' ELSE 'outdated' END;
 UPDATE libri.derived_artifacts SET is_current=false WHERE id=previous_id;
 INSERT INTO libri.derived_artifacts(library_id,book_id,artifact_type,title,content,structured_data,version,status,is_current,
  model,content_sha256,source_fingerprint,idempotency_key,input_snapshot,supersedes_artifact_id,generated_by)
 VALUES(step.library_id,book_id_value,'book_analysis','Book analysis',p_analysis->'overview'->>'elevatorPitch',p_analysis-'status',
  version_value,status_value,true,reservation.model,encode(sha256(convert_to(p_analysis::text,'UTF8')),'hex'),p_input_fingerprint,
  'book-synthesis:'||step.id::text||':'||p_generation,p_snapshot,previous_id,'libri-worker') RETURNING id INTO artifact_id;
 -- Existing agent documents are now stale; rebuilding them is a separate durable task.
 UPDATE libri.derived_artifacts a SET status='outdated'
 FROM libri.agent_profiles p WHERE a.library_id=step.library_id AND a.agent_profile_id=p.id AND p.library_id=step.library_id
  AND p.book_id=book_id_value AND a.is_current AND a.artifact_type='agent_knowledge_doc' AND a.status IN ('generated','reviewed');
 SELECT * INTO settlement FROM libri.settle_provider_cost(p_reservation_id,p_generation,p_lease_token,p_cost,p_prompt_tokens,p_completion_tokens,p_request_id);
 IF settlement.accepted IS DISTINCT FROM true THEN RAISE EXCEPTION 'Synthesis cost settlement refused' USING ERRCODE='55000'; END IF;
 RETURN jsonb_build_object('artifactId',artifact_id,'bookId',book_id_value,'version',version_value,'status',status_value,
  'model',reservation.model,'overBudget',settlement.over_budget,'message',CASE status_value
   WHEN 'generated' THEN 'Saved book synthesis.' WHEN 'outdated' THEN 'Saved synthesis; source material changed during generation.'
   ELSE 'Saved synthesis with insufficient evidence.' END);
END;
$function$;
REVOKE ALL ON FUNCTION libri.persist_book_synthesis_result(uuid,integer,uuid,uuid,uuid,uuid,text,jsonb,jsonb,bigint,bigint,bigint,text)
 FROM PUBLIC,anon,authenticated,service_role,libri_frontend_reader;
GRANT EXECUTE ON FUNCTION libri.persist_book_synthesis_result(uuid,integer,uuid,uuid,uuid,uuid,text,jsonb,jsonb,bigint,bigint,bigint,text) TO libri_worker;
