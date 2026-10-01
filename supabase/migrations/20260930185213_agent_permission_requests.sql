-- supabase/migrations/20260930185213_agent_permission_requests.sql
BEGIN;
SET LOCAL lock_timeout = '5s';
CREATE TABLE public.agent_permission_feature (
 id boolean PRIMARY KEY DEFAULT true CHECK(id), enabled boolean NOT NULL DEFAULT false,
 epoch bigint NOT NULL DEFAULT 1
);
INSERT INTO public.agent_permission_feature DEFAULT VALUES;
ALTER TABLE public.external_agent_callers ADD COLUMN permission_requests_enabled boolean NOT NULL DEFAULT true;
CREATE TABLE public.agent_permission_requests (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
 caller_id uuid NOT NULL REFERENCES public.external_agent_callers ON DELETE CASCADE,
 grant_id uuid REFERENCES public.agent_oauth_grants ON DELETE CASCADE,
 boundary text GENERATED ALWAYS AS (coalesce(grant_id::text,'key')) STORED,
 project_id uuid NOT NULL REFERENCES public.onto_projects ON DELETE CASCADE,
 target_id uuid NOT NULL, capability text NOT NULL CHECK(capability IN ('document.edit.v1','task.edit.v1')),
 epoch bigint NOT NULL, idempotency_key text NOT NULL CHECK(length(idempotency_key) BETWEEN 1 AND 200),
 submission jsonb, submission_fingerprint text NOT NULL, reviewed_digest text NOT NULL,
 before_snapshot jsonb, mutation jsonb, reason text CHECK(length(reason)<=2000),
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','applied','denied','expired','stale','canceled')),
 decision text CHECK(decision IN ('once','always','deny','scoped')), receipt jsonb,
 created_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL DEFAULT now()+interval '24 hours',
 decided_at timestamptz, UNIQUE(caller_id,boundary,idempotency_key)
);
CREATE INDEX agent_permission_requests_owner ON public.agent_permission_requests(user_id,caller_id,created_at DESC,id DESC);
CREATE INDEX agent_permission_requests_pending ON public.agent_permission_requests(caller_id,status,expires_at);
CREATE TABLE public.agent_permission_grants (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
 caller_id uuid NOT NULL REFERENCES public.external_agent_callers ON DELETE CASCADE,
 grant_id uuid REFERENCES public.agent_oauth_grants ON DELETE CASCADE,
 boundary text GENERATED ALWAYS AS (coalesce(grant_id::text,'key')) STORED,
 project_id uuid NOT NULL REFERENCES public.onto_projects ON DELETE CASCADE,
 capability text NOT NULL CHECK(capability IN ('document.edit.v1','task.edit.v1')), epoch bigint NOT NULL,
 source_request_id uuid REFERENCES public.agent_permission_requests ON DELETE SET NULL,
 created_at timestamptz NOT NULL DEFAULT now(), revoked_at timestamptz,
 UNIQUE(caller_id,boundary,project_id,capability,epoch)
);
CREATE TABLE public.agent_permission_keys (
 caller_id uuid NOT NULL REFERENCES public.external_agent_callers ON DELETE CASCADE,
 boundary text NOT NULL, key text NOT NULL, fingerprint text NOT NULL,
 request_id uuid NOT NULL REFERENCES public.agent_permission_requests ON DELETE CASCADE,
 PRIMARY KEY(caller_id,boundary,key)
);
ALTER TABLE public.agent_permission_keys ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.agent_permission_keys FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.agent_permission_keys TO service_role;
-- Durable internal work only; contains IDs, never outbound messages or model work.
CREATE TABLE public.agent_permission_work (
 request_id uuid PRIMARY KEY REFERENCES public.agent_permission_requests ON DELETE CASCADE,
 project_id uuid NOT NULL REFERENCES public.onto_projects ON DELETE CASCADE,
 target_id uuid NOT NULL, capability text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), processed_at timestamptz
);
ALTER TABLE public.agent_permission_feature ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_permission_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_permission_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_permission_work ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.agent_permission_feature,public.agent_permission_requests,public.agent_permission_grants,public.agent_permission_work FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.agent_permission_feature,public.agent_permission_requests,public.agent_permission_grants,public.agent_permission_work TO service_role;
GRANT SELECT ON public.agent_permission_requests,public.agent_permission_grants TO authenticated;
GRANT SELECT ON public.agent_permission_feature TO authenticated;
CREATE POLICY permission_feature_read ON public.agent_permission_feature FOR SELECT TO authenticated USING(true);
CREATE POLICY permission_owner_read ON public.agent_permission_requests FOR SELECT TO authenticated USING(user_id=auth.uid() AND public.current_actor_has_project_member_access(project_id,'read'));
CREATE POLICY permission_owner_read ON public.agent_permission_grants FOR SELECT TO authenticated USING(user_id=auth.uid());

