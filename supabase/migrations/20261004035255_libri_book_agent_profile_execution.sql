-- libri-migration: true
-- libri-allow-security-definer: read_book_synthesis_input, read_book_agent_input, persist_book_agent_result
-- Lease-scoped book expert execution; no raw worker catalog access or activation.
SET lock_timeout = '5s';
SET statement_timeout = '60s';

-- Private invoker helper shared by fenced capabilities. No client/worker grant.
CREATE FUNCTION libri.build_book_research_input(p_library_id uuid,p_book_id uuid)
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
REVOKE ALL ON FUNCTION libri.build_book_research_input(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role,libri_frontend_reader,libri_worker;

CREATE OR REPLACE FUNCTION libri.read_book_synthesis_input(p_step_id uuid,p_generation integer,p_lease_token uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,libri
AS $function$
DECLARE step libri.research_steps%ROWTYPE;
BEGIN
 SELECT * INTO step FROM libri.research_steps WHERE id=p_step_id;
 IF NOT FOUND OR step.status<>'leased' OR step.execution_generation IS DISTINCT FROM p_generation
  OR step.lease_token IS DISTINCT FROM p_lease_token OR step.lease_expires_at<=clock_timestamp()
  OR step.kind<>'task_execute' OR step.queue_family<>'libri_research'
  OR step.payload->>'taskType' IS DISTINCT FROM 'synthesize_book'
  OR NOT libri.research_task_execution_allowed(step.id) THEN
  RAISE EXCEPTION 'Synthesis lease is unavailable' USING ERRCODE='42501';
 END IF;
 RETURN libri.build_book_research_input(step.library_id,(step.payload->>'bookId')::uuid);
END;
$function$;

CREATE FUNCTION libri.read_book_agent_input(p_step_id uuid,p_generation integer,p_lease_token uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,libri
AS $function$
DECLARE step libri.research_steps%ROWTYPE; context jsonb; analysis jsonb; profile libri.agent_profiles%ROWTYPE;
 prompt libri.derived_artifacts%ROWTYPE; knowledge libri.derived_artifacts%ROWTYPE; book libri.books%ROWTYPE;
BEGIN
 SELECT * INTO step FROM libri.research_steps WHERE id=p_step_id;
 IF NOT FOUND OR step.status<>'leased' OR step.execution_generation IS DISTINCT FROM p_generation
  OR step.lease_token IS DISTINCT FROM p_lease_token OR step.lease_expires_at<=clock_timestamp()
  OR step.kind<>'task_execute' OR step.queue_family<>'libri_research'
  OR step.payload->>'taskType' IS DISTINCT FROM 'generate_agent_profile'
  OR NOT libri.research_task_execution_allowed(step.id) THEN
  RAISE EXCEPTION 'Agent profile lease unavailable' USING ERRCODE='42501';
 END IF;
 SELECT * INTO STRICT book FROM libri.books WHERE library_id=step.library_id AND id=(step.payload->>'bookId')::uuid;
 context:=libri.build_book_research_input(step.library_id,book.id);
 -- Imported legacy analyses may include private notes: only shared-source analyses enter this shared profile.
 SELECT jsonb_build_object('id',id,'version',version,'status',status,'updatedAt',updated_at,'content',structured_data)
 INTO analysis FROM libri.derived_artifacts WHERE library_id=step.library_id AND book_id=book.id
  AND artifact_type='book_analysis' AND is_current AND input_snapshot->>'notesVisibility'='shared_link';
 context:=jsonb_set(context,'{fingerprint}',to_jsonb(encode(sha256(convert_to(jsonb_build_array(context->>'fingerprint',analysis)::text,'UTF8')),'hex')));
 context:=jsonb_set(context,'{snapshot}',(context->'snapshot')||jsonb_build_object('bookAnalysisId',analysis->'id','bookAnalysisVersion',analysis->'version','profileContextVersion',1));
 context:=jsonb_set(context,'{dataset}',(context->'dataset')||jsonb_build_object('bookAnalysis',analysis,'coverage',context->'snapshot',
  'book',(context->'dataset'->'book')||jsonb_build_object('isbn',coalesce(book.isbn13,book.isbn10),'pageCount',book.page_count,'completeness',book.completeness)));
 SELECT * INTO profile FROM libri.agent_profiles WHERE library_id=step.library_id AND book_id=book.id AND kind='book_expert';
 SELECT * INTO prompt FROM libri.derived_artifacts WHERE library_id=step.library_id AND agent_profile_id=profile.id AND artifact_type='agent_prompt' AND is_current;
 SELECT * INTO knowledge FROM libri.derived_artifacts WHERE library_id=step.library_id AND agent_profile_id=profile.id AND artifact_type='agent_knowledge_doc' AND is_current;
 IF octet_length((context->'dataset')::text)>200000 THEN RAISE EXCEPTION 'Agent context exceeds limit' USING ERRCODE='54000'; END IF;
 RETURN (context-'currentAnalysis')||jsonb_build_object(
  'profileRevision',jsonb_build_object('profileId',profile.id,'promptId',prompt.id,'promptUpdatedAt',prompt.updated_at),
  'currentPrompt',CASE WHEN prompt.id IS NULL THEN NULL ELSE jsonb_build_object('id',prompt.id,'version',prompt.version,'status',prompt.status,'model',prompt.model,'fingerprint',prompt.source_fingerprint) END,
  'currentKnowledge',CASE WHEN knowledge.id IS NULL THEN NULL ELSE jsonb_build_object('id',knowledge.id,'status',knowledge.status,'fingerprint',knowledge.source_fingerprint) END);
END;
$function$;
REVOKE ALL ON FUNCTION libri.read_book_agent_input(uuid,integer,uuid) FROM PUBLIC,anon,authenticated,service_role,libri_frontend_reader;
GRANT EXECUTE ON FUNCTION libri.read_book_agent_input(uuid,integer,uuid) TO libri_worker;

CREATE FUNCTION libri.persist_book_agent_result(
 p_step_id uuid,p_generation integer,p_lease_token uuid,p_queue_row_id uuid,p_processing_token uuid,
 p_reservation_id uuid,p_input_fingerprint text,p_snapshot jsonb,p_profile_revision jsonb,
 p_result jsonb,p_knowledge text,p_cost bigint,p_prompt_tokens bigint,p_completion_tokens bigint,p_request_id text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,libri
AS $function$
DECLARE step libri.research_steps%ROWTYPE; reservation libri.provider_cost_reservations%ROWTYPE;
 current_input jsonb; book libri.books%ROWTYPE; profile libri.agent_profiles%ROWTYPE;
 previous_prompt libri.derived_artifacts%ROWTYPE; previous_knowledge libri.derived_artifacts%ROWTYPE;
 prompt_id uuid; knowledge_id uuid; prompt_version integer; knowledge_version integer;
 status_value text; source_current boolean; prompt_unchanged boolean; settlement record; tools text[];
BEGIN
 SELECT * INTO step FROM libri.research_steps WHERE id=p_step_id FOR UPDATE;
 IF NOT FOUND OR step.status<>'leased' OR step.execution_generation IS DISTINCT FROM p_generation
  OR step.lease_token IS DISTINCT FROM p_lease_token OR step.lease_expires_at<=clock_timestamp()
  OR step.active_queue_job_id IS DISTINCT FROM p_queue_row_id OR step.active_processing_token IS DISTINCT FROM p_processing_token
  OR p_queue_row_id IS NULL OR p_processing_token IS NULL THEN
  RAISE EXCEPTION 'Agent completion lease stale' USING ERRCODE='42501';
 END IF;
 PERFORM 1 FROM libri.research_runs WHERE id=step.run_id FOR UPDATE;
 SELECT * INTO STRICT book FROM libri.books WHERE library_id=step.library_id AND id=(step.payload->>'bookId')::uuid FOR UPDATE;
 -- Same profile lock used by manual prompt edits. Re-read AFTER waiting for it.
 SELECT * INTO profile FROM libri.agent_profiles WHERE library_id=step.library_id AND book_id=book.id AND kind='book_expert' FOR UPDATE;
 current_input:=libri.read_book_agent_input(p_step_id,p_generation,p_lease_token);
 IF p_input_fingerprint IS NULL OR p_input_fingerprint!~'^[0-9a-f]{64}$'
  OR jsonb_typeof(p_snapshot) IS DISTINCT FROM 'object' OR octet_length(p_snapshot::text)>10000
  OR jsonb_typeof(p_profile_revision) IS DISTINCT FROM 'object' OR octet_length(p_profile_revision::text)>2000
  OR p_snapshot->>'notesVisibility' IS DISTINCT FROM 'shared_link'
  OR p_snapshot->>'profileContextVersion' IS DISTINCT FROM '1'
  OR (current_input->>'fingerprint'=p_input_fingerprint AND p_snapshot IS DISTINCT FROM current_input->'snapshot')
  OR p_knowledge IS NULL OR length(btrim(p_knowledge)) NOT BETWEEN 1 AND 100000 THEN
  RAISE EXCEPTION 'Invalid agent completion input' USING ERRCODE='22023';
 END IF;
 source_current:=current_input->>'fingerprint'=p_input_fingerprint;
 prompt_unchanged:=current_input->'profileRevision'=p_profile_revision;
 SELECT * INTO previous_prompt FROM libri.derived_artifacts WHERE library_id=step.library_id AND agent_profile_id=profile.id AND artifact_type='agent_prompt' AND is_current FOR UPDATE;
 SELECT * INTO previous_knowledge FROM libri.derived_artifacts WHERE library_id=step.library_id AND agent_profile_id=profile.id AND artifact_type='agent_knowledge_doc' AND is_current FOR UPDATE;
 IF p_reservation_id IS NULL THEN
  -- Deterministic refresh never replaces a prompt or runs a model.
  IF NOT source_current OR NOT prompt_unchanged OR previous_prompt.id IS NULL OR step.payload->>'mode'='force'
   OR (previous_prompt.model IS DISTINCT FROM 'manual' AND (previous_prompt.source_fingerprint IS DISTINCT FROM p_input_fingerprint OR previous_prompt.status NOT IN ('generated','reviewed')))
   OR p_result IS NOT NULL OR p_cost IS NOT NULL OR p_prompt_tokens IS NOT NULL OR p_completion_tokens IS NOT NULL OR p_request_id IS NOT NULL THEN
   RAISE EXCEPTION 'Current agent prompt unavailable' USING ERRCODE='40001';
  END IF;
  prompt_id:=previous_prompt.id; prompt_version:=previous_prompt.version;
 ELSE
  SELECT * INTO reservation FROM libri.provider_cost_reservations WHERE id=p_reservation_id FOR UPDATE;
  IF NOT FOUND OR reservation.step_id IS DISTINCT FROM p_step_id OR reservation.execution_generation IS DISTINCT FROM p_generation
   OR reservation.lease_token IS DISTINCT FROM p_lease_token OR reservation.reservation_key IS DISTINCT FROM 'book-agent:'||book.id::text
   OR reservation.provider<>'openrouter' OR reservation.status<>'started' THEN
   RAISE EXCEPTION 'Agent cost receipt unavailable' USING ERRCODE='42501';
  END IF;
  IF jsonb_typeof(p_result) IS DISTINCT FROM 'object' OR octet_length(p_result::text)>100000
   OR p_result->>'status' IS NULL OR p_result->>'status' NOT IN ('generated','insufficient_evidence')
   OR length(btrim(coalesce(p_result->>'agentPrompt',''))) NOT BETWEEN 1 AND 40000
   OR jsonb_typeof(p_result->'blueprint') IS DISTINCT FROM 'object' THEN
   RAISE EXCEPTION 'Invalid structured agent prompt' USING ERRCODE='22023';
  END IF;
  IF previous_prompt.model='manual' AND step.payload->>'mode' IS DISTINCT FROM 'force' THEN prompt_unchanged:=false; END IF;
  IF profile.id IS NULL THEN
   tools:=ARRAY['getBookDetails','getChapterList','getChapterDetail','getChapterFragments','getBookFragments','getBookAiContent','getBookExternalSources','getBookVideos','getVideoTranscript','getAuthorInfo','getBookNotes','getBookMap','getChapterByLocator','fetchPassageRange','searchPrimaryContent','searchSecondaryContent','listGlossaryTerms','getGlossaryTerm','searchLibrary','searchBookContent','getBookCompleteness','getBookAnalysis','getFragmentImage','suggestResearchTask'];
   INSERT INTO libri.agent_profiles(library_id,book_id,name,slug,kind,primary_model,default_tools,enabled_tools)
   VALUES(step.library_id,book.id,left(book.title,220)||' Expert','book-expert-'||book.id::text,'book_expert',reservation.model,tools,tools)
   RETURNING * INTO profile;
  END IF;
  SELECT coalesce(max(version),0)+1 INTO prompt_version FROM libri.derived_artifacts WHERE library_id=step.library_id AND agent_profile_id=profile.id AND artifact_type='agent_prompt';
  status_value:=CASE WHEN source_current AND prompt_unchanged THEN p_result->>'status' ELSE 'outdated' END;
  -- Even explicit force may replace only the revision read before its model call.
  IF prompt_unchanged THEN UPDATE libri.derived_artifacts SET is_current=false WHERE id=previous_prompt.id; END IF;
  INSERT INTO libri.derived_artifacts(library_id,agent_profile_id,artifact_type,title,content,structured_data,version,status,is_current,model,content_sha256,source_fingerprint,idempotency_key,input_snapshot,supersedes_artifact_id,generated_by)
  VALUES(step.library_id,profile.id,'agent_prompt','Book expert prompt',p_result->>'agentPrompt',p_result->'blueprint',prompt_version,status_value,prompt_unchanged,reservation.model,
   encode(sha256(convert_to(p_result->>'agentPrompt','UTF8')),'hex'),p_input_fingerprint,'book-agent:'||step.id::text||':'||p_generation,p_snapshot,previous_prompt.id,'libri-worker') RETURNING id INTO prompt_id;
  IF prompt_unchanged THEN
   UPDATE libri.agent_profiles SET configuration=configuration||jsonb_build_object('agent_blueprint',p_result->'blueprint','legacy_profile_version',coalesce((configuration->>'legacy_profile_version')::integer,1)+1)
   WHERE id=profile.id;
  END IF;
  SELECT * INTO settlement FROM libri.settle_provider_cost(p_reservation_id,p_generation,p_lease_token,p_cost,p_prompt_tokens,p_completion_tokens,p_request_id);
  IF settlement.accepted IS DISTINCT FROM true THEN RAISE EXCEPTION 'Agent cost settlement refused' USING ERRCODE='55000'; END IF;
 END IF;
 IF source_current AND previous_knowledge.id IS NOT NULL AND previous_knowledge.source_fingerprint=p_input_fingerprint AND previous_knowledge.status IN ('generated','reviewed') THEN
  knowledge_id:=previous_knowledge.id;
 ELSE
  SELECT coalesce(max(version),0)+1 INTO knowledge_version FROM libri.derived_artifacts WHERE library_id=step.library_id AND agent_profile_id=profile.id AND artifact_type='agent_knowledge_doc';
  UPDATE libri.derived_artifacts SET is_current=false WHERE id=previous_knowledge.id;
  INSERT INTO libri.derived_artifacts(library_id,agent_profile_id,artifact_type,title,content,version,status,model,content_sha256,source_fingerprint,idempotency_key,input_snapshot,supersedes_artifact_id,generated_by)
  VALUES(step.library_id,profile.id,'agent_knowledge_doc','Book expert briefing',p_knowledge,knowledge_version,CASE WHEN source_current THEN 'generated' ELSE 'outdated' END,'deterministic',
   encode(sha256(convert_to(p_knowledge,'UTF8')),'hex'),p_input_fingerprint,'book-knowledge:'||step.id::text||':'||p_generation,p_snapshot,previous_knowledge.id,'libri-worker') RETURNING id INTO knowledge_id;
 END IF;
 RETURN jsonb_build_object('profileId',profile.id,'bookId',book.id,'artifactId',prompt_id,'knowledgeArtifactId',knowledge_id,'version',prompt_version,
  'status',coalesce(status_value,previous_prompt.status),'model',coalesce(reservation.model,previous_prompt.model),'current',prompt_unchanged,
  'message',CASE WHEN NOT prompt_unchanged THEN 'Saved a generated candidate; preserved the newer prompt.'
   WHEN p_reservation_id IS NULL AND previous_prompt.model='manual' THEN 'Preserved the manual prompt and refreshed its book briefing.'
   WHEN p_reservation_id IS NULL THEN 'Book expert prompt and briefing are current.'
   WHEN NOT source_current THEN 'Saved book expert profile; source material changed during generation.'
   ELSE 'Saved book expert profile and briefing.' END);
END;
$function$;
REVOKE ALL ON FUNCTION libri.persist_book_agent_result(uuid,integer,uuid,uuid,uuid,uuid,text,jsonb,jsonb,jsonb,text,bigint,bigint,bigint,text)
 FROM PUBLIC,anon,authenticated,service_role,libri_frontend_reader;
GRANT EXECUTE ON FUNCTION libri.persist_book_agent_result(uuid,integer,uuid,uuid,uuid,uuid,text,jsonb,jsonb,jsonb,text,bigint,bigint,bigint,text) TO libri_worker;
