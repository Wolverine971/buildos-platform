-- Read-only structural verification. Safe for the hosted project after migration.
DO $verify$
BEGIN
 IF EXISTS(SELECT 1 FROM unnest(ARRAY['anon','authenticated','libri_worker','libri_frontend_reader']) role_name
  WHERE has_function_privilege(role_name,'libri.release_unissued_image_upload_slot(uuid,uuid)','EXECUTE')) THEN
  RAISE EXCEPTION 'Unexpected quota settlement execution authority';
 END IF;
 IF NOT has_function_privilege('service_role','libri.release_unissued_image_upload_slot(uuid,uuid)','EXECUTE')
  OR NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid='libri.release_unissued_image_upload_slot(uuid,uuid)'::regprocedure
   AND NOT prosecdef AND proconfig @> ARRAY['search_path=pg_catalog, libri','lock_timeout=2s','statement_timeout=5s']) THEN
  RAISE EXCEPTION 'Quota settlement must be a bounded service invoker';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_attribute a JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
  WHERE a.attrelid='libri.image_upload_intents'::regclass AND a.attname='quota_policy_version'
  AND a.attnotnull AND pg_get_expr(d.adbin,d.adrelid)='0') THEN
  RAISE EXCEPTION 'Unproven reservations must default to policy 0';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_class WHERE oid='libri.image_upload_intents'::regclass
  AND relrowsecurity AND relforcerowsecurity) THEN RAISE EXCEPTION 'Intent RLS required'; END IF;
END;
$verify$;
