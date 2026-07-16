-- Durable clickwrap evidence and an enforceable 30-day account-deletion lifecycle.

ALTER TABLE public.users
	ADD COLUMN IF NOT EXISTS deletion_status text,
	ADD COLUMN IF NOT EXISTS deletion_requested_at timestamptz,
	ADD COLUMN IF NOT EXISTS deletion_scheduled_for timestamptz;

DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1
		FROM pg_constraint
		WHERE conname = 'users_deletion_status_check'
	) THEN
		ALTER TABLE public.users
			ADD CONSTRAINT users_deletion_status_check
			CHECK (deletion_status IS NULL OR deletion_status IN ('pending', 'processing'));
	END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.legal_acceptance_intents (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	token_hash text NOT NULL UNIQUE,
	terms_version text NOT NULL,
	privacy_version text NOT NULL,
	intended_surface text NOT NULL
		CHECK (intended_surface IN ('email_signup', 'google_signup')),
	accepted_at timestamptz NOT NULL DEFAULT now(),
	expires_at timestamptz NOT NULL DEFAULT (now() + interval '15 minutes'),
	used_at timestamptz,
	used_by_user_id uuid,
	client_ip inet,
	user_agent text,
	created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS legal_acceptance_intents_expires_idx
	ON public.legal_acceptance_intents (expires_at)
	WHERE used_at IS NULL;

CREATE TABLE IF NOT EXISTS public.legal_acceptances (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	-- Deliberately not an FK: this limited compliance record survives account deletion.
	user_id uuid NOT NULL,
	intent_id uuid NOT NULL UNIQUE REFERENCES public.legal_acceptance_intents(id) ON DELETE RESTRICT,
	terms_version text NOT NULL,
	privacy_version text NOT NULL,
	acceptance_surface text NOT NULL
		CHECK (acceptance_surface IN ('email_signup', 'google_signup')),
	accepted_at timestamptz NOT NULL,
	client_ip inet,
	user_agent text,
	created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS legal_acceptances_user_idx
	ON public.legal_acceptances (user_id, accepted_at DESC);

ALTER TABLE public.legal_acceptance_intents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.legal_acceptances ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.legal_acceptance_intents FROM anon, authenticated;
REVOKE ALL ON TABLE public.legal_acceptances FROM anon, authenticated;
GRANT ALL ON TABLE public.legal_acceptance_intents TO service_role;
GRANT ALL ON TABLE public.legal_acceptances TO service_role;

CREATE OR REPLACE FUNCTION public.consume_legal_acceptance_intent(
	p_token_hash text,
	p_user_id uuid,
	p_surface text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
	v_intent public.legal_acceptance_intents%ROWTYPE;
BEGIN
	SELECT *
	INTO v_intent
	FROM public.legal_acceptance_intents
	WHERE token_hash = p_token_hash
		AND intended_surface = p_surface
		AND used_at IS NULL
		AND expires_at > now()
	FOR UPDATE;

	IF NOT FOUND THEN
		RETURN false;
	END IF;

	UPDATE public.legal_acceptance_intents
	SET used_at = now(),
		used_by_user_id = p_user_id
	WHERE id = v_intent.id;

	INSERT INTO public.legal_acceptances (
		user_id,
		intent_id,
		terms_version,
		privacy_version,
		acceptance_surface,
		accepted_at,
		client_ip,
		user_agent
	)
	VALUES (
		p_user_id,
		v_intent.id,
		v_intent.terms_version,
		v_intent.privacy_version,
		p_surface,
		v_intent.accepted_at,
		v_intent.client_ip,
		v_intent.user_agent
	);

	RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.consume_legal_acceptance_intent(text, uuid, text)
	FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_legal_acceptance_intent(text, uuid, text)
	TO service_role;

CREATE TABLE IF NOT EXISTS public.account_deletion_requests (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	-- Deliberately not an FK: the lifecycle/audit row must remain after the user is purged.
	user_id uuid NOT NULL UNIQUE,
	status text NOT NULL DEFAULT 'pending'
		CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
	requested_at timestamptz NOT NULL DEFAULT now(),
	-- A one-hour processing buffer lets the hourly purge finish no later than day 30.
	scheduled_for timestamptz NOT NULL DEFAULT (now() + interval '29 days 23 hours'),
	processing_started_at timestamptz,
	lease_expires_at timestamptz,
	completed_at timestamptz,
	attempt_count integer NOT NULL DEFAULT 0,
	next_attempt_at timestamptz,
	last_error text,
	billing_cancellation_status text NOT NULL DEFAULT 'pending'
		CHECK (billing_cancellation_status IN ('pending', 'completed', 'not_applicable')),
	billing_subscription_ids text[] NOT NULL DEFAULT '{}'::text[],
	billing_cancellation_error text,
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS account_deletion_requests_due_idx
	ON public.account_deletion_requests (scheduled_for, next_attempt_at)
	WHERE status IN ('pending', 'failed');

CREATE INDEX IF NOT EXISTS account_deletion_requests_billing_idx
	ON public.account_deletion_requests (billing_cancellation_status, requested_at)
	WHERE billing_cancellation_status = 'pending';

ALTER TABLE public.account_deletion_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.account_deletion_requests FROM anon, authenticated;
GRANT ALL ON TABLE public.account_deletion_requests TO service_role;

CREATE OR REPLACE FUNCTION public.request_account_deletion(p_user_id uuid)
RETURNS TABLE (
	request_id uuid,
	requested_at timestamptz,
	scheduled_for timestamptz,
	status text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
	v_request public.account_deletion_requests%ROWTYPE;
BEGIN
	IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = p_user_id) THEN
		RAISE EXCEPTION 'User not found';
	END IF;

	INSERT INTO public.account_deletion_requests (user_id)
	VALUES (p_user_id)
	ON CONFLICT (user_id) DO UPDATE
	SET updated_at = now()
	RETURNING * INTO v_request;

	UPDATE public.users
	SET deletion_status = CASE
			WHEN v_request.status = 'processing' THEN 'processing'
			ELSE 'pending'
		END,
		deletion_requested_at = v_request.requested_at,
		deletion_scheduled_for = v_request.scheduled_for,
		access_restricted = true,
		access_restricted_at = COALESCE(access_restricted_at, now()),
		updated_at = now()
	WHERE id = p_user_id;

	RETURN QUERY
	SELECT v_request.id, v_request.requested_at, v_request.scheduled_for, v_request.status;
END;
$$;

REVOKE ALL ON FUNCTION public.request_account_deletion(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.request_account_deletion(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.claim_due_account_deletions(
	p_limit integer DEFAULT 10,
	p_lease_minutes integer DEFAULT 15
)
RETURNS SETOF public.account_deletion_requests
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
	WITH due AS (
		SELECT request.id
		FROM public.account_deletion_requests AS request
		WHERE request.scheduled_for <= now()
			AND (
				request.status IN ('pending', 'failed')
				OR (
					request.status = 'processing'
					AND request.lease_expires_at < now()
				)
			)
			AND (request.next_attempt_at IS NULL OR request.next_attempt_at <= now())
		ORDER BY request.scheduled_for, request.requested_at
		FOR UPDATE SKIP LOCKED
		LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 10), 50))
	)
	UPDATE public.account_deletion_requests AS request
	SET status = 'processing',
		processing_started_at = now(),
		lease_expires_at = now() + make_interval(mins => GREATEST(5, LEAST(COALESCE(p_lease_minutes, 15), 60))),
		attempt_count = request.attempt_count + 1,
		last_error = NULL,
		updated_at = now()
	FROM due
	WHERE request.id = due.id
	RETURNING request.*;
$$;

REVOKE ALL ON FUNCTION public.claim_due_account_deletions(integer, integer)
	FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_due_account_deletions(integer, integer)
	TO service_role;

CREATE OR REPLACE FUNCTION public.list_account_deletion_storage_objects(p_user_id uuid)
RETURNS TABLE (bucket_id text, object_name text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
	WITH account_actors AS (
		SELECT actor.id
		FROM public.onto_actors AS actor
		WHERE actor.user_id = p_user_id
	),
	owned_projects AS (
		SELECT project.id
		FROM public.onto_projects AS project
		WHERE project.created_by IN (SELECT id FROM account_actors)
			AND NOT EXISTS (
				SELECT 1
				FROM public.onto_project_members AS other_owner
				WHERE other_owner.project_id = project.id
					AND other_owner.role_key = 'owner'
					AND other_owner.removed_at IS NULL
					AND other_owner.actor_id NOT IN (SELECT id FROM account_actors)
			)
	),
	known_objects AS (
		SELECT note.storage_bucket AS bucket_id, note.storage_path AS object_name
		FROM public.voice_notes AS note
		WHERE note.user_id = p_user_id

		UNION

		SELECT 'brief-audio'::text, brief.audio_storage_path
		FROM public.ontology_daily_briefs AS brief
		WHERE brief.user_id = p_user_id
			AND brief.audio_storage_path IS NOT NULL

		UNION

		SELECT asset.storage_bucket, asset.storage_path
		FROM public.onto_assets AS asset
		WHERE asset.project_id IN (SELECT id FROM owned_projects)

		UNION

		SELECT attachment.storage_bucket, attachment.storage_path
		FROM public.email_attachments AS attachment
		WHERE attachment.created_by::text = p_user_id::text
	)
	SELECT DISTINCT candidate.bucket_id, candidate.object_name
	FROM (
		SELECT known.bucket_id, known.object_name
		FROM known_objects AS known

		UNION

		SELECT object.bucket_id, object.name
		FROM storage.objects AS object
		WHERE object.owner_id::text = p_user_id::text
			OR object.name LIKE p_user_id::text || '/%'
			OR object.name LIKE 'users/' || p_user_id::text || '/%'
	) AS candidate
	WHERE candidate.bucket_id IS NOT NULL
		AND candidate.object_name IS NOT NULL
		AND candidate.object_name <> '';
$$;

REVOKE ALL ON FUNCTION public.list_account_deletion_storage_objects(uuid)
	FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_account_deletion_storage_objects(uuid)
	TO service_role;

CREATE OR REPLACE FUNCTION public.finalize_account_deletion_database(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
	v_actor_ids uuid[] := ARRAY(
		SELECT actor.id
		FROM public.onto_actors AS actor
		WHERE actor.user_id = p_user_id
	);
	v_project_id uuid;
	v_user_email text;
	v_deleted_user_rows integer := 0;
	v_table record;
BEGIN
	SELECT "user".email
	INTO v_user_email
	FROM public.users AS "user"
	WHERE "user".id = p_user_id;

	FOR v_project_id IN
		SELECT project.id
		FROM public.onto_projects AS project
		WHERE project.created_by = ANY(v_actor_ids)
			AND NOT EXISTS (
				SELECT 1
				FROM public.onto_project_members AS other_owner
				WHERE other_owner.project_id = project.id
					AND other_owner.role_key = 'owner'
					AND other_owner.removed_at IS NULL
					AND NOT (other_owner.actor_id = ANY(v_actor_ids))
			)
	LOOP
		PERFORM public.delete_onto_project(v_project_id);
	END LOOP;

	DELETE FROM public.onto_project_members
	WHERE actor_id = ANY(v_actor_ids);

	IF v_user_email IS NOT NULL THEN
		DELETE FROM public.onto_project_invites
		WHERE lower(invitee_email) = lower(v_user_email);
	END IF;

	-- Preserve shared-project history without preserving the former member's identity.
	UPDATE public.onto_actors
	SET user_id = NULL,
		email = NULL,
		name = 'Deleted user',
		metadata = jsonb_build_object('account_deleted', true)
	WHERE id = ANY(v_actor_ids);

	-- Delete every user-scoped public row, including older tables whose original
	-- migrations did not declare a cascading FK. Shared actor rows are excluded above.
	FOR v_table IN
		SELECT column_info.table_name
		FROM information_schema.columns AS column_info
		JOIN information_schema.tables AS table_info
			ON table_info.table_schema = column_info.table_schema
			AND table_info.table_name = column_info.table_name
		WHERE column_info.table_schema = 'public'
			AND column_info.column_name = 'user_id'
			AND table_info.table_type = 'BASE TABLE'
			AND column_info.table_name NOT IN (
				'account_deletion_requests',
				'legal_acceptances',
				'legal_acceptance_intents',
				'onto_actors'
			)
	LOOP
		EXECUTE format(
			'DELETE FROM public.%I WHERE user_id::text = $1',
			v_table.table_name
		)
		USING p_user_id::text;
	END LOOP;

	DELETE FROM public.users WHERE id = p_user_id;
	GET DIAGNOSTICS v_deleted_user_rows = ROW_COUNT;

	RETURN jsonb_build_object(
		'user_id', p_user_id,
		'public_user_deleted', v_deleted_user_rows > 0,
		'actors_anonymized', COALESCE(array_length(v_actor_ids, 1), 0)
	);
END;
$$;

REVOKE ALL ON FUNCTION public.finalize_account_deletion_database(uuid)
	FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_account_deletion_database(uuid)
	TO service_role;

COMMENT ON TABLE public.legal_acceptances IS
	'Append-only proof of the policy versions and server timestamp accepted at signup.';
COMMENT ON TABLE public.account_deletion_requests IS
	'Durable 30-day account deletion schedule. The opaque lifecycle row remains after data purge.';
