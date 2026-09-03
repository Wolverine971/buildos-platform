-- libri-migration: true
-- Add only the two profile columns used by the admin-only author read preview.
-- Existing fixed-library forced RLS and all role/connection limits are unchanged.
SET lock_timeout = '2s';
SET statement_timeout = '10s';

GRANT SELECT (bio, links) ON TABLE libri.people TO libri_frontend_reader;
