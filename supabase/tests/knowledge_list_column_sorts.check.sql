-- supabase/tests/knowledge_list_column_sorts.check.sql
-- Disposable schema rehearsal only (20261122004500). knowledge_list sorts by how many tasks,
-- docs and projects name each entry, in either direction, counting only records the caller can
-- still open.
--
--   Ann: 3 tasks in Alpha, 1 doc in Beta            → tasks 3, docs 1, projects 2
--   Ben: 1 task in Beta, docs in Alpha and Beta,
--        Alpha linked directly                      → tasks 1, docs 2, projects 2
--   Cy:  Beta linked directly, a deleted task, and
--        a task in Bob's project Alice can't open   → tasks 0, docs 0, projects 1
--   Dee, Eve: nothing
BEGIN;
-- The rehearsal copy has the schema but no rows: the kinds these entries use.
INSERT INTO public.knowledge_kinds (key, label, plural_label, description, shareable, sort_order)
VALUES ('person', 'Person', 'People', 'Person', true, 10), ('org', 'Organization', 'Organizations', 'Employer', true, 20)
ON CONFLICT DO NOTHING;

DO $$
DECLARE
	alice uuid := gen_random_uuid();
	bob uuid := gen_random_uuid();
	a_actor uuid := gen_random_uuid();
	b_actor uuid := gen_random_uuid();
	alpha uuid := gen_random_uuid();
	beta uuid := gen_random_uuid();
	bobs uuid := gen_random_uuid();
	t1 uuid := gen_random_uuid();
	t2 uuid := gen_random_uuid();
	t3 uuid := gen_random_uuid();
	t4 uuid := gen_random_uuid();
	t_deleted uuid := gen_random_uuid();
	t_bob uuid := gen_random_uuid();
	d1 uuid := gen_random_uuid();
	d2 uuid := gen_random_uuid();
	ann uuid;
	ben uuid;
	cy uuid;
	c record;
	got text;
	n integer;
