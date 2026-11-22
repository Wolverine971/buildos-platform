-- supabase/tests/knowledge_connections.check.sql
-- Disposable schema rehearsal only (20261122020000). knowledge_connections answers the tasker
-- 166 questions from a small graph, counts what is missing, and never shows another account.
--
--   Acme     Annapolis, MD · Enterprise Software      Ann (Senior Software Engineer), Ben
--            (Engineering Manager); Gus used to work there
--   Globex   Austin, Texas, United States             Cy (Designer), Dee; Ben used to work there
--   Initech  no place, no industry                    Gus, Eve
--   Fay      no job; a street address in Millersville, MD; an email
--   Dee      not a contact (named in a task with Ann), lives in Annapolis, Maryland
--   Eve      "just mentioned"; Bob's Zed works at Bob's own Acme
-- One-line errors: the function is one long statement, which would bury the message.
\set VERBOSITY terse
BEGIN;
INSERT INTO public.knowledge_kinds (key, label, plural_label, description, shareable, sort_order)
VALUES ('person', 'Person', 'People', 'Person', true, 10), ('org', 'Organization', 'Organizations', 'Employer', true, 20),
	('place', 'Place', 'Places', 'Place', true, 30)
ON CONFLICT DO NOTHING;
INSERT INTO public.knowledge_predicates
	(key, label, description, value_type, subject_kinds, object_kinds, cardinality, sort_order)
VALUES
	('knows', 'Knows', 'Contact', 'entity', '{person}', '{person}', 'many', 210),
	('works_at', 'Works at', 'Employer', 'entity', '{person}', '{org}', 'many', 200),
	('located_in', 'Located in', 'Place', 'entity', '{person,org}', '{place}', 'many', 220),
	('industry', 'Industry', 'Industry', 'text', '{org}', '{}', 'many', 300),
	('address', 'Address', 'Address', 'text', '{person,org}', '{}', 'many', 90),
	('email', 'Email', 'Email', 'email', '{person}', '{}', 'many', 70)
ON CONFLICT DO NOTHING;

DO $$
DECLARE
	alice uuid := gen_random_uuid();
	bob uuid := gen_random_uuid();
	a_actor uuid := gen_random_uuid();
	alpha uuid := gen_random_uuid();
	t1 uuid := gen_random_uuid();
	me uuid; ann uuid; ben uuid; cy uuid; dee uuid; eve uuid; fay uuid; gus uuid; zed uuid;
	acme uuid; globex uuid; initech uuid; bobs_acme uuid; the_acme uuid; hal uuid;
	annapolis_md uuid; annapolis_full uuid; austin uuid;
	c record;
	r jsonb;
	got text;
