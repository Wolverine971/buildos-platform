-- supabase/migrations/20260908192820_libri_upload_cleanup_leases.sql
-- libri-migration: true
-- Private cleanup coordination only. No Storage mutation, quota release or activation.
SET lock_timeout='5s';
SET statement_timeout='60s';
ALTER TABLE libri.image_upload_controls ADD COLUMN cleanup_enabled boolean NOT NULL DEFAULT false;
CREATE TABLE libri.image_upload_cleanup_checks (
 target_id uuid PRIMARY KEY REFERENCES libri.image_upload_cleanup_targets(id) ON DELETE RESTRICT,
 library_id uuid NOT NULL REFERENCES libri.libraries(id) ON DELETE RESTRICT,
 generation integer NOT NULL CHECK(generation BETWEEN 1 AND 1000000),
 lease_token uuid NOT NULL,
 lease_expires_at timestamptz NOT NULL,
 status text NOT NULL CHECK(status IN ('leased','absent','retry_wait')),
 next_check_at timestamptz NOT NULL,
 last_outcome text CHECK(last_outcome IN ('absent','unavailable')),
 observed_at timestamptz,
 CONSTRAINT image_upload_cleanup_checks_receipt CHECK(
  (status='leased' AND last_outcome IS NULL AND observed_at IS NULL)
  OR (status='absent' AND last_outcome IS NOT DISTINCT FROM 'absent' AND observed_at IS NOT NULL)
  OR (status='retry_wait' AND last_outcome IS NOT DISTINCT FROM 'unavailable' AND observed_at IS NOT NULL))
);
CREATE INDEX image_upload_cleanup_checks_due_idx ON libri.image_upload_cleanup_checks(library_id,next_check_at,target_id);
CREATE INDEX image_upload_cleanup_checks_active_idx ON libri.image_upload_cleanup_checks(library_id,lease_expires_at) WHERE status='leased';
ALTER TABLE libri.image_upload_cleanup_checks ENABLE ROW LEVEL SECURITY;
ALTER TABLE libri.image_upload_cleanup_checks FORCE ROW LEVEL SECURITY;
REVOKE ALL ON libri.image_upload_cleanup_checks FROM PUBLIC,anon,authenticated,libri_worker,libri_frontend_reader,service_role;
GRANT SELECT,INSERT,UPDATE ON libri.image_upload_cleanup_checks TO service_role;

-- Short common ownership lock, never held across a Storage request. Immutable target
-- records alone are not authority: reject published paths and future canonical adoption.
CREATE FUNCTION libri.lock_image_upload_cleanup(p_library_id uuid,p_target_id uuid)
RETURNS libri.image_upload_cleanup_targets LANGUAGE plpgsql SECURITY INVOKER
SET search_path=pg_catalog, libri SET lock_timeout='2s' SET statement_timeout='5s'
AS $function$
DECLARE
 target libri.image_upload_cleanup_targets;
 item libri.image_upload_intents;
 retirement libri.image_upload_retirements;
 enabled boolean;
BEGIN
 IF p_library_id IS NULL OR p_target_id IS NULL THEN RAISE EXCEPTION 'Invalid cleanup identity' USING ERRCODE='22023'; END IF;
 SELECT * INTO target FROM libri.image_upload_cleanup_targets WHERE id=p_target_id AND library_id=p_library_id;
 IF target.id IS NULL THEN RETURN NULL; END IF;
 SELECT cleanup_enabled INTO enabled FROM libri.image_upload_controls WHERE library_id=p_library_id FOR UPDATE;
 IF enabled IS DISTINCT FROM true THEN RETURN NULL; END IF;
 SELECT * INTO item FROM libri.image_upload_intents WHERE id=target.upload_id AND library_id=p_library_id FOR UPDATE;
 IF item.id IS NULL OR item.status<>'cleanup_pending' THEN RETURN NULL; END IF;
 SELECT * INTO retirement FROM libri.image_upload_retirements WHERE upload_id=item.id AND library_id=p_library_id;
 IF retirement.upload_id IS NULL OR retirement.inspect_after>clock_timestamp() THEN RETURN NULL; END IF;
 IF EXISTS(SELECT 1 FROM libri.images WHERE bucket_id='libri-assets' AND object_path=target.object_path) THEN RETURN NULL; END IF;
 IF target.kind='staging' THEN
  IF target.publication_id IS NOT NULL OR target.object_path<>item.object_path THEN RETURN NULL; END IF;
 ELSE
  IF target.publication_id IS NOT DISTINCT FROM retirement.protected_publication_id
   OR NOT EXISTS(SELECT 1 FROM libri.image_upload_publications publication
    WHERE publication.id=target.publication_id AND publication.upload_id=item.id
     AND publication.library_id=p_library_id AND publication.book_id=item.book_id
     AND publication.object_path=target.object_path AND publication.status='prepared')
   OR EXISTS(SELECT 1 FROM libri.images WHERE id=target.publication_id)
   OR EXISTS(SELECT 1 FROM libri.sources WHERE id=target.publication_id) THEN RETURN NULL; END IF;
 END IF;
 RETURN target;
