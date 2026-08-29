-- libri-migration: true
-- Libri phase 1B.4: YouTube-specialized metadata and tenant-safe entity graph edges.

SET lock_timeout = '5s';
SET statement_timeout = '60s';

ALTER TABLE libri.sources
	ADD CONSTRAINT sources_library_id_source_type_unique UNIQUE (library_id, id, source_type);

CREATE TABLE libri.youtube_channels (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	library_id uuid NOT NULL REFERENCES libri.libraries(id) ON DELETE CASCADE,
	channel_key text NOT NULL,
	identity_status text NOT NULL DEFAULT 'unverified',
	handle text,
	title text NOT NULL,
	description text,
	thumbnail_url text,
	metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
	search_vector tsvector GENERATED ALWAYS AS (
		setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
		setweight(to_tsvector('simple', coalesce(handle, '')), 'B')
	) STORED,
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now(),
	CONSTRAINT youtube_channels_key_nonempty CHECK (length(btrim(channel_key)) > 0),
	CONSTRAINT youtube_channels_identity_status_valid CHECK (
		identity_status IN ('verified', 'unverified', 'synthetic')
	),
	CONSTRAINT youtube_channels_handle_nonempty CHECK (
		handle IS NULL OR length(btrim(handle)) > 0
	),
	CONSTRAINT youtube_channels_title_nonempty CHECK (length(btrim(title)) > 0),
	CONSTRAINT youtube_channels_thumbnail_http CHECK (
		thumbnail_url IS NULL OR thumbnail_url ~ '^https?://'
	),
	CONSTRAINT youtube_channels_metadata_object CHECK (jsonb_typeof(metadata) = 'object'),
	CONSTRAINT youtube_channels_library_id_id_unique UNIQUE (library_id, id),
	CONSTRAINT youtube_channels_library_key_unique UNIQUE (library_id, channel_key)
);

CREATE UNIQUE INDEX youtube_channels_library_handle_unique_idx
	ON libri.youtube_channels (library_id, lower(handle))
	WHERE handle IS NOT NULL;
CREATE INDEX youtube_channels_library_identity_status_idx
	ON libri.youtube_channels (library_id, identity_status, updated_at DESC);
CREATE INDEX youtube_channels_search_vector_idx
	ON libri.youtube_channels USING gin (search_vector);

CREATE TABLE libri.youtube_videos (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	library_id uuid NOT NULL REFERENCES libri.libraries(id) ON DELETE CASCADE,
	source_id uuid NOT NULL,
	source_type text NOT NULL DEFAULT 'youtube_video',
	youtube_video_id text NOT NULL,
	channel_id uuid,
	description text,
	duration_seconds integer,
	thumbnail_url text,
	has_metadata boolean NOT NULL DEFAULT false,
	has_transcript boolean NOT NULL DEFAULT false,
	transcript_segmented boolean NOT NULL DEFAULT false,
	entity_links_suggested boolean NOT NULL DEFAULT false,
	enriched boolean NOT NULL DEFAULT false,
	analysis jsonb NOT NULL DEFAULT '{}'::jsonb,
	metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now(),
	CONSTRAINT youtube_videos_source_library_type_fk
		FOREIGN KEY (library_id, source_id, source_type)
		REFERENCES libri.sources(library_id, id, source_type)
		ON DELETE CASCADE,
	CONSTRAINT youtube_videos_channel_library_fk
		FOREIGN KEY (library_id, channel_id)
		REFERENCES libri.youtube_channels(library_id, id)
		ON DELETE SET NULL (channel_id),
	CONSTRAINT youtube_videos_source_type_fixed CHECK (source_type = 'youtube_video'),
	CONSTRAINT youtube_videos_external_id_valid CHECK (
		youtube_video_id ~ '^[A-Za-z0-9_-]{11}$'
	),
	CONSTRAINT youtube_videos_duration_nonnegative CHECK (
		duration_seconds IS NULL OR duration_seconds >= 0
	),
	CONSTRAINT youtube_videos_thumbnail_http CHECK (
		thumbnail_url IS NULL OR thumbnail_url ~ '^https?://'
	),
	CONSTRAINT youtube_videos_analysis_object CHECK (jsonb_typeof(analysis) = 'object'),
	CONSTRAINT youtube_videos_metadata_object CHECK (jsonb_typeof(metadata) = 'object'),
	CONSTRAINT youtube_videos_library_id_id_unique UNIQUE (library_id, id),
	CONSTRAINT youtube_videos_library_source_unique UNIQUE (library_id, source_id),
	CONSTRAINT youtube_videos_library_external_id_unique UNIQUE (library_id, youtube_video_id)
);

CREATE INDEX youtube_videos_library_source_type_idx
	ON libri.youtube_videos (library_id, source_id, source_type);
