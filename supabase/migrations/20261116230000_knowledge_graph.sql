-- supabase/migrations/20261116230000_knowledge_graph.sql
-- Personal knowledge graph (tasker 160).
--
-- One graph for the things a user keeps track of: people, organizations, websites, YouTube
-- videos and channels, places, topics. It sits beside the project ontology (onto_*), which is
-- project-scoped; this graph spans a person's projects.
--
-- Two kinds of rows live side by side:
--   scope = 'public'  shared identity and facts with a public source (a company's website,
--                     a video's title). No owner. Written only by the service role.
--   scope = 'private' one user's entities and facts (a phone number for an executive, "I know
--                     Sam", notes). Visible to that user only.
-- A private fact may describe a public entity. A public fact may never describe or point at a
-- private entity, and predicates marked unshareable (personal contact methods, relationships to
-- the user, notes) can never be public. Trigger guards enforce this for every writer.
BEGIN;

SET LOCAL lock_timeout = '5s';

-- ============================================================================
-- 1. VOCABULARY
-- ============================================================================

CREATE TABLE public.knowledge_kinds (
	key text PRIMARY KEY CHECK (key ~ '^[a-z][a-z0-9_]{1,39}$'),
	label text NOT NULL,
	plural_label text NOT NULL,
	description text NOT NULL,
	-- Whether an entity of this kind may exist in the shared (public) layer at all.
	shareable boolean NOT NULL DEFAULT true,
	sort_order smallint NOT NULL DEFAULT 100,
	created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.knowledge_kinds IS
	'Entity kinds in the knowledge graph. Adding a kind is a row, not a table.';

CREATE TABLE public.knowledge_predicates (
	key text PRIMARY KEY CHECK (key ~ '^[a-z][a-z0-9_]{1,39}$'),
	label text NOT NULL,
	-- Label when read from the object's side ("employs" for works_at).
	inverse_label text,
	-- Written for models choosing a predicate; also shown in the describe tool.
	description text NOT NULL,
	value_type text NOT NULL CHECK (value_type IN (
		'entity', 'text', 'url', 'email', 'phone', 'date', 'number', 'json'
	)),
	-- Allowed subject kinds; empty = any kind.
	subject_kinds text[] NOT NULL DEFAULT '{}',
	-- Allowed object kinds for value_type = 'entity'; empty = any kind.
	object_kinds text[] NOT NULL DEFAULT '{}',
	cardinality text NOT NULL DEFAULT 'many' CHECK (cardinality IN ('one', 'many')),
	-- Subject kinds for which a public fact with this predicate is allowed; empty = never public.
	shareable_subject_kinds text[] NOT NULL DEFAULT '{}',
	qualifier_keys text[] NOT NULL DEFAULT '{}',
	sort_order smallint NOT NULL DEFAULT 100,
	created_at timestamptz NOT NULL DEFAULT now(),
	CONSTRAINT knowledge_predicates_entity_objects CHECK (
		value_type = 'entity' OR object_kinds = '{}'
	)
);

COMMENT ON TABLE public.knowledge_predicates IS
	'Properties and relationships. shareable_subject_kinds lists where a fact may be public; personal contact methods and relationships to the user are never public.';

INSERT INTO public.knowledge_kinds (key, label, plural_label, description, shareable, sort_order) VALUES
	('person', 'Person', 'People', 'A human being: a contact, a colleague, a creator, an executive.', true, 10),
	('org', 'Organization', 'Organizations', 'A company, nonprofit, school, agency, show or other group.', true, 20),
	('website', 'Website', 'Websites', 'A website or web property, identified by its domain or URL.', true, 30),
	('channel', 'Channel', 'Channels', 'A YouTube channel, podcast, newsletter or other publishing channel.', true, 40),
	('video', 'Video', 'Videos', 'A single video, such as a YouTube video.', true, 50),
	('place', 'Place', 'Places', 'A city, region, office or other location.', true, 60),
	('topic', 'Topic', 'Topics', 'A subject, field or theme that other entities are about.', true, 70),
	('product', 'Product', 'Products', 'A product, service or tool.', true, 80),
	('event', 'Event', 'Events', 'A conference, meetup or other happening.', true, 90);

INSERT INTO public.knowledge_predicates
	(key, label, inverse_label, description, value_type, subject_kinds, object_kinds, cardinality, shareable_subject_kinds, qualifier_keys, sort_order)
VALUES
	('alias', 'Also known as', NULL, 'Another name, spelling, handle or nickname for this entity.', 'text', '{}', '{}', 'many', '{org,website,channel,video,place,topic,product,event}', '{}', 10),
	('description', 'Description', NULL, 'A short factual description of the entity.', 'text', '{}', '{}', 'one', '{org,website,channel,video,place,topic,product,event}', '{}', 20),
	('headline', 'Headline', NULL, 'A person''s current professional headline or title line, e.g. "CEO at Palantir".', 'text', '{person}', '{}', 'one', '{}', '{}', 30),
	('url', 'URL', NULL, 'The canonical web address of this entity itself: the website, the video page, the channel page.', 'url', '{website,channel,video,product,event}', '{}', 'one', '{website,channel,video,product,event}', '{}', 40),
	('homepage', 'Website', NULL, 'The main website of a person or organization.', 'url', '{person,org}', '{}', 'one', '{org}', '{}', 50),
	('profile_url', 'Profile', NULL, 'A profile page on a platform (LinkedIn, X, Instagram, GitHub, YouTube).', 'url', '{person,org}', '{}', 'many', '{org}', '{platform}', 60),
	('email', 'Email', NULL, 'An email address for contacting this person or organization.', 'email', '{person,org}', '{}', 'many', '{}', '{label}', 70),
	('phone', 'Phone', NULL, 'A phone number for contacting this person, organization or place.', 'phone', '{person,org,place}', '{}', 'many', '{}', '{label}', 80),
	('address', 'Address', NULL, 'A postal or street address.', 'text', '{person,org,place}', '{}', 'many', '{org,place}', '{label}', 90),
	('birthday', 'Birthday', NULL, 'A person''s birthday.', 'date', '{person}', '{}', 'one', '{}', '{}', 100),
	('note', 'Note', NULL, 'The user''s own note about this entity.', 'text', '{}', '{}', 'many', '{}', '{}', 110),
	('works_at', 'Works at', 'People', 'The person works or worked at the organization. Use qualifiers for title and dates.', 'entity', '{person}', '{org}', 'many', '{}', '{title,start,end,current}', 200),
	('knows', 'Knows', 'Known by', 'The subject person knows the object person. From the user''s own entity this means "I know them". Qualifier via says how (linkedin, phone, met, client, friend, family).', 'entity', '{person}', '{person}', 'many', '{}', '{via,since,context}', 210),
	('part_of', 'Part of', 'Includes', 'The organization is part of a larger organization, or a place lies within a larger place.', 'entity', '{org,place}', '{org,place}', 'many', '{org,place}', '{}', 220),
	('located_in', 'Located in', 'Here', 'The entity is based in or located at the place.', 'entity', '{person,org,event,website}', '{place}', 'many', '{org,event}', '{}', 230),
	('owns', 'Owns', 'Owned by', 'The subject owns or runs the object: a website, channel, video, product or organization.', 'entity', '{person,org}', '{website,channel,video,product,org}', 'many', '{org}', '{role}', 240),
	('published_by', 'Published by', 'Videos', 'The video was published on this channel.', 'entity', '{video}', '{channel}', 'one', '{video}', '{}', 250),
	('features', 'Features', 'Appears in', 'The video or channel features this person, organization, product or topic.', 'entity', '{video,channel}', '{person,org,product,topic}', 'many', '{video,channel}', '{}', 260),
	('about', 'About', 'Covered by', 'The entity is about this topic.', 'entity', '{video,channel,website,product,event,org}', '{topic}', 'many', '{video,channel,website,product,event,org}', '{}', 270),
	('related_to', 'Related to', 'Related to', 'A loose connection when no more specific relationship fits. Prefer a specific predicate.', 'entity', '{}', '{}', 'many', '{}', '{context}', 900),
	('industry', 'Industry', NULL, 'The organization''s industry or field.', 'text', '{org}', '{}', 'many', '{org}', '{}', 300),
	('founded', 'Founded', NULL, 'When the organization was founded.', 'date', '{org}', '{}', 'one', '{org}', '{}', 310),
	('published_at', 'Published', NULL, 'When the video was published.', 'date', '{video}', '{}', 'one', '{video}', '{}', 320),
	('duration_seconds', 'Length (seconds)', NULL, 'The video''s length in seconds.', 'number', '{video}', '{}', 'one', '{video}', '{}', 330),
	('thumbnail_url', 'Thumbnail', NULL, 'An image URL representing the entity.', 'url', '{video,channel,website,org,person,product}', '{}', 'one', '{video,channel,website,org,product}', '{}', 340);

-- ============================================================================
-- 2. ENTITIES
-- ============================================================================

CREATE TABLE public.knowledge_entities (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	kind text NOT NULL REFERENCES public.knowledge_kinds(key),
	name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 300),
	normalized_name text GENERATED ALWAYS AS (
		lower(regexp_replace(btrim(name), '\s+', ' ', 'g'))
	) STORED,
	-- One line under the name ("CEO at Palantir", "YouTube channel"). Kept in sync by writers.
	summary text CHECK (summary IS NULL OR char_length(summary) <= 300),
	image_url text CHECK (image_url IS NULL OR char_length(image_url) <= 2000),
	scope text NOT NULL CHECK (scope IN ('public', 'private')),
	owner_user_id uuid REFERENCES public.users(id) ON DELETE CASCADE,
	-- The user's own person entity: the start of "people I know" paths.
	is_self boolean NOT NULL DEFAULT false,
	status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'hidden', 'merged')),
	merged_into_id uuid REFERENCES public.knowledge_entities(id) ON DELETE SET NULL,
	created_via text NOT NULL DEFAULT 'manual' CHECK (created_via IN (
		'import', 'chat', 'mcp', 'enrichment', 'task', 'manual', 'backfill', 'system'
	)),
	enriched_at timestamptz,
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now(),
	CONSTRAINT knowledge_entities_scope_owner CHECK ((scope = 'private') = (owner_user_id IS NOT NULL)),
	CONSTRAINT knowledge_entities_self_private CHECK (NOT is_self OR (scope = 'private' AND kind = 'person')),
	CONSTRAINT knowledge_entities_merge_status CHECK ((status = 'merged') = (merged_into_id IS NOT NULL)),
	CONSTRAINT knowledge_entities_not_self_merge CHECK (merged_into_id IS DISTINCT FROM id)
);