END;
$function$;

CREATE FUNCTION libri.list_image_upload_cleanup_candidates(p_library_id uuid)
RETURNS TABLE(target_id uuid) LANGUAGE sql STABLE SECURITY INVOKER
SET search_path=pg_catalog, libri SET lock_timeout='2s' SET statement_timeout='5s'
AS $function$
 SELECT target.id FROM libri.image_upload_cleanup_targets target
 JOIN libri.image_upload_retirements retirement ON retirement.upload_id=target.upload_id AND retirement.library_id=target.library_id
 JOIN libri.image_upload_controls control ON control.library_id=target.library_id AND control.cleanup_enabled
 LEFT JOIN libri.image_upload_cleanup_checks work ON work.target_id=target.id
 WHERE target.library_id=p_library_id AND retirement.inspect_after<=now()
 AND (work.target_id IS NULL OR (work.status='leased' AND work.lease_expires_at<=now())
  OR (work.status<>'leased' AND work.next_check_at<=now()))
 ORDER BY coalesce(work.next_check_at,retirement.inspect_after),target.id LIMIT 10
$function$;

CREATE FUNCTION libri.claim_image_upload_cleanup(p_library_id uuid,p_target_id uuid,p_lease_token uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER
SET search_path=pg_catalog, libri SET lock_timeout='2s' SET statement_timeout='5s'
AS $function$
DECLARE
 target libri.image_upload_cleanup_targets;
 work libri.image_upload_cleanup_checks;
 stamp timestamptz;
BEGIN
 IF p_lease_token IS NULL THEN RAISE EXCEPTION 'Invalid cleanup token' USING ERRCODE='22023'; END IF;
 target:=libri.lock_image_upload_cleanup(p_library_id,p_target_id);
 IF target.id IS NULL THEN RETURN NULL; END IF;
 SELECT * INTO work FROM libri.image_upload_cleanup_checks WHERE target_id=target.id FOR UPDATE;
 stamp:=clock_timestamp();
 IF work.target_id IS NOT NULL AND work.library_id<>p_library_id THEN RETURN NULL; END IF;
 IF work.target_id IS NOT NULL AND work.lease_token=p_lease_token THEN
  IF work.status<>'leased' OR work.lease_expires_at<=stamp THEN RETURN NULL; END IF;
 ELSE
  IF work.target_id IS NOT NULL AND ((work.status='leased' AND work.lease_expires_at>stamp)
   OR (work.status<>'leased' AND work.next_check_at>stamp)) THEN RETURN NULL; END IF;
  IF EXISTS(SELECT 1 FROM libri.image_upload_cleanup_checks WHERE library_id=p_library_id
   AND status='leased' AND lease_expires_at>stamp AND target_id<>target.id) THEN RETURN NULL; END IF;
  IF work.target_id IS NULL THEN
   INSERT INTO libri.image_upload_cleanup_checks(target_id,library_id,generation,lease_token,lease_expires_at,status,next_check_at)
   VALUES(target.id,p_library_id,1,p_lease_token,stamp+interval '60 seconds','leased',stamp)
   RETURNING * INTO work;
  ELSE
   UPDATE libri.image_upload_cleanup_checks SET generation=work.generation+1,lease_token=p_lease_token,
    lease_expires_at=stamp+interval '60 seconds',status='leased',next_check_at=stamp,last_outcome=NULL,observed_at=NULL
   WHERE target_id=target.id RETURNING * INTO work;
  END IF;
 END IF;
 RETURN jsonb_build_object('target_id',target.id,'library_id',target.library_id,'upload_id',target.upload_id,
  'publication_id',target.publication_id,'kind',target.kind,'bucket_id','libri-assets','object_path',target.object_path,
  'lease_token',work.lease_token,'generation',work.generation,'lease_expires_at',work.lease_expires_at);
END;
$function$;

CREATE FUNCTION libri.authorize_image_upload_cleanup(p_library_id uuid,p_target_id uuid,p_lease_token uuid,p_generation integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER
SET search_path=pg_catalog, libri SET lock_timeout='2s' SET statement_timeout='5s'
AS $function$
DECLARE target libri.image_upload_cleanup_targets; work libri.image_upload_cleanup_checks;
BEGIN
 IF p_lease_token IS NULL OR p_generation IS NULL OR p_generation NOT BETWEEN 1 AND 1000000 THEN
  RAISE EXCEPTION 'Invalid cleanup fence' USING ERRCODE='22023'; END IF;
 target:=libri.lock_image_upload_cleanup(p_library_id,p_target_id);
 IF target.id IS NULL THEN RETURN NULL; END IF;
 SELECT * INTO work FROM libri.image_upload_cleanup_checks WHERE target_id=target.id FOR UPDATE;
 IF work.target_id IS NULL OR work.library_id<>p_library_id OR work.lease_token<>p_lease_token
  OR work.generation<>p_generation OR work.status<>'leased' OR work.lease_expires_at<=clock_timestamp() THEN RETURN NULL; END IF;
 RETURN jsonb_build_object('target_id',target.id,'library_id',target.library_id,'upload_id',target.upload_id,
  'publication_id',target.publication_id,'kind',target.kind,'bucket_id','libri-assets','object_path',target.object_path,
  'lease_token',work.lease_token,'generation',work.generation,'lease_expires_at',work.lease_expires_at);
END;
$function$;

-- The service-only caller attests a strict Storage absence response. DELETE success
-- alone is not proof. Preserve targets forever; absent objects are checked again daily.
CREATE FUNCTION libri.finish_image_upload_cleanup(p_library_id uuid,p_target_id uuid,p_lease_token uuid,p_generation integer,p_outcome text)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER
SET search_path=pg_catalog, libri SET lock_timeout='2s' SET statement_timeout='5s'
AS $function$
DECLARE target libri.image_upload_cleanup_targets; work libri.image_upload_cleanup_checks; stamp timestamptz;
BEGIN
 IF p_lease_token IS NULL OR p_generation IS NULL OR p_generation NOT BETWEEN 1 AND 1000000
  OR p_outcome IS NULL OR p_outcome NOT IN ('absent','unavailable') THEN
  RAISE EXCEPTION 'Invalid cleanup receipt' USING ERRCODE='22023'; END IF;
 target:=libri.lock_image_upload_cleanup(p_library_id,p_target_id);
 IF target.id IS NULL THEN RETURN false; END IF;
 SELECT * INTO work FROM libri.image_upload_cleanup_checks WHERE target_id=target.id FOR UPDATE;
 IF work.target_id IS NULL OR work.library_id<>p_library_id OR work.lease_token<>p_lease_token OR work.generation<>p_generation THEN RETURN false; END IF;
 IF work.status<>'leased' THEN RETURN work.last_outcome=p_outcome; END IF;
 stamp:=clock_timestamp();
 IF work.lease_expires_at<=stamp THEN RETURN false; END IF;
 UPDATE libri.image_upload_cleanup_checks SET status=CASE WHEN p_outcome='absent' THEN 'absent' ELSE 'retry_wait' END,
  last_outcome=p_outcome,observed_at=stamp,next_check_at=stamp+CASE WHEN p_outcome='absent' THEN interval '24 hours' ELSE interval '10 minutes' END
 WHERE target_id=target.id;
 RETURN true;
END;
$function$;
REVOKE ALL ON FUNCTION libri.lock_image_upload_cleanup(uuid,uuid) FROM PUBLIC,anon,authenticated,libri_worker,libri_frontend_reader;
REVOKE ALL ON FUNCTION libri.list_image_upload_cleanup_candidates(uuid) FROM PUBLIC,anon,authenticated,libri_worker,libri_frontend_reader;
REVOKE ALL ON FUNCTION libri.claim_image_upload_cleanup(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated,libri_worker,libri_frontend_reader;
REVOKE ALL ON FUNCTION libri.authorize_image_upload_cleanup(uuid,uuid,uuid,integer) FROM PUBLIC,anon,authenticated,libri_worker,libri_frontend_reader;
REVOKE ALL ON FUNCTION libri.finish_image_upload_cleanup(uuid,uuid,uuid,integer,text) FROM PUBLIC,anon,authenticated,libri_worker,libri_frontend_reader;
GRANT EXECUTE ON FUNCTION libri.lock_image_upload_cleanup(uuid,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION libri.list_image_upload_cleanup_candidates(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION libri.claim_image_upload_cleanup(uuid,uuid,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION libri.authorize_image_upload_cleanup(uuid,uuid,uuid,integer) TO service_role;
GRANT EXECUTE ON FUNCTION libri.finish_image_upload_cleanup(uuid,uuid,uuid,integer,text) TO service_role;
NOTIFY pgrst,'reload schema';
RESET statement_timeout;
RESET lock_timeout;
