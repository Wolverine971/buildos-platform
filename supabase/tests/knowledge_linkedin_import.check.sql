-- supabase/tests/knowledge_linkedin_import.check.sql
-- Disposable schema rehearsal only. Assert graph contents as well as receipts and ordering.
BEGIN;
INSERT INTO public.knowledge_kinds (key,label,plural_label,description,shareable,sort_order)
VALUES ('person','Person','People','Person',true,10), ('org','Organization','Organizations','Employer',true,20)
ON CONFLICT DO NOTHING;
INSERT INTO public.knowledge_predicates
	(key,label,description,value_type,subject_kinds,object_kinds,cardinality,sort_order)
VALUES
	('knows','Knows','Contact','entity','{person}','{person}','many',210),
	('works_at','Works at','Employer','entity','{person}','{org}','many',200),
	('email','Email','Email','email','{person}','{}','many',70),
	('profile_url','Profile','Profile','url','{person}','{}','many',60),
	('headline','Headline','Title','text','{person}','{}','one',30)
ON CONFLICT DO NOTHING;

DO $$
DECLARE
	alice uuid := gen_random_uuid();
	bob uuid := gen_random_uuid();
	run uuid := gen_random_uuid();
	other_run uuid := gen_random_uuid();
	replay_run uuid := gen_random_uuid();
	short uuid := gen_random_uuid();
	other_short uuid := gen_random_uuid();
	full_person uuid := gen_random_uuid();
	company uuid := gen_random_uuid();
	other_company uuid := gen_random_uuid();
	people jsonb := '[
		{"name":"Alex Kim","given_name":"Alex","linkedin_key":"in/alex","profile_url":"https://linkedin.com/in/alex","email":"alex@example.org","company":"Magnum/LPL","title":"Engineer","connected_on":"2019-02-01"},
		{"name":"Phil West","given_name":"Phil","linkedin_key":"in/phil-west","profile_url":"https://linkedin.com/in/phil-west","company":"Cadre","title":"Director","connected_on":"2025-10-17"},
		{"name":"Phil East","given_name":"Phil","linkedin_key":"in/phil-east","company":"Magnum-LPL","connected_on":"2026-01-02"},
		{"name":"Sam Greene","given_name":"Sam","company":"thecadre"}
	]';
	first_run jsonb;
	replay jsonb;
	listed jsonb;
	before_counts int[];
	after_counts int[];
