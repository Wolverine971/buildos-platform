-- TEST FIXTURE ONLY: bootstrap a disposable PostgreSQL database for the Libri
-- derived-artifact/profile contract. Never apply this fixture to a linked database.

\ir libri_youtube_entity_edges_base.sql
\ir ../../migrations/20260829204949_libri_derived_artifacts_profiles.sql
