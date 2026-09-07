-- libri-migration: true
-- libri-allow-security-definer: claim_image_upload
-- Append-only correction: preserve the first-published publication migration verbatim.
-- Refresh time after a lock wait; keep ACLs, quotas, status and lease limits unchanged.
SET lock_timeout = '5s';
SET statement_timeout = '60s';

CREATE OR REPLACE FUNCTION libri.claim_image_upload(p_library_id uuid, p_upload_id uuid, p_lease_token uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, libri
SET lock_timeout = '2s'
SET statement_timeout = '5s'
AS $function$
DECLARE
	requester uuid;
	member_role text;
	control libri.image_upload_controls;
	item libri.image_upload_intents;
	work libri.image_upload_processing;
	stamp timestamptz;
BEGIN
	IF p_library_id IS NULL OR p_upload_id IS NULL OR p_lease_token IS NULL THEN
		RAISE EXCEPTION 'Invalid upload claim' USING ERRCODE = '22023';
	END IF;
	SELECT intent.requested_by INTO requester FROM libri.image_upload_intents intent
	WHERE intent.library_id = p_library_id AND intent.id = p_upload_id;
	IF requester IS NULL THEN RETURN NULL; END IF;
	-- Match admission lock order: member -> controls -> intent -> processing.
	SELECT member.role INTO member_role FROM libri.library_members member
	WHERE member.library_id = p_library_id AND member.user_id = requester FOR SHARE;
	IF member_role IS NULL OR member_role NOT IN ('owner', 'editor') THEN RETURN NULL; END IF;
	-- Serializes the one-active-upload limit within this library only.
	SELECT controls.* INTO control FROM libri.image_upload_controls controls
	WHERE controls.library_id = p_library_id FOR UPDATE;
	IF control.library_id IS NULL OR NOT control.admission_enabled OR NOT control.processing_enabled THEN
		RETURN NULL;
	END IF;
	SELECT intent.* INTO item FROM libri.image_upload_intents intent
	WHERE intent.library_id = p_library_id AND intent.id = p_upload_id FOR UPDATE SKIP LOCKED;
	stamp := clock_timestamp();
	IF item.id IS NULL OR item.requested_by <> requester OR item.status <> 'awaiting_verification'
		OR item.expires_at <= stamp THEN RETURN NULL; END IF;
	SELECT processing.* INTO work FROM libri.image_upload_processing processing
	WHERE processing.upload_id = item.id FOR UPDATE;
	-- Refresh after the processing-row wait, before retry/deadline decisions.
	stamp := clock_timestamp();
	IF item.expires_at <= stamp THEN RETURN NULL; END IF;
	IF work.upload_id IS NOT NULL AND work.lease_token = p_lease_token THEN
		-- Ambiguous claim retries reuse the token, never extend time or consume an attempt.
		IF work.status <> 'leased' OR work.lease_expires_at <= stamp THEN RETURN NULL; END IF;
	ELSE
		IF work.upload_id IS NOT NULL THEN
			IF work.status IN ('blocked', 'published')
				OR (work.status = 'leased' AND work.lease_expires_at > stamp)
				OR (work.status = 'retry_wait' AND work.available_at > stamp) THEN RETURN NULL; END IF;
			IF work.attempt >= 3 THEN
				UPDATE libri.image_upload_processing SET status = 'blocked',
					last_failure = 'attempts_exhausted', updated_at = stamp WHERE upload_id = item.id;
				RETURN NULL;
			END IF;
		END IF;
		IF EXISTS (SELECT 1 FROM libri.image_upload_processing active
			JOIN libri.image_upload_intents parent ON parent.id = active.upload_id
			WHERE parent.library_id = p_library_id AND active.status = 'leased'
				AND active.lease_expires_at > stamp) THEN RETURN NULL; END IF;
		IF work.upload_id IS NULL THEN
			INSERT INTO libri.image_upload_processing (
				upload_id, status, attempt, lease_token, lease_expires_at, available_at, updated_at
			) VALUES (item.id, 'leased', 1, p_lease_token,
				LEAST(stamp + interval '90 seconds', item.expires_at), stamp, stamp)
			RETURNING * INTO work;
		ELSE
			UPDATE libri.image_upload_processing SET status = 'leased', attempt = work.attempt + 1,
				lease_token = p_lease_token, lease_expires_at = LEAST(stamp + interval '90 seconds', item.expires_at),
				available_at = stamp, updated_at = stamp, last_failure = NULL
			WHERE upload_id = item.id RETURNING * INTO work;
		END IF;
	END IF;
	RETURN jsonb_build_object('upload_id', item.id, 'library_id', item.library_id, 'book_id', item.book_id,
		'object_path', item.object_path, 'declaration', item.file_metadata, 'attempt', work.attempt,
		'lease_token', work.lease_token, 'lease_expires_at', work.lease_expires_at);
END;
$function$;

NOTIFY pgrst, 'reload schema';
RESET statement_timeout;
RESET lock_timeout;
