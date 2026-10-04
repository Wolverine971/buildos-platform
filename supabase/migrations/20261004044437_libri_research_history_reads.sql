-- libri-migration: true
-- Immutable imported research evidence is never executable work.
SET lock_timeout='5s';
SET statement_timeout='60s';
CREATE TABLE libri.research_history (
 id uuid PRIMARY KEY,library_id uuid NOT NULL REFERENCES libri.libraries(id) ON DELETE CASCADE,
 book_id uuid NOT NULL,chapter_id uuid,parent_id uuid,
 source_id text NOT NULL CHECK(length(source_id) BETWEEN 1 AND 100),
 source_sha256 text NOT NULL CHECK(source_sha256~'^[0-9a-f]{64}$'),
 archive_sha256 text NOT NULL CHECK(archive_sha256~'^[0-9a-f]{64}$'),
 operation text NOT NULL CHECK(operation IN ('generate_toc_from_web','research_chapter','research_all_chapters','deep_enrich_chapter','deep_enrich_all_chapters')),
 scope text NOT NULL CHECK(scope IN ('book','chapter')),
 original_status text NOT NULL CHECK(original_status IN ('running','complete','partial','insufficient_evidence','failed')),
 created_at timestamptz NOT NULL,updated_at timestamptz NOT NULL,finished_at timestamptz,
 record jsonb NOT NULL CHECK(jsonb_typeof(record)='object' AND octet_length(record::text)<=1000000),
 imported_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(library_id,source_id),
 FOREIGN KEY(library_id,book_id) REFERENCES libri.books(library_id,id) ON DELETE CASCADE,
 FOREIGN KEY(library_id,book_id,chapter_id) REFERENCES libri.chapters(library_id,book_id,id) ON DELETE CASCADE
);
CREATE INDEX research_history_book_time_idx ON libri.research_history(library_id,book_id,created_at DESC,id);
CREATE INDEX research_history_chapter_time_idx ON libri.research_history(library_id,chapter_id,created_at DESC,id);
ALTER TABLE libri.research_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE libri.research_history FORCE ROW LEVEL SECURITY;
-- Legacy input/output payloads can contain source text. Only the library owner
-- can inspect them; no member, anonymous or worker access to archived payloads.
CREATE POLICY research_history_owner_read ON libri.research_history FOR SELECT TO authenticated
 USING(EXISTS(SELECT 1 FROM libri.library_members m WHERE m.library_id=research_history.library_id AND m.user_id=(SELECT auth.uid()) AND m.role='owner'));
REVOKE ALL ON libri.research_history FROM PUBLIC,anon,authenticated,libri_worker,libri_frontend_reader;
GRANT SELECT ON libri.research_history TO authenticated;
GRANT ALL ON libri.research_history TO service_role;

CREATE FUNCTION libri.read_book_research_history(p_library_id uuid,p_book_id uuid,p_chapter_id uuid DEFAULT NULL,p_limit integer DEFAULT 40)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=pg_catalog,libri
AS $function$
DECLARE response jsonb;
BEGIN
 IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM libri.library_members WHERE library_id=p_library_id AND user_id=auth.uid()) THEN
  RAISE EXCEPTION 'Library membership required' USING ERRCODE='42501'; END IF;
 IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100 OR p_book_id IS NULL THEN RAISE EXCEPTION 'Invalid research history filter' USING ERRCODE='22023'; END IF;
 IF NOT EXISTS(SELECT 1 FROM libri.books WHERE library_id=p_library_id AND id=p_book_id)
 OR (p_chapter_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM libri.chapters WHERE library_id=p_library_id AND book_id=p_book_id AND id=p_chapter_id)) THEN
  RAISE EXCEPTION 'Research subject unavailable' USING ERRCODE='22023'; END IF;
 WITH live_candidates AS MATERIALIZED (
  SELECT s.* FROM libri.research_steps s WHERE s.library_id=p_library_id
   AND s.kind='task_execute' AND s.payload->>'taskType'='find_book_info' AND s.payload->>'bookId'=p_book_id::text
   AND (s.parent_step_id IS NULL OR s.payload->>'phase'='chapter_extract')
   AND (p_chapter_id IS NULL OR s.payload->>'chapterId'=p_chapter_id::text)
  ORDER BY s.created_at DESC,s.id LIMIT p_limit
 ), live AS (
  SELECT s.created_at,s.id,jsonb_strip_nulls(jsonb_build_object(
   '_id',s.id,'_creationTime',floor(extract(epoch FROM s.created_at)*1000),'bookId',p_book_id,
   'chapterId',s.payload->>'chapterId','parentRunId',s.parent_step_id,'scope',CASE WHEN s.payload->>'chapterId' IS NULL THEN 'book' ELSE 'chapter' END,
   'operation',CASE WHEN s.payload->>'chapterId' IS NULL THEN 'research_all_chapters' ELSE 'research_chapter' END,
   'status',CASE WHEN s.status IN ('pending','queued','leased','retry_wait','waiting') THEN 'running'
    WHEN s.result->>'outcome'='insufficient_evidence' THEN 'insufficient_evidence'
    WHEN s.status='completed' AND s.result->>'outcome' IS DISTINCT FROM 'outdated' THEN 'complete'
    WHEN s.status='needs_review' THEN 'partial' ELSE 'failed' END,
   'executionStatus',s.status,'archived',false,'runId',s.run_id,
   'message',coalesce(s.result->>'message',s.error_message),'error',s.error_message,'model',s.result->>'model',
   'createdAt',floor(extract(epoch FROM s.created_at)*1000),'updatedAt',floor(extract(epoch FROM s.updated_at)*1000),
   'finishedAt',floor(extract(epoch FROM s.completed_at)*1000),
   'outputPayload',s.result
  )) item FROM live_candidates s
 ), archive_candidates AS MATERIALIZED (
  SELECT h.* FROM libri.research_history h WHERE h.library_id=p_library_id AND h.book_id=p_book_id
   AND (p_chapter_id IS NULL OR h.chapter_id=p_chapter_id) ORDER BY h.created_at DESC,h.id LIMIT p_limit
 ), archived AS (
  SELECT h.created_at,h.id,h.record||jsonb_strip_nulls(jsonb_build_object(
   '_id',h.id,'bookId',h.book_id,'chapterId',h.chapter_id,'parentRunId',h.parent_id,
   'archived',true,'originalStatus',h.original_status,
   -- An interrupted historical run must not look active in the new worker.
   'status',CASE WHEN h.original_status='running' THEN 'archived' ELSE h.original_status END,
   'message',CASE WHEN h.original_status='running' THEN 'Archived unfinished research; it has not been restarted.' ELSE h.record->>'message' END
  )) item FROM archive_candidates h
 ), combined AS (SELECT * FROM live UNION ALL SELECT * FROM archived), bounded AS (
 SELECT item,created_at,id FROM combined ORDER BY created_at DESC,id LIMIT p_limit
 ), sized AS (
 SELECT item,created_at,id,sum(octet_length(item::text)) OVER (ORDER BY created_at DESC,id) AS bytes FROM bounded
 ) SELECT coalesce(jsonb_agg(item ORDER BY created_at DESC,id),'[]') INTO response FROM sized WHERE bytes<=1800000;
 RETURN response;
END;
$function$;
REVOKE ALL ON FUNCTION libri.read_book_research_history(uuid,uuid,uuid,integer) FROM PUBLIC,anon,authenticated,service_role,libri_worker,libri_frontend_reader;
GRANT EXECUTE ON FUNCTION libri.read_book_research_history(uuid,uuid,uuid,integer) TO authenticated;
NOTIFY pgrst,'reload schema';
