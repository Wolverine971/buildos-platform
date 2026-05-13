-- supabase/migrations/20260513000000_add_brief_audio_narration.sql
-- Daily brief voice narration.

DO $$ BEGIN
	ALTER TYPE queue_type ADD VALUE IF NOT EXISTS 'generate_brief_audio';
EXCEPTION
	WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE public.users
	ADD COLUMN IF NOT EXISTS voice_narration_enabled boolean NOT NULL DEFAULT false;

ALTER TABLE public.ontology_daily_briefs
	ADD COLUMN IF NOT EXISTS audio_status text NOT NULL DEFAULT 'none',
	ADD COLUMN IF NOT EXISTS audio_storage_path text,
	ADD COLUMN IF NOT EXISTS audio_voice text,
	ADD COLUMN IF NOT EXISTS audio_model text,
	ADD COLUMN IF NOT EXISTS audio_duration_ms integer,
	ADD COLUMN IF NOT EXISTS audio_generation_ms integer,
	ADD COLUMN IF NOT EXISTS audio_requested_at timestamptz,
	ADD COLUMN IF NOT EXISTS audio_generation_started_at timestamptz,
	ADD COLUMN IF NOT EXISTS audio_generated_at timestamptz,
	ADD COLUMN IF NOT EXISTS audio_error text;

DO $$ BEGIN
	IF NOT EXISTS (
		SELECT 1
		FROM pg_constraint
		WHERE conname = 'ontology_daily_briefs_audio_status_check'
	) THEN
		ALTER TABLE public.ontology_daily_briefs
			ADD CONSTRAINT ontology_daily_briefs_audio_status_check
			CHECK (audio_status IN ('none', 'pending', 'generating', 'ready', 'failed'));
	END IF;

	IF NOT EXISTS (
		SELECT 1
		FROM pg_constraint
		WHERE conname = 'ontology_daily_briefs_audio_duration_ms_check'
	) THEN
		ALTER TABLE public.ontology_daily_briefs
			ADD CONSTRAINT ontology_daily_briefs_audio_duration_ms_check
			CHECK (audio_duration_ms IS NULL OR audio_duration_ms >= 0);
	END IF;

	IF NOT EXISTS (
		SELECT 1
		FROM pg_constraint
		WHERE conname = 'ontology_daily_briefs_audio_generation_ms_check'
	) THEN
		ALTER TABLE public.ontology_daily_briefs
			ADD CONSTRAINT ontology_daily_briefs_audio_generation_ms_check
			CHECK (audio_generation_ms IS NULL OR audio_generation_ms >= 0);
	END IF;
END $$;

CREATE INDEX IF NOT EXISTS ontology_daily_briefs_audio_status_idx
	ON public.ontology_daily_briefs (audio_status)
	WHERE audio_status IN ('pending', 'generating', 'failed');

INSERT INTO storage.buckets (id, name, public)
VALUES ('brief-audio', 'brief-audio', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS brief_audio_read_own ON storage.objects;
CREATE POLICY brief_audio_read_own
	ON storage.objects
	FOR SELECT
	USING (
		bucket_id = 'brief-audio'
		AND auth.role() = 'authenticated'
		AND (storage.foldername(name))[1] = auth.uid()::text
	);
