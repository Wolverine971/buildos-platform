-- supabase/tests/knowledge_graph.check.sql
-- Knowledge graph privacy and guard checks (tasker 160).
-- Run on the disposable production-schema rehearsal, never against production:
--   pnpm db:rehearse supabase/migrations/20261117100000_knowledge_research_queue.sql \
--     --check supabase/tests/knowledge_graph.check.sql
BEGIN;
-- The rehearsal copies production's schema without data: seed the vocabulary (copied from
-- 20261116230000_knowledge_graph.sql; a no-op wherever the rows already exist).
INSERT INTO public.knowledge_kinds (key, label, plural_label, description, shareable, sort_order) VALUES
	('person', 'Person', 'People', 'A human being: a contact, a colleague, a creator, an executive.', true, 10),
	('org', 'Organization', 'Organizations', 'A company, nonprofit, school, agency, show or other group.', true, 20),
	('website', 'Website', 'Websites', 'A website or web property, identified by its domain or URL.', true, 30),
	('channel', 'Channel', 'Channels', 'A YouTube channel, podcast, newsletter or other publishing channel.', true, 40),
	('video', 'Video', 'Videos', 'A single video, such as a YouTube video.', true, 50),
	('place', 'Place', 'Places', 'A city, region, office or other location.', true, 60),
	('topic', 'Topic', 'Topics', 'A subject, field or theme that other entities are about.', true, 70),
	('product', 'Product', 'Products', 'A product, service or tool.', true, 80),
	('event', 'Event', 'Events', 'A conference, meetup or other happening.', true, 90)
ON CONFLICT DO NOTHING;
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
	('thumbnail_url', 'Thumbnail', NULL, 'An image URL representing the entity.', 'url', '{video,channel,website,org,person,product}', '{}', 'one', '{video,channel,website,org,product}', '{}', 340)
ON CONFLICT DO NOTHING;

DO $$
#variable_conflict use_variable
DECLARE
	alice uuid := 'a1ce0000-0000-4000-8000-000000000001';
	bob uuid := 'b0b00000-0000-4000-8000-000000000002';
	palantir uuid;
	karp uuid;
	alice_sam uuid;
	alice_sam_dupe uuid;
	alice_self uuid;
	bob_private uuid;
	n integer;
	merged jsonb;
	listed jsonb;
	reserved jsonb;