CREATE UNIQUE INDEX knowledge_entities_one_self
	ON public.knowledge_entities (owner_user_id) WHERE is_self;
CREATE INDEX knowledge_entities_owner_kind
	ON public.knowledge_entities (owner_user_id, kind, status);
CREATE INDEX knowledge_entities_public_kind
	ON public.knowledge_entities (kind) WHERE scope = 'public' AND status = 'active';
CREATE INDEX knowledge_entities_name_trgm
	ON public.knowledge_entities USING gin (normalized_name gin_trgm_ops);
CREATE INDEX knowledge_entities_merged_into
	ON public.knowledge_entities (merged_into_id) WHERE merged_into_id IS NOT NULL;

COMMENT ON TABLE public.knowledge_entities IS
	'Knowledge graph entities. Public rows are shared identity (no owner); private rows belong to one user.';

-- Deterministic identifiers used to recognise the same entity again: a domain, a YouTube video
-- or channel id, a LinkedIn profile, a hashed email or phone. Structured values, never names.
CREATE TABLE public.knowledge_entity_keys (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	entity_id uuid NOT NULL REFERENCES public.knowledge_entities(id) ON DELETE CASCADE,
	key_type text NOT NULL CHECK (key_type IN (
		'domain', 'url', 'youtube_video', 'youtube_channel', 'linkedin', 'email', 'phone', 'external'
	)),
	key_value text NOT NULL CHECK (char_length(key_value) BETWEEN 1 AND 500),
	scope text NOT NULL CHECK (scope IN ('public', 'private')),
	owner_user_id uuid REFERENCES public.users(id) ON DELETE CASCADE,
	created_at timestamptz NOT NULL DEFAULT now(),
	CONSTRAINT knowledge_entity_keys_scope_owner CHECK ((scope = 'private') = (owner_user_id IS NOT NULL)),
	CONSTRAINT knowledge_entity_keys_contact_private CHECK (
		scope = 'private' OR key_type NOT IN ('email', 'phone')
	)
);

