-- Read-only post-deployment receipt. No fixtures, retirement calls, Storage mutations or flags.
-- Pair with Libri's check-upload-schema-boundary.sql and publication deployment receipt.
BEGIN READ ONLY;
SET LOCAL statement_timeout='15s';
WITH routines AS (
 SELECT oid,proname,prosecdef,proconfig,proowner,proacl FROM pg_proc
 WHERE pronamespace='libri'::regnamespace AND proname IN ('retire_image_upload','list_image_upload_retirement_candidates')
), relations AS (
 SELECT oid,relname,relrowsecurity,relforcerowsecurity FROM pg_class
 WHERE oid IN ('libri.image_upload_retirements'::regclass,'libri.image_upload_cleanup_targets'::regclass)
)
SELECT jsonb_build_object(
 'checked_at',clock_timestamp(),
 'tables',(SELECT jsonb_agg(jsonb_build_object('name',relname,'rls_enabled',relrowsecurity,'rls_forced',relforcerowsecurity,
  'policies',(SELECT count(*) FROM pg_policies WHERE schemaname='libri' AND tablename=relname)) ORDER BY relname) FROM relations),
 'routines',(SELECT jsonb_agg(jsonb_build_object('name',proname,'security_definer',prosecdef,'configuration',proconfig,
  'public_execute',EXISTS(SELECT 1 FROM aclexplode(coalesce(proacl,acldefault('f',proowner))) acl WHERE acl.grantee=0 AND acl.privilege_type='EXECUTE')) ORDER BY proname) FROM routines),
 'roles',(SELECT jsonb_agg(jsonb_build_object('role',role_name,
  'routine_access',(SELECT jsonb_object_agg(proname,has_function_privilege(role_name,oid,'EXECUTE')) FROM routines),
  'tables',(SELECT jsonb_object_agg(relname,jsonb_build_object('select',has_table_privilege(role_name,oid,'SELECT'),
   'insert',has_table_privilege(role_name,oid,'INSERT'),'update_delete_truncate',has_table_privilege(role_name,oid,'UPDATE,DELETE,TRUNCATE'))) FROM relations)))
  FROM unnest(ARRAY['anon','authenticated','libri_worker','libri_frontend_reader','service_role']) role_name),
 'retirements',(SELECT count(*) FROM libri.image_upload_retirements),
 'targets',(SELECT count(*) FROM libri.image_upload_cleanup_targets),
 'canonical_target_collisions',(SELECT count(*) FROM libri.image_upload_cleanup_targets t JOIN libri.images i
  ON i.bucket_id='libri-assets' AND i.object_path=t.object_path),
 'intent_statuses',(SELECT coalesce(jsonb_object_agg(status,n),'{}'::jsonb) FROM (SELECT status,count(*) n FROM libri.image_upload_intents GROUP BY status) counts),
 'quota_accounts_for_cleanup',(SELECT position('''cleanup_pending''' IN prosrc)>0 FROM pg_proc
  WHERE oid='libri.reserve_image_upload(uuid,uuid,text,jsonb)'::regprocedure),
 'canonical_images',(SELECT count(*) FROM libri.images),
 'private_objects',(SELECT count(*) FROM storage.objects WHERE bucket_id='libri-assets'),
 'bucket_public',(SELECT public FROM storage.buckets WHERE id='libri-assets'),
 'controls',(SELECT jsonb_build_object('rows',count(*),'admission_enabled',count(*) FILTER(WHERE admission_enabled),
  'processing_enabled',count(*) FILTER(WHERE processing_enabled)) FROM libri.image_upload_controls)
) AS upload_retirement_deployment;
ROLLBACK;
