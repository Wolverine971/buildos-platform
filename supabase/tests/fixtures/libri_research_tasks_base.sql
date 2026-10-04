-- TEST FIXTURE ONLY: disposable database, never a linked project.
\ir libri_worker_access_boundary_base.sql
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='libri_frontend_reader') THEN CREATE ROLE libri_frontend_reader NOLOGIN; END IF;
END $$;
\ir ../../migrations/20261004012951_libri_application_activity.sql
\ir ../../migrations/20261004015552_libri_manual_book_edits.sql
\ir ../../migrations/20261004021418_libri_research_task_management.sql