CREATE UNIQUE INDEX knowledge_entity_keys_unique
	ON public.knowledge_entity_keys (key_type, key_value, scope, owner_user_id) NULLS NOT DISTINCT;
CREATE INDEX knowledge_entity_keys_entity ON public.knowledge_entity_keys (entity_id);

-- ============================================================================
-- 3. RUNS (imports and enrichment), referenced by facts
-- ============================================================================

CREATE TABLE public.knowledge_runs (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	owner_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
	run_type text NOT NULL CHECK (run_type IN ('import', 'enrichment', 'backfill')),
	status text NOT NULL DEFAULT 'queued' CHECK (status IN (
		'queued', 'running', 'completed', 'partial', 'failed', 'cancelled'
	)),
	title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
	-- import: {format, file_name}; enrichment: {fields, instructions}
	input jsonb NOT NULL DEFAULT '{}'::jsonb,
	-- import: {rows, people, orgs, facts, merged, skipped}; enrichment: {targets, done, failed, facts}
	stats jsonb NOT NULL DEFAULT '{}'::jsonb,
	error text,
	budget_usd numeric(10, 4),
	cost_usd numeric(10, 6) NOT NULL DEFAULT 0,
	created_at timestamptz NOT NULL DEFAULT now(),
	started_at timestamptz,
	finished_at timestamptz,
	updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX knowledge_runs_owner ON public.knowledge_runs (owner_user_id, created_at DESC);

CREATE TABLE public.knowledge_run_targets (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	run_id uuid NOT NULL REFERENCES public.knowledge_runs(id) ON DELETE CASCADE,
	owner_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
	entity_id uuid NOT NULL REFERENCES public.knowledge_entities(id) ON DELETE CASCADE,
	status text NOT NULL DEFAULT 'queued' CHECK (status IN (
		'queued', 'running', 'done', 'failed', 'cancelled', 'skipped'
	)),
	fields text[] NOT NULL DEFAULT '{}',
	summary text,
	facts_added integer NOT NULL DEFAULT 0,
	cost_usd numeric(10, 6) NOT NULL DEFAULT 0,
	error text,
	started_at timestamptz,
	finished_at timestamptz,
	created_at timestamptz NOT NULL DEFAULT now(),
	CONSTRAINT knowledge_run_targets_unique UNIQUE (run_id, entity_id)
);

CREATE INDEX knowledge_run_targets_entity ON public.knowledge_run_targets (entity_id, created_at DESC);

-- ============================================================================
-- 4. FACTS (properties and relationships)
-- ============================================================================

CREATE TABLE public.knowledge_facts (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	entity_id uuid NOT NULL REFERENCES public.knowledge_entities(id) ON DELETE CASCADE,
	predicate text NOT NULL REFERENCES public.knowledge_predicates(key),
	-- Exactly one of object_entity_id (a relationship) or value_text (a property).
	object_entity_id uuid REFERENCES public.knowledge_entities(id) ON DELETE CASCADE,
	value_text text CHECK (value_text IS NULL OR char_length(value_text) BETWEEN 1 AND 4000),
	-- Structured value where the type needs it (number, json); value_text stays the display form.
	value jsonb,
	qualifiers jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(qualifiers) = 'object'),
	scope text NOT NULL CHECK (scope IN ('public', 'private')),
	owner_user_id uuid REFERENCES public.users(id) ON DELETE CASCADE,
	status text NOT NULL DEFAULT 'active' CHECK (status IN (
		'active', 'suggested', 'disputed', 'superseded', 'retracted'
	)),
	confidence real NOT NULL DEFAULT 0.8 CHECK (confidence BETWEEN 0 AND 1),
	valid_from date,
	valid_to date,
	observed_at timestamptz NOT NULL DEFAULT now(),
	created_via text NOT NULL DEFAULT 'manual' CHECK (created_via IN (
		'import', 'chat', 'mcp', 'enrichment', 'task', 'manual', 'backfill', 'system'
	)),
	run_id uuid REFERENCES public.knowledge_runs(id) ON DELETE SET NULL,
	dedupe_key text GENERATED ALWAYS AS (
		md5(entity_id::text || '|' || predicate || '|' ||
			coalesce(object_entity_id::text, lower(btrim(value_text))))
	) STORED,
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now(),
	CONSTRAINT knowledge_facts_one_object CHECK ((object_entity_id IS NULL) <> (value_text IS NULL)),
	CONSTRAINT knowledge_facts_scope_owner CHECK ((scope = 'private') = (owner_user_id IS NOT NULL)),
	CONSTRAINT knowledge_facts_no_self_loop CHECK (object_entity_id IS DISTINCT FROM entity_id),
	CONSTRAINT knowledge_facts_valid_range CHECK (valid_to IS NULL OR valid_from IS NULL OR valid_to >= valid_from)
);

