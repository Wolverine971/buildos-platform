-- Read-only linked-schema verification for Gmail relevance Phase A, Slice 3.
-- Safe for the Supabase SQL editor: no fixtures, DDL, role changes, or durable writes.

BEGIN TRANSACTION READ ONLY;

WITH checks (check_name, passed, physical_requirement) AS (
	VALUES
		(
			'observation_table',
			to_regclass('public.email_relevance_message_observations') IS NOT NULL,
			true
		),
		(
			'candidate_table',
			to_regclass('public.email_relevance_project_candidates') IS NOT NULL,
			true
		),
		(
			'connection_cursor_and_counter_columns',
			(
				SELECT count(*) = 8
				FROM pg_attribute
				WHERE attrelid = to_regclass('public.email_relevance_scan_connections')
					AND attnum > 0
					AND NOT attisdropped
					AND attname IN (
						'cursor_envelope', 'cursor_key_version',
						'pending_cursor_envelope', 'pending_cursor_key_version',
						'pending_page_is_final', 'list_pages_completed',
						'observations_discovered', 'observations_processed'
					)
			),
			true
		),
		(
			'database_priced_operation_codes',
			EXISTS (
				SELECT 1
				FROM pg_constraint
				WHERE conrelid = to_regclass('public.email_relevance_scan_reservations')
					AND conname = 'email_relevance_scan_reservations_operation_code_check'
					AND pg_get_constraintdef(oid) LIKE '%list_page%'
					AND pg_get_constraintdef(oid) LIKE '%metadata_batch%'
			),
			true
		),
		(
			'claim_operation_rpc',
			to_regprocedure(
				'public.claim_email_relevance_scan_operation(uuid,uuid,uuid,integer,text,text,text,integer)'
			) IS NOT NULL,
			true
		),
		(
			'list_settlement_rpc',
			to_regprocedure(
				'public.settle_email_relevance_list_page(uuid,uuid,uuid,integer,text,uuid,bigint,jsonb,text,integer)'
			) IS NOT NULL,
			true
		),
		(
			'metadata_settlement_rpc',
			to_regprocedure(
				'public.settle_email_relevance_metadata_batch(uuid,uuid,uuid,integer,text,uuid,bigint,jsonb)'
			) IS NOT NULL,
			true
		),
		(
			'failure_settlement_rpc',
			to_regprocedure(
				'public.settle_email_relevance_operation_failure(uuid,uuid,uuid,integer,text,uuid,integer,bigint,text)'
			) IS NOT NULL,
			true
		),
		(
			'retention_rpc',
			to_regprocedure('public.purge_expired_email_relevance_metadata(integer)') IS NOT NULL,
			true
		),
		(
			'row_level_security_enabled',
			(
				SELECT count(*) = 2 AND bool_and(relrowsecurity)
				FROM pg_class
				WHERE oid IN (
					to_regclass('public.email_relevance_message_observations'),
					to_regclass('public.email_relevance_project_candidates')
				)
			),
			true
		),
		(
			'authenticated_cannot_read_provider_ciphertext',
			NOT COALESCE(
				has_column_privilege(
					'authenticated',
					to_regclass('public.email_relevance_message_observations'),
					'provider_message_id_ciphertext',
					'SELECT'
				),
				false
			),
			true
		),
		(
			'service_role_can_claim',
			COALESCE(
				has_function_privilege(
					'service_role',
					to_regprocedure(
						'public.claim_email_relevance_scan_operation(uuid,uuid,uuid,integer,text,text,text,integer)'
					),
					'EXECUTE'
				),
				false
			),
			true
		),
		(
			'disconnect_cleanup_trigger',
			EXISTS (
				SELECT 1
				FROM pg_trigger
				WHERE tgrelid = to_regclass('public.user_email_connections')
					AND tgname = 'handle_email_relevance_connection_unavailable_trigger'
					AND NOT tgisinternal
			),
			true
		),
		(
			'no_restricted_durable_columns',
			NOT EXISTS (
				SELECT 1
				FROM pg_attribute
				WHERE attrelid IN (
					to_regclass('public.email_relevance_message_observations'),
					to_regclass('public.email_relevance_project_candidates')
				)
					AND attnum > 0
					AND NOT attisdropped
					AND attname ~* '^(subject|snippet|participant|raw_header|raw_label|gmail_query|gmail_url|metadata|context|error_message)$'
			),
			true
		)
), report AS (
	SELECT check_name, passed, physical_requirement
	FROM checks
	UNION ALL
	SELECT 'physical_installation_complete', bool_and(passed), false
	FROM checks
	WHERE physical_requirement
)
SELECT check_name, CASE WHEN passed THEN 'ok' ELSE 'missing_or_incorrect' END AS status
FROM report
ORDER BY CASE WHEN check_name = 'physical_installation_complete' THEN 1 ELSE 0 END, check_name;

COMMIT;
