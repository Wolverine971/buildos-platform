-- libri-migration: true
-- Libri phase 1C: durable agent profiles and versioned derived knowledge artifacts.

SET lock_timeout = '5s';
SET statement_timeout = '60s';

CREATE TABLE libri.agent_profiles (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	library_id uuid NOT NULL REFERENCES libri.libraries(id) ON DELETE CASCADE,
	book_id uuid,
	name text NOT NULL,
	slug text NOT NULL,
	kind text NOT NULL,
	primary_model text NOT NULL,
	secondary_model text,
	tertiary_model text,
	temperature numeric,
	max_tokens integer,
	default_tools text[] NOT NULL DEFAULT '{}'::text[],
	enabled_tools text[] NOT NULL DEFAULT '{}'::text[],
	configuration jsonb NOT NULL DEFAULT '{}'::jsonb,
	is_active boolean NOT NULL DEFAULT true,
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now(),
	CONSTRAINT agent_profiles_book_library_fk
		FOREIGN KEY (library_id, book_id)
		REFERENCES libri.books(library_id, id)
		ON DELETE CASCADE,
	CONSTRAINT agent_profiles_name_nonempty CHECK (length(btrim(name)) > 0),
	CONSTRAINT agent_profiles_slug_valid CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
	CONSTRAINT agent_profiles_kind_valid CHECK (
		kind IN ('book_expert', 'consultation', 'librarian')
	),
	CONSTRAINT agent_profiles_book_scope_valid CHECK (
		(kind = 'book_expert' AND book_id IS NOT NULL)
		OR (kind IN ('consultation', 'librarian') AND book_id IS NULL)
	),
	CONSTRAINT agent_profiles_primary_model_nonempty CHECK (length(btrim(primary_model)) > 0),
	CONSTRAINT agent_profiles_secondary_model_nonempty CHECK (
		secondary_model IS NULL OR length(btrim(secondary_model)) > 0
	),
	CONSTRAINT agent_profiles_tertiary_model_nonempty CHECK (
		tertiary_model IS NULL OR length(btrim(tertiary_model)) > 0
	),
	CONSTRAINT agent_profiles_temperature_range CHECK (
		temperature IS NULL OR (temperature >= 0 AND temperature <= 2)
	),
	CONSTRAINT agent_profiles_max_tokens_positive CHECK (
		max_tokens IS NULL OR max_tokens > 0
	),
	CONSTRAINT agent_profiles_default_tools_no_nulls CHECK (
		array_position(default_tools, NULL) IS NULL
	),
	CONSTRAINT agent_profiles_enabled_tools_no_nulls CHECK (
		array_position(enabled_tools, NULL) IS NULL
	),
	CONSTRAINT agent_profiles_configuration_object CHECK (jsonb_typeof(configuration) = 'object'),
	CONSTRAINT agent_profiles_library_id_id_unique UNIQUE (library_id, id),
	CONSTRAINT agent_profiles_library_slug_unique UNIQUE (library_id, slug)
);

CREATE UNIQUE INDEX agent_profiles_library_book_kind_unique_idx
	ON libri.agent_profiles (library_id, book_id, kind)
	WHERE book_id IS NOT NULL;
CREATE INDEX agent_profiles_library_book_idx
	ON libri.agent_profiles (library_id, book_id)
	WHERE book_id IS NOT NULL;
CREATE INDEX agent_profiles_library_kind_active_idx
	ON libri.agent_profiles (library_id, kind, is_active, updated_at DESC);