CREATE UNIQUE INDEX knowledge_facts_dedupe
	ON public.knowledge_facts (dedupe_key, scope, owner_user_id) NULLS NOT DISTINCT;
CREATE INDEX knowledge_facts_subject ON public.knowledge_facts (entity_id, predicate);
CREATE INDEX knowledge_facts_object ON public.knowledge_facts (object_entity_id, predicate)
	WHERE object_entity_id IS NOT NULL;
CREATE INDEX knowledge_facts_owner ON public.knowledge_facts (owner_user_id, predicate);
CREATE INDEX knowledge_facts_run ON public.knowledge_facts (run_id) WHERE run_id IS NOT NULL;
CREATE INDEX knowledge_facts_value_trgm ON public.knowledge_facts
	USING gin (lower(value_text) gin_trgm_ops)
	WHERE predicate IN ('alias', 'email', 'headline', 'homepage', 'url');

COMMENT ON TABLE public.knowledge_facts IS
	'One property (value_text) or relationship (object_entity_id) of an entity, with scope, status, validity dates and provenance.';

-- ============================================================================
-- 5. SOURCES
-- ============================================================================

CREATE TABLE public.knowledge_sources (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	scope text NOT NULL CHECK (scope IN ('public', 'private')),
	owner_user_id uuid REFERENCES public.users(id) ON DELETE CASCADE,
	source_type text NOT NULL CHECK (source_type IN (
		'web', 'import', 'user', 'task', 'document', 'chat', 'youtube', 'agent'
	)),
	url text CHECK (url IS NULL OR char_length(url) <= 2000),
	title text CHECK (title IS NULL OR char_length(title) <= 500),
	-- For task/document/chat sources: the BuildOS record it came from.
	record_id uuid,
	captured_at timestamptz NOT NULL DEFAULT now(),
	published_at timestamptz,
	content_hash text,
	meta jsonb NOT NULL DEFAULT '{}'::jsonb,
	created_at timestamptz NOT NULL DEFAULT now(),
	CONSTRAINT knowledge_sources_scope_owner CHECK ((scope = 'private') = (owner_user_id IS NOT NULL)),
	CONSTRAINT knowledge_sources_public_web CHECK (
		scope = 'private' OR (source_type IN ('web', 'youtube') AND url IS NOT NULL)
	)
);

CREATE INDEX knowledge_sources_owner ON public.knowledge_sources (owner_user_id, captured_at DESC);
CREATE INDEX knowledge_sources_url ON public.knowledge_sources (url) WHERE url IS NOT NULL;

CREATE TABLE public.knowledge_fact_sources (
	fact_id uuid NOT NULL REFERENCES public.knowledge_facts(id) ON DELETE CASCADE,
	source_id uuid NOT NULL REFERENCES public.knowledge_sources(id) ON DELETE CASCADE,
	-- The exact words from the source that support the fact.
	quote text CHECK (quote IS NULL OR char_length(quote) <= 1000),
	created_at timestamptz NOT NULL DEFAULT now(),
	PRIMARY KEY (fact_id, source_id)
);

CREATE INDEX knowledge_fact_sources_source ON public.knowledge_fact_sources (source_id);

-- ============================================================================
-- 6. LINKS TO BUILDOS RECORDS, MERGE CANDIDATES
-- ============================================================================

-- A user's private link between an entity and a task, document, project or chat. No project_id
-- column: the linked record keeps its own access rules and ids survive project folds.
CREATE TABLE public.knowledge_record_links (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	entity_id uuid NOT NULL REFERENCES public.knowledge_entities(id) ON DELETE CASCADE,
	owner_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
	record_kind text NOT NULL CHECK (record_kind IN ('task', 'document', 'project', 'goal', 'chat_session')),
	record_id uuid NOT NULL,
	quote text CHECK (quote IS NULL OR char_length(quote) <= 1000),
	created_via text NOT NULL DEFAULT 'manual' CHECK (created_via IN (
		'import', 'chat', 'mcp', 'enrichment', 'task', 'manual', 'backfill', 'system'
	)),
	created_at timestamptz NOT NULL DEFAULT now(),
	CONSTRAINT knowledge_record_links_unique UNIQUE (entity_id, owner_user_id, record_kind, record_id)
);

CREATE INDEX knowledge_record_links_record ON public.knowledge_record_links (owner_user_id, record_kind, record_id);

CREATE TABLE public.knowledge_merge_candidates (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	owner_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
	entity_a uuid NOT NULL REFERENCES public.knowledge_entities(id) ON DELETE CASCADE,
	entity_b uuid NOT NULL REFERENCES public.knowledge_entities(id) ON DELETE CASCADE,
	reason text NOT NULL CHECK (char_length(reason) BETWEEN 1 AND 500),
	score real NOT NULL DEFAULT 0.5 CHECK (score BETWEEN 0 AND 1),
	status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'merged', 'rejected')),
	created_at timestamptz NOT NULL DEFAULT now(),
	resolved_at timestamptz,
	CONSTRAINT knowledge_merge_candidates_distinct CHECK (entity_a <> entity_b)
);

CREATE UNIQUE INDEX knowledge_merge_candidates_pair
	ON public.knowledge_merge_candidates (owner_user_id, LEAST(entity_a, entity_b), GREATEST(entity_a, entity_b));

-- ============================================================================
-- 7. GUARDS (every writer, including the service role)
-- ============================================================================

-- A private row must belong to the owner of any private entity it touches; a public row may
-- only touch public entities and shareable predicates.
CREATE OR REPLACE FUNCTION public.knowledge_facts_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
	v_subject record;
	v_object record;
	v_pred record;
