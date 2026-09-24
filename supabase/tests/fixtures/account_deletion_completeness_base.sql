-- supabase/tests/fixtures/account_deletion_completeness_base.sql
-- TEST FIXTURE ONLY: disposable PostgreSQL bootstrap for the account-deletion
-- completeness contract. Never apply this fixture to a linked database.
--
-- The Agentic Chat tables, guard triggers and foreign keys come from the hosted
-- extract plus the released workflow migrations. Every other table is a
-- column-shaped stub carrying only the foreign keys and triggers the purge has
-- to get past, with the delete rules production reports (prod-fk export
-- 2026-09-24). delete_onto_project(), the public-page slug helpers, the user
-- privilege guard and the original deletion lifecycle are the real migrations.

\ir agentic_chat_workflow_v1_base.sql
\ir ../../migrations/20260914203007_agentic_chat_workflow_v1_storage.sql
\ir ../../migrations/20260914203008_agentic_chat_workflow_v1_dispatch_recovery.sql
\ir ../../migrations/20260924000000_agentic_chat_reap_stranded_queued_turns.sql
\ir ../../migrations/20260924000100_agentic_chat_turn_leases.sql

SET client_min_messages = warning;

ALTER TABLE public.users
	ADD CONSTRAINT users_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id);
ALTER TABLE public.onto_actors
	ADD CONSTRAINT onto_actors_user_id_fkey
	FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;
ALTER TABLE public.onto_project_members
	ADD CONSTRAINT onto_project_members_project_id_fkey
	FOREIGN KEY (project_id) REFERENCES public.onto_projects(id) ON DELETE CASCADE,
	ADD CONSTRAINT onto_project_members_actor_id_fkey
	FOREIGN KEY (actor_id) REFERENCES public.onto_actors(id) ON DELETE CASCADE;
ALTER TABLE public.onto_assets
	ADD CONSTRAINT onto_assets_project_id_fkey
	FOREIGN KEY (project_id) REFERENCES public.onto_projects(id) ON DELETE CASCADE;

CREATE SCHEMA IF NOT EXISTS storage;
CREATE TABLE storage.objects (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	bucket_id text NOT NULL,
	name text NOT NULL,
	owner_id text
);

-- Ontology stubs reached by delete_onto_project() and its calendar trigger.
CREATE TABLE public.onto_goals (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), project_id uuid);
CREATE TABLE public.onto_requirements (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), project_id uuid);
CREATE TABLE public.onto_plans (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), project_id uuid);
CREATE TABLE public.onto_tasks (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), project_id uuid);
CREATE TABLE public.onto_documents (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	project_id uuid REFERENCES public.onto_projects(id) ON DELETE CASCADE,
	title text
);
CREATE TABLE public.onto_sources (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), project_id uuid);
CREATE TABLE public.onto_risks (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), project_id uuid);
CREATE TABLE public.onto_milestones (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), project_id uuid);
CREATE TABLE public.onto_metrics (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), project_id uuid);
CREATE TABLE public.onto_signals (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), project_id uuid);
CREATE TABLE public.onto_insights (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), project_id uuid);
CREATE TABLE public.onto_events (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	project_id uuid,
	created_by uuid,
	props jsonb NOT NULL DEFAULT '{}'::jsonb,
	sync_status text,
	sync_error text,
	deleted_at timestamptz,
	updated_at timestamptz
);
CREATE TABLE public.onto_event_sync (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	event_id uuid,
	user_id uuid,
	provider text,
	external_event_id text,
	external_calendar_id text,
	calendar_source_id uuid,
	project_calendar_id uuid,
	sync_status text,
	sync_error text
);
CREATE TABLE public.project_calendars (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	project_id uuid,
	user_id uuid,
	calendar_id text,
	calendar_source_id uuid
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
CREATE TABLE public.onto_metric_points (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), metric_id uuid);
CREATE TABLE public.onto_document_versions (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), document_id uuid);
CREATE TABLE public.onto_edges (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), src_id uuid, dst_id uuid);
CREATE TABLE public.onto_assignments (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), object_id uuid, object_kind text);
CREATE TABLE public.onto_permissions (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), object_id uuid, object_kind text);
CREATE TABLE public.legacy_entity_mappings (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), onto_id uuid, onto_table text);

\ir ../../migrations/20260909034006_project_calendar_delete_cleanup.sql

CREATE TABLE public.onto_project_invites (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	project_id uuid REFERENCES public.onto_projects(id) ON DELETE CASCADE,
	invitee_email text
);

