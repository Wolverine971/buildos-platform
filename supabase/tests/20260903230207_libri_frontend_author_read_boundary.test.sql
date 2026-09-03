-- PSQL-ONLY / DISPOSABLE DATABASE ONLY. Never run against a linked database.
\set ON_ERROR_STOP on
\ir fixtures/libri_frontend_catalog_read_boundary_base.sql

ALTER TABLE libri.people ADD COLUMN links jsonb;
ALTER TABLE libri.people ADD COLUMN name_normalized text;
\ir ../migrations/20260902025903_libri_frontend_catalog_read_boundary.sql

SELECT md5(row_to_json(control)::text) AS buildos_control_before
FROM public.buildos_control control WHERE id = 1
\gset
SELECT md5(string_agg(row_to_json(p)::text, ',' ORDER BY policyname)) AS policies_before
FROM pg_policies p WHERE schemaname = 'libri'
\gset

INSERT INTO libri.people (id, library_id, slug, name, bio, links) VALUES
('82000000-0000-4000-8000-000000000001', 'f09948c4-e4e0-581c-8689-7258bea2f501', NULL, 'Visible author', 'Visible biography', '{"website":"https://example.com"}'),
('82000000-0000-4000-8000-000000000002', '8aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'hidden-author', 'Hidden author', 'Hidden biography', '{"website":"https://hidden.example.com"}');

\ir ../migrations/20260903230207_libri_frontend_author_read_boundary.sql
-- Reapplying the additive grant must be harmless.
\ir ../migrations/20260903230207_libri_frontend_author_read_boundary.sql

CREATE FUNCTION pg_temp.assert_true(condition boolean, message text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF condition IS DISTINCT FROM true THEN RAISE EXCEPTION 'assertion failed: %', message; END IF;
END;
$$;

SELECT pg_temp.assert_true(
  has_column_privilege('libri_frontend_reader', 'libri.people', 'bio', 'SELECT')
  AND has_column_privilege('libri_frontend_reader', 'libri.people', 'links', 'SELECT')
  AND NOT has_column_privilege('libri_frontend_reader', 'libri.people', 'library_id', 'SELECT')
  AND NOT has_column_privilege('libri_frontend_reader', 'libri.people', 'name_normalized', 'SELECT')
  AND NOT has_table_privilege('libri_frontend_reader', 'libri.people', 'SELECT, INSERT, UPDATE, DELETE')
  AND NOT has_table_privilege('libri_frontend_reader', 'public.buildos_control', 'SELECT, INSERT, UPDATE, DELETE'),
  'only the two reviewed profile columns are added, with no table-wide or BuildOS grants'
);
SELECT pg_temp.assert_true(
  (SELECT relrowsecurity AND relforcerowsecurity FROM pg_class WHERE oid = 'libri.people'::regclass),
  'forced RLS remains enabled'
);
SELECT pg_temp.assert_true(
  (SELECT rolconnlimit = 3 AND NOT rolsuper AND NOT rolbypassrls AND NOT rolcreaterole
   FROM pg_roles WHERE rolname = 'libri_frontend_reader'),
  'reader role limits are unchanged'
);

SET ROLE libri_frontend_reader;
SELECT pg_temp.assert_true(
  (SELECT count(*) = 1 AND min(bio) = 'Visible biography' FROM libri.people),
  'biographies stay restricted to the fixed library'
);
SELECT pg_temp.assert_true(
  (SELECT links->>'website' = 'https://example.com' FROM libri.people),
  'links retain their original value within the permitted library'
);
DO $$
BEGIN
  BEGIN
    PERFORM library_id FROM libri.people;
    RAISE EXCEPTION 'unexpected library_id access';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    UPDATE libri.people SET bio = 'forbidden';
    RAISE EXCEPTION 'unexpected biography write';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    PERFORM value FROM public.buildos_control;
    RAISE EXCEPTION 'unexpected BuildOS read';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END;
$$;
RESET ROLE;
SELECT pg_temp.assert_true(
  (SELECT md5(row_to_json(control)::text) FROM public.buildos_control control WHERE id = 1) = :'buildos_control_before',
  'BuildOS control remains unchanged'
);
SELECT pg_temp.assert_true(
  (SELECT md5(string_agg(row_to_json(p)::text, ',' ORDER BY policyname)) FROM pg_policies p WHERE schemaname = 'libri') = :'policies_before',
  'no catalog RLS policy changes'
);
