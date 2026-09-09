-- libri-migration: true
-- One durable attempt per reservation. No token storage, resigning, quota release,
-- Storage policy changes, queue activation or changes to existing relations/roles.
SET lock_timeout = '5s';
SET statement_timeout = '60s';

CREATE TABLE libri.image_upload_issuances (
 upload_id uuid PRIMARY KEY REFERENCES libri.image_upload_intents(id) ON DELETE RESTRICT,
 library_id uuid NOT NULL REFERENCES libri.libraries(id) ON DELETE RESTRICT,
 request_id uuid NOT NULL UNIQUE,
 object_path text NOT NULL UNIQUE,
 attempted_at timestamptz NOT NULL,
 sign_before timestamptz NOT NULL,
 reservation_expires_at timestamptz NOT NULL,
 observed_at timestamptz,
 token_expires_at timestamptz,
 CONSTRAINT image_upload_issuances_path CHECK (object_path IN (
  library_id::text||'/uploads/'||upload_id::text||'/original.jpeg',
  library_id::text||'/uploads/'||upload_id::text||'/original.png',
  library_id::text||'/uploads/'||upload_id::text||'/original.webp')),
 CONSTRAINT image_upload_issuances_window CHECK (
  isfinite(attempted_at) AND isfinite(sign_before) AND isfinite(reservation_expires_at)
  AND sign_before>attempted_at AND sign_before<=attempted_at+interval '10 seconds'
  AND reservation_expires_at>sign_before),
 CONSTRAINT image_upload_issuances_observation CHECK (
  (observed_at IS NULL AND token_expires_at IS NULL)
  OR (observed_at IS NOT NULL AND token_expires_at IS NOT NULL
   AND isfinite(observed_at) AND isfinite(token_expires_at)
   AND observed_at>=attempted_at AND token_expires_at>observed_at+interval '60 seconds'
   AND token_expires_at<=attempted_at+interval '2 hours 15 seconds'
   AND token_expires_at<=reservation_expires_at-interval '60 seconds'))
);
CREATE INDEX image_upload_issuances_library_idx ON libri.image_upload_issuances(library_id);
ALTER TABLE libri.image_upload_issuances ENABLE ROW LEVEL SECURITY;
ALTER TABLE libri.image_upload_issuances FORCE ROW LEVEL SECURITY;
REVOKE ALL ON libri.image_upload_issuances FROM PUBLIC,anon,authenticated,libri_worker,libri_frontend_reader,service_role;
GRANT SELECT,INSERT ON libri.image_upload_issuances TO service_role;
GRANT UPDATE(observed_at,token_expires_at) ON libri.image_upload_issuances TO service_role;

