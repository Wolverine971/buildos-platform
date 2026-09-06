-- libri-migration: true
-- libri-allow-security-definer: list_image_upload_candidates, claim_image_upload, fail_image_upload
-- Machine-only transition APIs: SECURITY DEFINER avoids raw staging/lease grants.
-- ACL identity is the isolated libri_worker login, not a browser auth.uid().
-- No success/publication API, Storage authority, shared queue, or activation here.
SET lock_timeout = '5s';
SET statement_timeout = '60s';

ALTER TABLE libri.image_upload_controls
	ADD COLUMN processing_enabled boolean NOT NULL DEFAULT false;

CREATE TABLE libri.image_upload_processing (
	upload_id uuid PRIMARY KEY REFERENCES libri.image_upload_intents(id) ON DELETE RESTRICT,
	status text NOT NULL CHECK (status IN ('leased', 'retry_wait', 'blocked')),
	attempt integer NOT NULL CHECK (attempt BETWEEN 1 AND 3),
	lease_token uuid NOT NULL,
	lease_expires_at timestamptz NOT NULL,
	available_at timestamptz NOT NULL,
	updated_at timestamptz NOT NULL,
	last_failure text CHECK (last_failure IN (
		'invalid_image', 'verification_unavailable', 'storage_unavailable', 'cancelled', 'attempts_exhausted'
	))
);
ALTER TABLE libri.image_upload_processing ENABLE ROW LEVEL SECURITY;
ALTER TABLE libri.image_upload_processing FORCE ROW LEVEL SECURITY;
REVOKE ALL ON libri.image_upload_processing FROM PUBLIC, anon, authenticated, libri_worker;
GRANT SELECT, INSERT, UPDATE, DELETE ON libri.image_upload_processing TO service_role;

CREATE FUNCTION libri.list_image_upload_candidates(p_library_id uuid)
RETURNS TABLE(upload_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, libri
SET statement_timeout = '5s'
AS $function$
	SELECT item.id
	FROM libri.image_upload_intents item
	JOIN libri.image_upload_controls control ON control.library_id = item.library_id
	JOIN libri.library_members member ON member.library_id = item.library_id
		AND member.user_id = item.requested_by AND member.role IN ('owner', 'editor')
	LEFT JOIN libri.image_upload_processing work ON work.upload_id = item.id
	WHERE item.library_id = p_library_id AND item.status = 'awaiting_verification'
		AND item.expires_at > now() AND control.admission_enabled AND control.processing_enabled
		AND (work.upload_id IS NULL
			OR (work.status = 'retry_wait' AND work.available_at <= now())
			OR (work.status = 'leased' AND work.lease_expires_at <= now()))
	ORDER BY item.submitted_at, item.id LIMIT 10
$function$;

CREATE FUNCTION libri.claim_image_upload(p_library_id uuid, p_upload_id uuid, p_lease_token uuid)
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
	IF work.upload_id IS NOT NULL AND work.lease_token = p_lease_token THEN
		-- Ambiguous claim retries reuse the token, never extend time or consume an attempt.
		IF work.status <> 'leased' OR work.lease_expires_at <= stamp THEN RETURN NULL; END IF;
	ELSE
		IF work.upload_id IS NOT NULL THEN
			IF work.status = 'blocked'
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

CREATE FUNCTION libri.fail_image_upload(
	p_library_id uuid, p_upload_id uuid, p_lease_token uuid, p_attempt integer, p_failure_code text
)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, libri
SET lock_timeout = '2s'
SET statement_timeout = '5s'
AS $function$
DECLARE
	item libri.image_upload_intents;
	work libri.image_upload_processing;
	stamp timestamptz;
	can_retry boolean;
BEGIN
	IF p_library_id IS NULL OR p_upload_id IS NULL OR p_lease_token IS NULL
		OR p_attempt IS NULL OR p_attempt NOT BETWEEN 1 AND 3
		OR p_failure_code IS NULL OR p_failure_code NOT IN (
			'invalid_image', 'verification_unavailable', 'storage_unavailable', 'cancelled'
		) THEN RAISE EXCEPTION 'Invalid upload failure' USING ERRCODE = '22023'; END IF;
	-- No member/control lock is needed for a failure-only transition. It remains safe
	-- after revocation/disable and never releases quota or grants publication authority.
	SELECT intent.* INTO item FROM libri.image_upload_intents intent
	WHERE intent.library_id = p_library_id AND intent.id = p_upload_id FOR UPDATE;
	IF item.id IS NULL OR item.status <> 'awaiting_verification' THEN RETURN false; END IF;
	SELECT processing.* INTO work FROM libri.image_upload_processing processing
	WHERE processing.upload_id = item.id FOR UPDATE;
	stamp := clock_timestamp();
	IF work.upload_id IS NULL OR work.lease_token <> p_lease_token OR work.attempt <> p_attempt THEN RETURN false; END IF;
	-- Repeat only the same acknowledged failure, without resetting the retry deadline.
	IF work.status <> 'leased' THEN RETURN work.last_failure = p_failure_code; END IF;
	IF work.lease_expires_at <= stamp OR item.expires_at <= stamp THEN RETURN false; END IF;
	can_retry := p_failure_code IN ('verification_unavailable', 'storage_unavailable') AND work.attempt < 3;
	UPDATE libri.image_upload_processing SET status = CASE WHEN can_retry THEN 'retry_wait' ELSE 'blocked' END,
		last_failure = p_failure_code, available_at = stamp + interval '30 seconds', updated_at = stamp
	WHERE upload_id = item.id;
	RETURN true;
END;
$function$;

REVOKE ALL ON FUNCTION libri.list_image_upload_candidates(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION libri.claim_image_upload(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION libri.fail_image_upload(uuid, uuid, uuid, integer, text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION libri.list_image_upload_candidates(uuid) TO libri_worker;
GRANT EXECUTE ON FUNCTION libri.claim_image_upload(uuid, uuid, uuid) TO libri_worker;
GRANT EXECUTE ON FUNCTION libri.fail_image_upload(uuid, uuid, uuid, integer, text) TO libri_worker;

NOTIFY pgrst, 'reload schema';
RESET statement_timeout;
RESET lock_timeout;