BEGIN
	INSERT INTO auth.users(id,email) VALUES (alice,'li-alice@example.org'), (bob,'li-bob@example.org');
	INSERT INTO public.users(id,email) VALUES (alice,'li-alice@example.org'), (bob,'li-bob@example.org')
	ON CONFLICT DO NOTHING;
	INSERT INTO public.knowledge_runs(id, owner_user_id,run_type,status,title) VALUES
		(run,alice,'import','running','Contacts'),(replay_run,alice,'import','running','Replay'),(other_run,bob,'import','running','Contacts');
	INSERT INTO public.knowledge_entities(id, kind,name,scope,owner_user_id,created_via) VALUES
		(short,'person','Phil','private',alice,'task'),(other_short,'person','Phil','private',bob,'task'),
		(full_person,'person','Alex Kim','private',alice,'backfill'),
		(company,'org','The Cadre','private',alice,'task'),(other_company,'org','Magnum-LPL','private',alice,'task');
	INSERT INTO public.knowledge_facts(entity_id,predicate,object_entity_id,scope,owner_user_id)
	VALUES (short,'works_at',company,'private',alice);

	PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',alice,'role','authenticated')::text,true);
	SET LOCAL ROLE authenticated;
	BEGIN
		PERFORM public.knowledge_import_linkedin(people,'Connections.csv',other_run);
		RAISE EXCEPTION 'Accepted another owner''s run';
	EXCEPTION WHEN insufficient_privilege THEN NULL;
	END;
	IF public.knowledge_fact_share_level('connected_on','person','active','{}',true,true) <> 'never' THEN
		RAISE EXCEPTION 'Private relationship date can appear in a project';
	END IF;
	BEGIN
		PERFORM public.knowledge_import_linkedin(jsonb_build_array(
			jsonb_build_object('name','First row'), jsonb_build_object('name',repeat('X',301))), 'bad.csv',run);
		RAISE EXCEPTION 'Unexpectedly accepted invalid row';
	EXCEPTION WHEN check_violation THEN NULL;
	END;
	IF EXISTS (SELECT FROM public.knowledge_entities WHERE name = 'First row')
		OR EXISTS (SELECT FROM public.knowledge_sources WHERE title = 'bad.csv') THEN
		RAISE EXCEPTION 'A rejected batch committed a partial graph';
	END IF;
	UPDATE public.knowledge_entities SET circle = 'public' WHERE id = full_person;
	first_run := public.knowledge_import_linkedin(people,'Connections.csv',run);
	IF NOT first_run @> '{"people_created":3,"people_matched":1,"possible_duplicates":2,"facts_added":16}' THEN
		RAISE EXCEPTION 'Unexpected first receipt %', first_run;
	END IF;
	IF NOT EXISTS (SELECT FROM public.knowledge_facts WHERE entity_id = full_person AND predicate = 'email'
			AND value_text = 'alex@example.org' AND scope = 'private')
		OR NOT EXISTS (SELECT FROM public.knowledge_facts WHERE entity_id = full_person AND predicate = 'works_at'
			AND object_entity_id = other_company AND qualifiers->>'title' = 'Engineer')
		OR (SELECT count(*) FROM public.knowledge_entities WHERE kind='person' AND normalized_org_name IS NOT NULL) <> 0 THEN
		RAISE EXCEPTION 'Exact full name, employer folding, title or contact privacy failed';
	END IF;
	IF NOT EXISTS (SELECT FROM public.knowledge_merge_candidates m JOIN public.knowledge_entities e
		ON e.id IN (m.entity_a, m.entity_b) WHERE short IN (m.entity_a,m.entity_b) AND e.name='Phil West')
		OR EXISTS (SELECT FROM public.knowledge_merge_candidates m JOIN public.knowledge_entities e
		ON e.id IN (m.entity_a, m.entity_b) WHERE short IN (m.entity_a,m.entity_b) AND e.name='Phil East') THEN
		RAISE EXCEPTION 'Short-name suggestion did not require the same employer';
	END IF;
	listed := public.knowledge_list(p_view=>'world',p_filter=>'known',p_sort=>'connected',p_limit=>2,p_offset=>1);
	IF listed->'entities'->0->>'name' IS DISTINCT FROM 'Phil West' OR listed->'entities'->1->>'name' IS DISTINCT FROM 'Alex Kim'
		OR (listed->>'total')::int <> 4 THEN RAISE EXCEPTION 'Connection date pagination failed %', listed; END IF;
	SELECT ARRAY[(SELECT count(*) FROM public.knowledge_entities),(SELECT count(*) FROM public.knowledge_entity_keys),
		(SELECT count(*) FROM public.knowledge_sources),(SELECT count(*) FROM public.knowledge_facts),
		(SELECT count(*) FROM public.knowledge_fact_sources),(SELECT count(*) FROM public.knowledge_merge_candidates)]
	INTO before_counts;
	UPDATE public.knowledge_merge_candidates SET status = 'rejected' WHERE short IN (entity_a,entity_b);
	replay := public.knowledge_import_linkedin(people,'renamed.csv',replay_run);
	SELECT ARRAY[(SELECT count(*) FROM public.knowledge_entities),(SELECT count(*) FROM public.knowledge_entity_keys),
		(SELECT count(*) FROM public.knowledge_sources),(SELECT count(*) FROM public.knowledge_facts),
		(SELECT count(*) FROM public.knowledge_fact_sources),(SELECT count(*) FROM public.knowledge_merge_candidates)]
	INTO after_counts;
	IF before_counts <> after_counts OR NOT replay @> '{"people_created":0,"people_matched":4,"possible_duplicates":0,"facts_added":0}'
		OR NOT EXISTS (SELECT FROM public.knowledge_merge_candidates WHERE status = 'rejected') THEN
		RAISE EXCEPTION 'Replay changed graph or reopened a decision %', replay;
	END IF;
	-- Same full name, different LinkedIn key, even when a team inbox is shared.
	replay := public.knowledge_import_linkedin('[{"name":"Alex Kim","given_name":"Alex","linkedin_key":"in/another-alex","email":"alex@example.org"}]', 'new.csv',run);
	IF (replay->>'people_created')::int <> 1 THEN RAISE EXCEPTION 'Different LinkedIn profiles were joined'; END IF;
	PERFORM set_config('request.jwt.claims', jsonb_build_object('sub',bob,'role','authenticated')::text,true);
	IF EXISTS (SELECT FROM public.knowledge_facts WHERE owner_user_id=alice) OR
		EXISTS (SELECT FROM public.knowledge_entity_keys WHERE owner_user_id=alice) OR
		EXISTS (SELECT FROM public.knowledge_merge_candidates WHERE owner_user_id=alice) THEN
		RAISE EXCEPTION 'Another account can see private import data';
	END IF;
END;
$$;
ROLLBACK;
