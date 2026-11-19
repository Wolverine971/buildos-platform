-- supabase/migrations/20261118100000_knowledge_circles_identity.sql
-- Find more, part A "Get it right" (tasker 164).
--
-- 1. Circles. Every entry gets a circle: inner (people and orgs the user knows or works with),
--    public (public figures and companies the user wants to know about) or unknown. Decided from
--    structured signals first (how the entry arrived, `knows`/`owns` facts, private contact
--    details, links to tasks and docs), the cheap decision model only when those are ambiguous,
--    and the user's own answer above both. `circle_source` says which.
--    Setting a circle must not reorder "recently updated": the entities guard keeps updated_at
--    when only circle columns change.
-- 2. "Same one?" questions. A merge candidate can carry the question to show ("Is Jev, someone
--    you know, the same person as Jeff Bezos?") and where it came from (a same-name match on
--    write, or an identity check on research or a chat claim).
-- 3. "Not this one" hints. When the user rejects a research run, its facts are retracted (in
--    code, through the facts' existing RLS) and a private hint is kept: a label ("not the Cody
--    Shooting Complex in Long Grove, IA") plus the domains and pages it came from. Research uses
--    it next time: those domains are excluded from search and the label goes to the identity
--    check and the extraction prompt as a known non-match.
BEGIN;

SET LOCAL lock_timeout = '5s';

-- ---------------------------------------------------------------------------
-- 1. Circles

ALTER TABLE public.knowledge_entities
	ADD COLUMN IF NOT EXISTS circle text NOT NULL DEFAULT 'unknown',
	ADD COLUMN IF NOT EXISTS circle_source text,
	ADD COLUMN IF NOT EXISTS circle_set_at timestamptz;

ALTER TABLE public.knowledge_entities
	DROP CONSTRAINT IF EXISTS knowledge_entities_circle_check,
	ADD CONSTRAINT knowledge_entities_circle_check
		CHECK (circle IN ('inner', 'public', 'unknown')),
	DROP CONSTRAINT IF EXISTS knowledge_entities_circle_source_check,
	ADD CONSTRAINT knowledge_entities_circle_source_check
		CHECK (circle_source IS NULL OR circle_source IN ('signals', 'model', 'user'));

COMMENT ON COLUMN public.knowledge_entities.circle IS
	'inner = someone/something the owner knows or works with; public = a public figure or company they want to know about; unknown = not decided yet.';
COMMENT ON COLUMN public.knowledge_entities.circle_source IS
	'Who decided the circle: signals (how the entry arrived, knows/owns facts, contact details, linked work), model (the decision model, only when signals were ambiguous) or user.';

-- Same guard as 20261116230000, except a change that only touches circle columns keeps
-- updated_at, so classifying entries never reshuffles the "recently updated" list.
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
	IF TG_OP = 'UPDATE'
		AND ROW(NEW.kind, NEW.name, NEW.summary, NEW.image_url, NEW.status, NEW.merged_into_id,
			NEW.is_self, NEW.enriched_at, NEW.created_via)
			IS NOT DISTINCT FROM
			ROW(OLD.kind, OLD.name, OLD.summary, OLD.image_url, OLD.status, OLD.merged_into_id,
			OLD.is_self, OLD.enriched_at, OLD.created_via)
		AND (NEW.circle IS DISTINCT FROM OLD.circle
			OR NEW.circle_source IS DISTINCT FROM OLD.circle_source
			OR NEW.circle_set_at IS DISTINCT FROM OLD.circle_set_at)
	THEN
		NEW.updated_at := OLD.updated_at;
	ELSE
		NEW.updated_at := now();
	END IF;
	RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.knowledge_entities_guard() FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. "Same one?" questions on merge candidates

ALTER TABLE public.knowledge_merge_candidates
	ADD COLUMN IF NOT EXISTS question text,
	ADD COLUMN IF NOT EXISTS origin text NOT NULL DEFAULT 'name';

ALTER TABLE public.knowledge_merge_candidates
	DROP CONSTRAINT IF EXISTS knowledge_merge_candidates_question_length,
	ADD CONSTRAINT knowledge_merge_candidates_question_length
		CHECK (question IS NULL OR char_length(question) BETWEEN 1 AND 300),
	DROP CONSTRAINT IF EXISTS knowledge_merge_candidates_origin_check,
	ADD CONSTRAINT knowledge_merge_candidates_origin_check
		CHECK (origin IN ('name', 'identity'));

COMMENT ON COLUMN public.knowledge_merge_candidates.question IS
	'The question shown in the duplicates review, e.g. "Is Jev, someone you know, the same person as Jeff Bezos?". NULL for plain same-name matches.';
COMMENT ON COLUMN public.knowledge_merge_candidates.origin IS
	'name = same name on write; identity = an identity check (research page or chat claim) asked.';

-- ---------------------------------------------------------------------------
-- 3. "Not this one" research hints (private to the owner)

CREATE TABLE IF NOT EXISTS public.knowledge_research_hints (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	owner_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
	entity_id uuid NOT NULL REFERENCES public.knowledge_entities(id) ON DELETE CASCADE,
	-- 'not': research about this entry must not use what this describes.
	polarity text NOT NULL DEFAULT 'not' CHECK (polarity IN ('not')),
	label text NOT NULL CHECK (char_length(btrim(label)) BETWEEN 1 AND 300),
	domains text[] NOT NULL DEFAULT '{}' CHECK (cardinality(domains) <= 20),
	urls text[] NOT NULL DEFAULT '{}' CHECK (cardinality(urls) <= 20),
	run_id uuid REFERENCES public.knowledge_runs(id) ON DELETE SET NULL,
	created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS knowledge_research_hints_entity
	ON public.knowledge_research_hints (owner_user_id, entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS knowledge_research_hints_run
	ON public.knowledge_research_hints (run_id) WHERE run_id IS NOT NULL;

COMMENT ON TABLE public.knowledge_research_hints IS
	'Private research hints from "Not this one": what an entry is not (label, domains, pages). Used as anchors by the next research.';

ALTER TABLE public.knowledge_research_hints ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS knowledge_research_hints_read ON public.knowledge_research_hints;
CREATE POLICY knowledge_research_hints_read ON public.knowledge_research_hints
	FOR SELECT TO authenticated
	USING (owner_user_id = (SELECT auth.uid()));
DROP POLICY IF EXISTS knowledge_research_hints_insert ON public.knowledge_research_hints;
CREATE POLICY knowledge_research_hints_insert ON public.knowledge_research_hints
	FOR INSERT TO authenticated
	WITH CHECK (owner_user_id = (SELECT auth.uid())
		AND EXISTS (SELECT 1 FROM public.knowledge_entities e WHERE e.id = entity_id));
DROP POLICY IF EXISTS knowledge_research_hints_delete ON public.knowledge_research_hints;
CREATE POLICY knowledge_research_hints_delete ON public.knowledge_research_hints
	FOR DELETE TO authenticated
	USING (owner_user_id = (SELECT auth.uid()));

REVOKE ALL ON TABLE public.knowledge_research_hints FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, DELETE ON TABLE public.knowledge_research_hints TO authenticated;
GRANT ALL ON TABLE public.knowledge_research_hints TO service_role;

COMMIT;
