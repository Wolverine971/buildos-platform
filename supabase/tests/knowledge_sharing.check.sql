-- supabase/tests/knowledge_sharing.check.sql
-- Knowledge in shared projects (tasker 168): the project lens and the Ask → Share flow.
-- Run on the disposable production-schema rehearsal, never against production:
--   pnpm db:rehearse supabase/migrations/20261118300000_knowledge_project_sharing.sql \
--     --check supabase/tests/knowledge_sharing.check.sql --role-probe
--
-- Cast: alice owns project P (and Q, alone); bob is an editor on P; carol was on P and was
-- removed; dave is a stranger. Alice has Kyle (person) and Secular Talk (org) in her People,
-- linked to a task in P.
BEGIN;

INSERT INTO public.knowledge_kinds (key, label, plural_label, description, shareable, sort_order) VALUES
	('person', 'Person', 'People', 'A human being.', true, 10),
	('org', 'Organization', 'Organizations', 'A company or group.', true, 20)
ON CONFLICT DO NOTHING;
INSERT INTO public.knowledge_predicates
	(key, label, inverse_label, description, value_type, subject_kinds, object_kinds, cardinality, shareable_subject_kinds, qualifier_keys, sort_order)
VALUES
	('headline', 'Headline', NULL, 'Headline.', 'text', '{person}', '{}', 'one', '{}', '{}', 30),
	('description', 'Description', NULL, 'Description.', 'text', '{}', '{}', 'one', '{org,website,channel,video,place,topic,product,event}', '{}', 20),
	('homepage', 'Website', NULL, 'Website.', 'url', '{person,org}', '{}', 'one', '{org}', '{}', 50),
	('email', 'Email', NULL, 'Email.', 'email', '{person,org}', '{}', 'many', '{}', '{label}', 70),
	('phone', 'Phone', NULL, 'Phone.', 'phone', '{person,org,place}', '{}', 'many', '{}', '{label}', 80),
	('note', 'Note', NULL, 'Note.', 'text', '{}', '{}', 'many', '{}', '{}', 110),
	('works_at', 'Works at', 'People', 'Works at.', 'entity', '{person}', '{org}', 'many', '{}', '{title,start,end,current}', 200),
	('educated_at', 'Studied at', 'Alumni', 'Studied at.', 'entity', '{person}', '{org}', 'many', '{}', '{degree,field,start,end}', 205)
ON CONFLICT DO NOTHING;

DO $$
#variable_conflict use_variable
DECLARE
	alice uuid := 'a1ce0000-0000-4000-8000-0000000000a1';
	bob uuid := 'b0b00000-0000-4000-8000-0000000000b0';
	carol uuid := 'ca401000-0000-4000-8000-0000000000c0';
	dave uuid := 'da7e0000-0000-4000-8000-0000000000d0';
	a_actor uuid := 'a1ce0000-0000-4000-8000-0000000000a2';
	b_actor uuid := 'b0b00000-0000-4000-8000-0000000000b2';
	c_actor uuid := 'ca401000-0000-4000-8000-0000000000c2';
	d_actor uuid := 'da7e0000-0000-4000-8000-0000000000d2';
	proj_p uuid := 'c0000000-0000-4000-8000-0000000000f1';
	proj_q uuid := 'c0000000-0000-4000-8000-0000000000f2';
	task_p uuid := 'e0000000-0000-4000-8000-0000000000e1';
	task_q uuid := 'e0000000-0000-4000-8000-0000000000e2';
	kyle uuid;
	show_org uuid;
	src_web uuid;
	src_import uuid;
	src_task_p uuid;
	src_task_q uuid;
	f uuid;
	run_id uuid;
	alice_self uuid;
	fake_fact uuid;
	pick_id uuid;
	lens jsonb;
	entry jsonb;
	res jsonb;
	got text;
	ask_id uuid;
	n integer;
	failed boolean;
