-- supabase/migrations/20261004213000_account_deletion_actor_tombstone.sql
-- Tasker 103: account deletion failed for every account in production.
--
-- finalize_account_deletion_database() keeps the person's actor row so work they
-- did in other people's projects keeps its history, and anonymizes it by setting
-- user_id to NULL. chk_actor_identity requires a human actor to have a user_id,
-- so that UPDATE failed for anyone with an actor (every account) and the whole
-- purge rolled back. It has been this way since 20260716000000; the contract
-- test ran on stub tables without the constraint, and there had been no
-- deletion requests.
--
-- A deleted person's actor is now a tombstone: kind 'human', no user_id,
-- account_deleted_at set. chk_actor_identity allows exactly that, and nothing
-- else new. finalize sets account_deleted_at; the rest of the function is the
-- 20260924190100 definition.
--
-- Proven on production's schema by supabase/tests/account_deletion_purge.check.sql
-- (a standing rehearsal check): the full pipeline runs for a person with a row
-- in every table the seeder can fill, and nothing pointing at them survives.

SET lock_timeout = '5s';

ALTER TABLE public.onto_actors
	ADD COLUMN IF NOT EXISTS account_deleted_at timestamptz;

COMMENT ON COLUMN public.onto_actors.account_deleted_at IS
	'Set when the person''s account was deleted. The row stays as an anonymized tombstone (no user_id, email or name) so shared-project history keeps an author.';

-- onto_actors is small (tens of rows); validating inline is cheap.
ALTER TABLE public.onto_actors
	DROP CONSTRAINT chk_actor_identity,
	ADD CONSTRAINT chk_actor_identity CHECK (
		(kind = 'human' AND user_id IS NOT NULL AND account_deleted_at IS NULL)
		OR (kind = 'human' AND user_id IS NULL AND account_deleted_at IS NOT NULL)
		OR (kind = 'agent' AND user_id IS NULL AND account_deleted_at IS NULL)
	);

-- A project-scoped operative must have a project (agent_operatives_project_context),
-- so ON DELETE SET NULL made every delete of a project with one fail, including
-- the account purge and the 30-day purge. It goes with its project instead.
-- The table is empty in production today.
ALTER TABLE public.agent_operatives
	DROP CONSTRAINT agent_operatives_project_id_fkey,
	ADD CONSTRAINT agent_operatives_project_id_fkey
		FOREIGN KEY (project_id) REFERENCES public.onto_projects(id) ON DELETE CASCADE;

