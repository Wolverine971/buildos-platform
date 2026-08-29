-- TEST FIXTURE ONLY: bootstrap a disposable PostgreSQL database for the Libri
-- chapter/note contract. Never apply this fixture to local, staging, or hosted
-- Supabase.

\ir libri_foundation_base.sql
\ir ../../migrations/20260829192710_libri_chapter_note_core.sql
