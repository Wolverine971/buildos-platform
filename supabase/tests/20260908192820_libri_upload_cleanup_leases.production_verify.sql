-- Read-only deployment receipt. No fixture writes, cleanup calls, activation or Storage mutation.
BEGIN READ ONLY;
SET LOCAL statement_timeout='15s';
WITH routines AS (
 SELECT oid,proname,prosecdef,proconfig,proowner,proacl FROM pg_proc
 WHERE pronamespace='libri'::regnamespace AND proname IN ('lock_image_upload_cleanup','list_image_upload_cleanup_candidates',
  'claim_image_upload_cleanup','authorize_image_upload_cleanup','finish_image_upload_cleanup')
), relation AS (
 SELECT oid,relname,relrowsecurity,relforcerowsecurity FROM pg_class WHERE oid='libri.image_upload_cleanup_checks'::regclass
)
SELECT jsonb_build_object(
 'checked_at',clock_timestamp(),
 'table',(SELECT jsonb_build_object('rls_enabled',relrowsecurity,'rls_forced',relforcerowsecurity,
  'policies',(SELECT count(*) FROM pg_policies WHERE schemaname='libri' AND tablename=relname)) FROM relation),
 'routines',(SELECT jsonb_agg(jsonb_build_object('name',proname,'security_definer',prosecdef,'configuration',proconfig,
  'public_execute',EXISTS(SELECT 1 FROM aclexplode(coalesce(proacl,acldefault('f',proowner))) acl WHERE acl.grantee=0 AND acl.privilege_type='EXECUTE')) ORDER BY proname) FROM routines),
 'roles',(SELECT jsonb_agg(jsonb_build_object('role',role_name,
  'routine_access',(SELECT jsonb_object_agg(proname,has_function_privilege(role_name,oid,'EXECUTE')) FROM routines),
  'table_access',(SELECT jsonb_build_object('select',has_table_privilege(role_name,oid,'SELECT'),'insert',has_table_privilege(role_name,oid,'INSERT'),
   'update',has_table_privilege(role_name,oid,'UPDATE'),'delete_truncate',has_table_privilege(role_name,oid,'DELETE,TRUNCATE')) FROM relation)))
  FROM unnest(ARRAY['anon','authenticated','libri_worker','libri_frontend_reader','service_role']) role_name),
 'cleanup_default',(SELECT column_default FROM information_schema.columns WHERE table_schema='libri' AND table_name='image_upload_controls' AND column_name='cleanup_enabled'),
 'controls',(SELECT jsonb_build_object('rows',count(*),'admission_enabled',count(*) FILTER(WHERE admission_enabled),
  'processing_enabled',count(*) FILTER(WHERE processing_enabled),'cleanup_enabled',count(*) FILTER(WHERE cleanup_enabled)) FROM libri.image_upload_controls),
 'checks',(SELECT coalesce(jsonb_object_agg(status,n),'{}'::jsonb) FROM (SELECT status,count(*) n FROM libri.image_upload_cleanup_checks GROUP BY status) counts),
 'retirements',(SELECT count(*) FROM libri.image_upload_retirements),
 'targets',(SELECT count(*) FROM libri.image_upload_cleanup_targets),
 'canonical_target_collisions',(SELECT count(*) FROM libri.image_upload_cleanup_targets t JOIN libri.images i ON i.bucket_id='libri-assets' AND i.object_path=t.object_path),
 'canonical_images',(SELECT count(*) FROM libri.images),
 'private_objects',(SELECT count(*) FROM storage.objects WHERE bucket_id='libri-assets'),
 'bucket_public',(SELECT public FROM storage.buckets WHERE id='libri-assets')
) AS upload_cleanup_deployment;
ROLLBACK;