CREATE FUNCTION libri.begin_image_upload_issuance(
 p_library_id uuid,p_upload_id uuid,p_requested_by uuid,p_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog, libri SET lock_timeout = '2s' SET statement_timeout = '5s'
AS $function$
DECLARE
 item libri.image_upload_intents;
 issuance libri.image_upload_issuances;
 member_role text;
 enabled boolean;
 stamp timestamptz;
BEGIN
 IF p_library_id IS NULL OR p_upload_id IS NULL OR p_requested_by IS NULL OR p_request_id IS NULL THEN
  RAISE EXCEPTION 'Invalid issuance identity' USING ERRCODE='22023';
 END IF;
 -- Only the trusted broker supplies the requester after verified Auth identity.
 -- Same lock order as admission. No transaction spans the Storage request.
 SELECT role INTO member_role FROM libri.library_members
  WHERE library_id=p_library_id AND user_id=p_requested_by FOR SHARE;
 IF member_role IS NULL OR member_role NOT IN ('owner','editor') THEN RETURN NULL; END IF;
 SELECT admission_enabled INTO enabled FROM libri.image_upload_controls
  WHERE library_id=p_library_id FOR UPDATE;
 IF enabled IS DISTINCT FROM true THEN RETURN NULL; END IF;
 SELECT * INTO item FROM libri.image_upload_intents
  WHERE library_id=p_library_id AND id=p_upload_id AND requested_by=p_requested_by FOR UPDATE;
 stamp:=clock_timestamp();
 IF item.id IS NULL OR item.status<>'reserved' OR item.submitted_at IS NOT NULL
  OR item.signing_deadline<=stamp+interval '30 seconds'
  OR EXISTS(SELECT 1 FROM libri.image_upload_retirements WHERE upload_id=p_upload_id) THEN RETURN NULL; END IF;
 INSERT INTO libri.image_upload_issuances(upload_id,library_id,request_id,object_path,
  attempted_at,sign_before,reservation_expires_at)
 VALUES(item.id,item.library_id,p_request_id,item.object_path,stamp,
  least(stamp+interval '10 seconds',item.signing_deadline-interval '30 seconds'),item.expires_at)
 ON CONFLICT DO NOTHING RETURNING * INTO issuance;
 -- A replay, including the exact request UUID, never grants another provider call.
 IF issuance.upload_id IS NULL THEN RETURN NULL; END IF;
 RETURN jsonb_build_object('upload_id',issuance.upload_id,'library_id',issuance.library_id,
  'request_id',issuance.request_id,'object_path',issuance.object_path,'attempted_at',issuance.attempted_at,
  'sign_before',issuance.sign_before,'reservation_expires_at',issuance.reservation_expires_at);
END;
$function$;

CREATE FUNCTION libri.observe_image_upload_issuance(
 p_library_id uuid,p_upload_id uuid,p_request_id uuid,p_token_expires_at timestamptz)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog, libri SET lock_timeout = '2s' SET statement_timeout = '5s'
AS $function$
DECLARE issuance libri.image_upload_issuances; stamp timestamptz;
BEGIN
 IF p_library_id IS NULL OR p_upload_id IS NULL OR p_request_id IS NULL
  OR p_token_expires_at IS NULL OR NOT isfinite(p_token_expires_at) THEN
  RAISE EXCEPTION 'Invalid issuance observation' USING ERRCODE='22023';
 END IF;
 SELECT * INTO issuance FROM libri.image_upload_issuances
  WHERE library_id=p_library_id AND upload_id=p_upload_id AND request_id=p_request_id FOR UPDATE;
 IF issuance.upload_id IS NULL THEN RETURN false; END IF;
 IF issuance.observed_at IS NOT NULL THEN RETURN issuance.token_expires_at=p_token_expires_at; END IF;
 stamp:=clock_timestamp();
 IF p_token_expires_at<=stamp+interval '60 seconds'
  OR p_token_expires_at>issuance.attempted_at+interval '2 hours 15 seconds'
  OR p_token_expires_at>issuance.reservation_expires_at-interval '60 seconds' THEN RETURN false; END IF;
 -- Evidence only, even after revocation/retirement; never permission to deliver a
 -- token, resign, release quota, delete identities or infer browser delivery.
 UPDATE libri.image_upload_issuances SET observed_at=stamp,token_expires_at=p_token_expires_at
  WHERE upload_id=issuance.upload_id;
 RETURN true;
END;
$function$;
REVOKE ALL ON FUNCTION libri.begin_image_upload_issuance(uuid,uuid,uuid,uuid)
 FROM PUBLIC,anon,authenticated,libri_worker,libri_frontend_reader;
REVOKE ALL ON FUNCTION libri.observe_image_upload_issuance(uuid,uuid,uuid,timestamptz)
 FROM PUBLIC,anon,authenticated,libri_worker,libri_frontend_reader;
GRANT EXECUTE ON FUNCTION libri.begin_image_upload_issuance(uuid,uuid,uuid,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION libri.observe_image_upload_issuance(uuid,uuid,uuid,timestamptz) TO service_role;
NOTIFY pgrst, 'reload schema';
RESET statement_timeout;
RESET lock_timeout;