CREATE TABLE libri.derived_artifacts (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	library_id uuid NOT NULL REFERENCES libri.libraries(id) ON DELETE CASCADE,
	book_id uuid,
	chapter_id uuid,
	person_id uuid,
	youtube_video_id uuid,
	agent_profile_id uuid,
	scope_type text GENERATED ALWAYS AS (
		CASE
			WHEN chapter_id IS NOT NULL THEN 'chapter'
			WHEN book_id IS NOT NULL THEN 'book'
			WHEN person_id IS NOT NULL THEN 'person'
			WHEN youtube_video_id IS NOT NULL THEN 'youtube_video'
			WHEN agent_profile_id IS NOT NULL THEN 'agent_profile'
		END
	) STORED,
	scope_id uuid GENERATED ALWAYS AS (
		coalesce(chapter_id, book_id, person_id, youtube_video_id, agent_profile_id)
	) STORED,
	artifact_type text NOT NULL,
	title text,
	content text,
	structured_data jsonb NOT NULL DEFAULT '{}'::jsonb,
	version integer NOT NULL DEFAULT 1,
	status text NOT NULL DEFAULT 'generated',
	is_current boolean NOT NULL DEFAULT true,
	model text,
	content_sha256 text NOT NULL,
	source_fingerprint text,
	idempotency_key text NOT NULL,
	input_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
	supersedes_artifact_id uuid,
	generated_by text,
	generated_at timestamptz NOT NULL DEFAULT now(),
	reviewed_at timestamptz,
	review_notes text,
	search_vector tsvector GENERATED ALWAYS AS (
		setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
		setweight(to_tsvector('english', coalesce(content, '')), 'B')
	) STORED,
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now(),
	CONSTRAINT derived_artifacts_book_library_fk
		FOREIGN KEY (library_id, book_id)
		REFERENCES libri.books(library_id, id)
		ON DELETE CASCADE,
	CONSTRAINT derived_artifacts_chapter_book_library_fk
		FOREIGN KEY (library_id, book_id, chapter_id)
		REFERENCES libri.chapters(library_id, book_id, id)
		ON DELETE CASCADE,
	CONSTRAINT derived_artifacts_person_library_fk
		FOREIGN KEY (library_id, person_id)
		REFERENCES libri.people(library_id, id)
		ON DELETE CASCADE,
	CONSTRAINT derived_artifacts_youtube_video_library_fk
		FOREIGN KEY (library_id, youtube_video_id)
		REFERENCES libri.youtube_videos(library_id, id)
		ON DELETE CASCADE,
	CONSTRAINT derived_artifacts_agent_profile_library_fk
		FOREIGN KEY (library_id, agent_profile_id)
		REFERENCES libri.agent_profiles(library_id, id)
		ON DELETE CASCADE,
	CONSTRAINT derived_artifacts_scope_shape CHECK (
		(
			chapter_id IS NOT NULL
			AND book_id IS NOT NULL
			AND person_id IS NULL
			AND youtube_video_id IS NULL
			AND agent_profile_id IS NULL
		)
		OR (
			chapter_id IS NULL
			AND num_nonnulls(book_id, person_id, youtube_video_id, agent_profile_id) = 1
		)
	),
	CONSTRAINT derived_artifacts_type_valid CHECK (
		artifact_type IN (
			'book_summary',
			'book_analysis',
			'chapter_summary',
			'chapter_analysis',
			'key_concepts',
			'cross_reference',
			'practical_takeaways',
			'author_perspective',
			'topic_synthesis',
			'agent_knowledge_doc',
			'agent_prompt'
		)
	),
	CONSTRAINT derived_artifacts_type_scope_valid CHECK (
		CASE
			WHEN artifact_type IN ('chapter_summary', 'chapter_analysis', 'key_concepts')
				THEN scope_type = 'chapter'
			WHEN artifact_type IN ('book_summary', 'book_analysis')
				THEN scope_type = 'book'
			WHEN artifact_type IN ('agent_knowledge_doc', 'agent_prompt')
				THEN scope_type = 'agent_profile'
			ELSE true
		END
	),
	CONSTRAINT derived_artifacts_title_nonempty CHECK (
		title IS NULL OR length(btrim(title)) > 0
	),
	CONSTRAINT derived_artifacts_content_present CHECK (
		length(btrim(coalesce(content, ''))) > 0 OR structured_data <> '{}'::jsonb
	),
	CONSTRAINT derived_artifacts_structured_data_object CHECK (
		jsonb_typeof(structured_data) = 'object'
	),
	CONSTRAINT derived_artifacts_version_positive CHECK (version > 0),
	CONSTRAINT derived_artifacts_status_valid CHECK (
		status IN (
			'generated',
			'reviewed',
			'outdated',
			'rejected',
			'insufficient_evidence',
			'failed'
		)
	),
	CONSTRAINT derived_artifacts_model_nonempty CHECK (
		model IS NULL OR length(btrim(model)) > 0
	),
	CONSTRAINT derived_artifacts_content_sha256_valid CHECK (
		content_sha256 ~ '^[0-9a-f]{64}$'
	),
	CONSTRAINT derived_artifacts_source_fingerprint_valid CHECK (
		source_fingerprint IS NULL OR source_fingerprint ~ '^[0-9a-f]{64}$'
	),
	CONSTRAINT derived_artifacts_idempotency_key_nonempty CHECK (
		length(btrim(idempotency_key)) > 0
	),
	CONSTRAINT derived_artifacts_input_snapshot_object CHECK (
		jsonb_typeof(input_snapshot) = 'object'
	),
	CONSTRAINT derived_artifacts_generated_by_nonempty CHECK (
		generated_by IS NULL OR length(btrim(generated_by)) > 0
	),
	CONSTRAINT derived_artifacts_review_notes_nonempty CHECK (
		review_notes IS NULL OR length(btrim(review_notes)) > 0
	),
	CONSTRAINT derived_artifacts_review_state CHECK (
		(status = 'reviewed' AND reviewed_at IS NOT NULL)
		OR (status <> 'reviewed' AND reviewed_at IS NULL)
	),
	CONSTRAINT derived_artifacts_supersedes_not_self CHECK (
		supersedes_artifact_id IS NULL OR supersedes_artifact_id <> id
	),
	CONSTRAINT derived_artifacts_library_id_id_unique UNIQUE (library_id, id),
	CONSTRAINT derived_artifacts_scope_type_id_unique UNIQUE (
		library_id,
		scope_type,
		scope_id,
		artifact_type,
		id
	),
	CONSTRAINT derived_artifacts_supersedes_same_scope_fk
		FOREIGN KEY (
			library_id,
			scope_type,
			scope_id,
			artifact_type,
			supersedes_artifact_id
		)
		REFERENCES libri.derived_artifacts(
			library_id,
			scope_type,
			scope_id,
			artifact_type,
			id
		)
		ON DELETE RESTRICT,
	CONSTRAINT derived_artifacts_library_idempotency_unique UNIQUE (library_id, idempotency_key)
);

