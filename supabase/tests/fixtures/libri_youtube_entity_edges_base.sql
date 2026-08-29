-- TEST FIXTURE ONLY: bootstrap a disposable PostgreSQL database for the Libri
-- YouTube/entity-edge contract. Never apply this fixture to a linked database.

\ir libri_images_private_storage_base.sql
\ir ../../migrations/20260829203729_libri_youtube_entity_edges.sql