-- Snapshot omits derived columns and includes every eligibility/identity field.
CREATE FUNCTION public.agent_edit_snapshot(p_kind text,p_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT CASE WHEN p_kind='document.edit.v1' THEN
 (SELECT to_jsonb(d)-ARRAY['search_vector','content_hash','outline','children','created_at'] FROM public.onto_documents d WHERE id=p_id)
 ELSE (SELECT to_jsonb(t)-ARRAY['search_vector','facet_scale','created_at'] FROM public.onto_tasks t WHERE id=p_id) END
$$;

-- Locks positive authority rows, so revocation and writes have a serial ordering.
CREATE FUNCTION public.lock_agent_permission_authority(p_caller uuid,p_grant uuid,p_project uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE c public.external_agent_callers%ROWTYPE; g public.agent_oauth_grants%ROWTYPE;
 p public.onto_projects%ROWTYPE; uid uuid; actor uuid; mode text; epoch_now bigint; explicit_read boolean;
BEGIN
 SELECT epoch INTO epoch_now FROM public.agent_permission_feature WHERE id AND enabled FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Permission requests are disabled'; END IF;
 SELECT user_id INTO uid FROM public.external_agent_callers WHERE id=p_caller;
 PERFORM 1 FROM public.users WHERE id=uid AND deletion_status IS NULL FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Connection unavailable'; END IF;
 SELECT * INTO p FROM public.onto_projects WHERE id=p_project AND deleted_at IS NULL AND archived_at IS NULL FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Project unavailable'; END IF;
 SELECT * INTO c FROM public.external_agent_callers WHERE id=p_caller FOR UPDATE;
 IF c.status IS DISTINCT FROM 'trusted' THEN RAISE EXCEPTION 'Connection unavailable'; END IF;
 mode:=c.project_scope_mode;
 IF p_grant IS NOT NULL THEN
  SELECT * INTO g FROM public.agent_oauth_grants WHERE id=p_grant FOR UPDATE;
  IF g.status IS DISTINCT FROM 'active' OR g.user_id<>uid OR g.external_agent_caller_id<>p_caller THEN RAISE EXCEPTION 'Connection unavailable'; END IF;
  mode:=g.project_scope_mode;
 END IF;
 SELECT id INTO actor FROM public.onto_actors WHERE user_id=uid AND kind='human';
 PERFORM 1 FROM public.onto_project_members WHERE project_id=p_project AND actor_id=actor
 AND removed_at IS NULL AND access IN ('write','admin') FOR SHARE;
 IF NOT FOUND AND p.created_by IS DISTINCT FROM actor THEN RAISE EXCEPTION 'Write membership required'; END IF;
 PERFORM 1 FROM public.external_agent_project_permissions WHERE external_agent_caller_id=p_caller
 AND agent_oauth_grant_id IS NOT DISTINCT FROM p_grant AND project_id=p_project AND revoked_at IS NULL FOR SHARE;
 explicit_read:=FOUND;
 IF NOT explicit_read AND NOT (mode='all_unrestricted' AND p.external_agent_access='standard' AND p.created_by=actor)
 THEN RAISE EXCEPTION 'Project is outside connector access'; END IF;
 RETURN actor;
END $$;

CREATE FUNCTION public.agent_permission_credential(p_ref jsonb,p_write boolean DEFAULT false) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE c public.external_agent_callers%ROWTYPE; t public.agent_oauth_access_tokens%ROWTYPE; g public.agent_oauth_grants%ROWTYPE;
BEGIN
 SELECT * INTO c FROM public.external_agent_callers WHERE id=(p_ref->>'caller_id')::uuid;
 IF c.status IS DISTINCT FROM 'trusted' OR NOT EXISTS(SELECT 1 FROM public.users WHERE id=c.user_id AND deletion_status IS NULL) THEN RAISE EXCEPTION 'Connection unavailable'; END IF;
 IF p_ref->>'kind'='key' THEN
  IF c.token_hash IS DISTINCT FROM p_ref->>'token_hash' THEN RAISE EXCEPTION 'Invalid credential'; END IF;
  RETURN jsonb_build_object('caller',c.id,'owner',c.user_id,'grant',NULL);
 ELSIF p_ref->>'kind'='oauth' THEN
  SELECT * INTO t FROM public.agent_oauth_access_tokens WHERE id=(p_ref->>'access_token_id')::uuid;
  SELECT * INTO g FROM public.agent_oauth_grants WHERE id=t.grant_id;
  IF t.id IS NULL OR t.revoked_at IS NOT NULL OR t.expires_at<=now() OR t.external_agent_caller_id<>c.id
  OR t.user_id<>c.user_id OR g.status IS DISTINCT FROM 'active' OR g.id::text IS DISTINCT FROM p_ref->>'grant_id'
  OR g.external_agent_caller_id<>c.id OR t.resource<>g.resource OR t.client_id<>g.client_id
  OR NOT 'buildos.read'=ANY(string_to_array(t.scope,' '))
  THEN RAISE EXCEPTION 'Invalid credential'; END IF;
  IF p_write AND NOT 'buildos.write'=ANY(string_to_array(t.scope,' ')) THEN RAISE EXCEPTION 'insufficient_scope'; END IF;
  RETURN jsonb_build_object('caller',c.id,'owner',c.user_id,'grant',g.id);
 END IF;
 RAISE EXCEPTION 'Invalid credential';
END $$;

CREATE FUNCTION public.create_agent_permission_request(p_ref jsonb,p_key text,p_submission jsonb,p_before jsonb,p_mutation jsonb,p_reason text DEFAULT NULL,p_direct boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE principal jsonb; r public.agent_permission_requests%ROWTYPE; gid uuid; cid uuid; uid uuid; actor uuid;
 cap text; target uuid; project uuid; fingerprint text; current_epoch bigint; actual jsonb; event_id uuid; delivery_id uuid; payload jsonb;
BEGIN
 -- Validation in the app is complemented by the mutation whitelist in apply_agent_permission_edit.
 principal:=public.agent_permission_credential(p_ref,false); cid:=(principal->>'caller')::uuid;gid:=(principal->>'grant')::uuid;uid:=(principal->>'owner')::uuid;
 fingerprint:=encode(sha256(convert_to(p_submission::text,'UTF8')),'hex');
 IF NOT p_direct THEN PERFORM pg_advisory_xact_lock(hashtextextended('agent-permission-quota:'||uid::text,0)); END IF;
 SELECT q.* INTO r FROM public.agent_permission_requests q JOIN public.agent_permission_keys k ON k.request_id=q.id WHERE k.caller_id=cid AND k.boundary=coalesce(gid::text,'key') AND k.key=p_key;
 IF FOUND THEN
  IF r.submission_fingerprint<>fingerprint THEN RAISE EXCEPTION 'Idempotency key conflicts with a different proposal'; END IF;
  RETURN to_jsonb(r);
 END IF;
 target:=(p_submission->>'target_id')::uuid; cap:=(p_submission->>'kind')||'.edit.v1'; project:=(p_before->>'project_id')::uuid;
 actor:=public.lock_agent_permission_authority(cid,gid,project);
 -- Credentials are rechecked after authority locks; no scope/state cache authorizes a mutation.
 IF p_ref->>'kind'='oauth' THEN PERFORM 1 FROM public.agent_oauth_access_tokens WHERE id=(p_ref->>'access_token_id')::uuid FOR SHARE; END IF;
 principal:=public.agent_permission_credential(p_ref,p_direct);
 SELECT epoch INTO current_epoch FROM public.agent_permission_feature WHERE id;
 SELECT q.* INTO r FROM public.agent_permission_requests q JOIN public.agent_permission_keys k ON k.request_id=q.id WHERE k.caller_id=cid AND k.boundary=coalesce(gid::text,'key') AND k.key=p_key;
 IF FOUND THEN
  IF r.submission_fingerprint<>fingerprint THEN RAISE EXCEPTION 'Idempotency key conflict'; END IF;
  RETURN to_jsonb(r);
 END IF;
 IF NOT p_direct AND NOT (SELECT permission_requests_enabled FROM public.external_agent_callers WHERE id=cid) THEN RAISE EXCEPTION 'Requests disabled for this connection'; END IF;
 actual:=public.agent_edit_snapshot(cap,target);
 IF actual IS NULL OR actual IS DISTINCT FROM p_before THEN RAISE EXCEPTION 'Target changed; propose again'; END IF;
 IF octet_length(p_submission::text)>262144 OR p_mutation='{}'::jsonb THEN RAISE EXCEPTION 'Invalid proposal'; END IF;
 IF NOT p_direct THEN
  IF (SELECT count(*) FROM public.agent_permission_requests WHERE caller_id=cid AND status='pending' AND expires_at>now())>=10
   OR (SELECT count(*) FROM public.agent_permission_requests WHERE caller_id=cid AND decision IS DISTINCT FROM 'scoped' AND created_at>now()-interval '1 hour')>=30
   OR (SELECT count(*) FROM public.agent_permission_requests WHERE user_id=uid AND decision IS DISTINCT FROM 'scoped' AND created_at>now()-interval '1 hour')>=100
  THEN RAISE EXCEPTION 'Request rate limit reached'; END IF;
  SELECT * INTO r FROM public.agent_permission_requests WHERE caller_id=cid AND boundary=coalesce(gid::text,'key')
   AND submission_fingerprint=fingerprint AND before_snapshot=p_before AND epoch=current_epoch AND status='pending' AND expires_at>now() LIMIT 1;
  IF FOUND THEN
   INSERT INTO public.agent_permission_keys VALUES(cid,coalesce(gid::text,'key'),p_key,fingerprint,r.id);
   RETURN to_jsonb(r);
  END IF;
  IF EXISTS(SELECT 1 FROM public.agent_permission_requests WHERE caller_id=cid AND submission_fingerprint=fingerprint
   AND status IN ('denied','canceled') AND decided_at>now()-interval '24 hours') THEN RAISE EXCEPTION 'Request cooldown is active'; END IF;
 END IF;
 INSERT INTO public.agent_permission_requests(user_id,caller_id,grant_id,project_id,target_id,capability,epoch,idempotency_key,submission,submission_fingerprint,reviewed_digest,before_snapshot,mutation,reason)
 VALUES(uid,cid,gid,project,target,cap,current_epoch,p_key,p_submission,fingerprint,
  encode(sha256(convert_to(jsonb_build_array(cid,gid,project,target,cap,current_epoch,p_before,p_mutation)::text,'UTF8')),'hex'),p_before,p_mutation,p_reason) RETURNING * INTO r;
 INSERT INTO public.agent_permission_keys VALUES(cid,coalesce(gid::text,'key'),p_key,fingerprint,r.id);
 IF NOT p_direct THEN
  payload:=jsonb_build_object('title','Your '||(SELECT caller_key FROM public.external_agent_callers WHERE id=cid)||' connection requests an edit','body','Review the proposed change in BuildOS.',
   'action_url','/profile/agent-keys/'||cid||'/requests/'||r.id,'event_type','agent.permission.requested','request_id',r.id);
  INSERT INTO public.notification_events(event_type,event_source,target_user_id,payload,metadata)
   VALUES('agent.permission.requested','api_action',uid,payload,jsonb_build_object('request_id',r.id)) RETURNING id INTO event_id;
  INSERT INTO public.notification_deliveries(event_id,recipient_user_id,channel,payload,status,attempts,max_attempts,sent_at,delivered_at)
   VALUES(event_id,uid,'in_app',payload,'delivered',1,1,now(),now()) RETURNING id INTO delivery_id;
  INSERT INTO public.user_notifications(event_id,delivery_id,user_id,type,title,message,priority,action_url,event_type,data,expires_at)
   VALUES(event_id,delivery_id,uid,'info',payload->>'title',payload->>'body','normal',payload->>'action_url','agent.permission.requested',jsonb_build_object('request_id',r.id),r.expires_at);
 END IF;
 RETURN to_jsonb(r);
END $$;

-- Internal primitive. The only entrypoints are the owner decision and scoped-write wrapper.
CREATE FUNCTION public.apply_agent_permission_edit(p_id uuid,p_digest text,p_decision text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r public.agent_permission_requests%ROWTYPE; actor uuid; live jsonb; after_snapshot jsonb;
 version_id uuid; version_number integer; grant_uuid uuid; allowed text[]; snapshot jsonb; current_epoch bigint; patch jsonb;
BEGIN
 SELECT * INTO r FROM public.agent_permission_requests WHERE id=p_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Request not found'; END IF;
 actor:=public.lock_agent_permission_authority(r.caller_id,r.grant_id,r.project_id);
 SELECT * INTO r FROM public.agent_permission_requests WHERE id=p_id FOR UPDATE;
 IF r.reviewed_digest IS DISTINCT FROM p_digest THEN RAISE EXCEPTION 'Reviewed change does not match'; END IF;
 IF r.status<>'pending' THEN
  IF r.decision IS NOT NULL AND r.decision<>p_decision THEN RAISE EXCEPTION 'Request already decided differently'; END IF;
  RETURN to_jsonb(r);
 END IF;
 SELECT epoch INTO current_epoch FROM public.agent_permission_feature WHERE id;
 IF r.epoch<>current_epoch THEN
  UPDATE public.agent_permission_requests SET status='canceled',decided_at=now() WHERE id=p_id RETURNING * INTO r; RETURN to_jsonb(r);
 END IF;
 IF r.expires_at<=now() THEN
  UPDATE public.agent_permission_requests SET status='expired',decided_at=now() WHERE id=p_id RETURNING * INTO r; RETURN to_jsonb(r);
 END IF;
 IF p_decision='deny' THEN
  UPDATE public.agent_permission_requests SET status='denied',decision='deny',decided_at=now() WHERE id=p_id RETURNING * INTO r; RETURN to_jsonb(r);
 END IF;
 IF p_decision IS NULL OR p_decision NOT IN ('once','always','scoped') THEN RAISE EXCEPTION 'Invalid decision'; END IF;
 IF r.capability='document.edit.v1' THEN
  PERFORM 1 FROM public.onto_documents WHERE id=r.target_id FOR UPDATE;
  allowed:=ARRAY['title','description','content'];
 ELSE
  PERFORM 1 FROM public.onto_tasks WHERE id=r.target_id FOR UPDATE;
  allowed:=ARRAY['title','description','state_key','priority'];
 END IF;
 live:=public.agent_edit_snapshot(r.capability,r.target_id);
 IF live IS NULL OR live IS DISTINCT FROM r.before_snapshot THEN
  UPDATE public.agent_permission_requests SET status='stale',decided_at=now() WHERE id=p_id RETURNING * INTO r; RETURN to_jsonb(r);
 END IF;
 IF live->>'deleted_at' IS NOT NULL OR live->>'archived_at' IS NOT NULL OR live->>'state_key'='archived'
 OR live->>'project_id'<>r.project_id::text OR (r.capability='document.edit.v1' AND live->>'type_key'='document.context.project') THEN RAISE EXCEPTION 'Target ineligible'; END IF;
 patch:=r.mutation;
 IF patch IS NULL OR patch='{}' OR EXISTS(SELECT 1 FROM jsonb_object_keys(patch) k WHERE NOT k=ANY(allowed)) THEN RAISE EXCEPTION 'Unsupported edit'; END IF;
 IF patch?'title' AND (jsonb_typeof(patch->'title')<>'string' OR length(trim(patch->>'title')) NOT BETWEEN 1 AND 500) THEN RAISE EXCEPTION 'Invalid title'; END IF;
 IF patch?'description' AND (jsonb_typeof(patch->'description') NOT IN ('string','null') OR length(patch->>'description')>10000) THEN RAISE EXCEPTION 'Invalid description'; END IF;
 IF r.capability='document.edit.v1' THEN
  IF patch?'content' AND (jsonb_typeof(patch->'content')<>'string' OR octet_length(patch->>'content')>204800) THEN RAISE EXCEPTION 'Invalid content'; END IF;
  UPDATE public.onto_documents SET title=CASE WHEN patch?'title' THEN patch->>'title' ELSE title END,
   description=CASE WHEN patch?'description' THEN patch->>'description' ELSE description END,
   content=CASE WHEN patch?'content' THEN patch->>'content' ELSE content END,
   props=CASE WHEN patch?'content' THEN jsonb_set(props,'{body_markdown}',patch->'content') ELSE props END
   WHERE id=r.target_id AND project_id=r.project_id;
  after_snapshot:=public.agent_edit_snapshot(r.capability,r.target_id);
  snapshot:=jsonb_build_object('title',after_snapshot->'title','content',after_snapshot->'content','description',after_snapshot->'description',
   'props',after_snapshot->'props','state_key',after_snapshot->'state_key','type_key',after_snapshot->'type_key','project_id',after_snapshot->'project_id');
  -- Serialize version number allocation with existing INSERTs via the unique index retry.
  LOOP
   SELECT coalesce(max(number),0)+1 INTO version_number FROM public.onto_document_versions WHERE document_id=r.target_id;
   BEGIN
    INSERT INTO public.onto_document_versions(document_id,number,storage_uri,created_by,props)
     VALUES(r.target_id,version_number,'inline://document-snapshot',actor,
      jsonb_build_object('snapshot',snapshot,'snapshot_hash',encode(sha256(convert_to(snapshot::text,'UTF8')),'hex'),
       'sealed',true,'permission_request_id',p_id,'change_count',1,'is_merged',false,'change_source','external_agent',
       'window',jsonb_build_object('started_at',now(),'ended_at',now()))) RETURNING id INTO version_id;
    EXIT;
   EXCEPTION WHEN unique_violation THEN NULL; END;
  END LOOP;
 ELSE
  IF patch?'state_key' AND coalesce(patch->>'state_key','') NOT IN ('todo','in_progress','blocked','done') THEN RAISE EXCEPTION 'Invalid task state'; END IF;
  IF patch?'priority' AND patch->'priority'<>'null' AND ((patch->>'priority')::numeric NOT BETWEEN 1 AND 5 OR (patch->>'priority')::numeric<>trunc((patch->>'priority')::numeric)) THEN RAISE EXCEPTION 'Invalid priority'; END IF;
  UPDATE public.onto_tasks SET title=CASE WHEN patch?'title' THEN patch->>'title' ELSE title END,
   description=CASE WHEN patch?'description' THEN patch->>'description' ELSE description END,
   priority=CASE WHEN patch?'priority' THEN (patch->>'priority')::integer ELSE priority END,
   completed_at=CASE WHEN patch?'state_key' AND patch->>'state_key'<>state_key::text THEN CASE WHEN patch->>'state_key'='done' THEN now() ELSE NULL END ELSE completed_at END,
   state_key=CASE WHEN patch?'state_key' THEN (patch->>'state_key')::public.task_state ELSE state_key END
   WHERE id=r.target_id AND project_id=r.project_id;
  after_snapshot:=public.agent_edit_snapshot(r.capability,r.target_id);
 END IF;
 IF p_decision='always' THEN
  INSERT INTO public.agent_permission_grants(user_id,caller_id,grant_id,project_id,capability,epoch,source_request_id)
   VALUES(r.user_id,r.caller_id,r.grant_id,r.project_id,r.capability,r.epoch,r.id)
   ON CONFLICT(caller_id,boundary,project_id,capability,epoch) DO UPDATE SET revoked_at=NULL,source_request_id=excluded.source_request_id
   RETURNING id INTO grant_uuid;
 END IF;
 INSERT INTO public.onto_project_logs(project_id,entity_type,entity_id,action,after_data,changed_by,changed_by_actor_id,change_source,external_agent_caller_id)
 VALUES(r.project_id,split_part(r.capability,'.',1),r.target_id,'updated',jsonb_build_object('permission_request_id',r.id),r.user_id,actor,'agent_call',r.caller_id);
 INSERT INTO public.agent_permission_work(request_id,project_id,target_id,capability) VALUES(r.id,r.project_id,r.target_id,r.capability);
 UPDATE public.agent_permission_requests SET status='applied',decision=p_decision,decided_at=now(),
  receipt=jsonb_build_object('request_id',r.id,'target_id',r.target_id,'project_id',r.project_id,'applied_at',now(),
   'version_id',version_id,'version_number',version_number,'grant_id',grant_uuid,
   'snapshot_hash',encode(sha256(convert_to(coalesce(snapshot,after_snapshot)::text,'UTF8')),'hex'))
  WHERE id=p_id RETURNING * INTO r;
 RETURN to_jsonb(r);
END $$;

CREATE FUNCTION public.decide_agent_permission_request(p_id uuid,p_digest text,p_decision text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF auth.uid() IS NULL OR p_decision IS NULL OR p_digest IS NULL OR p_decision NOT IN ('once','always','deny') OR NOT EXISTS(
  SELECT 1 FROM public.agent_permission_requests WHERE id=p_id AND user_id=auth.uid()) THEN RAISE EXCEPTION 'Request not found'; END IF;
 RETURN public.apply_agent_permission_edit(p_id,p_digest,p_decision);
END $$;

CREATE FUNCTION public.apply_scoped_agent_edit(p_ref jsonb,p_key text,p_submission jsonb,p_before jsonb,p_mutation jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE principal jsonb; cap text; result jsonb; cid uuid; gid uuid; epoch_now bigint;
BEGIN
 principal:=public.agent_permission_credential(p_ref,false); cid:=(principal->>'caller')::uuid;gid:=(principal->>'grant')::uuid;
 PERFORM public.lock_agent_permission_authority(cid,gid,(p_before->>'project_id')::uuid);
 IF p_ref->>'kind'='oauth' THEN PERFORM 1 FROM public.agent_oauth_access_tokens WHERE id=(p_ref->>'access_token_id')::uuid FOR SHARE; END IF;
 cap:=(p_submission->>'kind')||'.edit.v1';
 SELECT epoch INTO epoch_now FROM public.agent_permission_feature WHERE id;
 PERFORM 1 FROM public.agent_permission_grants WHERE caller_id=cid AND grant_id IS NOT DISTINCT FROM gid
  AND project_id=(p_before->>'project_id')::uuid AND capability=cap AND epoch=epoch_now AND revoked_at IS NULL FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Scoped permission required'; END IF;
 PERFORM public.agent_permission_credential(p_ref,true);
 result:=public.create_agent_permission_request(p_ref,p_key,p_submission,p_before,p_mutation,NULL,true);
 RETURN public.apply_agent_permission_edit((result->>'id')::uuid,result->>'reviewed_digest','scoped');
END $$;

CREATE FUNCTION public.guard_sealed_agent_checkpoint() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF OLD.props->>'sealed'='true' AND (NEW.props IS DISTINCT FROM OLD.props OR NEW.document_id<>OLD.document_id OR NEW.number<>OLD.number OR NEW.storage_uri<>OLD.storage_uri)
 THEN RAISE EXCEPTION 'Sealed document checkpoint cannot be modified' USING ERRCODE='55000'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER guard_sealed_agent_checkpoint BEFORE UPDATE ON public.onto_document_versions FOR EACH ROW EXECUTE FUNCTION public.guard_sealed_agent_checkpoint();

-- Epoch invalidation is immediate; re-enabling cannot revive old approvals.
CREATE FUNCTION public.set_agent_permission_feature(p_enabled boolean) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
 UPDATE public.agent_permission_feature SET enabled=p_enabled,epoch=epoch+CASE WHEN p_enabled THEN 0 ELSE 1 END WHERE id
$$;
CREATE FUNCTION public.purge_agent_permission_payloads(p_batch_size integer DEFAULT 500) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE n bigint;
BEGIN
 UPDATE public.agent_permission_requests SET status='canceled',decided_at=now() WHERE id IN(SELECT r.id FROM public.agent_permission_requests r CROSS JOIN public.agent_permission_feature f WHERE r.status='pending' AND (NOT f.enabled OR r.epoch<>f.epoch) ORDER BY r.created_at LIMIT greatest(1,least(p_batch_size,1000)) FOR UPDATE OF r SKIP LOCKED);
 UPDATE public.agent_permission_requests SET status='expired',decided_at=now() WHERE id IN(SELECT id FROM public.agent_permission_requests WHERE status='pending' AND expires_at<=now() ORDER BY expires_at LIMIT greatest(1,least(p_batch_size,1000)) FOR UPDATE SKIP LOCKED);
 UPDATE public.agent_permission_requests SET submission=NULL,before_snapshot=NULL,mutation=NULL,reason=NULL
 WHERE id IN(SELECT id FROM public.agent_permission_requests WHERE status<>'pending' AND decided_at<now()-interval '30 days' AND submission IS NOT NULL ORDER BY decided_at LIMIT greatest(1,least(p_batch_size,1000)) FOR UPDATE SKIP LOCKED);
 GET DIAGNOSTICS n=ROW_COUNT; RETURN n;
END $$;

-- Add the event without dropping other teams' additions to the canonical constraint.
DO $$ DECLARE expression text; BEGIN
 SELECT pg_get_expr(conbin,conrelid) INTO expression FROM pg_constraint WHERE conrelid='public.notification_events'::regclass AND conname='notification_events_event_type_check';
 ALTER TABLE public.notification_events DROP CONSTRAINT notification_events_event_type_check;
 EXECUTE 'ALTER TABLE public.notification_events ADD CONSTRAINT notification_events_event_type_check CHECK (('||expression||') OR event_type=''agent.permission.requested'') NOT VALID';
END $$;
ALTER TABLE public.notification_events VALIDATE CONSTRAINT notification_events_event_type_check;

DO $$ DECLARE f record; BEGIN
 FOR f IN SELECT oid::regprocedure AS signature FROM pg_proc WHERE pronamespace='public'::regnamespace
 AND proname IN ('agent_edit_snapshot','lock_agent_permission_authority','agent_permission_credential','create_agent_permission_request',
 'apply_agent_permission_edit','decide_agent_permission_request','apply_scoped_agent_edit','guard_sealed_agent_checkpoint','set_agent_permission_feature','purge_agent_permission_payloads')
 LOOP
  EXECUTE 'REVOKE ALL ON FUNCTION '||f.signature||' FROM PUBLIC,anon,authenticated';
  EXECUTE 'GRANT EXECUTE ON FUNCTION '||f.signature||' TO service_role';
 END LOOP;
END $$;
GRANT EXECUTE ON FUNCTION public.decide_agent_permission_request(uuid,text,text) TO authenticated;
-- Invoker trigger required on ordinary signed-in version writes. It has no data access.
GRANT EXECUTE ON FUNCTION public.guard_sealed_agent_checkpoint() TO authenticated;
CREATE FUNCTION public.lookup_agent_permission_request(p_ref jsonb,p_key text,p_submission jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE who jsonb; r public.agent_permission_requests%ROWTYPE;
BEGIN
 who:=public.agent_permission_credential(p_ref,false);
 SELECT q.* INTO r FROM public.agent_permission_requests q JOIN public.agent_permission_keys k ON k.request_id=q.id
 WHERE k.caller_id=(who->>'caller')::uuid AND k.boundary=coalesce(who->>'grant','key') AND k.key=p_key;
 IF NOT FOUND THEN RETURN NULL; END IF;
 IF r.submission_fingerprint<>encode(sha256(convert_to(p_submission::text,'UTF8')),'hex') THEN RAISE EXCEPTION 'Idempotency key conflict'; END IF;
 RETURN to_jsonb(r);
END $$;
REVOKE ALL ON FUNCTION public.lookup_agent_permission_request(jsonb,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.lookup_agent_permission_request(jsonb,text,jsonb) TO service_role;

CREATE FUNCTION public.control_agent_permissions(p_caller uuid,p_action text,p_grant uuid DEFAULT NULL) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE owner_id uuid; rule public.agent_permission_grants%ROWTYPE;
BEGIN
 SELECT user_id INTO owner_id FROM public.external_agent_callers WHERE id=p_caller;
 IF auth.uid() IS NULL OR owner_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Connection not found'; END IF;
 PERFORM 1 FROM public.users WHERE id=owner_id AND deletion_status IS NULL FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Account unavailable'; END IF;
 IF p_action='revoke_rule' THEN
  SELECT * INTO rule FROM public.agent_permission_grants WHERE id=p_grant AND caller_id=p_caller;
  IF NOT FOUND THEN RAISE EXCEPTION 'Rule not found'; END IF;
  PERFORM 1 FROM public.onto_projects WHERE id=rule.project_id FOR UPDATE;
 END IF;
 PERFORM 1 FROM public.external_agent_callers WHERE id=p_caller FOR UPDATE;
 IF p_action IN ('disable_requests','enable_requests') THEN
  UPDATE public.external_agent_callers SET permission_requests_enabled=(p_action='enable_requests') WHERE id=p_caller;
 ELSIF p_action='revoke_rule' THEN
  UPDATE public.agent_permission_grants SET revoked_at=now() WHERE id=p_grant;
  UPDATE public.agent_permission_requests SET status='canceled',decided_at=now() WHERE caller_id=p_caller AND grant_id IS NOT DISTINCT FROM rule.grant_id
   AND project_id=rule.project_id AND capability=rule.capability AND status='pending';
 ELSIF p_action='read_only' THEN
  UPDATE public.external_agent_callers SET policy=jsonb_set(policy,'{scope_mode}','"read_only"') WHERE id=p_caller;
  UPDATE public.agent_oauth_grants SET scope_mode='read_only',scope='buildos.read offline_access' WHERE external_agent_caller_id=p_caller;
  UPDATE public.agent_permission_grants SET revoked_at=now() WHERE caller_id=p_caller AND revoked_at IS NULL;
  UPDATE public.agent_permission_requests SET status='canceled',decided_at=now() WHERE caller_id=p_caller AND status='pending';
 ELSE RAISE EXCEPTION 'Invalid control'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.control_agent_permissions(uuid,text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.control_agent_permissions(uuid,text,uuid) TO authenticated,service_role;

-- Existing settings/revocation writers must invalidate scoped authority as well.
CREATE FUNCTION public.invalidate_agent_permissions() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE cid uuid; gid uuid; pid uuid; uid uuid; revoke_rules boolean:=true;
BEGIN
 IF TG_TABLE_NAME='external_agent_callers' THEN
  cid:=NEW.id;
  IF NEW.status='trusted' AND NEW.token_hash=OLD.token_hash AND NEW.policy IS NOT DISTINCT FROM OLD.policy
   AND NEW.project_scope_mode=OLD.project_scope_mode AND (NEW.permission_requests_enabled OR NOT OLD.permission_requests_enabled) THEN RETURN NEW; END IF;
  -- A request toggle only cancels pending requests, preserving ongoing and base access.
  revoke_rules:=NOT (NOT NEW.permission_requests_enabled AND OLD.permission_requests_enabled AND NEW.status=OLD.status AND NEW.policy=OLD.policy AND NEW.project_scope_mode=OLD.project_scope_mode AND NEW.token_hash=OLD.token_hash);
 ELSIF TG_TABLE_NAME='agent_oauth_grants' THEN
  cid:=NEW.external_agent_caller_id;gid:=NEW.id;
  IF NEW.status=OLD.status AND NOT (OLD.scope_mode='read_write' AND NEW.scope_mode='read_only')
   AND NEW.project_scope_mode=OLD.project_scope_mode AND NEW.allowed_project_ids IS NOT DISTINCT FROM OLD.allowed_project_ids THEN RETURN NEW; END IF;
 ELSIF TG_TABLE_NAME='external_agent_project_permissions' THEN
  IF TG_OP='UPDATE' AND NEW.revoked_at IS NOT DISTINCT FROM OLD.revoked_at AND NEW.access_mode=OLD.access_mode THEN RETURN NEW; END IF;
  cid:=OLD.external_agent_caller_id;gid:=OLD.agent_oauth_grant_id;pid:=OLD.project_id;
 ELSIF TG_TABLE_NAME='onto_project_members' THEN
  IF TG_OP='UPDATE' AND NEW.removed_at IS NOT DISTINCT FROM OLD.removed_at AND NEW.access=OLD.access THEN RETURN NEW; END IF;
  pid:=OLD.project_id; SELECT user_id INTO uid FROM public.onto_actors WHERE id=OLD.actor_id;
 ELSIF TG_TABLE_NAME='onto_projects' THEN
  IF NEW.external_agent_access=OLD.external_agent_access AND NEW.deleted_at IS NOT DISTINCT FROM OLD.deleted_at AND NEW.archived_at IS NOT DISTINCT FROM OLD.archived_at THEN RETURN NEW; END IF;
  pid:=OLD.id;
 ELSE RETURN NEW; END IF;
 UPDATE public.agent_permission_requests SET status='canceled',decided_at=now()
  WHERE status='pending' AND (cid IS NULL OR caller_id=cid) AND (gid IS NULL OR grant_id=gid)
   AND (pid IS NULL OR project_id=pid) AND (uid IS NULL OR user_id=uid);
 IF revoke_rules THEN
  UPDATE public.agent_permission_grants SET revoked_at=now() WHERE revoked_at IS NULL
   AND (cid IS NULL OR caller_id=cid) AND (gid IS NULL OR grant_id=gid) AND (pid IS NULL OR project_id=pid) AND (uid IS NULL OR user_id=uid);
 END IF;
 RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $$;
REVOKE ALL ON FUNCTION public.invalidate_agent_permissions() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.invalidate_agent_permissions() TO service_role;
CREATE TRIGGER invalidate_agent_permissions AFTER UPDATE ON public.external_agent_callers FOR EACH ROW EXECUTE FUNCTION public.invalidate_agent_permissions();
CREATE TRIGGER invalidate_agent_permissions AFTER UPDATE ON public.agent_oauth_grants FOR EACH ROW EXECUTE FUNCTION public.invalidate_agent_permissions();
CREATE TRIGGER invalidate_agent_permissions AFTER UPDATE OR DELETE ON public.external_agent_project_permissions FOR EACH ROW EXECUTE FUNCTION public.invalidate_agent_permissions();
CREATE TRIGGER invalidate_agent_permissions AFTER UPDATE OR DELETE ON public.onto_project_members FOR EACH ROW EXECUTE FUNCTION public.invalidate_agent_permissions();
CREATE TRIGGER invalidate_agent_permissions AFTER UPDATE ON public.onto_projects FOR EACH ROW EXECUTE FUNCTION public.invalidate_agent_permissions();

-- Re-consent can add the credential scope needed by existing scoped rules without
-- rewriting the connection's legacy base policy or project permissions.
CREATE FUNCTION public.reauthorize_agent_scoped_writes(p_owner uuid,p_grant uuid,p_expected jsonb,p_code jsonb) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE g public.agent_oauth_grants%ROWTYPE; c public.external_agent_callers%ROWTYPE; e bigint; expected jsonb;
BEGIN
 SELECT epoch INTO e FROM public.agent_permission_feature WHERE id AND enabled FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Feature disabled'; END IF;
 PERFORM 1 FROM public.users WHERE id=p_owner AND deletion_status IS NULL FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Account unavailable'; END IF;
 SELECT * INTO g FROM public.agent_oauth_grants WHERE id=p_grant;
 SELECT * INTO c FROM public.external_agent_callers WHERE id=g.external_agent_caller_id FOR UPDATE;
 SELECT * INTO g FROM public.agent_oauth_grants WHERE id=p_grant FOR UPDATE;
 IF c.status IS DISTINCT FROM 'trusted' OR g.status IS DISTINCT FROM 'active' OR g.user_id<>p_owner OR c.user_id<>p_owner
 OR g.client_id IS DISTINCT FROM p_code->>'client_id' OR g.resource IS DISTINCT FROM p_code->>'resource' THEN RAISE EXCEPTION 'Connection unavailable'; END IF;
 SELECT jsonb_build_object('scope_mode',g.scope_mode,'allowed_ops',g.allowed_ops,'allowed_project_ids',g.allowed_project_ids,
  'project_scope_mode',g.project_scope_mode,'rules',coalesce(jsonb_agg(jsonb_build_object('id',r.id,'project_id',r.project_id,'capability',r.capability) ORDER BY r.id),'[]'))
 INTO expected FROM public.agent_permission_grants r WHERE r.grant_id=g.id AND r.caller_id=c.id AND r.revoked_at IS NULL AND r.epoch=e;
 IF expected IS DISTINCT FROM p_expected OR expected->'rules'='[]' THEN RAISE EXCEPTION 'Consent changed; reload the page'; END IF;
 IF NOT 'buildos.write'=ANY(string_to_array(p_code->>'scope',' ')) THEN RAISE EXCEPTION 'Client must request buildos.write'; END IF;
 UPDATE public.agent_oauth_grants SET scope=p_code->>'scope' WHERE id=g.id;
 INSERT INTO public.agent_oauth_authorization_codes(code_hash,client_id,user_id,grant_id,external_agent_caller_id,redirect_uri,resource,scope,code_challenge,expires_at,policy_snapshot)
 VALUES(p_code->>'code_hash',g.client_id,p_owner,g.id,c.id,p_code->>'redirect_uri',g.resource,p_code->>'scope',p_code->>'code_challenge',now()+interval '5 minutes',jsonb_build_object('scope_mode',g.scope_mode,'allowed_ops',g.allowed_ops,'allowed_project_ids',g.allowed_project_ids,'project_scope_mode',g.project_scope_mode,'epoch',e));
END $$;
REVOKE ALL ON FUNCTION public.reauthorize_agent_scoped_writes(uuid,uuid,jsonb,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reauthorize_agent_scoped_writes(uuid,uuid,jsonb,jsonb) TO service_role;

-- Scoped-edit activity remains visible locally without producing collaborator messages.
DO $$ DECLARE definition text; n integer; BEGIN
 SELECT pg_get_functiondef('public.trg_queue_project_activity_batch()'::regprocedure) INTO definition;
 n:=position('BEGIN' IN definition);
 definition:=left(definition,n+4)||$guard$
 IF NEW.change_source='agent_call' AND EXISTS(SELECT 1 FROM public.agent_permission_requests r
  WHERE r.id::text=NEW.after_data->>'permission_request_id' AND r.project_id=NEW.project_id
   AND r.target_id=NEW.entity_id AND r.caller_id=NEW.external_agent_caller_id) THEN RETURN NEW; END IF;
$guard$||substring(definition FROM n+5);
 EXECUTE definition;
END $$;

CREATE FUNCTION public.agent_permission_tree_metadata(p_nodes jsonb,p_id uuid,p_title text,p_description text) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT coalesce(jsonb_agg(
  (CASE WHEN node->>'id'=p_id::text THEN node||jsonb_build_object('title',p_title,'description',p_description) ELSE node END)
  ||CASE WHEN jsonb_typeof(node->'children')='array' THEN jsonb_build_object('children',public.agent_permission_tree_metadata(node->'children',p_id,p_title,p_description)) ELSE '{}'::jsonb END ORDER BY ord),'[]')
 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p_nodes)='array' THEN p_nodes ELSE '[]'::jsonb END) WITH ORDINALITY AS x(node,ord)
$$;
CREATE FUNCTION public.maintain_agent_permission_work(p_batch_size integer DEFAULT 50,p_request uuid DEFAULT NULL) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE work record; doc public.onto_documents%ROWTYPE; n integer:=0; tree jsonb;
BEGIN
 FOR work IN SELECT * FROM public.agent_permission_work WHERE processed_at IS NULL AND (p_request IS NULL OR request_id=p_request)
  ORDER BY project_id,request_id LIMIT greatest(1,least(p_batch_size,100)) LOOP
  PERFORM 1 FROM public.onto_projects WHERE id=work.project_id FOR UPDATE;
  PERFORM 1 FROM public.agent_permission_work WHERE request_id=work.request_id AND processed_at IS NULL FOR UPDATE SKIP LOCKED;
  IF NOT FOUND THEN CONTINUE; END IF;
  IF work.capability='document.edit.v1' THEN
   SELECT * INTO doc FROM public.onto_documents WHERE id=work.target_id AND project_id=work.project_id AND deleted_at IS NULL FOR UPDATE;
   IF FOUND THEN
    SELECT doc_structure INTO tree FROM public.onto_projects WHERE id=work.project_id;
    UPDATE public.onto_projects SET doc_structure=jsonb_set(tree,'{root}',public.agent_permission_tree_metadata(tree->'root',doc.id,doc.title,doc.description)) WHERE id=work.project_id;
    -- Readers recompute a missing outline from the live body; never leave a stale cache.
    UPDATE public.onto_documents SET outline=NULL WHERE id=doc.id AND outline IS NOT NULL;
   END IF;
  END IF;
  UPDATE public.agent_permission_work SET processed_at=now() WHERE request_id=work.request_id;
  n:=n+1;
 END LOOP;
 RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.agent_permission_tree_metadata(jsonb,uuid,text,text),public.maintain_agent_permission_work(integer,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.agent_permission_tree_metadata(jsonb,uuid,text,text),public.maintain_agent_permission_work(integer,uuid) TO service_role;

-- Membership changes use the same project-first order as scoped writes and moves.
CREATE FUNCTION public.update_project_membership_guarded(p_project uuid,p_member uuid,p_action text,p_role text DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid; member public.onto_project_members%ROWTYPE; owner_actor uuid;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
 SELECT id INTO actor FROM public.onto_actors WHERE user_id=auth.uid() AND kind='human';
 SELECT created_by INTO owner_actor FROM public.onto_projects WHERE id=p_project AND deleted_at IS NULL FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Project unavailable'; END IF;
 SELECT * INTO member FROM public.onto_project_members WHERE id=p_member AND project_id=p_project AND removed_at IS NULL FOR UPDATE;
 IF NOT FOUND THEN RETURN NULL; END IF;
 IF member.role_key='owner' OR member.actor_id=owner_actor THEN RAISE EXCEPTION 'Owner membership cannot be changed'; END IF;
 IF p_action='leave' THEN
  IF member.actor_id IS DISTINCT FROM actor THEN RAISE EXCEPTION 'Membership unavailable'; END IF;
 ELSIF NOT public.current_actor_has_project_member_access(p_project,'admin') THEN RAISE EXCEPTION 'Admin access required'; END IF;
 IF p_action IN ('leave','remove') THEN
  UPDATE public.onto_project_members SET removed_at=now(),removed_by_actor_id=actor WHERE id=p_member RETURNING * INTO member;
 ELSIF p_action='role' AND p_role IN ('editor','viewer') THEN
  UPDATE public.onto_project_members SET role_key=p_role,access=CASE WHEN p_role='editor' THEN 'write' ELSE 'read' END WHERE id=p_member RETURNING * INTO member;
 ELSE RAISE EXCEPTION 'Invalid membership action'; END IF;
 RETURN to_jsonb(member);
END $$;
REVOKE ALL ON FUNCTION public.update_project_membership_guarded(uuid,uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.update_project_membership_guarded(uuid,uuid,text,text) TO authenticated,service_role;
COMMIT;
