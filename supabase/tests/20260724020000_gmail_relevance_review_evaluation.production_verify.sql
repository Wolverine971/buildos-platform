-- Read-only linked-schema verification for Gmail relevance Phase A, Slice 4.
-- Safe for the Supabase SQL editor: no fixtures, DDL, role changes, or durable writes.

BEGIN TRANSACTION READ ONLY;

WITH checks (check_name, passed, physical_requirement) AS (
	VALUES
		(
			'review_sample_table',
			to_regclass('public.email_relevance_review_samples') IS NOT NULL,
			true
		),
		(
			'adjudication_table',
			to_regclass('public.email_relevance_adjudications') IS NOT NULL,
			true
		),
		(
			'review_rpcs',
			to_regprocedure(
				'public.prepare_email_relevance_review_sample(uuid,uuid,integer)'
			) IS NOT NULL
			AND to_regprocedure(
				'public.record_email_relevance_adjudication(uuid,uuid,uuid,uuid,text,text,uuid,text,text,text)'
			) IS NOT NULL
			AND to_regprocedure(
				'public.expire_email_relevance_review_samples(uuid,uuid)'
			) IS NOT NULL,
			true
		),
		(
			'row_level_security_enabled',
			(
				SELECT count(*) = 2 AND bool_and(relrowsecurity)
				FROM pg_class
				WHERE oid IN (
					to_regclass('public.email_relevance_review_samples'),
					to_regclass('public.email_relevance_adjudications')
				)
			),
			true
		),
		(
			'authenticated_has_no_direct_table_access',
			NOT COALESCE(
				has_table_privilege(
					'authenticated',
					to_regclass('public.email_relevance_review_samples'),
					'SELECT,INSERT,UPDATE,DELETE'
				),
				false
			)
			AND NOT COALESCE(
				has_table_privilege(
					'authenticated',
					to_regclass('public.email_relevance_adjudications'),
					'SELECT,INSERT,UPDATE,DELETE'
				),
				false
			),
			true
		),
		(
			'authenticated_cannot_execute_review_rpcs',
			NOT COALESCE(
				has_function_privilege(
					'authenticated',
					to_regprocedure(
						'public.prepare_email_relevance_review_sample(uuid,uuid,integer)'
					),
					'EXECUTE'
				),
				false
			)
			AND NOT COALESCE(
				has_function_privilege(
					'authenticated',
					to_regprocedure(
						'public.record_email_relevance_adjudication(uuid,uuid,uuid,uuid,text,text,uuid,text,text,text)'
					),
					'EXECUTE'
				),
				false
			),
			true
		),
		(
			'service_role_can_execute_review_rpcs',
			COALESCE(
				has_function_privilege(
					'service_role',
					to_regprocedure(
						'public.prepare_email_relevance_review_sample(uuid,uuid,integer)'
					),
					'EXECUTE'
				),
				false
			)
			AND COALESCE(
				has_function_privilege(
					'service_role',
					to_regprocedure(
						'public.record_email_relevance_adjudication(uuid,uuid,uuid,uuid,text,text,uuid,text,text,text)'
					),
					'EXECUTE'
				),
				false
			),
			true
		),
		(
			'service_role_cannot_write_review_tables_directly',
			NOT COALESCE(
				has_table_privilege(
					'service_role',
					to_regclass('public.email_relevance_review_samples'),
					'INSERT,UPDATE,DELETE'
				),
				false
			)
			AND NOT COALESCE(
				has_table_privilege(
					'service_role',
					to_regclass('public.email_relevance_adjudications'),
					'INSERT,UPDATE,DELETE'
				),
				false
			),
			true
		),
		(
			'no_restricted_durable_columns',
			NOT EXISTS (
				SELECT 1
				FROM pg_attribute
				WHERE attrelid IN (
					to_regclass('public.email_relevance_review_samples'),
					to_regclass('public.email_relevance_adjudications')
				)
					AND attnum > 0
					AND NOT attisdropped
					AND attname ~* '(subject|snippet|participant|header|body|attachment|provider_message|provider_thread|free_form|reasoning)'
			),
			true
		),
		(
			'opaque_source_references_do_not_block_retention',
			NOT EXISTS (
				SELECT 1
				FROM pg_constraint
				WHERE conrelid IN (
					to_regclass('public.email_relevance_review_samples'),
					to_regclass('public.email_relevance_adjudications')
				)
					AND contype = 'f'
					AND conname IN (
						'email_relevance_review_samples_source_observation_id_fkey',
						'email_relevance_adjudications_corrected_project_id_fkey'
					)
			),
			true
		),
		(
			'adjudications_are_update_immutable',
			EXISTS (
				SELECT 1
				FROM pg_trigger
				WHERE tgrelid = to_regclass('public.email_relevance_adjudications')
					AND tgname = 'email_relevance_adjudications_immutable'
					AND (tgtype & 16) = 16
					AND (tgtype & 8) = 0
					AND NOT tgisinternal
			),
			true
		),
		(
			'source_deletion_expires_pending_review',
			EXISTS (
				SELECT 1
				FROM pg_trigger
				WHERE tgrelid = to_regclass('public.email_relevance_message_observations')
					AND tgname = 'email_relevance_review_source_deleted'
					AND NOT tgisinternal
			),
			true
		),
		(
			'sampling_hash_is_extension_independent',
			position(
				'md5(' IN pg_get_functiondef(
					to_regprocedure(
						'public.prepare_email_relevance_review_sample(uuid,uuid,integer)'
					)
				)
			) > 0,
			true
		),
		(
			'source_expiration_is_account_delete_safe',
			position(
				'FROM public.users' IN pg_get_functiondef(
					to_regprocedure('public.expire_email_relevance_review_source()')
				)
			) > 0,
			true
		),
		(
			'expired_metadata_is_not_owner_readable',
			(
				SELECT count(*) = 2
					AND bool_and(cmd = 'SELECT')
					AND bool_and(qual LIKE '%retention_expires_at > now()%')
				FROM pg_policies
				WHERE schemaname = 'public'
					AND policyname IN (
						'email_relevance_observations_owner_select',
						'email_relevance_candidates_owner_select'
					)
			),
			true
		),
		(
			'bounded_retention_rpc_exists',
			to_regprocedure(
				'public.purge_expired_email_relevance_metadata(integer)'
			) IS NOT NULL,
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
