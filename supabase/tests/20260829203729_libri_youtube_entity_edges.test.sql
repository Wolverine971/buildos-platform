-- supabase/tests/20260829203729_libri_youtube_entity_edges.test.sql
-- PSQL-ONLY / DISPOSABLE DATABASE ONLY. Never run against a linked database.

\set ON_ERROR_STOP on
\ir fixtures/libri_youtube_entity_edges_base.sql

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
	(SELECT count(*) = 18 FROM pg_tables WHERE schemaname = 'libri'),
	'phase 1B.4 must leave exactly eighteen Libri tables'
);
SELECT pg_temp.assert_true(
	(
		SELECT count(*) = 18
		FROM pg_class relation
		JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
		WHERE namespace.nspname = 'libri'
			AND relation.relkind = 'r'
			AND relation.relrowsecurity
			AND relation.relforcerowsecurity
	),
	'every Libri table must enable and force RLS'
);
SELECT pg_temp.assert_true(
	NOT has_schema_privilege('anon', 'libri', 'USAGE')
		AND NOT has_table_privilege('anon', 'libri.youtube_channels', 'SELECT')
		AND NOT has_table_privilege('anon', 'libri.youtube_videos', 'SELECT')
		AND NOT has_table_privilege('anon', 'libri.entity_edges', 'SELECT'),
	'anon must not have schema or Phase 1B.4 table access'
);
SELECT pg_temp.assert_true(
	has_table_privilege('authenticated', 'libri.youtube_channels', 'SELECT')
		AND has_table_privilege('authenticated', 'libri.youtube_videos', 'SELECT')
		AND has_table_privilege('authenticated', 'libri.entity_edges', 'SELECT')
		AND NOT has_table_privilege('authenticated', 'libri.youtube_channels', 'INSERT, UPDATE, DELETE')
		AND NOT has_table_privilege('authenticated', 'libri.youtube_videos', 'INSERT, UPDATE, DELETE')
		AND NOT has_table_privilege('authenticated', 'libri.entity_edges', 'INSERT, UPDATE, DELETE'),
	'authenticated Phase 1B.4 access must be read-only'
);
SELECT pg_temp.assert_true(
	has_table_privilege('service_role', 'libri.youtube_channels', 'SELECT, INSERT, UPDATE, DELETE')
		AND has_table_privilege('service_role', 'libri.youtube_videos', 'SELECT, INSERT, UPDATE, DELETE')
		AND has_table_privilege('service_role', 'libri.entity_edges', 'SELECT, INSERT, UPDATE, DELETE'),
	'the importer and worker service role need complete Phase 1B.4 access'
);
SELECT pg_temp.assert_true(
	NOT EXISTS (
		SELECT 1
		FROM pg_constraint foreign_key
		JOIN pg_class relation ON relation.oid = foreign_key.conrelid
		JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
		WHERE foreign_key.contype = 'f'
			AND namespace.nspname = 'libri'
			AND NOT EXISTS (
				SELECT 1
				FROM pg_index index_definition
				WHERE index_definition.indrelid = foreign_key.conrelid
					AND index_definition.indisvalid
					AND (
						SELECT array_agg(attribute_number ORDER BY ordinal_position)
						FROM unnest(index_definition.indkey::smallint[])
							WITH ORDINALITY AS indexed_column(attribute_number, ordinal_position)
						WHERE ordinal_position <= cardinality(foreign_key.conkey)
					) = foreign_key.conkey
			)
	),
	'every Libri foreign key must have a valid index with matching leading columns'
);
SELECT pg_temp.assert_true(
	NOT EXISTS (
		SELECT 1
		FROM pg_constraint dependency
		JOIN pg_class source_relation ON source_relation.oid = dependency.conrelid
		JOIN pg_namespace source_namespace ON source_namespace.oid = source_relation.relnamespace
		JOIN pg_class target_relation ON target_relation.oid = dependency.confrelid
		JOIN pg_namespace target_namespace ON target_namespace.oid = target_relation.relnamespace
		WHERE dependency.contype = 'f'
			AND source_namespace.nspname <> 'libri'
			AND target_namespace.nspname = 'libri'
	),
	'non-Libri schemas must not acquire foreign keys to Libri'
);
SELECT pg_temp.assert_true(
	NOT EXISTS (
		SELECT 1
		FROM pg_proc procedure
		JOIN pg_namespace namespace ON namespace.oid = procedure.pronamespace
		WHERE namespace.nspname = 'libri' AND procedure.prosecdef
	),
	'phase 1B.4 must not introduce SECURITY DEFINER functions'
);