BEGIN
	INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
	SELECT v.id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', v.email, '', now(), now(), now()
	FROM (VALUES (alice, 'kcs-alice@example.test'), (bob, 'kcs-bob@example.test')) AS v(id, email)
	ON CONFLICT (id) DO NOTHING;
	INSERT INTO public.users (id, email, name) VALUES
		(alice, 'kcs-alice@example.test', 'Alice'), (bob, 'kcs-bob@example.test', 'Bob')
	ON CONFLICT (id) DO NOTHING;
	INSERT INTO public.onto_actors (id, user_id, kind, name)
	SELECT v.id, v.user_id, 'human', v.name
	FROM (VALUES (a_actor, alice, 'Alice'), (b_actor, bob, 'Bob')) AS v(id, user_id, name)
	WHERE NOT EXISTS (SELECT 1 FROM public.onto_actors a WHERE a.user_id = v.user_id);
	SELECT id INTO a_actor FROM public.onto_actors WHERE user_id = alice;
	SELECT id INTO b_actor FROM public.onto_actors WHERE user_id = bob;

	INSERT INTO public.onto_projects (id, name, type_key, created_by) VALUES
		(alpha, 'Alpha', 'project.base', a_actor),
		(beta, 'Beta', 'project.base', a_actor),
		(bobs, 'Bob only', 'project.base', b_actor);
	INSERT INTO public.onto_tasks (id, project_id, title, created_by) VALUES
		(t1, alpha, 'One', a_actor), (t2, alpha, 'Two', a_actor), (t3, alpha, 'Three', a_actor),
		(t4, beta, 'Four', a_actor), (t_deleted, alpha, 'Gone', a_actor),
		(t_bob, bobs, 'Not hers', b_actor);
	UPDATE public.onto_tasks SET deleted_at = now() WHERE id = t_deleted;
	INSERT INTO public.onto_documents (id, project_id, title, type_key, created_by) VALUES
		(d1, alpha, 'Doc one', 'document.default', a_actor),
		(d2, beta, 'Doc two', 'document.default', a_actor);

	INSERT INTO public.knowledge_entities (kind, name, scope, owner_user_id, created_via)
	VALUES ('person', 'Ann', 'private', alice, 'task') RETURNING id INTO ann;
	INSERT INTO public.knowledge_entities (kind, name, scope, owner_user_id, created_via)
	VALUES ('person', 'Ben', 'private', alice, 'task') RETURNING id INTO ben;
	INSERT INTO public.knowledge_entities (kind, name, scope, owner_user_id, created_via)
	VALUES ('org', 'Cy', 'private', alice, 'task') RETURNING id INTO cy;
	INSERT INTO public.knowledge_entities (kind, name, scope, owner_user_id, created_via) VALUES
		('person', 'Dee', 'private', alice, 'task'), ('person', 'Eve', 'private', alice, 'task');

	INSERT INTO public.knowledge_record_links (entity_id, owner_user_id, record_kind, record_id, created_via) VALUES
		(ann, alice, 'task', t1, 'task'), (ann, alice, 'task', t2, 'task'),
		(ann, alice, 'task', t3, 'task'), (ann, alice, 'document', d2, 'task'),
		(ben, alice, 'task', t4, 'task'), (ben, alice, 'document', d1, 'task'),
		(ben, alice, 'document', d2, 'task'), (ben, alice, 'project', alpha, 'task'),
		(cy, alice, 'project', beta, 'task'), (cy, alice, 'task', t_deleted, 'task'),
		(cy, alice, 'task', t_bob, 'task');

	SELECT count(*) INTO n FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
	WHERE ns.nspname = 'public' AND p.proname = 'knowledge_list';
	IF n <> 1 THEN RAISE EXCEPTION 'expected one knowledge_list, found %', n; END IF;

	PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', alice, 'role', 'authenticated')::text, true);
	SET LOCAL ROLE authenticated;

	FOR c IN
		SELECT * FROM (VALUES
			('tasks', NULL::text, 5, 0, 'Ann,Ben,Cy,Dee,Eve'),
			('tasks', 'desc', 5, 0, 'Ann,Ben,Cy,Dee,Eve'),
			('tasks', 'asc', 5, 0, 'Cy,Dee,Eve,Ben,Ann'),
			('documents', NULL, 5, 0, 'Ben,Ann,Cy,Dee,Eve'),
			('documents', 'asc', 5, 0, 'Cy,Dee,Eve,Ann,Ben'),
			-- Ann and Ben tie on 2 projects: A–Z inside the tie, in both directions.
			('projects', NULL, 5, 0, 'Ann,Ben,Cy,Dee,Eve'),
			('projects', 'asc', 5, 0, 'Dee,Eve,Cy,Ann,Ben'),
			('name', NULL, 5, 0, 'Ann,Ben,Cy,Dee,Eve'),
			('name', 'asc', 5, 0, 'Ann,Ben,Cy,Dee,Eve'),
			('name', 'desc', 5, 0, 'Eve,Dee,Cy,Ben,Ann'),
			-- The second page continues the same order.
			('tasks', NULL, 2, 2, 'Cy,Dee'),
			('name', 'desc', 2, 3, 'Ben,Ann')
		) AS v(sort, dir, lim, off, want)
	LOOP
		SELECT string_agg(e->>'name', ',' ORDER BY ord) INTO got
		FROM jsonb_array_elements(
			public.knowledge_list(p_sort => c.sort, p_dir => c.dir, p_limit => c.lim, p_offset => c.off)->'entities'
		) WITH ORDINALITY AS x(e, ord);
		IF got IS DISTINCT FROM c.want THEN
			RAISE EXCEPTION 'sort % dir % limit % offset %: wanted %, got %',
				c.sort, coalesce(c.dir, 'default'), c.lim, c.off, c.want, got;
		END IF;
	END LOOP;

	-- Every sort still answers in both directions with the full list.
	FOR c IN
		SELECT s AS sort, d AS dir
		FROM unnest(ARRAY['recent', 'researched', 'connected']) AS s, unnest(ARRAY['asc', 'desc']) AS d
	LOOP
		n := jsonb_array_length(public.knowledge_list(p_sort => c.sort, p_dir => c.dir)->'entities');
		IF n <> 5 THEN RAISE EXCEPTION 'sort % dir % returned % entries', c.sort, c.dir, n; END IF;
	END LOOP;

	BEGIN
		PERFORM public.knowledge_list(p_sort => 'tasks', p_dir => 'sideways');
		RAISE EXCEPTION 'accepted a bad direction';
	EXCEPTION WHEN invalid_parameter_value THEN NULL;
	END;
	BEGIN
		PERFORM public.knowledge_list(p_sort => 'goals');
		RAISE EXCEPTION 'accepted a bad sort';
	EXCEPTION WHEN invalid_parameter_value THEN NULL;
	END;

	-- Another account sees none of it, whatever the sort.
	PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', bob, 'role', 'authenticated')::text, true);
	n := jsonb_array_length(public.knowledge_list(p_sort => 'tasks')->'entities');
	IF n <> 0 THEN RAISE EXCEPTION 'another account saw % entries', n; END IF;
	RESET ROLE;
END;
$$;

ROLLBACK;
