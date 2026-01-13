-- packages/shared-types/src/functions/upsert_legacy_entity_mapping.sql
-- Source: Supabase pg_get_functiondef

CREATE OR REPLACE FUNCTION public.upsert_legacy_entity_mapping(p_legacy_table text, p_legacy_id uuid, p_onto_table text, p_onto_id uuid, p_metadata jsonb DEFAULT '{}'::jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
	if p_legacy_id is null or p_onto_id is null then
		return;
	end if;

	insert into legacy_entity_mappings (legacy_table, legacy_id, onto_table, onto_id, metadata, migrated_at)
	values (
		p_legacy_table,
		p_legacy_id,
		p_onto_table,
		p_onto_id,
		coalesce(jsonb_strip_nulls(p_metadata), '{}'::jsonb),
		now()
	)
	on conflict (legacy_table, legacy_id) do update
	set
		onto_table = excluded.onto_table,
		onto_id = excluded.onto_id,
		metadata = jsonb_strip_nulls(coalesce(legacy_entity_mappings.metadata, '{}'::jsonb) || excluded.metadata),
		migrated_at = excluded.migrated_at;
end;
$function$
