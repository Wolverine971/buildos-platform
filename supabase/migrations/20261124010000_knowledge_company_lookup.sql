-- supabase/migrations/20261124010000_knowledge_company_lookup.sql
--
-- "Where are my companies?" (tasker 170). After a contacts import, BuildOS looks each company
-- up in free sources before any paid web search, and asks "Which one?" when several companies
-- share a name.
--
--   1. queue type + run type for the lookup job (its own type, so it never uses up the three
--      research runs a user may have going)
--   2. company_directory        our own copy of a free company dataset (name → website, town)
--   3. company_lookup_cache     what each free outside source said about a name, kept so a
--                               company is looked up once and reused for every user
--   4. knowledge_company_lookups  per user and organization: what the lookup concluded, and
--                               the open "Which one?" question when it could not tell
--
-- Nothing here holds anything about a person. Tables 2 and 3 hold public company records and
-- no user reference at all; table 4 is private to its owner.

-- ---------------------------------------------------------------------------
-- 1. Job and run types

ALTER TYPE public.queue_type ADD VALUE IF NOT EXISTS 'knowledge_locate';

ALTER TABLE public.knowledge_runs DROP CONSTRAINT IF EXISTS knowledge_runs_run_type_check;
ALTER TABLE public.knowledge_runs
	ADD CONSTRAINT knowledge_runs_run_type_check
	CHECK (run_type IN ('import', 'enrichment', 'backfill', 'locate'));

-- ---------------------------------------------------------------------------
-- 2. The company directory (server-only reference data)
--
-- Loaded by apps/worker/scripts/company-directory-load.ts from the People Data Labs free
-- company dataset (CC BY 4.0). name_key is companyNameKey() from
-- packages/shared-agent-ops/src/knowledge/company-lookup.ts, computed by the loader: lowercase,
-- no punctuation, no legal form. No primary key on purpose: the table is replaced whole on each
-- load, is only ever read by name_key, and a second index would add several hundred MB.

CREATE TABLE IF NOT EXISTS public.company_directory (
	name_key text NOT NULL,
	name text NOT NULL,
	website text,
	locality text,
	region text,
	country text,
	industry text,
	size text,
	-- The headcount band as a number (1 = "1-10" ... 8 = "10001+", 0 = unknown), so the largest
	-- companies with a name are read first when many share it.
	size_rank smallint NOT NULL DEFAULT 0,
	founded smallint,
	linkedin_url text
);

CREATE INDEX IF NOT EXISTS company_directory_name_key
	ON public.company_directory (name_key, size_rank DESC);

COMMENT ON TABLE public.company_directory IS
	'Public company records (People Data Labs free company dataset, CC BY 4.0), read by name_key. Server-only. Replaced whole by the loader script.';

CREATE TABLE IF NOT EXISTS public.company_directory_loads (
	id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
	loaded_at timestamptz NOT NULL DEFAULT now(),
	-- The dataset release the file came from, as its publisher names it.
	release text NOT NULL CHECK (char_length(btrim(release)) BETWEEN 1 AND 200),
	row_count bigint NOT NULL CHECK (row_count >= 0),
	-- Which countries were kept ('*' = all).
	countries text[] NOT NULL DEFAULT '{}'
);

COMMENT ON TABLE public.company_directory_loads IS
	'One row per load of company_directory: which dataset release, how many rows, which countries.';

ALTER TABLE public.company_directory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_directory_loads ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.company_directory, public.company_directory_loads
	FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.company_directory, public.company_directory_loads TO service_role;
REVOKE ALL ON SEQUENCE public.company_directory_loads_id_seq FROM PUBLIC, anon, authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.company_directory_loads_id_seq TO service_role;

-- ---------------------------------------------------------------------------
-- 3. What the free outside sources said (server-only, shared by every user)

CREATE TABLE IF NOT EXISTS public.company_lookup_cache (
	source text NOT NULL CHECK (source IN ('wikidata', 'gleif', 'usaspending', 'clearbit', 'website')),
	-- companyNameKey() of the name asked about; for 'website', the domain that was read.
	name_key text NOT NULL CHECK (char_length(name_key) BETWEEN 1 AND 200),
	-- The companies the source returned for that name (possibly none).
	candidates jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(candidates) = 'array'),
	fetched_at timestamptz NOT NULL DEFAULT now(),
	PRIMARY KEY (source, name_key)
);

