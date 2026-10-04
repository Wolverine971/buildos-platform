-- libri-migration: true
-- libri-allow-security-definer: edit_application_record
-- Atomic owner edits for the original Libri forms. No providers or queue writes.
SET lock_timeout='5s';
SET statement_timeout='60s';
ALTER TABLE libri.activity_events DROP CONSTRAINT activity_events_event_type_check;
ALTER TABLE libri.activity_events ADD CONSTRAINT activity_events_event_type_check CHECK
 (event_type IN ('search.query','book.viewed','chapter.viewed','domain.filtered','note.created','book.updated','admin.action'));
ALTER TABLE libri.activity_events DROP CONSTRAINT activity_events_subject;
ALTER TABLE libri.activity_events ADD CONSTRAINT activity_events_subject CHECK (
 (event_type IN ('search.query','domain.filtered') AND book_id IS NULL AND chapter_id IS NULL)
 OR (event_type IN ('book.viewed','chapter.viewed','note.created','book.updated','admin.action') AND book_id IS NOT NULL)
);
CREATE FUNCTION libri.edit_application_record(
 p_library_id uuid,p_kind text,p_id uuid,p_expected_updated_at timestamptz,p_changes jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,libri
AS $function$
DECLARE
 actor_id uuid:=auth.uid();
 allowed text[];
 field text;
 value jsonb;
 text_value text;
 book_row libri.books%ROWTYPE;
 chapter_row libri.chapters%ROWTYPE;
 profile_row libri.agent_profiles%ROWTYPE;
 prompt_row libri.derived_artifacts%ROWTYPE;
 subject_book_id uuid;
 domain_name text;
 domain_id_value uuid;
 prompt_id uuid:=gen_random_uuid();
 prompt_version integer;
 result jsonb;
BEGIN
 -- Lock authorization before any subject lookup. Concurrent edits by one owner
 -- serialize, and membership cannot be revoked halfway through this transaction.
 IF actor_id IS NULL THEN RAISE EXCEPTION 'Library owner required' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM libri.library_members WHERE library_id=p_library_id AND user_id=actor_id AND role='owner' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Library owner required' USING ERRCODE='42501'; END IF;
 IF p_kind IS NULL OR p_kind NOT IN ('book','chapter','agent_prompt') OR p_id IS NULL OR p_expected_updated_at IS NULL
 OR jsonb_typeof(p_changes) IS DISTINCT FROM 'object' OR p_changes='{}'::jsonb OR octet_length(p_changes::text)>60000 THEN
   RAISE EXCEPTION 'Invalid edit' USING ERRCODE='22023';
 END IF;
 allowed:=CASE p_kind WHEN 'book' THEN ARRAY['title','subtitle','year','pageCount','isbn10','isbn13','publisher','edition','ownership','domains']
   WHEN 'chapter' THEN ARRAY['number','title','page'] ELSE ARRAY['agentPrompt','expectedPromptId','expectedPromptUpdatedAt'] END;
 FOR field,value IN SELECT * FROM jsonb_each(p_changes) LOOP
   IF NOT field=ANY(allowed) THEN RAISE EXCEPTION 'Unsupported edit field' USING ERRCODE='22023'; END IF;
   IF field IN ('year','pageCount') THEN
     IF value<>'null'::jsonb AND (jsonb_typeof(value)<>'number' OR value::text !~ '^[1-9][0-9]{0,6}$') THEN
       RAISE EXCEPTION 'Invalid number' USING ERRCODE='22023';
     END IF;
     IF value<>'null'::jsonb AND (value::text)::integer>(CASE WHEN field='year' THEN 9999 ELSE 1000000 END) THEN
       RAISE EXCEPTION 'Number out of range' USING ERRCODE='22023';
     END IF;
   ELSIF field='domains' THEN
     IF jsonb_typeof(value)<>'array' THEN RAISE EXCEPTION 'Invalid domains' USING ERRCODE='22023'; END IF;
     IF jsonb_array_length(value)>50 OR EXISTS (SELECT 1 FROM jsonb_array_elements(value) element
       WHERE jsonb_typeof(element)<>'string' OR length(btrim(element#>>'{}')) NOT BETWEEN 1 AND 120) THEN
       RAISE EXCEPTION 'Invalid domains' USING ERRCODE='22023';
     END IF;
   ELSIF value<>'null'::jsonb THEN
     IF jsonb_typeof(value)<>'string' THEN RAISE EXCEPTION 'Invalid text' USING ERRCODE='22023'; END IF;
     text_value:=btrim(value#>>'{}');
     IF length(text_value)>(CASE field WHEN 'agentPrompt' THEN 14000 WHEN 'number' THEN 40 WHEN 'page' THEN 80
       WHEN 'isbn10' THEN 32 WHEN 'isbn13' THEN 32 WHEN 'expectedPromptId' THEN 36 WHEN 'expectedPromptUpdatedAt' THEN 40
       WHEN 'title' THEN CASE p_kind WHEN 'chapter' THEN 220 ELSE 500 END ELSE 1000 END) THEN
       RAISE EXCEPTION 'Text too long' USING ERRCODE='22023';
     END IF;
   END IF;
   IF field IN ('title','number','agentPrompt','ownership') AND (value='null'::jsonb OR length(btrim(value#>>'{}'))=0) THEN
     RAISE EXCEPTION 'Required text is empty' USING ERRCODE='22023';
   END IF;
 END LOOP;
 IF p_changes ? 'ownership' AND p_changes->>'ownership' NOT IN ('owned','library','wishlist','returned') THEN
   RAISE EXCEPTION 'Invalid ownership' USING ERRCODE='22023';
 END IF;
 IF p_kind='book' THEN
   SELECT * INTO book_row FROM libri.books WHERE library_id=p_library_id AND id=p_id FOR UPDATE;
   IF NOT FOUND OR book_row.updated_at IS DISTINCT FROM p_expected_updated_at THEN
     RAISE EXCEPTION 'Record changed or unavailable' USING ERRCODE='40001';
   END IF;
   subject_book_id:=book_row.id;
   -- Keep established book URLs stable across title changes.
   UPDATE libri.books SET
     title=CASE WHEN p_changes ? 'title' THEN btrim(p_changes->>'title') ELSE title END,
     title_normalized=CASE WHEN p_changes ? 'title' THEN lower(regexp_replace(normalize(btrim(regexp_replace(p_changes->>'title','\s+',' ','g')),NFKD),U&'[\0300-\036f]','','g')) ELSE title_normalized END,
     subtitle=CASE WHEN p_changes ? 'subtitle' THEN nullif(btrim(p_changes->>'subtitle'),'') ELSE subtitle END,
     year=CASE WHEN p_changes ? 'year' THEN (p_changes->>'year')::integer ELSE year END,
     page_count=CASE WHEN p_changes ? 'pageCount' THEN (p_changes->>'pageCount')::integer ELSE page_count END,
     isbn10=CASE WHEN p_changes ? 'isbn10' THEN nullif(regexp_replace(upper(p_changes->>'isbn10'),'[^0-9X]','','g'),'') ELSE isbn10 END,
     isbn10_normalized=CASE WHEN p_changes ? 'isbn10' THEN nullif(regexp_replace(upper(p_changes->>'isbn10'),'[^0-9X]','','g'),'') ELSE isbn10_normalized END,
     isbn13=CASE WHEN p_changes ? 'isbn13' THEN nullif(regexp_replace(upper(p_changes->>'isbn13'),'[^0-9X]','','g'),'') ELSE isbn13 END,
     isbn13_normalized=CASE WHEN p_changes ? 'isbn13' THEN nullif(regexp_replace(upper(p_changes->>'isbn13'),'[^0-9X]','','g'),'') ELSE isbn13_normalized END,
     publisher=CASE WHEN p_changes ? 'publisher' THEN nullif(btrim(p_changes->>'publisher'),'') ELSE publisher END,
     edition=CASE WHEN p_changes ? 'edition' THEN nullif(btrim(p_changes->>'edition'),'') ELSE edition END,
     ownership=coalesce(p_changes->>'ownership',ownership)
   WHERE library_id=p_library_id AND id=p_id RETURNING * INTO book_row;
   IF p_changes ? 'domains' THEN
     DELETE FROM libri.book_domains WHERE library_id=p_library_id AND book_id=p_id;
     -- Deterministic order avoids inverse domain locking across different owners.
     FOR domain_name IN SELECT min(btrim(element#>>'{}')) FROM jsonb_array_elements(p_changes->'domains') element
       GROUP BY lower(btrim(element#>>'{}')) ORDER BY lower(btrim(element#>>'{}')) LOOP
       INSERT INTO libri.domains(library_id,name) VALUES(p_library_id,domain_name)
         ON CONFLICT (library_id,lower(btrim(name))) DO NOTHING;
       SELECT id INTO STRICT domain_id_value FROM libri.domains WHERE library_id=p_library_id AND lower(btrim(name))=lower(domain_name) FOR SHARE;
       INSERT INTO libri.book_domains(library_id,book_id,domain_id) VALUES(p_library_id,p_id,domain_id_value);
     END LOOP;
   END IF;
   INSERT INTO libri.activity_events(library_id,actor_user_id,event_type,source,book_id,book_slug,book_title,message)
   VALUES(p_library_id,actor_id,'book.updated','books.update',p_id,left(book_row.slug,180),left(book_row.title,240),left(format('Updated book "%s".',book_row.title),400));
   result:=jsonb_build_object('id',p_id,'slug',book_row.slug,'updatedAt',book_row.updated_at);
 ELSIF p_kind='chapter' THEN
   SELECT * INTO chapter_row FROM libri.chapters WHERE library_id=p_library_id AND id=p_id FOR UPDATE;
   IF NOT FOUND OR chapter_row.updated_at IS DISTINCT FROM p_expected_updated_at THEN
     RAISE EXCEPTION 'Record changed or unavailable' USING ERRCODE='40001';
   END IF;
   subject_book_id:=chapter_row.book_id;
   SELECT * INTO STRICT book_row FROM libri.books WHERE library_id=p_library_id AND id=subject_book_id;
   UPDATE libri.chapters SET number=coalesce(btrim(p_changes->>'number'),number),title=coalesce(btrim(p_changes->>'title'),title),
     page_start=CASE WHEN p_changes ? 'page' THEN nullif(btrim(p_changes->>'page'),'') ELSE page_start END
     WHERE library_id=p_library_id AND id=p_id RETURNING * INTO chapter_row;
   INSERT INTO libri.activity_events(library_id,actor_user_id,event_type,source,book_id,book_slug,book_title,chapter_id,chapter_title,message)
   VALUES(p_library_id,actor_id,'admin.action','chapters.updateManual',subject_book_id,left(book_row.slug,180),left(book_row.title,240),p_id,left(chapter_row.title,240),left(format('Updated chapter metadata for "%s".',chapter_row.title),400));
   result:=jsonb_build_object('chapterId',p_id,'updatedAt',chapter_row.updated_at);
 ELSE
   IF NOT p_changes ?& ARRAY['agentPrompt','expectedPromptId','expectedPromptUpdatedAt'] THEN
     RAISE EXCEPTION 'Prompt and saved version required' USING ERRCODE='22023';
   END IF;
   SELECT * INTO profile_row FROM libri.agent_profiles WHERE library_id=p_library_id AND id=p_id AND kind='book_expert' FOR UPDATE;
   IF NOT FOUND OR profile_row.updated_at IS DISTINCT FROM p_expected_updated_at THEN
     RAISE EXCEPTION 'Record changed or unavailable' USING ERRCODE='40001';
   END IF;
   SELECT * INTO prompt_row FROM libri.derived_artifacts WHERE library_id=p_library_id AND agent_profile_id=p_id AND artifact_type='agent_prompt' AND is_current FOR UPDATE;
   IF prompt_row.id IS DISTINCT FROM (p_changes->>'expectedPromptId')::uuid OR prompt_row.updated_at IS DISTINCT FROM (p_changes->>'expectedPromptUpdatedAt')::timestamptz THEN
     RAISE EXCEPTION 'Prompt changed or unavailable' USING ERRCODE='40001';
   END IF;
   SELECT coalesce(max(version),0)+1 INTO prompt_version FROM libri.derived_artifacts WHERE library_id=p_library_id AND agent_profile_id=p_id AND artifact_type='agent_prompt';
   UPDATE libri.derived_artifacts SET is_current=false WHERE library_id=p_library_id AND id=prompt_row.id;
   INSERT INTO libri.derived_artifacts(id,library_id,agent_profile_id,artifact_type,content,version,model,content_sha256,idempotency_key,input_snapshot,supersedes_artifact_id,generated_by)
   VALUES(prompt_id,p_library_id,p_id,'agent_prompt',btrim(p_changes->>'agentPrompt'),prompt_version,'manual',
     encode(sha256(convert_to(btrim(p_changes->>'agentPrompt'),'UTF8')),'hex'),'manual-prompt:'||prompt_id,
     coalesce(prompt_row.input_snapshot,'{}'::jsonb),prompt_row.id,actor_id::text) RETURNING * INTO prompt_row;
   UPDATE libri.agent_profiles SET configuration=jsonb_set(configuration,'{legacy_profile_version}',
     to_jsonb(coalesce((configuration->>'legacy_profile_version')::integer,1)+1))
     WHERE library_id=p_library_id AND id=p_id RETURNING * INTO profile_row;
   RETURN jsonb_build_object('id',p_id,'agentPromptVersion',prompt_version,'updatedAt',profile_row.updated_at,'agentPromptId',prompt_row.id,'agentPromptUpdatedAt',prompt_row.updated_at);
 END IF;
 -- Keep saved content and provenance, while making dependency changes explicit.
 -- The replacement research worker will rebuild knowledge; edits never spend money.
 UPDATE libri.derived_artifacts SET status='outdated',reviewed_at=NULL WHERE library_id=p_library_id AND is_current
 AND status IN ('generated','reviewed','outdated') AND (
   (book_id=subject_book_id AND artifact_type='book_analysis') OR
   (artifact_type='agent_knowledge_doc' AND agent_profile_id IN (SELECT id FROM libri.agent_profiles WHERE library_id=p_library_id AND book_id=subject_book_id))
 );
 RETURN result;
END;
$function$;
REVOKE ALL ON FUNCTION libri.edit_application_record(uuid,text,uuid,timestamptz,jsonb) FROM PUBLIC,anon,authenticated,service_role,libri_worker,libri_frontend_reader;
-- Intentional session API; auth.uid(), live owner membership and scope are checked inside.
GRANT EXECUTE ON FUNCTION libri.edit_application_record(uuid,text,uuid,timestamptz,jsonb) TO authenticated;
NOTIFY pgrst,'reload schema';
RESET statement_timeout;
RESET lock_timeout;