BEGIN
	INSERT INTO auth.users(id, email) VALUES
		(alice, 'kg-alice@example.com'), (bob, 'kg-bob@example.com');
	INSERT INTO public.users(id, email) VALUES
		(alice, 'kg-alice@example.com'), (bob, 'kg-bob@example.com') ON CONFLICT (id) DO NOTHING;

	-- Service role writes the shared layer.
	INSERT INTO public.knowledge_entities(kind, name, scope, created_via)
	VALUES ('org', 'Palantir', 'public', 'enrichment') RETURNING id INTO palantir;
	INSERT INTO public.knowledge_entities(kind, name, scope, created_via)
	VALUES ('person', 'Alex Karp', 'public', 'enrichment') RETURNING id INTO karp;
	INSERT INTO public.knowledge_facts(entity_id, predicate, value_text, scope, created_via)
	VALUES (palantir, 'homepage', 'https://www.palantir.com', 'public', 'enrichment');

	-- A person's phone can never be public, even for the service role.
	BEGIN
		INSERT INTO public.knowledge_facts(entity_id, predicate, value_text, scope, created_via)
		VALUES (karp, 'phone', '+15555550100', 'public', 'enrichment');
		RAISE EXCEPTION 'public person phone unexpectedly accepted';
	EXCEPTION WHEN insufficient_privilege THEN NULL;
	END;
	-- Nor a public email key.
	BEGIN
		INSERT INTO public.knowledge_entity_keys(entity_id, key_type, key_value, scope)
		VALUES (karp, 'email', 'karp@example.com', 'public');
		RAISE EXCEPTION 'public email key unexpectedly accepted';
	EXCEPTION WHEN check_violation THEN NULL;
	END;

	-- Alice, signed in.
	PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', alice, 'role', 'authenticated')::text, true);
	SET LOCAL ROLE authenticated;

	INSERT INTO public.knowledge_entities(kind, name, scope, owner_user_id, is_self, created_via)
	VALUES ('person', 'Alice', 'private', alice, true, 'system') RETURNING id INTO alice_self;
	INSERT INTO public.knowledge_entities(kind, name, scope, owner_user_id, created_via)
	VALUES ('person', 'Sam Rivera', 'private', alice, 'import') RETURNING id INTO alice_sam;
	INSERT INTO public.knowledge_entities(kind, name, scope, owner_user_id, created_via)
	VALUES ('person', 'Sammy Rivera', 'private', alice, 'task') RETURNING id INTO alice_sam_dupe;

	-- Alice's private phone for a public executive.
	INSERT INTO public.knowledge_facts(entity_id, predicate, value_text, scope, owner_user_id, created_via)
	VALUES (karp, 'phone', '+15555550111', 'private', alice, 'manual');
	-- Alice knows Sam; Sam works at Palantir.
	INSERT INTO public.knowledge_facts(entity_id, predicate, object_entity_id, qualifiers, scope, owner_user_id, created_via)
	VALUES (alice_self, 'knows', alice_sam, '{"via":"linkedin"}', 'private', alice, 'import');
	INSERT INTO public.knowledge_facts(entity_id, predicate, object_entity_id, qualifiers, scope, owner_user_id, created_via)
	VALUES (alice_sam, 'works_at', palantir, '{"title":"Engineer"}', 'private', alice, 'import');
	INSERT INTO public.knowledge_facts(entity_id, predicate, value_text, scope, owner_user_id, created_via)
	VALUES (alice_sam_dupe, 'email', 'sam@example.com', 'private', alice, 'task');
	INSERT INTO public.knowledge_facts(entity_id, predicate, object_entity_id, scope, owner_user_id, created_via)
	VALUES (alice_sam_dupe, 'works_at', palantir, 'private', alice, 'task');

	-- Duplicate facts collapse on the dedupe key.
	BEGIN
		INSERT INTO public.knowledge_facts(entity_id, predicate, value_text, scope, owner_user_id)
		VALUES (karp, 'phone', '+15555550111', 'private', alice);
		RAISE EXCEPTION 'duplicate fact unexpectedly accepted';
	EXCEPTION WHEN unique_violation THEN NULL;
	END;

	-- Signed-in users cannot write public rows.
	BEGIN
		INSERT INTO public.knowledge_entities(kind, name, scope) VALUES ('org', 'Spam Inc', 'public');
		RAISE EXCEPTION 'signed-in public entity unexpectedly accepted';
	EXCEPTION WHEN insufficient_privilege THEN NULL;
	END;
	-- Kind checks: works_at must point at an org.
	BEGIN
		INSERT INTO public.knowledge_facts(entity_id, predicate, object_entity_id, scope, owner_user_id)
		VALUES (alice_sam, 'works_at', karp, 'private', alice);
		RAISE EXCEPTION 'works_at a person unexpectedly accepted';
	EXCEPTION WHEN invalid_parameter_value THEN NULL;
	END;

	SELECT count(*) INTO n FROM public.knowledge_search('palantir');
	IF n <> 1 THEN RAISE EXCEPTION 'alice should find Palantir once, got %', n; END IF;
	SELECT count(*) INTO n FROM public.knowledge_search('sam@example');
	IF n <> 1 THEN RAISE EXCEPTION 'alice should find Sam by email, got %', n; END IF;

	-- Merge the duplicate Sam: facts move, works_at collapses, the old name becomes an alias.
	merged := public.knowledge_merge_entities(alice_sam, alice_sam_dupe);
	IF (merged->>'duplicates_dropped')::int <> 1 THEN
		RAISE EXCEPTION 'merge should drop the duplicate works_at: %', merged;
	END IF;
	SELECT count(*) INTO n FROM public.knowledge_facts WHERE entity_id = alice_sam;
	IF n <> 3 THEN RAISE EXCEPTION 'Sam should have works_at, email and alias, got %', n; END IF;
	SELECT count(*) INTO n FROM public.knowledge_search('sammy');
	IF n <> 1 THEN RAISE EXCEPTION 'merged name should resolve through the alias, got %', n; END IF;
	-- The public person cannot be merged away.
	BEGIN
		PERFORM public.knowledge_merge_entities(alice_sam, karp);
		RAISE EXCEPTION 'merging a public entity away unexpectedly accepted';
	EXCEPTION WHEN insufficient_privilege THEN NULL;
	END;

	-- One-call browse list (20261117010000): Alice knows Sam; counts cover her entries.
	listed := public.knowledge_list(NULL, 'known');
	IF (listed->>'total')::int <> 1 OR (listed->>'known_count')::int <> 1 THEN
		RAISE EXCEPTION 'alice should know exactly Sam: %', listed;
	END IF;
	listed := public.knowledge_list(ARRAY['org'], 'all');
	IF (listed->>'total')::int <> 1 THEN
		RAISE EXCEPTION 'alice''s orgs should be Palantir (public, recorded about): %', listed;
	END IF;
	-- Signed-in users cannot write run rows (cost and status are server-written).
	BEGIN
		INSERT INTO public.knowledge_runs(owner_user_id, run_type, title, cost_usd)
		VALUES (alice, 'enrichment', 'free money', -100);
		RAISE EXCEPTION 'signed-in run insert unexpectedly accepted';
	EXCEPTION WHEN insufficient_privilege THEN NULL;
	END;
	-- Merge candidates are stored in a fixed order.
	BEGIN
		INSERT INTO public.knowledge_merge_candidates(owner_user_id, entity_a, entity_b, reason)
		VALUES (alice, GREATEST(alice_sam, karp), LEAST(alice_sam, karp), 'x');
		RAISE EXCEPTION 'unordered merge pair unexpectedly accepted';
	EXCEPTION WHEN check_violation THEN NULL;
	END;

	-- Bob, signed in.
	PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', bob, 'role', 'authenticated')::text, true);

	SELECT count(*) INTO n FROM public.knowledge_facts WHERE entity_id = karp;
	IF n <> 0 THEN RAISE EXCEPTION 'bob must not see alice''s phone for Karp, saw % facts', n; END IF;
	SELECT count(*) INTO n FROM public.knowledge_facts WHERE object_entity_id = palantir;
	IF n <> 0 THEN RAISE EXCEPTION 'bob must not see alice''s employment paths, saw %', n; END IF;
	SELECT count(*) INTO n FROM public.knowledge_entities WHERE scope = 'private';
	IF n <> 0 THEN RAISE EXCEPTION 'bob must not see alice''s private entities, saw %', n; END IF;
	SELECT count(*) INTO n FROM public.knowledge_search('sam');
	IF n <> 0 THEN RAISE EXCEPTION 'bob''s search must not reveal Sam, got %', n; END IF;
	SELECT count(*) INTO n FROM public.knowledge_facts WHERE entity_id = palantir;
	IF n <> 1 THEN RAISE EXCEPTION 'bob should see Palantir''s public homepage, got %', n; END IF;

	-- Bob cannot attach a fact to Alice's private entity, even claiming her id.
	BEGIN
		INSERT INTO public.knowledge_facts(entity_id, predicate, value_text, scope, owner_user_id)
		VALUES (alice_sam, 'note', 'hi', 'private', bob);
		RAISE EXCEPTION 'cross-owner fact unexpectedly accepted';
	EXCEPTION WHEN insufficient_privilege THEN NULL;
	END;
	BEGIN
		INSERT INTO public.knowledge_facts(entity_id, predicate, value_text, scope, owner_user_id)
		VALUES (palantir, 'note', 'hi', 'private', alice);
		RAISE EXCEPTION 'writing as another owner unexpectedly accepted';
	EXCEPTION WHEN insufficient_privilege THEN NULL;
	END;
	-- Bob's private fact pointing at Alice's private entity is refused.
	INSERT INTO public.knowledge_entities(kind, name, scope, owner_user_id)
	VALUES ('person', 'Bob contact', 'private', bob) RETURNING id INTO bob_private;
	BEGIN
		INSERT INTO public.knowledge_facts(entity_id, predicate, object_entity_id, scope, owner_user_id)
		VALUES (bob_private, 'knows', alice_sam, 'private', bob);
		RAISE EXCEPTION 'pointing at another user''s private entity unexpectedly accepted';
	EXCEPTION WHEN insufficient_privilege THEN NULL;
	END;
	-- Bob cannot merge Alice's entities.
	BEGIN
		PERFORM public.knowledge_merge_entities(palantir, alice_sam);
		RAISE EXCEPTION 'cross-owner merge unexpectedly accepted';
	EXCEPTION WHEN insufficient_privilege THEN NULL;
	END;

	-- A signed-in caller cannot ask as someone else.
	BEGIN
		PERFORM count(*) FROM public.knowledge_search('sam', NULL, 20, alice);
		RAISE EXCEPTION 'viewer spoof unexpectedly accepted';
	EXCEPTION WHEN insufficient_privilege THEN NULL;
	END;

	-- Server code (service role, RLS bypassed) must name the viewer, and the filter holds.
	RESET ROLE;
	PERFORM set_config('request.jwt.claims', '', true);
	SELECT (public.knowledge_list(NULL, 'all', 'sam', 50, 0, bob)->>'total')::int INTO n;
	IF n <> 0 THEN RAISE EXCEPTION 'service list as bob must not reveal Sam, got %', n; END IF;
	SELECT count(*) INTO n FROM public.knowledge_search('sam', NULL, 20, bob);
	IF n <> 0 THEN RAISE EXCEPTION 'service search as bob must not reveal Sam, got %', n; END IF;
	SELECT count(*) INTO n FROM public.knowledge_search('sam', NULL, 20, alice);
	IF n <> 1 THEN RAISE EXCEPTION 'service search as alice should find Sam, got %', n; END IF;
	BEGIN
		PERFORM count(*) FROM public.knowledge_search('sam');
		RAISE EXCEPTION 'service search without a viewer unexpectedly accepted';
	EXCEPTION WHEN insufficient_privilege THEN NULL;
	END;
	BEGIN
		PERFORM public.knowledge_merge_entities(palantir, alice_sam, bob);
		RAISE EXCEPTION 'service merge as the wrong viewer unexpectedly accepted';
	EXCEPTION WHEN insufficient_privilege THEN NULL;
	END;

	-- Research caps: one lock, daily total holds across runs, and the concurrency cap.
	reserved := public.knowledge_reserve_enrichment_run(alice, 'r1', '{}', '{}', 0.03, 1, 0.05, 2);
	IF (reserved->>'budget')::numeric <> 0.03 THEN RAISE EXCEPTION 'first run budget: %', reserved; END IF;
	reserved := public.knowledge_reserve_enrichment_run(alice, 'r2', '{}', '{}', 0.03, 1, 0.05, 2);
	IF (reserved->>'budget')::numeric <> 0.02 THEN RAISE EXCEPTION 'second run is capped by the day: %', reserved; END IF;
	reserved := public.knowledge_reserve_enrichment_run(alice, 'r3', '{}', '{}', 0.03, 1, 0.05, 2);
	IF reserved->>'error' <> 'busy' THEN RAISE EXCEPTION 'third concurrent run should be refused: %', reserved; END IF;
	UPDATE public.knowledge_runs SET status = 'completed', cost_usd = 0.05 WHERE owner_user_id = alice;
	reserved := public.knowledge_reserve_enrichment_run(alice, 'r4', '{}', '{}', 0.03, 1, 0.05, 2);
	IF reserved->>'error' <> 'spent' THEN RAISE EXCEPTION 'spent day should refuse: %', reserved; END IF;
	BEGIN
		UPDATE public.knowledge_runs SET cost_usd = -1 WHERE owner_user_id = alice;
		RAISE EXCEPTION 'negative cost unexpectedly accepted';
	EXCEPTION WHEN check_violation THEN NULL;
	END;

	-- Research queue (20261117100000): per-target instructions and phase, researched filter + sort.
	INSERT INTO public.knowledge_run_targets(run_id, owner_user_id, entity_id, status, instructions, finished_at)
	SELECT id, alice, palantir, 'done', 'Where is their headquarters?', now() - interval '1 day'
	FROM public.knowledge_runs WHERE owner_user_id = alice AND title = 'r1';
	BEGIN
		UPDATE public.knowledge_run_targets SET instructions = repeat('x', 1300) WHERE owner_user_id = alice;
		RAISE EXCEPTION 'overlong target instructions unexpectedly accepted';
	EXCEPTION WHEN check_violation THEN NULL;
	END;
	BEGIN
		UPDATE public.knowledge_run_targets SET phase = 'daydreaming' WHERE owner_user_id = alice;
		RAISE EXCEPTION 'unknown phase unexpectedly accepted';
	EXCEPTION WHEN check_violation THEN NULL;
	END;
	-- Alice's entries: Sam (private), Palantir and Karp (public, she recorded facts on them).
	listed := public.knowledge_list(NULL, 'all', NULL, 50, 0, alice, 'yes');
	IF (listed->>'total')::int <> 1 OR listed->'entities'->0->>'id' <> palantir::text
		OR listed->'entities'->0->>'researched_at' IS NULL THEN
		RAISE EXCEPTION 'researched should be just Palantir (her own target): %', listed;
	END IF;
	listed := public.knowledge_list(NULL, 'all', NULL, 50, 0, alice, 'no');
	IF (listed->>'total')::int <> 2 OR (listed->'researched'->>'yes')::int <> 1
		OR (listed->'researched'->>'no')::int <> 2 THEN
		RAISE EXCEPTION 'not researched should be Sam and Karp, with counts: %', listed;
	END IF;
	-- Bob never sees Alice's research as his.
	listed := public.knowledge_list(NULL, 'all', NULL, 50, 0, bob, 'yes');
	IF (listed->>'total')::int <> 0 THEN RAISE EXCEPTION 'bob sees alice''s research: %', listed; END IF;
	-- A private entry's enriched_at counts too; sort by last researched puts it first.
	UPDATE public.knowledge_entities SET enriched_at = now() WHERE id = alice_sam;
	listed := public.knowledge_list(NULL, 'all', NULL, 50, 0, alice, 'any', 'researched');
	IF listed->'entities'->0->>'id' <> alice_sam::text OR listed->'entities'->1->>'id' <> palantir::text
		OR listed->'entities'->2->>'id' <> karp::text THEN
		RAISE EXCEPTION 'researched sort should be Sam, Palantir, Karp: %', listed;
	END IF;
	listed := public.knowledge_list(NULL, 'all', NULL, 50, 0, alice, 'any', 'name');
	IF listed->'entities'->0->>'name' <> 'Alex Karp' OR listed->'entities'->2->>'name' <> 'Sam Rivera' THEN
		RAISE EXCEPTION 'name sort should be alphabetical: %', listed;
	END IF;
	BEGIN
		PERFORM public.knowledge_list(NULL, 'all', NULL, 50, 0, alice, 'any', 'random');
		RAISE EXCEPTION 'unknown sort unexpectedly accepted';
	EXCEPTION WHEN invalid_parameter_value THEN NULL;
	END;
	-- Signed in: the list reads her own targets through RLS; targets stay server-written.
	PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', alice, 'role', 'authenticated')::text, true);
	SET LOCAL ROLE authenticated;
	listed := public.knowledge_list(NULL, 'all', NULL, 50, 0, NULL, 'yes');
	IF (listed->>'total')::int <> 2 THEN RAISE EXCEPTION 'signed-in researched list: %', listed; END IF;
	BEGIN
		UPDATE public.knowledge_run_targets SET status = 'cancelled' WHERE owner_user_id = alice;
		RAISE EXCEPTION 'signed-in target update unexpectedly accepted';
	EXCEPTION WHEN insufficient_privilege THEN NULL;
	END;
	RESET ROLE;
	PERFORM set_config('request.jwt.claims', '', true);

	-- Deleting a merge survivor takes its merged-away tombstone with it.
	DELETE FROM public.knowledge_entities WHERE id = alice_sam;
	SELECT count(*) INTO n FROM public.knowledge_entities WHERE id IN (alice_sam, alice_sam_dupe);
	IF n <> 0 THEN RAISE EXCEPTION 'survivor delete should cascade to its tombstone, % left', n; END IF;

	RAISE NOTICE 'knowledge_graph.check: all assertions passed';
END $$;
ROLLBACK;
