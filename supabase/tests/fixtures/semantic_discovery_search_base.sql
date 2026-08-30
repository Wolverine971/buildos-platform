-- supabase/tests/fixtures/semantic_discovery_search_base.sql
-- Minimal disposable schema for semantic-discovery lexical search verification.
-- PSQL-ONLY / DISPOSABLE DATABASE ONLY.

\ir ontology_actor_access_base.sql

CREATE EXTENSION IF NOT EXISTS pg_trgm;

ALTER TABLE public.onto_projects
	ADD COLUMN description text,
	ADD COLUMN props jsonb NOT NULL DEFAULT '{}'::jsonb,
	ADD COLUMN state_key text NOT NULL DEFAULT 'active',
	ADD COLUMN search_vector tsvector;

CREATE TABLE public.onto_tasks (
	id uuid PRIMARY KEY,
	project_id uuid NOT NULL,
	title text NOT NULL,
	description text,
	props jsonb NOT NULL DEFAULT '{}'::jsonb,
	state_key text NOT NULL DEFAULT 'todo',
	type_key text NOT NULL DEFAULT 'task.default',
	created_by uuid NOT NULL,
	deleted_at timestamptz,
	search_vector tsvector
);

CREATE TABLE public.onto_plans (
	id uuid PRIMARY KEY,
	project_id uuid NOT NULL,
	name text NOT NULL,
	description text,
	props jsonb NOT NULL DEFAULT '{}'::jsonb,
	state_key text NOT NULL DEFAULT 'active',
	type_key text NOT NULL DEFAULT 'plan.default',
	deleted_at timestamptz,
	search_vector tsvector
);

CREATE TABLE public.onto_goals (
	id uuid PRIMARY KEY,
	project_id uuid NOT NULL,
	name text NOT NULL,
	description text,
	props jsonb NOT NULL DEFAULT '{}'::jsonb,
	state_key text NOT NULL DEFAULT 'active',
	type_key text NOT NULL DEFAULT 'goal.default',
	deleted_at timestamptz,
	search_vector tsvector
);

CREATE TABLE public.onto_milestones (
	id uuid PRIMARY KEY,
	project_id uuid NOT NULL,
	title text NOT NULL,
	description text,
	props jsonb NOT NULL DEFAULT '{}'::jsonb,
	state_key text NOT NULL DEFAULT 'active',
	type_key text NOT NULL DEFAULT 'milestone.default',
	deleted_at timestamptz,
	search_vector tsvector
);

CREATE TABLE public.onto_documents (
	id uuid PRIMARY KEY,
	project_id uuid NOT NULL,
	title text NOT NULL,
	description text,
	props jsonb NOT NULL DEFAULT '{}'::jsonb,
	state_key text NOT NULL DEFAULT 'active',
	type_key text NOT NULL DEFAULT 'document.default',
	deleted_at timestamptz,
	search_vector tsvector
);

CREATE TABLE public.onto_risks (
	id uuid PRIMARY KEY,
	project_id uuid NOT NULL,
	title text NOT NULL,
	content text,
	props jsonb NOT NULL DEFAULT '{}'::jsonb,
	state_key text NOT NULL DEFAULT 'open',
	type_key text NOT NULL DEFAULT 'risk.default',
	deleted_at timestamptz,
	search_vector tsvector
);

CREATE TABLE public.onto_assets (
	id uuid PRIMARY KEY,
	project_id uuid NOT NULL,
	caption text,
	alt_text text,
	original_filename text,
	extraction_summary text,
	extracted_text text,
	ocr_status text,
	kind text,
	deleted_at timestamptz,
	search_vector tsvector
);

CREATE TABLE public.onto_requirements (
	id uuid PRIMARY KEY,
	project_id uuid NOT NULL,
	"text" text NOT NULL,
	props jsonb NOT NULL DEFAULT '{}'::jsonb,
	type_key text NOT NULL DEFAULT 'requirement.default',
	deleted_at timestamptz,
	search_vector tsvector
);