CREATE TABLE public.onto_project_logs (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	project_id uuid NOT NULL REFERENCES public.onto_projects(id) ON DELETE CASCADE,
	entity_type text NOT NULL,
	entity_id uuid NOT NULL,
	action text NOT NULL,
	before_data jsonb,
	after_data jsonb,
	changed_by uuid NOT NULL REFERENCES auth.users(id),
	changed_by_actor_id uuid REFERENCES public.onto_actors(id),
	chat_session_id uuid REFERENCES public.chat_sessions(id),
	created_at timestamptz NOT NULL DEFAULT now()
);

-- Public pages: table, updated_at and slug-history triggers as released, then the
-- released slug helpers (20260428000004, 20260430000001).
CREATE TABLE public.onto_public_pages (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	project_id uuid NOT NULL REFERENCES public.onto_projects(id) ON DELETE CASCADE,
	document_id uuid NOT NULL REFERENCES public.onto_documents(id) ON DELETE CASCADE,
	slug text NOT NULL,
	title text NOT NULL,
	status text NOT NULL DEFAULT 'draft'
		CHECK (status IN ('draft', 'published', 'unpublished', 'archived')),
	visibility text NOT NULL DEFAULT 'public' CHECK (visibility IN ('public', 'unlisted')),
	public_status text NOT NULL DEFAULT 'not_public'
		CHECK (public_status IN ('not_public', 'pending_confirmation', 'live', 'unpublished', 'archived')),
	created_by uuid NOT NULL REFERENCES public.onto_actors(id),
	updated_by uuid NOT NULL REFERENCES public.onto_actors(id),
	published_by uuid REFERENCES public.onto_actors(id),
	published_at timestamptz,
	last_unpublished_at timestamptz,
	deleted_at timestamptz,
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now(),
	CONSTRAINT onto_public_pages_slug_format CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$')
);
CREATE UNIQUE INDEX idx_onto_public_pages_slug_active
	ON public.onto_public_pages (lower(slug))
	WHERE deleted_at IS NULL;
CREATE TABLE public.onto_public_page_slug_history (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	public_page_id uuid NOT NULL REFERENCES public.onto_public_pages(id) ON DELETE CASCADE,
	project_id uuid NOT NULL REFERENCES public.onto_projects(id) ON DELETE CASCADE,
	old_slug text NOT NULL,
	new_slug text NOT NULL,
	changed_by uuid REFERENCES public.onto_actors(id),
	changed_at timestamptz NOT NULL DEFAULT now()
);
CREATE FUNCTION public.track_onto_public_page_slug_history()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
	IF TG_OP = 'UPDATE' AND NEW.slug IS DISTINCT FROM OLD.slug THEN
		INSERT INTO public.onto_public_page_slug_history (
			public_page_id, project_id, old_slug, new_slug, changed_by
		)
		VALUES (NEW.id, NEW.project_id, OLD.slug, NEW.slug, COALESCE(NEW.updated_by, OLD.updated_by));
	END IF;
	RETURN NEW;
END;
$$;
CREATE TRIGGER trg_onto_public_pages_updated_at
	BEFORE UPDATE ON public.onto_public_pages
	FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_onto_public_pages_slug_history
	AFTER UPDATE OF slug ON public.onto_public_pages
	FOR EACH ROW EXECUTE FUNCTION public.track_onto_public_page_slug_history();

\ir ../../migrations/20260428000004_add_public_page_slug_parts.sql
\ir ../../migrations/20260430000001_add_users_username.sql

-- Agent runs: cost entries RESTRICT run deletes (20260720010000).
CREATE TABLE public.agent_runs (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
	parent_run_id uuid REFERENCES public.agent_runs(id) ON DELETE SET NULL,
	project_id uuid REFERENCES public.onto_projects(id) ON DELETE SET NULL,
	goal text NOT NULL DEFAULT 'goal',
	status text NOT NULL DEFAULT 'completed'
);
CREATE TABLE public.agent_run_cost_entries (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	root_run_id uuid NOT NULL REFERENCES public.agent_runs(id) ON DELETE RESTRICT,
	leaf_run_id uuid NOT NULL REFERENCES public.agent_runs(id) ON DELETE RESTRICT,
	reserved_cost_usd numeric NOT NULL DEFAULT 0
);

-- Cycles: runs are NO ACTION to their cycle and identity-immutable
-- (20260825211343).
CREATE TABLE public.cycles (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
	project_id uuid REFERENCES public.onto_projects(id) ON DELETE CASCADE,
	kind text NOT NULL DEFAULT 'daily_brief',
	state text NOT NULL DEFAULT 'active',
	last_run_id uuid
);
CREATE TABLE public.cycle_runs (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	cycle_id uuid NOT NULL REFERENCES public.cycles(id),
	user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
	project_id uuid REFERENCES public.onto_projects(id) ON DELETE SET NULL,
	queue_job_record_id uuid REFERENCES public.queue_jobs(id) ON DELETE SET NULL,
	kind text NOT NULL DEFAULT 'daily_brief'
);
ALTER TABLE public.cycles
	ADD CONSTRAINT cycles_last_run_id_fkey
	FOREIGN KEY (last_run_id) REFERENCES public.cycle_runs(id) ON DELETE SET NULL;
