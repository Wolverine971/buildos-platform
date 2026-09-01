-- PSQL-ONLY / DISPOSABLE DATABASE ONLY. Never run against a linked database.

\set ON_ERROR_STOP on
\ir fixtures/libri_provider_cost_ledger_base.sql

SELECT md5(string_agg(signature, E'\n' ORDER BY signature)) AS queue_catalog_before
FROM (
	SELECT
		'column|' || ordinal_position || '|' || column_name || '|' || data_type || '|' ||
		is_nullable || '|' || coalesce(column_default, '') AS signature
	FROM information_schema.columns
	WHERE table_schema = 'public' AND table_name = 'queue_jobs'
) AS signatures
\gset

\ir ../migrations/20260901055654_libri_provider_cost_reservation_step_index.sql

CREATE FUNCTION pg_temp.assert_true(p_condition boolean, p_message text)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
	IF COALESCE(p_condition, false) IS NOT TRUE THEN
		RAISE EXCEPTION 'assertion failed: %', p_message;
	END IF;
END;
$$;

SELECT pg_temp.assert_true(
	pg_get_indexdef('libri.provider_cost_reservations_step_fk_idx'::regclass) =
		'CREATE INDEX provider_cost_reservations_step_fk_idx ON libri.provider_cost_reservations USING btree (library_id, run_id, step_id)',
	'provider-cost step foreign key must have the exact covering index'
);
SELECT pg_temp.assert_true(
	(
		SELECT count(*) = 1
		FROM pg_index
		WHERE indrelid = 'libri.provider_cost_reservations'::regclass
			AND indexrelid = 'libri.provider_cost_reservations_step_fk_idx'::regclass
			AND indisvalid
			AND indisready
	),
	'provider-cost step foreign-key index must be valid and ready'
);
SELECT pg_temp.assert_true(
	(
		SELECT md5(string_agg(signature, E'\n' ORDER BY signature))
		FROM (
			SELECT
				'column|' || ordinal_position || '|' || column_name || '|' || data_type || '|' ||
				is_nullable || '|' || coalesce(column_default, '') AS signature
			FROM information_schema.columns
			WHERE table_schema = 'public' AND table_name = 'queue_jobs'
		) AS signatures
	) = :'queue_catalog_before',
	'Libri-only index migration must preserve the shared queue catalog'
);
