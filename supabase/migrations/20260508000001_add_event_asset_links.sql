-- supabase/migrations/20260508000001_add_event_asset_links.sql
-- Allow ontology image assets to attach directly to calendar/event entities.

DO $$
DECLARE
	constraint_name text;
BEGIN
	FOR constraint_name IN
		SELECT c.conname
		FROM pg_constraint c
		WHERE c.conrelid = 'public.onto_asset_links'::regclass
			AND c.contype = 'c'
			AND pg_get_constraintdef(c.oid) ILIKE '%entity_kind%'
	LOOP
		EXECUTE format(
			'ALTER TABLE public.onto_asset_links DROP CONSTRAINT IF EXISTS %I',
			constraint_name
		);
	END LOOP;
END $$;

ALTER TABLE public.onto_asset_links
	ADD CONSTRAINT onto_asset_links_entity_kind_check
	CHECK (
		entity_kind IN (
			'project',
			'task',
			'document',
			'plan',
			'goal',
			'risk',
			'milestone',
			'event'
		)
	);
