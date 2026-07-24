-- Read-only preflight for the Gmail relevance Slice 4 reconciliation.
SELECT jsonb_build_object(
	'review_sample_count', (SELECT count(*) FROM public.email_relevance_review_samples),
	'adjudication_count', (SELECT count(*) FROM public.email_relevance_adjudications),
	'triggers', (
		SELECT coalesce(jsonb_agg(jsonb_build_object(
			'name', trigger_rows.tgname,
			'definition', trigger_rows.trigger_definition
		) ORDER BY trigger_rows.tgname), '[]'::jsonb)
		FROM (
			SELECT t.tgname, pg_get_triggerdef(t.oid) AS trigger_definition
			FROM pg_trigger t
			WHERE t.tgrelid IN (
				'public.email_relevance_review_samples'::regclass,
				'public.email_relevance_adjudications'::regclass,
				'public.email_relevance_message_observations'::regclass
			)
				AND NOT t.tgisinternal
		) trigger_rows
	),
	'policies', (
		SELECT coalesce(jsonb_agg(jsonb_build_object(
			'name', policyname,
			'command', cmd,
			'roles', roles,
			'using', qual,
			'check', with_check
		) ORDER BY tablename, policyname), '[]'::jsonb)
		FROM pg_policies
		WHERE schemaname = 'public'
			AND tablename IN (
				'email_relevance_review_samples',
				'email_relevance_adjudications'
			)
	),
	'constraints', (
		SELECT coalesce(jsonb_agg(jsonb_build_object(
			'table', constraint_rows.table_name,
			'name', constraint_rows.constraint_name,
			'definition', constraint_rows.definition
		) ORDER BY constraint_rows.table_name, constraint_rows.constraint_name), '[]'::jsonb)
		FROM (
			SELECT
				con.conrelid::regclass::text AS table_name,
				con.conname AS constraint_name,
				pg_get_constraintdef(con.oid) AS definition
			FROM pg_constraint con
			WHERE con.conrelid IN (
				'public.email_relevance_review_samples'::regclass,
				'public.email_relevance_adjudications'::regclass
			)
		) constraint_rows
	)
) AS reconciliation_preflight;
