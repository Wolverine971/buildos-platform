-- supabase/tests/fixtures/purge_soft_deleted_items_base.sql
-- TEST FIXTURE ONLY. Bootstraps a brand-new disposable PostgreSQL database for
-- apps/worker/tests/purgeSoftDeletedItems.postgres.test.ts, before
-- 20260924190350_task_archive_state.sql and
-- 20260924190400_purge_soft_deleted_items.sql are applied on top.
--
-- Column-shaped stubs carrying the foreign keys and triggers the purge has to
-- get past, with the delete rules the migrations declare. Where the repo does
-- not record a rule (onto_project_logs.project_id, onto_edges.project_id,
-- onto_event_sync.event_id, onto_events.project_id) the stub uses NO ACTION,
-- the strictest one, so the purge has to delete those children itself.
-- delete_onto_project() and its calendar triggers are the real migration; the
-- embedding enqueue trigger body is the released one.
-- Never apply this file to a local, staging, or hosted Supabase database.
SET client_min_messages = warning;

DO $$
BEGIN
	IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
	IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
	IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
END;
$$;
CREATE SCHEMA IF NOT EXISTS auth;
CREATE SCHEMA IF NOT EXISTS storage;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

CREATE TABLE auth.users (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
CREATE TABLE public.users (id uuid PRIMARY KEY REFERENCES auth.users(id));
CREATE TABLE public.onto_actors (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	user_id uuid REFERENCES public.users(id) ON DELETE CASCADE,
	name text
);

CREATE TABLE storage.objects (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	bucket_id text NOT NULL,
	name text NOT NULL,
	owner_id text,
	created_at timestamptz NOT NULL DEFAULT now(),
	UNIQUE (bucket_id, name)
);

-- Queue: add_queue_job dedups only against pending/processing rows.
CREATE TABLE public.queue_jobs (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	user_id uuid,
	job_type text NOT NULL,
	metadata jsonb,
	priority integer,
	scheduled_for timestamptz,
	dedup_key text,
	status text NOT NULL DEFAULT 'pending',
	queue_job_id text
);
CREATE UNIQUE INDEX queue_jobs_dedup_active_idx ON public.queue_jobs (dedup_key)
	WHERE dedup_key IS NOT NULL AND status IN ('pending', 'processing');

CREATE FUNCTION public.add_queue_job(
	p_user_id uuid,
	p_job_type text,
	p_metadata jsonb,
	p_priority integer DEFAULT 10,
	p_scheduled_for timestamptz DEFAULT now(),
	p_dedup_key text DEFAULT NULL::text
)
RETURNS uuid
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $function$
DECLARE
	v_job_id uuid;
BEGIN
	INSERT INTO public.queue_jobs (user_id, job_type, metadata, priority, scheduled_for, dedup_key, queue_job_id)
	VALUES (p_user_id, p_job_type, p_metadata, p_priority, p_scheduled_for, p_dedup_key, p_job_type || '_' || gen_random_uuid())
	ON CONFLICT (dedup_key) WHERE dedup_key IS NOT NULL AND status IN ('pending', 'processing')
	DO NOTHING
	RETURNING id INTO v_job_id;
	RETURN v_job_id;
END;
$function$;

-- ---------------------------------------------------------------------------
-- Ontology
-- ---------------------------------------------------------------------------

CREATE TABLE public.onto_projects (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	name text NOT NULL,
	description text,
	next_step_short text,
	next_step_long text,
	created_by uuid NOT NULL REFERENCES public.onto_actors(id) ON DELETE RESTRICT,
	doc_structure jsonb DEFAULT '{"version": 1, "root": []}'::jsonb,
	context_document_id uuid,
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now(),
	archived_at timestamptz,
	deleted_at timestamptz
);

CREATE TABLE public.onto_goals (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	project_id uuid NOT NULL REFERENCES public.onto_projects(id) ON DELETE CASCADE,
	name text, description text, goal text,
	created_by uuid, updated_at timestamptz DEFAULT now(), deleted_at timestamptz
);
CREATE TABLE public.onto_requirements (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	project_id uuid NOT NULL REFERENCES public.onto_projects(id) ON DELETE CASCADE,
	text text, created_by uuid, updated_at timestamptz DEFAULT now(), deleted_at timestamptz
);
CREATE TABLE public.onto_plans (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	project_id uuid NOT NULL REFERENCES public.onto_projects(id) ON DELETE CASCADE,
	name text, description text, plan text,
	created_by uuid, updated_at timestamptz DEFAULT now(), deleted_at timestamptz
);
CREATE TABLE public.onto_tasks (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	project_id uuid NOT NULL REFERENCES public.onto_projects(id) ON DELETE CASCADE,
	plan_id uuid REFERENCES public.onto_plans(id) ON DELETE SET NULL,
	title text NOT NULL, description text,
	created_by uuid, updated_at timestamptz DEFAULT now(), deleted_at timestamptz,
	archived_at timestamptz
);
CREATE TABLE public.onto_documents (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	project_id uuid NOT NULL REFERENCES public.onto_projects(id) ON DELETE CASCADE,
	title text NOT NULL, description text, content text,
	created_by uuid, updated_at timestamptz DEFAULT now(), deleted_at timestamptz
);
ALTER TABLE public.onto_projects
	ADD CONSTRAINT fk_context_document FOREIGN KEY (context_document_id)
	REFERENCES public.onto_documents(id) ON DELETE SET NULL;
CREATE TABLE public.onto_sources (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	project_id uuid NOT NULL REFERENCES public.onto_projects(id) ON DELETE CASCADE
);
CREATE TABLE public.onto_risks (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	project_id uuid NOT NULL REFERENCES public.onto_projects(id) ON DELETE CASCADE,
	title text, content text, created_by uuid, updated_at timestamptz DEFAULT now(), deleted_at timestamptz
);
CREATE TABLE public.onto_milestones (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	project_id uuid NOT NULL REFERENCES public.onto_projects(id) ON DELETE CASCADE,
	title text, description text, milestone text,
	created_by uuid, updated_at timestamptz DEFAULT now(), deleted_at timestamptz
);
CREATE TABLE public.onto_metrics (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	project_id uuid NOT NULL REFERENCES public.onto_projects(id) ON DELETE CASCADE
);
CREATE TABLE public.onto_metric_points (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	metric_id uuid NOT NULL REFERENCES public.onto_metrics(id) ON DELETE CASCADE
);
CREATE TABLE public.onto_signals (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	project_id uuid NOT NULL REFERENCES public.onto_projects(id) ON DELETE CASCADE
);
CREATE TABLE public.onto_insights (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	project_id uuid NOT NULL REFERENCES public.onto_projects(id) ON DELETE CASCADE
);
CREATE TABLE public.onto_events (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	project_id uuid REFERENCES public.onto_projects(id),
	title text NOT NULL,
	description text,
	location text,
	created_by uuid,
	props jsonb NOT NULL DEFAULT '{}'::jsonb,
	sync_status text,
	sync_error text,
	updated_at timestamptz DEFAULT now(),
	deleted_at timestamptz
);
CREATE TABLE public.project_calendars (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	project_id uuid NOT NULL REFERENCES public.onto_projects(id) ON DELETE CASCADE,
	user_id uuid,
	calendar_id text,
	calendar_source_id uuid
);
CREATE TABLE public.onto_event_sync (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	event_id uuid NOT NULL REFERENCES public.onto_events(id),
	user_id uuid,
	provider text NOT NULL DEFAULT 'google',
	external_event_id text,
	external_calendar_id text,
	calendar_source_id uuid,
	project_calendar_id uuid REFERENCES public.project_calendars(id),
	sync_status text,
	sync_error text
);
CREATE TABLE public.task_calendar_events (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	user_id uuid,
	project_calendar_id uuid,
	calendar_event_id text,
	calendar_id text,
	calendar_source_id uuid,
	sync_status text
);
CREATE TABLE public.onto_document_versions (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	document_id uuid NOT NULL REFERENCES public.onto_documents(id) ON DELETE CASCADE,
	number integer NOT NULL,
	props jsonb NOT NULL DEFAULT '{}'::jsonb,
	UNIQUE (document_id, number)
);
CREATE TABLE public.onto_document_proposals (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	project_id uuid NOT NULL REFERENCES public.onto_projects(id) ON DELETE CASCADE,
	document_id uuid NOT NULL REFERENCES public.onto_documents(id) ON DELETE CASCADE,
	instruction text NOT NULL,
	patch jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE TABLE public.onto_public_pages (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	project_id uuid NOT NULL REFERENCES public.onto_projects(id) ON DELETE CASCADE,
	document_id uuid NOT NULL REFERENCES public.onto_documents(id) ON DELETE CASCADE,
	slug text NOT NULL,
	published_content text,
	deleted_at timestamptz
);
CREATE TABLE public.onto_edges (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	project_id uuid REFERENCES public.onto_projects(id),
	src_kind text NOT NULL, src_id uuid NOT NULL,
	rel text NOT NULL,
	dst_kind text NOT NULL, dst_id uuid NOT NULL,
	props jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE TABLE public.onto_assignments (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	actor_id uuid REFERENCES public.onto_actors(id) ON DELETE CASCADE,
	object_kind text NOT NULL, object_id uuid NOT NULL, role_key text
);
CREATE TABLE public.onto_permissions (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	object_kind text NOT NULL, object_id uuid NOT NULL, access text
);
CREATE TABLE public.legacy_entity_mappings (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	onto_table text NOT NULL, onto_id uuid NOT NULL
);
CREATE TABLE public.onto_project_logs (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	project_id uuid NOT NULL REFERENCES public.onto_projects(id),
	entity_type text NOT NULL,
	entity_id uuid NOT NULL,
	action text NOT NULL,
	before_data jsonb,
	after_data jsonb,
	changed_by uuid NOT NULL REFERENCES auth.users(id),
	created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.onto_embeddings (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	entity_type text NOT NULL,
	entity_id uuid NOT NULL,
	project_id uuid NOT NULL REFERENCES public.onto_projects(id) ON DELETE CASCADE,
	chunk_index integer NOT NULL DEFAULT 0,
	content_text text NOT NULL
);
CREATE TABLE public.onto_project_structure_history (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	project_id uuid NOT NULL REFERENCES public.onto_projects(id) ON DELETE CASCADE,
	doc_structure jsonb NOT NULL,
	version integer NOT NULL,
	changed_at timestamptz DEFAULT now()
);
CREATE TABLE public.onto_task_assignees (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	project_id uuid NOT NULL REFERENCES public.onto_projects(id) ON DELETE CASCADE,
	task_id uuid NOT NULL REFERENCES public.onto_tasks(id) ON DELETE CASCADE,
	assignee_actor_id uuid NOT NULL REFERENCES public.onto_actors(id) ON DELETE CASCADE
);

-- Comments: self-referencing cascades plus the released update guard.
CREATE TABLE public.onto_comments (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	project_id uuid NOT NULL REFERENCES public.onto_projects(id) ON DELETE CASCADE,
	entity_type text NOT NULL,
	entity_id uuid NOT NULL,
	parent_id uuid REFERENCES public.onto_comments(id) ON DELETE CASCADE,
	root_id uuid NOT NULL REFERENCES public.onto_comments(id) ON DELETE CASCADE,
	body text NOT NULL,
	metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
	created_by uuid NOT NULL REFERENCES public.onto_actors(id),
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now(),
	edited_at timestamptz,
	deleted_at timestamptz,
	CONSTRAINT chk_onto_comments_body_length CHECK (char_length(body) > 0 AND char_length(body) <= 10000)
);
CREATE FUNCTION public.onto_comments_before_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.project_id <> OLD.project_id
    OR NEW.entity_type <> OLD.entity_type
    OR NEW.entity_id <> OLD.entity_id
    OR NEW.parent_id <> OLD.parent_id
    OR NEW.root_id <> OLD.root_id
    OR NEW.created_by <> OLD.created_by
    OR NEW.created_at <> OLD.created_at THEN
    RAISE EXCEPTION 'Immutable comment fields cannot be changed';
  END IF;
  IF NEW.body IS DISTINCT FROM OLD.body THEN
    NEW.edited_at := now();
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_onto_comments_before_update
	BEFORE UPDATE ON public.onto_comments
	FOR EACH ROW EXECUTE FUNCTION public.onto_comments_before_update();

CREATE TABLE public.onto_assets (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	project_id uuid NOT NULL REFERENCES public.onto_projects(id) ON DELETE CASCADE,
	storage_bucket text NOT NULL DEFAULT 'onto-assets',
	storage_path text NOT NULL,
	caption text,
	alt_text text,
	extraction_summary text,
	extracted_text text,
	created_by uuid NOT NULL REFERENCES public.onto_actors(id),
	deleted_at timestamptz
);
CREATE TABLE public.onto_asset_links (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	project_id uuid NOT NULL REFERENCES public.onto_projects(id) ON DELETE CASCADE,
	asset_id uuid NOT NULL REFERENCES public.onto_assets(id) ON DELETE CASCADE,
	entity_kind text NOT NULL,
	entity_id uuid NOT NULL
);
CREATE TABLE public.chat_message_attachments (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	project_id uuid REFERENCES public.onto_projects(id) ON DELETE CASCADE,
	asset_id uuid REFERENCES public.onto_assets(id) ON DELETE CASCADE,
	storage_path text
);

-- Cycles: runs are NO ACTION into cycles and their identity is immutable.
CREATE TABLE public.cycles (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
	project_id uuid REFERENCES public.onto_projects(id) ON DELETE CASCADE,
	state text NOT NULL DEFAULT 'active',
	last_run_id uuid,
	deleted_at timestamptz
);
CREATE TABLE public.cycle_triggers (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	cycle_id uuid NOT NULL REFERENCES public.cycles(id) ON DELETE CASCADE,
	state text NOT NULL DEFAULT 'active',
	deleted_at timestamptz
);
CREATE TABLE public.cycle_runs (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	cycle_id uuid NOT NULL REFERENCES public.cycles(id),
	user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
	project_id uuid REFERENCES public.onto_projects(id) ON DELETE SET NULL,
	trigger_id uuid REFERENCES public.cycle_triggers(id) ON DELETE SET NULL,
	result jsonb
);
ALTER TABLE public.cycles
	ADD CONSTRAINT cycles_last_run_id_fkey FOREIGN KEY (last_run_id)
	REFERENCES public.cycle_runs(id) ON DELETE SET NULL;
CREATE FUNCTION public.prevent_cycle_run_identity_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $function$
BEGIN
	IF ROW(NEW.cycle_id, NEW.user_id, NEW.project_id, NEW.trigger_id)
		IS DISTINCT FROM ROW(OLD.cycle_id, OLD.user_id, OLD.project_id, OLD.trigger_id) THEN
		RAISE EXCEPTION 'cycle_run_identity_is_immutable' USING ERRCODE = '23514';
	END IF;
	RETURN NEW;
END;
$function$;
CREATE TRIGGER cycle_runs_identity_immutable
	BEFORE UPDATE ON public.cycle_runs
	FOR EACH ROW EXECUTE FUNCTION public.prevent_cycle_run_identity_mutation();

CREATE TABLE public.notification_events (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	event_type text NOT NULL,
	payload jsonb NOT NULL DEFAULT '{}'::jsonb,
	cycle_run_id uuid REFERENCES public.cycle_runs(id) ON DELETE SET NULL
);

-- Released embedding enqueue trigger (20260828120000), fired by every delete.
CREATE FUNCTION public.enqueue_onto_entity_embedding()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
	v_entity_type text := TG_ARGV[0];
	v_fields text[] := TG_ARGV[1:TG_NARGS - 1];
	v_row jsonb;
	v_old jsonb;
	v_digest text;
	v_old_digest text;
	v_deleted boolean;
	v_was_deleted boolean;
	v_project_id uuid;
	v_user_id uuid;
BEGIN
	IF TG_OP = 'DELETE' THEN
		v_row := to_jsonb(OLD);
		v_deleted := true;
	ELSE
		v_row := to_jsonb(NEW);
		v_deleted := (v_row ->> 'deleted_at') IS NOT NULL;
	END IF;
	SELECT md5(string_agg(coalesce(v_row ->> f, ''), chr(31) ORDER BY ord))
	INTO v_digest
	FROM unnest(v_fields) WITH ORDINALITY AS t(f, ord);
	IF TG_OP = 'UPDATE' THEN
		v_old := to_jsonb(OLD);
		v_was_deleted := (v_old ->> 'deleted_at') IS NOT NULL;
		SELECT md5(string_agg(coalesce(v_old ->> f, ''), chr(31) ORDER BY ord))
		INTO v_old_digest
		FROM unnest(v_fields) WITH ORDINALITY AS t(f, ord);
		IF v_digest = v_old_digest AND v_deleted = v_was_deleted THEN
			RETURN NULL;
		END IF;
	END IF;
	v_project_id := coalesce(
		nullif(v_row ->> 'project_id', '')::uuid,
		CASE WHEN v_entity_type = 'project' THEN (v_row ->> 'id')::uuid END
	);
	IF v_project_id IS NULL THEN
		RETURN NULL;
	END IF;
	SELECT a.user_id INTO v_user_id FROM public.onto_actors a
	WHERE a.id = nullif(v_row ->> 'created_by', '')::uuid;
	IF v_user_id IS NULL THEN
		SELECT a.user_id INTO v_user_id
		FROM public.onto_projects p JOIN public.onto_actors a ON a.id = p.created_by
		WHERE p.id = v_project_id;
	END IF;
	IF v_user_id IS NULL THEN
		RETURN NULL;
	END IF;
	PERFORM public.add_queue_job(
		v_user_id, 'embed_onto_entity',
		jsonb_build_object('entityType', v_entity_type, 'entityId', v_row ->> 'id',
			'projectId', v_project_id, 'userId', v_user_id, 'deleted', v_deleted),
		10, now(),
		'embed_onto_entity:' || v_entity_type || ':' || (v_row ->> 'id') || ':'
			|| CASE WHEN v_deleted THEN 'deleted' ELSE coalesce(v_digest, '') END
	);
	RETURN NULL;
EXCEPTION WHEN OTHERS THEN
	RAISE WARNING 'enqueue_onto_entity_embedding failed for % %: %', v_entity_type, v_row ->> 'id', SQLERRM;
	RETURN NULL;
END;
$function$;
CREATE TRIGGER trg_onto_projects_embedding AFTER INSERT OR UPDATE OR DELETE ON public.onto_projects
	FOR EACH ROW EXECUTE FUNCTION public.enqueue_onto_entity_embedding('project', 'name', 'description');
CREATE TRIGGER trg_onto_tasks_embedding AFTER INSERT OR UPDATE OR DELETE ON public.onto_tasks
	FOR EACH ROW EXECUTE FUNCTION public.enqueue_onto_entity_embedding('task', 'title', 'description');
CREATE TRIGGER trg_onto_documents_embedding AFTER INSERT OR UPDATE OR DELETE ON public.onto_documents
	FOR EACH ROW EXECUTE FUNCTION public.enqueue_onto_entity_embedding('document', 'title', 'description', 'content');
CREATE TRIGGER trg_onto_events_embedding AFTER INSERT OR UPDATE OR DELETE ON public.onto_events
	FOR EACH ROW EXECUTE FUNCTION public.enqueue_onto_entity_embedding('event', 'title', 'description', 'location');
CREATE TRIGGER trg_onto_assets_embedding AFTER INSERT OR UPDATE OR DELETE ON public.onto_assets
	FOR EACH ROW EXECUTE FUNCTION public.enqueue_onto_entity_embedding('image', 'caption', 'alt_text', 'extraction_summary', 'extracted_text');

-- The released hard-delete RPC and its calendar cleanup triggers.
\ir ../../migrations/20260909034006_project_calendar_delete_cleanup.sql

-- ---------------------------------------------------------------------------
-- Voice
-- ---------------------------------------------------------------------------

CREATE TABLE public.voice_note_groups (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
	status text NOT NULL DEFAULT 'draft',
	deleted_at timestamptz
);
CREATE TABLE public.voice_notes (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
	group_id uuid REFERENCES public.voice_note_groups(id) ON DELETE CASCADE,
	storage_bucket text NOT NULL DEFAULT 'voice_notes',
	storage_path text NOT NULL,
	transcript text,
	deleted_at timestamptz
);

-- ---------------------------------------------------------------------------
-- Contacts and profile documents
-- ---------------------------------------------------------------------------

CREATE TABLE public.user_profiles (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE
);
CREATE TABLE public.profile_documents (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	profile_id uuid NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
	title text NOT NULL,
	content text,
	deleted_at timestamptz
);
CREATE TABLE public.profile_document_versions (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	document_id uuid NOT NULL REFERENCES public.profile_documents(id) ON DELETE CASCADE,
	content text
);
CREATE TABLE public.profile_fragments (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	suggested_chapter_id uuid REFERENCES public.profile_documents(id) ON DELETE SET NULL,
	content text
);
CREATE TABLE public.user_contacts (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
	display_name text NOT NULL,
	status text NOT NULL DEFAULT 'active',
	merged_into_contact_id uuid REFERENCES public.user_contacts(id) ON DELETE SET NULL,
	deleted_at timestamptz
);
CREATE TABLE public.user_contact_methods (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
	contact_id uuid NOT NULL REFERENCES public.user_contacts(id) ON DELETE CASCADE,
	value_raw text NOT NULL,
	deleted_at timestamptz
);
CREATE TABLE public.user_contact_observations (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
	proposed_display_name text,
	proposed_method_value text,
	resolved_contact_id uuid REFERENCES public.user_contacts(id) ON DELETE SET NULL
);
CREATE TABLE public.user_contact_links (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
	contact_id uuid NOT NULL REFERENCES public.user_contacts(id) ON DELETE CASCADE,
	profile_document_id uuid REFERENCES public.profile_documents(id) ON DELETE CASCADE
);

-- ---------------------------------------------------------------------------
-- Connections
-- ---------------------------------------------------------------------------

CREATE TABLE public.user_calendar_connections (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
	email_address text NOT NULL,
	status text NOT NULL DEFAULT 'active',
	deleted_at timestamptz,
	UNIQUE (id, user_id)
);
CREATE TABLE public.calendar_connection_credentials (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	connection_id uuid NOT NULL UNIQUE REFERENCES public.user_calendar_connections(id) ON DELETE CASCADE,
	refresh_token_ciphertext text NOT NULL,
	revoked_at timestamptz
);
CREATE TABLE public.user_calendar_sources (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
	connection_id uuid NOT NULL,
	summary text NOT NULL,
	deleted_at timestamptz,
	UNIQUE (id, user_id),
	FOREIGN KEY (connection_id, user_id)
		REFERENCES public.user_calendar_connections(id, user_id) ON DELETE CASCADE
);
ALTER TABLE public.project_calendars
	ADD CONSTRAINT project_calendars_calendar_source_owner_fkey
	FOREIGN KEY (calendar_source_id, user_id)
	REFERENCES public.user_calendar_sources(id, user_id)
	ON DELETE SET NULL (calendar_source_id);
CREATE TABLE public.user_email_connections (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
	email_address text NOT NULL,
	deleted_at timestamptz
);
CREATE TABLE public.email_connection_credentials (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	connection_id uuid NOT NULL UNIQUE REFERENCES public.user_email_connections(id) ON DELETE CASCADE,
	refresh_token_ciphertext text NOT NULL
);
