-- supabase/tests/knowledge_linkedin_import_undo.check.sql
-- Disposable schema rehearsal only. A LinkedIn import can be undone: what it created goes,
-- what was already there gets its old headline and summary back, a summary the owner wrote is
-- never replaced, and an entry the owner edited since stays.
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
	('headline','Headline','Title','text','{person}','{}','one',30),
	('connected_on','Connected on LinkedIn','Date','date','{person}','{}','one',215)
ON CONFLICT DO NOTHING;

DO $$
DECLARE
	alice uuid := gen_random_uuid();
	run uuid := gen_random_uuid();
	me uuid := gen_random_uuid();
	maya uuid := gen_random_uuid();   -- already here; the owner wrote her summary
	lee uuid := gen_random_uuid();    -- already here; an earlier import wrote his headline + summary
	old_headline uuid := gen_random_uuid();
	ravi uuid;
	rows jsonb := '[
		{"name":"Maya Chen","given_name":"Maya","linkedin_key":"in/maya","company":"Initech","title":"VP","connected_on":"2020-01-01"},
		{"name":"Lee Park","given_name":"Lee","linkedin_key":"in/lee","company":"Acme","title":"Manager","connected_on":"2021-01-01"},
		{"name":"Nia Ortiz","given_name":"Nia","linkedin_key":"in/nia","company":"Globex","title":"Engineer","connected_on":"2022-01-01"},
		{"name":"Ravi Shah","given_name":"Ravi","linkedin_key":"in/ravi","company":"Globex","connected_on":"2023-01-01"}
	]';
	result jsonb;
BEGIN
	INSERT INTO auth.users(id,email) VALUES (alice,'li-undo-alice@example.org');
	INSERT INTO public.users(id,email) VALUES (alice,'li-undo-alice@example.org') ON CONFLICT DO NOTHING;
	INSERT INTO public.knowledge_runs(id,owner_user_id,run_type,status,title)
	VALUES (run,alice,'import','running','LinkedIn connections');
	INSERT INTO public.knowledge_entities(id,kind,name,summary,scope,owner_user_id,created_via,is_self,edited_at) VALUES
		(me,'person','Alice',NULL,'private',alice,'system',true,NULL),
		(maya,'person','Maya Chen','My old boss','private',alice,'manual',false,now()),
		(lee,'person','Lee Park','Analyst at Acme','private',alice,'import',false,NULL);
	INSERT INTO public.knowledge_facts(id,entity_id,predicate,value_text,scope,owner_user_id,created_via,created_at)
	VALUES (old_headline,lee,'headline','Analyst at Acme','private',alice,'import',now() - interval '1 year');

	PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',alice,'role','authenticated')::text,true);
	SET LOCAL ROLE authenticated;

	result := public.knowledge_import_linkedin(rows,'Connections.csv',run);
	IF NOT result @> '{"people_created":2,"people_matched":2}' THEN
		RAISE EXCEPTION 'Unexpected import receipt %', result;
	END IF;
	IF (SELECT summary FROM public.knowledge_entities WHERE id = maya) <> 'My old boss' THEN
		RAISE EXCEPTION 'The import replaced a summary the owner wrote';
	END IF;
	IF (SELECT summary FROM public.knowledge_entities WHERE id = lee) <> 'Manager at Acme'
		OR (SELECT status FROM public.knowledge_facts WHERE id = old_headline) <> 'superseded' THEN
		RAISE EXCEPTION 'The import did not refresh a summary and headline an earlier import wrote';
	END IF;
	IF (SELECT count(*) FROM public.knowledge_entities WHERE run_id = run) <> 5
		OR NOT EXISTS (SELECT FROM public.knowledge_entity_keys WHERE run_id = run AND key_value = 'in/nia')
		OR NOT EXISTS (SELECT FROM public.knowledge_sources WHERE owner_user_id = alice AND meta ->> 'run_id' = run::text) THEN
		RAISE EXCEPTION 'The import did not stamp its people, organizations, keys and source with its run';
	END IF;

	-- The owner renames one of the new people afterwards.
	SELECT id INTO STRICT ravi FROM public.knowledge_entities WHERE owner_user_id = alice AND name = 'Ravi Shah';
	UPDATE public.knowledge_entities SET name = 'Ravi S.', edited_at = now() WHERE id = ravi;

	result := public.knowledge_undo_import(run);
	-- Nia goes; Ravi stays (edited), and so does his employer Globex. Initech and Acme go.
	IF NOT result @> '{"people_removed":1,"orgs_removed":2}' THEN
		RAISE EXCEPTION 'Unexpected undo receipt %', result;
	END IF;
	IF EXISTS (SELECT FROM public.knowledge_entities WHERE owner_user_id = alice AND name IN ('Nia Ortiz','Initech','Acme'))
		OR NOT EXISTS (SELECT FROM public.knowledge_entities WHERE id = ravi AND name = 'Ravi S.')
		OR NOT EXISTS (SELECT FROM public.knowledge_entities WHERE owner_user_id = alice AND name = 'Globex') THEN
		RAISE EXCEPTION 'Undo removed an edited entry or kept an untouched one';
	END IF;
	IF EXISTS (SELECT FROM public.knowledge_entity_keys k WHERE k.run_id = run
		AND NOT EXISTS (SELECT FROM public.knowledge_entities e WHERE e.id = k.entity_id AND e.id = ravi)
		AND k.entity_id <> (SELECT id FROM public.knowledge_entities WHERE owner_user_id = alice AND name = 'Globex')) THEN
		RAISE EXCEPTION 'Identity keys the import added are still there';
	END IF;
	IF (SELECT status FROM public.knowledge_facts WHERE id = old_headline) <> 'active'
		OR (SELECT summary FROM public.knowledge_entities WHERE id = lee) <> 'Analyst at Acme'
		OR EXISTS (SELECT FROM public.knowledge_facts WHERE entity_id IN (lee, maya) AND run_id = run) THEN
		RAISE EXCEPTION 'Someone who was already here did not get their old headline and summary back';
	END IF;
	IF (SELECT summary FROM public.knowledge_entities WHERE id = maya) <> 'My old boss' THEN
		RAISE EXCEPTION 'Undo changed a summary the owner wrote';
	END IF;
	RESET ROLE;
END;
$$;
ROLLBACK;