COMMENT ON TABLE public.company_lookup_cache IS
	'Answers from free company sources by name. Public company records only, no user reference. Server-only.';

ALTER TABLE public.company_lookup_cache ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.company_lookup_cache FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.company_lookup_cache TO service_role;

-- ---------------------------------------------------------------------------
-- 4. What the lookup concluded for one of a user's organizations

CREATE TABLE IF NOT EXISTS public.knowledge_company_lookups (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	owner_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
	entity_id uuid NOT NULL REFERENCES public.knowledge_entities(id) ON DELETE CASCADE,
	run_id uuid REFERENCES public.knowledge_runs(id) ON DELETE SET NULL,
	-- placed: saved as known. unconfirmed: saved as a suggestion. ask: several companies share
	-- the name, the user picks. common: too many share it to ask. none: no source knows it.
	outcome text NOT NULL CHECK (outcome IN ('placed', 'unconfirmed', 'ask', 'common', 'none')),
	-- The companies to choose between (ask), each with its website, town and sources.
	options jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(options) = 'array'),
	-- How many distinct companies carry the name across the sources.
	options_total integer NOT NULL DEFAULT 0 CHECK (options_total >= 0),
	question_status text CHECK (question_status IN ('open', 'answered', 'none_of_these', 'skipped')),
	-- options[].key of the company the user picked.
	chosen_key text CHECK (chosen_key IS NULL OR char_length(chosen_key) BETWEEN 1 AND 500),
	checked_at timestamptz NOT NULL DEFAULT now(),
	answered_at timestamptz,
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now(),
	CONSTRAINT knowledge_company_lookups_one_per_entity UNIQUE (owner_user_id, entity_id),
	-- Only an "ask" carries a question.
	CONSTRAINT knowledge_company_lookups_question CHECK ((outcome = 'ask') = (question_status IS NOT NULL)),
	CONSTRAINT knowledge_company_lookups_choice CHECK ((question_status = 'answered') = (chosen_key IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS knowledge_company_lookups_open
	ON public.knowledge_company_lookups (owner_user_id, checked_at DESC)
	WHERE question_status = 'open';
CREATE INDEX IF NOT EXISTS knowledge_company_lookups_entity
	ON public.knowledge_company_lookups (entity_id);
CREATE INDEX IF NOT EXISTS knowledge_company_lookups_run
	ON public.knowledge_company_lookups (run_id) WHERE run_id IS NOT NULL;

COMMENT ON TABLE public.knowledge_company_lookups IS
	'Per user and organization: what the free company lookup concluded, and the open "Which one?" question when several companies share the name. Private to the owner; written by the server.';

ALTER TABLE public.knowledge_company_lookups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS knowledge_company_lookups_read ON public.knowledge_company_lookups;
CREATE POLICY knowledge_company_lookups_read ON public.knowledge_company_lookups
	FOR SELECT TO authenticated
	USING (owner_user_id = (SELECT auth.uid()));

-- The owner answers their own question; what was found (outcome, options) is the server's.
DROP POLICY IF EXISTS knowledge_company_lookups_answer ON public.knowledge_company_lookups;
CREATE POLICY knowledge_company_lookups_answer ON public.knowledge_company_lookups
	FOR UPDATE TO authenticated
	USING (owner_user_id = (SELECT auth.uid()) AND question_status IS NOT NULL)
	WITH CHECK (owner_user_id = (SELECT auth.uid()) AND question_status IS NOT NULL);

REVOKE ALL ON TABLE public.knowledge_company_lookups FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.knowledge_company_lookups TO authenticated;
GRANT UPDATE (question_status, chosen_key, answered_at, updated_at)
	ON TABLE public.knowledge_company_lookups TO authenticated;
GRANT ALL ON TABLE public.knowledge_company_lookups TO service_role;