BEGIN
	-- People and projects -------------------------------------------------------------
	INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
	SELECT v.id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', v.email, '', now(), now(), now()
	FROM (VALUES (alice, 'ks-alice@example.test'), (bob, 'ks-bob@example.test'),
		(carol, 'ks-carol@example.test'), (dave, 'ks-dave@example.test')) AS v(id, email)
	ON CONFLICT (id) DO NOTHING;
	INSERT INTO public.users (id, email, name) VALUES
		(alice, 'ks-alice@example.test', 'Alice'), (bob, 'ks-bob@example.test', 'Bob'),
		(carol, 'ks-carol@example.test', 'Carol'), (dave, 'ks-dave@example.test', 'Dave')
	ON CONFLICT (id) DO NOTHING;
	INSERT INTO public.onto_actors (id, user_id, kind, name)
	SELECT v.id, v.user_id, 'human', v.name
	FROM (VALUES (a_actor, alice, 'Alice'), (b_actor, bob, 'Bob'), (c_actor, carol, 'Carol'),
		(d_actor, dave, 'Dave')) AS v(id, user_id, name)
	WHERE NOT EXISTS (SELECT 1 FROM public.onto_actors a WHERE a.user_id = v.user_id);
	SELECT id INTO a_actor FROM public.onto_actors WHERE user_id = alice;
	SELECT id INTO b_actor FROM public.onto_actors WHERE user_id = bob;
	SELECT id INTO c_actor FROM public.onto_actors WHERE user_id = carol;

	INSERT INTO public.onto_projects (id, name, type_key, created_by) VALUES
		(proj_p, 'Wayne Strategies', 'project.base', a_actor),
		(proj_q, 'Private stuff', 'project.base', a_actor);
	INSERT INTO public.onto_project_members (project_id, actor_id, role_key, access) VALUES
		(proj_p, b_actor, 'editor', 'write'),
		(proj_p, c_actor, 'editor', 'write');
	UPDATE public.onto_project_members SET removed_at = now() WHERE project_id = proj_p AND actor_id = c_actor;
	INSERT INTO public.onto_tasks (id, project_id, title, created_by) VALUES
		(task_p, proj_p, 'Pitch Kyle Kulinski', a_actor),
		(task_q, proj_q, 'Call Kyle on his cell', a_actor);
	UPDATE public.onto_tasks SET description = 'Booking line: (410) 555-0199' WHERE id = task_p;

	-- Alice's People (written as the service role would) ------------------------------
	INSERT INTO public.knowledge_entities (kind, name, scope, owner_user_id, created_via)
	VALUES ('person', 'Kyle Kulinski', 'private', alice, 'task') RETURNING id INTO kyle;
	INSERT INTO public.knowledge_entities (kind, name, scope, owner_user_id, created_via)
	VALUES ('org', 'Secular Talk', 'private', alice, 'task') RETURNING id INTO show_org;

	INSERT INTO public.knowledge_sources (scope, owner_user_id, source_type, url, title)
	VALUES ('private', alice, 'web', 'https://example.test/kyle', 'Kyle bio') RETURNING id INTO src_web;
	INSERT INTO public.knowledge_sources (scope, owner_user_id, source_type, title)
	VALUES ('private', alice, 'import', 'Phone contacts') RETURNING id INTO src_import;
	INSERT INTO public.knowledge_sources (scope, owner_user_id, source_type, record_id, title)
	VALUES ('private', alice, 'task', task_p, 'Pitch Kyle Kulinski') RETURNING id INTO src_task_p;
	INSERT INTO public.knowledge_sources (scope, owner_user_id, source_type, record_id, title)
	VALUES ('private', alice, 'task', task_q, 'Call Kyle on his cell') RETURNING id INTO src_task_q;

	-- A research run found these on a web page.
	INSERT INTO public.knowledge_runs (owner_user_id, run_type, status, title)
	VALUES (alice, 'enrichment', 'completed', 'Kyle') RETURNING id INTO run_id;
	-- headline from the web → shared
	INSERT INTO public.knowledge_facts (entity_id, predicate, value_text, scope, owner_user_id, created_via, run_id)
	VALUES (kyle, 'headline', 'Host of Secular Talk', 'private', alice, 'enrichment', run_id) RETURNING id INTO f;
	INSERT INTO public.knowledge_fact_sources (fact_id, source_id) VALUES (f, src_web);
	-- works_at from the web → shared (shows the org's name)
	INSERT INTO public.knowledge_facts (entity_id, predicate, object_entity_id, scope, owner_user_id, created_via, run_id)
	VALUES (kyle, 'works_at', show_org, 'private', alice, 'enrichment', run_id) RETURNING id INTO f;
	INSERT INTO public.knowledge_fact_sources (fact_id, source_id) VALUES (f, src_web);
	-- review #6: a "web" source typed in through chat is NOT the public web → ask-only
	INSERT INTO public.knowledge_facts (entity_id, predicate, value_text, scope, owner_user_id, created_via)
	VALUES (kyle, 'description', 'Moving to Acme next month', 'private', alice, 'chat') RETURNING id INTO fake_fact;
	INSERT INTO public.knowledge_fact_sources (fact_id, source_id) VALUES (fake_fact, src_web);
	-- review #2: a private free-text summary
	UPDATE public.knowledge_entities SET summary = 'SECRET: in rehab' WHERE id = kyle;
	-- review #7: alice's own "Me" entry, linked to the task
	INSERT INTO public.knowledge_entities (kind, name, scope, owner_user_id, is_self, created_via)
	VALUES ('person', 'Alice Self', 'private', alice, true, 'system') RETURNING id INTO alice_self;
	INSERT INTO public.knowledge_facts (entity_id, predicate, value_text, scope, owner_user_id, created_via)
	VALUES (alice_self, 'email', 'alice@private.test', 'private', alice, 'import');
	-- email from a contacts import → ask
	INSERT INTO public.knowledge_facts (entity_id, predicate, value_text, scope, owner_user_id, created_via)
	VALUES (kyle, 'email', 'kyle@private.test', 'private', alice, 'import') RETURNING id INTO f;
	INSERT INTO public.knowledge_fact_sources (fact_id, source_id) VALUES (f, src_import);
	-- cell from her OTHER project's task → ask (never reveals project Q)
	INSERT INTO public.knowledge_facts (entity_id, predicate, value_text, scope, owner_user_id, created_via)
	VALUES (kyle, 'phone', '+14105550111', 'private', alice, 'task') RETURNING id INTO f;
	INSERT INTO public.knowledge_fact_sources (fact_id, source_id) VALUES (f, src_task_q);
	-- booking line written in THIS project's task → shared
	INSERT INTO public.knowledge_facts (entity_id, predicate, value_text, scope, owner_user_id, created_via)
	VALUES (kyle, 'phone', '+14105550199', 'private', alice, 'task') RETURNING id INTO f;
	INSERT INTO public.knowledge_fact_sources (fact_id, source_id) VALUES (f, src_task_p);
	-- her note → never
	INSERT INTO public.knowledge_facts (entity_id, predicate, value_text, scope, owner_user_id, created_via)
	VALUES (kyle, 'note', 'Met at the 2025 meetup, prefers texts', 'private', alice, 'manual');
	-- a research suggestion she hasn't checked → owner-only (not shown, not counted)
	INSERT INTO public.knowledge_facts (entity_id, predicate, value_text, scope, owner_user_id, created_via, status)
	VALUES (kyle, 'homepage', 'https://kyle.example.test', 'private', alice, 'enrichment', 'suggested');

	INSERT INTO public.knowledge_record_links (entity_id, owner_user_id, record_kind, record_id, quote, created_via) VALUES
		(alice_self, alice, 'task', task_p, 'me', 'task'),
		(kyle, alice, 'task', task_p, 'Kyle Kulinski', 'task'),
		(show_org, alice, 'task', task_p, 'Secular Talk', 'task'),
		(kyle, alice, 'task', task_q, 'Kyle', 'task');

	-- The rule table ------------------------------------------------------------------
	IF public.knowledge_fact_share_level('email', 'person', 'active', '{}', true, false) <> 'request' THEN
		RAISE EXCEPTION 'a person''s email must be ask-only even from the web';
	END IF;
	IF public.knowledge_fact_share_level('works_at', 'person', 'active', '{"end": "2024"}', true, false) <> 'request' THEN
		RAISE EXCEPTION 'a past job must be ask-only';
	END IF;
	IF public.knowledge_fact_share_level('note', 'person', 'active', '{}', true, true) <> 'never' THEN
		RAISE EXCEPTION 'notes must never be shared, even from project text';
	END IF;
	IF public.knowledge_fact_share_level('homepage', 'org', 'active', '{}', false, false) <> 'request' THEN
		RAISE EXCEPTION 'an org fact with no public source must be ask-only';
	END IF;

	-- Bob, signed in, reads the lens on P's task ----------------------------------------
	PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', bob, 'role', 'authenticated')::text, true);
	SET LOCAL ROLE authenticated;

	SELECT count(*) INTO n FROM public.knowledge_facts WHERE entity_id = kyle;
	IF n <> 0 THEN RAISE EXCEPTION 'bob must not read alice''s facts directly, saw %', n; END IF;

	lens := public.knowledge_project_lens(proj_p, 'task', ARRAY[task_p, task_q]);
	IF jsonb_array_length(lens -> 'entries') <> 2 THEN
		RAISE EXCEPTION 'bob should see Kyle and Secular Talk from alice, got %', lens;
	END IF;
	SELECT e INTO entry FROM jsonb_array_elements(lens -> 'entries') e WHERE e -> 'entity' ->> 'id' = kyle::text;
	IF entry -> 'owner' ->> 'name' <> 'Alice' THEN RAISE EXCEPTION 'owner name missing: %', entry; END IF;
	SELECT string_agg(x ->> 'predicate' || '=' || coalesce(x ->> 'value', x ->> 'object_name'), ',' ORDER BY x ->> 'predicate', x ->> 'value')
	INTO got FROM jsonb_array_elements(entry -> 'facts') x;
	IF got IS DISTINCT FROM 'headline=Host of Secular Talk,phone=+14105550199,works_at=Secular Talk' THEN
		RAISE EXCEPTION 'bob should see headline, works_at and the project''s own phone only, got %', got;
	END IF;
	IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(entry -> 'facts') x
		WHERE x ->> 'predicate' = 'headline' AND x ->> 'source_url' = 'https://example.test/kyle') THEN
		RAISE EXCEPTION 'the headline should cite its web source: %', entry -> 'facts';
	END IF;
	IF (entry -> 'hidden' ->> 'contact')::int <> 2 OR (entry -> 'hidden' ->> 'other')::int <> 1 THEN
		RAISE EXCEPTION 'bob should be told of 2 contact details and 1 other (the chat description), got %', entry -> 'hidden';
	END IF;
	IF entry::text LIKE '%Moving to Acme%' THEN
		RAISE EXCEPTION 'a chat fact with a typed-in URL must not count as public: %', entry;
	END IF;
	IF entry::text LIKE '%SECRET%' THEN
		RAISE EXCEPTION 'the owner''s free-text summary leaked: %', entry -> 'entity';
	END IF;
	IF lens::text LIKE '%Alice Self%' OR lens::text LIKE '%alice@private%' THEN
		RAISE EXCEPTION 'the owner''s own Me entry must not appear: %', lens;
	END IF;

	-- The booking line is edited out of the task: teammates stop seeing it (it becomes one more
	-- "contact detail · Ask"); alice keeps it. Put back afterwards.
	RESET ROLE;
	UPDATE public.onto_tasks SET description = 'Booking line changed, call the office' WHERE id = task_p;
	PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', bob, 'role', 'authenticated')::text, true);
	SET LOCAL ROLE authenticated;
	lens := public.knowledge_project_lens(proj_p, 'task', ARRAY[task_p]);
	SELECT e INTO entry FROM jsonb_array_elements(lens -> 'entries') e WHERE e -> 'entity' ->> 'id' = kyle::text;
	IF entry::text LIKE '%5550199%' OR (entry -> 'hidden' ->> 'contact')::int <> 3 THEN
		RAISE EXCEPTION 'a number edited out of the task must stop showing (and be counted): %', entry;
	END IF;
	RESET ROLE;
	IF NOT EXISTS (SELECT 1 FROM public.knowledge_facts WHERE entity_id = kyle AND value_text = '+14105550199' AND status = 'active') THEN
		RAISE EXCEPTION 'alice must keep the number in her own People';
	END IF;
	-- Written another way still counts (digits match).
	UPDATE public.onto_tasks SET description = 'Booking: 410.555.0199' WHERE id = task_p;
	PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', bob, 'role', 'authenticated')::text, true);
	SET LOCAL ROLE authenticated;
	lens := public.knowledge_project_lens(proj_p, 'task', ARRAY[task_p]);
	SELECT e INTO entry FROM jsonb_array_elements(lens -> 'entries') e WHERE e -> 'entity' ->> 'id' = kyle::text;
	IF NOT entry::text LIKE '%+14105550199%' THEN
		RAISE EXCEPTION 'the same number written another way should still show: %', entry;
	END IF;
	RESET ROLE;
	UPDATE public.onto_tasks SET description = 'Booking line: (410) 555-0199' WHERE id = task_p;
	PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', bob, 'role', 'authenticated')::text, true);
	SET LOCAL ROLE authenticated;
	IF entry::text LIKE '%prefers texts%' OR entry::text LIKE '%private.test%' OR entry::text LIKE '%0111%' THEN
		RAISE EXCEPTION 'lens leaked a note or contact value: %', entry;
	END IF;

	-- Records from another project are ignored even if passed in.
	lens := public.knowledge_project_lens(proj_p, 'task', ARRAY[task_q]);
	IF jsonb_array_length(lens -> 'entries') <> 0 THEN
		RAISE EXCEPTION 'a task outside P must not surface entries: %', lens;
	END IF;

	-- A signed-in caller can't read as someone else.
	failed := false;
	BEGIN
		PERFORM public.knowledge_project_lens(proj_p, 'task', ARRAY[task_p], alice);
	EXCEPTION WHEN insufficient_privilege THEN failed := true;
	END;
	IF NOT failed THEN RAISE EXCEPTION 'viewer spoofing unexpectedly allowed'; END IF;

	-- Bob can't write shares directly.
	failed := false;
	BEGIN
		INSERT INTO public.knowledge_shares (owner_user_id, entity_id, project_id, grantee_user_id, status)
		VALUES (alice, kyle, proj_p, bob, 'granted');
	EXCEPTION WHEN insufficient_privilege THEN failed := true;
	END;
	IF NOT failed THEN RAISE EXCEPTION 'direct share insert unexpectedly allowed'; END IF;

	-- Ask, and ask again (merges).
	res := public.knowledge_request_share(kyle, proj_p, 'contact');
	IF res ->> 'status' <> 'requested' THEN RAISE EXCEPTION 'ask failed: %', res; END IF;
	ask_id := (res ->> 'id')::uuid;
	res := public.knowledge_request_share(kyle, proj_p, 'all');
	IF res ->> 'status' <> 'requested' OR (res ->> 'id')::uuid <> ask_id OR NOT (res ->> 'merged')::boolean THEN
		RAISE EXCEPTION 'second ask should merge into the first: %', res;
	END IF;
	-- Can't ask about an entry you can't see in this project.
	res := public.knowledge_request_share(kyle, proj_q, 'contact');
	IF res ->> 'status' <> 'not_found' THEN RAISE EXCEPTION 'ask outside a shared project should be not_found: %', res; END IF;
	-- Bob can't approve his own ask.
	failed := false;
	BEGIN
		PERFORM public.knowledge_decide_share(ask_id, 'grant');
	EXCEPTION WHEN no_data_found THEN failed := true;
	END;
	IF NOT failed THEN RAISE EXCEPTION 'requester approving unexpectedly allowed'; END IF;

	lens := public.knowledge_project_lens(proj_p, 'task', ARRAY[task_p]);
	SELECT e INTO entry FROM jsonb_array_elements(lens -> 'entries') e WHERE e -> 'entity' ->> 'id' = kyle::text;
	IF entry -> 'ask' ->> 'status' <> 'requested' THEN RAISE EXCEPTION 'lens should show the pending ask: %', entry; END IF;

	-- Agents (service role) can ask for a viewer but never approve -------------------
	RESET ROLE;
	PERFORM set_config('request.jwt.claims', '', true);
	SET LOCAL ROLE service_role;
	lens := public.knowledge_project_lens(proj_p, 'task', ARRAY[task_p], bob);
	IF jsonb_array_length(lens -> 'entries') <> 2 THEN RAISE EXCEPTION 'agent lens for bob should match bob''s: %', lens; END IF;
	failed := false;
	BEGIN
		PERFORM public.knowledge_decide_share(ask_id, 'grant');
	EXCEPTION WHEN insufficient_privilege THEN failed := true;
	END;
	IF NOT failed THEN RAISE EXCEPTION 'service role approving unexpectedly allowed'; END IF;

	-- Removed members and strangers see nothing.
	FOREACH f IN ARRAY ARRAY[carol, dave] LOOP
		failed := false;
		BEGIN
			PERFORM public.knowledge_project_lens(proj_p, 'task', ARRAY[task_p], f);
		EXCEPTION WHEN insufficient_privilege THEN failed := true;
		END;
		IF NOT failed THEN RAISE EXCEPTION 'non-member % read the lens', f; END IF;
	END LOOP;
	RESET ROLE;

	-- Alice decides --------------------------------------------------------------------
	PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', alice, 'role', 'authenticated')::text, true);
	SET LOCAL ROLE authenticated;

	res := public.knowledge_share_inbox();
	IF jsonb_array_length(res) <> 1 OR res -> 0 -> 'requested_by' ->> 'name' <> 'Bob' THEN
		RAISE EXCEPTION 'alice''s inbox should hold bob''s ask: %', res;
	END IF;
	failed := false;
	BEGIN
		PERFORM public.knowledge_decide_share(ask_id, 'grant', 'picked', ARRAY['note'], 'membership', NULL);
	EXCEPTION WHEN invalid_parameter_value THEN failed := true;
	END;
	IF NOT failed THEN RAISE EXCEPTION 'sharing a note unexpectedly allowed'; END IF;
	res := public.knowledge_decide_share(ask_id, 'grant', 'contact', '{}', 'membership', NULL);
	IF res ->> 'status' <> 'granted' THEN RAISE EXCEPTION 'grant failed: %', res; END IF;

	res := public.knowledge_entity_shares(kyle);
	IF jsonb_array_length(res -> 'projects') <> 1 OR res -> 'projects' -> 0 ->> 'project_name' <> 'Wayne Strategies' THEN
		RAISE EXCEPTION 'Kyle is shown by default in Wayne Strategies only: %', res -> 'projects';
	END IF;
	IF NOT (res -> 'shares' -> 0 ->> 'live')::boolean THEN RAISE EXCEPTION 'the grant should be live: %', res; END IF;

	failed := false;
	BEGIN
		PERFORM public.knowledge_share_entity(kyle, proj_p, dave, 'contact', '{}', 'membership', NULL);
	EXCEPTION WHEN invalid_parameter_value THEN failed := true;
	END;
	IF NOT failed THEN RAISE EXCEPTION 'sharing with someone outside the project unexpectedly allowed'; END IF;
	RESET ROLE;

	-- Bob now sees the contact details --------------------------------------------------
	PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', bob, 'role', 'authenticated')::text, true);
	SET LOCAL ROLE authenticated;
	lens := public.knowledge_project_lens(proj_p, 'task', ARRAY[task_p]);
	SELECT e INTO entry FROM jsonb_array_elements(lens -> 'entries') e WHERE e -> 'entity' ->> 'id' = kyle::text;
	SELECT count(*) INTO n FROM jsonb_array_elements(entry -> 'facts') x WHERE x ->> 'via' = 'grant';
	IF n <> 2 OR (entry -> 'hidden' ->> 'contact')::int <> 0 THEN
		RAISE EXCEPTION 'after the grant bob should see 2 contact details via grant: %', entry;
	END IF;
	IF entry::text LIKE '%prefers texts%' THEN RAISE EXCEPTION 'grant leaked the note'; END IF;
	-- review #3: asking for contact details again is "already shared"; the other detail is askable
	res := public.knowledge_request_share(kyle, proj_p, 'contact');
	IF res ->> 'status' <> 'already_shared' THEN RAISE EXCEPTION 'contact ask after a grant: %', res; END IF;
	RESET ROLE;

	-- review #3: a second, narrower grant (a picked detail just for bob) adds to the first
	PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', alice, 'role', 'authenticated')::text, true);
	SET LOCAL ROLE authenticated;
	res := public.knowledge_share_entity(kyle, proj_p, bob, 'picked', ARRAY['description'], 'membership', NULL);
	pick_id := (res ->> 'id')::uuid;
	RESET ROLE;
	PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', bob, 'role', 'authenticated')::text, true);
	SET LOCAL ROLE authenticated;
	lens := public.knowledge_project_lens(proj_p, 'task', ARRAY[task_p]);
	SELECT e INTO entry FROM jsonb_array_elements(lens -> 'entries') e WHERE e -> 'entity' ->> 'id' = kyle::text;
	SELECT count(*) INTO n FROM jsonb_array_elements(entry -> 'facts') x WHERE x ->> 'via' = 'grant';
	IF n <> 3 OR (entry -> 'hidden' ->> 'contact')::int <> 0 OR (entry -> 'hidden' ->> 'other')::int <> 0 THEN
		RAISE EXCEPTION 'both grants should apply (2 contact + 1 picked), got % via grant, hidden %', n, entry -> 'hidden';
	END IF;
	res := public.knowledge_request_share(show_org, proj_p, 'all');
	IF res ->> 'status' <> 'nothing_to_ask' THEN
		RAISE EXCEPTION 'asking about an entry with nothing hidden should say so: %', res;
	END IF;
	RESET ROLE;
	PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', alice, 'role', 'authenticated')::text, true);
	SET LOCAL ROLE authenticated;
	PERFORM public.knowledge_revoke_share(pick_id);
	RESET ROLE;

	-- Bob leaves the project: the grant lapses with no cleanup --------------------------
	UPDATE public.onto_project_members SET removed_at = now() WHERE project_id = proj_p AND actor_id = b_actor;
	IF public.knowledge_share_is_live(ask_id, bob) THEN RAISE EXCEPTION 'grant must lapse when bob leaves'; END IF;
	UPDATE public.onto_project_members SET removed_at = NULL WHERE project_id = proj_p AND actor_id = b_actor;

	-- Alice revokes; bob is back to "2 contact details · Ask" ---------------------------
	PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', alice, 'role', 'authenticated')::text, true);
	SET LOCAL ROLE authenticated;
	PERFORM public.knowledge_revoke_share(ask_id);
	RESET ROLE;
	PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', bob, 'role', 'authenticated')::text, true);
	SET LOCAL ROLE authenticated;
	lens := public.knowledge_project_lens(proj_p, 'task', ARRAY[task_p]);
	SELECT e INTO entry FROM jsonb_array_elements(lens -> 'entries') e WHERE e -> 'entity' ->> 'id' = kyle::text;
	IF (entry -> 'hidden' ->> 'contact')::int <> 2 THEN RAISE EXCEPTION 'revoke should hide the details again: %', entry; END IF;
	res := public.knowledge_request_share(kyle, proj_p, 'contact');
	ask_id := (res ->> 'id')::uuid;
	RESET ROLE;

	-- A decline is quiet: asking again doesn't nag -------------------------------------
	PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', alice, 'role', 'authenticated')::text, true);
	SET LOCAL ROLE authenticated;
	PERFORM public.knowledge_decide_share(ask_id, 'decline');
	RESET ROLE;
	PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', bob, 'role', 'authenticated')::text, true);
	SET LOCAL ROLE authenticated;
	res := public.knowledge_request_share(kyle, proj_p, 'contact');
	IF res ->> 'status' <> 'declined' THEN RAISE EXCEPTION 'asking again after a decline should be quiet: %', res; END IF;
	RESET ROLE;

	-- review #4: ask → cancel → ask can't loop: 2 asks per entry per day, counting withdrawn ones
	DELETE FROM public.knowledge_shares WHERE requested_by_user_id = bob AND status = 'declined';
	SET LOCAL ROLE service_role;
	res := public.knowledge_request_share(kyle, proj_p, 'contact', bob, 'agent');
	IF res ->> 'status' <> 'requested' THEN RAISE EXCEPTION 'first ask of the day: %', res; END IF;
	PERFORM public.knowledge_cancel_share_request((res ->> 'id')::uuid, bob);
	res := public.knowledge_request_share(kyle, proj_p, 'contact', bob, 'agent');
	IF res ->> 'status' <> 'rate_limited' THEN
		RAISE EXCEPTION 'a third ask about one entry in a day (counting withdrawn) should be limited: %', res;
	END IF;
	RESET ROLE;

	SELECT count(*) INTO n FROM public.knowledge_share_events WHERE owner_user_id = alice;
	IF n < 5 THEN RAISE EXCEPTION 'history should record asks, grant, revoke and decline, got %', n; END IF;
END;
$$;

ROLLBACK;
