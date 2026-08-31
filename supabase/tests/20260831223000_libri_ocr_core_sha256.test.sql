-- PSQL-ONLY / DISPOSABLE DATABASE ONLY. Never run against a linked database.

\set ON_ERROR_STOP on
\ir fixtures/libri_ocr_atomic_completion_base.sql

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
	NOT pg_catalog.has_schema_privilege('libri_worker', 'extensions', 'USAGE'),
	'libri_worker must not gain access to the shared extensions schema'
);

SELECT pg_temp.assert_true(
	pg_catalog.has_function_privilege(
		'libri_worker',
		'pg_catalog.sha256(bytea)',
		'EXECUTE'
	),
	'libri_worker must retain access to the core SHA-256 primitive'
);

SELECT pg_temp.assert_true(
	pg_catalog.pg_get_functiondef(
		'libri.enforce_ocr_source_chunk_worker_write()'::regprocedure
	) LIKE '%pg_catalog.sha256(convert_to(NEW.content, ''UTF8''))%'
		AND pg_catalog.pg_get_functiondef(
			'libri.enforce_ocr_source_chunk_worker_write()'::regprocedure
		) NOT LIKE '%extensions.digest%',
	'OCR chunk validation must hash with pg_catalog rather than extensions'
);

SELECT pg_temp.assert_true(
	pg_catalog.pg_get_functiondef(
		'libri.persist_and_settle_ocr_result(uuid,uuid,uuid,integer,uuid,uuid,uuid,text,text,numeric,text,bigint,bigint,bigint,text)'::regprocedure
	) LIKE '%pg_catalog.sha256(convert_to(normalized_text, ''UTF8''))%'
		AND pg_catalog.pg_get_functiondef(
			'libri.persist_and_settle_ocr_result(uuid,uuid,uuid,integer,uuid,uuid,uuid,text,text,numeric,text,bigint,bigint,bigint,text)'::regprocedure
		) NOT LIKE '%extensions.digest%',
	'OCR persistence must hash with pg_catalog rather than extensions'
);

SET ROLE libri_worker;

SELECT pg_temp.assert_true(
	encode(pg_catalog.sha256(convert_to('libri-core-hash', 'UTF8')), 'hex') ~ '^[0-9a-f]{64}$',
	'the restricted role must be able to compute a core SHA-256 hash'
);

RESET ROLE;
