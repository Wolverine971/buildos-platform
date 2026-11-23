-- supabase/tests/knowledge_import_undo.check.sql
-- Disposable schema rehearsal only. An import's undo removes exactly what the import added and
-- leaves what was there before, what the owner used since, and other accounts' data.
BEGIN;
INSERT INTO public.knowledge_kinds (key,label,plural_label,description,shareable,sort_order)
VALUES ('person','Person','People','Person',true,10), ('org','Organization','Organizations','Employer',true,20)
ON CONFLICT DO NOTHING;
INSERT INTO public.knowledge_predicates
	(key,label,description,value_type,subject_kinds,object_kinds,cardinality,sort_order)
VALUES
	('knows','Knows','Contact','entity','{person}','{person}','many',210),
	('works_at','Works at','Employer','entity','{person}','{org}','many',200),
	('phone','Phone','Phone','phone','{person,org}','{}','many',80),
	('note','Note','Note','text','{}','{}','many',90)
ON CONFLICT DO NOTHING;

DO $$
DECLARE
	alice uuid := gen_random_uuid();
	bob uuid := gen_random_uuid();
	run uuid := gen_random_uuid();
	bob_run uuid := gen_random_uuid();
	me uuid := gen_random_uuid();
	old_person uuid := gen_random_uuid();   -- was here before (a LinkedIn connection)
	new_person uuid := gen_random_uuid();   -- made by the import, untouched
	used_person uuid := gen_random_uuid();  -- made by the import, then the owner added a note
	new_org uuid := gen_random_uuid();      -- made by the import, only new_person works there
	used_org uuid := gen_random_uuid();     -- made by the import, used_person works there
	bob_person uuid := gen_random_uuid();
	src uuid := gen_random_uuid();
	result jsonb;
BEGIN
	INSERT INTO auth.users(id,email) VALUES (alice,'undo-alice@example.org'), (bob,'undo-bob@example.org');
	INSERT INTO public.users(id,email) VALUES (alice,'undo-alice@example.org'), (bob,'undo-bob@example.org')
	ON CONFLICT DO NOTHING;
	INSERT INTO public.knowledge_runs(id,owner_user_id,run_type,status,title) VALUES
		(run,alice,'import','completed','Phone contacts'), (bob_run,bob,'import','completed','Phone contacts');
	INSERT INTO public.knowledge_entities(id,kind,name,scope,owner_user_id,created_via,is_self) VALUES
		(me,'person','Alice','private',alice,'system',true),
		(old_person,'person','Maya Chen','private',alice,'import',false);

	PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',alice,'role','authenticated')::text,true);
	SET LOCAL ROLE authenticated;

	-- What the import writes, as the signed-in owner (the run stamp must be allowed).
	INSERT INTO public.knowledge_entities(id,kind,name,scope,owner_user_id,created_via,run_id) VALUES
		(new_person,'person','Mike Smith','private',alice,'import',run),
		(used_person,'person','Sam Rivera','private',alice,'import',run),
		(new_org,'org','Corner Dental','private',alice,'import',run),
		(used_org,'org','Rivera Roofing','private',alice,'import',run);
	INSERT INTO public.knowledge_sources(id,scope,owner_user_id,source_type,title,meta)
	VALUES (src,'private',alice,'import','contacts.vcf',jsonb_build_object('run_id',run));
	INSERT INTO public.knowledge_facts(entity_id,predicate,object_entity_id,value_text,scope,owner_user_id,created_via,run_id) VALUES
		(me,'knows',new_person,NULL,'private',alice,'import',run),
		(me,'knows',used_person,NULL,'private',alice,'import',run),
		(new_person,'phone',NULL,'+14105550101','private',alice,'import',run),
		(new_person,'works_at',new_org,NULL,'private',alice,'import',run),
		(used_person,'works_at',used_org,NULL,'private',alice,'import',run),
		(old_person,'phone',NULL,'+14105550102','private',alice,'import',run);
	INSERT INTO public.knowledge_fact_sources(fact_id,source_id)
	SELECT id, src FROM public.knowledge_facts WHERE run_id = run;
	INSERT INTO public.knowledge_entity_keys(entity_id,key_type,key_value,scope,owner_user_id,run_id) VALUES
		(new_person,'phone','+14105550101','private',alice,run),
		(old_person,'phone','+14105550102','private',alice,run);
	INSERT INTO public.knowledge_merge_candidates(owner_user_id,entity_a,entity_b,reason)
	VALUES (alice,least(old_person,new_person),greatest(old_person,new_person),'Same last name, similar first name');
	-- The owner's own later edit.
	INSERT INTO public.knowledge_facts(entity_id,predicate,value_text,scope,owner_user_id,created_via)
	VALUES (used_person,'note','Met at the conference','private',alice,'manual');

	BEGIN
		PERFORM public.knowledge_undo_import(bob_run);
		RAISE EXCEPTION 'Undid another owner''s import';
	EXCEPTION WHEN insufficient_privilege THEN NULL;
	END;

	result := public.knowledge_undo_import(run);
	IF NOT result @> '{"people_removed":1,"orgs_removed":1,"details_removed":4,"kept":2}' THEN
		RAISE EXCEPTION 'Unexpected undo receipt %', result;
	END IF;
	IF EXISTS (SELECT FROM public.knowledge_entities WHERE id IN (new_person,new_org))
		OR EXISTS (SELECT FROM public.knowledge_merge_candidates WHERE owner_user_id = alice)
		OR EXISTS (SELECT FROM public.knowledge_entity_keys WHERE run_id = run) THEN
		RAISE EXCEPTION 'The import''s own entries, keys or duplicate questions are still there';
	END IF;
	IF NOT EXISTS (SELECT FROM public.knowledge_entities WHERE id = old_person)
		OR EXISTS (SELECT FROM public.knowledge_facts WHERE entity_id = old_person) THEN
		RAISE EXCEPTION 'A person who was already there was removed, or kept the imported phone';
	END IF;
	IF (SELECT count(*) FROM public.knowledge_entities WHERE id IN (used_person,used_org)) <> 2
		OR NOT EXISTS (SELECT FROM public.knowledge_facts WHERE entity_id = me AND object_entity_id = used_person)
		OR NOT EXISTS (SELECT FROM public.knowledge_facts WHERE entity_id = used_person AND object_entity_id = used_org)
		OR NOT EXISTS (SELECT FROM public.knowledge_sources WHERE id = src) THEN
		RAISE EXCEPTION 'An entry the owner used since lost its details, employer or source';
	END IF;

	result := public.knowledge_undo_import(run);
	IF NOT result @> '{"people_removed":0,"orgs_removed":0,"details_removed":0}' THEN
		RAISE EXCEPTION 'A second undo removed more %', result;
	END IF;

	RESET ROLE;
	IF NOT EXISTS (SELECT FROM public.knowledge_entities WHERE id = me) THEN
		RAISE EXCEPTION 'The owner''s own entry was removed';
	END IF;
END;
$$;
ROLLBACK;
