-- TEST FIXTURE ONLY: bootstrap a disposable PostgreSQL database for the Libri
-- source registry/chunk contract. Never apply this fixture to a linked database.

\ir libri_chapter_note_core_base.sql
\ir ../../migrations/20260829201033_libri_source_registry_chunks.sql