CREATE INDEX youtube_videos_library_channel_idx
	ON libri.youtube_videos (library_id, channel_id)
	WHERE channel_id IS NOT NULL;
CREATE INDEX youtube_videos_library_indexing_state_idx
	ON libri.youtube_videos (
		library_id,
		has_transcript,
		transcript_segmented,
		entity_links_suggested,
		enriched,
		updated_at DESC
	);

CREATE TABLE libri.entity_edges (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	library_id uuid NOT NULL REFERENCES libri.libraries(id) ON DELETE CASCADE,
	relationship_type text NOT NULL,
	status text NOT NULL DEFAULT 'suggested',
	from_book_id uuid,
	from_person_id uuid,
	from_source_id uuid,
	from_youtube_channel_id uuid,
	from_youtube_video_id uuid,
	to_book_id uuid,
	to_person_id uuid,
	to_source_id uuid,
	to_youtube_channel_id uuid,
	to_youtube_video_id uuid,
	from_entity_type text GENERATED ALWAYS AS (
		CASE
			WHEN from_book_id IS NOT NULL THEN 'book'
			WHEN from_person_id IS NOT NULL THEN 'person'
			WHEN from_source_id IS NOT NULL THEN 'source'
			WHEN from_youtube_channel_id IS NOT NULL THEN 'youtube_channel'
			WHEN from_youtube_video_id IS NOT NULL THEN 'youtube_video'
		END
	) STORED,
	from_entity_id uuid GENERATED ALWAYS AS (
		coalesce(
			from_book_id,
			from_person_id,
			from_source_id,
			from_youtube_channel_id,
			from_youtube_video_id
		)
	) STORED,
	to_entity_type text GENERATED ALWAYS AS (
		CASE
			WHEN to_book_id IS NOT NULL THEN 'book'
			WHEN to_person_id IS NOT NULL THEN 'person'
			WHEN to_source_id IS NOT NULL THEN 'source'
			WHEN to_youtube_channel_id IS NOT NULL THEN 'youtube_channel'
			WHEN to_youtube_video_id IS NOT NULL THEN 'youtube_video'
		END
	) STORED,
	to_entity_id uuid GENERATED ALWAYS AS (
		coalesce(
			to_book_id,
			to_person_id,
			to_source_id,
			to_youtube_channel_id,
			to_youtube_video_id
		)
	) STORED,
	role text,
	start_ms bigint,
	end_ms bigint,
	confidence numeric,
	evidence_text text,
	evidence_start_ms bigint,
	evidence_url text,
	evidence_chunk_id uuid,
	detected_by text,
	created_by text,
	metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now(),
	CONSTRAINT entity_edges_from_book_library_fk
		FOREIGN KEY (library_id, from_book_id)
		REFERENCES libri.books(library_id, id)
		ON DELETE CASCADE,
	CONSTRAINT entity_edges_from_person_library_fk
		FOREIGN KEY (library_id, from_person_id)
		REFERENCES libri.people(library_id, id)
		ON DELETE CASCADE,
	CONSTRAINT entity_edges_from_source_library_fk
		FOREIGN KEY (library_id, from_source_id)
		REFERENCES libri.sources(library_id, id)
		ON DELETE CASCADE,
	CONSTRAINT entity_edges_from_youtube_channel_library_fk
		FOREIGN KEY (library_id, from_youtube_channel_id)
		REFERENCES libri.youtube_channels(library_id, id)
		ON DELETE CASCADE,
	CONSTRAINT entity_edges_from_youtube_video_library_fk
		FOREIGN KEY (library_id, from_youtube_video_id)
		REFERENCES libri.youtube_videos(library_id, id)
		ON DELETE CASCADE,
	CONSTRAINT entity_edges_to_book_library_fk
		FOREIGN KEY (library_id, to_book_id)
		REFERENCES libri.books(library_id, id)
		ON DELETE CASCADE,
	CONSTRAINT entity_edges_to_person_library_fk
		FOREIGN KEY (library_id, to_person_id)
		REFERENCES libri.people(library_id, id)
		ON DELETE CASCADE,
	CONSTRAINT entity_edges_to_source_library_fk
		FOREIGN KEY (library_id, to_source_id)
		REFERENCES libri.sources(library_id, id)
		ON DELETE CASCADE,
	CONSTRAINT entity_edges_to_youtube_channel_library_fk
		FOREIGN KEY (library_id, to_youtube_channel_id)
		REFERENCES libri.youtube_channels(library_id, id)
		ON DELETE CASCADE,
	CONSTRAINT entity_edges_to_youtube_video_library_fk
		FOREIGN KEY (library_id, to_youtube_video_id)
		REFERENCES libri.youtube_videos(library_id, id)
		ON DELETE CASCADE,
	CONSTRAINT entity_edges_evidence_chunk_library_fk
		FOREIGN KEY (library_id, evidence_chunk_id)
		REFERENCES libri.source_chunks(library_id, id)
		ON DELETE SET NULL (evidence_chunk_id),
	CONSTRAINT entity_edges_from_exactly_one CHECK (
		num_nonnulls(
			from_book_id,
			from_person_id,
			from_source_id,
			from_youtube_channel_id,
			from_youtube_video_id
		) = 1
	),
	CONSTRAINT entity_edges_to_exactly_one CHECK (
		num_nonnulls(
			to_book_id,
			to_person_id,
			to_source_id,
			to_youtube_channel_id,
			to_youtube_video_id
		) = 1
	),
	CONSTRAINT entity_edges_relationship_valid CHECK (
		relationship_type IN (
			'person.owns_channel',
			'person.hosts_channel',
			'person.appears_in_video',
			'video.references_book',
			'video.explains_book',
			'video.author_interview',
			'podcast.features_author',
			'podcast.features_author_of_book',
			'blog.reviews_book',
			'person.authored_book'
		)
	),
	CONSTRAINT entity_edges_relationship_endpoints_valid CHECK (
		CASE relationship_type
			WHEN 'person.owns_channel' THEN from_entity_type = 'person' AND to_entity_type = 'youtube_channel'
			WHEN 'person.hosts_channel' THEN from_entity_type = 'person' AND to_entity_type = 'youtube_channel'
			WHEN 'person.appears_in_video' THEN from_entity_type = 'person' AND to_entity_type = 'youtube_video'
			WHEN 'video.references_book' THEN from_entity_type = 'youtube_video' AND to_entity_type = 'book'
			WHEN 'video.explains_book' THEN from_entity_type = 'youtube_video' AND to_entity_type = 'book'
			WHEN 'video.author_interview' THEN from_entity_type = 'youtube_video' AND to_entity_type = 'book'
			WHEN 'podcast.features_author' THEN from_entity_type = 'source' AND to_entity_type = 'person'
			WHEN 'podcast.features_author_of_book' THEN from_entity_type = 'source' AND to_entity_type = 'book'
			WHEN 'blog.reviews_book' THEN from_entity_type = 'source' AND to_entity_type = 'book'
			WHEN 'person.authored_book' THEN from_entity_type = 'person' AND to_entity_type = 'book'
			ELSE false
		END
	),
	CONSTRAINT entity_edges_status_valid CHECK (
		status IN ('suggested', 'confirmed', 'rejected')
	),
	CONSTRAINT entity_edges_role_nonempty CHECK (role IS NULL OR length(btrim(role)) > 0),
	CONSTRAINT entity_edges_timing_pair CHECK (
		(start_ms IS NULL AND end_ms IS NULL)
		OR (start_ms IS NOT NULL AND end_ms IS NOT NULL)
	),
	CONSTRAINT entity_edges_timing_nonnegative CHECK (
		(start_ms IS NULL OR start_ms >= 0)
		AND (end_ms IS NULL OR end_ms >= 0)
		AND (evidence_start_ms IS NULL OR evidence_start_ms >= 0)
	),
	CONSTRAINT entity_edges_timing_order CHECK (
		start_ms IS NULL OR end_ms >= start_ms
	),
	CONSTRAINT entity_edges_confidence_range CHECK (
		confidence IS NULL OR (confidence >= 0 AND confidence <= 1)
	),
	CONSTRAINT entity_edges_evidence_text_nonempty CHECK (
		evidence_text IS NULL OR length(btrim(evidence_text)) > 0
	),
	CONSTRAINT entity_edges_evidence_url_http CHECK (
		evidence_url IS NULL OR evidence_url ~ '^https?://'
	),
	CONSTRAINT entity_edges_detected_by_valid CHECK (
		detected_by IS NULL OR detected_by IN ('manual', 'llm', 'importer')
	),
	CONSTRAINT entity_edges_created_by_nonempty CHECK (
		created_by IS NULL OR length(btrim(created_by)) > 0
	),
	CONSTRAINT entity_edges_metadata_object CHECK (jsonb_typeof(metadata) = 'object'),
	CONSTRAINT entity_edges_identity_unique UNIQUE (
		library_id,
		from_entity_type,
		from_entity_id,
		relationship_type,
		to_entity_type,
		to_entity_id
	)
);