CREATE UNIQUE INDEX derived_artifacts_library_current_unique_idx
	ON libri.derived_artifacts (library_id, scope_type, scope_id, artifact_type)
	WHERE is_current;
CREATE INDEX derived_artifacts_library_book_idx
	ON libri.derived_artifacts (library_id, book_id)
	WHERE book_id IS NOT NULL;
CREATE INDEX derived_artifacts_library_book_chapter_idx
	ON libri.derived_artifacts (library_id, book_id, chapter_id)
	WHERE chapter_id IS NOT NULL;
CREATE INDEX derived_artifacts_library_person_idx
	ON libri.derived_artifacts (library_id, person_id)
	WHERE person_id IS NOT NULL;
CREATE INDEX derived_artifacts_library_youtube_video_idx
	ON libri.derived_artifacts (library_id, youtube_video_id)
	WHERE youtube_video_id IS NOT NULL;
CREATE INDEX derived_artifacts_library_agent_profile_idx
	ON libri.derived_artifacts (library_id, agent_profile_id)
	WHERE agent_profile_id IS NOT NULL;
CREATE INDEX derived_artifacts_library_supersedes_scope_idx
	ON libri.derived_artifacts (
		library_id,
		scope_type,
		scope_id,
		artifact_type,
		supersedes_artifact_id
	)
	WHERE supersedes_artifact_id IS NOT NULL;
CREATE INDEX derived_artifacts_library_status_idx
	ON libri.derived_artifacts (library_id, status, is_current, updated_at DESC);
CREATE INDEX derived_artifacts_library_source_fingerprint_idx
	ON libri.derived_artifacts (library_id, source_fingerprint)
	WHERE source_fingerprint IS NOT NULL;
CREATE INDEX derived_artifacts_search_vector_idx
	ON libri.derived_artifacts USING gin (search_vector);

