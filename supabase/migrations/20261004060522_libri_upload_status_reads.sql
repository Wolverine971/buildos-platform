-- libri-migration: true
-- libri-allow-security-definer: read_image_upload_status
-- Caller-owned, bounded progress projection. No raw publication/lease grants or writes.
SET lock_timeout='5s';
SET statement_timeout='60s';
CREATE FUNCTION libri.read_image_upload_status(p_library_id uuid,p_upload_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=pg_catalog,libri SET statement_timeout='5s'
AS $function$
DECLARE
 caller uuid:=auth.uid();
 item libri.image_upload_intents;
 work libri.image_upload_processing;
 publication libri.image_upload_publications;
 image libri.images;
 phase text;
 prepared boolean;
BEGIN
 IF caller IS NULL OR NOT EXISTS(SELECT 1 FROM libri.library_members WHERE library_id=p_library_id AND user_id=caller AND role IN ('owner','editor')) THEN
  RAISE EXCEPTION 'Library editor required' USING ERRCODE='42501'; END IF;
 IF p_upload_id IS NULL THEN RAISE EXCEPTION 'Upload reference required' USING ERRCODE='22023'; END IF;
 SELECT * INTO item FROM libri.image_upload_intents WHERE library_id=p_library_id AND id=p_upload_id AND requested_by=caller;
 IF item.id IS NULL THEN RETURN NULL; END IF;
 SELECT * INTO work FROM libri.image_upload_processing WHERE upload_id=item.id;
 SELECT * INTO publication FROM libri.image_upload_publications
  WHERE upload_id=item.id AND library_id=p_library_id AND book_id=item.book_id AND status='published';
 SELECT EXISTS(SELECT 1 FROM libri.image_upload_publications WHERE upload_id=item.id AND status='prepared') INTO prepared;
 IF publication.id IS NOT NULL THEN
  SELECT * INTO image FROM libri.images WHERE library_id=p_library_id AND book_id=item.book_id AND id=publication.image_id
   AND source_id=publication.source_id AND object_path=publication.object_path;
  phase:=CASE WHEN image.id IS NULL OR image.bucket_id IS DISTINCT FROM 'libri-assets'
   OR work.status IS DISTINCT FROM 'published' OR work.attempt IS DISTINCT FROM publication.attempt
   OR work.lease_token IS DISTINCT FROM publication.lease_token
   THEN 'reconciliation_required' ELSE 'published' END;
 ELSIF prepared THEN
  phase:=CASE WHEN work.status='leased' AND work.lease_expires_at>now() AND EXISTS(
   SELECT 1 FROM libri.image_upload_publications WHERE upload_id=item.id AND status='prepared'
    AND library_id=p_library_id AND book_id=item.book_id AND attempt=work.attempt AND lease_token=work.lease_token
  ) THEN 'publishing' ELSE 'reconciliation_required' END;
 ELSIF work.status='published' THEN phase:='reconciliation_required';
 ELSIF item.status IN ('expired','cleanup_pending') OR item.expires_at<=now() THEN phase:='expired';
 ELSIF item.status='reserved' THEN phase:='reserved';
 ELSIF work.status='blocked' THEN phase:='blocked';
 ELSIF work.status='retry_wait' THEN phase:='retry_wait';
 ELSIF work.status='leased' AND work.lease_expires_at>now() THEN phase:='verifying';
 ELSE phase:='awaiting_verification'; END IF;
 RETURN jsonb_build_object(
  'upload',jsonb_build_object('id',item.id,'library_id',item.library_id,'book_id',item.book_id,'requested_by',item.requested_by,
   'status',item.status,'created_at',item.created_at,'signing_deadline',item.signing_deadline,'expires_at',item.expires_at,'submitted_at',item.submitted_at),
  'progress',jsonb_build_object('phase',phase,'attempt',work.attempt,'failureCode',work.last_failure,
   'imageId',CASE WHEN phase='published' THEN image.id ELSE NULL END,
   'ocrStatus',CASE WHEN phase='published' THEN image.ocr_status ELSE NULL END)
 );
END;
$function$;
REVOKE ALL ON FUNCTION libri.read_image_upload_status(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role,libri_worker,libri_frontend_reader;
GRANT EXECUTE ON FUNCTION libri.read_image_upload_status(uuid,uuid) TO authenticated;
NOTIFY pgrst,'reload schema';
