-- supabase/migrations/20261118120000_knowledge_educated_at.sql
-- Knowledge graph: "Studied at" (educated_at), person → organization (tasker 160 follow-up).
--
-- DJ wants to ask research things like "find where they went to college". Schools are
-- organizations, so this is an entity relationship like works_at: private by default, never a
-- public fact on a person (shareable_subject_kinds is empty), with degree/field/years as
-- qualifiers. The vocabulary in packages/shared-agent-ops/src/knowledge/vocabulary.ts mirrors
-- this row (contacts-import.test.ts checks they match).
--
-- Rollback: DELETE FROM public.knowledge_predicates WHERE key = 'educated_at';
--   (fails while facts use it; retract those first).
BEGIN;

SET LOCAL lock_timeout = '5s';

INSERT INTO public.knowledge_predicates
	(key, label, inverse_label, description, value_type, subject_kinds, object_kinds, cardinality, shareable_subject_kinds, qualifier_keys, sort_order)
VALUES
	('educated_at', 'Studied at', 'Alumni', 'The person studied at the school, college or university (an organization). Use qualifiers for degree, field and years.', 'entity', '{person}', '{org}', 'many', '{}', '{degree,field,start,end}', 205)
ON CONFLICT (key) DO NOTHING;

COMMIT;