BEGIN
	SELECT id, kind, scope, owner_user_id, status INTO v_subject
	FROM public.knowledge_entities WHERE id = NEW.entity_id;
	IF NOT FOUND THEN
		RAISE EXCEPTION 'knowledge fact subject % not found', NEW.entity_id USING ERRCODE = '23503';
	END IF;

	SELECT * INTO v_pred FROM public.knowledge_predicates WHERE key = NEW.predicate;

	IF v_subject.scope = 'private' AND (NEW.scope <> 'private' OR NEW.owner_user_id <> v_subject.owner_user_id) THEN
		RAISE EXCEPTION 'a fact about a private entity must be private to its owner' USING ERRCODE = '42501';
	END IF;

	IF cardinality(v_pred.subject_kinds) > 0 AND NOT (v_subject.kind = ANY (v_pred.subject_kinds)) THEN
		RAISE EXCEPTION '% does not apply to a %', NEW.predicate, v_subject.kind USING ERRCODE = '22023';
	END IF;

	IF v_pred.value_type = 'entity' THEN
		IF NEW.object_entity_id IS NULL THEN
			RAISE EXCEPTION '% needs an entity, not a value', NEW.predicate USING ERRCODE = '22023';
		END IF;
		SELECT id, kind, scope, owner_user_id INTO v_object
		FROM public.knowledge_entities WHERE id = NEW.object_entity_id;
		IF NOT FOUND THEN
			RAISE EXCEPTION 'knowledge fact object % not found', NEW.object_entity_id USING ERRCODE = '23503';
		END IF;
		IF cardinality(v_pred.object_kinds) > 0 AND NOT (v_object.kind = ANY (v_pred.object_kinds)) THEN
			RAISE EXCEPTION '% cannot point at a %', NEW.predicate, v_object.kind USING ERRCODE = '22023';
		END IF;
		IF v_object.scope = 'private' AND (NEW.scope <> 'private' OR NEW.owner_user_id <> v_object.owner_user_id) THEN
			RAISE EXCEPTION 'a fact may only point at your own private entities' USING ERRCODE = '42501';
		END IF;
	ELSIF NEW.object_entity_id IS NOT NULL THEN
		RAISE EXCEPTION '% takes a value, not an entity', NEW.predicate USING ERRCODE = '22023';
	END IF;

	IF NEW.scope = 'public' AND NOT (v_subject.kind = ANY (v_pred.shareable_subject_kinds)) THEN
		RAISE EXCEPTION '% on a % is never shared', NEW.predicate, v_subject.kind USING ERRCODE = '42501';
	END IF;

	NEW.updated_at := now();
	RETURN NEW;
END;
$$;

CREATE TRIGGER knowledge_facts_guard
	BEFORE INSERT OR UPDATE OF entity_id, object_entity_id, predicate, scope, owner_user_id
	ON public.knowledge_facts
	FOR EACH ROW EXECUTE FUNCTION public.knowledge_facts_guard();

CREATE OR REPLACE FUNCTION public.knowledge_entity_keys_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
	v_entity record;
BEGIN
	SELECT scope, owner_user_id INTO v_entity FROM public.knowledge_entities WHERE id = NEW.entity_id;
	IF NOT FOUND THEN
		RAISE EXCEPTION 'knowledge entity % not found', NEW.entity_id USING ERRCODE = '23503';
	END IF;
	IF v_entity.scope = 'private' AND (NEW.scope <> 'private' OR NEW.owner_user_id <> v_entity.owner_user_id) THEN
		RAISE EXCEPTION 'a key on a private entity must be private to its owner' USING ERRCODE = '42501';
	END IF;
	RETURN NEW;
END;
$$;

CREATE TRIGGER knowledge_entity_keys_guard
	BEFORE INSERT OR UPDATE ON public.knowledge_entity_keys
	FOR EACH ROW EXECUTE FUNCTION public.knowledge_entity_keys_guard();

-- A public fact may cite only a public source; a private fact may cite its owner's private
-- sources or public ones.
CREATE OR REPLACE FUNCTION public.knowledge_fact_sources_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
	v_fact record;
	v_source record;
BEGIN
	SELECT scope, owner_user_id INTO v_fact FROM public.knowledge_facts WHERE id = NEW.fact_id;
	SELECT scope, owner_user_id INTO v_source FROM public.knowledge_sources WHERE id = NEW.source_id;
	IF v_fact.scope IS NULL OR v_source.scope IS NULL THEN
		RAISE EXCEPTION 'fact or source not found' USING ERRCODE = '23503';
	END IF;
	IF v_source.scope = 'private' AND (v_fact.scope <> 'private' OR v_fact.owner_user_id <> v_source.owner_user_id) THEN
		RAISE EXCEPTION 'a private source can only support its owner''s private facts' USING ERRCODE = '42501';
	END IF;
	RETURN NEW;
END;
$$;

CREATE TRIGGER knowledge_fact_sources_guard
	BEFORE INSERT OR UPDATE ON public.knowledge_fact_sources
	FOR EACH ROW EXECUTE FUNCTION public.knowledge_fact_sources_guard();

-- Entities: public kind check, and scope/owner never change after creation.
CREATE OR REPLACE FUNCTION public.knowledge_entities_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
	IF TG_OP = 'UPDATE' AND (NEW.scope IS DISTINCT FROM OLD.scope OR NEW.owner_user_id IS DISTINCT FROM OLD.owner_user_id) THEN
		RAISE EXCEPTION 'an entity''s scope and owner cannot change' USING ERRCODE = '42501';
	END IF;
	IF NEW.scope = 'public' AND NOT EXISTS (
		SELECT 1 FROM public.knowledge_kinds k WHERE k.key = NEW.kind AND k.shareable
	) THEN
		RAISE EXCEPTION '% entities are never shared', NEW.kind USING ERRCODE = '42501';
	END IF;
	IF NEW.merged_into_id IS NOT NULL THEN
		PERFORM 1 FROM public.knowledge_entities t
		WHERE t.id = NEW.merged_into_id
			AND (t.scope = 'public' OR t.owner_user_id = NEW.owner_user_id);
		IF NOT FOUND THEN
			RAISE EXCEPTION 'an entity can only merge into a public entity or one you own' USING ERRCODE = '42501';
		END IF;
	END IF;
	NEW.updated_at := now();
	RETURN NEW;
