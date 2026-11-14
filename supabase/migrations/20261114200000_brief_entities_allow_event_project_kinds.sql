-- supabase/migrations/20261114200000_brief_entities_allow_event_project_kinds.sql
--
-- Each daily brief saves the list of things it mentions in ontology_brief_entities
-- (chat about a brief reads it). The brief worker saves calendar events as kind
-- 'event' and paused or recently changed projects as kind 'project', but the kind
-- check only allowed the nine kinds from the table's first version. One rejected
-- row fails the whole insert, so 25 of 42 briefs (30 days to 2026-11-14) saved no
-- rows at all.
--
-- This widens the check to the nine existing kinds plus 'event' and 'project'.
-- Every existing row already passes the old check, so every row passes the new one.
-- No rows are changed and no index is added.
--
-- The worker (recordBriefEntities) works before and after this is applied: until
-- then it retries a rejected batch without the two new kinds.

SET lock_timeout = '5s';
SET statement_timeout = '60s';

ALTER TABLE public.ontology_brief_entities
	DROP CONSTRAINT IF EXISTS ontology_brief_entities_kind_check,
	ADD CONSTRAINT ontology_brief_entities_kind_check
	CHECK (entity_kind IN (
		'task', 'goal', 'plan', 'milestone', 'output', 'document', 'risk', 'requirement',
		'decision',
		'event', 'project'
	));
