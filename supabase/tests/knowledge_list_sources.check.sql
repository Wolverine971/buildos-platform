-- supabase/tests/knowledge_list_sources.check.sql
-- Disposable schema rehearsal only (20261124200000). knowledge_list says where each of the
-- caller's entries came from, filters on it, and counts per source.
--
--   Task Co    read out of a task, one task link        → work
--   Linked Co  LinkedIn export (company key)            → linkedin
--   Both Co    LinkedIn export + named by a doc         → work, linkedin
--   Phone Co   another contact import                   → contacts
--   Found Co   a web search made it                     → research
--   Typed Co   typed in by hand                         → manual
--   Lim Person LinkedIn export (profile key), a person  → linkedin
BEGIN;
-- The rehearsal copy has the schema but no rows: the kinds these entries use.
INSERT INTO public.knowledge_kinds (key, label, plural_label, description, shareable, sort_order)
VALUES ('person', 'Person', 'People', 'Person', true, 10), ('org', 'Organization', 'Organizations', 'Employer', true, 20)
ON CONFLICT DO NOTHING;

DO $$
DECLARE
	alice uuid := gen_random_uuid();
	bob uuid := gen_random_uuid();
	task_co uuid;
	linked_co uuid;
	both_co uuid;
	lin_person uuid;
	c record;
	got text;
	listed jsonb;
	n integer;
