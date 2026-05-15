-- supabase/migrations/20260514000000_agentic_chat_multimodal_phase1.sql
-- Phase 1 multimodal agent chat foundations: message attachments, checksum dedupe, and media usage telemetry.

DO $$ BEGIN
	IF NOT EXISTS (
		SELECT 1
		FROM pg_constraint
		WHERE conname = 'onto_assets_checksum_sha256_shape'
	) THEN
		ALTER TABLE public.onto_assets
			ADD CONSTRAINT onto_assets_checksum_sha256_shape
			CHECK (checksum_sha256 IS NULL OR checksum_sha256 ~ '^[a-f0-9]{64}$')
			NOT VALID;
	END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_onto_assets_project_checksum_active_lookup
	ON public.onto_assets(project_id, checksum_sha256)
	WHERE checksum_sha256 IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_onto_assets_project_image_active_storage
	ON public.onto_assets(project_id, kind, deleted_at)
	WHERE kind = 'image' AND deleted_at IS NULL;

DO $$ BEGIN
	IF NOT EXISTS (
		SELECT 1
		FROM pg_indexes
		WHERE schemaname = 'public'
			AND indexname = 'idx_onto_assets_project_checksum_active_unique'
	) AND NOT EXISTS (
		SELECT 1
		FROM public.onto_assets
		WHERE checksum_sha256 IS NOT NULL
			AND deleted_at IS NULL
		GROUP BY project_id, checksum_sha256
		HAVING count(*) > 1
	) THEN
		CREATE UNIQUE INDEX idx_onto_assets_project_checksum_active_unique
			ON public.onto_assets(project_id, checksum_sha256)
			WHERE checksum_sha256 IS NOT NULL AND deleted_at IS NULL;
	END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.chat_message_attachments (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	message_id uuid NOT NULL REFERENCES public.chat_messages(id) ON DELETE CASCADE,
	session_id uuid NOT NULL REFERENCES public.chat_sessions(id) ON DELETE CASCADE,
	user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
	project_id uuid NULL REFERENCES public.onto_projects(id) ON DELETE CASCADE,
	asset_id uuid NULL REFERENCES public.onto_assets(id) ON DELETE CASCADE,
	attachment_kind text NOT NULL
		CHECK (attachment_kind IN ('onto_asset', 'voice_note_group', 'document', 'temporary_file')),
	media_type text NOT NULL
		CHECK (media_type IN ('image', 'pdf', 'audio', 'video', 'file')),
	role text NOT NULL DEFAULT 'attachment'
		CHECK (role IN ('attachment', 'inline', 'reference', 'cover_candidate', 'analysis_target')),
	display_order integer NOT NULL DEFAULT 0 CHECK (display_order >= 0),
	metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
	created_at timestamptz NOT NULL DEFAULT now(),
	CONSTRAINT chat_message_attachments_onto_asset_requires_asset
		CHECK (attachment_kind <> 'onto_asset' OR asset_id IS NOT NULL),
	CONSTRAINT chat_message_attachments_message_asset_unique
		UNIQUE (message_id, asset_id)
);

CREATE INDEX IF NOT EXISTS idx_chat_message_attachments_session
	ON public.chat_message_attachments(session_id, display_order, created_at);

