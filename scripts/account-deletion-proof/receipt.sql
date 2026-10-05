-- scripts/account-deletion-proof/receipt.sql
-- Read-only deletion receipt for one account (Tasker 103). run.sh substitutes
-- :'user_id'. It counts, never selects content: every column that can point at
-- the person (a single-column foreign key to auth.users, public.users or their
-- onto_actors row, or any column named user_id), their storage objects, their
-- auth user, and the deletion request's outcome. After a completed deletion,
-- every count must be 0 except account_deletion_requests / legal_acceptances
-- (kept by design) and RESTRICT / NO ACTION actor references (authorship on
-- surviving shared work, pointing at the "Deleted user" tombstone).
WITH person AS (
	SELECT :'user_id'::uuid AS user_id
),
actor AS (
	-- After deletion the actor no longer carries user_id; the request row keeps
	-- nothing either, so the tombstone is found by the caller passing actor_id.
	SELECT nullif(:'actor_id', '')::uuid AS actor_id
),
person_columns AS (
	SELECT DISTINCT
		format('%I.%I', namespace.nspname, class.relname) AS relation,
		attribute.attname::text AS column_name,
		format_type(attribute.atttypid, attribute.atttypmod) AS column_type,
		CASE WHEN con.confrelid = 'public.onto_actors'::regclass THEN 'actor' ELSE 'user' END AS points_at,
		con.confdeltype AS delete_rule
	FROM pg_class AS class
	JOIN pg_namespace AS namespace ON namespace.oid = class.relnamespace
	JOIN pg_attribute AS attribute
		ON attribute.attrelid = class.oid AND attribute.attnum > 0 AND NOT attribute.attisdropped
	LEFT JOIN pg_constraint AS con
		ON con.conrelid = class.oid
		AND con.contype = 'f'
		AND con.conkey = ARRAY[attribute.attnum]
		AND con.confrelid IN ('auth.users'::regclass, 'public.users'::regclass, 'public.onto_actors'::regclass)
	WHERE namespace.nspname IN ('public', 'libri', 'onto', 'private', 'agentic_chat_internal', 'app_auth')
		AND class.relkind IN ('r', 'p')
		AND NOT class.relispartition
		AND (
			con.oid IS NOT NULL
			OR (attribute.attname = 'user_id' AND format_type(attribute.atttypid, attribute.atttypmod) IN ('uuid', 'text'))
		)
),
counts AS (
	SELECT
		columns.relation,
		columns.column_name,
		columns.points_at,
		columns.delete_rule,
		(xpath('/row/n/text()', query_to_xml(
			format(
				'SELECT count(*) AS n FROM %s WHERE %I = %L::%s',
				columns.relation,
				columns.column_name,
				CASE columns.points_at WHEN 'actor' THEN actor.actor_id ELSE person.user_id END,
				columns.column_type
			),
			false, true, ''
		)))[1]::text::bigint AS row_count
	FROM person_columns AS columns
	CROSS JOIN person
	CROSS JOIN actor
	WHERE columns.points_at = 'user' OR actor.actor_id IS NOT NULL
)
SELECT relation, column_name, points_at, delete_rule::text, row_count,
	CASE
		WHEN relation IN ('public.account_deletion_requests', 'public.legal_acceptances', 'public.legal_acceptance_intents')
			THEN 'kept by design'
		WHEN points_at = 'actor' AND delete_rule IN ('a', 'r') THEN 'authorship on shared work'
		ELSE 'MUST BE 0'
	END AS expectation
FROM counts
WHERE row_count > 0
UNION ALL
SELECT 'storage.objects', 'owner_id or <user_id>/ prefix', 'user', NULL,
	(SELECT count(*) FROM storage.objects, person
		WHERE objects.owner_id = person.user_id::text
			OR objects.name LIKE person.user_id::text || '/%'
			OR objects.name LIKE 'users/' || person.user_id::text || '/%'),
	'MUST BE 0'
UNION ALL
SELECT 'auth.users', 'id', 'user', NULL,
	(SELECT count(*) FROM auth.users, person WHERE users.id = person.user_id),
	'MUST BE 0'
UNION ALL
SELECT 'public.onto_actors', 'tombstone (no user_id, account_deleted_at set)', 'actor', NULL,
	(SELECT count(*) FROM public.onto_actors, actor
		WHERE onto_actors.id = actor.actor_id AND onto_actors.user_id IS NULL AND onto_actors.account_deleted_at IS NOT NULL),
	'1 when actor_id is given'
UNION ALL
SELECT 'public.account_deletion_requests', 'status=' || requests.status || ' posthog=' || coalesce(requests.posthog_deletion_status, 'null')
		|| ' billing=' || requests.billing_cancellation_status || ' attempts=' || requests.attempt_count,
	'user', NULL, 1, 'status=completed'
FROM public.account_deletion_requests AS requests, person
WHERE requests.user_id = person.user_id
ORDER BY 6 DESC, 1, 2;