BEGIN
	INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
	SELECT v.id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', v.email, '', now(), now(), now()
	FROM (VALUES (alice, 'kls-alice@example.test'), (bob, 'kls-bob@example.test')) AS v(id, email)
	ON CONFLICT (id) DO NOTHING;
	INSERT INTO public.users (id, email, name) VALUES
		(alice, 'kls-alice@example.test', 'Alice'), (bob, 'kls-bob@example.test', 'Bob')
	ON CONFLICT (id) DO NOTHING;

	INSERT INTO public.knowledge_entities (kind, name, scope, owner_user_id, created_via)
	VALUES ('org', 'Task Co', 'private', alice, 'task') RETURNING id INTO task_co;
	INSERT INTO public.knowledge_entities (kind, name, scope, owner_user_id, created_via)
	VALUES ('org', 'Linked Co', 'private', alice, 'import') RETURNING id INTO linked_co;
	INSERT INTO public.knowledge_entities (kind, name, scope, owner_user_id, created_via)
	VALUES ('org', 'Both Co', 'private', alice, 'import') RETURNING id INTO both_co;
	INSERT INTO public.knowledge_entities (kind, name, scope, owner_user_id, created_via) VALUES
		('org', 'Phone Co', 'private', alice, 'import'),
		('org', 'Found Co', 'private', alice, 'enrichment'),
		('org', 'Typed Co', 'private', alice, 'manual');
	INSERT INTO public.knowledge_entities (kind, name, scope, owner_user_id, created_via)
	VALUES ('person', 'Lim Person', 'private', alice, 'import') RETURNING id INTO lin_person;

	INSERT INTO public.knowledge_entity_keys (entity_id, key_type, key_value, scope, owner_user_id) VALUES
		(linked_co, 'external', 'linkedin-company:aaa', 'private', alice),
		(both_co, 'external', 'linkedin-company:bbb', 'private', alice),
		(lin_person, 'linkedin', 'linkedin.com/in/lin-person', 'private', alice);
	-- The source only asks whether a link exists, so the records need not.
	INSERT INTO public.knowledge_record_links (entity_id, owner_user_id, record_kind, record_id, created_via) VALUES
		(task_co, alice, 'task', gen_random_uuid(), 'task'),
		(both_co, alice, 'document', gen_random_uuid(), 'system');

	SELECT count(*) INTO n FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
	WHERE ns.nspname = 'public' AND p.proname = 'knowledge_list';
	IF n <> 1 THEN RAISE EXCEPTION 'expected one knowledge_list, found %', n; END IF;

	PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', alice, 'role', 'authenticated')::text, true);
	SET LOCAL ROLE authenticated;

	-- Each entry carries its sources.
	listed := public.knowledge_list(p_sort => 'name');
	FOR c IN
		SELECT * FROM (VALUES
			('Task Co', '["work"]'), ('Linked Co', '["linkedin"]'), ('Both Co', '["work", "linkedin"]'),
			('Phone Co', '["contacts"]'), ('Found Co', '["research"]'), ('Typed Co', '["manual"]'),
			('Lim Person', '["linkedin"]')
		) AS v(name, want)
	LOOP
		SELECT e->'sources' INTO STRICT got
		FROM jsonb_array_elements(listed->'entities') AS e WHERE e->>'name' = c.name;
		IF got::jsonb IS DISTINCT FROM c.want::jsonb THEN
			RAISE EXCEPTION '%: wanted sources %, got %', c.name, c.want, got;
		END IF;
	END LOOP;

	-- The filter, alone and with a kind.
	FOR c IN
		SELECT * FROM (VALUES
			(NULL::text, NULL::text[], 'Both Co,Found Co,Lim Person,Linked Co,Phone Co,Task Co,Typed Co'),
			('work', NULL, 'Both Co,Task Co'),
			('linkedin', NULL, 'Both Co,Lim Person,Linked Co'),
			('linkedin', ARRAY['org'], 'Both Co,Linked Co'),
			('contacts', NULL, 'Phone Co'),
			('research', NULL, 'Found Co'),
			('manual', NULL, 'Typed Co')
		) AS v(source, kinds, want)
	LOOP
		listed := public.knowledge_list(p_sort => 'name', p_source => c.source, p_kinds => c.kinds);
		SELECT string_agg(e->>'name', ',' ORDER BY ord) INTO got
		FROM jsonb_array_elements(listed->'entities') WITH ORDINALITY AS x(e, ord);
		IF got IS DISTINCT FROM c.want THEN
			RAISE EXCEPTION 'source % kinds %: wanted %, got %', coalesce(c.source, 'any'), c.kinds, c.want, got;
		END IF;
		IF (listed->>'total')::int <> array_length(string_to_array(c.want, ','), 1) THEN
			RAISE EXCEPTION 'source %: total % does not match the rows', coalesce(c.source, 'any'), listed->>'total';
		END IF;
	END LOOP;

	-- Per-source counts keep their numbers while one source is picked, and follow the kind.
	listed := public.knowledge_list(p_source => 'contacts');
	IF listed->'sources' IS DISTINCT FROM '{"work": 2, "linkedin": 3, "contacts": 1, "research": 1, "manual": 1}'::jsonb THEN
		RAISE EXCEPTION 'source counts: %', listed->'sources';
	END IF;
	listed := public.knowledge_list(p_source => 'work', p_kinds => ARRAY['org']);
	IF listed->'sources' IS DISTINCT FROM '{"work": 2, "linkedin": 2, "contacts": 1, "research": 1, "manual": 1}'::jsonb THEN
		RAISE EXCEPTION 'source counts for orgs: %', listed->'sources';
	END IF;
	-- The kind chips count what the picked source holds.
	listed := public.knowledge_list(p_source => 'linkedin');
	IF listed->'counts' IS DISTINCT FROM '{"org": 2, "person": 1}'::jsonb THEN
		RAISE EXCEPTION 'kind counts under a source: %', listed->'counts';
	END IF;

	BEGIN
		PERFORM public.knowledge_list(p_source => 'fax');
		RAISE EXCEPTION 'accepted a bad source';
	EXCEPTION WHEN invalid_parameter_value THEN NULL;
	END;

	-- Another account sees none of it, whatever the source.
	PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', bob, 'role', 'authenticated')::text, true);
	listed := public.knowledge_list(p_source => 'linkedin');
	IF jsonb_array_length(listed->'entities') <> 0 OR listed->'sources' <> '{}'::jsonb THEN
		RAISE EXCEPTION 'another account saw %', listed;
	END IF;
	RESET ROLE;
END;
$$;

ROLLBACK;