CREATE INDEX entity_edges_library_from_book_idx
	ON libri.entity_edges (library_id, from_book_id)
	WHERE from_book_id IS NOT NULL;
CREATE INDEX entity_edges_library_from_person_idx
	ON libri.entity_edges (library_id, from_person_id)
	WHERE from_person_id IS NOT NULL;
CREATE INDEX entity_edges_library_from_source_idx
	ON libri.entity_edges (library_id, from_source_id)
	WHERE from_source_id IS NOT NULL;
CREATE INDEX entity_edges_library_from_youtube_channel_idx
	ON libri.entity_edges (library_id, from_youtube_channel_id)
	WHERE from_youtube_channel_id IS NOT NULL;
CREATE INDEX entity_edges_library_from_youtube_video_idx
	ON libri.entity_edges (library_id, from_youtube_video_id)
	WHERE from_youtube_video_id IS NOT NULL;
CREATE INDEX entity_edges_library_to_book_idx
	ON libri.entity_edges (library_id, to_book_id)
	WHERE to_book_id IS NOT NULL;
CREATE INDEX entity_edges_library_to_person_idx
	ON libri.entity_edges (library_id, to_person_id)
	WHERE to_person_id IS NOT NULL;
CREATE INDEX entity_edges_library_to_source_idx
	ON libri.entity_edges (library_id, to_source_id)
	WHERE to_source_id IS NOT NULL;