-- ---------------------------------------------------------------------------
-- Purge: database
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.finalize_account_deletion_database(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
-- delete_onto_project() and older trigger functions use unqualified names, so an
-- empty search_path made the purge fail for anyone with a project.
SET search_path = pg_catalog, public
AS $$
DECLARE
	v_actor_ids uuid[] := ARRAY(
		SELECT actor.id
		FROM public.onto_actors AS actor
		WHERE actor.user_id = p_user_id
	);
	v_project_ids uuid[] := public.account_deletion_purged_project_ids(p_user_id);
	v_session_ids uuid[] := ARRAY(
		SELECT session.id
		FROM public.chat_sessions AS session
		WHERE session.user_id = p_user_id
	);
	v_session_texts text[];
	v_legacy_project_ids uuid[] := ARRAY(
		SELECT project.id
		FROM public.projects AS project
		WHERE project.user_id = p_user_id
	);
	v_cycle_ids uuid[];
	v_run_ids uuid[];
	v_email_ids uuid[];
	v_recipient_ids uuid[];
	v_user_email text;
	v_project_id uuid;
	v_page record;
	v_slug record;
	v_page_ids uuid[] := '{}'::uuid[];
	v_pending text[];
	v_blocked text[];
	v_table text;
	v_column_type text;
	v_last_error text;
	v_actor_reference record;
	v_deleted_user_rows integer := 0;
BEGIN
	IF p_user_id IS NULL THEN
		RAISE EXCEPTION 'User ID required';
	END IF;

	-- Lets the row guards release rows they protect from ordinary deletes.
	SET LOCAL buildos.account_purge = 'on';

	SELECT "user".email
	INTO v_user_email
	FROM public.users AS "user"
	WHERE "user".id = p_user_id;

	v_session_texts := ARRAY(SELECT id::text FROM unnest(v_session_ids) AS session(id));

	-- Event rows survive with the person's id set to NULL; their free-form
	-- metadata can name projects, titles or the person, so it goes first.
	UPDATE public.security_events
	SET metadata = jsonb_build_object('account_deleted', true)
	WHERE actor_user_id = p_user_id
		OR (target_type = 'user' AND target_id = p_user_id::text);

	UPDATE public.notification_events
	SET payload = jsonb_build_object('account_deleted', true),
		metadata = NULL
	WHERE actor_user_id = p_user_id OR target_user_id = p_user_id;

	-- cycle_runs.cycle_id is NO ACTION and cycles cascade from projects.
	v_cycle_ids := ARRAY(
		SELECT cycle.id
		FROM public.cycles AS cycle
		WHERE cycle.user_id = p_user_id OR cycle.project_id = ANY(v_project_ids)
	);
	DELETE FROM public.cycle_runs
	WHERE user_id = p_user_id
		OR cycle_id = ANY(v_cycle_ids)
		OR project_id = ANY(v_project_ids);
	DELETE FROM public.cycles WHERE id = ANY(v_cycle_ids);

	-- Cost entries RESTRICT agent_runs deletes and carry no user_id of their own.
	v_run_ids := ARRAY(
		SELECT run.id
		FROM public.agent_runs AS run
		WHERE run.user_id = p_user_id
	);
	DELETE FROM public.agent_run_cost_entries
	WHERE root_run_id = ANY(v_run_ids) OR leaf_run_id = ANY(v_run_ids);
	DELETE FROM public.agent_runs WHERE id = ANY(v_run_ids);

	-- Shared-project activity the person caused. changed_by is NOT NULL and
	-- references auth.users, so these rows are deleted rather than reassigned.
	DELETE FROM public.onto_project_logs WHERE changed_by = p_user_id;
	UPDATE public.onto_project_logs
	SET chat_session_id = NULL
	WHERE chat_session_id = ANY(v_session_ids);

	-- stream_state and signals RESTRICT turn deletes; the rest are explicit so
	-- the order never depends on catalog order.
	DELETE FROM public.chat_turn_stream_state WHERE user_id = p_user_id;
	DELETE FROM public.chat_turn_signals WHERE user_id = p_user_id;
	DELETE FROM public.chat_turn_events WHERE user_id = p_user_id;
	DELETE FROM public.chat_turn_effects WHERE user_id = p_user_id;
	DELETE FROM public.chat_turn_input_artifacts WHERE user_id = p_user_id;
	DELETE FROM public.chat_turn_runs WHERE user_id = p_user_id;
	DELETE FROM public.chat_sessions WHERE id = ANY(v_session_ids);

	FOREACH v_project_id IN ARRAY v_project_ids LOOP
		PERFORM public.delete_onto_project(v_project_id);
	END LOOP;

	DELETE FROM public.onto_project_members
	WHERE actor_id = ANY(v_actor_ids);

	-- The actor row survives as a tombstone, so nothing cascades from it. Apply
	-- each reference's declared delete rule as if it had been deleted: CASCADE
	-- rows (assignments, task assignees, read states) go, SET NULL columns
	-- (contact links, profile audit) clear, and RESTRICT / NO ACTION columns
	-- (created_by, applied_by: authorship of surviving shared work) keep
	-- pointing at the tombstone. A new table follows its own foreign key.
	FOR v_actor_reference IN
		SELECT con.conrelid::regclass AS relation, attribute.attname AS column_name, con.confdeltype
		FROM pg_catalog.pg_constraint AS con
		JOIN pg_catalog.pg_attribute AS attribute
			ON attribute.attrelid = con.conrelid AND attribute.attnum = con.conkey[1]
		WHERE con.contype = 'f'
			AND con.confrelid = 'public.onto_actors'::regclass
			AND cardinality(con.conkey) = 1
			AND con.confdeltype IN ('c', 'n')
		ORDER BY con.conrelid::regclass::text, attribute.attname
	LOOP
		IF v_actor_reference.confdeltype = 'c' THEN
			EXECUTE format('DELETE FROM %s WHERE %I = ANY($1)', v_actor_reference.relation, v_actor_reference.column_name)
			USING v_actor_ids;
		ELSE
			EXECUTE format('UPDATE %s SET %2$I = NULL WHERE %2$I = ANY($1)', v_actor_reference.relation, v_actor_reference.column_name)
			USING v_actor_ids;
		END IF;
	END LOOP;

	IF v_user_email IS NOT NULL THEN
		DELETE FROM public.onto_project_invites
		WHERE lower(invitee_email) = lower(v_user_email);
	END IF;

	-- Preserve shared-project history without preserving the former member's identity.
	UPDATE public.onto_actors
	SET user_id = NULL,
		email = NULL,
		name = 'Deleted user',
		metadata = jsonb_build_object('account_deleted', true),
		account_deleted_at = now()
	WHERE id = ANY(v_actor_ids);

	-- Pages that survive in co-owned projects carry a URL prefix derived from the
	-- person's username or name. Re-derive it from the anonymized actor and drop
	-- the redirect history that still holds the old URLs.
	FOR v_page IN
		SELECT page.id, page.created_by, COALESCE(page.slug_base, page.slug) AS slug_base
		FROM public.onto_public_pages AS page
		WHERE page.created_by = ANY(v_actor_ids)
		ORDER BY page.id
	LOOP
		SELECT suggestion.slug_prefix, suggestion.slug_base, suggestion.slug
		INTO v_slug
		FROM public.suggest_onto_public_page_slug(
			public.resolve_onto_public_page_slug_prefix(v_page.created_by),
			v_page.slug_base,
			v_page.id
		) AS suggestion;

		UPDATE public.onto_public_pages
		SET slug_prefix = v_slug.slug_prefix,
			slug_base = v_slug.slug_base,
			slug = v_slug.slug
		WHERE id = v_page.id;

		v_page_ids := array_append(v_page_ids, v_page.id);
	END LOOP;

	DELETE FROM public.onto_public_page_slug_history
	WHERE public_page_id = ANY(v_page_ids);

	-- References to the person in columns not named user_id.
	UPDATE public.notification_subscriptions
	SET created_by = NULL
	WHERE created_by = p_user_id;
	-- Review labels are immutable and reviewer_user_id is NOT NULL.
	DELETE FROM public.email_relevance_adjudications
	WHERE reviewer_user_id = p_user_id;
	UPDATE public.admin_users SET granted_by = NULL WHERE granted_by = p_user_id;
	UPDATE public.beta_events SET created_by = NULL WHERE created_by = p_user_id;
	UPDATE public.beta_signups SET invited_by = NULL WHERE invited_by = p_user_id;
	UPDATE public.migration_platform_lock SET locked_by = NULL WHERE locked_by = p_user_id;
	DELETE FROM public.question_tree_runs WHERE created_by = p_user_id;

	-- Legacy project history and research demand signals have no user_id.
	DELETE FROM public.projects_history
	WHERE project_id = ANY(v_legacy_project_ids) OR created_by = p_user_id;

	DELETE FROM public.domain_research_queue AS queue
	WHERE (
			queue.source_session_ids && v_session_ids
			OR queue.evidence @> jsonb_build_array(jsonb_build_object('user_id', p_user_id::text))
		)
		AND queue.source_session_ids <@ v_session_ids
		AND NOT EXISTS (
			SELECT 1
			FROM jsonb_array_elements(queue.evidence) AS item
			WHERE item->>'user_id' IS DISTINCT FROM p_user_id::text
				AND NOT (COALESCE(item->>'session_id', '') = ANY(v_session_texts))
		);

	UPDATE public.domain_research_queue AS queue
	SET evidence = COALESCE(
			(
				SELECT jsonb_agg(item)
				FROM jsonb_array_elements(queue.evidence) AS item
				WHERE item->>'user_id' IS DISTINCT FROM p_user_id::text
					AND NOT (COALESCE(item->>'session_id', '') = ANY(v_session_texts))
			),
			'[]'::jsonb
		),
		source_session_ids = ARRAY(
			SELECT source.id
			FROM unnest(queue.source_session_ids) AS source(id)
			WHERE NOT (source.id = ANY(v_session_ids))
		),
		source_user_count = GREATEST(queue.source_user_count - 1, 0),
		updated_at = now()
	WHERE queue.source_session_ids && v_session_ids
		OR queue.evidence @> jsonb_build_array(jsonb_build_object('user_id', p_user_id::text));

	-- Every user-scoped public row. A table blocked by a foreign key into a
	-- table not yet swept is retried after the others; the sweep fails only
	-- when a full pass makes no progress.
	v_pending := ARRAY(
		SELECT class.relname::text
		FROM pg_class AS class
		JOIN pg_namespace AS namespace ON namespace.oid = class.relnamespace
		JOIN pg_attribute AS attribute ON attribute.attrelid = class.oid
		WHERE namespace.nspname = 'public'
			AND class.relkind IN ('r', 'p')
			AND NOT class.relispartition
			AND attribute.attname = 'user_id'
			AND attribute.attnum > 0
			AND NOT attribute.attisdropped
			AND class.relname NOT IN (
				'account_deletion_requests',
				'legal_acceptances',
				'legal_acceptance_intents',
				'onto_actors'
			)
		ORDER BY class.relname
	);

	LOOP
		v_blocked := '{}'::text[];
		FOREACH v_table IN ARRAY v_pending LOOP
			SELECT format_type(attribute.atttypid, attribute.atttypmod)
			INTO v_column_type
			FROM pg_attribute AS attribute
			WHERE attribute.attrelid = format('public.%I', v_table)::regclass
				AND attribute.attname = 'user_id';

			BEGIN
				IF v_column_type = 'uuid' THEN
					EXECUTE format('DELETE FROM public.%I WHERE user_id = $1', v_table)
					USING p_user_id;
				ELSE
					EXECUTE format('DELETE FROM public.%I WHERE user_id::text = $1', v_table)
					USING p_user_id::text;
				END IF;
			EXCEPTION WHEN foreign_key_violation THEN
				v_blocked := array_append(v_blocked, v_table);
				v_last_error := v_table || ': ' || SQLERRM;
			END;
		END LOOP;

		EXIT WHEN cardinality(v_blocked) = 0;
		IF cardinality(v_blocked) = cardinality(v_pending) THEN
			RAISE EXCEPTION 'account_deletion_sweep_blocked: %', v_last_error
				USING ERRCODE = 'foreign_key_violation';
		END IF;
		v_pending := v_blocked;
	END LOOP;

	-- Emails. System brief/notification emails are logged with created_by set to
	-- the recipient, so created_by = the person covers their own mail (and, for
	-- an admin, campaigns they wrote). Other admins' campaigns keep their row and
	-- lose only this person's recipient and tracking rows.
	v_email_ids := ARRAY(
		SELECT email.id
		FROM public.emails AS email
		WHERE email.created_by = p_user_id
	);
	v_recipient_ids := ARRAY(
		SELECT recipient.id
		FROM public.email_recipients AS recipient
		WHERE recipient.email_id = ANY(v_email_ids)
			OR recipient.recipient_id = p_user_id
			OR (v_user_email IS NOT NULL AND lower(recipient.recipient_email) = lower(v_user_email))
	);
	DELETE FROM public.email_tracking_events
	WHERE email_id = ANY(v_email_ids) OR recipient_id = ANY(v_recipient_ids);
	DELETE FROM public.email_recipients WHERE id = ANY(v_recipient_ids);
	DELETE FROM public.email_attachments
	WHERE email_id = ANY(v_email_ids) OR created_by = p_user_id;
	DELETE FROM public.emails WHERE id = ANY(v_email_ids);

	IF v_user_email IS NOT NULL THEN
		DELETE FROM public.beta_signups WHERE lower(email) = lower(v_user_email);
	END IF;

	DELETE FROM public.users WHERE id = p_user_id;
	GET DIAGNOSTICS v_deleted_user_rows = ROW_COUNT;

	SET LOCAL buildos.account_purge = 'off';

	RETURN jsonb_build_object(
		'user_id', p_user_id,
		'public_user_deleted', v_deleted_user_rows > 0,
		'actors_anonymized', COALESCE(array_length(v_actor_ids, 1), 0),
		'projects_deleted', COALESCE(array_length(v_project_ids, 1), 0),
		'public_pages_reprefixed', COALESCE(array_length(v_page_ids, 1), 0)
	);
END;
$$;

REVOKE ALL ON FUNCTION public.finalize_account_deletion_database(uuid)
	FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_account_deletion_database(uuid)
	TO service_role;

RESET lock_timeout;
