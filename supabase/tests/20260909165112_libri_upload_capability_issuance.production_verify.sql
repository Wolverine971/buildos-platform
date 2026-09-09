-- Read-only receipt. Never calls issuance RPCs, signs tokens or enables uploads.
BEGIN READ ONLY;
SET LOCAL statement_timeout='15s';
WITH routines AS (
 SELECT oid,proname,prosecdef,proconfig,proowner,proacl,md5(prosrc) AS body_md5 FROM pg_proc
 WHERE pronamespace='libri'::regnamespace AND proname IN ('begin_image_upload_issuance','observe_image_upload_issuance')
), relation AS (
 SELECT oid,relrowsecurity,relforcerowsecurity FROM pg_class WHERE oid='libri.image_upload_issuances'::regclass
)
SELECT jsonb_build_object(
 'checked_at',clock_timestamp(),
 'table',(SELECT jsonb_build_object('rls_enabled',relrowsecurity,'rls_forced',relforcerowsecurity,
  'policies',(SELECT count(*) FROM pg_policies WHERE schemaname='libri' AND tablename='image_upload_issuances')) FROM relation),
 'routines',(SELECT jsonb_agg(jsonb_build_object('name',proname,'body_md5',body_md5,'security_definer',prosecdef,'configuration',proconfig,
  'public_execute',EXISTS(SELECT 1 FROM aclexplode(coalesce(proacl,acldefault('f',proowner))) a WHERE a.grantee=0 AND a.privilege_type='EXECUTE')) ORDER BY proname) FROM routines),
 'roles',(SELECT jsonb_agg(jsonb_build_object('role',role_name,
  'routine_access',(SELECT jsonb_object_agg(proname,has_function_privilege(role_name,oid,'EXECUTE')) FROM routines),
  'table_access',(SELECT jsonb_build_object('select',has_table_privilege(role_name,oid,'SELECT'),
   'insert',has_table_privilege(role_name,oid,'INSERT'),'table_update',has_table_privilege(role_name,oid,'UPDATE'),
   'delete_truncate',has_table_privilege(role_name,oid,'DELETE,TRUNCATE'),
   'updatable_columns',(SELECT coalesce(jsonb_agg(a.attname ORDER BY a.attnum),'[]'::jsonb) FROM pg_attribute a
    WHERE a.attrelid=relation.oid AND a.attnum>0 AND NOT a.attisdropped AND has_column_privilege(role_name,relation.oid,a.attnum,'UPDATE'))) FROM relation)))
  FROM unnest(ARRAY['anon','authenticated','libri_worker','libri_frontend_reader','service_role']) role_name),
 'issuances',(SELECT jsonb_build_object('total',count(*),'observed',count(*) FILTER(WHERE observed_at IS NOT NULL)) FROM libri.image_upload_issuances),
 'controls',(SELECT jsonb_build_object('rows',count(*),'admission_enabled',count(*) FILTER(WHERE admission_enabled),
  'processing_enabled',count(*) FILTER(WHERE processing_enabled),'cleanup_enabled',count(*) FILTER(WHERE cleanup_enabled)) FROM libri.image_upload_controls),
 'canonical_images',(SELECT count(*) FROM libri.images),
 'private_objects',(SELECT count(*) FROM storage.objects WHERE bucket_id='libri-assets'),
 'bucket_public',(SELECT public FROM storage.buckets WHERE id='libri-assets')
) AS upload_issuance_deployment;
ROLLBACK;
