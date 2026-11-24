-- supabase/tests/knowledge_company_lookup.check.sql
-- Disposable schema rehearsal only (tasker 170). What must hold after the migration:
--   - a 'locate' run can be created, and the older run types still can
--   - the directory and the source cache are closed to signed-in users and to anon
--   - a user reads and answers only their own "Which one?" question, and cannot rewrite what
--     the server found
--   - only an "ask" carries a question; an answer needs a choice
BEGIN;
INSERT INTO public.knowledge_kinds (key,label,plural_label,description,shareable,sort_order)
VALUES ('org','Organization','Organizations','Employer',true,20)
ON CONFLICT DO NOTHING;

DO $$
DECLARE
	alice uuid := gen_random_uuid();
	bob uuid := gen_random_uuid();
	run uuid := gen_random_uuid();
	alice_org uuid := gen_random_uuid();
	alice_plain uuid := gen_random_uuid();
	bob_org uuid := gen_random_uuid();
	alice_question uuid := gen_random_uuid();
	bob_question uuid := gen_random_uuid();
	options jsonb := '[{"key":"summitllc.com","name":"Summit Consulting"},{"key":"summitcg.com","name":"Summit Consulting"}]';
	seen integer;
	changed integer;
BEGIN
	INSERT INTO auth.users(id,email) VALUES (alice,'cl-alice@example.org'), (bob,'cl-bob@example.org');
	INSERT INTO public.users(id,email) VALUES (alice,'cl-alice@example.org'), (bob,'cl-bob@example.org')
	ON CONFLICT DO NOTHING;

	-- Run types: the new one is accepted, the old ones still are, anything else is refused.
	INSERT INTO public.knowledge_runs(id, owner_user_id, run_type, status, title)
	VALUES (run, alice, 'locate', 'queued', 'Finding where 2 companies are');
	INSERT INTO public.knowledge_runs(owner_user_id, run_type, status, title) VALUES
		(alice,'import','running','Contacts'), (alice,'enrichment','queued','Research'), (alice,'backfill','queued','Backfill');
	BEGIN
		INSERT INTO public.knowledge_runs(owner_user_id, run_type, status, title) VALUES (alice,'made_up','queued','x');
		RAISE EXCEPTION 'An unknown run type was accepted';
	EXCEPTION WHEN check_violation THEN NULL;
	END;

	INSERT INTO public.knowledge_entities(id, kind, name, scope, owner_user_id, created_via) VALUES
		(alice_org,'org','Summit Consulting','private',alice,'import'),
		(alice_plain,'org','Booz Allen Hamilton','private',alice,'import'),
		(bob_org,'org','Summit Consulting','private',bob,'import');

	INSERT INTO public.knowledge_company_lookups(id, owner_user_id, entity_id, run_id, outcome, options, options_total, question_status) VALUES
		(alice_question, alice, alice_org, run, 'ask', options, 2, 'open'),
		(bob_question, bob, bob_org, NULL, 'ask', options, 2, 'open');
	INSERT INTO public.knowledge_company_lookups(owner_user_id, entity_id, run_id, outcome)
	VALUES (alice, alice_plain, run, 'placed');

	-- Shape rules.
	BEGIN
		INSERT INTO public.knowledge_company_lookups(owner_user_id, entity_id, outcome, question_status)
		VALUES (bob, alice_plain, 'none', 'open');
		RAISE EXCEPTION 'A lookup that is not a question carried a question status';
	EXCEPTION WHEN check_violation OR foreign_key_violation OR unique_violation THEN NULL;
	END;
	BEGIN
		UPDATE public.knowledge_company_lookups SET question_status = 'answered' WHERE id = bob_question;
		RAISE EXCEPTION 'A question was answered without a choice';
	EXCEPTION WHEN check_violation THEN NULL;
	END;
	BEGIN
		INSERT INTO public.knowledge_company_lookups(owner_user_id, entity_id, outcome) VALUES (alice, alice_plain, 'none');
		RAISE EXCEPTION 'A second lookup row for one organization was accepted';
	EXCEPTION WHEN unique_violation THEN NULL;
	END;

	INSERT INTO public.company_directory(name_key, name, website, locality, region, country, size)
	VALUES ('summitconsulting','summit consulting','summitllc.com','washington','district of columbia','united states','51-200');
	INSERT INTO public.company_lookup_cache(source, name_key, candidates) VALUES ('gleif','summitconsulting','[]');
	BEGIN
		INSERT INTO public.company_lookup_cache(source, name_key) VALUES ('made_up','x');
		RAISE EXCEPTION 'An unknown source was cached';
	EXCEPTION WHEN check_violation THEN NULL;
	END;

	-- Signed in as Alice.
	PERFORM set_config('request.jwt.claims', jsonb_build_object('sub',alice,'role','authenticated')::text, true);
	SET LOCAL ROLE authenticated;

	SELECT count(*) INTO seen FROM public.knowledge_company_lookups;
	IF seen <> 2 THEN RAISE EXCEPTION 'Alice should see her 2 lookups, saw %', seen; END IF;
	IF EXISTS (SELECT FROM public.knowledge_company_lookups WHERE owner_user_id = bob) THEN
		RAISE EXCEPTION 'Alice can read Bob''s lookup';
	END IF;

	BEGIN
		PERFORM count(*) FROM public.company_directory;
		RAISE EXCEPTION 'A signed-in user can read the company directory';
	EXCEPTION WHEN insufficient_privilege THEN NULL;
	END;
	BEGIN
		PERFORM count(*) FROM public.company_lookup_cache;
		RAISE EXCEPTION 'A signed-in user can read the lookup cache';
	EXCEPTION WHEN insufficient_privilege THEN NULL;
	END;
	BEGIN
		INSERT INTO public.knowledge_company_lookups(owner_user_id, entity_id, outcome) VALUES (alice, alice_org, 'placed');
		RAISE EXCEPTION 'A signed-in user can create a lookup row';
	EXCEPTION WHEN insufficient_privilege THEN NULL;
	END;
	BEGIN
		UPDATE public.knowledge_company_lookups SET options = '[]' WHERE id = alice_question;
		RAISE EXCEPTION 'A signed-in user can rewrite what the lookup found';
	EXCEPTION WHEN insufficient_privilege THEN NULL;
	END;
	BEGIN
		INSERT INTO public.knowledge_runs(owner_user_id, run_type, status, title) VALUES (alice,'locate','queued','x');
		RAISE EXCEPTION 'A signed-in user can create a run';
	EXCEPTION WHEN insufficient_privilege THEN NULL;
	END;

	-- She answers her own question...
	UPDATE public.knowledge_company_lookups
	SET question_status = 'answered', chosen_key = 'summitllc.com', answered_at = now()
	WHERE id = alice_question;
	GET DIAGNOSTICS changed = ROW_COUNT;
	IF changed <> 1 THEN RAISE EXCEPTION 'Alice could not answer her own question'; END IF;

	-- ...but not Bob's, and not a row that is not a question.
	UPDATE public.knowledge_company_lookups SET question_status = 'skipped' WHERE id = bob_question;
	GET DIAGNOSTICS changed = ROW_COUNT;
	IF changed <> 0 THEN RAISE EXCEPTION 'Alice answered Bob''s question'; END IF;
	UPDATE public.knowledge_company_lookups SET answered_at = now() WHERE entity_id = alice_plain;
	GET DIAGNOSTICS changed = ROW_COUNT;
	IF changed <> 0 THEN RAISE EXCEPTION 'A row with no question was updated by its owner'; END IF;

	RESET ROLE;
	IF (SELECT question_status FROM public.knowledge_company_lookups WHERE id = bob_question) <> 'open' THEN
		RAISE EXCEPTION 'Bob''s question changed';
	END IF;

	-- Logged out: nothing at all.
	PERFORM set_config('request.jwt.claims', '{"role":"anon"}', true);
	SET LOCAL ROLE anon;
	BEGIN
		PERFORM count(*) FROM public.knowledge_company_lookups;
		RAISE EXCEPTION 'anon can read lookups';
	EXCEPTION WHEN insufficient_privilege THEN NULL;
	END;
	BEGIN
		PERFORM count(*) FROM public.company_directory;
		RAISE EXCEPTION 'anon can read the company directory';
	EXCEPTION WHEN insufficient_privilege THEN NULL;
	END;
	RESET ROLE;

	-- Deleting the organization takes its lookup with it (an undone import leaves nothing behind).
	DELETE FROM public.knowledge_entities WHERE id = alice_org;
	IF EXISTS (SELECT FROM public.knowledge_company_lookups WHERE id = alice_question) THEN
		RAISE EXCEPTION 'A lookup outlived its organization';
	END IF;
END;
$$;
ROLLBACK;