CREATE TABLE libri.derived_artifact_evidence (
	library_id uuid NOT NULL REFERENCES libri.libraries(id) ON DELETE CASCADE,
	artifact_id uuid NOT NULL,
	source_chunk_id uuid NOT NULL,
	role text NOT NULL DEFAULT 'supporting',
	rank integer,
	excerpt text,
	metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
	created_at timestamptz NOT NULL DEFAULT now(),
	PRIMARY KEY (library_id, artifact_id, source_chunk_id),
	CONSTRAINT derived_artifact_evidence_artifact_library_fk
		FOREIGN KEY (library_id, artifact_id)
		REFERENCES libri.derived_artifacts(library_id, id)
		ON DELETE CASCADE,
	CONSTRAINT derived_artifact_evidence_chunk_library_fk
		FOREIGN KEY (library_id, source_chunk_id)
		REFERENCES libri.source_chunks(library_id, id)
		ON DELETE CASCADE,
	CONSTRAINT derived_artifact_evidence_role_valid CHECK (
		role IN ('source', 'supporting', 'contradicting', 'citation')
	),
	CONSTRAINT derived_artifact_evidence_rank_positive CHECK (rank IS NULL OR rank > 0),
	CONSTRAINT derived_artifact_evidence_excerpt_nonempty CHECK (
		excerpt IS NULL OR length(btrim(excerpt)) > 0
	),
	CONSTRAINT derived_artifact_evidence_metadata_object CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE INDEX derived_artifact_evidence_library_chunk_idx
	ON libri.derived_artifact_evidence (library_id, source_chunk_id);
CREATE UNIQUE INDEX derived_artifact_evidence_artifact_rank_unique_idx
	ON libri.derived_artifact_evidence (library_id, artifact_id, rank)
	WHERE rank IS NOT NULL;

CREATE TRIGGER agent_profiles_set_updated_at
	BEFORE UPDATE ON libri.agent_profiles
	FOR EACH ROW EXECUTE FUNCTION libri.set_updated_at();
CREATE TRIGGER derived_artifacts_set_updated_at
	BEFORE UPDATE ON libri.derived_artifacts
	FOR EACH ROW EXECUTE FUNCTION libri.set_updated_at();

ALTER TABLE libri.agent_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE libri.agent_profiles FORCE ROW LEVEL SECURITY;
ALTER TABLE libri.derived_artifacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE libri.derived_artifacts FORCE ROW LEVEL SECURITY;
ALTER TABLE libri.derived_artifact_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE libri.derived_artifact_evidence FORCE ROW LEVEL SECURITY;

CREATE POLICY agent_profiles_select_member
	ON libri.agent_profiles
	FOR SELECT
	TO authenticated
	USING (
		EXISTS (
			SELECT 1 FROM libri.library_members AS member
			WHERE member.library_id = agent_profiles.library_id
				AND member.user_id = (SELECT auth.uid())
		)
	);
CREATE POLICY derived_artifacts_select_member
	ON libri.derived_artifacts
	FOR SELECT
	TO authenticated
	USING (
		EXISTS (
			SELECT 1 FROM libri.library_members AS member
			WHERE member.library_id = derived_artifacts.library_id
				AND member.user_id = (SELECT auth.uid())
		)
	);
CREATE POLICY derived_artifact_evidence_select_member
	ON libri.derived_artifact_evidence
	FOR SELECT
	TO authenticated
	USING (
		EXISTS (
			SELECT 1 FROM libri.library_members AS member
			WHERE member.library_id = derived_artifact_evidence.library_id
				AND member.user_id = (SELECT auth.uid())
		)
	);

REVOKE ALL ON
	libri.agent_profiles,
	libri.derived_artifacts,
	libri.derived_artifact_evidence
	FROM PUBLIC, anon, authenticated;
GRANT SELECT ON
	libri.agent_profiles,
	libri.derived_artifacts,
	libri.derived_artifact_evidence
	TO authenticated;
GRANT ALL ON
	libri.agent_profiles,
	libri.derived_artifacts,
	libri.derived_artifact_evidence
	TO service_role;

NOTIFY pgrst, 'reload schema';

RESET statement_timeout;
RESET lock_timeout;
