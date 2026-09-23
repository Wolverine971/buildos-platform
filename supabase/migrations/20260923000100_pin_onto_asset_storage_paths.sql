-- supabase/migrations/20260923000100_pin_onto_asset_storage_paths.sql
--
-- onto_assets RLS only checks project write access, so a project writer could insert or
-- update a row whose storage_bucket/storage_path points at another project's object. The
-- render and complete routes, the OCR worker, and account deletion all act on those columns
-- with the service-role client: signing a download URL, reading the image into the caller's
-- row, or deleting the object.
--
-- Every writer builds `projects/<project_id>/assets/<asset_id>/original.<ext>` in the
-- onto-assets bucket. Enforce that shape for every role and make the location immutable.

CREATE OR REPLACE FUNCTION public.enforce_onto_asset_storage_location()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
	IF TG_OP = 'UPDATE' AND (
		NEW.storage_bucket IS DISTINCT FROM OLD.storage_bucket
		OR NEW.storage_path IS DISTINCT FROM OLD.storage_path
		OR NEW.project_id IS DISTINCT FROM OLD.project_id
	) THEN
		RAISE EXCEPTION 'onto_assets storage location and project are immutable'
			USING ERRCODE = '42501';
	END IF;

	IF NEW.storage_bucket IS DISTINCT FROM 'onto-assets'
		OR NEW.storage_path IS NULL
		OR left(NEW.storage_path, length('projects/' || NEW.project_id || '/assets/' || NEW.id || '/'))
			<> 'projects/' || NEW.project_id || '/assets/' || NEW.id || '/'
		OR position('..' IN NEW.storage_path) > 0
	THEN
		RAISE EXCEPTION 'onto_assets storage_path must live under projects/<project_id>/assets/<asset_id>/ in onto-assets'
			USING ERRCODE = '42501';
	END IF;

	RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_onto_asset_storage_location() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_onto_assets_storage_location ON public.onto_assets;
CREATE TRIGGER trg_onto_assets_storage_location
	BEFORE INSERT OR UPDATE ON public.onto_assets
	FOR EACH ROW
	EXECUTE FUNCTION public.enforce_onto_asset_storage_location();
