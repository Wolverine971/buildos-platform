-- libri-migration: true
-- libri-allow-security-definer: edit_application_image
-- Owner manual cover/TOC edits are atomic and never enqueue provider work.
SET lock_timeout='5s';
SET statement_timeout='60s';
CREATE FUNCTION libri.edit_application_image(p_library_id uuid,p_image_id uuid,p_action text,p_expected_book_updated_at timestamptz,p_expected_image_updated_at timestamptz,p_changes jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,libri
AS $function$
DECLARE actor_id uuid:=auth.uid();image_row libri.images%ROWTYPE;book_row libri.books%ROWTYPE;
 entry jsonb;created_count integer:=0;demoted_count integer:=0;next_position integer;chapter_count integer;event_time timestamptz:=clock_timestamp();
BEGIN
 IF actor_id IS NULL THEN RAISE EXCEPTION 'Library owner required' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM libri.library_members WHERE library_id=p_library_id AND user_id=actor_id AND role='owner' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Library owner required' USING ERRCODE='42501'; END IF;
 IF p_image_id IS NULL OR p_action IS NULL OR p_action NOT IN ('cover','toc') OR p_expected_book_updated_at IS NULL OR p_expected_image_updated_at IS NULL
 OR jsonb_typeof(p_changes) IS DISTINCT FROM 'object' OR octet_length(p_changes::text)>180000 THEN RAISE EXCEPTION 'Invalid image edit' USING ERRCODE='22023'; END IF;
 IF p_action='cover' AND p_changes<>'{}'::jsonb THEN RAISE EXCEPTION 'Unexpected cover edit fields' USING ERRCODE='22023'; END IF;
 IF p_action='toc' THEN
  IF NOT p_changes ?& ARRAY['text','chapters'] OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_changes) k WHERE k NOT IN ('text','chapters','description'))
  OR jsonb_typeof(p_changes->'text') IS DISTINCT FROM 'string' OR length(btrim(p_changes->>'text')) NOT BETWEEN 1 AND 20000
  OR jsonb_typeof(p_changes->'chapters') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Invalid manual TOC' USING ERRCODE='22023'; END IF;
  IF jsonb_array_length(p_changes->'chapters') NOT BETWEEN 1 AND 160 THEN RAISE EXCEPTION 'Use one to 160 TOC lines' USING ERRCODE='22023'; END IF;
  IF p_changes ? 'description' AND (jsonb_typeof(p_changes->'description') IS DISTINCT FROM 'string' OR length(p_changes->>'description')>500) THEN RAISE EXCEPTION 'Invalid TOC description' USING ERRCODE='22023'; END IF;
  FOR entry IN SELECT value FROM jsonb_array_elements(p_changes->'chapters') LOOP
   IF jsonb_typeof(entry) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Invalid TOC line' USING ERRCODE='22023'; END IF;
   IF EXISTS(SELECT 1 FROM jsonb_object_keys(entry) k WHERE k NOT IN ('number','title','page'))
   OR jsonb_typeof(entry->'number') IS DISTINCT FROM 'string' OR length(btrim(entry->>'number')) NOT BETWEEN 1 AND 40
   OR jsonb_typeof(entry->'title') IS DISTINCT FROM 'string' OR length(btrim(entry->>'title')) NOT BETWEEN 1 AND 220
   OR (entry ? 'page' AND (jsonb_typeof(entry->'page') IS DISTINCT FROM 'string' OR length(btrim(entry->>'page')) NOT BETWEEN 1 AND 80)) THEN RAISE EXCEPTION 'Invalid TOC line' USING ERRCODE='22023'; END IF;
  END LOOP;
 END IF;
 SELECT * INTO image_row FROM libri.images WHERE library_id=p_library_id AND id=p_image_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Image changed or unavailable' USING ERRCODE='40001'; END IF;
 -- Canonical edits always lock book before images/chapters. Re-read the image after locks.
 SELECT * INTO book_row FROM libri.books WHERE library_id=p_library_id AND id=image_row.book_id FOR UPDATE;
 IF NOT FOUND OR book_row.updated_at IS DISTINCT FROM p_expected_book_updated_at THEN RAISE EXCEPTION 'Book changed or unavailable' USING ERRCODE='40001'; END IF;
 PERFORM 1 FROM libri.images WHERE library_id=p_library_id AND book_id=book_row.id ORDER BY id FOR UPDATE;
 SELECT * INTO image_row FROM libri.images WHERE library_id=p_library_id AND book_id=book_row.id AND id=p_image_id;
 IF NOT FOUND OR image_row.updated_at IS DISTINCT FROM p_expected_image_updated_at THEN RAISE EXCEPTION 'Image changed or unavailable' USING ERRCODE='40001'; END IF;
 IF image_row.ocr_status='processing' THEN RAISE EXCEPTION 'Wait for image processing before editing' USING ERRCODE='40001'; END IF;
 IF p_action='cover' THEN
  IF EXISTS(SELECT 1 FROM libri.images WHERE library_id=p_library_id AND book_id=book_row.id AND image_type='cover' AND ocr_status='processing') THEN RAISE EXCEPTION 'Wait for cover processing before editing' USING ERRCODE='40001'; END IF;
  UPDATE libri.images SET image_type='page' WHERE library_id=p_library_id AND book_id=book_row.id AND image_type='cover' AND id<>p_image_id;
  GET DIAGNOSTICS demoted_count=ROW_COUNT;
  UPDATE libri.images SET image_type='cover',chapter_id=NULL,page_label=NULL,ocr_status='complete',ocr_version=ocr_version+1,
   ocr_metadata=ocr_metadata||jsonb_build_object('manualCover',jsonb_build_object('actorId',actor_id,'appliedAt',event_time))
   WHERE library_id=p_library_id AND id=p_image_id RETURNING * INTO image_row;
 ELSE
  PERFORM 1 FROM libri.chapters WHERE library_id=p_library_id AND book_id=book_row.id ORDER BY id FOR UPDATE;
  SELECT coalesce(max(position),-1)+1,count(*) INTO next_position,chapter_count FROM libri.chapters WHERE library_id=p_library_id AND book_id=book_row.id;
  IF chapter_count+jsonb_array_length(p_changes->'chapters')>1000 THEN RAISE EXCEPTION 'TOC is too large' USING ERRCODE='54000'; END IF;
  FOR entry IN SELECT value FROM jsonb_array_elements(p_changes->'chapters') LOOP
   -- Exact normalized identity mirrors the original additive TOC behavior; never replace research.
   IF NOT EXISTS(SELECT 1 FROM libri.chapters WHERE library_id=p_library_id AND book_id=book_row.id
     AND lower(btrim(number))=lower(btrim(entry->>'number')) AND lower(btrim(title))=lower(btrim(entry->>'title'))) THEN
    INSERT INTO libri.chapters(library_id,book_id,position,number,title,page_start)
    VALUES(p_library_id,book_row.id,next_position,btrim(entry->>'number'),btrim(entry->>'title'),nullif(btrim(entry->>'page'),''));
    next_position:=next_position+1;created_count:=created_count+1;
   END IF;
  END LOOP;
  -- Retain prior OCR evidence as archived rather than deleting its provenance.
  UPDATE libri.source_chunks SET is_archived=true,archived_at=event_time WHERE library_id=p_library_id AND image_id=p_image_id AND chunk_type='ocr' AND NOT is_archived;
  UPDATE libri.images SET image_type='toc',chapter_id=NULL,ocr_status='complete',ocr_version=ocr_version+1,
   description=CASE WHEN p_changes ? 'description' THEN nullif(btrim(p_changes->>'description'),'') ELSE description END,
   ocr_metadata=ocr_metadata||jsonb_build_object('manualToc',jsonb_build_object('actorId',actor_id,'appliedAt',event_time,'text',p_changes->>'text','chapters',p_changes->'chapters'))
   WHERE library_id=p_library_id AND id=p_image_id RETURNING * INTO image_row;
  UPDATE libri.derived_artifacts SET status='outdated',reviewed_at=NULL WHERE library_id=p_library_id AND is_current AND status IN ('generated','reviewed','outdated') AND
   ((book_id=book_row.id AND artifact_type='book_analysis') OR (artifact_type='agent_knowledge_doc' AND agent_profile_id IN (SELECT id FROM libri.agent_profiles WHERE library_id=p_library_id AND book_id=book_row.id)));
 END IF;
 UPDATE libri.books SET indexing=indexing||jsonb_build_object(
  'hasCover',EXISTS(SELECT 1 FROM libri.images WHERE library_id=p_library_id AND book_id=book_row.id AND image_type='cover'),
  'ocrComplete',NOT EXISTS(SELECT 1 FROM libri.images WHERE library_id=p_library_id AND book_id=book_row.id AND ocr_status IN ('pending','processing','failed')))
  ||CASE WHEN p_action='toc' THEN '{"hasToc":true,"chaptersExtracted":true}'::jsonb ELSE '{}'::jsonb END,
  toc=CASE WHEN p_action='toc' THEN (coalesce(toc,'{}'::jsonb)-'lastError')||jsonb_build_object('status','from_images','sourceImageIds',
    (SELECT coalesce(jsonb_agg(id ORDER BY created_at,id),'[]') FROM libri.images WHERE library_id=p_library_id AND book_id=book_row.id AND image_type='toc'),
    'extractedAt',floor(extract(epoch FROM event_time)*1000),'lastAttemptAt',floor(extract(epoch FROM event_time)*1000)) ELSE toc END
  WHERE library_id=p_library_id AND id=book_row.id RETURNING * INTO book_row;
 INSERT INTO libri.activity_events(library_id,actor_user_id,event_type,source,book_id,book_slug,book_title,message)
 VALUES(p_library_id,actor_id,'admin.action',CASE p_action WHEN 'cover' THEN 'processing.markImageAsCover' ELSE 'processing.applyManualTocText' END,
  book_row.id,left(book_row.slug,180),left(book_row.title,240),CASE p_action WHEN 'cover' THEN 'Updated book cover.' ELSE format('Applied manual TOC text; %s new chapters.',created_count) END);
 RETURN jsonb_build_object('ok',true,'imageId',image_row.id,'bookId',book_row.id,'updatedAt',image_row.updated_at,'bookUpdatedAt',book_row.updated_at,
  'demotedCoverCount',demoted_count,'created',created_count,'chapterCount',CASE WHEN p_action='toc' THEN jsonb_array_length(p_changes->'chapters') ELSE 0 END);
END;
$function$;
REVOKE ALL ON FUNCTION libri.edit_application_image(uuid,uuid,text,timestamptz,timestamptz,jsonb) FROM PUBLIC,anon,authenticated,service_role,libri_worker,libri_frontend_reader;
GRANT EXECUTE ON FUNCTION libri.edit_application_image(uuid,uuid,text,timestamptz,timestamptz,jsonb) TO authenticated;
NOTIFY pgrst,'reload schema';