CREATE INDEX entity_edges_library_to_youtube_channel_idx
	ON libri.entity_edges (library_id, to_youtube_channel_id)
	WHERE to_youtube_channel_id IS NOT NULL;
CREATE INDEX entity_edges_library_to_youtube_video_idx
	ON libri.entity_edges (library_id, to_youtube_video_id)
	WHERE to_youtube_video_id IS NOT NULL;
CREATE INDEX entity_edges_library_evidence_chunk_idx
	ON libri.entity_edges (library_id, evidence_chunk_id)
	WHERE evidence_chunk_id IS NOT NULL;
CREATE INDEX entity_edges_library_from_lookup_idx
	ON libri.entity_edges (
		library_id,
		from_entity_type,
		from_entity_id,
		relationship_type,
		status
	);
CREATE INDEX entity_edges_library_to_lookup_idx
	ON libri.entity_edges (
		library_id,
		to_entity_type,
		to_entity_id,
		relationship_type,
		status
	);

CREATE TRIGGER youtube_channels_set_updated_at
	BEFORE UPDATE ON libri.youtube_channels
	FOR EACH ROW EXECUTE FUNCTION libri.set_updated_at();
CREATE TRIGGER youtube_videos_set_updated_at
	BEFORE UPDATE ON libri.youtube_videos
	FOR EACH ROW EXECUTE FUNCTION libri.set_updated_at();
CREATE TRIGGER entity_edges_set_updated_at
	BEFORE UPDATE ON libri.entity_edges
	FOR EACH ROW EXECUTE FUNCTION libri.set_updated_at();

ALTER TABLE libri.youtube_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE libri.youtube_channels FORCE ROW LEVEL SECURITY;
ALTER TABLE libri.youtube_videos ENABLE ROW LEVEL SECURITY;
ALTER TABLE libri.youtube_videos FORCE ROW LEVEL SECURITY;
ALTER TABLE libri.entity_edges ENABLE ROW LEVEL SECURITY;
ALTER TABLE libri.entity_edges FORCE ROW LEVEL SECURITY;

CREATE POLICY youtube_channels_select_member
	ON libri.youtube_channels
	FOR SELECT
	TO authenticated
	USING (
		EXISTS (
			SELECT 1 FROM libri.library_members AS member
			WHERE member.library_id = youtube_channels.library_id
				AND member.user_id = (SELECT auth.uid())
		)
	);
CREATE POLICY youtube_videos_select_member
	ON libri.youtube_videos
	FOR SELECT
	TO authenticated
	USING (
		EXISTS (
			SELECT 1 FROM libri.library_members AS member
			WHERE member.library_id = youtube_videos.library_id
				AND member.user_id = (SELECT auth.uid())
		)
	);
CREATE POLICY entity_edges_select_member
	ON libri.entity_edges
	FOR SELECT
	TO authenticated
	USING (
		EXISTS (
			SELECT 1 FROM libri.library_members AS member
			WHERE member.library_id = entity_edges.library_id
				AND member.user_id = (SELECT auth.uid())
		)
	);

REVOKE ALL ON
	libri.youtube_channels,
	libri.youtube_videos,
	libri.entity_edges
	FROM PUBLIC, anon, authenticated;
GRANT SELECT ON
	libri.youtube_channels,
	libri.youtube_videos,
	libri.entity_edges
	TO authenticated;
GRANT ALL ON
	libri.youtube_channels,
	libri.youtube_videos,
	libri.entity_edges
	TO service_role;

NOTIFY pgrst, 'reload schema';

RESET statement_timeout;
RESET lock_timeout;