END;
$$;

CREATE TRIGGER knowledge_entities_guard
	BEFORE INSERT OR UPDATE ON public.knowledge_entities
	FOR EACH ROW EXECUTE FUNCTION public.knowledge_entities_guard();

REVOKE ALL ON FUNCTION public.knowledge_facts_guard() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.knowledge_entity_keys_guard() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.knowledge_fact_sources_guard() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.knowledge_entities_guard() FROM PUBLIC, anon, authenticated;

-- ============================================================================
-- 8. ACCESS
-- ============================================================================

ALTER TABLE public.knowledge_kinds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.knowledge_predicates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.knowledge_entities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.knowledge_entity_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.knowledge_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.knowledge_run_targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.knowledge_facts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.knowledge_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.knowledge_fact_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.knowledge_record_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.knowledge_merge_candidates ENABLE ROW LEVEL SECURITY;

CREATE POLICY knowledge_kinds_read ON public.knowledge_kinds
	FOR SELECT TO authenticated USING (true);
CREATE POLICY knowledge_predicates_read ON public.knowledge_predicates
	FOR SELECT TO authenticated USING (true);

-- Entities: everyone signed in sees active public entities; owners see their own.
CREATE POLICY knowledge_entities_read ON public.knowledge_entities
	FOR SELECT TO authenticated
	USING ((scope = 'public' AND status <> 'hidden') OR owner_user_id = (SELECT auth.uid()));
CREATE POLICY knowledge_entities_insert ON public.knowledge_entities
	FOR INSERT TO authenticated
	WITH CHECK (scope = 'private' AND owner_user_id = (SELECT auth.uid()));
CREATE POLICY knowledge_entities_update ON public.knowledge_entities
	FOR UPDATE TO authenticated
	USING (scope = 'private' AND owner_user_id = (SELECT auth.uid()))
	WITH CHECK (scope = 'private' AND owner_user_id = (SELECT auth.uid()));
CREATE POLICY knowledge_entities_delete ON public.knowledge_entities
	FOR DELETE TO authenticated
	USING (scope = 'private' AND owner_user_id = (SELECT auth.uid()) AND NOT is_self);

-- Keys, facts and sources share one rule: public rows readable, private rows owner-only, and
-- signed-in users write only private rows they own.
CREATE POLICY knowledge_entity_keys_read ON public.knowledge_entity_keys
	FOR SELECT TO authenticated
	USING (scope = 'public' OR owner_user_id = (SELECT auth.uid()));
CREATE POLICY knowledge_entity_keys_write ON public.knowledge_entity_keys
	FOR ALL TO authenticated
	USING (scope = 'private' AND owner_user_id = (SELECT auth.uid()))
	WITH CHECK (scope = 'private' AND owner_user_id = (SELECT auth.uid()));

CREATE POLICY knowledge_facts_read ON public.knowledge_facts
	FOR SELECT TO authenticated
	USING (scope = 'public' OR owner_user_id = (SELECT auth.uid()));
CREATE POLICY knowledge_facts_write ON public.knowledge_facts
	FOR ALL TO authenticated
	USING (scope = 'private' AND owner_user_id = (SELECT auth.uid()))
	WITH CHECK (scope = 'private' AND owner_user_id = (SELECT auth.uid()));

CREATE POLICY knowledge_sources_read ON public.knowledge_sources
	FOR SELECT TO authenticated
	USING (scope = 'public' OR owner_user_id = (SELECT auth.uid()));
CREATE POLICY knowledge_sources_write ON public.knowledge_sources
	FOR ALL TO authenticated
	USING (scope = 'private' AND owner_user_id = (SELECT auth.uid()))
	WITH CHECK (scope = 'private' AND owner_user_id = (SELECT auth.uid()));

