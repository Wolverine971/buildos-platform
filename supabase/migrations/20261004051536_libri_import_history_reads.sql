-- libri-migration: true
-- Imported intake records are owner-only history, never executable jobs.
SET lock_timeout='5s';
SET statement_timeout='60s';
CREATE TABLE libri.import_history (
 id uuid PRIMARY KEY,library_id uuid NOT NULL REFERENCES libri.libraries(id) ON DELETE CASCADE,
 kind text NOT NULL CHECK(kind IN ('book','video')),book_id uuid,video_id uuid,
 source_id text NOT NULL CHECK(length(source_id) BETWEEN 1 AND 100),
 source_sha256 text NOT NULL CHECK(source_sha256~'^[0-9a-f]{64}$'),
 archive_sha256 text NOT NULL CHECK(archive_sha256~'^[0-9a-f]{64}$'),
 original_status text NOT NULL CHECK(original_status IN ('queued','processing','needs_review','complete','failed','canceled')),
 created_at timestamptz NOT NULL,
 record jsonb NOT NULL CHECK(jsonb_typeof(record)='object' AND octet_length(record::text)<=1000000),
 imported_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(library_id,kind,source_id),
 CHECK((kind='book' AND video_id IS NULL) OR (kind='video' AND book_id IS NULL)),
 FOREIGN KEY(library_id,book_id) REFERENCES libri.books(library_id,id) ON DELETE SET NULL(book_id),
 FOREIGN KEY(library_id,video_id) REFERENCES libri.youtube_videos(library_id,id) ON DELETE SET NULL(video_id)
);
CREATE INDEX import_history_library_kind_time_idx ON libri.import_history(library_id,kind,created_at DESC,id);
CREATE INDEX import_history_book_idx ON libri.import_history(library_id,book_id) WHERE book_id IS NOT NULL;
CREATE INDEX import_history_video_idx ON libri.import_history(library_id,video_id) WHERE video_id IS NOT NULL;
ALTER TABLE libri.import_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE libri.import_history FORCE ROW LEVEL SECURITY;
CREATE POLICY import_history_owner_read ON libri.import_history FOR SELECT TO authenticated
 USING(EXISTS(SELECT 1 FROM libri.library_members m WHERE m.library_id=import_history.library_id AND m.user_id=(SELECT auth.uid()) AND m.role='owner'));
REVOKE ALL ON libri.import_history FROM PUBLIC,anon,authenticated,libri_worker,libri_frontend_reader;
GRANT SELECT ON libri.import_history TO authenticated;
GRANT ALL ON libri.import_history TO service_role;

CREATE FUNCTION libri.read_import_history(p_library_id uuid,p_kind text,p_import_id uuid DEFAULT NULL,p_limit integer DEFAULT 20,p_snapshot boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=pg_catalog,libri
AS $function$
DECLARE response jsonb;
BEGIN
 IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM libri.library_members WHERE library_id=p_library_id AND user_id=auth.uid() AND role='owner') THEN
  RAISE EXCEPTION 'Library owner required' USING ERRCODE='42501'; END IF;
 IF p_kind IS NULL OR p_kind NOT IN ('book','video') OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 50 OR p_snapshot IS NULL THEN
  RAISE EXCEPTION 'Invalid import history filter' USING ERRCODE='22023'; END IF;
 WITH selected AS MATERIALIZED (
  SELECT h.* FROM libri.import_history h WHERE h.library_id=p_library_id AND h.kind=p_kind AND (p_import_id IS NULL OR h.id=p_import_id)
  ORDER BY h.created_at DESC,h.id LIMIT p_limit
 ), projected AS (
  SELECT h.created_at,h.id,
  (CASE WHEN p_snapshot THEN '{}'::jsonb ELSE h.record END)||jsonb_build_object(
   '_id',h.id,'kind',h.kind,'createdAt',floor(extract(epoch FROM h.created_at)*1000),'archived',true,'originalStatus',h.original_status,
   'status','archived','step',h.record->>'step','error',h.record->>'error',
   'message','Archived import; no processing has been restarted.',
   'bookId',h.book_id,'videoId',h.video_id,'bookSlug',b.slug,
   'book',CASE WHEN b.id IS NULL THEN NULL ELSE jsonb_build_object('_id',b.id,'title',b.title,'slug',b.slug,'indexing',b.indexing) END,
   'ocrStats',NULL,
   'inputYoutubeVideoId',h.record->'input'->>'youtubeVideoId',
   'extractedYoutubeVideoId',h.record->'extracted'->>'youtubeVideoId',
   'video',CASE WHEN v.id IS NULL THEN NULL ELSE jsonb_build_object('_id',v.id,'youtubeVideoId',v.youtube_video_id,'title',s.title) END,
   'channel',CASE WHEN c.id IS NULL THEN NULL ELSE jsonb_build_object('_id',c.id,'title',c.title) END,
   'transcriptStats',CASE WHEN v.id IS NULL THEN NULL ELSE jsonb_build_object('totalSegments',(SELECT count(*) FROM libri.source_chunks sc WHERE sc.library_id=h.library_id AND sc.source_id=v.source_id AND sc.chunk_type='transcript')) END
  ) item FROM selected h LEFT JOIN libri.books b ON b.library_id=h.library_id AND b.id=h.book_id
  LEFT JOIN libri.youtube_videos v ON v.library_id=h.library_id AND v.id=h.video_id
  LEFT JOIN libri.sources s ON s.library_id=v.library_id AND s.id=v.source_id
  LEFT JOIN libri.youtube_channels c ON c.library_id=v.library_id AND c.id=v.channel_id
 ), sized AS (SELECT item,created_at,id,sum(octet_length(item::text)) OVER (ORDER BY created_at DESC,id) AS bytes FROM projected)
 SELECT coalesce(jsonb_agg(item ORDER BY created_at DESC,id),'[]') INTO response FROM sized WHERE bytes<=1800000;
 RETURN response;
END;
$function$;
REVOKE ALL ON FUNCTION libri.read_import_history(uuid,text,uuid,integer,boolean) FROM PUBLIC,anon,authenticated,service_role,libri_worker,libri_frontend_reader;
GRANT EXECUTE ON FUNCTION libri.read_import_history(uuid,text,uuid,integer,boolean) TO authenticated;
NOTIFY pgrst,'reload schema';
