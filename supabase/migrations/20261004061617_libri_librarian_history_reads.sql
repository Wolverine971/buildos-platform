-- libri-migration: true
-- Inert, owner-only audit history; no executable scheduler or job state.
SET lock_timeout='5s';
SET statement_timeout='60s';
CREATE TABLE libri.librarian_history (
 id uuid PRIMARY KEY,
 library_id uuid NOT NULL REFERENCES libri.libraries(id) ON DELETE CASCADE,
 kind text NOT NULL CHECK(kind IN ('run','event')),
 book_id uuid,
 run_id uuid,
 parent_kind text NOT NULL DEFAULT 'run' CHECK(parent_kind='run'),
 source_id text NOT NULL CHECK(length(source_id) BETWEEN 1 AND 100),
 source_sha256 text NOT NULL CHECK(source_sha256~'^[0-9a-f]{64}$'),
 archive_sha256 text NOT NULL CHECK(archive_sha256~'^[0-9a-f]{64}$'),
 original_status text CHECK(original_status IN ('queued','running','completed','failed','cancelled')),
 trigger text CHECK(trigger IN ('nightly','manual_audit_now','event_driven')),
 duty text CHECK(duty IN ('ocr_verification','ai_content_review','deduplication','accuracy_check','staleness_detection','score_refresh')),
 action text CHECK(action IN ('flagged','merged','marked_outdated','created_task','auto_fixed','info')),
 message text CHECK(octet_length(message)<=64000),
 error text CHECK(octet_length(error)<=64000),
 started_at timestamptz,finished_at timestamptz,created_at timestamptz NOT NULL,
 record jsonb NOT NULL CHECK(jsonb_typeof(record)='object' AND octet_length(record::text)<=1000000),
 imported_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(library_id,kind,source_id),UNIQUE(library_id,kind,id),
 CHECK((kind='run' AND run_id IS NULL AND original_status IS NOT NULL AND trigger IS NOT NULL AND duty IS NULL AND action IS NULL AND message IS NULL)
  OR (kind='event' AND original_status IS NULL AND duty IS NOT NULL AND action IS NOT NULL AND message IS NOT NULL AND started_at IS NULL AND finished_at IS NULL AND error IS NULL)),
 FOREIGN KEY(library_id,book_id) REFERENCES libri.books(library_id,id) ON DELETE SET NULL(book_id),
 FOREIGN KEY(library_id,parent_kind,run_id) REFERENCES libri.librarian_history(library_id,kind,id) ON DELETE SET NULL(run_id)
);
CREATE INDEX librarian_history_kind_time_idx ON libri.librarian_history(library_id,kind,created_at DESC,id);
CREATE INDEX librarian_history_book_time_idx ON libri.librarian_history(library_id,kind,book_id,created_at DESC,id) WHERE book_id IS NOT NULL;
CREATE INDEX librarian_history_run_time_idx ON libri.librarian_history(library_id,run_id,created_at DESC,id) WHERE run_id IS NOT NULL;
CREATE INDEX librarian_history_status_time_idx ON libri.librarian_history(library_id,original_status,created_at DESC,id) WHERE kind='run';
ALTER TABLE libri.librarian_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE libri.librarian_history FORCE ROW LEVEL SECURITY;
CREATE POLICY librarian_history_owner_read ON libri.librarian_history FOR SELECT TO authenticated
 USING(EXISTS(SELECT 1 FROM libri.library_members m WHERE m.library_id=librarian_history.library_id AND m.user_id=(SELECT auth.uid()) AND m.role='owner'));
REVOKE ALL ON libri.librarian_history FROM PUBLIC,anon,authenticated,libri_worker,libri_frontend_reader;
GRANT SELECT ON libri.librarian_history TO authenticated;
GRANT ALL ON libri.librarian_history TO service_role;
NOTIFY pgrst,'reload schema';