INSERT INTO auth.users (id) VALUES
	('11111111-1111-4111-8111-111111111111'),
	('22222222-2222-4222-8222-222222222222'),
	('33333333-3333-4333-8333-333333333333'),
	('44444444-4444-4444-8444-444444444444');

INSERT INTO libri.libraries (id, slug, name, created_by) VALUES
	('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'primary', 'Primary library', '11111111-1111-4111-8111-111111111111'),
	('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', 'secondary', 'Secondary library', '44444444-4444-4444-8444-444444444444');

INSERT INTO libri.library_members (library_id, user_id, role) VALUES
	('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', '11111111-1111-4111-8111-111111111111', 'owner'),
	('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', '22222222-2222-4222-8222-222222222222', 'viewer'),
	('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', '44444444-4444-4444-8444-444444444444', 'owner');

INSERT INTO libri.books (id, library_id, title) VALUES
	('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'Primary book'),
	('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', 'Secondary book');

INSERT INTO libri.people (id, library_id, name) VALUES
	('cccccccc-cccc-4ccc-8ccc-ccccccccccc1', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'Primary person'),
	('cccccccc-cccc-4ccc-8ccc-ccccccccccc2', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', 'Secondary person');

INSERT INTO libri.sources (
	id,
	library_id,
	source_type,
	source_key,
	canonical_url,
	title,
	status,
	discovered_by
) VALUES
	(
		'10000000-0000-4000-8000-000000000001',
		'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
		'youtube_video',
		'youtube:video:3dfFwxQ5gsw',
		'https://www.youtube.com/watch?v=3dfFwxQ5gsw',
		'Primary video',
		'ready',
		'convex_migration'
	),
	(
		'10000000-0000-4000-8000-000000000002',
		'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
		'podcast_episode',
		'podcast:primary',
		'https://example.com/podcast',
		'Primary podcast',
		'content_cleaned',
		'convex_migration'
	),
	(
		'10000000-0000-4000-8000-000000000003',
		'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2',
		'youtube_video',
		'youtube:video:h0HcIB44phc',
		'https://www.youtube.com/watch?v=h0HcIB44phc',
		'Secondary video',
		'ready',
		'convex_migration'
	),
	(
		'10000000-0000-4000-8000-000000000004',
		'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
		'youtube_video',
		'youtube:video:LlDzqK6MnOA',
		'https://www.youtube.com/watch?v=LlDzqK6MnOA',
		'Unlinked primary video source',
		'ready',
		'convex_migration'
	);

INSERT INTO libri.youtube_channels (
	id,
	library_id,
	channel_key,
	identity_status,
	handle,
	title
) VALUES
	(
		'20000000-0000-4000-8000-000000000001',
		'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
		'the505podcast',
		'unverified',
		'@the505podcast',
		'THE 505 PODCAST'
	),
	(
		'20000000-0000-4000-8000-000000000002',
		'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2',
		'video:h0HcIB44phc',
		'synthetic',
		NULL,
		'Secondary channel'
	);

INSERT INTO libri.youtube_videos (
	id,
	library_id,
	source_id,
	youtube_video_id,
	channel_id,
	duration_seconds,
	thumbnail_url,
	has_metadata,
	has_transcript,
	transcript_segmented,
	enriched,
	analysis
) VALUES
	(
		'30000000-0000-4000-8000-000000000001',
		'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
		'10000000-0000-4000-8000-000000000001',
		'3dfFwxQ5gsw',
		'20000000-0000-4000-8000-000000000001',
		3600,
		'https://i.ytimg.com/vi/3dfFwxQ5gsw/hqdefault.jpg',
		true,
		true,
		true,
		true,
		'{"summary":"Primary analysis"}'
	),
	(
		'30000000-0000-4000-8000-000000000002',
		'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2',
		'10000000-0000-4000-8000-000000000003',
		'h0HcIB44phc',
		'20000000-0000-4000-8000-000000000002',
		NULL,
		'https://i.ytimg.com/vi/h0HcIB44phc/hqdefault.jpg',
		true,
		true,
		true,
		true,
		'{}'
	);

INSERT INTO libri.entity_edges (
	id,
	library_id,
	relationship_type,
	status,
	from_source_id,
	to_book_id,
	confidence,
	detected_by,
	created_by
) VALUES (
	'40000000-0000-4000-8000-000000000001',
	'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
	'podcast.features_author_of_book',
	'confirmed',
	'10000000-0000-4000-8000-000000000002',
	'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1',
	0.8,
	'importer',
	'externalSources.importDiscovered'
);
INSERT INTO libri.entity_edges (
	id,
	library_id,
	relationship_type,
	status,
	from_person_id,
	to_youtube_channel_id,
	confidence,
	detected_by
) VALUES (
	'40000000-0000-4000-8000-000000000002',
	'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
	'person.hosts_channel',
	'confirmed',
	'cccccccc-cccc-4ccc-8ccc-ccccccccccc1',
	'20000000-0000-4000-8000-000000000001',
	1,
	'manual'
);
INSERT INTO libri.entity_edges (
	id,
	library_id,
	relationship_type,
	status,
	from_youtube_video_id,
	to_book_id
) VALUES (
	'40000000-0000-4000-8000-000000000003',
	'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
	'video.references_book',
	'confirmed',
	'30000000-0000-4000-8000-000000000001',
	'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1'
);

SELECT pg_temp.assert_true(
	(
		SELECT from_entity_type = 'source'
			AND from_entity_id = '10000000-0000-4000-8000-000000000002'
			AND to_entity_type = 'book'
			AND to_entity_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1'
		FROM libri.entity_edges
		WHERE id = '40000000-0000-4000-8000-000000000001'
	),
	'generated edge identities must expose stable typed endpoints'
);
SELECT pg_temp.assert_true(
	(
		SELECT search_vector @@ plainto_tsquery('english', '505 podcast')
		FROM libri.youtube_channels
		WHERE id = '20000000-0000-4000-8000-000000000001'
	),
	'channel title and handle search must be generated'
);

DO $$
BEGIN
	BEGIN
		INSERT INTO libri.youtube_videos (
			library_id,
			source_id,
			youtube_video_id
		) VALUES (
			'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
			'10000000-0000-4000-8000-000000000002',
			'LlDzqK6MnOA'
		);
		RAISE EXCEPTION 'expected non-YouTube source failure';
	EXCEPTION WHEN foreign_key_violation THEN NULL;
	END;

	BEGIN
		INSERT INTO libri.youtube_videos (
			library_id,
			source_id,
			youtube_video_id,
			channel_id
		) VALUES (
			'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
			'10000000-0000-4000-8000-000000000004',
			'LlDzqK6MnOA',
			'20000000-0000-4000-8000-000000000002'
		);
		RAISE EXCEPTION 'expected cross-library channel failure';
	EXCEPTION WHEN foreign_key_violation THEN NULL;
	END;

	BEGIN
		INSERT INTO libri.entity_edges (
			library_id,
			relationship_type,
			status,
			from_source_id,
			to_book_id
		) VALUES (
			'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
			'podcast.features_author',
			'confirmed',
			'10000000-0000-4000-8000-000000000002',
			'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1'
		);
		RAISE EXCEPTION 'expected legacy podcast/book endpoint mismatch failure';
	EXCEPTION WHEN check_violation THEN NULL;
	END;

	BEGIN
		INSERT INTO libri.entity_edges (
			library_id,
			relationship_type,
			status,
			from_source_id,
			to_book_id,
			confidence
		) VALUES (
			'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
			'podcast.features_author_of_book',
			'confirmed',
			'10000000-0000-4000-8000-000000000002',
			'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1',
			0.8
		);
		RAISE EXCEPTION 'expected duplicate edge identity failure';
	EXCEPTION WHEN unique_violation THEN NULL;
	END;

	BEGIN
		INSERT INTO libri.entity_edges (
			library_id,
			relationship_type,
			status,
			from_person_id,
			from_source_id,
			to_book_id
		) VALUES (
			'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
			'person.authored_book',
			'confirmed',
			'cccccccc-cccc-4ccc-8ccc-ccccccccccc1',
			'10000000-0000-4000-8000-000000000002',
			'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1'
		);
		RAISE EXCEPTION 'expected exactly-one from endpoint failure';
	EXCEPTION WHEN check_violation THEN NULL;
	END;

	BEGIN
		INSERT INTO libri.entity_edges (
			library_id,
			relationship_type,
			status,
			from_person_id,
			to_book_id
		) VALUES (
			'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
			'person.authored_book',
			'confirmed',
			'cccccccc-cccc-4ccc-8ccc-ccccccccccc1',
			'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2'
		);
		RAISE EXCEPTION 'expected cross-library edge endpoint failure';
	EXCEPTION WHEN foreign_key_violation THEN NULL;
	END;
END;
$$;

UPDATE libri.youtube_videos
SET updated_at = '2000-01-01T00:00:00Z', description = 'Updated description'
WHERE id = '30000000-0000-4000-8000-000000000001';
SELECT pg_temp.assert_true(
	(
		SELECT updated_at > '2000-01-01T00:00:00Z'
		FROM libri.youtube_videos
		WHERE id = '30000000-0000-4000-8000-000000000001'
	),
	'video updates must refresh updated_at'
);

BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
SELECT pg_temp.assert_true((SELECT count(*) = 1 FROM libri.youtube_channels), 'an owner must only see member-library channels');
SELECT pg_temp.assert_true((SELECT count(*) = 1 FROM libri.youtube_videos), 'an owner must only see member-library videos');
SELECT pg_temp.assert_true((SELECT count(*) = 3 FROM libri.entity_edges), 'an owner must only see member-library edges');
SAVEPOINT protected_edge_insert;
\set ON_ERROR_STOP off
INSERT INTO libri.entity_edges (
	library_id,
	relationship_type,
	status,
	from_person_id,
	to_book_id
) VALUES (
	'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
	'person.authored_book',
	'confirmed',
	'cccccccc-cccc-4ccc-8ccc-ccccccccccc1',
	'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1'
);
\set protected_edge_insert_sqlstate :SQLSTATE
ROLLBACK TO SAVEPOINT protected_edge_insert;
\set ON_ERROR_STOP on
SELECT pg_temp.assert_true(
	:'protected_edge_insert_sqlstate' = '42501',
	'authenticated clients must not bypass service routes for graph writes'
);
ROLLBACK;

BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', true);
SELECT pg_temp.assert_true((SELECT count(*) = 1 FROM libri.youtube_channels), 'a viewer may read member-library channels');
SELECT pg_temp.assert_true((SELECT count(*) = 1 FROM libri.youtube_videos), 'a viewer may read member-library videos');
SELECT pg_temp.assert_true((SELECT count(*) = 3 FROM libri.entity_edges), 'a viewer may read member-library edges');
ROLLBACK;

BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '33333333-3333-4333-8333-333333333333', true);
SELECT pg_temp.assert_true((SELECT count(*) = 0 FROM libri.youtube_channels), 'a non-member must not see channels');
SELECT pg_temp.assert_true((SELECT count(*) = 0 FROM libri.youtube_videos), 'a non-member must not see videos');
SELECT pg_temp.assert_true((SELECT count(*) = 0 FROM libri.entity_edges), 'a non-member must not see edges');
ROLLBACK;

BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '44444444-4444-4444-8444-444444444444', true);
SELECT pg_temp.assert_true((SELECT count(*) = 1 FROM libri.youtube_channels), 'the secondary owner must only see secondary channels');
SELECT pg_temp.assert_true((SELECT count(*) = 1 FROM libri.youtube_videos), 'the secondary owner must only see secondary videos');
SELECT pg_temp.assert_true((SELECT count(*) = 0 FROM libri.entity_edges), 'the secondary owner must not see primary edges');
ROLLBACK;