-- A citation is visible when its fact is visible (the fact's own policy applies in the subquery).
CREATE POLICY knowledge_fact_sources_read ON public.knowledge_fact_sources
	FOR SELECT TO authenticated
	USING (EXISTS (SELECT 1 FROM public.knowledge_facts f WHERE f.id = fact_id)
		AND EXISTS (SELECT 1 FROM public.knowledge_sources s WHERE s.id = source_id));
CREATE POLICY knowledge_fact_sources_write ON public.knowledge_fact_sources
	FOR ALL TO authenticated
	USING (EXISTS (SELECT 1 FROM public.knowledge_facts f
		WHERE f.id = fact_id AND f.scope = 'private' AND f.owner_user_id = (SELECT auth.uid())))
	WITH CHECK (EXISTS (SELECT 1 FROM public.knowledge_facts f
		WHERE f.id = fact_id AND f.scope = 'private' AND f.owner_user_id = (SELECT auth.uid())));

CREATE POLICY knowledge_record_links_owner ON public.knowledge_record_links
	FOR ALL TO authenticated
	USING (owner_user_id = (SELECT auth.uid()))
	WITH CHECK (owner_user_id = (SELECT auth.uid())
		AND EXISTS (SELECT 1 FROM public.knowledge_entities e WHERE e.id = entity_id));

CREATE POLICY knowledge_merge_candidates_owner ON public.knowledge_merge_candidates
	FOR ALL TO authenticated
	USING (owner_user_id = (SELECT auth.uid()))
	WITH CHECK (owner_user_id = (SELECT auth.uid()));

-- Runs: owners read them and may create imports/enrichment requests. Owners may update status and
-- progress (imports run in the web request); cost and budget are written only by the server.
CREATE POLICY knowledge_runs_read ON public.knowledge_runs
	FOR SELECT TO authenticated USING (owner_user_id = (SELECT auth.uid()));
CREATE POLICY knowledge_runs_insert ON public.knowledge_runs
	FOR INSERT TO authenticated WITH CHECK (owner_user_id = (SELECT auth.uid()));
CREATE POLICY knowledge_runs_cancel ON public.knowledge_runs
	FOR UPDATE TO authenticated
	USING (owner_user_id = (SELECT auth.uid()))
	WITH CHECK (owner_user_id = (SELECT auth.uid()));
CREATE POLICY knowledge_run_targets_read ON public.knowledge_run_targets
	FOR SELECT TO authenticated USING (owner_user_id = (SELECT auth.uid()));

REVOKE ALL ON TABLE
	public.knowledge_kinds, public.knowledge_predicates, public.knowledge_entities,
	public.knowledge_entity_keys, public.knowledge_runs, public.knowledge_run_targets,
	public.knowledge_facts, public.knowledge_sources, public.knowledge_fact_sources,
	public.knowledge_record_links, public.knowledge_merge_candidates
FROM PUBLIC, anon, authenticated;

GRANT SELECT ON TABLE public.knowledge_kinds, public.knowledge_predicates TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
	public.knowledge_entities, public.knowledge_entity_keys, public.knowledge_facts,
	public.knowledge_sources, public.knowledge_fact_sources, public.knowledge_record_links,
	public.knowledge_merge_candidates
TO authenticated;
GRANT SELECT, INSERT ON TABLE public.knowledge_runs TO authenticated;
GRANT UPDATE (status, stats, error, started_at, finished_at, updated_at) ON TABLE public.knowledge_runs TO authenticated;
GRANT SELECT ON TABLE public.knowledge_run_targets TO authenticated;

GRANT ALL ON TABLE
	public.knowledge_kinds, public.knowledge_predicates, public.knowledge_entities,
	public.knowledge_entity_keys, public.knowledge_runs, public.knowledge_run_targets,
	public.knowledge_facts, public.knowledge_sources, public.knowledge_fact_sources,
	public.knowledge_record_links, public.knowledge_merge_candidates
TO service_role;

-- ============================================================================
-- 9. READ FUNCTIONS (security invoker: RLS decides what the caller sees)
-- ============================================================================

-- Name, alias, email and URL search over everything the caller can see. Merged entities
-- resolve to the entity they merged into.
-- The viewer is the signed-in user. Server code running as the service role (chat worker, MCP
-- connector) bypasses RLS, so it must pass p_viewer and the function filters explicitly; a
-- signed-in caller cannot pass someone else's id.
CREATE OR REPLACE FUNCTION public.knowledge_viewer(p_viewer uuid)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
	v_uid uuid := auth.uid();
BEGIN
	IF v_uid IS NOT NULL AND p_viewer IS NOT NULL AND p_viewer <> v_uid THEN
		RAISE EXCEPTION 'Viewer mismatch' USING ERRCODE = '42501';
	END IF;
	IF coalesce(v_uid, p_viewer) IS NULL THEN
		RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
	END IF;
	RETURN coalesce(v_uid, p_viewer);
END;
$$;

REVOKE ALL ON FUNCTION public.knowledge_viewer(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.knowledge_viewer(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.knowledge_search(
	p_query text,
	p_kinds text[] DEFAULT NULL,
	p_limit integer DEFAULT 20,
	p_viewer uuid DEFAULT NULL
) RETURNS TABLE (
	entity_id uuid,
	kind text,
	name text,
	summary text,
	scope text,
	is_self boolean,
	matched_on text,
	score real
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
	v_viewer uuid := public.knowledge_viewer(p_viewer);
	v_term text := lower(regexp_replace(btrim(coalesce(p_query, '')), '\s+', ' ', 'g'));
BEGIN
	IF char_length(v_term) < 2 THEN
		RETURN;
	END IF;
	RETURN QUERY
	WITH hits AS (
		SELECT e.id, 'name'::text AS matched_on,
			GREATEST(similarity(e.normalized_name, v_term),
				CASE WHEN e.normalized_name = v_term THEN 1.0
					WHEN e.normalized_name LIKE v_term || '%' THEN 0.9
					WHEN e.normalized_name LIKE '%' || v_term || '%' THEN 0.7
					ELSE 0 END)::real AS score
		FROM public.knowledge_entities e
		WHERE e.status = 'active'
			AND (e.scope = 'public' OR e.owner_user_id = v_viewer)
			AND (e.normalized_name % v_term OR e.normalized_name LIKE '%' || v_term || '%')
		UNION ALL
		SELECT f.entity_id, f.predicate,
			(GREATEST(similarity(lower(f.value_text), v_term),
				CASE WHEN lower(f.value_text) LIKE '%' || v_term || '%' THEN 0.75 ELSE 0 END) * 0.95)::real
		FROM public.knowledge_facts f
		WHERE f.predicate IN ('alias', 'email', 'headline', 'homepage', 'url')
			AND f.status IN ('active', 'suggested')
			AND (f.scope = 'public' OR f.owner_user_id = v_viewer)
			AND (lower(f.value_text) % v_term OR lower(f.value_text) LIKE '%' || v_term || '%')
	),
	best AS (
		SELECT DISTINCT ON (h.id) h.id, h.matched_on, h.score
		FROM hits h
		ORDER BY h.id, h.score DESC
	)
	SELECT e.id, e.kind, e.name, e.summary, e.scope, e.is_self, b.matched_on, b.score
	FROM best b
	JOIN public.knowledge_entities e ON e.id = b.id
	WHERE e.status = 'active'
		AND (e.scope = 'public' OR e.owner_user_id = v_viewer)
		AND (p_kinds IS NULL OR e.kind = ANY (p_kinds))
	ORDER BY b.score DESC, e.name
	LIMIT LEAST(GREATEST(coalesce(p_limit, 20), 1), 100);
END;
$$;

REVOKE ALL ON FUNCTION public.knowledge_search(text, text[], integer, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.knowledge_search(text, text[], integer, uuid) TO authenticated, service_role;

-- Merge one of the caller's private entities into another entity they can see (their own or
-- a public one). Facts, keys and links move over and stay private; duplicates collapse.
-- Merging never changes who can see anything.
CREATE OR REPLACE FUNCTION public.knowledge_merge_entities(p_keep uuid, p_merge uuid, p_viewer uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
	v_uid uuid := public.knowledge_viewer(p_viewer);
	v_keep record;
	v_merge record;
	v_moved integer := 0;
	v_dropped integer := 0;
BEGIN
	IF p_keep IS NULL OR p_merge IS NULL OR p_keep = p_merge THEN
		RAISE EXCEPTION 'Expected two different entities' USING ERRCODE = '22023';
	END IF;

	SELECT * INTO v_merge FROM public.knowledge_entities
	WHERE id = p_merge AND scope = 'private' AND owner_user_id = v_uid AND status <> 'merged' AND NOT is_self
	FOR UPDATE;
	IF NOT FOUND THEN
		RAISE EXCEPTION 'You can only merge away your own entities' USING ERRCODE = '42501';
	END IF;
	SELECT * INTO v_keep FROM public.knowledge_entities
	WHERE id = p_keep AND status = 'active' AND (scope = 'public' OR owner_user_id = v_uid);
	IF NOT FOUND THEN
		RAISE EXCEPTION 'Entity to keep not found' USING ERRCODE = '42501';
	END IF;
	IF v_keep.kind <> v_merge.kind THEN
		RAISE EXCEPTION 'Only entities of the same kind can merge' USING ERRCODE = '22023';
	END IF;

	-- Drop facts that would duplicate one already on the kept entity, then move the rest.
	WITH dup AS (
		DELETE FROM public.knowledge_facts f
		WHERE f.entity_id = p_merge AND f.owner_user_id = v_uid
			AND EXISTS (
				SELECT 1 FROM public.knowledge_facts k
				WHERE k.entity_id = p_keep AND k.predicate = f.predicate
					AND k.scope = 'private' AND k.owner_user_id = v_uid
					AND k.object_entity_id IS NOT DISTINCT FROM (CASE WHEN f.object_entity_id = p_keep THEN NULL ELSE f.object_entity_id END)
					AND (f.object_entity_id IS NOT NULL OR lower(btrim(k.value_text)) = lower(btrim(f.value_text)))
			)
		RETURNING 1
	)
	SELECT count(*) INTO v_dropped FROM dup;

	-- A relationship between the two collapses to nothing.
	DELETE FROM public.knowledge_facts
	WHERE owner_user_id = v_uid
		AND ((entity_id = p_merge AND object_entity_id = p_keep)
			OR (entity_id = p_keep AND object_entity_id = p_merge));

	UPDATE public.knowledge_facts SET entity_id = p_keep
	WHERE entity_id = p_merge AND owner_user_id = v_uid;
	GET DIAGNOSTICS v_moved = ROW_COUNT;

	-- Incoming relationships from the caller's own facts point at the kept entity.
	DELETE FROM public.knowledge_facts f
	WHERE f.object_entity_id = p_merge AND f.owner_user_id = v_uid
		AND EXISTS (SELECT 1 FROM public.knowledge_facts k
			WHERE k.entity_id = f.entity_id AND k.predicate = f.predicate
				AND k.object_entity_id = p_keep AND k.owner_user_id = v_uid);
	UPDATE public.knowledge_facts SET object_entity_id = p_keep
	WHERE object_entity_id = p_merge AND owner_user_id = v_uid;

	DELETE FROM public.knowledge_entity_keys k
	WHERE k.entity_id = p_merge AND EXISTS (
		SELECT 1 FROM public.knowledge_entity_keys o
		WHERE o.entity_id = p_keep AND o.key_type = k.key_type AND o.key_value = k.key_value
			AND o.scope = k.scope AND o.owner_user_id IS NOT DISTINCT FROM k.owner_user_id);
	UPDATE public.knowledge_entity_keys SET entity_id = p_keep
	WHERE entity_id = p_merge AND owner_user_id = v_uid;

	DELETE FROM public.knowledge_record_links l
	WHERE l.entity_id = p_merge AND l.owner_user_id = v_uid AND EXISTS (
		SELECT 1 FROM public.knowledge_record_links o
		WHERE o.entity_id = p_keep AND o.owner_user_id = v_uid
			AND o.record_kind = l.record_kind AND o.record_id = l.record_id);
	UPDATE public.knowledge_record_links SET entity_id = p_keep
	WHERE entity_id = p_merge AND owner_user_id = v_uid;

	-- The old name stays findable as a private alias.
	IF v_merge.normalized_name <> v_keep.normalized_name THEN
		INSERT INTO public.knowledge_facts (entity_id, predicate, value_text, scope, owner_user_id, created_via)
		VALUES (p_keep, 'alias', v_merge.name, 'private', v_uid, 'manual')
		ON CONFLICT DO NOTHING;
	END IF;

	UPDATE public.knowledge_entities SET status = 'merged', merged_into_id = p_keep WHERE id = p_merge;
	UPDATE public.knowledge_merge_candidates SET status = 'merged', resolved_at = now()
	WHERE owner_user_id = v_uid AND status = 'pending'
		AND ((entity_a = p_keep AND entity_b = p_merge) OR (entity_a = p_merge AND entity_b = p_keep));

	RETURN jsonb_build_object('kept', p_keep, 'merged', p_merge, 'facts_moved', v_moved, 'duplicates_dropped', v_dropped);
END;
$$;

REVOKE ALL ON FUNCTION public.knowledge_merge_entities(uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.knowledge_merge_entities(uuid, uuid, uuid) TO authenticated, service_role;

-- Enrichment requests run in the worker.
ALTER TYPE public.queue_type ADD VALUE IF NOT EXISTS 'knowledge_enrich';

COMMIT;