CREATE FUNCTION public.prevent_cycle_run_identity_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
	IF ROW(NEW.cycle_id, NEW.user_id, NEW.project_id, NEW.kind)
		IS DISTINCT FROM ROW(OLD.cycle_id, OLD.user_id, OLD.project_id, OLD.kind) THEN
		RAISE EXCEPTION 'cycle_run_identity_is_immutable' USING ERRCODE = '23514';
	END IF;
	RETURN NEW;
END;
$$;
CREATE TRIGGER cycle_runs_identity_immutable
	BEFORE UPDATE ON public.cycle_runs
	FOR EACH ROW EXECUTE FUNCTION public.prevent_cycle_run_identity_mutation();

-- Columns that reference the person without being named user_id.
CREATE TABLE public.notification_subscriptions (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
	event_type text NOT NULL,
	is_active boolean DEFAULT true,
	created_by uuid REFERENCES public.users(id),
	updated_at timestamptz DEFAULT now()
);
CREATE TABLE public.email_relevance_adjudications (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
	reviewer_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
	decision text NOT NULL DEFAULT 'relevant'
);
CREATE FUNCTION public.reject_email_relevance_adjudication_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
	RAISE EXCEPTION 'email_relevance_adjudication_immutable';
END;
$$;
CREATE TRIGGER email_relevance_adjudications_immutable
	BEFORE UPDATE ON public.email_relevance_adjudications
	FOR EACH ROW EXECUTE FUNCTION public.reject_email_relevance_adjudication_mutation();
CREATE TABLE public.admin_users (
	user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
	granted_by uuid REFERENCES auth.users(id)
);
CREATE TABLE public.beta_events (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	event_title text NOT NULL DEFAULT 'event',
	created_by uuid REFERENCES auth.users(id)
);
CREATE TABLE public.beta_signups (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	email text NOT NULL,
	full_name text NOT NULL,
	why_interested text,
	invited_by uuid REFERENCES auth.users(id)
);
CREATE TABLE public.migration_platform_lock (
	id integer PRIMARY KEY,
	locked_by uuid REFERENCES auth.users(id)
);
CREATE TABLE public.question_tree_runs (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
	root_question text NOT NULL DEFAULT 'why?'
);
CREATE TABLE public.question_tree_nodes (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	run_id uuid NOT NULL REFERENCES public.question_tree_runs(id) ON DELETE CASCADE
);

-- Email log: system mail is logged with created_by = the recipient.
CREATE TABLE public.emails (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	created_by uuid NOT NULL REFERENCES auth.users(id),
	subject text NOT NULL,
	content text NOT NULL,
	category text
);
CREATE TABLE public.email_recipients (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	email_id uuid NOT NULL REFERENCES public.emails(id),
	recipient_email text NOT NULL,
	recipient_id uuid
);
CREATE TABLE public.email_tracking_events (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	email_id uuid NOT NULL REFERENCES public.emails(id),
	recipient_id uuid REFERENCES public.email_recipients(id),
	event_type text NOT NULL DEFAULT 'opened',
	ip_address inet
);
CREATE TABLE public.email_attachments (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	email_id uuid NOT NULL REFERENCES public.emails(id),
	created_by uuid NOT NULL REFERENCES auth.users(id),
	storage_bucket text NOT NULL DEFAULT 'email-attachments',
	storage_path text NOT NULL
);

