-- supabase/migrations/20260505000001_add_email_sequence_copy_overrides.sql
BEGIN;

CREATE TABLE IF NOT EXISTS public.email_sequence_copy_overrides (
	id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	sequence_key TEXT NOT NULL,
	step_key TEXT NOT NULL,
	variant_key TEXT NOT NULL DEFAULT 'default',
	subject TEXT NOT NULL,
	body TEXT NOT NULL,
	metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
	created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
	updated_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	UNIQUE (sequence_key, step_key, variant_key)
);

CREATE INDEX IF NOT EXISTS idx_email_sequence_copy_overrides_sequence
	ON public.email_sequence_copy_overrides(sequence_key, step_key, variant_key);

DROP TRIGGER IF EXISTS trg_email_sequence_copy_overrides_updated_at
	ON public.email_sequence_copy_overrides;

CREATE TRIGGER trg_email_sequence_copy_overrides_updated_at
	BEFORE UPDATE ON public.email_sequence_copy_overrides
	FOR EACH ROW
	EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.email_sequence_copy_overrides ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.email_sequence_copy_overrides IS
	'Admin-managed subject/body overrides for lifecycle and founder-led email sequence variants. Source copy remains the fallback.';

DO $$
DECLARE
	v_sequence_id UUID;
BEGIN
	IF to_regclass('public.email_sequences') IS NULL
		OR to_regclass('public.email_sequence_steps') IS NULL THEN
		RETURN;
	END IF;

	INSERT INTO public.email_sequences (
		key,
		display_name,
		description,
		trigger_type,
		status,
		metadata
	)
	VALUES (
		'buildos_reactivation_founder_pilot',
		'BuildOS Reactivation Founder Pilot',
		'Manual founder-led dormant-user reactivation sequence.',
		'manual_campaign',
		'active',
		jsonb_build_object(
			'campaign_id', 'buildos-reactivation-founder-pilot-v1',
			'manual_founder_led', TRUE
		)
	)
	ON CONFLICT (key) DO UPDATE
	SET display_name = EXCLUDED.display_name,
		description = EXCLUDED.description,
		trigger_type = EXCLUDED.trigger_type,
		status = EXCLUDED.status,
		metadata = public.email_sequences.metadata || EXCLUDED.metadata,
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
			'touch_1',
			0,
			0,
			9,
			17,
			FALSE,
			'active',
			jsonb_build_object('manual_send_required', TRUE)
		),
		(
			v_sequence_id,
			2,
			'touch_2',
			3,
			3,
			9,
			17,
			FALSE,
			'active',
			jsonb_build_object('manual_send_required', TRUE, 'requires_demo_url', TRUE)
		),
		(
			v_sequence_id,
			3,
			'touch_3',
			4,
			7,
			9,
			17,
			FALSE,
			'active',
			jsonb_build_object('manual_send_required', TRUE)
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

COMMIT;
