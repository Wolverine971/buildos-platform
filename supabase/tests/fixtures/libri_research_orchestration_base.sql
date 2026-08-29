-- TEST FIXTURE ONLY: bootstrap a disposable PostgreSQL database for the Libri
-- research-orchestration contract. Never apply this fixture to a linked database.

\ir libri_derived_artifacts_profiles_base.sql

CREATE TYPE public.queue_type AS ENUM ('other');

\ir ../../migrations/20260829232231_libri_research_orchestration.sql