-- Rows with no user_id.
CREATE TABLE public.projects (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	user_id uuid NOT NULL REFERENCES public.users(id),
	name text NOT NULL
);
CREATE TABLE public.projects_history (
	history_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	project_id uuid NOT NULL,
	created_by uuid,
	project_data jsonb NOT NULL
);
CREATE TABLE public.domain_research_queue (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	queue_key text NOT NULL UNIQUE,
	user_need text NOT NULL,
	summary text NOT NULL,
	evidence jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(evidence) = 'array'),
	source_session_ids uuid[] NOT NULL DEFAULT '{}',
	source_user_count integer NOT NULL DEFAULT 0 CHECK (source_user_count >= 0),
	updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.security_events (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	event_type text NOT NULL,
	actor_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
	target_type text,
	target_id text,
	ip_address inet,
	metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE TABLE public.notification_events (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	event_type text NOT NULL,
	actor_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
	target_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
	payload jsonb NOT NULL,
	metadata jsonb
);

-- Storage-bearing rows. voice_note_groups comes from the hosted extract; these
-- are its production keys (20260324000000_add_voice_note_groups.sql).
ALTER TABLE public.voice_note_groups
	ADD CONSTRAINT voice_note_groups_user_id_fkey
	FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE,
	ADD CONSTRAINT voice_note_groups_chat_session_id_fkey
	FOREIGN KEY (chat_session_id) REFERENCES public.chat_sessions(id) ON DELETE SET NULL;
CREATE TABLE public.voice_notes (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
	group_id uuid REFERENCES public.voice_note_groups(id) ON DELETE CASCADE,
	storage_bucket text NOT NULL DEFAULT 'voice_notes',
	storage_path text NOT NULL,
	deleted_at timestamptz
);
CREATE TABLE public.ontology_daily_briefs (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
	audio_storage_path text
);

-- Connector credentials.
CREATE TABLE public.external_agent_callers (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
	provider text NOT NULL DEFAULT 'claude',
	status text NOT NULL DEFAULT 'trusted' CHECK (status IN ('trusted', 'pending', 'revoked')),
	updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.agent_oauth_grants (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
	external_agent_caller_id uuid NOT NULL REFERENCES public.external_agent_callers(id) ON DELETE CASCADE,
	status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
	updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.agent_oauth_access_tokens (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	grant_id uuid NOT NULL REFERENCES public.agent_oauth_grants(id) ON DELETE CASCADE,
	user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
	expires_at timestamptz NOT NULL,
	revoked_at timestamptz,
	updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.agent_oauth_refresh_tokens (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	grant_id uuid NOT NULL REFERENCES public.agent_oauth_grants(id) ON DELETE CASCADE,
	user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
	expires_at timestamptz NOT NULL,
	used_at timestamptz,
	revoked_at timestamptz,
	updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.agent_oauth_authorization_codes (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	grant_id uuid NOT NULL REFERENCES public.agent_oauth_grants(id) ON DELETE CASCADE,
	user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
	expires_at timestamptz NOT NULL,
	used_at timestamptz,
	updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.agent_call_bootstrap_links (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
	external_agent_caller_id uuid NOT NULL REFERENCES public.external_agent_callers(id) ON DELETE CASCADE,
	expires_at timestamptz NOT NULL,
	updated_at timestamptz NOT NULL DEFAULT now()
);

-- Background processing switches.
CREATE TABLE public.user_brief_preferences (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
	is_active boolean DEFAULT true,
	updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.user_notification_preferences (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
	email_enabled boolean NOT NULL DEFAULT true,
	sms_enabled boolean NOT NULL DEFAULT true,
	push_enabled boolean NOT NULL DEFAULT true,
	in_app_enabled boolean NOT NULL DEFAULT true,
	should_email_daily_brief boolean NOT NULL DEFAULT true,
	should_sms_daily_brief boolean NOT NULL DEFAULT true,
	updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.user_sms_preferences (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	user_id uuid NOT NULL REFERENCES public.users(id),
	event_reminders_enabled boolean DEFAULT true,
	morning_kickoff_enabled boolean DEFAULT true,
	evening_recap_enabled boolean DEFAULT true,
	urgent_alerts boolean DEFAULT true,
	updated_at timestamptz
);
CREATE TABLE public.scheduled_sms_messages (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
	message_content text NOT NULL,
	status text NOT NULL DEFAULT 'scheduled',
	cancelled_at timestamptz,
	updated_at timestamptz
);
CREATE TABLE public.push_subscriptions (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
	endpoint text NOT NULL,
	is_active boolean DEFAULT true
);
CREATE TABLE public.email_sequence_enrollments (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
	status text NOT NULL DEFAULT 'active'
		CHECK (status IN ('active', 'processing', 'paused', 'completed', 'exited', 'errored', 'cancelled')),
	exit_reason text CHECK (exit_reason IS NULL OR exit_reason IN (
		'completed', 'activated', 'unsubscribed', 'suppressed', 'user_deleted', 'manual',
		'hard_bounce', 'pre_system_user', 'cancelled'
	)),
	next_send_at timestamptz,
	last_email_id uuid REFERENCES public.emails(id) ON DELETE SET NULL,
	updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.welcome_email_sequences (
	user_id uuid PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
	status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'cancelled')),
	updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.agent_operatives (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
	schedule_enabled boolean NOT NULL DEFAULT false,
	schedule_frequency text,
	schedule_time_of_day time,
	next_run_at timestamptz,
	updated_at timestamptz NOT NULL DEFAULT now(),
	CONSTRAINT agent_operatives_enabled_schedule_shape CHECK (
		schedule_enabled = false
		OR (schedule_frequency IS NOT NULL AND schedule_time_of_day IS NOT NULL)
	)
);

\ir ../../migrations/20260716000000_account_deletion_and_legal_acceptance.sql
