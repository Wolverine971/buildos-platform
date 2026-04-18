-- supabase/migrations/20260501000004_add_email_sequence_queue_phase2.sql
--
-- Phase 2 of the BuildOS welcome email sequence system.
--
-- Adds the generic lifecycle sequence queue tables and database RPCs while the
-- legacy welcome_email_sequences table remains the production processing path.
-- Application code dual-writes into these tables as a shadow queue until Phase 3
-- switches cron processing to claim_pending_email_sequence_sends().

BEGIN;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.email_sequences (
	id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	key TEXT NOT NULL UNIQUE,
	display_name TEXT NOT NULL,
	description TEXT,
	trigger_type TEXT NOT NULL,
	status TEXT NOT NULL DEFAULT 'draft'
		CHECK (status IN ('draft', 'active', 'paused', 'archived')),
	metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.email_sequence_steps (
	id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	sequence_id UUID NOT NULL REFERENCES public.email_sequences(id) ON DELETE CASCADE,
	step_number INT NOT NULL CHECK (step_number > 0),
	step_key TEXT NOT NULL,
	delay_days_after_previous INT NOT NULL DEFAULT 0 CHECK (delay_days_after_previous >= 0),
	absolute_day_offset INT NOT NULL DEFAULT 0 CHECK (absolute_day_offset >= 0),
	send_window_start_hour INT NOT NULL DEFAULT 9 CHECK (send_window_start_hour BETWEEN 0 AND 23),
	send_window_end_hour INT NOT NULL DEFAULT 17 CHECK (send_window_end_hour BETWEEN 1 AND 24),
	send_on_weekends BOOLEAN NOT NULL DEFAULT FALSE,
	status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused')),
	metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	CONSTRAINT email_sequence_steps_window_order
		CHECK (send_window_start_hour < send_window_end_hour),
	CONSTRAINT email_sequence_steps_unique_number
		UNIQUE (sequence_id, step_number),
	CONSTRAINT email_sequence_steps_unique_key
	UNIQUE (sequence_id, step_key)
);

ALTER TABLE public.email_sequence_steps
	DROP COLUMN IF EXISTS subject,
	DROP COLUMN IF EXISTS html_content,
	DROP COLUMN IF EXISTS plain_text;

CREATE TABLE IF NOT EXISTS public.email_sequence_enrollments (
	id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	sequence_id UUID NOT NULL REFERENCES public.email_sequences(id) ON DELETE CASCADE,
	user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
	recipient_email TEXT NOT NULL,
	status TEXT NOT NULL DEFAULT 'active'
		CHECK (status IN (
			'active',
			'processing',
			'paused',
			'completed',
			'exited',
			'errored',
			'cancelled'
		)),
	current_step_number INT NOT NULL DEFAULT 0 CHECK (current_step_number >= 0),
	next_step_number INT,
	next_send_at TIMESTAMPTZ,
	last_sent_at TIMESTAMPTZ,
	last_email_id UUID REFERENCES public.emails(id) ON DELETE SET NULL,
	processing_started_at TIMESTAMPTZ,
	failure_count INT NOT NULL DEFAULT 0 CHECK (failure_count >= 0),
	exit_reason TEXT CHECK (
		exit_reason IS NULL OR
		exit_reason IN (
			'completed',
			'activated',
			'unsubscribed',
			'suppressed',
			'user_deleted',
			'manual',
			'hard_bounce',
			'pre_system_user',
			'cancelled'
		)
	),
	last_error TEXT,
	metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	CONSTRAINT email_sequence_enrollments_unique_user
		UNIQUE (sequence_id, user_id),
	CONSTRAINT email_sequence_enrollments_next_step_positive
		CHECK (next_step_number IS NULL OR next_step_number > 0)
);

CREATE TABLE IF NOT EXISTS public.email_sequence_events (
	id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	enrollment_id UUID REFERENCES public.email_sequence_enrollments(id) ON DELETE CASCADE,
	sequence_id UUID NOT NULL REFERENCES public.email_sequences(id) ON DELETE CASCADE,
	user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
	step_number INT,
	step_key TEXT,
	event_type TEXT NOT NULL CHECK (event_type IN (
		'enrolled',
		'claimed',
		'sent',
		'skipped',
		'deferred',
		'failed',
		'retried',
		'exited',
		'completed',
		'suppressed'
	)),
	branch_key TEXT,
	reason TEXT,
	email_id UUID REFERENCES public.emails(id) ON DELETE SET NULL,
	metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_email_sequences_key_status
	ON public.email_sequences(key, status);

CREATE INDEX IF NOT EXISTS idx_email_sequence_steps_sequence_number
	ON public.email_sequence_steps(sequence_id, step_number);

CREATE INDEX IF NOT EXISTS idx_email_sequence_enrollments_due
	ON public.email_sequence_enrollments(next_send_at)
	WHERE status = 'active' AND next_send_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_email_sequence_enrollments_sequence_status
	ON public.email_sequence_enrollments(sequence_id, status);

CREATE INDEX IF NOT EXISTS idx_email_sequence_enrollments_user
	ON public.email_sequence_enrollments(user_id);

CREATE INDEX IF NOT EXISTS idx_email_sequence_enrollments_processing
	ON public.email_sequence_enrollments(processing_started_at)
	WHERE status = 'processing';

CREATE INDEX IF NOT EXISTS idx_email_sequence_events_enrollment
	ON public.email_sequence_events(enrollment_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_email_sequence_events_sequence_step
	ON public.email_sequence_events(sequence_id, step_number, event_type);

CREATE INDEX IF NOT EXISTS idx_email_sequence_events_user
	ON public.email_sequence_events(user_id, created_at DESC);

DROP TRIGGER IF EXISTS trg_email_sequences_updated_at
	ON public.email_sequences;

CREATE TRIGGER trg_email_sequences_updated_at
	BEFORE UPDATE ON public.email_sequences
	FOR EACH ROW
	EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_email_sequence_steps_updated_at
	ON public.email_sequence_steps;

CREATE TRIGGER trg_email_sequence_steps_updated_at
	BEFORE UPDATE ON public.email_sequence_steps
	FOR EACH ROW
	EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_email_sequence_enrollments_updated_at
	ON public.email_sequence_enrollments;

CREATE TRIGGER trg_email_sequence_enrollments_updated_at
	BEFORE UPDATE ON public.email_sequence_enrollments
	FOR EACH ROW
	EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.email_sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_sequence_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_sequence_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_sequence_events ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.email_sequences IS
	'Named lifecycle email sequence containers. Phase 2 shadow queue for BuildOS welcome.';

COMMENT ON TABLE public.email_sequence_steps IS
	'Ordered lifecycle sequence schedule metadata. Email copy and HTML are source-controlled in app code, not stored in Supabase.';

COMMENT ON TABLE public.email_sequence_enrollments IS
	'Domain queue for lifecycle sequence sends. One row per user per sequence.';

COMMENT ON TABLE public.email_sequence_events IS
	'Audit log for lifecycle sequence branch, skip, exit, and delivery decisions.';

-- ---------------------------------------------------------------------------
-- Seed BuildOS welcome sequence + steps
-- ---------------------------------------------------------------------------

DO $$
DECLARE
	v_sequence_id UUID;
BEGIN
	INSERT INTO public.email_sequences (
		key,
		display_name,
		description,
		trigger_type,
		status,
		metadata
	)
	VALUES (
		'buildos_welcome',
		'BuildOS Welcome Sequence',
		'New-signup activation sequence for BuildOS.',
		'user_registration',
		'active',
		jsonb_build_object(
			'sequence_version', '2026-03-16',
			'welcome_system_deploy_at', NOW()
		)
	)
	ON CONFLICT (key) DO UPDATE
	SET display_name = EXCLUDED.display_name,
		description = EXCLUDED.description,
		trigger_type = EXCLUDED.trigger_type,
		status = EXCLUDED.status,
		metadata = CASE
			WHEN public.email_sequences.metadata ? 'welcome_system_deploy_at'
				THEN public.email_sequences.metadata
					|| jsonb_build_object('sequence_version', '2026-03-16')
			ELSE public.email_sequences.metadata || EXCLUDED.metadata
		END,
		updated_at = NOW()
	RETURNING id INTO v_sequence_id;

	INSERT INTO public.email_sequence_steps (
		sequence_id,
		step_number,
		step_key,
		delay_days_after_previous,
		absolute_day_offset,
		send_window_start_hour,
		send_window_end_hour,
		send_on_weekends,
		status,
		metadata
	)
	VALUES
		(
			v_sequence_id,
			1,
			'email_1',
			0,
			0,
			9,
			17,
			FALSE,
			'active',
			jsonb_build_object('local_copy_ref', 'welcome-sequence.logic.ts#email_1')
		),
		(
			v_sequence_id,
			2,
			'email_2',
			1,
			1,
			9,
			17,
			FALSE,
			'active',
			jsonb_build_object('local_copy_ref', 'welcome-sequence.logic.ts#email_2')
		),
		(
			v_sequence_id,
			3,
			'email_3',
			2,
			3,
			9,
			17,
			FALSE,
			'active',
			jsonb_build_object('local_copy_ref', 'welcome-sequence.logic.ts#email_3')
		),
		(
			v_sequence_id,
			4,
			'email_4',
			3,
			6,
			9,
			17,
			FALSE,
			'active',
			jsonb_build_object('local_copy_ref', 'welcome-sequence.logic.ts#email_4')
		),
		(
			v_sequence_id,
			5,
			'email_5',
			3,
			9,
			9,
			17,
			FALSE,
			'active',
			jsonb_build_object('local_copy_ref', 'welcome-sequence.logic.ts#email_5')
		)
	ON CONFLICT (sequence_id, step_number) DO UPDATE
	SET step_key = EXCLUDED.step_key,
		delay_days_after_previous = EXCLUDED.delay_days_after_previous,
		absolute_day_offset = EXCLUDED.absolute_day_offset,
		send_window_start_hour = EXCLUDED.send_window_start_hour,
		send_window_end_hour = EXCLUDED.send_window_end_hour,
		send_on_weekends = EXCLUDED.send_on_weekends,
		status = EXCLUDED.status,
		metadata = EXCLUDED.metadata,
		updated_at = NOW();
END $$;

-- ---------------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.enroll_user_in_email_sequence(
	p_user_id UUID,
	p_sequence_key TEXT,
	p_recipient_email TEXT,
	p_signup_method TEXT DEFAULT 'unknown',
	p_trigger_source TEXT DEFAULT 'account_created',
	p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS public.email_sequence_enrollments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
	v_sequence public.email_sequences%ROWTYPE;
	v_existing public.email_sequence_enrollments%ROWTYPE;
	v_enrollment public.email_sequence_enrollments%ROWTYPE;
	v_user_created_at TIMESTAMPTZ;
	v_deploy_at TIMESTAMPTZ;
	v_normalized_email TEXT;
BEGIN
	IF p_user_id IS NULL THEN
		RAISE EXCEPTION 'p_user_id must not be null';
	END IF;

	v_normalized_email := lower(trim(COALESCE(p_recipient_email, '')));
	IF length(v_normalized_email) = 0 THEN
		RAISE EXCEPTION 'p_recipient_email must not be empty';
	END IF;

	SELECT *
	INTO v_sequence
	FROM public.email_sequences
	WHERE key = p_sequence_key
	  AND status = 'active';

	IF NOT FOUND THEN
		RETURN NULL;
	END IF;

	SELECT created_at
	INTO v_user_created_at
	FROM public.users
	WHERE id = p_user_id;

	IF NOT FOUND THEN
		RAISE EXCEPTION 'user % not found', p_user_id;
	END IF;

	IF v_user_created_at < NOW() - INTERVAL '14 days' THEN
		RAISE EXCEPTION
			'user % is older than the welcome enrollment window',
			p_user_id
			USING ERRCODE = 'P0001';
	END IF;

	IF v_sequence.metadata ? 'welcome_system_deploy_at' THEN
		v_deploy_at := (v_sequence.metadata->>'welcome_system_deploy_at')::timestamptz;
		IF v_user_created_at < v_deploy_at THEN
			RAISE EXCEPTION
				'user % predates welcome system deploy timestamp %',
				p_user_id,
				v_deploy_at
				USING ERRCODE = 'P0001';
		END IF;
	END IF;

	SELECT *
	INTO v_existing
	FROM public.email_sequence_enrollments
	WHERE sequence_id = v_sequence.id
	  AND user_id = p_user_id;

	IF FOUND THEN
		UPDATE public.email_sequence_enrollments
		SET recipient_email = v_normalized_email,
			metadata = COALESCE(metadata, '{}'::jsonb)
				|| jsonb_build_object(
					'signup_method', p_signup_method,
					'trigger_source', p_trigger_source
				)
				|| COALESCE(p_metadata, '{}'::jsonb),
			updated_at = NOW()
		WHERE id = v_existing.id
		RETURNING * INTO v_enrollment;

		RETURN v_enrollment;
	END IF;

	INSERT INTO public.email_sequence_enrollments (
		sequence_id,
		user_id,
		recipient_email,
		status,
		current_step_number,
		next_step_number,
		next_send_at,
		metadata
	)
	VALUES (
		v_sequence.id,
		p_user_id,
		v_normalized_email,
		'active',
		0,
		1,
		NOW(),
		jsonb_build_object(
			'signup_method', p_signup_method,
			'trigger_source', p_trigger_source
		) || COALESCE(p_metadata, '{}'::jsonb)
	)
	RETURNING * INTO v_enrollment;

	INSERT INTO public.email_sequence_events (
		enrollment_id,
		sequence_id,
		user_id,
		step_number,
		step_key,
		event_type,
		reason,
		metadata
	)
	VALUES (
		v_enrollment.id,
		v_sequence.id,
		p_user_id,
		1,
		'email_1',
		'enrolled',
		p_trigger_source,
		v_enrollment.metadata
	);

	RETURN v_enrollment;
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_pending_email_sequence_sends(
	p_sequence_key TEXT,
	p_limit INT DEFAULT 50
)
RETURNS SETOF public.email_sequence_enrollments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
	UPDATE public.email_sequence_enrollments e
	SET status = 'active',
		processing_started_at = NULL,
		next_send_at = NOW(),
		failure_count = failure_count + 1,
		last_error = 'Recovered stale processing claim',
		updated_at = NOW()
	FROM public.email_sequences s
	WHERE s.id = e.sequence_id
	  AND s.key = p_sequence_key
	  AND e.status = 'processing'
	  AND e.processing_started_at < NOW() - INTERVAL '2 hours';

	RETURN QUERY
	WITH due AS (
		SELECT e.id
		FROM public.email_sequence_enrollments e
		JOIN public.email_sequences s ON s.id = e.sequence_id
		WHERE s.key = p_sequence_key
		  AND s.status = 'active'
		  AND e.status = 'active'
		  AND e.next_send_at <= NOW()
		  AND e.next_step_number IS NOT NULL
		ORDER BY e.next_send_at ASC
		LIMIT GREATEST(COALESCE(p_limit, 50), 1)
		FOR UPDATE OF e SKIP LOCKED
	),
	claimed AS (
		UPDATE public.email_sequence_enrollments e
		SET status = 'processing',
			processing_started_at = NOW(),
			updated_at = NOW()
		FROM due
		WHERE e.id = due.id
		RETURNING e.*
	),
	events AS (
		INSERT INTO public.email_sequence_events (
			enrollment_id,
			sequence_id,
			user_id,
			step_number,
			step_key,
			event_type,
			reason,
			metadata
		)
		SELECT
			c.id,
			c.sequence_id,
			c.user_id,
			c.next_step_number,
			('email_' || c.next_step_number::text),
			'claimed',
			'cron_claim',
			jsonb_build_object('claimed_at', NOW())
		FROM claimed c
		RETURNING 1
	)
	SELECT * FROM claimed;
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_specific_email_sequence_send(
	p_enrollment_id UUID
)
RETURNS public.email_sequence_enrollments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
	v_enrollment public.email_sequence_enrollments%ROWTYPE;
BEGIN
	UPDATE public.email_sequence_enrollments
	SET status = 'processing',
		processing_started_at = NOW(),
		updated_at = NOW()
	WHERE id = p_enrollment_id
	  AND status = 'active'
	  AND next_send_at <= NOW()
	  AND next_step_number IS NOT NULL
	RETURNING * INTO v_enrollment;

	IF NOT FOUND THEN
		RETURN NULL;
	END IF;

	INSERT INTO public.email_sequence_events (
		enrollment_id,
		sequence_id,
		user_id,
		step_number,
		step_key,
		event_type,
		reason,
		metadata
	)
	VALUES (
		v_enrollment.id,
		v_enrollment.sequence_id,
		v_enrollment.user_id,
		v_enrollment.next_step_number,
		('email_' || v_enrollment.next_step_number::text),
		'claimed',
		'specific_claim',
		jsonb_build_object('claimed_at', NOW())
	);

	RETURN v_enrollment;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_email_sequence_send(
	p_enrollment_id UUID,
	p_email_id UUID,
	p_branch_key TEXT DEFAULT NULL,
	p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS public.email_sequence_enrollments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
	v_enrollment public.email_sequence_enrollments%ROWTYPE;
	v_updated public.email_sequence_enrollments%ROWTYPE;
	v_current_step public.email_sequence_steps%ROWTYPE;
	v_next_step public.email_sequence_steps%ROWTYPE;
	v_current_step_number INT;
BEGIN
	SELECT *
	INTO v_enrollment
	FROM public.email_sequence_enrollments
	WHERE id = p_enrollment_id
	  AND status = 'processing'
	FOR UPDATE;

	IF NOT FOUND THEN
		RAISE EXCEPTION 'enrollment % is not processing', p_enrollment_id;
	END IF;

	v_current_step_number := v_enrollment.next_step_number;

	IF v_current_step_number IS NULL THEN
		RAISE EXCEPTION 'enrollment % has no next step to complete', p_enrollment_id;
	END IF;

	SELECT *
	INTO v_current_step
	FROM public.email_sequence_steps
	WHERE sequence_id = v_enrollment.sequence_id
	  AND step_number = v_current_step_number;

	SELECT *
	INTO v_next_step
	FROM public.email_sequence_steps
	WHERE sequence_id = v_enrollment.sequence_id
	  AND status = 'active'
	  AND step_number > v_current_step_number
	ORDER BY step_number ASC
	LIMIT 1;

	IF FOUND THEN
		UPDATE public.email_sequence_enrollments
		SET status = 'active',
			current_step_number = v_current_step_number,
			next_step_number = v_next_step.step_number,
			next_send_at = created_at + (v_next_step.absolute_day_offset || ' days')::interval,
			last_sent_at = NOW(),
			last_email_id = p_email_id,
			processing_started_at = NULL,
			failure_count = 0,
			last_error = NULL,
			metadata = COALESCE(metadata, '{}'::jsonb) || COALESCE(p_metadata, '{}'::jsonb),
			updated_at = NOW()
		WHERE id = p_enrollment_id
		RETURNING * INTO v_updated;
	ELSE
		UPDATE public.email_sequence_enrollments
		SET status = 'completed',
			current_step_number = v_current_step_number,
			next_step_number = NULL,
			next_send_at = NULL,
			last_sent_at = NOW(),
			last_email_id = p_email_id,
			processing_started_at = NULL,
			failure_count = 0,
			exit_reason = 'completed',
			last_error = NULL,
			metadata = COALESCE(metadata, '{}'::jsonb) || COALESCE(p_metadata, '{}'::jsonb),
			updated_at = NOW()
		WHERE id = p_enrollment_id
		RETURNING * INTO v_updated;
	END IF;

	INSERT INTO public.email_sequence_events (
		enrollment_id,
		sequence_id,
		user_id,
		step_number,
		step_key,
		event_type,
		branch_key,
		reason,
		email_id,
		metadata
	)
	VALUES (
		v_updated.id,
		v_updated.sequence_id,
		v_updated.user_id,
		v_current_step_number,
		COALESCE(v_current_step.step_key, 'email_' || v_current_step_number::text),
		'sent',
		p_branch_key,
		'email_sent',
		p_email_id,
		COALESCE(p_metadata, '{}'::jsonb)
	);

	IF v_updated.status = 'completed' THEN
		INSERT INTO public.email_sequence_events (
			enrollment_id,
			sequence_id,
			user_id,
			step_number,
			step_key,
			event_type,
			reason,
			email_id,
			metadata
		)
		VALUES (
			v_updated.id,
			v_updated.sequence_id,
			v_updated.user_id,
			v_current_step_number,
			COALESCE(v_current_step.step_key, 'email_' || v_current_step_number::text),
			'completed',
			'all_steps_finalized',
			p_email_id,
			COALESCE(p_metadata, '{}'::jsonb)
		);
	END IF;

	RETURN v_updated;
END;
$$;

CREATE OR REPLACE FUNCTION public.skip_email_sequence_step(
	p_enrollment_id UUID,
	p_branch_key TEXT DEFAULT NULL,
	p_reason TEXT DEFAULT 'skipped',
	p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS public.email_sequence_enrollments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
	v_enrollment public.email_sequence_enrollments%ROWTYPE;
	v_updated public.email_sequence_enrollments%ROWTYPE;
	v_current_step public.email_sequence_steps%ROWTYPE;
	v_next_step public.email_sequence_steps%ROWTYPE;
	v_current_step_number INT;
BEGIN
	SELECT *
	INTO v_enrollment
	FROM public.email_sequence_enrollments
	WHERE id = p_enrollment_id
	  AND status = 'processing'
	FOR UPDATE;

	IF NOT FOUND THEN
		RAISE EXCEPTION 'enrollment % is not processing', p_enrollment_id;
	END IF;

	v_current_step_number := v_enrollment.next_step_number;

	IF v_current_step_number IS NULL THEN
		RAISE EXCEPTION 'enrollment % has no next step to skip', p_enrollment_id;
	END IF;

	SELECT *
	INTO v_current_step
	FROM public.email_sequence_steps
	WHERE sequence_id = v_enrollment.sequence_id
	  AND step_number = v_current_step_number;

	SELECT *
	INTO v_next_step
	FROM public.email_sequence_steps
	WHERE sequence_id = v_enrollment.sequence_id
	  AND status = 'active'
	  AND step_number > v_current_step_number
	ORDER BY step_number ASC
	LIMIT 1;

	IF FOUND THEN
		UPDATE public.email_sequence_enrollments
		SET status = 'active',
			current_step_number = v_current_step_number,
			next_step_number = v_next_step.step_number,
			next_send_at = created_at + (v_next_step.absolute_day_offset || ' days')::interval,
			processing_started_at = NULL,
			failure_count = 0,
			last_error = NULL,
			metadata = COALESCE(metadata, '{}'::jsonb) || COALESCE(p_metadata, '{}'::jsonb),
			updated_at = NOW()
		WHERE id = p_enrollment_id
		RETURNING * INTO v_updated;
	ELSE
		UPDATE public.email_sequence_enrollments
		SET status = 'completed',
			current_step_number = v_current_step_number,
			next_step_number = NULL,
			next_send_at = NULL,
			processing_started_at = NULL,
			failure_count = 0,
			exit_reason = 'completed',
			last_error = NULL,
			metadata = COALESCE(metadata, '{}'::jsonb) || COALESCE(p_metadata, '{}'::jsonb),
			updated_at = NOW()
		WHERE id = p_enrollment_id
		RETURNING * INTO v_updated;
	END IF;

	INSERT INTO public.email_sequence_events (
		enrollment_id,
		sequence_id,
		user_id,
		step_number,
		step_key,
		event_type,
		branch_key,
		reason,
		metadata
	)
	VALUES (
		v_updated.id,
		v_updated.sequence_id,
		v_updated.user_id,
		v_current_step_number,
		COALESCE(v_current_step.step_key, 'email_' || v_current_step_number::text),
		'skipped',
		p_branch_key,
		p_reason,
		COALESCE(p_metadata, '{}'::jsonb)
	);

	IF v_updated.status = 'completed' THEN
		INSERT INTO public.email_sequence_events (
			enrollment_id,
			sequence_id,
			user_id,
			step_number,
			step_key,
			event_type,
			reason,
			metadata
		)
		VALUES (
			v_updated.id,
			v_updated.sequence_id,
			v_updated.user_id,
			v_current_step_number,
			COALESCE(v_current_step.step_key, 'email_' || v_current_step_number::text),
			'completed',
			'all_steps_finalized',
			COALESCE(p_metadata, '{}'::jsonb)
		);
	END IF;

	RETURN v_updated;
END;
$$;

CREATE OR REPLACE FUNCTION public.defer_email_sequence_step(
	p_enrollment_id UUID,
	p_next_send_at TIMESTAMPTZ,
	p_reason TEXT DEFAULT 'deferred'
)
RETURNS public.email_sequence_enrollments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
	v_updated public.email_sequence_enrollments%ROWTYPE;
BEGIN
	UPDATE public.email_sequence_enrollments
	SET status = 'active',
		next_send_at = p_next_send_at,
		processing_started_at = NULL,
		updated_at = NOW()
	WHERE id = p_enrollment_id
	  AND status = 'processing'
	RETURNING * INTO v_updated;

	IF NOT FOUND THEN
		RAISE EXCEPTION 'enrollment % is not processing', p_enrollment_id;
	END IF;

	INSERT INTO public.email_sequence_events (
		enrollment_id,
		sequence_id,
		user_id,
		step_number,
		step_key,
		event_type,
		reason,
		metadata
	)
	VALUES (
		v_updated.id,
		v_updated.sequence_id,
		v_updated.user_id,
		v_updated.next_step_number,
		('email_' || v_updated.next_step_number::text),
		'deferred',
		p_reason,
		jsonb_build_object('next_send_at', p_next_send_at)
	);

	RETURN v_updated;
END;
$$;

CREATE OR REPLACE FUNCTION public.retry_or_fail_email_sequence_send(
	p_enrollment_id UUID,
	p_error TEXT
)
RETURNS public.email_sequence_enrollments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
	v_enrollment public.email_sequence_enrollments%ROWTYPE;
	v_updated public.email_sequence_enrollments%ROWTYPE;
	v_next_failure_count INT;
	v_event_type TEXT;
BEGIN
	SELECT *
	INTO v_enrollment
	FROM public.email_sequence_enrollments
	WHERE id = p_enrollment_id
	  AND status = 'processing'
	FOR UPDATE;

	IF NOT FOUND THEN
		RAISE EXCEPTION 'enrollment % is not processing', p_enrollment_id;
	END IF;

	v_next_failure_count := COALESCE(v_enrollment.failure_count, 0) + 1;

	IF v_next_failure_count >= 3 THEN
		UPDATE public.email_sequence_enrollments
		SET status = 'errored',
			next_step_number = NULL,
			next_send_at = NULL,
			processing_started_at = NULL,
			failure_count = v_next_failure_count,
			last_error = left(COALESCE(p_error, 'Unknown error'), 1000),
			updated_at = NOW()
		WHERE id = p_enrollment_id
		RETURNING * INTO v_updated;

		v_event_type := 'failed';
	ELSE
		UPDATE public.email_sequence_enrollments
		SET status = 'active',
			next_send_at = NOW() + INTERVAL '30 minutes',
			processing_started_at = NULL,
			failure_count = v_next_failure_count,
			last_error = left(COALESCE(p_error, 'Unknown error'), 1000),
			updated_at = NOW()
		WHERE id = p_enrollment_id
		RETURNING * INTO v_updated;

		v_event_type := 'retried';
	END IF;

	INSERT INTO public.email_sequence_events (
		enrollment_id,
		sequence_id,
		user_id,
		step_number,
		step_key,
		event_type,
		reason,
		metadata
	)
	VALUES (
		v_updated.id,
		v_updated.sequence_id,
		v_updated.user_id,
		v_enrollment.next_step_number,
		('email_' || v_enrollment.next_step_number::text),
		v_event_type,
		CASE WHEN v_event_type = 'failed' THEN 'max_retries_exceeded' ELSE 'provider_failure_retry' END,
		jsonb_build_object(
			'failure_count', v_next_failure_count,
			'error', left(COALESCE(p_error, 'Unknown error'), 1000)
		)
	);

	RETURN v_updated;
END;
$$;

CREATE OR REPLACE FUNCTION public.exit_user_from_email_sequence(
	p_user_id UUID,
	p_sequence_key TEXT,
	p_reason TEXT DEFAULT 'manual'
)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
	v_count INT;
BEGIN
	WITH exited AS (
		UPDATE public.email_sequence_enrollments e
		SET status = 'exited',
			next_step_number = NULL,
			next_send_at = NULL,
			processing_started_at = NULL,
			exit_reason = p_reason,
			updated_at = NOW()
		FROM public.email_sequences s
		WHERE s.id = e.sequence_id
		  AND s.key = p_sequence_key
		  AND e.user_id = p_user_id
		  AND e.status IN ('active', 'processing', 'paused')
		RETURNING e.*
	),
	events AS (
		INSERT INTO public.email_sequence_events (
			enrollment_id,
			sequence_id,
			user_id,
			step_number,
			step_key,
			event_type,
			reason,
			metadata
		)
		SELECT
			id,
			sequence_id,
			user_id,
			next_step_number,
			CASE WHEN next_step_number IS NULL THEN NULL ELSE 'email_' || next_step_number::text END,
			CASE WHEN p_reason IN ('suppressed', 'unsubscribed') THEN 'suppressed' ELSE 'exited' END,
			p_reason,
			jsonb_build_object('exit_reason', p_reason)
		FROM exited
		RETURNING 1
	)
	SELECT COUNT(*) INTO v_count FROM exited;

	RETURN COALESCE(v_count, 0);
END;
$$;

CREATE OR REPLACE FUNCTION public.exit_email_from_email_sequence(
	p_email TEXT,
	p_sequence_key TEXT,
	p_reason TEXT DEFAULT 'suppressed'
)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
	v_email TEXT;
	v_count INT;
BEGIN
	v_email := lower(trim(COALESCE(p_email, '')));

	IF length(v_email) = 0 THEN
		RETURN 0;
	END IF;

	WITH exited AS (
		UPDATE public.email_sequence_enrollments e
		SET status = 'exited',
			next_step_number = NULL,
			next_send_at = NULL,
			processing_started_at = NULL,
			exit_reason = p_reason,
			updated_at = NOW()
		FROM public.email_sequences s
		WHERE s.id = e.sequence_id
		  AND s.key = p_sequence_key
		  AND e.recipient_email = v_email
		  AND e.status IN ('active', 'processing', 'paused')
		RETURNING e.*
	),
	events AS (
		INSERT INTO public.email_sequence_events (
			enrollment_id,
			sequence_id,
			user_id,
			step_number,
			step_key,
			event_type,
			reason,
			metadata
		)
		SELECT
			id,
			sequence_id,
			user_id,
			next_step_number,
			CASE WHEN next_step_number IS NULL THEN NULL ELSE 'email_' || next_step_number::text END,
			CASE WHEN p_reason IN ('suppressed', 'unsubscribed') THEN 'suppressed' ELSE 'exited' END,
			p_reason,
			jsonb_build_object('exit_reason', p_reason, 'email', v_email)
		FROM exited
		RETURNING 1
	)
	SELECT COUNT(*) INTO v_count FROM exited;

	RETURN COALESCE(v_count, 0);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_send_next_step_now(
	p_enrollment_id UUID
)
RETURNS public.email_sequence_enrollments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
	v_updated public.email_sequence_enrollments%ROWTYPE;
BEGIN
	UPDATE public.email_sequence_enrollments
	SET status = 'active',
		next_send_at = NOW(),
		processing_started_at = NULL,
		updated_at = NOW()
	WHERE id = p_enrollment_id
	  AND status IN ('active', 'paused', 'errored')
	  AND next_step_number IS NOT NULL
	RETURNING * INTO v_updated;

	IF NOT FOUND THEN
		RETURN NULL;
	END IF;

	INSERT INTO public.email_sequence_events (
		enrollment_id,
		sequence_id,
		user_id,
		step_number,
		step_key,
		event_type,
		reason,
		metadata
	)
	VALUES (
		v_updated.id,
		v_updated.sequence_id,
		v_updated.user_id,
		v_updated.next_step_number,
		('email_' || v_updated.next_step_number::text),
		'retried',
		'admin_send_next_step_now',
		jsonb_build_object('admin_action', 'send_next_step_now')
	);

	RETURN v_updated;
END;
$$;

GRANT EXECUTE ON FUNCTION public.enroll_user_in_email_sequence(UUID, TEXT, TEXT, TEXT, TEXT, JSONB)
	TO service_role;

GRANT EXECUTE ON FUNCTION public.claim_pending_email_sequence_sends(TEXT, INT)
	TO service_role;

GRANT EXECUTE ON FUNCTION public.claim_specific_email_sequence_send(UUID)
	TO service_role;

GRANT EXECUTE ON FUNCTION public.complete_email_sequence_send(UUID, UUID, TEXT, JSONB)
	TO service_role;

GRANT EXECUTE ON FUNCTION public.skip_email_sequence_step(UUID, TEXT, TEXT, JSONB)
	TO service_role;

GRANT EXECUTE ON FUNCTION public.defer_email_sequence_step(UUID, TIMESTAMPTZ, TEXT)
	TO service_role;

GRANT EXECUTE ON FUNCTION public.retry_or_fail_email_sequence_send(UUID, TEXT)
	TO service_role;

GRANT EXECUTE ON FUNCTION public.exit_user_from_email_sequence(UUID, TEXT, TEXT)
	TO service_role;

GRANT EXECUTE ON FUNCTION public.exit_email_from_email_sequence(TEXT, TEXT, TEXT)
	TO service_role;

GRANT EXECUTE ON FUNCTION public.admin_send_next_step_now(UUID)
	TO service_role;

COMMIT;
