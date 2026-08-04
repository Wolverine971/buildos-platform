-- supabase/migrations/20260804020100_native_search_evidence_receipt_format.sql
-- Include the stored representation in immutable evidence receipts so cache
-- hits preserve whether the version contains Markdown or normalized text.

begin;

create or replace function public.get_current_web_page_evidence(
	p_web_page_visit_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public
as $function$
	select jsonb_build_object(
		'page_visit_id', visit.id,
		'page_version_id', version.id,
		'version_number', version.version_number,
		'content_hash', version.content_hash,
		'content_length', char_length(version.content),
		'content_format', version.content_format,
		'fetched_at', version.fetched_at,
		'extraction_method', version.extraction_method,
		'extraction_version', version.extraction_version,
		'chunks', coalesce(
			(
				select jsonb_agg(
					jsonb_build_object(
						'id', chunk.id,
						'chunk_index', chunk.chunk_index,
						'start_offset', chunk.start_offset,
						'end_offset', chunk.end_offset,
						'selector', chunk.selector,
						'content_hash', chunk.content_hash
					)
					order by chunk.chunk_index
				)
				from public.web_page_evidence_chunks chunk
				where chunk.page_version_id = version.id
			),
			'[]'::jsonb
		)
	)
	from public.web_page_visits visit
	join public.web_page_versions version on version.id = visit.current_version_id
	where visit.id = p_web_page_visit_id;
$function$;

revoke all on function public.get_current_web_page_evidence(uuid)
	from public, anon, authenticated;
grant execute on function public.get_current_web_page_evidence(uuid) to service_role;

commit;
