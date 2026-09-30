-- supabase/tests/chat_document_archive_review.check.sql
-- Free local rehearsal only: synthetic rows, never production data.
DO $$
DECLARE
  u uuid := 'a1140000-0000-4000-8000-000000000001';
  a uuid := 'a1140000-0000-4000-8000-000000000002';
  p uuid := 'a1140000-0000-4000-8000-000000000003';
  d uuid := 'a1140000-0000-4000-8000-000000000010';
  c uuid := 'a1140000-0000-4000-8000-000000000011';
  s uuid := 'a1140000-0000-4000-8000-000000000012';
  h uuid := 'a1140000-0000-4000-8000-000000000013';
  snap jsonb;
  sibling_snap jsonb;
  out jsonb;
  tree jsonb;
BEGIN
  ASSERT NOT has_function_privilege('authenticated', 'public.onto_document_archive_review_snapshot(uuid,uuid,text)', 'EXECUTE');
  ASSERT NOT has_function_privilege('anon', 'public.onto_document_archive_reviewed_atomic(uuid,uuid,uuid[],timestamptz,integer,jsonb,uuid,jsonb,text,jsonb)', 'EXECUTE');
  INSERT INTO auth.users (id,email) VALUES (u,'archive-review@example.com');
  INSERT INTO public.users (id,email) VALUES (u,'archive-review@example.com') ON CONFLICT DO NOTHING;
  INSERT INTO public.onto_actors (id,kind,name,user_id) VALUES (a,'human','Archive review',u) ON CONFLICT DO NOTHING;
  SELECT id INTO a FROM public.onto_actors WHERE user_id=u;
  INSERT INTO public.onto_projects (id,name,type_key,created_by,state_key) VALUES (p,'Archive review','project.default',a,'active');
  INSERT INTO public.onto_project_members (project_id,actor_id,role_key,access) VALUES (p,a,'owner','admin') ON CONFLICT DO NOTHING;
  INSERT INTO public.onto_documents (id,project_id,title,type_key,state_key,created_by) VALUES
    (d,p,'Parent','document.default','draft',a), (c,p,'Public child','document.default','draft',a),
    (s,p,'Independent sibling','document.default','draft',a), (h,p,'Start Here','document.context.project','draft',a);
  tree := jsonb_build_object('version',1,'root',jsonb_build_array(
    jsonb_build_object('id',d,'children',jsonb_build_array(jsonb_build_object('id',c))),
    jsonb_build_object('id',s),jsonb_build_object('id',h)));
  UPDATE public.onto_projects SET doc_structure=tree WHERE id=p;
  PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);

  BEGIN
    PERFORM public.onto_document_archive_review_snapshot(p,d,NULL);
    RAISE EXCEPTION 'accepted missing child policy';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  BEGIN
    PERFORM public.onto_document_archive_review_snapshot(p,h,'archive_children');
    RAISE EXCEPTION 'accepted Start Here archive';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  UPDATE public.onto_documents SET type_key='document.context.project' WHERE id=c;
  BEGIN
    PERFORM public.onto_document_archive_review_snapshot(p,d,'archive_children');
    RAISE EXCEPTION 'accepted Start Here descendant archive';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  UPDATE public.onto_documents SET type_key='document.default' WHERE id=c;

  INSERT INTO public.onto_public_pages (project_id,document_id,slug,title,status,public_status,created_by,updated_by)
    VALUES (p,h,'archive-review-unrelated','Uncommissioned public document','published','live',a,a);
  snap := public.onto_document_archive_review_snapshot(p,d,'archive_children');
  ASSERT jsonb_array_length(snap->'archived_document_ids')=2;
  ASSERT jsonb_array_length(snap->'public_pages')=0, 'included an unrelated publication';
  UPDATE public.onto_documents SET title='Child edited after review' WHERE id=c;
  BEGIN
    PERFORM public.onto_document_archive_reviewed_atomic(p,d,ARRAY[d,c],(snap->>'target_updated_at')::timestamptz,
      1,jsonb_build_object('version',2,'root','[]'::jsonb),a,'[]','archive_children',snap);
    RAISE EXCEPTION 'accepted changed child after review';
  EXCEPTION WHEN serialization_failure THEN NULL; END;
  snap := public.onto_document_archive_review_snapshot(p,d,'archive_children');
  INSERT INTO public.onto_public_pages (project_id,document_id,slug,title,status,public_status,created_by,updated_by)
    VALUES (p,c,'archive-review-child','Public child','published','live',a,a);
  BEGIN
    PERFORM public.onto_document_archive_reviewed_atomic(p,d,ARRAY[d,c],(snap->>'target_updated_at')::timestamptz,
      1,jsonb_build_object('version',2,'root','[]'::jsonb),a,'[]','archive_children',snap);
    RAISE EXCEPTION 'accepted newly published child after preview';
  EXCEPTION WHEN serialization_failure THEN NULL; END;
  ASSERT (SELECT state_key='draft' FROM public.onto_documents WHERE id=d);
  ASSERT (SELECT doc_structure=tree FROM public.onto_projects WHERE id=p);

  snap := public.onto_document_archive_review_snapshot(p,d,'archive_children');
  ASSERT snap->'public_pages'->0->>'document_id'=c::text;
  ASSERT snap->'public_pages'->0->>'slug'='archive-review-child';
  UPDATE public.onto_public_pages SET slug='archive-review-child-new' WHERE document_id=c;
  BEGIN
    PERFORM public.onto_document_archive_reviewed_atomic(p,d,ARRAY[d,c],(snap->>'target_updated_at')::timestamptz,
      1,jsonb_build_object('version',2,'root','[]'::jsonb),a,'[]','archive_children',snap);
    RAISE EXCEPTION 'accepted changed public slug';
  EXCEPTION WHEN serialization_failure THEN NULL; END;

  -- Promotion has only the parent's public footprint and preserves the child.
  snap := public.onto_document_archive_review_snapshot(p,d,'promote_children');
  ASSERT jsonb_array_length(snap->'public_pages')=0;
  ASSERT snap->'archived_document_ids'=jsonb_build_array(d);
  ASSERT jsonb_array_length(snap->'documents')=2;
  sibling_snap := public.onto_document_archive_review_snapshot(p,s,'archive_children');
  out := public.onto_document_archive_reviewed_atomic(p,d,ARRAY[d],(snap->>'target_updated_at')::timestamptz,
    1,jsonb_build_object('version',2,'root',jsonb_build_array(jsonb_build_object('id',c),jsonb_build_object('id',s),jsonb_build_object('id',h))),
    a,'[]','promote_children',snap);
  ASSERT (SELECT state_key='archived' FROM public.onto_documents WHERE id=d);
  ASSERT (SELECT state_key='draft' FROM public.onto_documents WHERE id=c);
  ASSERT (SELECT status='published' FROM public.onto_public_pages WHERE document_id=c);
  -- An independent sibling can use the SAME reviewed facts after tree revision 2.
  out := public.onto_document_archive_reviewed_atomic(p,s,ARRAY[s],(sibling_snap->>'target_updated_at')::timestamptz,
    2,jsonb_build_object('version',3,'root',jsonb_build_array(jsonb_build_object('id',c),jsonb_build_object('id',h))),
    a,'[]','archive_children',sibling_snap);
  ASSERT (SELECT state_key='archived' FROM public.onto_documents WHERE id=s);

  -- Legitimately approved public archive preserves the separate publication.
  snap := public.onto_document_archive_review_snapshot(p,c,'archive_children');
  out := public.onto_document_archive_reviewed_atomic(p,c,ARRAY[c],(snap->>'target_updated_at')::timestamptz,
    3,jsonb_build_object('version',4,'root',jsonb_build_array(jsonb_build_object('id',h))),
    a,'[]','archive_children',snap);
  ASSERT (SELECT state_key='archived' FROM public.onto_documents WHERE id=c);
  ASSERT (SELECT status='published' FROM public.onto_public_pages WHERE document_id=c);
  ASSERT (SELECT doc_structure->>'version'='4' FROM public.onto_projects WHERE id=p);
  ASSERT (SELECT state_key='draft' FROM public.onto_documents WHERE id=h), 'archived unrelated document';
  ASSERT (SELECT status='published' FROM public.onto_public_pages WHERE document_id=h), 'changed unrelated publication';
  BEGIN
    PERFORM public.onto_document_archive_review_snapshot(p,c,'archive_children');
    RAISE EXCEPTION 'accepted already archived target';
  EXCEPTION WHEN no_data_found THEN NULL; END;
END;
$$;