BEGIN
	IF public.knowledge_place_parts('Annapolis, MD') <> ARRAY['annapolis', 'maryland']
		OR public.knowledge_place_parts('Annapolis, Maryland, United States') <> ARRAY['annapolis', 'maryland']
		OR public.knowledge_place_parts('Washington, D.C.') <> ARRAY['washington', 'district of columbia']
		OR public.knowledge_place_parts('8258 Veterans Hwy, Suite 6, Millersville, MD 21108')
			<> ARRAY['8258 veterans hwy', 'suite 6', 'millersville', 'maryland']
		OR public.knowledge_place_parts('United States') <> '{}'::text[] THEN
		RAISE EXCEPTION 'place parts are wrong';
	END IF;
	IF public.knowledge_text_has_term('Metabase', 'Meta')
		OR NOT public.knowledge_text_has_term('Meta Platforms', 'meta')
		OR NOT public.knowledge_text_has_term('Amazon Web Services (AWS)', 'AWS')
		OR NOT public.knowledge_text_has_term('C++ Developer', 'C++', false)
		OR NOT public.knowledge_text_has_term('Senior Engineering Manager', 'engineer', false)
		OR public.knowledge_text_has_term('Senior Engineering Manager', 'engineer')
		OR public.knowledge_text_has_term('abc', '.*')
		OR public.knowledge_text_has_term('abc', '') THEN
		RAISE EXCEPTION 'term matching is wrong';
	END IF;

	INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
	SELECT v.id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', v.email, '', now(), now(), now()
	FROM (VALUES (alice, 'kc-alice@example.test'), (bob, 'kc-bob@example.test')) AS v(id, email)
	ON CONFLICT (id) DO NOTHING;
	INSERT INTO public.users (id, email, name) VALUES
		(alice, 'kc-alice@example.test', 'Alice'), (bob, 'kc-bob@example.test', 'Bob')
	ON CONFLICT (id) DO NOTHING;
	INSERT INTO public.onto_actors (id, user_id, kind, name)
	SELECT a_actor, alice, 'human', 'Alice'
	WHERE NOT EXISTS (SELECT 1 FROM public.onto_actors a WHERE a.user_id = alice);
	SELECT id INTO a_actor FROM public.onto_actors WHERE user_id = alice;
	INSERT INTO public.onto_projects (id, name, type_key, created_by) VALUES (alpha, 'Alpha', 'project.base', a_actor);
	INSERT INTO public.onto_tasks (id, project_id, title, created_by) VALUES (t1, alpha, 'Intro call', a_actor);

	INSERT INTO public.knowledge_entities (kind, name, scope, owner_user_id, created_via, is_self)
	VALUES ('person', 'Alice', 'private', alice, 'system', true) RETURNING id INTO me;
	INSERT INTO public.knowledge_entities (kind, name, scope, owner_user_id, created_via)
	VALUES ('person', 'Ann', 'private', alice, 'import') RETURNING id INTO ann;
	INSERT INTO public.knowledge_entities (kind, name, scope, owner_user_id, created_via)
	VALUES ('person', 'Ben', 'private', alice, 'import') RETURNING id INTO ben;
	INSERT INTO public.knowledge_entities (kind, name, scope, owner_user_id, created_via)
	VALUES ('person', 'Cy', 'private', alice, 'import') RETURNING id INTO cy;
	INSERT INTO public.knowledge_entities (kind, name, scope, owner_user_id, created_via, circle)
	VALUES ('person', 'Dee', 'private', alice, 'task', 'inner') RETURNING id INTO dee;
	INSERT INTO public.knowledge_entities (kind, name, scope, owner_user_id, created_via, circle)
	VALUES ('person', 'Eve', 'private', alice, 'task', 'public') RETURNING id INTO eve;
	INSERT INTO public.knowledge_entities (kind, name, scope, owner_user_id, created_via)
	VALUES ('person', 'Fay', 'private', alice, 'import') RETURNING id INTO fay;
	INSERT INTO public.knowledge_entities (kind, name, scope, owner_user_id, created_via)
	VALUES ('person', 'Gus', 'private', alice, 'import') RETURNING id INTO gus;
	INSERT INTO public.knowledge_entities (kind, name, scope, owner_user_id, created_via)
	VALUES ('person', 'Zed', 'private', bob, 'import') RETURNING id INTO zed;
	INSERT INTO public.knowledge_entities (kind, name, scope, owner_user_id, created_via)
	VALUES ('org', 'Acme', 'private', alice, 'import') RETURNING id INTO acme;
	INSERT INTO public.knowledge_entities (kind, name, scope, owner_user_id, created_via)
	VALUES ('org', 'Globex', 'private', alice, 'import') RETURNING id INTO globex;
	INSERT INTO public.knowledge_entities (kind, name, scope, owner_user_id, created_via)
	VALUES ('org', 'Initech', 'private', alice, 'import') RETURNING id INTO initech;
	INSERT INTO public.knowledge_entities (kind, name, scope, owner_user_id, created_via)
	VALUES ('org', 'Acme', 'private', bob, 'import') RETURNING id INTO bobs_acme;
	INSERT INTO public.knowledge_entities (kind, name, scope, owner_user_id, created_via)
	VALUES ('place', 'Annapolis, MD', 'private', alice, 'enrichment') RETURNING id INTO annapolis_md;
	INSERT INTO public.knowledge_entities (kind, name, scope, owner_user_id, created_via)
	VALUES ('place', 'Annapolis, Maryland', 'private', alice, 'enrichment') RETURNING id INTO annapolis_full;
	INSERT INTO public.knowledge_entities (kind, name, scope, owner_user_id, created_via)
	VALUES ('place', 'Austin, Texas, United States', 'private', alice, 'enrichment') RETURNING id INTO austin;

	INSERT INTO public.knowledge_facts (entity_id, predicate, object_entity_id, value_text, qualifiers, scope, owner_user_id) VALUES
		(me, 'knows', ann, NULL, '{"via":"linkedin","since":"2024-01-05"}', 'private', alice),
		(me, 'knows', ben, NULL, '{"via":"linkedin","since":"2023-01-05"}', 'private', alice),
		(me, 'knows', cy, NULL, '{"via":"linkedin","since":"2022-01-05"}', 'private', alice),
		(me, 'knows', fay, NULL, '{"via":"phone"}', 'private', alice),
		(me, 'knows', gus, NULL, '{"via":"linkedin","since":"2021-01-05"}', 'private', alice),
		(ann, 'works_at', acme, NULL, '{"title":"Senior Software Engineer","current":true}', 'private', alice),
		(ben, 'works_at', acme, NULL, '{"title":"Engineering Manager","current":true}', 'private', alice),
		(ben, 'works_at', globex, NULL, '{"title":"Developer","current":false}', 'private', alice),
		(cy, 'works_at', globex, NULL, '{"title":"Designer","current":true}', 'private', alice),
		(dee, 'works_at', globex, NULL, '{}', 'private', alice),
		(eve, 'works_at', initech, NULL, '{}', 'private', alice),
		(gus, 'works_at', initech, NULL, '{"title":"Founder"}', 'private', alice),
		(gus, 'works_at', acme, NULL, '{"title":"Intern","end":"2019"}', 'private', alice),
		(zed, 'works_at', bobs_acme, NULL, '{}', 'private', bob),
		(acme, 'located_in', annapolis_md, NULL, '{}', 'private', alice),
		(globex, 'located_in', austin, NULL, '{}', 'private', alice),
		(dee, 'located_in', annapolis_full, NULL, '{}', 'private', alice),
		(acme, 'industry', NULL, 'Enterprise Software', '{}', 'private', alice),
		(fay, 'address', NULL, '8258 Veterans Hwy, Suite 6, Millersville, MD 21108', '{}', 'private', alice),
		(fay, 'email', NULL, 'fay@example.test', '{}', 'private', alice);
	INSERT INTO public.knowledge_record_links (entity_id, owner_user_id, record_kind, record_id, created_via) VALUES
		(ann, alice, 'task', t1, 'task'), (dee, alice, 'task', t1, 'task');

	-- Server callers pass the viewer; names come back in the page order, so compare sorted.
	FOR c IN
		SELECT * FROM (VALUES
			('your world', '{}'::jsonb, 'Ann,Ben,Cy,Dee,Fay,Gus'),
			('people you know', '{"scope":"known"}', 'Ann,Ben,Cy,Fay,Gus'),
			('everyone', '{"scope":"all"}', 'Ann,Ben,Cy,Dee,Eve,Fay,Gus'),
			('how you know them', '{"via":"linkedin"}', 'Ann,Ben,Cy,Gus'),
			('at a company now', '{"company":["acme"]}', 'Ann,Ben'),
			('at a company ever', '{"company":"Acme","employment":"any"}', 'Ann,Ben,Gus'),
			('used to work there', '{"company":["Acme"],"employment":"former"}', 'Gus'),
			('a state by name', '{"place":["Maryland"]}', 'Ann,Ben,Dee,Fay'),
			('a state by code', '{"place":["MD"]}', 'Ann,Ben,Dee,Fay'),
			('a town', '{"place":["Annapolis"]}', 'Ann,Ben,Dee'),
			('town and state', '{"place":["Annapolis, MD"]}', 'Ann,Ben,Dee'),
			('where they live', '{"place":["Maryland"],"place_of":"person"}', 'Dee,Fay'),
			('where the company is', '{"place":["Maryland"],"place_of":"company"}', 'Ann,Ben'),
			('addresses withheld', '{"place":["Maryland"],"addresses":false}', 'Ann,Ben,Dee'),
			('either place', '{"place":["Texas","Millersville"]}', 'Cy,Dee,Fay'),
			('industry word', '{"industry":["software"]}', 'Ann,Ben'),
			('title word start', '{"title":["engineer"]}', 'Ann,Ben'),
			('place and industry', '{"place":["MD"],"industry":["software"],"title":["manager"]}', 'Ben'),
			('named in a task', '{"in_records":["task"]}', 'Ann,Dee'),
			('named in a task and a doc', '{"in_records":["task","document"]}', ''),
			('nobody there', '{"company":["Nowhere Inc"]}', '')
		) AS v(label, filters, want)
	LOOP
		r := public.knowledge_connections(c.filters, NULL, 50, 0, 12, alice);
		SELECT coalesce(string_agg(p->>'name', ',' ORDER BY p->>'name'), '') INTO got
		FROM jsonb_array_elements(r->'people') p;
		IF got <> c.want OR (r->>'total')::int <> cardinality(string_to_array(nullif(c.want, ''), ',')) THEN
			RAISE EXCEPTION '%: expected "%", got "%" (total %)', c.label, c.want, got, r->>'total';
		END IF;
	END LOOP;

	-- Related to Ann: Ben shares Acme, Dee lives where Acme is. The anchor names both.
	r := public.knowledge_connections(jsonb_build_object('related_to', ann), ARRAY['company', 'place'], 50, 0, 12, alice);
	SELECT string_agg(p->>'name', ',' ORDER BY p->>'name') INTO got FROM jsonb_array_elements(r->'people') p;
	IF got <> 'Ben,Dee' OR r->'anchor'->'companies'->0->>'name' <> 'Acme'
		OR r->'anchor'->'companies'->0->>'key' <> r->'facets'->'company'->'groups'->0->>'key'
		OR r->'anchor'->'places'->0->>'key' <> 'annapolis, maryland' THEN
		RAISE EXCEPTION 'related_to: got "%", anchor %', got, r->'anchor';
	END IF;

	-- A way in to Acme: Gus worked there; Cy and Dee share Globex with Ben (who is there now),
	-- and Dee is named in a task with Ann. People already there are not bridges.
	r := public.knowledge_connections('{"bridge_to":["Acme"]}', NULL, 50, 0, 12, alice);
	SELECT string_agg(p->>'name', ',' ORDER BY p->>'name') INTO got FROM jsonb_array_elements(r->'people') p;
	IF got <> 'Cy,Dee,Gus' THEN RAISE EXCEPTION 'bridge_to: got "%"', got; END IF;
	IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(r->'people') p, jsonb_array_elements(p->'bridge') b
			WHERE p->>'name' = 'Gus' AND b->>'how' = 'worked_there')
		OR NOT EXISTS (SELECT 1 FROM jsonb_array_elements(r->'people') p, jsonb_array_elements(p->'bridge') b
			WHERE p->>'name' = 'Dee' AND b->>'how' = 'same_task' AND b->>'person' = 'Ann')
		OR NOT EXISTS (SELECT 1 FROM jsonb_array_elements(r->'people') p, jsonb_array_elements(p->'bridge') b
			WHERE p->>'name' = 'Cy' AND b->>'how' = 'same_company' AND b->>'person' = 'Ben'
				AND b->>'through' = 'Globex') THEN
		RAISE EXCEPTION 'bridge_to: wrong paths %', r->'people';
	END IF;

	-- Groups, coverage and gaps for "in Maryland": 5 of the 6 can be placed, 2 of 3 employers
	-- have a place, 1 has an industry; Initech is the one to research for a place.
	r := public.knowledge_connections('{"place":["Maryland"]}', ARRAY['company', 'region', 'place', 'industry', 'title'], 50, 0, 12, alice);
	IF NOT r->'coverage' @> '{"people":6,"known":5,"with_company":5,"with_title":4,"with_place":5,"with_industry":2,"companies":3,"companies_with_place":2,"companies_with_industry":1}' THEN
		RAISE EXCEPTION 'coverage: %', r->'coverage';
	END IF;
	IF r->'gaps'->'companies_without_place' <> jsonb_build_array(jsonb_build_object('id', initech, 'name', 'Initech', 'people', 1))
		OR jsonb_array_length(r->'gaps'->'companies_without_industry') <> 2
		OR r->'gaps'->'companies_without_industry'->0->>'name' <> 'Globex' THEN
		RAISE EXCEPTION 'gaps: %', r->'gaps';
	END IF;
	IF r->'facets'->'company'->'groups'->0 <> jsonb_build_object('key', 'acme', 'id', acme, 'name', 'Acme', 'people', 2, 'sample', jsonb_build_array('Ann', 'Ben'))
		OR (r->'facets'->'company'->>'total')::int <> 2
		OR r->'facets'->'region'->'groups'->0->>'name' <> 'Maryland'
		OR (r->'facets'->'region'->'groups'->0->>'people')::int <> 4
		OR r->'facets'->'place'->'groups'->0->>'name' <> 'Annapolis, Maryland'
		OR r->'facets'->'industry'->'groups'->0->>'name' <> 'Enterprise Software'
		OR (r->'facets'->'title'->>'total')::int <> 2 THEN
		RAISE EXCEPTION 'facets: %', r->'facets';
	END IF;
	-- A facet limit keeps the biggest groups and still reports how many there are.
	r := public.knowledge_connections('{}', ARRAY['company'], 0, 0, 1, alice);
	IF jsonb_array_length(r->'facets'->'company'->'groups') <> 1 OR (r->'facets'->'company'->>'total')::int <> 3
		OR jsonb_array_length(r->'people') <> 0 OR (r->>'total')::int <> 6 THEN
		RAISE EXCEPTION 'facet limit: %', r;
	END IF;

	-- Contact values only when asked; a row carries its job, places and connection date.
	r := public.knowledge_connections(jsonb_build_object('person_ids', jsonb_build_array(fay, ann), 'contacts', true), NULL, 50, 0, 12, alice);
	IF r->'people'->0->>'name' <> 'Ann' OR r->'people'->0->>'connected_on' <> '2024-01-05'
		OR r->'people'->0->'jobs'->0 <> jsonb_build_object('org_id', acme, 'org', 'Acme', 'title', 'Senior Software Engineer', 'current', true)
		OR r->'people'->0->'places' <> '["Annapolis, Maryland"]'::jsonb
		OR r->'people'->0->'industries' <> '["Enterprise Software"]'::jsonb
		OR (r->'people'->0->>'tasks')::int <> 1
		OR r->'people'->1->'email' <> '["fay@example.test"]'::jsonb
		OR r->'people'->1->'places' <> '["Millersville, Maryland"]'::jsonb THEN
		RAISE EXCEPTION 'person rows: %', r->'people';
	END IF;
	r := public.knowledge_connections(jsonb_build_object('person_ids', jsonb_build_array(fay)), NULL, 50, 0, 12, alice);
	IF r->'people'->0 ? 'email' THEN RAISE EXCEPTION 'email returned without contacts'; END IF;

	BEGIN
		PERFORM public.knowledge_connections('{"scope":"friends"}', NULL, 50, 0, 12, alice);
		RAISE EXCEPTION 'accepted an unknown scope';
	EXCEPTION WHEN invalid_parameter_value THEN NULL;
	END;
	BEGIN
		PERFORM public.knowledge_connections('{}', ARRAY['mood'], 50, 0, 12, alice);
		RAISE EXCEPTION 'accepted an unknown facet';
	EXCEPTION WHEN invalid_parameter_value THEN NULL;
	END;

	-- A second entry for the same company ("The Acme") is the same company: Hal there is at
	-- Acme for the company filter, for the group count and for "related to Ann".
	INSERT INTO public.knowledge_entities (kind, name, scope, owner_user_id, created_via)
	VALUES ('org', 'The Acme', 'private', alice, 'task') RETURNING id INTO the_acme;
	INSERT INTO public.knowledge_entities (kind, name, scope, owner_user_id, created_via)
	VALUES ('person', 'Hal', 'private', alice, 'task') RETURNING id INTO hal;
	INSERT INTO public.knowledge_facts (entity_id, predicate, object_entity_id, qualifiers, scope, owner_user_id)
	VALUES (hal, 'works_at', the_acme, '{}', 'private', alice);
	r := public.knowledge_connections('{"company":["Acme"]}', ARRAY['company'], 50, 0, 12, alice);
	SELECT string_agg(p->>'name', ',' ORDER BY p->>'name') INTO got FROM jsonb_array_elements(r->'people') p;
	IF got <> 'Ann,Ben,Hal' OR r->'facets'->'company'->'groups'->0->>'key' <> 'acme'
		OR (r->'facets'->'company'->'groups'->0->>'people')::int <> 3 THEN
		RAISE EXCEPTION 'company twins: got "%", groups %', got, r->'facets'->'company';
	END IF;
	r := public.knowledge_connections(jsonb_build_object('related_to', ann), ARRAY['company'], 50, 0, 12, alice);
	SELECT string_agg(p->>'name', ',' ORDER BY p->>'name') INTO got FROM jsonb_array_elements(r->'people') p;
	IF got <> 'Ben,Dee,Hal' OR (r->'facets'->'company'->'groups'->0->>'people')::int <> 2 THEN
		RAISE EXCEPTION 'related_to across company twins: got "%", groups %', got, r->'facets'->'company';
	END IF;

	-- Signed in: the same answer through row security, and nobody else's graph.
	PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', alice, 'role', 'authenticated')::text, true);
	SET LOCAL ROLE authenticated;
	r := public.knowledge_connections('{"company":["Acme"],"employment":"any"}');
	SELECT string_agg(p->>'name', ',' ORDER BY p->>'name') INTO got FROM jsonb_array_elements(r->'people') p;
	IF got <> 'Ann,Ben,Gus,Hal' THEN RAISE EXCEPTION 'signed in: got "%"', got; END IF;
	BEGIN
		PERFORM public.knowledge_connections('{}', NULL, 50, 0, 12, bob);
		RAISE EXCEPTION 'read as another viewer';
	EXCEPTION WHEN insufficient_privilege THEN NULL;
	END;
	PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', bob, 'role', 'authenticated')::text, true);
	r := public.knowledge_connections('{"scope":"all"}', ARRAY['company']);
	SELECT string_agg(p->>'name', ',' ORDER BY p->>'name') INTO got FROM jsonb_array_elements(r->'people') p;
	IF got <> 'Zed' OR (r->'facets'->'company'->'groups'->0->>'people')::int <> 1 THEN
		RAISE EXCEPTION 'another account: got "%"', got;
	END IF;
	RESET ROLE;
END;
$$;

ROLLBACK;
