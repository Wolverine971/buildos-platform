-- supabase/tests/20260907162504_document_recency_guard.test.sql
-- PSQL-ONLY / DISPOSABLE DATABASE ONLY. Never run against a linked database.
-- Calls the real trigger function with generated columns present.
\set ON_ERROR_STOP on
BEGIN;
\ir fixtures/document_recency_guard_base.sql
\ir ../migrations/20260624000000_start_here_managed_region_recency_guard.sql
\ir ../migrations/20260907162504_fix_document_content_hash_recency_guard.sql
\ir ../migrations/20260907200711_harden_document_recency_guard_search_path.sql

CREATE TEMP TABLE document_recency_probe (
 id integer primary key,
 title text default 'Meeting notes',
 description text,
 type_key text default 'document.default',
 state_key text default 'draft',
 content text,
 outline jsonb,
 props jsonb default '{}',
 updated_at timestamptz default '2026-01-01T00:00:00Z',
 search_vector tsvector generated always as (to_tsvector('english', coalesce(content, ''))) stored,
 content_hash text generated always as (encode(extensions.digest(coalesce(content, ''), 'sha256'), 'hex')) stored
);
CREATE TRIGGER update_recency BEFORE UPDATE ON document_recency_probe
 FOR EACH ROW EXECUTE FUNCTION public.update_onto_documents_updated_at();
DO $$
DECLARE saved_at timestamptz; next_at timestamptz; old_hash text; changed integer;
BEGIN
 INSERT INTO document_recency_probe(id, content) VALUES (1, '# First'), (2, 'baseline');
 SELECT updated_at INTO saved_at FROM document_recency_probe WHERE id = 1;
 UPDATE document_recency_probe SET outline = '[{"heading":"First"}]' WHERE id = 1;
 IF (SELECT updated_at FROM document_recency_probe WHERE id = 1) <> saved_at THEN
  RAISE EXCEPTION 'Outline maintenance invalidated the loaded save token';
 END IF;
 UPDATE document_recency_probe SET content = '# Second' WHERE id = 1 AND updated_at = saved_at
 RETURNING updated_at, content_hash INTO next_at, old_hash;
 IF next_at IS NULL OR next_at <= saved_at THEN RAISE EXCEPTION 'Authored edit must advance timestamp'; END IF;
 saved_at := next_at;
 UPDATE document_recency_probe SET outline = '[{"heading":"Second"}]' WHERE id = 1;
 IF (SELECT updated_at FROM document_recency_probe WHERE id = 1) <> saved_at THEN
  RAISE EXCEPTION 'Post-save outline write invalidated the returned save token';
 END IF;
 UPDATE document_recency_probe SET content = '# Third' WHERE id = 1 AND updated_at = saved_at;
 GET DIAGNOSTICS changed = ROW_COUNT;
 IF changed <> 1 THEN RAISE EXCEPTION 'Consecutive guarded autosave failed'; END IF;
 IF (SELECT content_hash FROM document_recency_probe WHERE id = 1) = old_hash THEN
  RAISE EXCEPTION 'Generated content hash did not advance';
 END IF;
 UPDATE document_recency_probe SET content = 'stale writer' WHERE id = 1 AND updated_at = '2026-01-01T00:00:00Z';
 GET DIAGNOSTICS changed = ROW_COUNT;
 IF changed <> 0 THEN RAISE EXCEPTION 'Stale author overwrote a real edit'; END IF;
 -- Every user-editable metadata field must still advance recency.
 FOR changed IN 1..5 LOOP
  DELETE FROM document_recency_probe WHERE id = 2;
  INSERT INTO document_recency_probe(id, content) VALUES (2, 'baseline');
  CASE changed
   WHEN 1 THEN UPDATE document_recency_probe SET title = 'new title' WHERE id = 2;
   WHEN 2 THEN UPDATE document_recency_probe SET description = 'new summary' WHERE id = 2;
   WHEN 3 THEN UPDATE document_recency_probe SET state_key = 'published' WHERE id = 2;
   WHEN 4 THEN UPDATE document_recency_probe SET type_key = 'document.note' WHERE id = 2;
   WHEN 5 THEN UPDATE document_recency_probe SET props = '{"user_note":"changed"}' WHERE id = 2;
  END CASE;
  IF (SELECT updated_at FROM document_recency_probe WHERE id = 2) <= '2026-01-01T00:00:00Z' THEN
   RAISE EXCEPTION 'Metadata edit % did not advance timestamp', changed;
  END IF;
 END LOOP;
 INSERT INTO document_recency_probe(id, type_key, content) VALUES
 (3, 'document.context.project', E'Authored\n<!-- managed:index v=1 -->\nBefore\n<!-- /managed:index -->');
 SELECT updated_at INTO saved_at FROM document_recency_probe WHERE id = 3;
 UPDATE document_recency_probe SET content = E'Authored\n<!-- managed:index v=1 -->\nAfter\n<!-- /managed:index -->' WHERE id = 3;
 IF (SELECT updated_at FROM document_recency_probe WHERE id = 3) <> saved_at THEN
  RAISE EXCEPTION 'Managed index refresh bumped recency';
 END IF;
 UPDATE document_recency_probe SET content = 'Authored edit' WHERE id = 3;
 IF (SELECT updated_at FROM document_recency_probe WHERE id = 3) <= saved_at THEN
  RAISE EXCEPTION 'Authored START HERE edit did not advance recency';
 END IF;
END;
$$;
ROLLBACK;