CREATE INDEX IF NOT EXISTS idx_chat_message_attachments_user_created
	ON public.chat_message_attachments(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_chat_message_attachments_project_asset
	ON public.chat_message_attachments(project_id, asset_id)
	WHERE asset_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_chat_message_attachments_message_temp_unique
	ON public.chat_message_attachments(message_id, ((metadata->>'temporary_attachment_id')))
	WHERE attachment_kind = 'temporary_file' AND metadata ? 'temporary_attachment_id';

ALTER TABLE public.chat_message_attachments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS chat_message_attachments_user_select ON public.chat_message_attachments;
CREATE POLICY chat_message_attachments_user_select
	ON public.chat_message_attachments
	FOR SELECT
	TO authenticated
	USING (user_id = auth.uid());

DROP POLICY IF EXISTS chat_message_attachments_user_insert ON public.chat_message_attachments;
CREATE POLICY chat_message_attachments_user_insert
	ON public.chat_message_attachments
	FOR INSERT
	TO authenticated
	WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS chat_message_attachments_user_update ON public.chat_message_attachments;
CREATE POLICY chat_message_attachments_user_update
	ON public.chat_message_attachments
	FOR UPDATE
	TO authenticated
	USING (user_id = auth.uid())
	WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS chat_message_attachments_user_delete ON public.chat_message_attachments;
CREATE POLICY chat_message_attachments_user_delete
	ON public.chat_message_attachments
	FOR DELETE
	TO authenticated
	USING (user_id = auth.uid());

DROP POLICY IF EXISTS chat_message_attachments_service_role ON public.chat_message_attachments;
CREATE POLICY chat_message_attachments_service_role
	ON public.chat_message_attachments
	FOR ALL
	TO service_role
	USING (true)
	WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.agent_chat_media_events (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
	project_id uuid NULL REFERENCES public.onto_projects(id) ON DELETE CASCADE,
	session_id uuid NULL REFERENCES public.chat_sessions(id) ON DELETE SET NULL,
	message_id uuid NULL REFERENCES public.chat_messages(id) ON DELETE SET NULL,
	asset_id uuid NULL REFERENCES public.onto_assets(id) ON DELETE SET NULL,
	external_agent_caller_id uuid NULL REFERENCES public.external_agent_callers(id) ON DELETE SET NULL,
	source text NOT NULL DEFAULT 'agent_chat_ui'
		CHECK (source IN ('agent_chat_ui', 'external_agent', 'manual_project_asset', 'system')),
	event_type text NOT NULL
		CHECK (event_type IN ('upload_requested', 'upload_deduped', 'upload_completed', 'attachment_linked', 'ocr_queued', 'ocr_failed', 'asset_unlinked', 'live_vision_requested', 'live_vision_failed')),
	media_type text NOT NULL DEFAULT 'image'
		CHECK (media_type IN ('image', 'pdf', 'audio', 'video', 'file')),
	content_type text NULL,
	file_size_bytes bigint NULL CHECK (file_size_bytes IS NULL OR file_size_bytes >= 0),
	checksum_sha256 text NULL CHECK (checksum_sha256 IS NULL OR checksum_sha256 ~ '^[a-f0-9]{64}$'),
	metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
	created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agent_chat_media_events_user_created
	ON public.agent_chat_media_events(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_agent_chat_media_events_project_created
	ON public.agent_chat_media_events(project_id, created_at DESC)
	WHERE project_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_agent_chat_media_events_asset_created
	ON public.agent_chat_media_events(asset_id, created_at DESC)
	WHERE asset_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_agent_chat_media_events_upload_quota
	ON public.agent_chat_media_events(user_id, project_id, source, event_type, created_at DESC)
	WHERE source = 'agent_chat_ui' AND event_type = 'upload_requested';

ALTER TABLE public.agent_chat_media_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS agent_chat_media_events_user_select ON public.agent_chat_media_events;
CREATE POLICY agent_chat_media_events_user_select
	ON public.agent_chat_media_events
	FOR SELECT
	TO authenticated
	USING (user_id = auth.uid());

DROP POLICY IF EXISTS agent_chat_media_events_user_insert ON public.agent_chat_media_events;
CREATE POLICY agent_chat_media_events_user_insert
	ON public.agent_chat_media_events
	FOR INSERT
	TO authenticated
	WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS agent_chat_media_events_service_role ON public.agent_chat_media_events;
CREATE POLICY agent_chat_media_events_service_role
	ON public.agent_chat_media_events
	FOR ALL
	TO service_role
	USING (true)
	WITH CHECK (true);
