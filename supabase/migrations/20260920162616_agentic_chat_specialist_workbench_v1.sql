-- supabase/migrations/20260920162616_agentic_chat_specialist_workbench_v1.sql
-- Private authoring catalog. Publication does not authorize workflow execution.
-- Uses canonical JSON/hash and service-role assertion helpers from workflow v1.
CREATE TABLE public.agentic_chat_specialist_drafts (
 id uuid PRIMARY KEY,
 user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
 revision integer NOT NULL CHECK (revision > 0),
 draft jsonb NOT NULL CHECK (COALESCE(jsonb_typeof(draft) = 'object' AND draft->>'schemaVersion' = 'specialist_workbench_draft_v1', false)),
 draft_hash text NOT NULL CHECK (draft_hash = public.agentic_chat_sha256_hex_v1(public.agentic_chat_canonical_json_v1(draft))),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE (id, user_id),
 CHECK (octet_length(public.agentic_chat_canonical_json_v1(draft)) <= 120000)
);
CREATE INDEX idx_specialist_drafts_owner ON public.agentic_chat_specialist_drafts(user_id, updated_at DESC);
CREATE TABLE public.agentic_chat_specialist_versions (
 draft_id uuid NOT NULL,
 user_id uuid NOT NULL,
 version integer NOT NULL CHECK (version > 0),
 draft_revision integer NOT NULL CHECK (draft_revision > 0),
 snapshot jsonb NOT NULL,
 name text GENERATED ALWAYS AS (snapshot#>>'{definition,label}') STORED NOT NULL,
 snapshot_hash text NOT NULL CHECK (snapshot_hash = public.agentic_chat_sha256_hex_v1(public.agentic_chat_canonical_json_v1(snapshot))),
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY (draft_id, version),
 UNIQUE (draft_id, draft_revision),
 FOREIGN KEY (draft_id, user_id) REFERENCES public.agentic_chat_specialist_drafts(id, user_id) ON DELETE CASCADE,
 CHECK (COALESCE(snapshot->>'schemaVersion' = 'specialist_workbench_version_v1'
   AND snapshot->>'activation' = 'catalog_only'
   AND snapshot->>'profile' = 'document_evidence_v1'
   AND snapshot->>'draftId' = draft_id::text
   AND snapshot->>'draftRevision' = draft_revision::text
   AND snapshot#>>'{definition,version}' = version::text, false)),
 CHECK (octet_length(public.agentic_chat_canonical_json_v1(snapshot)) <= 90000)
);
CREATE INDEX idx_specialist_versions_owner ON public.agentic_chat_specialist_versions(user_id, created_at DESC);
ALTER TABLE public.agentic_chat_specialist_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agentic_chat_specialist_versions ENABLE ROW LEVEL SECURITY;
-- Supabase grants ALL to service_role by default; clear it before granting the exact operations.
REVOKE ALL ON public.agentic_chat_specialist_drafts, public.agentic_chat_specialist_versions FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE ON public.agentic_chat_specialist_drafts TO service_role;
GRANT SELECT, INSERT ON public.agentic_chat_specialist_versions TO service_role;

CREATE FUNCTION public.guard_specialist_workbench_version_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, public AS $$
BEGIN
 IF TG_OP = 'UPDATE' THEN RAISE EXCEPTION 'specialist_version_immutable'; END IF;
 IF NOT EXISTS (SELECT 1 FROM public.agentic_chat_specialist_drafts d WHERE d.id = NEW.draft_id
   AND d.user_id = NEW.user_id AND d.revision = NEW.draft_revision AND d.draft_hash = NEW.snapshot->>'draftHash') THEN
   RAISE EXCEPTION 'specialist_version_draft_mismatch';
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER guard_specialist_workbench_version_v1 BEFORE INSERT OR UPDATE
 ON public.agentic_chat_specialist_versions FOR EACH ROW EXECUTE FUNCTION public.guard_specialist_workbench_version_v1();

CREATE FUNCTION public.save_specialist_workbench_draft_v1(
 p_user_id uuid, p_id uuid, p_expected_revision integer, p_draft jsonb, p_draft_hash text
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, public AS $$
DECLARE v_draft public.agentic_chat_specialist_drafts%ROWTYPE;
BEGIN
 PERFORM public.agentic_chat_workflow_assert_service_role_v1('specialist_draft');
 IF p_user_id IS NULL OR p_id IS NULL OR p_expected_revision IS NULL OR p_expected_revision < 0
 OR p_draft_hash IS DISTINCT FROM public.agentic_chat_sha256_hex_v1(public.agentic_chat_canonical_json_v1(p_draft)) THEN
  RAISE EXCEPTION 'specialist_draft_invalid';
 END IF;
 -- Serializes initial saves too, so a double click/retry cannot create duplicate drafts.
 PERFORM pg_advisory_xact_lock(hashtextextended('specialist-workbench:' || p_user_id::text, 0));
 SELECT * INTO v_draft FROM public.agentic_chat_specialist_drafts WHERE id = p_id AND user_id = p_user_id FOR UPDATE;
 IF NOT FOUND THEN
  IF p_expected_revision <> 0 THEN RETURN jsonb_build_object('outcome', 'not_found'); END IF;
  IF (SELECT count(*) FROM public.agentic_chat_specialist_drafts WHERE user_id = p_user_id) >= 20 THEN
   RETURN jsonb_build_object('outcome', 'limit_reached');
  END IF;
  INSERT INTO public.agentic_chat_specialist_drafts(id,user_id,revision,draft,draft_hash)
   VALUES (p_id,p_user_id,1,p_draft,p_draft_hash) ON CONFLICT (id) DO NOTHING RETURNING * INTO v_draft;
  IF NOT FOUND THEN RETURN jsonb_build_object('outcome', 'not_found'); END IF;
 ELSE
  -- Idempotent retry is permitted only for this exact saved content and prior/current revision.
  IF v_draft.draft_hash = p_draft_hash AND p_expected_revision IN (v_draft.revision, v_draft.revision - 1) THEN
   RETURN jsonb_build_object('outcome', 'saved', 'draft', to_jsonb(v_draft));
  END IF;
  IF p_expected_revision <> v_draft.revision THEN RETURN jsonb_build_object('outcome', 'conflict'); END IF;
  UPDATE public.agentic_chat_specialist_drafts SET revision = revision + 1, draft = p_draft,
   draft_hash = p_draft_hash, updated_at = clock_timestamp() WHERE id = p_id AND user_id = p_user_id RETURNING * INTO v_draft;
 END IF;
 RETURN jsonb_build_object('outcome', 'saved', 'draft', to_jsonb(v_draft));
END;
$$;

CREATE FUNCTION public.publish_specialist_workbench_version_v1(
 p_user_id uuid, p_id uuid, p_expected_revision integer, p_snapshot jsonb, p_snapshot_hash text
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, public AS $$
DECLARE
 v_draft public.agentic_chat_specialist_drafts%ROWTYPE;
 v_version public.agentic_chat_specialist_versions%ROWTYPE;
 v_next integer;
BEGIN
 PERFORM public.agentic_chat_workflow_assert_service_role_v1('specialist_publish');
 SELECT * INTO v_draft FROM public.agentic_chat_specialist_drafts WHERE id = p_id AND user_id = p_user_id FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('outcome', 'not_found'); END IF;
 IF p_expected_revision IS DISTINCT FROM v_draft.revision THEN RETURN jsonb_build_object('outcome', 'conflict'); END IF;
 SELECT * INTO v_version FROM public.agentic_chat_specialist_versions WHERE draft_id = p_id AND draft_revision = p_expected_revision;
 IF FOUND THEN RETURN jsonb_build_object('outcome', 'published', 'version', to_jsonb(v_version)); END IF;
 SELECT COALESCE(max(version), 0) + 1 INTO v_next FROM public.agentic_chat_specialist_versions WHERE draft_id = p_id;
 IF v_next > 50 THEN RETURN jsonb_build_object('outcome', 'limit_reached'); END IF;
 IF p_snapshot IS NULL OR p_snapshot_hash IS NULL
 OR p_snapshot_hash IS DISTINCT FROM public.agentic_chat_sha256_hex_v1(public.agentic_chat_canonical_json_v1(p_snapshot))
 OR p_snapshot->>'draftHash' IS DISTINCT FROM v_draft.draft_hash
 OR p_snapshot->>'draftRevision' IS DISTINCT FROM v_draft.revision::text
 OR p_snapshot#>>'{definition,version}' IS DISTINCT FROM v_next::text THEN
  RAISE EXCEPTION 'specialist_version_invalid';
 END IF;
 INSERT INTO public.agentic_chat_specialist_versions(draft_id,user_id,version,draft_revision,snapshot,snapshot_hash)
  VALUES (p_id,p_user_id,v_next,p_expected_revision,p_snapshot,p_snapshot_hash) RETURNING * INTO v_version;
 RETURN jsonb_build_object('outcome', 'published', 'version', to_jsonb(v_version));
END;
$$;
REVOKE ALL ON FUNCTION public.guard_specialist_workbench_version_v1(),
 public.save_specialist_workbench_draft_v1(uuid,uuid,integer,jsonb,text),
 public.publish_specialist_workbench_version_v1(uuid,uuid,integer,jsonb,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.guard_specialist_workbench_version_v1(),
 public.save_specialist_workbench_draft_v1(uuid,uuid,integer,jsonb,text),
 public.publish_specialist_workbench_version_v1(uuid,uuid,integer,jsonb,text) TO service_role;
