[
  {
    "args": "p_token_hash text, p_actor_id uuid, p_user_email text",
    "name": "accept_project_invite",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.accept_project_invite(p_token_hash text, p_actor_id uuid, p_user_email text)\n RETURNS TABLE(project_id uuid, role_key text, access text)\n LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO 'public'\nAS $function$\nDECLARE\n  v_invite onto_project_invites%ROWTYPE;\n  v_auth_user_id uuid;\n  v_actor_id uuid;\n  v_user_email text;\nBEGIN\n  IF p_token_hash IS NULL OR length(trim(p_token_hash)) = 0 THEN\n    RAISE EXCEPTION 'Invite token missing';\n  END IF;\n\n  v_auth_user_id := auth.uid();\n  IF v_auth_user_id IS NULL THEN\n    RAISE EXCEPTION 'Authentication required';\n  END IF;\n\n  v_actor_id := ensure_actor_for_user(v_auth_user_id);\n\n  SELECT email INTO v_user_email\n  FROM public.users\n  WHERE id = v_auth_user_id;\n\n  IF v_user_email IS NULL THEN\n    SELECT email INTO v_user_email\n    FROM onto_actors\n    WHERE id = v_actor_id;\n  END IF;\n\n  IF v_user_email IS NULL OR length(trim(v_user_email)) = 0 THEN\n    RAISE EXCEPTION 'User email missing';\n  END IF;\n\n  IF p_actor_id IS NOT NULL AND p_actor_id <> v_actor_id THEN\n    RAISE EXCEPTION 'Actor mismatch';\n  END IF;\n\n  IF p_user_email IS NOT NULL AND lower(trim(p_user_email)) <> lower(trim(v_user_email)) THEN\n    RAISE EXCEPTION 'User email mismatch';\n  END IF;\n\n  SELECT * INTO v_invite\n  FROM onto_project_invites\n  WHERE token_hash = p_token_hash\n  FOR UPDATE;\n\n  IF NOT FOUND THEN\n    RAISE EXCEPTION 'Invite not found';\n  END IF;\n\n  IF v_invite.status <> 'pending' THEN\n    RAISE EXCEPTION 'Invite is not pending';\n  END IF;\n\n  IF v_invite.expires_at IS NOT NULL AND v_invite.expires_at < now() THEN\n    UPDATE onto_project_invites\n    SET status = 'expired'\n    WHERE id = v_invite.id;\n    RAISE EXCEPTION 'Invite has expired';\n  END IF;\n\n  IF lower(v_invite.invitee_email) <> lower(trim(v_user_email)) THEN\n    RAISE EXCEPTION 'Invite email mismatch';\n  END IF;\n\n  UPDATE onto_project_members AS m\n  SET role_key = v_invite.role_key,\n      access = v_invite.access,\n      removed_at = NULL,\n      removed_by_actor_id = NULL\n  WHERE m.project_id = v_invite.project_id\n    AND m.actor_id = v_actor_id;\n\n  IF NOT FOUND THEN\n    INSERT INTO onto_project_members (project_id, actor_id, role_key, access, added_by_actor_id)\n    VALUES (v_invite.project_id, v_actor_id, v_invite.role_key, v_invite.access, v_invite.invited_by_actor_id);\n  END IF;\n\n  UPDATE onto_project_invites\n  SET status = 'accepted',\n      accepted_by_actor_id = v_actor_id,\n      accepted_at = now()\n  WHERE id = v_invite.id;\n\n  RETURN QUERY SELECT v_invite.project_id, v_invite.role_key, v_invite.access;\nEND;\n$function$\n"
  },
  {
    "args": "p_invite_id uuid",
    "name": "accept_project_invite_by_id",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.accept_project_invite_by_id(p_invite_id uuid)\n RETURNS TABLE(project_id uuid, role_key text, access text)\n LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO 'public'\nAS $function$\nDECLARE\n  v_invite onto_project_invites%ROWTYPE;\n  v_auth_user_id uuid;\n  v_actor_id uuid;\n  v_user_email text;\nBEGIN\n  IF p_invite_id IS NULL THEN\n    RAISE EXCEPTION 'Invite id missing';\n  END IF;\n\n  v_auth_user_id := auth.uid();\n  IF v_auth_user_id IS NULL THEN\n    RAISE EXCEPTION 'Authentication required';\n  END IF;\n\n  v_actor_id := ensure_actor_for_user(v_auth_user_id);\n\n  SELECT email INTO v_user_email\n  FROM public.users\n  WHERE id = v_auth_user_id;\n\n  IF v_user_email IS NULL THEN\n    SELECT email INTO v_user_email\n    FROM onto_actors\n    WHERE id = v_actor_id;\n  END IF;\n\n  IF v_user_email IS NULL OR length(trim(v_user_email)) = 0 THEN\n    RAISE EXCEPTION 'User email missing';\n  END IF;\n\n  SELECT * INTO v_invite\n  FROM onto_project_invites\n  WHERE id = p_invite_id\n  FOR UPDATE;\n\n  IF NOT FOUND THEN\n    RAISE EXCEPTION 'Invite not found';\n  END IF;\n\n  IF v_invite.status <> 'pending' THEN\n    RAISE EXCEPTION 'Invite is not pending';\n  END IF;\n\n  IF v_invite.expires_at < now() THEN\n    UPDATE onto_project_invites\n    SET status = 'expired'\n    WHERE id = v_invite.id;\n    RAISE EXCEPTION 'Invite has expired';\n  END IF;\n\n  IF lower(v_invite.invitee_email) <> lower(trim(v_user_email)) THEN\n    RAISE EXCEPTION 'Invite email mismatch';\n  END IF;\n\n  UPDATE onto_project_members AS m\n  SET role_key = v_invite.role_key,\n      access = v_invite.access,\n      removed_at = NULL,\n      removed_by_actor_id = NULL\n  WHERE m.project_id = v_invite.project_id\n    AND m.actor_id = v_actor_id;\n\n  IF NOT FOUND THEN\n    INSERT INTO onto_project_members (project_id, actor_id, role_key, access, added_by_actor_id)\n    VALUES (v_invite.project_id, v_actor_id, v_invite.role_key, v_invite.access, v_invite.invited_by_actor_id);\n  END IF;\n\n  UPDATE onto_project_invites\n  SET status = 'accepted',\n      accepted_by_actor_id = v_actor_id,\n      accepted_at = now()\n  WHERE id = v_invite.id;\n\n  RETURN QUERY SELECT v_invite.project_id, v_invite.role_key, v_invite.access;\nEND;\n$function$\n"
  },
  {
    "args": "p_run_id uuid, p_locked_by uuid, p_duration_minutes integer",
    "name": "acquire_migration_platform_lock",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.acquire_migration_platform_lock(p_run_id uuid, p_locked_by uuid, p_duration_minutes integer DEFAULT 60)\n RETURNS TABLE(acquired boolean, existing_run_id uuid, existing_locked_by uuid, existing_locked_at timestamp with time zone, existing_expires_at timestamp with time zone)\n LANGUAGE plpgsql\n SECURITY DEFINER\nAS $function$\nDECLARE\n    v_expires_at TIMESTAMPTZ;\n    v_current_lock RECORD;\nBEGIN\n    v_expires_at := NOW() + (p_duration_minutes || ' minutes')::INTERVAL;\n\n    -- Try to acquire the lock\n    UPDATE migration_platform_lock\n    SET\n        run_id = p_run_id,\n        locked_by = p_locked_by,\n        locked_at = NOW(),\n        expires_at = v_expires_at\n    WHERE id = 1\n        AND (run_id IS NULL OR expires_at < NOW())\n    RETURNING * INTO v_current_lock;\n\n    IF FOUND THEN\n        -- Lock acquired\n        RETURN QUERY SELECT\n            true AS acquired,\n            NULL::UUID AS existing_run_id,\n            NULL::UUID AS existing_locked_by,\n            NULL::TIMESTAMPTZ AS existing_locked_at,\n            NULL::TIMESTAMPTZ AS existing_expires_at;\n    ELSE\n        -- Lock not acquired, return existing lock info\n        SELECT * INTO v_current_lock FROM migration_platform_lock WHERE id = 1;\n\n        RETURN QUERY SELECT\n            false AS acquired,\n            v_current_lock.run_id AS existing_run_id,\n            v_current_lock.locked_by AS existing_locked_by,\n            v_current_lock.locked_at AS existing_locked_at,\n            v_current_lock.expires_at AS existing_expires_at;\n    END IF;\nEND;\n$function$\n"
  },
  {
    "args": "",
    "name": "add_project_owner_membership",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.add_project_owner_membership()\n RETURNS trigger\n LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO 'public'\nAS $function$\nBEGIN\n  INSERT INTO onto_project_members (project_id, actor_id, role_key, access, added_by_actor_id)\n  VALUES (NEW.id, NEW.created_by, 'owner', 'admin', NEW.created_by)\n  ON CONFLICT (project_id, actor_id) DO NOTHING;\n  RETURN NEW;\nEND;\n$function$\n"
  },
  {
    "args": "p_user_id uuid, p_job_type text, p_metadata jsonb, p_priority integer, p_scheduled_for timestamp with time zone, p_dedup_key text",
    "name": "add_queue_job",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.add_queue_job(p_user_id uuid, p_job_type text, p_metadata jsonb, p_priority integer DEFAULT 10, p_scheduled_for timestamp with time zone DEFAULT now(), p_dedup_key text DEFAULT NULL::text)\n RETURNS uuid\n LANGUAGE plpgsql\nAS $function$\n  DECLARE\n    v_job_id UUID;\n    v_queue_job_id TEXT;\n    v_is_duplicate BOOLEAN := FALSE;\n  BEGIN\n    -- Generate queue_job_id\n    v_queue_job_id := p_job_type || '_' || gen_random_uuid()::text;\n\n    INSERT INTO queue_jobs (\n      user_id, job_type, metadata, priority,\n      scheduled_for, dedup_key, status, queue_job_id\n    ) VALUES (\n      p_user_id,\n      p_job_type::queue_type,\n      p_metadata,\n      p_priority,\n      p_scheduled_for,\n      p_dedup_key,\n      'pending'::queue_status,\n      v_queue_job_id\n    )\n    ON CONFLICT (dedup_key)\n    WHERE dedup_key IS NOT NULL AND status IN ('pending', 'processing')\n    DO NOTHING\n    RETURNING id INTO v_job_id;\n\n    IF v_job_id IS NULL AND p_dedup_key IS NOT NULL THEN\n      SELECT id INTO v_job_id\n      FROM queue_jobs\n      WHERE dedup_key = p_dedup_key\n        AND status IN ('pending', 'processing')\n      ORDER BY created_at ASC\n      LIMIT 1;\n    END IF;\n\n    IF v_job_id IS NULL THEN\n      RAISE EXCEPTION 'Failed to create or find job with dedup_key: %', p_dedup_key;\n    END IF;\n\n    RETURN v_job_id;\n  END;\n  $function$\n"
  },
  {
    "args": "p_project_id uuid, p_deletes jsonb, p_updates jsonb, p_inserts jsonb",
    "name": "apply_graph_reorg_changes",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.apply_graph_reorg_changes(p_project_id uuid, p_deletes jsonb, p_updates jsonb, p_inserts jsonb)\n RETURNS jsonb\n LANGUAGE plpgsql\nAS $function$\ndeclare\n  v_deletes jsonb := coalesce(p_deletes, '[]'::jsonb);\n  v_updates jsonb := coalesce(p_updates, '[]'::jsonb);\n  v_inserts jsonb := coalesce(p_inserts, '[]'::jsonb);\n  v_delete_count integer := 0;\n  v_update_count integer := 0;\n  v_insert_count integer := 0;\n  v_expected_deletes integer := 0;\n  v_expected_updates integer := 0;\nbegin\n  perform pg_advisory_xact_lock(hashtext(p_project_id::text));\n\n  if jsonb_array_length(v_deletes) > 0 then\n    with del as (\n      select *\n      from jsonb_to_recordset(v_deletes)\n        as d(id uuid, src_kind text, src_id uuid, rel text, dst_kind text, dst_id uuid, props jsonb)\n    ), deleted as (\n      delete from onto_edges e\n      using del d\n      where e.id = d.id\n        and e.project_id = p_project_id\n        and e.src_kind = d.src_kind\n        and e.src_id = d.src_id\n        and e.rel = d.rel\n        and e.dst_kind = d.dst_kind\n        and e.dst_id = d.dst_id\n        and e.props = coalesce(d.props, '{}'::jsonb)\n      returning e.id\n    )\n    select count(*) into v_delete_count from deleted;\n\n    select count(*) into v_expected_deletes from jsonb_array_elements(v_deletes);\n\n    if v_delete_count <> v_expected_deletes then\n      raise exception 'Graph reorg conflict: delete mismatch (expected %, deleted %)', v_expected_deletes, v_delete_count\n        using errcode = '40001';\n    end if;\n  end if;\n\n  if jsonb_array_length(v_updates) > 0 then\n    with upd as (\n      select *\n      from jsonb_to_recordset(v_updates)\n        as u(\n          id uuid,\n          src_kind text,\n          src_id uuid,\n          rel text,\n          dst_kind text,\n          dst_id uuid,\n          props jsonb,\n          expected_props jsonb\n        )\n    ), updated as (\n      update onto_edges e\n      set props = coalesce(u.props, '{}'::jsonb)\n      from upd u\n      where e.id = u.id\n        and e.project_id = p_project_id\n        and e.src_kind = u.src_kind\n        and e.src_id = u.src_id\n        and e.rel = u.rel\n        and e.dst_kind = u.dst_kind\n        and e.dst_id = u.dst_id\n        and e.props = coalesce(u.expected_props, '{}'::jsonb)\n      returning e.id\n    )\n    select count(*) into v_update_count from updated;\n\n    select count(*) into v_expected_updates from jsonb_array_elements(v_updates);\n\n    if v_update_count <> v_expected_updates then\n      raise exception 'Graph reorg conflict: update mismatch (expected %, updated %)', v_expected_updates, v_update_count\n        using errcode = '40001';\n    end if;\n  end if;\n\n  if jsonb_array_length(v_inserts) > 0 then\n    with ins as (\n      select *\n      from jsonb_to_recordset(v_inserts)\n        as i(src_kind text, src_id uuid, rel text, dst_kind text, dst_id uuid, props jsonb)\n    ), to_insert as (\n      select i.*\n      from ins i\n      left join onto_edges e\n        on e.project_id = p_project_id\n        and e.src_kind = i.src_kind\n        and e.src_id = i.src_id\n        and e.rel = i.rel\n        and e.dst_kind = i.dst_kind\n        and e.dst_id = i.dst_id\n      where e.id is null\n    ), inserted as (\n      insert into onto_edges (project_id, src_kind, src_id, rel, dst_kind, dst_id, props)\n      select p_project_id, src_kind, src_id, rel, dst_kind, dst_id, coalesce(props, '{}'::jsonb)\n      from to_insert\n      returning id\n    )\n    select count(*) into v_insert_count from inserted;\n  end if;\n\n  return jsonb_build_object(\n    'deleted', v_delete_count,\n    'updated', v_update_count,\n    'inserted', v_insert_count\n  );\nend;\n$function$\n"
  },
  {
    "args": "double precision[], integer, boolean",
    "name": "array_to_halfvec",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.array_to_halfvec(double precision[], integer, boolean)\n RETURNS halfvec\n LANGUAGE c\n IMMUTABLE PARALLEL SAFE STRICT\nAS '$libdir/vector', $function$array_to_halfvec$function$\n"
  },
  {
    "args": "integer[], integer, boolean",
    "name": "array_to_halfvec",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.array_to_halfvec(integer[], integer, boolean)\n RETURNS halfvec\n LANGUAGE c\n IMMUTABLE PARALLEL SAFE STRICT\nAS '$libdir/vector', $function$array_to_halfvec$function$\n"
  },
  {
    "args": "numeric[], integer, boolean",
    "name": "array_to_halfvec",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.array_to_halfvec(numeric[], integer, boolean)\n RETURNS halfvec\n LANGUAGE c\n IMMUTABLE PARALLEL SAFE STRICT\nAS '$libdir/vector', $function$array_to_halfvec$function$\n"
  },
  {
    "args": "real[], integer, boolean",
    "name": "array_to_halfvec",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.array_to_halfvec(real[], integer, boolean)\n RETURNS halfvec\n LANGUAGE c\n IMMUTABLE PARALLEL SAFE STRICT\nAS '$libdir/vector', $function$array_to_halfvec$function$\n"
  },
  {
    "args": "double precision[], integer, boolean",
    "name": "array_to_sparsevec",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.array_to_sparsevec(double precision[], integer, boolean)\n RETURNS sparsevec\n LANGUAGE c\n IMMUTABLE PARALLEL SAFE STRICT\nAS '$libdir/vector', $function$array_to_sparsevec$function$\n"
  },
  {
    "args": "integer[], integer, boolean",
    "name": "array_to_sparsevec",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.array_to_sparsevec(integer[], integer, boolean)\n RETURNS sparsevec\n LANGUAGE c\n IMMUTABLE PARALLEL SAFE STRICT\nAS '$libdir/vector', $function$array_to_sparsevec$function$\n"
  },
  {
    "args": "numeric[], integer, boolean",
    "name": "array_to_sparsevec",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.array_to_sparsevec(numeric[], integer, boolean)\n RETURNS sparsevec\n LANGUAGE c\n IMMUTABLE PARALLEL SAFE STRICT\nAS '$libdir/vector', $function$array_to_sparsevec$function$\n"
  },
  {
    "args": "real[], integer, boolean",
    "name": "array_to_sparsevec",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.array_to_sparsevec(real[], integer, boolean)\n RETURNS sparsevec\n LANGUAGE c\n IMMUTABLE PARALLEL SAFE STRICT\nAS '$libdir/vector', $function$array_to_sparsevec$function$\n"
  },
  {
    "args": "double precision[], integer, boolean",
    "name": "array_to_vector",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.array_to_vector(double precision[], integer, boolean)\n RETURNS vector\n LANGUAGE c\n IMMUTABLE PARALLEL SAFE STRICT\nAS '$libdir/vector', $function$array_to_vector$function$\n"
  },
  {
    "args": "integer[], integer, boolean",
    "name": "array_to_vector",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.array_to_vector(integer[], integer, boolean)\n RETURNS vector\n LANGUAGE c\n IMMUTABLE PARALLEL SAFE STRICT\nAS '$libdir/vector', $function$array_to_vector$function$\n"
  },
  {
    "args": "numeric[], integer, boolean",
    "name": "array_to_vector",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.array_to_vector(numeric[], integer, boolean)\n RETURNS vector\n LANGUAGE c\n IMMUTABLE PARALLEL SAFE STRICT\nAS '$libdir/vector', $function$array_to_vector$function$\n"
  },
  {
    "args": "real[], integer, boolean",
    "name": "array_to_vector",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.array_to_vector(real[], integer, boolean)\n RETURNS vector\n LANGUAGE c\n IMMUTABLE PARALLEL SAFE STRICT\nAS '$libdir/vector', $function$array_to_vector$function$\n"
  },
  {
    "args": "p_project_id uuid, p_updates jsonb",
    "name": "batch_update_phase_dates",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.batch_update_phase_dates(p_project_id uuid, p_updates jsonb)\n RETURNS TABLE(id uuid, start_date date, end_date date, updated_at timestamp with time zone)\n LANGUAGE plpgsql\n SECURITY DEFINER\nAS $function$\r\nBEGIN\r\n  -- Validate dates\r\n  IF EXISTS (\r\n    SELECT 1\r\n    FROM jsonb_array_elements(p_updates) AS update_item\r\n    WHERE (update_item->>'start_date')::DATE >= (update_item->>'end_date')::DATE\r\n  ) THEN\r\n    RAISE EXCEPTION 'Phase start date must be before end date';\r\n  END IF;\r\n\r\n  -- Perform batch update\r\n  RETURN QUERY\r\n  UPDATE phases p\r\n  SET \r\n    start_date = (u.value->>'start_date')::DATE,\r\n    end_date = (u.value->>'end_date')::DATE,\r\n    updated_at = NOW()\r\n  FROM jsonb_array_elements(p_updates) AS u\r\n  WHERE p.id = (u.value->>'id')::UUID\r\n    AND p.project_id = p_project_id\r\n  RETURNING p.id, p.start_date, p.end_date, p.updated_at;\r\nEND;\r\n$function$\n"
  },
  {
    "args": "halfvec",
    "name": "binary_quantize",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.binary_quantize(halfvec)\n RETURNS bit\n LANGUAGE c\n IMMUTABLE PARALLEL SAFE STRICT\nAS '$libdir/vector', $function$halfvec_binary_quantize$function$\n"
  },
  {
    "args": "vector",
    "name": "binary_quantize",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.binary_quantize(vector)\n RETURNS bit\n LANGUAGE c\n IMMUTABLE PARALLEL SAFE STRICT\nAS '$libdir/vector', $function$binary_quantize$function$\n"
  },
  {
    "args": "p_user_id uuid, p_brief_date text, p_exclude_job_id uuid",
    "name": "cancel_brief_jobs_for_date",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.cancel_brief_jobs_for_date(p_user_id uuid, p_brief_date text, p_exclude_job_id uuid DEFAULT NULL::uuid)\n RETURNS TABLE(cancelled_count integer, cancelled_job_ids text[])\n LANGUAGE plpgsql\nAS $function$\nDECLARE\n  v_cancelled_jobs TEXT[];\n  v_count INTEGER;\nBEGIN\n  -- Cancel matching jobs and collect IDs\n  WITH cancelled AS (\n    UPDATE queue_jobs\n    SET\n      status = 'cancelled',\n      updated_at = NOW(),\n      error_message = 'Cancelled: Duplicate brief job for same date'\n    WHERE user_id = p_user_id\n      AND job_type = 'generate_daily_brief'\n      AND status IN ('pending', 'processing')\n      AND metadata->>'briefDate' = p_brief_date\n      AND (p_exclude_job_id IS NULL OR id != p_exclude_job_id)\n    RETURNING queue_job_id\n  )\n  SELECT\n    COUNT(*)::INTEGER,\n    ARRAY_AGG(queue_job_id)\n  INTO v_count, v_cancelled_jobs\n  FROM cancelled;\n\n  RETURN QUERY SELECT v_count, v_cancelled_jobs;\nEND;\n$function$\n"
  },
  {
    "args": "p_job_id uuid, p_reason text, p_allow_processing boolean",
    "name": "cancel_job_with_reason",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.cancel_job_with_reason(p_job_id uuid, p_reason text, p_allow_processing boolean DEFAULT false)\n RETURNS boolean\n LANGUAGE plpgsql\nAS $function$\nDECLARE\n  v_updated INTEGER;\n  v_allowed_statuses TEXT[];\nBEGIN\n  -- Determine which statuses we can cancel\n  v_allowed_statuses := ARRAY['pending'];\n  IF p_allow_processing THEN\n    v_allowed_statuses := ARRAY['pending', 'processing'];\n  END IF;\n\n  UPDATE queue_jobs\n  SET\n    status = 'cancelled',\n    error_message = p_reason,\n    updated_at = NOW()\n  WHERE id = p_job_id\n    AND status = ANY(v_allowed_statuses);\n\n  GET DIAGNOSTICS v_updated = ROW_COUNT;\n  RETURN v_updated > 0;\nEND;\n$function$\n"
  },
  {
    "args": "p_user_id uuid, p_job_type text, p_metadata_filter jsonb, p_allowed_statuses text[]",
    "name": "cancel_jobs_atomic",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.cancel_jobs_atomic(p_user_id uuid, p_job_type text, p_metadata_filter jsonb DEFAULT NULL::jsonb, p_allowed_statuses text[] DEFAULT ARRAY['pending'::text, 'processing'::text])\n RETURNS TABLE(id uuid, queue_job_id text, job_type text, status text)\n LANGUAGE plpgsql\nAS $function$\nBEGIN\n  RETURN QUERY\n  UPDATE queue_jobs\n  SET\n    status = 'cancelled',\n    updated_at = NOW()\n  WHERE queue_jobs.user_id = p_user_id\n    AND queue_jobs.job_type::TEXT = p_job_type  -- FIXED: Cast enum to TEXT for comparison\n    AND queue_jobs.status::TEXT = ANY(p_allowed_statuses)  -- FIXED: Cast enum to TEXT\n    AND (p_metadata_filter IS NULL OR queue_jobs.metadata @> p_metadata_filter)\n  RETURNING\n    queue_jobs.id,\n    queue_jobs.queue_job_id,\n    queue_jobs.job_type::TEXT,  -- FIXED: Cast enum to TEXT for output\n    queue_jobs.status::TEXT;    -- FIXED: Cast enum to TEXT for output\nEND;\n$function$\n"
  },
  {
    "args": "p_user_id uuid, p_job_type text, p_window_start timestamp with time zone, p_window_end timestamp with time zone, p_exclude_job_id uuid",
    "name": "cancel_jobs_in_time_window",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.cancel_jobs_in_time_window(p_user_id uuid, p_job_type text, p_window_start timestamp with time zone, p_window_end timestamp with time zone, p_exclude_job_id uuid DEFAULT NULL::uuid)\n RETURNS integer\n LANGUAGE plpgsql\nAS $function$\nDECLARE\n  v_count INTEGER;\nBEGIN\n  UPDATE queue_jobs\n  SET \n    status = 'cancelled',\n    updated_at = NOW(),\n    error_message = 'Cancelled due to scheduling conflict'\n  WHERE user_id = p_user_id\n    AND job_type = p_job_type\n    AND status IN ('pending', 'generating')\n    AND scheduled_for >= p_window_start\n    AND scheduled_for <= p_window_end\n    AND (p_exclude_job_id IS NULL OR id != p_exclude_job_id);\n  \n  GET DIAGNOSTICS v_count = ROW_COUNT;\n  RETURN v_count;\nEND;\n$function$\n"
  },
  {
    "args": "p_calendar_event_id text, p_user_id uuid",
    "name": "cancel_scheduled_sms_for_event",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.cancel_scheduled_sms_for_event(p_calendar_event_id text, p_user_id uuid DEFAULT NULL::uuid)\n RETURNS TABLE(cancelled_count integer, message_ids uuid[])\n LANGUAGE plpgsql\n SECURITY DEFINER\nAS $function$\nDECLARE\n  v_cancelled_ids UUID[];\n  v_count INTEGER;\nBEGIN\n  -- Cancel all scheduled SMS for this calendar event\n  WITH updated AS (\n    UPDATE scheduled_sms_messages\n    SET\n      status = 'cancelled',\n      cancelled_at = NOW(),\n      last_error = 'Event cancelled or deleted'\n    WHERE\n      calendar_event_id = p_calendar_event_id\n      AND status IN ('scheduled', 'queued')\n      AND (p_user_id IS NULL OR user_id = p_user_id)\n    RETURNING id\n  )\n  SELECT\n    array_agg(id),\n    COUNT(*)::INTEGER\n  INTO v_cancelled_ids, v_count\n  FROM updated;\n\n  -- Return results\n  RETURN QUERY SELECT\n    COALESCE(v_count, 0),\n    COALESCE(v_cancelled_ids, ARRAY[]::UUID[]);\nEND;\n$function$\n"
  },
  {
    "args": "client_ip inet",
    "name": "check_feedback_rate_limit",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.check_feedback_rate_limit(client_ip inet)\n RETURNS boolean\n LANGUAGE plpgsql\nAS $function$\r\nDECLARE\r\n    rate_record RECORD;\r\n    current_time TIMESTAMP WITH TIME ZONE := CURRENT_TIMESTAMP;\r\n    hour_ago TIMESTAMP WITH TIME ZONE := current_time - INTERVAL '1 hour';\r\n    day_ago TIMESTAMP WITH TIME ZONE := current_time - INTERVAL '24 hours';\r\nBEGIN\r\n    -- Get or create rate limit record for this IP\r\n    SELECT * INTO rate_record \r\n    FROM feedback_rate_limit \r\n    WHERE ip_address = client_ip;\r\n    \r\n    IF NOT FOUND THEN\r\n        -- First submission from this IP\r\n        INSERT INTO feedback_rate_limit (ip_address, submission_count, first_submission, last_submission)\r\n        VALUES (client_ip, 1, current_time, current_time);\r\n        RETURN TRUE;\r\n    END IF;\r\n    \r\n    -- Check if IP is blocked\r\n    IF rate_record.is_blocked THEN\r\n        RETURN FALSE;\r\n    END IF;\r\n    \r\n    -- Reset counter if last submission was more than 24 hours ago\r\n    IF rate_record.last_submission < day_ago THEN\r\n        UPDATE feedback_rate_limit \r\n        SET submission_count = 1, \r\n            first_submission = current_time, \r\n            last_submission = current_time\r\n        WHERE ip_address = client_ip;\r\n        RETURN TRUE;\r\n    END IF;\r\n    \r\n    -- Check hourly limit (max 3 per hour)\r\n    IF rate_record.last_submission > hour_ago AND rate_record.submission_count >= 3 THEN\r\n        RETURN FALSE;\r\n    END IF;\r\n    \r\n    -- Check daily limit (max 10 per day)\r\n    IF rate_record.submission_count >= 10 THEN\r\n        -- Block this IP for 24 hours\r\n        UPDATE feedback_rate_limit \r\n        SET is_blocked = TRUE \r\n        WHERE ip_address = client_ip;\r\n        RETURN FALSE;\r\n    END IF;\r\n    \r\n    -- Update submission count\r\n    UPDATE feedback_rate_limit \r\n    SET submission_count = submission_count + 1,\r\n        last_submission = current_time\r\n    WHERE ip_address = client_ip;\r\n    \r\n    RETURN TRUE;\r\nEND;\r\n$function$\n"
  },
  {
    "args": "p_job_types text[], p_batch_size integer",
    "name": "claim_pending_jobs",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.claim_pending_jobs(p_job_types text[], p_batch_size integer DEFAULT 5)\n RETURNS TABLE(id uuid, queue_job_id text, user_id uuid, job_type text, metadata jsonb, status text, priority integer, attempts integer, max_attempts integer, scheduled_for timestamp with time zone, created_at timestamp with time zone, updated_at timestamp with time zone, started_at timestamp with time zone, completed_at timestamp with time zone, error_message text)\n LANGUAGE plpgsql\nAS $function$\nBEGIN\n  RETURN QUERY\n  UPDATE queue_jobs\n  SET\n    status = 'processing',\n    started_at = NOW(),\n    updated_at = NOW()\n  WHERE queue_jobs.id IN (\n    SELECT queue_jobs.id\n    FROM queue_jobs\n    WHERE queue_jobs.status = 'pending'\n      AND queue_jobs.job_type::TEXT = ANY(p_job_types)\n      AND queue_jobs.scheduled_for <= NOW()\n    ORDER BY queue_jobs.priority DESC, queue_jobs.scheduled_for ASC\n    LIMIT p_batch_size\n    FOR UPDATE SKIP LOCKED\n  )\n  RETURNING\n    queue_jobs.id,\n    queue_jobs.queue_job_id,\n    queue_jobs.user_id,\n    queue_jobs.job_type::TEXT,     -- Cast enum to text\n    queue_jobs.metadata,\n    queue_jobs.status::TEXT,       -- FIXED: Cast enum to text\n    queue_jobs.priority,\n    queue_jobs.attempts,\n    queue_jobs.max_attempts,\n    queue_jobs.scheduled_for,\n    queue_jobs.created_at,\n    queue_jobs.updated_at,\n    queue_jobs.started_at,\n    queue_jobs.completed_at,\n    queue_jobs.error_message;\nEND;\n$function$\n"
  },
  {
    "args": "target_project_id uuid",
    "name": "cleanup_project_history",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.cleanup_project_history(target_project_id uuid)\n RETURNS void\n LANGUAGE plpgsql\nAS $function$\r\nDECLARE\r\n    version_count INTEGER;\r\n    versions_to_delete INTEGER[];\r\nBEGIN\r\n    -- Count total versions for this project\r\n    SELECT COUNT(*) INTO version_count \r\n    FROM projects_history \r\n    WHERE project_id = target_project_id;\r\n    \r\n    -- Only cleanup if we have more than 4 versions (1 first + 3 last)\r\n    IF version_count > 4 THEN\r\n        -- Get version numbers to delete (everything except first and last 3)\r\n        SELECT ARRAY_AGG(version_number) INTO versions_to_delete\r\n        FROM (\r\n            SELECT version_number\r\n            FROM projects_history\r\n            WHERE project_id = target_project_id\r\n              AND is_first_version = FALSE  -- Never delete the first version\r\n            ORDER BY version_number DESC\r\n            OFFSET 3  -- Skip the last 3 versions\r\n        ) versions_to_remove;\r\n        \r\n        -- Delete the intermediate versions\r\n        IF array_length(versions_to_delete, 1) > 0 THEN\r\n            DELETE FROM projects_history \r\n            WHERE project_id = target_project_id \r\n              AND version_number = ANY(versions_to_delete);\r\n        END IF;\r\n    END IF;\r\nEND;\r\n$function$\n"
  },
  {
    "args": "p_user_id uuid, p_timeout_minutes integer",
    "name": "cleanup_stale_brief_generations",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.cleanup_stale_brief_generations(p_user_id uuid, p_timeout_minutes integer DEFAULT 10)\n RETURNS TABLE(id uuid, brief_date date)\n LANGUAGE plpgsql\n SECURITY DEFINER\nAS $function$\nDECLARE\n  v_timeout_interval INTERVAL;\nBEGIN\n  v_timeout_interval := (p_timeout_minutes || ' minutes')::INTERVAL;\n\n  -- Update stale processing briefs to failed\n  UPDATE daily_briefs\n  SET\n    generation_status = 'failed',\n    generation_error = 'Generation timeout after ' || p_timeout_minutes || ' minutes',\n    generation_completed_at = NOW(),\n    updated_at = NOW()\n  WHERE\n    user_id = p_user_id\n    AND generation_status = 'processing'\n    AND generation_started_at IS NOT NULL\n    AND generation_started_at < NOW() - v_timeout_interval;\n\n  -- Return the cleaned up briefs\n  RETURN QUERY\n  SELECT\n    db.id,\n    db.brief_date\n  FROM daily_briefs db\n  WHERE\n    db.user_id = p_user_id\n    AND db.generation_status = 'failed'\n    AND db.generation_error = 'Generation timeout after ' || p_timeout_minutes || ' minutes'\n    AND db.generation_completed_at >= NOW() - INTERVAL '1 minute';\nEND;\n$function$\n"
  },
  {
    "args": "p_job_id uuid, p_result jsonb",
    "name": "complete_queue_job",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.complete_queue_job(p_job_id uuid, p_result jsonb DEFAULT NULL::jsonb)\n RETURNS boolean\n LANGUAGE plpgsql\nAS $function$\nDECLARE\n  v_updated INTEGER;\nBEGIN\n  UPDATE queue_jobs\n  SET\n    status = 'completed',\n    completed_at = NOW(),\n    updated_at = NOW(),\n    result = p_result\n  WHERE id = p_job_id\n    AND status = 'processing';\n\n  GET DIAGNOSTICS v_updated = ROW_COUNT;\n  RETURN v_updated > 0;\nEND;\n$function$\n"
  },
  {
    "args": "p_task_id uuid, p_instance_date date, p_user_id uuid",
    "name": "complete_recurring_instance",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.complete_recurring_instance(p_task_id uuid, p_instance_date date, p_user_id uuid)\n RETURNS boolean\n LANGUAGE plpgsql\nAS $function$\nDECLARE\n  v_instance_id UUID;\nBEGIN\n  -- Check if instance exists\n  SELECT id INTO v_instance_id\n  FROM recurring_task_instances\n  WHERE task_id = p_task_id \n    AND instance_date = p_instance_date\n    AND user_id = p_user_id;\n  \n  IF v_instance_id IS NULL THEN\n    -- Create instance if it doesn't exist\n    INSERT INTO recurring_task_instances (task_id, instance_date, user_id, status, completed_at)\n    VALUES (p_task_id, p_instance_date, p_user_id, 'completed', CURRENT_TIMESTAMP);\n  ELSE\n    -- Update existing instance\n    UPDATE recurring_task_instances\n    SET status = 'completed',\n        completed_at = CURRENT_TIMESTAMP,\n        updated_at = CURRENT_TIMESTAMP\n    WHERE id = v_instance_id;\n  END IF;\n  \n  RETURN TRUE;\nEXCEPTION\n  WHEN OTHERS THEN\n    RETURN FALSE;\nEND;\n$function$\n"
  },
  {
    "args": "halfvec, halfvec",
    "name": "cosine_distance",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.cosine_distance(halfvec, halfvec)\n RETURNS double precision\n LANGUAGE c\n IMMUTABLE PARALLEL SAFE STRICT\nAS '$libdir/vector', $function$halfvec_cosine_distance$function$\n"
  },
  {
    "args": "sparsevec, sparsevec",
    "name": "cosine_distance",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.cosine_distance(sparsevec, sparsevec)\n RETURNS double precision\n LANGUAGE c\n IMMUTABLE PARALLEL SAFE STRICT\nAS '$libdir/vector', $function$sparsevec_cosine_distance$function$\n"
  },
  {
    "args": "vector, vector",
    "name": "cosine_distance",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.cosine_distance(vector, vector)\n RETURNS double precision\n LANGUAGE c\n IMMUTABLE PARALLEL SAFE STRICT\nAS '$libdir/vector', $function$cosine_distance$function$\n"
  },
  {
    "args": "target_project_id uuid, created_by_user uuid",
    "name": "create_manual_project_version",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.create_manual_project_version(target_project_id uuid, created_by_user uuid DEFAULT NULL::uuid)\n RETURNS integer\n LANGUAGE plpgsql\nAS $function$\r\nDECLARE\r\n    next_version INTEGER;\r\n    project_record RECORD;\r\nBEGIN\r\n    -- Get current project data\r\n    SELECT * INTO project_record \r\n    FROM projects \r\n    WHERE id = target_project_id;\r\n    \r\n    IF NOT FOUND THEN\r\n        RAISE EXCEPTION 'Project not found: %', target_project_id;\r\n    END IF;\r\n    \r\n    -- Get next version number\r\n    SELECT COALESCE(MAX(version_number), 0) + 1 \r\n    INTO next_version\r\n    FROM projects_history \r\n    WHERE project_id = target_project_id;\r\n    \r\n    -- Insert new version\r\n    INSERT INTO projects_history (\r\n        project_id, \r\n        version_number, \r\n        is_first_version,\r\n        project_data, \r\n        created_by\r\n    ) VALUES (\r\n        target_project_id,\r\n        next_version,\r\n        next_version = 1,\r\n        row_to_json(project_record)::jsonb,\r\n        COALESCE(created_by_user, project_record.user_id)\r\n    );\r\n    \r\n    -- Clean up history\r\n    PERFORM cleanup_project_history(target_project_id);\r\n    \r\n    RETURN next_version;\r\nEND;\r\n$function$\n"
  },
  {
    "args": "p_delivery_id uuid, p_destination_url text",
    "name": "create_tracking_link",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.create_tracking_link(p_delivery_id uuid, p_destination_url text)\n RETURNS text\n LANGUAGE plpgsql\nAS $function$\nDECLARE\n  v_short_code TEXT;\n  v_max_attempts INTEGER := 10;\n  v_attempt INTEGER := 0;\nBEGIN\n  -- Validate inputs\n  IF p_delivery_id IS NULL THEN\n    RAISE EXCEPTION 'delivery_id cannot be null';\n  END IF;\n\n  IF p_destination_url IS NULL OR p_destination_url = '' THEN\n    RAISE EXCEPTION 'destination_url cannot be empty';\n  END IF;\n\n  -- Try to generate unique short code\n  LOOP\n    v_short_code := generate_short_code(6);\n\n    BEGIN\n      INSERT INTO notification_tracking_links (\n        short_code,\n        delivery_id,\n        destination_url\n      ) VALUES (\n        v_short_code,\n        p_delivery_id,\n        p_destination_url\n      );\n\n      -- Success! Return the short code\n      RETURN v_short_code;\n\n    EXCEPTION WHEN unique_violation THEN\n      -- Collision detected, try again\n      v_attempt := v_attempt + 1;\n\n      IF v_attempt >= v_max_attempts THEN\n        RAISE EXCEPTION 'Failed to generate unique short code after % attempts', v_max_attempts;\n      END IF;\n\n      -- Log collision (optional, for monitoring)\n      RAISE NOTICE 'Short code collision on attempt %, retrying...', v_attempt;\n    END;\n  END LOOP;\nEND;\n$function$\n"
  },
  {
    "args": "p_project_id uuid, p_required_access text",
    "name": "current_actor_has_project_access",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.current_actor_has_project_access(p_project_id uuid, p_required_access text DEFAULT 'read'::text)\n RETURNS boolean\n LANGUAGE plpgsql\n STABLE SECURITY DEFINER\n SET search_path TO 'public'\nAS $function$\nDECLARE\n  v_actor_id uuid;\nBEGIN\n  IF p_project_id IS NULL THEN\n    RETURN false;\n  END IF;\n\n  IF auth.role() = 'service_role' THEN\n    RETURN true;\n  END IF;\n\n  IF p_required_access = 'read' THEN\n    IF EXISTS (\n      SELECT 1 FROM onto_projects p\n      WHERE p.id = p_project_id\n        AND p.deleted_at IS NULL\n        AND p.is_public = true\n    ) THEN\n      RETURN true;\n    END IF;\n  END IF;\n\n  IF is_admin() THEN\n    RETURN true;\n  END IF;\n\n  v_actor_id := current_actor_id();\n  IF v_actor_id IS NULL THEN\n    RETURN false;\n  END IF;\n\n  -- Owner always has access.\n  IF EXISTS (\n    SELECT 1 FROM onto_projects p\n    WHERE p.id = p_project_id AND p.created_by = v_actor_id\n  ) THEN\n    RETURN true;\n  END IF;\n\n  RETURN EXISTS (\n    SELECT 1 FROM onto_project_members m\n    WHERE m.project_id = p_project_id\n      AND m.actor_id = v_actor_id\n      AND m.removed_at IS NULL\n      AND (\n        (p_required_access = 'read'  AND m.access IN ('read', 'write', 'admin')) OR\n        (p_required_access = 'write' AND m.access IN ('write', 'admin')) OR\n        (p_required_access = 'admin' AND m.access = 'admin')\n      )\n  );\nEND;\n$function$\n"
  },
  {
    "args": "",
    "name": "current_actor_id",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.current_actor_id()\n RETURNS uuid\n LANGUAGE sql\n STABLE SECURITY DEFINER\n SET search_path TO 'public'\nAS $function$\n  SELECT id\n  FROM onto_actors\n  WHERE user_id = auth.uid();\n$function$\n"
  },
  {
    "args": "p_project_id uuid",
    "name": "current_actor_is_project_member",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.current_actor_is_project_member(p_project_id uuid)\n RETURNS boolean\n LANGUAGE plpgsql\n STABLE SECURITY DEFINER\n SET search_path TO 'public'\nAS $function$\nDECLARE\n  v_actor_id uuid;\nBEGIN\n  IF p_project_id IS NULL THEN\n    RETURN false;\n  END IF;\n\n  IF is_admin() THEN\n    RETURN true;\n  END IF;\n\n  v_actor_id := current_actor_id();\n  IF v_actor_id IS NULL THEN\n    RETURN false;\n  END IF;\n\n  IF EXISTS (\n    SELECT 1 FROM onto_projects p\n    WHERE p.id = p_project_id AND p.created_by = v_actor_id\n  ) THEN\n    RETURN true;\n  END IF;\n\n  RETURN EXISTS (\n    SELECT 1 FROM onto_project_members m\n    WHERE m.project_id = p_project_id\n      AND m.actor_id = v_actor_id\n      AND m.removed_at IS NULL\n  );\nEND;\n$function$\n"
  },
  {
    "args": "p_invite_id uuid",
    "name": "decline_project_invite",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.decline_project_invite(p_invite_id uuid)\n RETURNS TABLE(invite_id uuid, status text)\n LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO 'public'\nAS $function$\nDECLARE\n  v_invite onto_project_invites%ROWTYPE;\n  v_auth_user_id uuid;\n  v_actor_id uuid;\n  v_user_email text;\nBEGIN\n  IF p_invite_id IS NULL THEN\n    RAISE EXCEPTION 'Invite id missing';\n  END IF;\n\n  v_auth_user_id := auth.uid();\n  IF v_auth_user_id IS NULL THEN\n    RAISE EXCEPTION 'Authentication required';\n  END IF;\n\n  v_actor_id := ensure_actor_for_user(v_auth_user_id);\n\n  SELECT email INTO v_user_email\n  FROM public.users\n  WHERE id = v_auth_user_id;\n\n  IF v_user_email IS NULL THEN\n    SELECT email INTO v_user_email\n    FROM onto_actors\n    WHERE id = v_actor_id;\n  END IF;\n\n  IF v_user_email IS NULL OR length(trim(v_user_email)) = 0 THEN\n    RAISE EXCEPTION 'User email missing';\n  END IF;\n\n  SELECT * INTO v_invite\n  FROM onto_project_invites\n  WHERE id = p_invite_id\n  FOR UPDATE;\n\n  IF NOT FOUND THEN\n    RAISE EXCEPTION 'Invite not found';\n  END IF;\n\n  IF v_invite.status <> 'pending' THEN\n    RAISE EXCEPTION 'Invite is not pending';\n  END IF;\n\n  IF v_invite.expires_at < now() THEN\n    UPDATE onto_project_invites\n    SET status = 'expired'\n    WHERE id = v_invite.id;\n    RAISE EXCEPTION 'Invite has expired';\n  END IF;\n\n  IF lower(v_invite.invitee_email) <> lower(trim(v_user_email)) THEN\n    RAISE EXCEPTION 'Invite email mismatch';\n  END IF;\n\n  UPDATE onto_project_invites\n  SET status = 'declined'\n  WHERE id = v_invite.id;\n\n  RETURN QUERY SELECT v_invite.id, 'declined'::text;\nEND;\n$function$\n"
  },
  {
    "args": "p_project_id uuid, p_order_threshold integer",
    "name": "decrement_phase_order",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.decrement_phase_order(p_project_id uuid, p_order_threshold integer)\n RETURNS void\n LANGUAGE plpgsql\nAS $function$\r\nBEGIN\r\n  UPDATE phases\r\n  SET \"order\" = \"order\" - 1,\r\n      updated_at = NOW()\r\n  WHERE project_id = p_project_id\r\n    AND \"order\" > p_order_threshold;\r\nEND;\r\n$function$\n"
  },
  {
    "args": "p_project_id uuid",
    "name": "delete_onto_project",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.delete_onto_project(p_project_id uuid)\n RETURNS void\n LANGUAGE plpgsql\nAS $function$\nDECLARE\n\tv_goal_ids uuid[] := coalesce((select array_agg(id) from onto_goals where project_id = p_project_id), '{}'::uuid[]);\n\tv_requirement_ids uuid[] := coalesce((select array_agg(id) from onto_requirements where project_id = p_project_id), '{}'::uuid[]);\n\tv_plan_ids uuid[] := coalesce((select array_agg(id) from onto_plans where project_id = p_project_id), '{}'::uuid[]);\n\tv_task_ids uuid[] := coalesce((select array_agg(id) from onto_tasks where project_id = p_project_id), '{}'::uuid[]);\n\tv_output_ids uuid[] := coalesce((select array_agg(id) from onto_outputs where project_id = p_project_id), '{}'::uuid[]);\n\tv_document_ids uuid[] := coalesce((select array_agg(id) from onto_documents where project_id = p_project_id), '{}'::uuid[]);\n\tv_source_ids uuid[] := coalesce((select array_agg(id) from onto_sources where project_id = p_project_id), '{}'::uuid[]);\n\tv_decision_ids uuid[] := coalesce((select array_agg(id) from onto_decisions where project_id = p_project_id), '{}'::uuid[]);\n\tv_risk_ids uuid[] := coalesce((select array_agg(id) from onto_risks where project_id = p_project_id), '{}'::uuid[]);\n\tv_milestone_ids uuid[] := coalesce((select array_agg(id) from onto_milestones where project_id = p_project_id), '{}'::uuid[]);\n\tv_metric_ids uuid[] := coalesce((select array_agg(id) from onto_metrics where project_id = p_project_id), '{}'::uuid[]);\n\tv_signal_ids uuid[] := coalesce((select array_agg(id) from onto_signals where project_id = p_project_id), '{}'::uuid[]);\n\tv_insight_ids uuid[] := coalesce((select array_agg(id) from onto_insights where project_id = p_project_id), '{}'::uuid[]);\n\tv_event_ids uuid[] := coalesce((select array_agg(id) from onto_events where project_id = p_project_id), '{}'::uuid[]);\n\tv_all_ids uuid[] := array[p_project_id];\nBEGIN\n\tIF p_project_id IS NULL THEN\n\t\tRAISE EXCEPTION 'Project ID required';\n\tEND IF;\n\n\tv_all_ids := v_all_ids\n\t\t|| v_goal_ids\n\t\t|| v_requirement_ids\n\t\t|| v_plan_ids\n\t\t|| v_task_ids\n\t\t|| v_output_ids\n\t\t|| v_document_ids\n\t\t|| v_source_ids\n\t\t|| v_decision_ids\n\t\t|| v_risk_ids\n\t\t|| v_milestone_ids\n\t\t|| v_metric_ids\n\t\t|| v_signal_ids\n\t\t|| v_insight_ids\n\t\t|| v_event_ids;\n\n\t-- Delete secondary records first\n\tDELETE FROM onto_event_sync WHERE event_id = any(v_event_ids);\n\tDELETE FROM onto_metric_points WHERE metric_id = any(v_metric_ids);\n\tDELETE FROM onto_output_versions WHERE output_id = any(v_output_ids);\n\tDELETE FROM onto_document_versions WHERE document_id = any(v_document_ids);\n\n\t-- Remove edges/assignments/permissions referencing any of these entities\n\tDELETE FROM onto_edges\n\tWHERE src_id = any(v_all_ids) OR dst_id = any(v_all_ids);\n\n\tDELETE FROM onto_assignments\n\tWHERE object_id = any(v_all_ids)\n\t\tAND object_kind = any (array['project','plan','task','goal','output','document','requirement','milestone','risk','decision','metric','event']);\n\n\tDELETE FROM onto_permissions\n\tWHERE object_id = any(v_all_ids)\n\t\tAND object_kind = any (array['project','plan','task','goal','output','document','requirement','milestone','risk','decision','metric','event']);\n\n\tDELETE FROM legacy_entity_mappings\n\tWHERE onto_id = any(v_all_ids)\n\t\tAND onto_table = any (array[\n\t\t\t'onto_projects',\n\t\t\t'onto_plans',\n\t\t\t'onto_tasks',\n\t\t\t'onto_goals',\n\t\t\t'onto_outputs',\n\t\t\t'onto_documents',\n\t\t\t'onto_requirements',\n\t\t\t'onto_milestones',\n\t\t\t'onto_risks',\n\t\t\t'onto_decisions',\n\t\t\t'onto_sources',\n\t\t\t'onto_metrics',\n\t\t\t'onto_signals',\n\t\t\t'onto_insights',\n\t\t\t'onto_events'\n\t\t]);\n\n\t-- Delete project-scoped tables\n\tDELETE FROM onto_events WHERE project_id = p_project_id;\n\tDELETE FROM onto_signals WHERE project_id = p_project_id;\n\tDELETE FROM onto_insights WHERE project_id = p_project_id;\n\tDELETE FROM onto_sources WHERE project_id = p_project_id;\n\tDELETE FROM onto_decisions WHERE project_id = p_project_id;\n\tDELETE FROM onto_risks WHERE project_id = p_project_id;\n\tDELETE FROM onto_milestones WHERE project_id = p_project_id;\n\tDELETE FROM onto_metrics WHERE project_id = p_project_id;\n\tDELETE FROM onto_outputs WHERE project_id = p_project_id;\n\tDELETE FROM onto_documents WHERE project_id = p_project_id;\n\tDELETE FROM onto_tasks WHERE project_id = p_project_id;\n\tDELETE FROM onto_plans WHERE project_id = p_project_id;\n\tDELETE FROM onto_requirements WHERE project_id = p_project_id;\n\tDELETE FROM onto_goals WHERE project_id = p_project_id;\n\n\t-- Finally remove the project (project_calendars will cascade)\n\tDELETE FROM onto_projects WHERE id = p_project_id;\nEND;\n$function$\n"
  },
  {
    "args": "",
    "name": "delete_phase_tasks_on_deleted",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.delete_phase_tasks_on_deleted()\n RETURNS trigger\n LANGUAGE plpgsql\nAS $function$\n  BEGIN\n      -- Check if the task is being marked as deleted (from null to timestamp)\n      IF NEW.deleted_at IS NOT NULL AND (OLD.deleted_at IS NULL) THEN\n          -- Delete all related records from phase_tasks table\n          DELETE FROM phase_tasks\n          WHERE task_id = NEW.id;\n\n          -- Log the deletion (optional - remove if not needed)\n          RAISE NOTICE 'Deleted phase_tasks records for deleted task %', NEW.id;\n      END IF;\n\n      -- Return the new record to continue with the update\n      RETURN NEW;\n  END;\n  $function$\n"
  },
  {
    "args": "",
    "name": "delete_phase_tasks_on_insert_deleted",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.delete_phase_tasks_on_insert_deleted()\n RETURNS trigger\n LANGUAGE plpgsql\nAS $function$\n  BEGIN\n      -- If a task is inserted with deleted_at set, delete any phase_tasks\n      IF NEW.deleted_at IS NOT NULL THEN\n          DELETE FROM phase_tasks\n          WHERE task_id = NEW.id;\n\n          -- Log the deletion (optional)\n          RAISE NOTICE 'Deleted phase_tasks records for inserted deleted task %', NEW.id;\n      END IF;\n\n      RETURN NEW;\n  END;\n  $function$\n"
  },
  {
    "args": "p_event_type text, p_event_source text, p_actor_user_id uuid, p_target_user_id uuid, p_payload jsonb, p_metadata jsonb, p_scheduled_for timestamp with time zone",
    "name": "emit_notification_event",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.emit_notification_event(p_event_type text, p_event_source text DEFAULT 'api_action'::text, p_actor_user_id uuid DEFAULT NULL::uuid, p_target_user_id uuid DEFAULT NULL::uuid, p_payload jsonb DEFAULT '{}'::jsonb, p_metadata jsonb DEFAULT '{}'::jsonb, p_scheduled_for timestamp with time zone DEFAULT NULL::timestamp with time zone)\n RETURNS uuid\n LANGUAGE plpgsql\nAS $function$\nDECLARE\n  v_event_id UUID;\n  v_subscription RECORD;\n  v_prefs RECORD;\n  v_push_sub RECORD;\n  v_delivery_id UUID;\n  v_queue_job_id TEXT;\n  v_correlation_id UUID;\n  v_enriched_metadata JSONB;\n  v_is_daily_brief BOOLEAN;\nBEGIN\n  v_is_daily_brief := p_event_type IN ('brief.completed', 'brief.failed');\n\n  -- Extract or generate correlation ID\n  v_correlation_id := COALESCE(\n    (p_metadata->>'correlationId')::UUID,\n    (p_payload->>'correlationId')::UUID,\n    gen_random_uuid()\n  );\n\n  -- Enrich metadata with correlation ID\n  v_enriched_metadata := p_metadata || jsonb_build_object('correlationId', v_correlation_id);\n\n  -- Insert event with correlation ID\n  INSERT INTO notification_events (\n    event_type,\n    event_source,\n    actor_user_id,\n    target_user_id,\n    payload,\n    metadata,\n    correlation_id\n  ) VALUES (\n    p_event_type,\n    p_event_source,\n    p_actor_user_id,\n    p_target_user_id,\n    p_payload,\n    v_enriched_metadata,\n    v_correlation_id\n  ) RETURNING id INTO v_event_id;\n\n  -- Find active subscriptions for this event type (explicit opt-in only)\n  FOR v_subscription IN\n    SELECT * FROM notification_subscriptions\n    WHERE event_type = p_event_type\n      AND is_active = true\n      AND (admin_only IS TRUE OR created_by IS NOT NULL)\n      AND (p_target_user_id IS NULL OR user_id = p_target_user_id)\n  LOOP\n    -- Get user notification preferences (no event_type filter)\n    SELECT * INTO v_prefs\n    FROM user_notification_preferences\n    WHERE user_id = v_subscription.user_id;\n\n    -- If preferences are missing, fail closed\n    IF NOT FOUND THEN\n      RAISE NOTICE 'No preferences found for user %, skipping', v_subscription.user_id;\n      CONTINUE;\n    END IF;\n\n    -- Queue push notifications\n    IF COALESCE(v_prefs.push_enabled, false) THEN\n      FOR v_push_sub IN\n        SELECT * FROM push_subscriptions\n        WHERE user_id = v_subscription.user_id\n          AND is_active = true\n      LOOP\n        INSERT INTO notification_deliveries (\n          event_id,\n          subscription_id,\n          recipient_user_id,\n          channel,\n          channel_identifier,\n          payload,\n          status,\n          correlation_id\n        ) VALUES (\n          v_event_id,\n          v_subscription.id,\n          v_subscription.user_id,\n          'push',\n          v_push_sub.endpoint,\n          p_payload,\n          'pending',\n          v_correlation_id\n        ) RETURNING id INTO v_delivery_id;\n\n        v_queue_job_id := 'notif_' || v_delivery_id || '_' || extract(epoch from now())::bigint;\n        INSERT INTO queue_jobs (\n          user_id,\n          job_type,\n          status,\n          scheduled_for,\n          queue_job_id,\n          metadata\n        ) VALUES (\n          v_subscription.user_id,\n          'send_notification',\n          'pending',\n          COALESCE(p_scheduled_for, NOW()),\n          v_queue_job_id,\n          jsonb_build_object(\n            'event_id', v_event_id,\n            'event_type', p_event_type,\n            'delivery_id', v_delivery_id,\n            'channel', 'push',\n            'correlationId', v_correlation_id\n          )\n        );\n      END LOOP;\n    END IF;\n\n    -- Queue in-app notifications\n    IF COALESCE(v_prefs.in_app_enabled, false) THEN\n      INSERT INTO notification_deliveries (\n        event_id,\n        subscription_id,\n        recipient_user_id,\n        channel,\n        payload,\n        status,\n        correlation_id\n      ) VALUES (\n        v_event_id,\n        v_subscription.id,\n        v_subscription.user_id,\n        'in_app',\n        p_payload,\n        'pending',\n        v_correlation_id\n      ) RETURNING id INTO v_delivery_id;\n\n      v_queue_job_id := 'notif_' || v_delivery_id || '_' || extract(epoch from now())::bigint;\n      INSERT INTO queue_jobs (\n        user_id,\n        job_type,\n        status,\n        scheduled_for,\n        queue_job_id,\n        metadata\n      ) VALUES (\n        v_subscription.user_id,\n        'send_notification',\n        'pending',\n        COALESCE(p_scheduled_for, NOW()),\n        v_queue_job_id,\n        jsonb_build_object(\n          'event_id', v_event_id,\n          'event_type', p_event_type,\n          'delivery_id', v_delivery_id,\n          'channel', 'in_app',\n          'correlationId', v_correlation_id\n        )\n      );\n    END IF;\n\n    -- Queue email notifications\n    IF (\n      (v_is_daily_brief AND COALESCE(v_prefs.should_email_daily_brief, false))\n      OR (NOT v_is_daily_brief AND COALESCE(v_prefs.email_enabled, false))\n    ) THEN\n      INSERT INTO notification_deliveries (\n        event_id,\n        subscription_id,\n        recipient_user_id,\n        channel,\n        payload,\n        status,\n        correlation_id\n      ) VALUES (\n        v_event_id,\n        v_subscription.id,\n        v_subscription.user_id,\n        'email',\n        p_payload,\n        'pending',\n        v_correlation_id\n      ) RETURNING id INTO v_delivery_id;\n\n      v_queue_job_id := 'notif_' || v_delivery_id || '_' || extract(epoch from now())::bigint;\n      INSERT INTO queue_jobs (\n        user_id,\n        job_type,\n        status,\n        scheduled_for,\n        queue_job_id,\n        metadata\n      ) VALUES (\n        v_subscription.user_id,\n        'send_notification',\n        'pending',\n        COALESCE(p_scheduled_for, NOW()),\n        v_queue_job_id,\n        jsonb_build_object(\n          'event_id', v_event_id,\n          'event_type', p_event_type,\n          'delivery_id', v_delivery_id,\n          'channel', 'email',\n          'correlationId', v_correlation_id\n        )\n      );\n    END IF;\n\n    -- Queue SMS notifications\n    IF (\n      (v_is_daily_brief AND COALESCE(v_prefs.should_sms_daily_brief, false))\n      OR (NOT v_is_daily_brief AND COALESCE(v_prefs.sms_enabled, false))\n    ) THEN\n      DECLARE\n        v_sms_prefs RECORD;\n      BEGIN\n        SELECT * INTO v_sms_prefs\n        FROM user_sms_preferences\n        WHERE user_id = v_subscription.user_id\n          AND phone_verified = true\n          AND opted_out = false\n          AND phone_number IS NOT NULL;\n\n        IF FOUND THEN\n          INSERT INTO notification_deliveries (\n            event_id,\n            subscription_id,\n            recipient_user_id,\n            channel,\n            channel_identifier,\n            payload,\n            status,\n            correlation_id\n          ) VALUES (\n            v_event_id,\n            v_subscription.id,\n            v_subscription.user_id,\n            'sms',\n            v_sms_prefs.phone_number,\n            p_payload,\n            'pending',\n            v_correlation_id\n          ) RETURNING id INTO v_delivery_id;\n\n          v_queue_job_id := 'notif_' || v_delivery_id || '_' || extract(epoch from now())::bigint;\n          INSERT INTO queue_jobs (\n            user_id,\n            job_type,\n            status,\n            scheduled_for,\n            queue_job_id,\n            metadata\n          ) VALUES (\n            v_subscription.user_id,\n            'send_notification',\n            'pending',\n            COALESCE(p_scheduled_for, NOW()),\n            v_queue_job_id,\n            jsonb_build_object(\n              'event_id', v_event_id,\n              'event_type', p_event_type,\n              'delivery_id', v_delivery_id,\n              'channel', 'sms',\n              'correlationId', v_correlation_id\n            )\n          );\n        END IF;\n      END;\n    END IF;\n\n  END LOOP;\n\n  RETURN v_event_id;\nEND;\n$function$\n"
  },
  {
    "args": "p_user_id uuid",
    "name": "ensure_actor_for_user",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.ensure_actor_for_user(p_user_id uuid)\n RETURNS uuid\n LANGUAGE plpgsql\n SECURITY DEFINER\nAS $function$\ndeclare\n  v_actor_id uuid;\n  v_user_name text;\n  v_user_email text;\nbegin\n  -- Check if actor already exists\n  select id into v_actor_id\n  from onto_actors\n  where user_id = p_user_id;\n\n  if v_actor_id is not null then\n    return v_actor_id;\n  end if;\n\n  -- Get user info\n  select name, email into v_user_name, v_user_email\n  from public.users\n  where id = p_user_id;\n\n  if v_user_name is null then\n    raise exception 'User not found: %', p_user_id;\n  end if;\n\n  -- Create new actor\n  insert into onto_actors (kind, name, email, user_id)\n  values ('human', coalesce(v_user_name, v_user_email, 'Unknown User'), v_user_email, p_user_id)\n  returning id into v_actor_id;\n\n  return v_actor_id;\nend;\n$function$\n"
  },
  {
    "args": "",
    "name": "ensure_single_active_template",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.ensure_single_active_template()\n RETURNS trigger\n LANGUAGE plpgsql\nAS $function$\r\nBEGIN\r\n    -- If setting a template to in_use = true\r\n    IF NEW.in_use = true AND NEW.project_id IS NOT NULL THEN\r\n        -- Set all other templates for this project to in_use = false\r\n        UPDATE project_brief_templates\r\n        SET in_use = false,\r\n            updated_at = CURRENT_TIMESTAMP\r\n        WHERE project_id = NEW.project_id\r\n          AND user_id = NEW.user_id\r\n          AND id != NEW.id\r\n          AND in_use = true;\r\n    END IF;\r\n    \r\n    RETURN NEW;\r\nEND;\r\n$function$\n"
  },
  {
    "args": "",
    "name": "ensure_user_notification_preferences",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.ensure_user_notification_preferences()\n RETURNS trigger\n LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO 'public'\nAS $function$\nBEGIN\n  INSERT INTO user_notification_preferences (\n    id,\n    user_id,\n    email_enabled,\n    sms_enabled,\n    push_enabled,\n    in_app_enabled,\n    batch_enabled,\n    quiet_hours_enabled,\n    should_email_daily_brief,\n    should_sms_daily_brief,\n    priority,\n    created_at,\n    updated_at\n  )\n  VALUES (\n    gen_random_uuid(),\n    NEW.id,\n    false,   -- email_enabled (explicit opt-in)\n    false,   -- sms_enabled (explicit opt-in)\n    false,   -- push_enabled (explicit opt-in)\n    false,   -- in_app_enabled (explicit opt-in)\n    false,   -- batch_enabled\n    false,   -- quiet_hours_enabled\n    false,   -- should_email_daily_brief (explicit opt-in)\n    false,   -- should_sms_daily_brief (explicit opt-in)\n    'normal',\n    NOW(),\n    NOW()\n  )\n  ON CONFLICT (user_id) DO NOTHING;\n\n  RETURN NEW;\nEXCEPTION\n  WHEN OTHERS THEN\n    RAISE WARNING 'Failed to create notification preferences for user %: %', NEW.id, SQLERRM;\n    RETURN NEW;\nEND;\n$function$\n"
  },
  {
    "args": "p_job_id uuid, p_error_message text, p_retry boolean",
    "name": "fail_queue_job",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.fail_queue_job(p_job_id uuid, p_error_message text, p_retry boolean DEFAULT true)\n RETURNS boolean\n LANGUAGE plpgsql\nAS $function$\nDECLARE\n  v_job RECORD;\n  v_updated INTEGER;\n  v_retry_delay INTEGER;\nBEGIN\n  -- Get current job state\n  SELECT attempts, max_attempts\n  INTO v_job\n  FROM queue_jobs\n  WHERE id = p_job_id;\n\n  IF NOT FOUND THEN\n    RETURN FALSE;\n  END IF;\n\n  -- Calculate exponential backoff: 2^attempts minutes\n  v_retry_delay := POWER(2, COALESCE(v_job.attempts, 0));\n\n  -- Determine if we should retry\n  IF p_retry AND (COALESCE(v_job.attempts, 0) + 1 < COALESCE(v_job.max_attempts, 3)) THEN\n    -- Retry: increment attempts and schedule for later\n    UPDATE queue_jobs\n    SET\n      status = 'pending',\n      attempts = COALESCE(attempts, 0) + 1,\n      error_message = p_error_message,\n      updated_at = NOW(),\n      scheduled_for = NOW() + (v_retry_delay || ' minutes')::INTERVAL\n    WHERE id = p_job_id;\n  ELSE\n    -- Final failure: mark as failed\n    UPDATE queue_jobs\n    SET\n      status = 'failed',\n      attempts = COALESCE(attempts, 0) + 1,\n      error_message = p_error_message,\n      completed_at = NOW(),\n      updated_at = NOW()\n    WHERE id = p_job_id;\n  END IF;\n\n  GET DIAGNOSTICS v_updated = ROW_COUNT;\n  RETURN v_updated > 0;\nEND;\n$function$\n"
  },
  {
    "args": "p_draft_id uuid, p_user_id uuid",
    "name": "finalize_draft_project",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.finalize_draft_project(p_draft_id uuid, p_user_id uuid)\n RETURNS uuid\n LANGUAGE plpgsql\n SECURITY DEFINER\nAS $function$\nDECLARE\n    v_project_id UUID;\n    v_draft RECORD;\n    v_task RECORD;\n    v_new_task_id UUID;\nBEGIN\n    -- Get the draft\n    SELECT * INTO v_draft\n    FROM project_drafts\n    WHERE id = p_draft_id AND user_id = p_user_id;\n\n    IF NOT FOUND THEN\n        RAISE EXCEPTION 'Draft not found or not owned by user';\n    END IF;\n\n    IF v_draft.finalized_project_id IS NOT NULL THEN\n        RAISE EXCEPTION 'Draft already finalized';\n    END IF;\n\n    -- Create the project\n    INSERT INTO projects (\n        user_id, name, slug, description, context, executive_summary,\n        status, tags, start_date, end_date,\n        core_integrity_ideals, core_people_bonds, core_goals_momentum,\n        core_meaning_identity, core_reality_understanding, core_trust_safeguards,\n        core_opportunity_freedom, core_power_resources, core_harmony_integration,\n        calendar_color_id, calendar_settings, calendar_sync_enabled,\n        source, source_metadata\n    )\n    SELECT\n        user_id, name, slug, description, context, executive_summary,\n        status, tags, start_date, end_date,\n        core_integrity_ideals, core_people_bonds, core_goals_momentum,\n        core_meaning_identity, core_reality_understanding, core_trust_safeguards,\n        core_opportunity_freedom, core_power_resources, core_harmony_integration,\n        calendar_color_id, calendar_settings, calendar_sync_enabled,\n        'conversational_agent', jsonb_build_object('draft_id', id)\n    FROM project_drafts\n    WHERE id = p_draft_id\n    RETURNING id INTO v_project_id;\n\n    -- Create tasks from draft_tasks\n    FOR v_task IN\n        SELECT * FROM draft_tasks\n        WHERE draft_project_id = p_draft_id\n        ORDER BY parent_task_id NULLS FIRST -- Parents first\n    LOOP\n        INSERT INTO tasks (\n            user_id, project_id, title, description, details,\n            priority, status, task_type,\n            start_date, duration_minutes,\n            recurrence_pattern, recurrence_ends, recurrence_end_source,\n            task_steps, source, source_calendar_event_id, outdated\n        )\n        VALUES (\n            v_task.user_id, v_project_id, v_task.title, v_task.description, v_task.details,\n            v_task.priority, v_task.status, v_task.task_type,\n            v_task.start_date, v_task.duration_minutes,\n            v_task.recurrence_pattern, v_task.recurrence_ends, v_task.recurrence_end_source,\n            v_task.task_steps, 'conversational_agent', v_task.source_calendar_event_id, v_task.outdated\n        )\n        RETURNING id INTO v_new_task_id;\n\n        -- Update the draft task with finalized ID for reference\n        UPDATE draft_tasks\n        SET finalized_task_id = v_new_task_id\n        WHERE id = v_task.id;\n    END LOOP;\n\n    -- Mark draft as completed\n    UPDATE project_drafts\n    SET\n        completed_at = CURRENT_TIMESTAMP,\n        finalized_project_id = v_project_id\n    WHERE id = p_draft_id;\n\n    RETURN v_project_id;\nEND;\n$function$\n"
  },
  {
    "args": "p_task_id uuid, p_start_date date, p_end_date date",
    "name": "generate_recurring_instances",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.generate_recurring_instances(p_task_id uuid, p_start_date date, p_end_date date)\n RETURNS TABLE(instance_date date)\n LANGUAGE plpgsql\nAS $function$\nDECLARE\n  v_task RECORD;\n  v_current_date DATE;\n  v_pattern TEXT;\nBEGIN\n  -- Get task details\n  SELECT * INTO v_task \n  FROM tasks \n  WHERE id = p_task_id \n    AND task_type = 'recurring';\n  \n  IF NOT FOUND THEN\n    RETURN;\n  END IF;\n  \n  v_pattern := v_task.recurrence_pattern;\n  v_current_date := COALESCE(v_task.start_date::DATE, p_start_date);\n  \n  -- Generate instances based on pattern\n  WHILE v_current_date <= p_end_date LOOP\n    -- Check if date should be included based on pattern\n    IF v_pattern = 'daily' THEN\n      RETURN QUERY SELECT v_current_date;\n    ELSIF v_pattern = 'weekdays' THEN\n      IF EXTRACT(DOW FROM v_current_date) BETWEEN 1 AND 5 THEN\n        RETURN QUERY SELECT v_current_date;\n      END IF;\n    ELSIF v_pattern = 'weekly' THEN\n      IF EXTRACT(DOW FROM v_current_date) = EXTRACT(DOW FROM v_task.start_date::DATE) THEN\n        RETURN QUERY SELECT v_current_date;\n      END IF;\n    ELSIF v_pattern = 'biweekly' THEN\n      IF EXTRACT(DOW FROM v_current_date) = EXTRACT(DOW FROM v_task.start_date::DATE) \n         AND ((v_current_date - v_task.start_date::DATE) / 7) % 2 = 0 THEN\n        RETURN QUERY SELECT v_current_date;\n      END IF;\n    ELSIF v_pattern = 'monthly' THEN\n      IF EXTRACT(DAY FROM v_current_date) = EXTRACT(DAY FROM v_task.start_date::DATE) THEN\n        RETURN QUERY SELECT v_current_date;\n      END IF;\n    ELSIF v_pattern = 'quarterly' THEN\n      IF EXTRACT(DAY FROM v_current_date) = EXTRACT(DAY FROM v_task.start_date::DATE)\n         AND ((EXTRACT(YEAR FROM v_current_date) * 12 + EXTRACT(MONTH FROM v_current_date)) -\n              (EXTRACT(YEAR FROM v_task.start_date::DATE) * 12 + EXTRACT(MONTH FROM v_task.start_date::DATE))) % 3 = 0 THEN\n        RETURN QUERY SELECT v_current_date;\n      END IF;\n    ELSIF v_pattern = 'yearly' THEN\n      IF EXTRACT(MONTH FROM v_current_date) = EXTRACT(MONTH FROM v_task.start_date::DATE)\n         AND EXTRACT(DAY FROM v_current_date) = EXTRACT(DAY FROM v_task.start_date::DATE) THEN\n        RETURN QUERY SELECT v_current_date;\n      END IF;\n    END IF;\n    \n    -- Move to next day\n    v_current_date := v_current_date + INTERVAL '1 day';\n    \n    -- Check recurrence end date\n    IF v_task.recurrence_ends IS NOT NULL AND v_current_date > v_task.recurrence_ends::DATE THEN\n      EXIT;\n    END IF;\n  END LOOP;\nEND;\n$function$\n"
  },
  {
    "args": "length integer",
    "name": "generate_short_code",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.generate_short_code(length integer DEFAULT 6)\n RETURNS text\n LANGUAGE plpgsql\nAS $function$\nDECLARE\n  chars TEXT := 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';\n  result TEXT := '';\n  i INTEGER;\nBEGIN\n  FOR i IN 1..length LOOP\n    result := result || substr(chars, floor(random() * length(chars) + 1)::int, 1);\n  END LOOP;\n  RETURN result;\nEND;\n$function$\n"
  },
  {
    "args": "",
    "name": "generate_tracking_id",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.generate_tracking_id()\n RETURNS trigger\n LANGUAGE plpgsql\nAS $function$\r\nBEGIN\r\n    IF NEW.tracking_id IS NULL AND NEW.tracking_enabled = true THEN\r\n        NEW.tracking_id = encode(gen_random_bytes(16), 'hex');\r\n    END IF;\r\n    RETURN NEW;\r\nEND;\r\n$function$\n"
  },
  {
    "args": "p_start_date timestamp with time zone, p_end_date timestamp with time zone",
    "name": "get_admin_model_breakdown",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.get_admin_model_breakdown(p_start_date timestamp with time zone, p_end_date timestamp with time zone)\n RETURNS TABLE(model character varying, requests bigint, total_cost numeric, total_tokens bigint, avg_response_time integer, success_rate numeric)\n LANGUAGE plpgsql\n SECURITY DEFINER\nAS $function$\r\nBEGIN\r\n  RETURN QUERY\r\n  SELECT\r\n    l.model_used as model,\r\n    COUNT(*)::BIGINT as requests,\r\n    SUM(l.total_cost_usd)::NUMERIC as total_cost,\r\n    SUM(l.total_tokens)::BIGINT as total_tokens,\r\n    AVG(l.response_time_ms)::INTEGER as avg_response_time,\r\n    (COUNT(*) FILTER (WHERE l.status = 'success')::NUMERIC / COUNT(*)::NUMERIC * 100) as success_rate\r\n  FROM llm_usage_logs l\r\n  WHERE l.created_at BETWEEN p_start_date AND p_end_date\r\n  GROUP BY l.model_used\r\n  ORDER BY total_cost DESC;\r\nEND;\r\n$function$\n"
  },
  {
    "args": "p_start_date timestamp with time zone, p_end_date timestamp with time zone",
    "name": "get_admin_operation_breakdown",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.get_admin_operation_breakdown(p_start_date timestamp with time zone, p_end_date timestamp with time zone)\n RETURNS TABLE(operation character varying, requests bigint, total_cost numeric, total_tokens bigint, avg_response_time integer, success_rate numeric)\n LANGUAGE plpgsql\n SECURITY DEFINER\nAS $function$\r\nBEGIN\r\n  RETURN QUERY\r\n  SELECT\r\n    l.operation_type::VARCHAR as operation,\r\n    COUNT(*)::BIGINT as requests,\r\n    SUM(l.total_cost_usd)::NUMERIC as total_cost,\r\n    SUM(l.total_tokens)::BIGINT as total_tokens,\r\n    AVG(l.response_time_ms)::INTEGER as avg_response_time,\r\n    (COUNT(*) FILTER (WHERE l.status = 'success')::NUMERIC / COUNT(*)::NUMERIC * 100) as success_rate\r\n  FROM llm_usage_logs l\r\n  WHERE l.created_at BETWEEN p_start_date AND p_end_date\r\n  GROUP BY l.operation_type\r\n  ORDER BY total_cost DESC;\r\nEND;\r\n$function$\n"
  },
  {
    "args": "p_start_date timestamp with time zone, p_end_date timestamp with time zone, p_limit integer",
    "name": "get_admin_top_users",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.get_admin_top_users(p_start_date timestamp with time zone, p_end_date timestamp with time zone, p_limit integer DEFAULT 20)\n RETURNS TABLE(user_id uuid, email character varying, name character varying, requests bigint, total_cost numeric, total_tokens bigint, avg_response_time integer, last_usage timestamp with time zone)\n LANGUAGE plpgsql\n SECURITY DEFINER\nAS $function$\r\nBEGIN\r\n  RETURN QUERY\r\n  SELECT\r\n    l.user_id,\r\n    u.email::VARCHAR,\r\n    u.name::VARCHAR,\r\n    COUNT(*)::BIGINT as requests,\r\n    SUM(l.total_cost_usd)::NUMERIC as total_cost,\r\n    SUM(l.total_tokens)::BIGINT as total_tokens,\r\n    AVG(l.response_time_ms)::INTEGER as avg_response_time,\r\n    MAX(l.created_at) as last_usage\r\n  FROM llm_usage_logs l\r\n  JOIN users u ON u.id = l.user_id\r\n  WHERE l.created_at BETWEEN p_start_date AND p_end_date\r\n  GROUP BY l.user_id, u.email, u.name\r\n  ORDER BY total_cost DESC\r\n  LIMIT p_limit;\r\nEND;\r\n$function$\n"
  },
  {
    "args": "p_brief_id text",
    "name": "get_brief_email_status",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.get_brief_email_status(p_brief_id text)\n RETURNS TABLE(email_id uuid, status text, sent_at timestamp with time zone, recipient_email text, recipient_status text, opened_at timestamp with time zone, open_count integer)\n LANGUAGE plpgsql\n SECURITY DEFINER\nAS $function$\nBEGIN\n  RETURN QUERY\n  SELECT\n    e.id as email_id,\n    e.status,\n    er.sent_at,\n    er.recipient_email,\n    er.status as recipient_status,\n    er.opened_at,\n    er.open_count\n  FROM emails e\n  LEFT JOIN email_recipients er ON er.email_id = e.id\n  WHERE e.category = 'daily_brief'\n    AND e.template_data->>'brief_id' = p_brief_id\n  ORDER BY e.created_at DESC\n  LIMIT 1;\nEND;\n$function$\n"
  },
  {
    "args": "start_date date, end_date date",
    "name": "get_brief_generation_stats",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.get_brief_generation_stats(start_date date, end_date date)\n RETURNS TABLE(date date, total_briefs bigint, unique_users bigint, avg_briefs_per_user numeric)\n LANGUAGE sql\n STABLE\nAS $function$\n  WITH date_series AS (\n    SELECT generate_series(start_date::date, end_date::date, '1 day'::interval)::date AS date\n  ),\n  brief_counts AS (\n    SELECT\n      brief_date AS date,\n      COUNT(*) AS total_briefs,\n      COUNT(DISTINCT user_id) AS unique_users\n    FROM ontology_daily_briefs\n    WHERE generation_status = 'completed'\n      AND brief_date BETWEEN start_date AND end_date\n    GROUP BY brief_date\n  )\n  SELECT\n    ds.date,\n    COALESCE(bc.total_briefs, 0) AS total_briefs,\n    COALESCE(bc.unique_users, 0) AS unique_users,\n    CASE\n      WHEN COALESCE(bc.unique_users, 0) > 0\n      THEN ROUND((bc.total_briefs::numeric / bc.unique_users)::numeric, 2)\n      ELSE 0\n    END AS avg_briefs_per_user\n  FROM date_series ds\n  LEFT JOIN brief_counts bc ON bc.date = ds.date\n  ORDER BY ds.date;\n$function$\n"
  },
  {
    "args": "start_date date, end_date date",
    "name": "get_daily_active_users",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.get_daily_active_users(start_date date, end_date date)\n RETURNS TABLE(date date, active_users bigint)\n LANGUAGE sql\n STABLE\nAS $function$\n  WITH activity AS (\n    SELECT changed_by AS user_id, created_at::date AS activity_date\n    FROM onto_project_logs\n    WHERE created_at::date BETWEEN start_date AND end_date\n    UNION ALL\n    SELECT user_id, created_at::date AS activity_date\n    FROM ontology_daily_briefs\n    WHERE generation_status = 'completed'\n      AND created_at::date BETWEEN start_date AND end_date\n    UNION ALL\n    SELECT user_id, created_at::date AS activity_date\n    FROM onto_braindumps\n    WHERE created_at::date BETWEEN start_date AND end_date\n    UNION ALL\n    SELECT user_id, created_at::date AS activity_date\n    FROM agent_chat_sessions\n    WHERE created_at::date BETWEEN start_date AND end_date\n  )\n  SELECT\n    activity_date AS date,\n    COUNT(DISTINCT user_id) AS active_users\n  FROM activity\n  WHERE user_id IS NOT NULL\n  GROUP BY activity_date\n  ORDER BY activity_date;\n$function$\n"
  },
  {
    "args": "start_date date, end_date date",
    "name": "get_daily_visitors",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.get_daily_visitors(start_date date, end_date date)\n RETURNS TABLE(date date, visitor_count bigint)\n LANGUAGE plpgsql\nAS $function$\r\nBEGIN\r\n    RETURN QUERY\r\n    WITH date_series AS (\r\n        SELECT generate_series(start_date::DATE, end_date::DATE, '1 day'::INTERVAL)::DATE AS date\r\n    ),\r\n    daily_counts AS (\r\n        SELECT \r\n            DATE(created_at AT TIME ZONE 'UTC') as visit_date,\r\n            COUNT(DISTINCT visitor_id) as visitor_count\r\n        FROM visitors \r\n        WHERE DATE(created_at AT TIME ZONE 'UTC') BETWEEN start_date AND end_date\r\n        GROUP BY DATE(created_at AT TIME ZONE 'UTC')\r\n    )\r\n    SELECT \r\n        ds.date,\r\n        COALESCE(dc.visitor_count, 0) as visitor_count\r\n    FROM date_series ds\r\n    LEFT JOIN daily_counts dc ON ds.date = dc.visit_date\r\n    ORDER BY ds.date ASC;\r\nEND;\r\n$function$\n"
  },
  {
    "args": "p_user_id uuid, p_timezone text, p_date_start date, p_date_end date, p_today date",
    "name": "get_dashboard_data",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.get_dashboard_data(p_user_id uuid, p_timezone text DEFAULT 'UTC'::text, p_date_start date DEFAULT NULL::date, p_date_end date DEFAULT NULL::date, p_today date DEFAULT NULL::date)\n RETURNS json\n LANGUAGE plpgsql\n STABLE SECURITY DEFINER\nAS $function$DECLARE\n  v_result JSON;\n  v_date_start DATE;\n  v_date_end DATE;\n  v_today DATE;\n  v_tomorrow DATE;\n  v_week_end DATE;\nBEGIN\n  -- Set default dates if not provided\n  v_today := COALESCE(p_today, CURRENT_DATE);\n  v_date_start := COALESCE(p_date_start, v_today - INTERVAL '30 days');\n  v_date_end := COALESCE(p_date_end, v_today + INTERVAL '14 days');\n  v_tomorrow := v_today + INTERVAL '1 day';\n  v_week_end := v_today + INTERVAL '7 days';\n\n  -- Build the complete result in a single query\n  SELECT json_build_object(\n    'regular_tasks', (\n      SELECT COALESCE(json_agg(\n        json_build_object(\n          'id', t.id,\n          'title', t.title,\n          'description', t.description,\n          'status', t.status,\n          'priority', t.priority,\n          'task_type', t.task_type,\n          'details', t.details,\n          'start_date', t.start_date,\n          'duration_minutes', t.duration_minutes,\n          'project_id', t.project_id,\n          'created_at', t.created_at,\n          'updated_at', t.updated_at,\n          'recurrence_pattern', t.recurrence_pattern,\n          'project', CASE \n            WHEN p.id IS NOT NULL THEN json_build_object(\n              'id', p.id,\n              'name', p.name,\n              'slug', p.slug,\n              'status', p.status\n            )\n            ELSE NULL\n          END\n        ) ORDER BY t.priority DESC, t.start_date ASC\n      ), '[]'::json)\n      FROM tasks t\n      LEFT JOIN projects p ON t.project_id = p.id\n      WHERE t.user_id = p_user_id\n        AND t.status != 'done'\n        AND t.deleted_at IS NULL\n        AND t.start_date >= v_date_start\n        AND t.start_date <= v_date_end\n    ),\n    \n    'overdue_instances', (\n      SELECT COALESCE(json_agg(\n        json_build_object(\n          'id', ri.id,\n          'task_id', ri.task_id,\n          'instance_date', ri.instance_date,\n          'status', ri.status,\n          'completed_at', ri.completed_at,\n          'user_id', ri.user_id,\n          'created_at', ri.created_at,\n          'updated_at', ri.updated_at,\n          'task', json_build_object(\n            'id', t.id,\n            'title', t.title,\n            'description', t.description,\n            'details', t.details,\n            'status', t.status,\n            'priority', t.priority,\n            'task_type', t.task_type,\n            'start_date', t.start_date,\n            'duration_minutes', t.duration_minutes,\n            'project_id', t.project_id,\n            'created_at', t.created_at,\n            'updated_at', t.updated_at,\n            'recurrence_pattern', t.recurrence_pattern,\n            'recurrence_ends', t.recurrence_ends,\n            'recurrence_end_source', t.recurrence_end_source,\n            'project', CASE \n              WHEN p.id IS NOT NULL THEN json_build_object(\n                'id', p.id,\n                'name', p.name,\n                'slug', p.slug,\n                'description', p.description,\n                'status', p.status\n              )\n              ELSE NULL\n            END,\n            'calendar_events', (\n              SELECT COALESCE(json_agg(\n                json_build_object(\n                  'id', tce.id,\n                  'calendar_event_id', tce.calendar_event_id,\n                  'calendar_id', tce.calendar_id,\n                  'event_start', tce.event_start,\n                  'event_end', tce.event_end,\n                  'event_link', tce.event_link,\n                  'sync_status', tce.sync_status\n                )\n              ), '[]'::json)\n              FROM task_calendar_events tce\n              WHERE tce.task_id = t.id\n            )\n          )\n        ) ORDER BY ri.instance_date DESC\n      ), '[]'::json)\n      FROM recurring_task_instances ri\n      INNER JOIN tasks t ON ri.task_id = t.id\n      LEFT JOIN projects p ON t.project_id = p.id\n      WHERE ri.user_id = p_user_id\n        AND ri.instance_date < v_today\n        AND ri.status IN ('scheduled', 'overdue')\n    ),\n    \n    'week_instances', (\n      SELECT COALESCE(json_agg(\n        json_build_object(\n          'id', ri.id,\n          'task_id', ri.task_id,\n          'instance_date', ri.instance_date,\n          'status', ri.status,\n          'completed_at', ri.completed_at,\n          'user_id', ri.user_id,\n          'created_at', ri.created_at,\n          'updated_at', ri.updated_at,\n          'task', json_build_object(\n            'id', t.id,\n            'title', t.title,\n            'description', t.description,\n            'details', t.details,\n            'status', t.status,\n            'priority', t.priority,\n            'task_type', t.task_type,\n            'start_date', t.start_date,\n            'duration_minutes', t.duration_minutes,\n            'project_id', t.project_id,\n            'created_at', t.created_at,\n            'updated_at', t.updated_at,\n            'recurrence_pattern', t.recurrence_pattern,\n            'recurrence_ends', t.recurrence_ends,\n            'recurrence_end_source', t.recurrence_end_source,\n            'project', CASE \n              WHEN p.id IS NOT NULL THEN json_build_object(\n                'id', p.id,\n                'name', p.name,\n                'slug', p.slug,\n                'description', p.description,\n                'status', p.status\n              )\n              ELSE NULL\n            END,\n            'calendar_events', (\n              SELECT COALESCE(json_agg(\n                json_build_object(\n                  'id', tce.id,\n                  'calendar_event_id', tce.calendar_event_id,\n                  'calendar_id', tce.calendar_id,\n                  'event_start', tce.event_start,\n                  'event_end', tce.event_end,\n                  'event_link', tce.event_link,\n                  'sync_status', tce.sync_status\n                )\n              ), '[]'::json)\n              FROM task_calendar_events tce\n              WHERE tce.task_id = t.id\n            )\n          )\n        ) ORDER BY ri.instance_date ASC\n      ), '[]'::json)\n      FROM recurring_task_instances ri\n      INNER JOIN tasks t ON ri.task_id = t.id\n      LEFT JOIN projects p ON t.project_id = p.id\n      WHERE ri.user_id = p_user_id\n        AND ri.instance_date >= v_today\n        AND ri.instance_date <= v_week_end + INTERVAL '1 day'\n        AND ri.status IN ('scheduled', 'overdue')\n    ),\n    \n    'active_projects', (\n      SELECT COALESCE(json_agg(\n        json_build_object(\n          'id', p.id,\n          'name', p.name,\n          'slug', p.slug,\n          'status', p.status,\n          'updated_at', p.updated_at\n        ) ORDER BY p.updated_at DESC\n      ), '[]'::json)\n      FROM projects p\n      WHERE p.user_id = p_user_id\n        AND p.status = 'active'\n      LIMIT 10\n    ),\n    \n    'dates', json_build_object(\n      'today', v_today,\n      'tomorrow', v_tomorrow,\n      'week_end', v_week_end,\n      'date_start', v_date_start,\n      'date_end', v_date_end\n    ),\n    \n    'stats', json_build_object(\n      'total_tasks', (\n        SELECT COUNT(*)\n        FROM tasks\n        WHERE user_id = p_user_id\n          AND status != 'done'\n          AND deleted_at IS NULL\n          AND start_date BETWEEN v_date_start AND v_date_end\n      ),\n      'overdue_count', (\n        SELECT COUNT(*)\n        FROM tasks\n        WHERE user_id = p_user_id\n          AND status NOT IN ('done')\n          AND deleted_at IS NULL\n          AND start_date < v_today\n      ),\n      'today_count', (\n        SELECT COUNT(*)\n        FROM tasks\n        WHERE user_id = p_user_id\n          AND status != 'done'\n          AND deleted_at IS NULL\n          AND DATE(start_date) = v_today\n      ),\n      'recurring_count', (\n        SELECT COUNT(*)\n        FROM tasks\n        WHERE user_id = p_user_id\n          AND task_type = 'recurring'\n          AND deleted_at IS NULL\n      )\n    )\n  ) INTO v_result;\n\n\n  RETURN v_result;\nEND;$function$\n"
  },
  {
    "args": "user_ids uuid[]",
    "name": "get_latest_ontology_daily_briefs",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.get_latest_ontology_daily_briefs(user_ids uuid[])\n RETURNS TABLE(user_id uuid, brief_date date, generation_completed_at timestamp with time zone)\n LANGUAGE sql\n STABLE\nAS $function$\n\tSELECT DISTINCT ON (user_id)\n\t\tuser_id,\n\t\tbrief_date,\n\t\tgeneration_completed_at\n\tFROM ontology_daily_briefs\n\tWHERE user_id = ANY (user_ids)\n\tORDER BY user_id, brief_date DESC;\n$function$\n"
  },
  {
    "args": "p_delivery_id uuid, p_days_back integer",
    "name": "get_link_click_stats",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.get_link_click_stats(p_delivery_id uuid DEFAULT NULL::uuid, p_days_back integer DEFAULT 7)\n RETURNS TABLE(total_links bigint, total_clicks bigint, unique_clicked_links bigint, click_through_rate numeric)\n LANGUAGE plpgsql\n STABLE\nAS $function$\nBEGIN\n  RETURN QUERY\n  SELECT\n    COUNT(*)::BIGINT as total_links,\n    SUM(click_count)::BIGINT as total_clicks,\n    COUNT(*) FILTER (WHERE click_count > 0)::BIGINT as unique_clicked_links,\n    CASE\n      WHEN COUNT(*) > 0 THEN\n        ROUND(100.0 * COUNT(*) FILTER (WHERE click_count > 0) / COUNT(*), 2)\n      ELSE 0\n    END as click_through_rate\n  FROM notification_tracking_links\n  WHERE\n    (p_delivery_id IS NULL OR delivery_id = p_delivery_id)\n    AND created_at > NOW() - (p_days_back || ' days')::INTERVAL;\nEND;\n$function$\n"
  },
  {
    "args": "",
    "name": "get_migration_platform_lock_status",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.get_migration_platform_lock_status()\n RETURNS TABLE(is_locked boolean, run_id uuid, locked_by uuid, locked_by_email text, locked_at timestamp with time zone, expires_at timestamp with time zone)\n LANGUAGE plpgsql\n SECURITY DEFINER\nAS $function$\nBEGIN\n    RETURN QUERY\n    SELECT\n        (mpl.run_id IS NOT NULL AND mpl.expires_at > NOW()) AS is_locked,\n        mpl.run_id,\n        mpl.locked_by,\n        u.email AS locked_by_email,\n        mpl.locked_at,\n        mpl.expires_at\n    FROM migration_platform_lock mpl\n    LEFT JOIN auth.users u ON u.id = mpl.locked_by\n    WHERE mpl.id = 1;\nEND;\n$function$\n"
  },
  {
    "args": "",
    "name": "get_notification_active_subscriptions",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.get_notification_active_subscriptions()\n RETURNS TABLE(user_id uuid, email text, name text, subscribed_events text[], push_enabled boolean, email_enabled boolean, sms_enabled boolean, in_app_enabled boolean, last_notification_sent timestamp with time zone)\n LANGUAGE plpgsql\nAS $function$\nBEGIN\n  RETURN QUERY\n  SELECT\n    u.id AS user_id,\n    u.email,\n    u.name,\n    ARRAY_AGG(DISTINCT ns.event_type) AS subscribed_events,\n    BOOL_OR(unp.push_enabled) AS push_enabled,\n    BOOL_OR(unp.email_enabled) AS email_enabled,\n    BOOL_OR(unp.sms_enabled) AS sms_enabled,\n    BOOL_OR(unp.in_app_enabled) AS in_app_enabled,\n    MAX(nd.created_at) AS last_notification_sent\n  FROM users u\n  JOIN notification_subscriptions ns ON ns.user_id = u.id\n  LEFT JOIN user_notification_preferences unp ON unp.user_id = u.id AND unp.event_type = ns.event_type\n  LEFT JOIN notification_deliveries nd ON nd.recipient_user_id = u.id\n  WHERE ns.is_active = true\n  GROUP BY u.id, u.email, u.name\n  ORDER BY last_notification_sent DESC NULLS LAST;\nEND;\n$function$\n"
  },
  {
    "args": "p_interval text",
    "name": "get_notification_channel_performance",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.get_notification_channel_performance(p_interval text DEFAULT '7 days'::text)\n RETURNS TABLE(channel text, total_sent bigint, sent bigint, delivered bigint, opened bigint, clicked bigint, failed bigint, success_rate numeric, delivery_rate numeric, open_rate numeric, click_rate numeric, avg_delivery_time_ms numeric)\n LANGUAGE plpgsql\nAS $function$\nBEGIN\n  RETURN QUERY\n  SELECT\n    nd.channel,\n    COUNT(*) AS total_sent,\n    COUNT(*) FILTER (WHERE nd.status = 'sent') AS sent,\n    COUNT(*) FILTER (WHERE nd.status = 'delivered') AS delivered,  -- FIXED\n    COUNT(*) FILTER (WHERE nd.opened_at IS NOT NULL) AS opened,\n    COUNT(*) FILTER (WHERE nd.clicked_at IS NOT NULL) AS clicked,\n    COUNT(*) FILTER (WHERE nd.status = 'failed') AS failed,\n    -- Success rate: % that were sent successfully\n    ROUND(\n      (COUNT(*) FILTER (WHERE nd.status = 'sent')::NUMERIC / NULLIF(COUNT(*)::NUMERIC, 0) * 100),\n      2\n    ) AS success_rate,\n    -- Delivery rate: % that were confirmed delivered (NEW)\n    ROUND(\n      (COUNT(*) FILTER (WHERE nd.status = 'delivered')::NUMERIC / NULLIF(COUNT(*) FILTER (WHERE nd.status = 'sent')::NUMERIC, 0) * 100),\n      2\n    ) AS delivery_rate,\n    -- Open rate: % of sent that were opened\n    ROUND(\n      (COUNT(*) FILTER (WHERE nd.opened_at IS NOT NULL)::NUMERIC / NULLIF(COUNT(*) FILTER (WHERE nd.status = 'sent')::NUMERIC, 0) * 100),\n      2\n    ) AS open_rate,\n    -- Click rate: % of opened that were clicked\n    ROUND(\n      (COUNT(*) FILTER (WHERE nd.clicked_at IS NOT NULL)::NUMERIC / NULLIF(COUNT(*) FILTER (WHERE nd.opened_at IS NOT NULL)::NUMERIC, 0) * 100),\n      2\n    ) AS click_rate,\n    -- Average delivery time with explicit NULL filter (FIXED)\n    ROUND(\n      AVG(EXTRACT(EPOCH FROM (nd.sent_at - nd.created_at)) * 1000) FILTER (WHERE nd.sent_at IS NOT NULL)::NUMERIC,\n      2\n    ) AS avg_delivery_time_ms\n  FROM notification_deliveries nd\n  WHERE nd.created_at > NOW() - p_interval::INTERVAL\n  GROUP BY nd.channel\n  ORDER BY total_sent DESC;\nEND;\n$function$\n"
  },
  {
    "args": "p_interval text, p_granularity text",
    "name": "get_notification_delivery_timeline",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.get_notification_delivery_timeline(p_interval text DEFAULT '7 days'::text, p_granularity text DEFAULT 'day'::text)\n RETURNS TABLE(time_bucket timestamp with time zone, sent bigint, delivered bigint, opened bigint, clicked bigint, failed bigint)\n LANGUAGE plpgsql\nAS $function$\nDECLARE\n  v_trunc_format TEXT;\nBEGIN\n  -- Set truncation format based on granularity\n  v_trunc_format := CASE\n    WHEN p_granularity = 'hour' THEN 'hour'\n    ELSE 'day'\n  END;\n\n  RETURN QUERY\n  EXECUTE format('\n    SELECT\n      DATE_TRUNC(%L, nd.created_at) AS time_bucket,\n      COUNT(*) FILTER (WHERE nd.status = ''sent'') AS sent,\n      COUNT(*) FILTER (WHERE nd.status = ''delivered'') AS delivered,\n      COUNT(*) FILTER (WHERE nd.opened_at IS NOT NULL) AS opened,\n      COUNT(*) FILTER (WHERE nd.clicked_at IS NOT NULL) AS clicked,\n      COUNT(*) FILTER (WHERE nd.status = ''failed'') AS failed\n    FROM notification_deliveries nd\n    WHERE nd.created_at > NOW() - %L::INTERVAL\n    GROUP BY time_bucket\n    ORDER BY time_bucket ASC\n  ', v_trunc_format, p_interval);\nEND;\n$function$\n"
  },
  {
    "args": "p_interval text",
    "name": "get_notification_event_performance",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.get_notification_event_performance(p_interval text DEFAULT '30 days'::text)\n RETURNS TABLE(event_type text, total_events bigint, total_deliveries bigint, unique_subscribers bigint, avg_delivery_time_seconds numeric, open_rate numeric, click_rate numeric)\n LANGUAGE plpgsql\nAS $function$\nBEGIN\n  RETURN QUERY\n  SELECT\n    ne.event_type,\n    COUNT(DISTINCT ne.id) AS total_events,\n    COUNT(nd.id) AS total_deliveries,\n    COUNT(DISTINCT ns.user_id) AS unique_subscribers,\n    -- FIXED: Added explicit NULL filter\n    ROUND(\n      AVG(EXTRACT(EPOCH FROM (nd.sent_at - nd.created_at))) FILTER (WHERE nd.sent_at IS NOT NULL)::NUMERIC,\n      2\n    ) AS avg_delivery_time_seconds,\n    ROUND(\n      (COUNT(*) FILTER (WHERE nd.opened_at IS NOT NULL)::NUMERIC / NULLIF(COUNT(*) FILTER (WHERE nd.status = 'sent')::NUMERIC, 0) * 100),\n      2\n    ) AS open_rate,\n    ROUND(\n      (COUNT(*) FILTER (WHERE nd.clicked_at IS NOT NULL)::NUMERIC / NULLIF(COUNT(*) FILTER (WHERE nd.opened_at IS NOT NULL)::NUMERIC, 0) * 100),\n      2\n    ) AS click_rate\n  FROM notification_events ne\n  LEFT JOIN notification_deliveries nd ON nd.event_id = ne.id\n  LEFT JOIN notification_subscriptions ns ON ns.event_type = ne.event_type\n  WHERE ne.created_at > NOW() - p_interval::INTERVAL\n  GROUP BY ne.event_type\n  ORDER BY total_events DESC;\nEND;\n$function$\n"
  },
  {
    "args": "p_interval text, p_limit integer",
    "name": "get_notification_failed_deliveries",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.get_notification_failed_deliveries(p_interval text DEFAULT '24 hours'::text, p_limit integer DEFAULT 50)\n RETURNS TABLE(delivery_id uuid, event_id uuid, event_type text, channel text, recipient_user_id uuid, recipient_email text, last_error text, attempts integer, max_attempts integer, created_at timestamp with time zone, failed_at timestamp with time zone)\n LANGUAGE plpgsql\nAS $function$\nBEGIN\n  RETURN QUERY\n  SELECT\n    nd.id AS delivery_id,\n    ne.id AS event_id,\n    ne.event_type,\n    nd.channel,\n    nd.recipient_user_id,\n    u.email AS recipient_email,\n    nd.last_error,\n    nd.attempts,\n    nd.max_attempts,\n    nd.created_at,\n    nd.failed_at\n  FROM notification_deliveries nd\n  JOIN notification_events ne ON ne.id = nd.event_id\n  JOIN users u ON u.id = nd.recipient_user_id\n  WHERE nd.status = 'failed'\n    AND nd.created_at > NOW() - p_interval::INTERVAL\n  ORDER BY nd.created_at DESC\n  LIMIT p_limit;\nEND;\n$function$\n"
  },
  {
    "args": "p_interval text, p_offset text",
    "name": "get_notification_overview_metrics",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.get_notification_overview_metrics(p_interval text DEFAULT '7 days'::text, p_offset text DEFAULT NULL::text)\n RETURNS TABLE(total_sent bigint, delivery_success_rate numeric, avg_open_rate numeric, avg_click_rate numeric)\n LANGUAGE plpgsql\nAS $function$\nDECLARE\n  v_start_time TIMESTAMPTZ;\n  v_end_time TIMESTAMPTZ;\nBEGIN\n  -- Calculate time range\n  IF p_offset IS NULL THEN\n    v_end_time := NOW();\n    v_start_time := NOW() - p_interval::INTERVAL;\n  ELSE\n    v_end_time := NOW() - p_offset::INTERVAL;\n    v_start_time := v_end_time - p_interval::INTERVAL;\n  END IF;\n\n  RETURN QUERY\n  SELECT\n    COUNT(*) FILTER (WHERE nd.status = 'sent') AS total_sent,\n    ROUND(\n      (COUNT(*) FILTER (WHERE nd.status = 'sent')::NUMERIC / NULLIF(COUNT(*)::NUMERIC, 0) * 100),\n      2\n    ) AS delivery_success_rate,\n    ROUND(\n      (COUNT(*) FILTER (WHERE nd.opened_at IS NOT NULL)::NUMERIC / NULLIF(COUNT(*) FILTER (WHERE nd.status = 'sent')::NUMERIC, 0) * 100),\n      2\n    ) AS avg_open_rate,\n    ROUND(\n      (COUNT(*) FILTER (WHERE nd.clicked_at IS NOT NULL)::NUMERIC / NULLIF(COUNT(*) FILTER (WHERE nd.opened_at IS NOT NULL)::NUMERIC, 0) * 100),\n      2\n    ) AS avg_click_rate\n  FROM notification_deliveries nd\n  WHERE nd.created_at >= v_start_time\n    AND nd.created_at < v_end_time;\nEND;\n$function$\n"
  },
  {
    "args": "p_project_id uuid, p_actor_id uuid",
    "name": "get_project_full",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.get_project_full(p_project_id uuid, p_actor_id uuid)\n RETURNS jsonb\n LANGUAGE plpgsql\n SECURITY DEFINER\nAS $function$\nDECLARE\n  v_project jsonb;\n  v_result jsonb;\nBEGIN\n  IF NOT current_actor_has_project_access(p_project_id, 'read') THEN\n    RETURN NULL;\n  END IF;\n\n  -- Verify the project exists (exclude soft-deleted projects)\n  SELECT to_jsonb(p.*)\n  INTO v_project\n  FROM onto_projects p\n  WHERE p.id = p_project_id\n    AND p.deleted_at IS NULL;\n\n  IF v_project IS NULL THEN\n    RETURN NULL;\n  END IF;\n\n  SELECT jsonb_build_object(\n    'project', v_project,\n\n    'goals', COALESCE((\n      SELECT jsonb_agg(to_jsonb(g.*) ORDER BY g.created_at)\n      FROM onto_goals g\n      WHERE g.project_id = p_project_id\n        AND g.deleted_at IS NULL\n    ), '[]'::jsonb),\n\n    'requirements', COALESCE((\n      SELECT jsonb_agg(to_jsonb(r.*) ORDER BY r.created_at)\n      FROM onto_requirements r\n      WHERE r.project_id = p_project_id\n        AND r.deleted_at IS NULL\n    ), '[]'::jsonb),\n\n    'plans', COALESCE((\n      SELECT jsonb_agg(to_jsonb(pl.*) ORDER BY pl.created_at)\n      FROM onto_plans pl\n      WHERE pl.project_id = p_project_id\n        AND pl.deleted_at IS NULL\n    ), '[]'::jsonb),\n\n    'tasks', COALESCE((\n      SELECT jsonb_agg(to_jsonb(t.*) ORDER BY t.created_at)\n      FROM onto_tasks t\n      WHERE t.project_id = p_project_id\n        AND t.deleted_at IS NULL\n    ), '[]'::jsonb),\n\n    'outputs', COALESCE((\n      SELECT jsonb_agg(to_jsonb(o.*) ORDER BY o.created_at)\n      FROM onto_outputs o\n      WHERE o.project_id = p_project_id\n        AND o.deleted_at IS NULL\n    ), '[]'::jsonb),\n\n    'documents', COALESCE((\n      SELECT jsonb_agg(to_jsonb(d.*) ORDER BY d.created_at)\n      FROM onto_documents d\n      WHERE d.project_id = p_project_id\n        AND d.deleted_at IS NULL\n    ), '[]'::jsonb),\n\n    'sources', COALESCE((\n      SELECT jsonb_agg(to_jsonb(s.*) ORDER BY s.created_at)\n      FROM onto_sources s\n      WHERE s.project_id = p_project_id\n    ), '[]'::jsonb),\n\n    'milestones', COALESCE((\n      SELECT jsonb_agg(to_jsonb(m.*) ORDER BY m.due_at)\n      FROM onto_milestones m\n      WHERE m.project_id = p_project_id\n        AND m.deleted_at IS NULL\n    ), '[]'::jsonb),\n\n    'risks', COALESCE((\n      SELECT jsonb_agg(to_jsonb(rk.*) ORDER BY rk.created_at)\n      FROM onto_risks rk\n      WHERE rk.project_id = p_project_id\n        AND rk.deleted_at IS NULL\n    ), '[]'::jsonb),\n\n    'decisions', COALESCE((\n      SELECT jsonb_agg(to_jsonb(dc.*) ORDER BY dc.decision_at)\n      FROM onto_decisions dc\n      WHERE dc.project_id = p_project_id\n        AND dc.deleted_at IS NULL\n    ), '[]'::jsonb),\n\n    'metrics', COALESCE((\n      SELECT jsonb_agg(to_jsonb(mt.*) ORDER BY mt.created_at)\n      FROM onto_metrics mt\n      WHERE mt.project_id = p_project_id\n    ), '[]'::jsonb),\n\n    'context_document', (\n      SELECT to_jsonb(d.*)\n      FROM onto_edges e\n      JOIN onto_documents d ON d.id = e.dst_id\n      WHERE e.src_kind = 'project'\n        AND e.src_id = p_project_id\n        AND e.rel = 'has_context_document'\n        AND e.dst_kind = 'document'\n        AND d.deleted_at IS NULL\n      LIMIT 1\n    )\n  )\n  INTO v_result;\n\n  RETURN v_result;\nEND;\n$function$\n"
  },
  {
    "args": "p_token_hash text",
    "name": "get_project_invite_preview",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.get_project_invite_preview(p_token_hash text)\n RETURNS TABLE(invite_id uuid, project_id uuid, project_name text, role_key text, access text, status text, expires_at timestamp with time zone, created_at timestamp with time zone, invitee_email text, invited_by_actor_id uuid, invited_by_name text, invited_by_email text)\n LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO 'public'\nAS $function$\nDECLARE\n  v_invite onto_project_invites%ROWTYPE;\nBEGIN\n  IF p_token_hash IS NULL OR length(trim(p_token_hash)) = 0 THEN\n    RAISE EXCEPTION 'Invite token missing';\n  END IF;\n\n  SELECT * INTO v_invite\n  FROM onto_project_invites\n  WHERE token_hash = p_token_hash;\n\n  IF NOT FOUND THEN\n    RAISE EXCEPTION 'Invite not found';\n  END IF;\n\n  IF v_invite.status = 'pending' AND v_invite.expires_at < now() THEN\n    UPDATE onto_project_invites\n    SET status = 'expired'\n    WHERE id = v_invite.id;\n  END IF;\n\n  RETURN QUERY\n  SELECT\n    i.id,\n    i.project_id,\n    p.name,\n    i.role_key,\n    i.access,\n    i.status,\n    i.expires_at,\n    i.created_at,\n    i.invitee_email,\n    i.invited_by_actor_id,\n    COALESCE(u.name, a.name, u.email, a.email) AS invited_by_name,\n    COALESCE(u.email, a.email) AS invited_by_email\n  FROM onto_project_invites i\n  JOIN onto_projects p ON p.id = i.project_id\n  LEFT JOIN onto_actors a ON a.id = i.invited_by_actor_id\n  LEFT JOIN public.users u ON u.id = a.user_id\n  WHERE i.id = v_invite.id;\nEND;\n$function$\n"
  },
  {
    "args": "p_project_id uuid, p_user_id uuid",
    "name": "get_project_phases_hierarchy",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.get_project_phases_hierarchy(p_project_id uuid, p_user_id uuid DEFAULT NULL::uuid)\n RETURNS json\n LANGUAGE plpgsql\n STABLE SECURITY DEFINER\nAS $function$\nDECLARE\n  v_result JSON;\n  v_project_user_id UUID;\nBEGIN\n  -- Verify project ownership if user_id provided\n  IF p_user_id IS NOT NULL THEN\n    SELECT user_id INTO v_project_user_id\n    FROM projects\n    WHERE id = p_project_id;\n    \n    IF v_project_user_id IS NULL OR v_project_user_id != p_user_id THEN\n      RETURN json_build_object('error', 'Unauthorized', 'phases', '[]'::json);\n    END IF;\n  END IF;\n\n  -- Build the complete phases hierarchy in a single query\n  SELECT json_build_object(\n    'phases', COALESCE(\n      (SELECT json_agg(phase_data ORDER BY phase_data->>'order')\n       FROM (\n         SELECT json_build_object(\n           'id', p.id,\n           'project_id', p.project_id,\n           'user_id', p.user_id,\n           'name', p.name,\n           'description', p.description,\n           'start_date', p.start_date,\n           'end_date', p.end_date,\n           'order', p.order,\n           'created_at', p.created_at,\n           'updated_at', p.updated_at,\n           'tasks', COALESCE(\n             (SELECT json_agg(\n                json_build_object(\n                  'id', t.id,\n                  'title', t.title,\n                  'description', t.description,\n                  'details', t.details,\n                  'status', t.status,\n                  'priority', t.priority,\n                  'task_type', t.task_type,\n                  'start_date', t.start_date,\n                  'deleted_at', t.deleted_at,\n                  'created_at', t.created_at,\n                  'updated_at', t.updated_at,\n                  'project_id', t.project_id,\n                  'completed_at', t.completed_at,\n                  'suggested_start_date', pt.suggested_start_date,\n                  'assignment_reason', pt.assignment_reason,\n                  'calendar_events', COALESCE(\n                    (SELECT json_agg(\n                       json_build_object(\n                         'id', tce.id,\n                         'calendar_event_id', tce.calendar_event_id,\n                         'calendar_id', tce.calendar_id,\n                         'event_start', tce.event_start,\n                         'event_end', tce.event_end,\n                         'event_link', tce.event_link,\n                         'sync_status', tce.sync_status\n                       )\n                     )\n                     FROM task_calendar_events tce\n                     WHERE tce.task_id = t.id\n                    ), '[]'::json\n                  )\n                )\n              )\n              FROM phase_tasks pt\n              INNER JOIN tasks t ON pt.task_id = t.id\n              WHERE pt.phase_id = p.id\n             ), '[]'::json\n           ),\n           'task_count', (\n             SELECT COUNT(*)\n             FROM phase_tasks pt2\n             INNER JOIN tasks t2 ON pt2.task_id = t2.id\n             WHERE pt2.phase_id = p.id\n           ),\n           'completed_tasks', (\n             SELECT COUNT(*)\n             FROM phase_tasks pt3\n             INNER JOIN tasks t3 ON pt3.task_id = t3.id\n             WHERE pt3.phase_id = p.id\n               AND t3.status IN ('done')\n           )\n         ) AS phase_data\n         FROM phases p\n         WHERE p.project_id = p_project_id\n       ) AS phase_subquery\n      ), '[]'::json\n    ),\n    'metadata', json_build_object(\n      'total_phases', (SELECT COUNT(*) FROM phases WHERE project_id = p_project_id),\n      'total_tasks', (\n        SELECT COUNT(DISTINCT pt.task_id)\n        FROM phase_tasks pt\n        INNER JOIN phases p ON pt.phase_id = p.id\n        WHERE p.project_id = p_project_id\n      ),\n      'project_id', p_project_id,\n      'fetched_at', NOW()\n    )\n  ) INTO v_result;\n\n  RETURN v_result;\nEND;\n$function$\n"
  },
  {
    "args": "p_project_id uuid, p_actor_id uuid",
    "name": "get_project_skeleton",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.get_project_skeleton(p_project_id uuid, p_actor_id uuid)\n RETURNS jsonb\n LANGUAGE sql\n STABLE SECURITY DEFINER\nAS $function$\n  SELECT jsonb_build_object(\n    'id', p.id,\n    'name', p.name,\n    'description', p.description,\n    'state_key', p.state_key,\n    'type_key', p.type_key,\n    'next_step_short', p.next_step_short,\n    'next_step_long', p.next_step_long,\n    'next_step_source', p.next_step_source,\n    'next_step_updated_at', p.next_step_updated_at,\n    'created_at', p.created_at,\n    'updated_at', p.updated_at,\n    -- Entity counts using scalar subqueries (filter soft-deleted entities)\n    'task_count', (SELECT count(*) FROM onto_tasks WHERE project_id = p.id AND deleted_at IS NULL),\n    'output_count', (SELECT count(*) FROM onto_outputs WHERE project_id = p.id AND deleted_at IS NULL),\n    'document_count', (SELECT count(*) FROM onto_documents WHERE project_id = p.id AND deleted_at IS NULL),\n    'goal_count', (SELECT count(*) FROM onto_goals WHERE project_id = p.id AND deleted_at IS NULL),\n    'plan_count', (SELECT count(*) FROM onto_plans WHERE project_id = p.id AND deleted_at IS NULL),\n    'milestone_count', (SELECT count(*) FROM onto_milestones WHERE project_id = p.id AND deleted_at IS NULL),\n    'risk_count', (SELECT count(*) FROM onto_risks WHERE project_id = p.id AND deleted_at IS NULL),\n    'decision_count', (SELECT count(*) FROM onto_decisions WHERE project_id = p.id AND deleted_at IS NULL)\n  )\n  FROM onto_projects p\n  WHERE p.id = p_project_id\n    AND p.deleted_at IS NULL\n    AND current_actor_has_project_access(p.id, 'read');\n$function$\n"
  },
  {
    "args": "p_project_id uuid, p_user_id uuid",
    "name": "get_project_statistics",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.get_project_statistics(p_project_id uuid, p_user_id uuid)\n RETURNS json\n LANGUAGE plpgsql\n STABLE SECURITY DEFINER\nAS $function$\nDECLARE\n  v_result JSON;\n  v_project_user_id UUID;\nBEGIN\n  -- Verify project ownership\n  SELECT user_id INTO v_project_user_id\n  FROM projects\n  WHERE id = p_project_id;\n  \n  IF v_project_user_id IS NULL OR v_project_user_id != p_user_id THEN\n    RETURN json_build_object('error', 'Unauthorized');\n  END IF;\n\n  -- Calculate all statistics in a single query\n  SELECT json_build_object(\n    'stats', json_build_object(\n      'total', (\n        SELECT COUNT(*)\n        FROM tasks\n        WHERE project_id = p_project_id\n          AND user_id = p_user_id\n          AND deleted_at IS NULL\n      ),\n      'completed', (\n        SELECT COUNT(*)\n        FROM tasks\n        WHERE project_id = p_project_id\n          AND user_id = p_user_id\n          AND deleted_at IS NULL\n          AND status = 'done'\n      ),\n      'active', (\n        SELECT COUNT(*)\n        FROM tasks\n        WHERE project_id = p_project_id\n          AND user_id = p_user_id\n          AND deleted_at IS NULL\n          AND status != 'done'\n      ),\n      'inProgress', (\n        SELECT COUNT(*)\n        FROM tasks\n        WHERE project_id = p_project_id\n          AND user_id = p_user_id\n          AND deleted_at IS NULL\n          AND status = 'in_progress'\n      ),\n      'blocked', (\n        SELECT COUNT(*)\n        FROM tasks\n        WHERE project_id = p_project_id\n          AND user_id = p_user_id\n          AND deleted_at IS NULL\n          AND status = 'blocked'\n      ),\n      'deleted', (\n        SELECT COUNT(*)\n        FROM tasks\n        WHERE project_id = p_project_id\n          AND user_id = p_user_id\n          AND deleted_at IS NOT NULL\n      ),\n      'scheduled', (\n        SELECT COUNT(DISTINCT t.id)\n        FROM tasks t\n        INNER JOIN task_calendar_events tce ON t.id = tce.task_id\n        WHERE t.project_id = p_project_id\n          AND t.user_id = p_user_id\n          AND t.deleted_at IS NULL\n          AND t.status != 'done'\n          AND tce.sync_status IN ('synced', 'pending')\n      ),\n      'hasPhases', (\n        SELECT COUNT(*) > 0\n        FROM phases\n        WHERE project_id = p_project_id\n      ),\n      'completionRate', (\n        SELECT CASE \n          WHEN COUNT(*) = 0 THEN 0\n          ELSE ROUND((COUNT(*) FILTER (WHERE status = 'done') * 100.0) / COUNT(*))\n        END\n        FROM tasks\n        WHERE project_id = p_project_id\n          AND user_id = p_user_id\n          AND deleted_at IS NULL\n      ),\n      'byPriority', (\n        SELECT json_object_agg(\n          COALESCE(priority::text, 'none'),\n          count\n        )\n        FROM (\n          SELECT priority, COUNT(*) as count\n          FROM tasks\n          WHERE project_id = p_project_id\n            AND user_id = p_user_id\n            AND deleted_at IS NULL\n            AND status != 'done'\n          GROUP BY priority\n        ) priority_counts\n      ),\n      'byStatus', (\n        SELECT json_object_agg(\n          status,\n          count\n        )\n        FROM (\n          SELECT status, COUNT(*) as count\n          FROM tasks\n          WHERE project_id = p_project_id\n            AND user_id = p_user_id\n            AND deleted_at IS NULL\n          GROUP BY status\n        ) status_counts\n      ),\n      'byType', (\n        SELECT json_object_agg(\n          COALESCE(task_type, 'one_off'),\n          count\n        )\n        FROM (\n          SELECT task_type, COUNT(*) as count\n          FROM tasks\n          WHERE project_id = p_project_id\n            AND user_id = p_user_id\n            AND deleted_at IS NULL\n          GROUP BY task_type\n        ) type_counts\n      ),\n      'phasesCount', (\n        SELECT COUNT(*)\n        FROM phases\n        WHERE project_id = p_project_id\n      ),\n      'averageTasksPerPhase', (\n        SELECT CASE\n          WHEN COUNT(DISTINCT p.id) = 0 THEN 0\n          ELSE ROUND(COUNT(pt.task_id)::numeric / COUNT(DISTINCT p.id), 1)\n        END\n        FROM phases p\n        LEFT JOIN phase_tasks pt ON p.id = pt.phase_id\n        WHERE p.project_id = p_project_id\n      )\n    ),\n    'metadata', json_build_object(\n      'project_id', p_project_id,\n      'calculated_at', NOW(),\n      'user_id', p_user_id\n    )\n  ) INTO v_result;\n\n  RETURN v_result;\nEND;\n$function$\n"
  },
  {
    "args": "p_user_id uuid, p_status text, p_search text, p_limit integer, p_offset integer",
    "name": "get_projects_with_stats",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.get_projects_with_stats(p_user_id uuid, p_status text DEFAULT 'all'::text, p_search text DEFAULT ''::text, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0)\n RETURNS json\n LANGUAGE plpgsql\n STABLE SECURITY DEFINER\nAS $function$\nDECLARE\n  v_result JSON;\n  v_total_count INTEGER;\nBEGIN\n  -- Get total count for pagination\n  SELECT COUNT(*)\n  INTO v_total_count\n  FROM projects p\n  WHERE p.user_id = p_user_id\n    AND (p_status = 'all' OR p.status::text = p_status)\n    AND (\n      p_search = '' OR \n      p.name ILIKE '%' || p_search || '%' OR \n      p.description ILIKE '%' || p_search || '%'\n    );\n\n  -- Build the complete result with projects and stats\n  SELECT json_build_object(\n    'projects', COALESCE(\n      (SELECT json_agg(project_data)\n       FROM (\n         SELECT json_build_object(\n           'id', p.id,\n           'user_id', p.user_id,\n           'name', p.name,\n           'slug', p.slug,\n           'description', p.description,\n           'status', p.status,\n           'calendar_color_id', p.calendar_color_id,\n           'start_date', p.start_date,\n           'end_date', p.end_date,\n           'created_at', p.created_at,\n           'updated_at', p.updated_at,\n           'taskStats', json_build_object(\n             'total', (\n               SELECT COUNT(*)\n               FROM tasks t\n               WHERE t.project_id = p.id\n                 AND t.deleted_at IS NULL\n             ),\n             'active', (\n               SELECT COUNT(*)\n               FROM tasks t\n               WHERE t.project_id = p.id\n                 AND t.deleted_at IS NULL\n                 AND t.status IN ('backlog', 'in_progress')\n             ),\n             'completed', (\n               SELECT COUNT(*)\n               FROM tasks t\n               WHERE t.project_id = p.id\n                 AND t.deleted_at IS NULL\n                 AND t.status = 'done'\n             ),\n             'blocked', (\n               SELECT COUNT(*)\n               FROM tasks t\n               WHERE t.project_id = p.id\n                 AND t.deleted_at IS NULL\n                 AND t.status = 'blocked'\n             ),\n             'overdue', (\n               SELECT COUNT(*)\n               FROM tasks t\n               WHERE t.project_id = p.id\n                 AND t.deleted_at IS NULL\n                 AND t.status != 'done'\n                 AND t.start_date < CURRENT_DATE\n             ),\n             'completionRate', (\n               SELECT CASE \n                 WHEN COUNT(*) = 0 THEN 0\n                 ELSE ROUND((COUNT(*) FILTER (WHERE status = 'done') * 100.0) / COUNT(*))\n               END\n               FROM tasks t\n               WHERE t.project_id = p.id\n                 AND t.deleted_at IS NULL\n             ),\n             'highPriorityCount', (\n               SELECT COUNT(*)\n               FROM tasks t\n               WHERE t.project_id = p.id\n                 AND t.deleted_at IS NULL\n                 AND t.status != 'done'\n                 AND t.priority = 'high'\n             ),\n             'recentlyUpdated', (\n               SELECT COUNT(*)\n               FROM tasks t\n               WHERE t.project_id = p.id\n                 AND t.deleted_at IS NULL\n                 AND t.updated_at > NOW() - INTERVAL '7 days'\n             )\n           ),\n           'phaseInfo', json_build_object(\n             'count', (\n               SELECT COUNT(*)\n               FROM phases ph\n               WHERE ph.project_id = p.id\n             ),\n             'activePhase', (\n               SELECT json_build_object(\n                 'id', ph.id,\n                 'name', ph.name,\n                 'start_date', ph.start_date,\n                 'end_date', ph.end_date\n               )\n               FROM phases ph\n               WHERE ph.project_id = p.id\n                 AND ph.start_date <= CURRENT_DATE\n                 AND ph.end_date >= CURRENT_DATE\n               ORDER BY ph.order ASC\n               LIMIT 1\n             )\n           ),\n           'lastActivity', (\n             SELECT MAX(activity_date)\n             FROM (\n               SELECT MAX(t.updated_at) as activity_date\n               FROM tasks t\n               WHERE t.project_id = p.id\n               UNION ALL\n               SELECT MAX(ph.updated_at) as activity_date\n               FROM phases ph\n               WHERE ph.project_id = p.id\n               UNION ALL\n               SELECT p.updated_at as activity_date\n             ) activities\n           ),\n           'sortOrder', CASE p.status::text\n             WHEN 'active' THEN 0\n             WHEN 'paused' THEN 1\n             WHEN 'completed' THEN 2\n             ELSE 3\n           END\n         ) AS project_data\n         FROM projects p\n         WHERE p.user_id = p_user_id\n           AND (p_status = 'all' OR p.status::text = p_status)\n           AND (\n             p_search = '' OR \n             p.name ILIKE '%' || p_search || '%' OR \n             p.description ILIKE '%' || p_search || '%'\n           )\n         ORDER BY \n           CASE p.status::text\n             WHEN 'active' THEN 0\n             WHEN 'paused' THEN 1\n             WHEN 'completed' THEN 2\n             ELSE 3\n           END,\n           p.created_at DESC\n         LIMIT p_limit\n         OFFSET p_offset\n       ) AS projects_subquery\n      ), '[]'::json\n    ),\n    'pagination', json_build_object(\n      'total', v_total_count,\n      'limit', p_limit,\n      'offset', p_offset,\n      'totalPages', CEIL(v_total_count::numeric / p_limit)\n    ),\n    'metadata', json_build_object(\n      'fetched_at', NOW(),\n      'user_id', p_user_id,\n      'filters', json_build_object(\n        'status', p_status,\n        'search', p_search\n      )\n    )\n  ) INTO v_result;\n\n  RETURN v_result;\nEND;\n$function$\n"
  },
  {
    "args": "",
    "name": "get_revenue_metrics",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.get_revenue_metrics()\n RETURNS TABLE(current_mrr numeric, previous_mrr numeric, mrr_growth numeric, total_revenue numeric, average_revenue_per_user numeric, churn_rate numeric, lifetime_value numeric)\n LANGUAGE plpgsql\n SECURITY DEFINER\nAS $function$\r\nDECLARE\r\n  v_current_mrr NUMERIC;\r\n  v_previous_mrr NUMERIC;\r\n  v_total_users BIGINT;\r\n  v_churned_users BIGINT;\r\nBEGIN\r\n  -- Calculate current MRR\r\n  SELECT COALESCE(SUM(\r\n    sp.price_cents / 100.0 / \r\n    CASE sp.billing_interval\r\n      WHEN 'month' THEN 1\r\n      WHEN 'year' THEN 12\r\n      ELSE 1\r\n    END\r\n  ), 0) INTO v_current_mrr\r\n  FROM customer_subscriptions cs\r\n  JOIN subscription_plans sp ON cs.plan_id = sp.id\r\n  WHERE cs.status = 'active';\r\n\r\n  -- Calculate previous month MRR\r\n  SELECT COALESCE(SUM(\r\n    sp.price_cents / 100.0 / \r\n    CASE sp.billing_interval\r\n      WHEN 'month' THEN 1\r\n      WHEN 'year' THEN 12\r\n      ELSE 1\r\n    END\r\n  ), 0) INTO v_previous_mrr\r\n  FROM customer_subscriptions cs\r\n  JOIN subscription_plans sp ON cs.plan_id = sp.id\r\n  WHERE cs.status = 'active' \r\n    AND cs.created_at < date_trunc('month', CURRENT_DATE);\r\n\r\n  -- Calculate total revenue\r\n  SELECT COALESCE(SUM(amount_paid / 100.0), 0)\r\n  FROM invoices\r\n  WHERE status = 'paid'\r\n  INTO total_revenue;\r\n\r\n  -- Calculate active users\r\n  SELECT COUNT(DISTINCT user_id) INTO v_total_users\r\n  FROM customer_subscriptions\r\n  WHERE status = 'active';\r\n\r\n  -- Calculate churned users in last 30 days\r\n  SELECT COUNT(DISTINCT user_id) INTO v_churned_users\r\n  FROM customer_subscriptions\r\n  WHERE status = 'canceled'\r\n    AND canceled_at >= CURRENT_DATE - INTERVAL '30 days';\r\n\r\n  RETURN QUERY\r\n  SELECT\r\n    v_current_mrr AS current_mrr,\r\n    v_previous_mrr AS previous_mrr,\r\n    CASE \r\n      WHEN v_previous_mrr > 0 THEN \r\n        ((v_current_mrr - v_previous_mrr) / v_previous_mrr * 100)\r\n      ELSE 0 \r\n    END AS mrr_growth,\r\n    total_revenue,\r\n    CASE \r\n      WHEN v_total_users > 0 THEN v_current_mrr / v_total_users\r\n      ELSE 0\r\n    END AS average_revenue_per_user,\r\n    CASE \r\n      WHEN v_total_users > 0 THEN (v_churned_users::NUMERIC / v_total_users * 100)\r\n      ELSE 0\r\n    END AS churn_rate,\r\n    CASE \r\n      WHEN v_total_users > 0 AND v_churned_users > 0 THEN\r\n        (v_current_mrr / v_total_users) / (v_churned_users::NUMERIC / v_total_users / 30)\r\n      ELSE 0\r\n    END AS lifetime_value;\r\nEND;\r\n$function$\n"
  },
  {
    "args": "p_user_id uuid, p_start_date timestamp with time zone, p_end_date timestamp with time zone, p_status text",
    "name": "get_scheduled_sms_for_user",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.get_scheduled_sms_for_user(p_user_id uuid, p_start_date timestamp with time zone DEFAULT now(), p_end_date timestamp with time zone DEFAULT NULL::timestamp with time zone, p_status text DEFAULT NULL::text)\n RETURNS TABLE(id uuid, message_content text, message_type text, calendar_event_id text, event_title text, event_start timestamp with time zone, scheduled_for timestamp with time zone, status text, generated_via text, created_at timestamp with time zone)\n LANGUAGE plpgsql\n SECURITY DEFINER\nAS $function$\nBEGIN\n  RETURN QUERY\n  SELECT\n    ssm.id,\n    ssm.message_content,\n    ssm.message_type,\n    ssm.calendar_event_id,\n    ssm.event_title,\n    ssm.event_start,\n    ssm.scheduled_for,\n    ssm.status,\n    ssm.generated_via,\n    ssm.created_at\n  FROM scheduled_sms_messages ssm\n  WHERE\n    ssm.user_id = p_user_id\n    AND ssm.scheduled_for >= p_start_date\n    AND (p_end_date IS NULL OR ssm.scheduled_for <= p_end_date)\n    AND (p_status IS NULL OR ssm.status = p_status)\n  ORDER BY ssm.scheduled_for ASC;\nEND;\n$function$\n"
  },
  {
    "args": "p_start_date date, p_end_date date",
    "name": "get_sms_daily_metrics",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.get_sms_daily_metrics(p_start_date date, p_end_date date)\n RETURNS TABLE(metric_date date, scheduled_count integer, sent_count integer, delivered_count integer, failed_count integer, cancelled_count integer, avg_delivery_time_ms numeric, avg_generation_time_ms numeric, llm_success_count integer, template_fallback_count integer, delivery_success_rate numeric, llm_success_rate numeric, llm_cost_usd numeric, sms_cost_usd numeric, opt_out_count integer, quiet_hours_skip_count integer, daily_limit_hit_count integer, delivery_rate_percent numeric, llm_success_rate_percent numeric, active_users integer)\n LANGUAGE plpgsql\n STABLE SECURITY DEFINER\n SET search_path TO 'public'\nAS $function$\nBEGIN\n  RETURN QUERY\n  SELECT\n    m.metric_date,\n    m.scheduled_count,\n    m.sent_count,\n    m.delivered_count,\n    m.failed_count,\n    m.cancelled_count,\n    m.avg_delivery_time_ms,\n    m.avg_generation_time_ms,\n    m.llm_success_count,\n    m.template_fallback_count,\n    m.delivery_success_rate,\n    m.llm_success_rate,\n    m.llm_cost_usd,\n    m.sms_cost_usd,\n    m.opt_out_count,\n    m.quiet_hours_skip_count,\n    m.daily_limit_hit_count,\n    m.delivery_rate_percent,\n    m.llm_success_rate_percent,\n    m.active_users\n  FROM sms_metrics_daily m\n  WHERE m.metric_date >= p_start_date\n    AND m.metric_date <= p_end_date\n  ORDER BY m.metric_date DESC;\nEND;\n$function$\n"
  },
  {
    "args": "",
    "name": "get_sms_notification_stats",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.get_sms_notification_stats()\n RETURNS TABLE(total_users_with_phone bigint, users_phone_verified bigint, users_sms_enabled bigint, users_opted_out bigint, phone_verification_rate numeric, sms_adoption_rate numeric, opt_out_rate numeric, total_sms_sent_24h bigint, sms_delivery_rate_24h numeric, avg_sms_delivery_time_seconds numeric)\n LANGUAGE plpgsql\n STABLE\nAS $function$\nBEGIN\n  RETURN QUERY\n  WITH sms_prefs AS (\n    SELECT\n      COUNT(*) FILTER (WHERE phone_number IS NOT NULL) AS with_phone,\n      COUNT(*) FILTER (WHERE phone_verified = true) AS verified,\n      COUNT(*) FILTER (WHERE phone_verified = true) AS enabled,  -- Assuming verified = enabled\n      COUNT(*) FILTER (WHERE opted_out = true) AS opted_out\n    FROM user_sms_preferences\n  ),\n  sms_24h AS (\n    SELECT\n      COUNT(*) AS sent_count,\n      COUNT(*) FILTER (WHERE status = 'delivered') AS delivered_count,\n      -- FIXED: Added explicit NULL filter for delivered_at\n      AVG(EXTRACT(EPOCH FROM (delivered_at - created_at))) FILTER (WHERE delivered_at IS NOT NULL AND status = 'delivered') AS avg_delivery_seconds\n    FROM notification_deliveries\n    WHERE channel = 'sms'\n      AND created_at >= NOW() - INTERVAL '24 hours'\n  )\n  SELECT\n    (SELECT with_phone FROM sms_prefs),\n    (SELECT verified FROM sms_prefs),\n    (SELECT enabled FROM sms_prefs),\n    (SELECT opted_out FROM sms_prefs),\n    ROUND(\n      (SELECT verified FROM sms_prefs)::NUMERIC / NULLIF((SELECT with_phone FROM sms_prefs)::NUMERIC, 0) * 100,\n      2\n    ),\n    ROUND(\n      (SELECT enabled FROM sms_prefs)::NUMERIC / NULLIF((SELECT verified FROM sms_prefs)::NUMERIC, 0) * 100,\n      2\n    ),\n    ROUND(\n      (SELECT opted_out FROM sms_prefs)::NUMERIC / NULLIF((SELECT verified FROM sms_prefs)::NUMERIC, 0) * 100,\n      2\n    ),\n    (SELECT sent_count FROM sms_24h),\n    ROUND(\n      (SELECT delivered_count FROM sms_24h)::NUMERIC / NULLIF((SELECT sent_count FROM sms_24h)::NUMERIC, 0) * 100,\n      2\n    ),\n    (SELECT avg_delivery_seconds FROM sms_24h)::NUMERIC;\nEND;\n$function$\n"
  },
  {
    "args": "",
    "name": "get_subscription_overview",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.get_subscription_overview()\n RETURNS TABLE(total_subscribers bigint, active_subscriptions bigint, trial_subscriptions bigint, canceled_subscriptions bigint, paused_subscriptions bigint, mrr numeric, arr numeric)\n LANGUAGE plpgsql\n SECURITY DEFINER\nAS $function$\r\nBEGIN\r\n  RETURN QUERY\r\n  SELECT\r\n    COUNT(DISTINCT user_id) AS total_subscribers,\r\n    COUNT(*) FILTER (WHERE status = 'active') AS active_subscriptions,\r\n    COUNT(*) FILTER (WHERE status = 'trialing') AS trial_subscriptions,\r\n    COUNT(*) FILTER (WHERE status = 'canceled') AS canceled_subscriptions,\r\n    COUNT(*) FILTER (WHERE status = 'paused') AS paused_subscriptions,\r\n    COALESCE(SUM(\r\n      CASE \r\n        WHEN status = 'active' THEN \r\n          sp.price_cents / 100.0 / \r\n          CASE sp.billing_interval\r\n            WHEN 'month' THEN 1\r\n            WHEN 'year' THEN 12\r\n            ELSE 1\r\n          END\r\n        ELSE 0\r\n      END\r\n    ), 0) AS mrr,\r\n    COALESCE(SUM(\r\n      CASE \r\n        WHEN status = 'active' THEN \r\n          sp.price_cents / 100.0 / \r\n          CASE sp.billing_interval\r\n            WHEN 'month' THEN 1\r\n            WHEN 'year' THEN 12\r\n            ELSE 1\r\n          END\r\n        ELSE 0\r\n      END\r\n    ) * 12, 0) AS arr\r\n  FROM customer_subscriptions cs\r\n  LEFT JOIN subscription_plans sp ON cs.plan_id = sp.id;\r\nEND;\r\n$function$\n"
  },
  {
    "args": "",
    "name": "get_user_engagement_metrics",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.get_user_engagement_metrics()\n RETURNS TABLE(total_users bigint, active_users_7d bigint, active_users_30d bigint, total_briefs bigint, avg_brief_length numeric, top_active_users json)\n LANGUAGE sql\n STABLE\nAS $function$\n  WITH activity AS (\n    SELECT changed_by AS user_id, created_at\n    FROM onto_project_logs\n    WHERE created_at >= CURRENT_DATE - INTERVAL '30 days'\n    UNION ALL\n    SELECT user_id, created_at\n    FROM ontology_daily_briefs\n    WHERE generation_status = 'completed'\n      AND created_at >= CURRENT_DATE - INTERVAL '30 days'\n    UNION ALL\n    SELECT user_id, created_at\n    FROM onto_braindumps\n    WHERE created_at >= CURRENT_DATE - INTERVAL '30 days'\n    UNION ALL\n    SELECT user_id, created_at\n    FROM agent_chat_sessions\n    WHERE created_at >= CURRENT_DATE - INTERVAL '30 days'\n  ),\n  top_users AS (\n    SELECT\n      u.email,\n      COUNT(db.id) AS brief_count,\n      MAX(db.created_at) AS last_brief\n    FROM users u\n    LEFT JOIN ontology_daily_briefs db\n      ON u.id = db.user_id\n      AND db.generation_status = 'completed'\n      AND db.created_at >= CURRENT_DATE - INTERVAL '30 days'\n    GROUP BY u.id, u.email\n    ORDER BY brief_count DESC\n    LIMIT 10\n  )\n  SELECT\n    (SELECT COUNT(*) FROM users) AS total_users,\n    (SELECT COUNT(DISTINCT user_id) FROM activity\n      WHERE created_at >= CURRENT_DATE - INTERVAL '7 days') AS active_users_7d,\n    (SELECT COUNT(DISTINCT user_id) FROM activity\n      WHERE created_at >= CURRENT_DATE - INTERVAL '30 days') AS active_users_30d,\n    (SELECT COUNT(*) FROM ontology_daily_briefs\n      WHERE generation_status = 'completed') AS total_briefs,\n    (SELECT ROUND(AVG(LENGTH(COALESCE(executive_summary, ''))))::numeric\n      FROM ontology_daily_briefs\n      WHERE generation_status = 'completed') AS avg_brief_length,\n    (SELECT json_agg(row_to_json(t)) FROM top_users t) AS top_active_users;\n$function$\n"
  },
  {
    "args": "p_user_id uuid, p_start_date timestamp with time zone, p_end_date timestamp with time zone",
    "name": "get_user_llm_usage",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.get_user_llm_usage(p_user_id uuid, p_start_date timestamp with time zone, p_end_date timestamp with time zone)\n RETURNS TABLE(total_requests bigint, total_cost numeric, total_tokens bigint, avg_response_time numeric, by_operation jsonb, by_model jsonb)\n LANGUAGE plpgsql\n SECURITY DEFINER\nAS $function$\r\nDECLARE\r\n  v_total_requests BIGINT;\r\n  v_total_cost NUMERIC;\r\n  v_total_tokens BIGINT;\r\n  v_avg_response_time NUMERIC;\r\n  v_by_operation JSONB;\r\n  v_by_model JSONB;\r\nBEGIN\r\n  -- Get overall stats\r\n  SELECT\r\n    COUNT(*)::BIGINT,\r\n    COALESCE(SUM(l.total_cost_usd), 0)::NUMERIC,\r\n    COALESCE(SUM(l.total_tokens), 0)::BIGINT,\r\n    COALESCE(AVG(l.response_time_ms), 0)::NUMERIC\r\n  INTO v_total_requests, v_total_cost, v_total_tokens, v_avg_response_time\r\n  FROM llm_usage_logs l\r\n  WHERE l.user_id = p_user_id\r\n    AND l.created_at BETWEEN p_start_date AND p_end_date;\r\n\r\n  -- Get breakdown by operation\r\n  SELECT COALESCE(\r\n    jsonb_object_agg(\r\n      operation_type::text,\r\n      jsonb_build_object(\r\n        'requests', requests,\r\n        'cost', cost,\r\n        'tokens', tokens\r\n      )\r\n    ),\r\n    '{}'::jsonb\r\n  )\r\n  INTO v_by_operation\r\n  FROM (\r\n    SELECT\r\n      l.operation_type,\r\n      COUNT(*) as requests,\r\n      SUM(l.total_cost_usd) as cost,\r\n      SUM(l.total_tokens) as tokens\r\n    FROM llm_usage_logs l\r\n    WHERE l.user_id = p_user_id\r\n      AND l.created_at BETWEEN p_start_date AND p_end_date\r\n    GROUP BY l.operation_type\r\n  ) op_stats;\r\n\r\n  -- Get breakdown by model\r\n  SELECT COALESCE(\r\n    jsonb_object_agg(\r\n      model_used,\r\n      jsonb_build_object(\r\n        'requests', requests,\r\n        'cost', cost,\r\n        'tokens', tokens\r\n      )\r\n    ),\r\n    '{}'::jsonb\r\n  )\r\n  INTO v_by_model\r\n  FROM (\r\n    SELECT\r\n      l.model_used,\r\n      COUNT(*) as requests,\r\n      SUM(l.total_cost_usd) as cost,\r\n      SUM(l.total_tokens) as tokens\r\n    FROM llm_usage_logs l\r\n    WHERE l.user_id = p_user_id\r\n      AND l.created_at BETWEEN p_start_date AND p_end_date\r\n    GROUP BY l.model_used\r\n  ) model_stats;\r\n\r\n  -- Return single row with all computed values\r\n  RETURN QUERY\r\n  SELECT\r\n    v_total_requests,\r\n    v_total_cost,\r\n    v_total_tokens,\r\n    v_avg_response_time,\r\n    v_by_operation,\r\n    v_by_model;\r\nEND;\r\n$function$\n"
  },
  {
    "args": "p_user_id uuid, p_days integer",
    "name": "get_user_sms_metrics",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.get_user_sms_metrics(p_user_id uuid, p_days integer DEFAULT 30)\n RETURNS TABLE(metric_date date, scheduled_count integer, sent_count integer, delivered_count integer, failed_count integer, llm_cost_usd numeric, delivery_rate numeric)\n LANGUAGE plpgsql\n STABLE SECURITY DEFINER\n SET search_path TO 'public'\nAS $function$\nBEGIN\n  RETURN QUERY\n  SELECT\n    m.metric_date,\n    COALESCE(SUM(CASE WHEN m.metric_type = 'scheduled_count' THEN m.metric_value ELSE 0 END), 0)::INTEGER as scheduled_count,\n    COALESCE(SUM(CASE WHEN m.metric_type = 'sent_count' THEN m.metric_value ELSE 0 END), 0)::INTEGER as sent_count,\n    COALESCE(SUM(CASE WHEN m.metric_type = 'delivered_count' THEN m.metric_value ELSE 0 END), 0)::INTEGER as delivered_count,\n    COALESCE(SUM(CASE WHEN m.metric_type = 'failed_count' THEN m.metric_value ELSE 0 END), 0)::INTEGER as failed_count,\n    COALESCE(SUM(CASE WHEN m.metric_type = 'llm_cost_usd' THEN m.metric_value ELSE 0 END), 0)::NUMERIC(10, 6) as llm_cost_usd,\n    CASE\n      WHEN SUM(CASE WHEN m.metric_type = 'sent_count' THEN m.metric_value ELSE 0 END) > 0\n      THEN (SUM(CASE WHEN m.metric_type = 'delivered_count' THEN m.metric_value ELSE 0 END)::NUMERIC /\n            SUM(CASE WHEN m.metric_type = 'sent_count' THEN m.metric_value ELSE 0 END) * 100)\n      ELSE 0\n    END::NUMERIC(5, 2) as delivery_rate\n  FROM sms_metrics m\n  WHERE m.user_id = p_user_id\n    AND m.metric_hour IS NULL  -- Only daily metrics\n    AND m.metric_date >= CURRENT_DATE - (p_days || ' days')::INTERVAL\n  GROUP BY m.metric_date\n  ORDER BY m.metric_date DESC;\nEND;\n$function$\n"
  },
  {
    "args": "user_uuid uuid",
    "name": "get_user_subscription_status",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.get_user_subscription_status(user_uuid uuid)\n RETURNS TABLE(has_subscription boolean, subscription_status text, current_period_end timestamp with time zone, is_beta_user boolean)\n LANGUAGE plpgsql\n SECURITY DEFINER\nAS $function$\r\nBEGIN\r\n    RETURN QUERY\r\n    SELECT \r\n        COALESCE(cs.status IN ('active', 'trialing'), false) as has_subscription,\r\n        COALESCE(cs.status, 'free') as subscription_status,\r\n        cs.current_period_end,\r\n        EXISTS (\r\n            SELECT 1 FROM user_discounts ud\r\n            JOIN discount_codes dc ON ud.discount_code_id = dc.id\r\n            WHERE ud.user_id = user_uuid\r\n            AND dc.metadata->>'type' = 'beta_user'\r\n        ) as is_beta_user\r\n    FROM users u\r\n    LEFT JOIN customer_subscriptions cs ON u.id = cs.user_id\r\n        AND cs.status IN ('active', 'trialing', 'past_due')\r\n    WHERE u.id = user_uuid\r\n    ORDER BY cs.created_at DESC\r\n    LIMIT 1;\r\nEND;\r\n$function$\n"
  },
  {
    "args": "p_user_id uuid",
    "name": "get_user_trial_status",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.get_user_trial_status(p_user_id uuid)\n RETURNS TABLE(is_in_trial boolean, is_trial_expired boolean, is_in_grace_period boolean, days_until_trial_end integer, trial_end_date timestamp with time zone, has_active_subscription boolean, is_read_only boolean)\n LANGUAGE plpgsql\n SECURITY DEFINER\nAS $function$\r\nDECLARE\r\n  v_user RECORD;\r\n  v_grace_period_days INTEGER := 7;\r\nBEGIN\r\n  -- Get user data\r\n  SELECT \r\n    u.trial_ends_at,\r\n    u.subscription_status,\r\n    EXISTS(\r\n      SELECT 1 FROM customer_subscriptions cs\r\n      WHERE cs.user_id = u.id\r\n      AND cs.status = 'active'\r\n    ) as has_active_sub\r\n  INTO v_user\r\n  FROM users u\r\n  WHERE u.id = p_user_id;\r\n\r\n  -- Calculate trial status\r\n  RETURN QUERY\r\n  SELECT\r\n    -- Is in trial\r\n    CASE \r\n      WHEN v_user.trial_ends_at IS NULL THEN FALSE\r\n      WHEN v_user.has_active_sub THEN FALSE\r\n      WHEN v_user.trial_ends_at > NOW() THEN TRUE\r\n      ELSE FALSE\r\n    END as is_in_trial,\r\n    \r\n    -- Is trial expired (past grace period)\r\n    CASE\r\n      WHEN v_user.trial_ends_at IS NULL THEN FALSE\r\n      WHEN v_user.has_active_sub THEN FALSE\r\n      WHEN v_user.trial_ends_at + (v_grace_period_days || ' days')::INTERVAL < NOW() THEN TRUE\r\n      ELSE FALSE\r\n    END as is_trial_expired,\r\n    \r\n    -- Is in grace period\r\n    CASE\r\n      WHEN v_user.trial_ends_at IS NULL THEN FALSE\r\n      WHEN v_user.has_active_sub THEN FALSE\r\n      WHEN v_user.trial_ends_at < NOW() \r\n        AND v_user.trial_ends_at + (v_grace_period_days || ' days')::INTERVAL >= NOW() THEN TRUE\r\n      ELSE FALSE\r\n    END as is_in_grace_period,\r\n    \r\n    -- Days until trial end\r\n    CASE\r\n      WHEN v_user.trial_ends_at IS NULL THEN 0\r\n      WHEN v_user.has_active_sub THEN 0\r\n      ELSE GREATEST(0, EXTRACT(DAY FROM v_user.trial_ends_at - NOW())::INTEGER)\r\n    END as days_until_trial_end,\r\n    \r\n    -- Trial end date\r\n    v_user.trial_ends_at,\r\n    \r\n    -- Has active subscription\r\n    v_user.has_active_sub,\r\n    \r\n    -- Is read only (trial expired or in grace period without subscription)\r\n    CASE\r\n      WHEN v_user.has_active_sub THEN FALSE\r\n      WHEN v_user.trial_ends_at IS NULL THEN FALSE\r\n      WHEN v_user.trial_ends_at < NOW() THEN TRUE\r\n      ELSE FALSE\r\n    END as is_read_only;\r\nEND;\r\n$function$\n"
  },
  {
    "args": "",
    "name": "get_visitor_overview",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.get_visitor_overview()\n RETURNS TABLE(total_visitors bigint, visitors_7d bigint, visitors_30d bigint, unique_visitors_today bigint)\n LANGUAGE plpgsql\nAS $function$\r\nBEGIN\r\n    RETURN QUERY\r\n    SELECT \r\n        (SELECT COUNT(DISTINCT visitor_id) FROM visitors) as total_visitors,\r\n        (SELECT COUNT(DISTINCT visitor_id) FROM visitors \r\n         WHERE created_at >= NOW() - INTERVAL '7 days') as visitors_7d,\r\n        (SELECT COUNT(DISTINCT visitor_id) FROM visitors \r\n         WHERE created_at >= NOW() - INTERVAL '30 days') as visitors_30d,\r\n        (SELECT COUNT(DISTINCT visitor_id) FROM visitors \r\n         WHERE DATE(created_at AT TIME ZONE 'UTC') = CURRENT_DATE) as unique_visitors_today;\r\nEND;\r\n$function$\n"
  },
  {
    "args": "internal, smallint, anyelement, integer, internal, internal",
    "name": "gin_btree_consistent",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.gin_btree_consistent(internal, smallint, anyelement, integer, internal, internal)\n RETURNS boolean\n LANGUAGE c\n IMMUTABLE STRICT\nAS '$libdir/btree_gin', $function$gin_btree_consistent$function$\n"
  },
  {
    "args": "anyenum, anyenum, smallint, internal",
    "name": "gin_compare_prefix_anyenum",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.gin_compare_prefix_anyenum(anyenum, anyenum, smallint, internal)\n RETURNS integer\n LANGUAGE c\n IMMUTABLE STRICT\nAS '$libdir/btree_gin', $function$gin_compare_prefix_anyenum$function$\n"
  },
  {
    "args": "bit, bit, smallint, internal",
    "name": "gin_compare_prefix_bit",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.gin_compare_prefix_bit(bit, bit, smallint, internal)\n RETURNS integer\n LANGUAGE c\n IMMUTABLE STRICT\nAS '$libdir/btree_gin', $function$gin_compare_prefix_bit$function$\n"
  },
  {
    "args": "boolean, boolean, smallint, internal",
    "name": "gin_compare_prefix_bool",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.gin_compare_prefix_bool(boolean, boolean, smallint, internal)\n RETURNS integer\n LANGUAGE c\n IMMUTABLE STRICT\nAS '$libdir/btree_gin', $function$gin_compare_prefix_bool$function$\n"
  },
  {
    "args": "character, character, smallint, internal",
    "name": "gin_compare_prefix_bpchar",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.gin_compare_prefix_bpchar(character, character, smallint, internal)\n RETURNS integer\n LANGUAGE c\n IMMUTABLE STRICT\nAS '$libdir/btree_gin', $function$gin_compare_prefix_bpchar$function$\n"
  },
  {
    "args": "bytea, bytea, smallint, internal",
    "name": "gin_compare_prefix_bytea",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.gin_compare_prefix_bytea(bytea, bytea, smallint, internal)\n RETURNS integer\n LANGUAGE c\n IMMUTABLE STRICT\nAS '$libdir/btree_gin', $function$gin_compare_prefix_bytea$function$\n"
  },
  {
    "args": "\"char\", \"char\", smallint, internal",
    "name": "gin_compare_prefix_char",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.gin_compare_prefix_char(\"char\", \"char\", smallint, internal)\n RETURNS integer\n LANGUAGE c\n IMMUTABLE STRICT\nAS '$libdir/btree_gin', $function$gin_compare_prefix_char$function$\n"
  },
  {
    "args": "cidr, cidr, smallint, internal",
    "name": "gin_compare_prefix_cidr",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.gin_compare_prefix_cidr(cidr, cidr, smallint, internal)\n RETURNS integer\n LANGUAGE c\n IMMUTABLE STRICT\nAS '$libdir/btree_gin', $function$gin_compare_prefix_cidr$function$\n"
  },
  {
    "args": "date, date, smallint, internal",
    "name": "gin_compare_prefix_date",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.gin_compare_prefix_date(date, date, smallint, internal)\n RETURNS integer\n LANGUAGE c\n IMMUTABLE STRICT\nAS '$libdir/btree_gin', $function$gin_compare_prefix_date$function$\n"
  },
  {
    "args": "real, real, smallint, internal",
    "name": "gin_compare_prefix_float4",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.gin_compare_prefix_float4(real, real, smallint, internal)\n RETURNS integer\n LANGUAGE c\n IMMUTABLE STRICT\nAS '$libdir/btree_gin', $function$gin_compare_prefix_float4$function$\n"
  },
  {
    "args": "double precision, double precision, smallint, internal",
    "name": "gin_compare_prefix_float8",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.gin_compare_prefix_float8(double precision, double precision, smallint, internal)\n RETURNS integer\n LANGUAGE c\n IMMUTABLE STRICT\nAS '$libdir/btree_gin', $function$gin_compare_prefix_float8$function$\n"
  },
  {
    "args": "inet, inet, smallint, internal",
    "name": "gin_compare_prefix_inet",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.gin_compare_prefix_inet(inet, inet, smallint, internal)\n RETURNS integer\n LANGUAGE c\n IMMUTABLE STRICT\nAS '$libdir/btree_gin', $function$gin_compare_prefix_inet$function$\n"
  },
  {
    "args": "smallint, smallint, smallint, internal",
    "name": "gin_compare_prefix_int2",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.gin_compare_prefix_int2(smallint, smallint, smallint, internal)\n RETURNS integer\n LANGUAGE c\n IMMUTABLE STRICT\nAS '$libdir/btree_gin', $function$gin_compare_prefix_int2$function$\n"
  },
  {
    "args": "integer, integer, smallint, internal",
    "name": "gin_compare_prefix_int4",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.gin_compare_prefix_int4(integer, integer, smallint, internal)\n RETURNS integer\n LANGUAGE c\n IMMUTABLE STRICT\nAS '$libdir/btree_gin', $function$gin_compare_prefix_int4$function$\n"
  },
  {
    "args": "bigint, bigint, smallint, internal",
    "name": "gin_compare_prefix_int8",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.gin_compare_prefix_int8(bigint, bigint, smallint, internal)\n RETURNS integer\n LANGUAGE c\n IMMUTABLE STRICT\nAS '$libdir/btree_gin', $function$gin_compare_prefix_int8$function$\n"
  },
  {
    "args": "interval, interval, smallint, internal",
    "name": "gin_compare_prefix_interval",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.gin_compare_prefix_interval(interval, interval, smallint, internal)\n RETURNS integer\n LANGUAGE c\n IMMUTABLE STRICT\nAS '$libdir/btree_gin', $function$gin_compare_prefix_interval$function$\n"
  },
  {
    "args": "macaddr, macaddr, smallint, internal",
    "name": "gin_compare_prefix_macaddr",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.gin_compare_prefix_macaddr(macaddr, macaddr, smallint, internal)\n RETURNS integer\n LANGUAGE c\n IMMUTABLE STRICT\nAS '$libdir/btree_gin', $function$gin_compare_prefix_macaddr$function$\n"
  },
  {
    "args": "macaddr8, macaddr8, smallint, internal",
    "name": "gin_compare_prefix_macaddr8",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.gin_compare_prefix_macaddr8(macaddr8, macaddr8, smallint, internal)\n RETURNS integer\n LANGUAGE c\n IMMUTABLE STRICT\nAS '$libdir/btree_gin', $function$gin_compare_prefix_macaddr8$function$\n"
  },
  {
    "args": "money, money, smallint, internal",
    "name": "gin_compare_prefix_money",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.gin_compare_prefix_money(money, money, smallint, internal)\n RETURNS integer\n LANGUAGE c\n IMMUTABLE STRICT\nAS '$libdir/btree_gin', $function$gin_compare_prefix_money$function$\n"
  },
  {
    "args": "name, name, smallint, internal",
    "name": "gin_compare_prefix_name",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.gin_compare_prefix_name(name, name, smallint, internal)\n RETURNS integer\n LANGUAGE c\n IMMUTABLE STRICT\nAS '$libdir/btree_gin', $function$gin_compare_prefix_name$function$\n"
  },
  {
    "args": "numeric, numeric, smallint, internal",
    "name": "gin_compare_prefix_numeric",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.gin_compare_prefix_numeric(numeric, numeric, smallint, internal)\n RETURNS integer\n LANGUAGE c\n IMMUTABLE STRICT\nAS '$libdir/btree_gin', $function$gin_compare_prefix_numeric$function$\n"
  },
  {
    "args": "oid, oid, smallint, internal",
    "name": "gin_compare_prefix_oid",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.gin_compare_prefix_oid(oid, oid, smallint, internal)\n RETURNS integer\n LANGUAGE c\n IMMUTABLE STRICT\nAS '$libdir/btree_gin', $function$gin_compare_prefix_oid$function$\n"
  },
  {
    "args": "text, text, smallint, internal",
    "name": "gin_compare_prefix_text",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.gin_compare_prefix_text(text, text, smallint, internal)\n RETURNS integer\n LANGUAGE c\n IMMUTABLE STRICT\nAS '$libdir/btree_gin', $function$gin_compare_prefix_text$function$\n"
  },
  {
    "args": "time without time zone, time without time zone, smallint, internal",
    "name": "gin_compare_prefix_time",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.gin_compare_prefix_time(time without time zone, time without time zone, smallint, internal)\n RETURNS integer\n LANGUAGE c\n IMMUTABLE STRICT\nAS '$libdir/btree_gin', $function$gin_compare_prefix_time$function$\n"
  },
  {
    "args": "timestamp without time zone, timestamp without time zone, smallint, internal",
    "name": "gin_compare_prefix_timestamp",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.gin_compare_prefix_timestamp(timestamp without time zone, timestamp without time zone, smallint, internal)\n RETURNS integer\n LANGUAGE c\n IMMUTABLE STRICT\nAS '$libdir/btree_gin', $function$gin_compare_prefix_timestamp$function$\n"
  },
  {
    "args": "timestamp with time zone, timestamp with time zone, smallint, internal",
    "name": "gin_compare_prefix_timestamptz",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.gin_compare_prefix_timestamptz(timestamp with time zone, timestamp with time zone, smallint, internal)\n RETURNS integer\n LANGUAGE c\n IMMUTABLE STRICT\nAS '$libdir/btree_gin', $function$gin_compare_prefix_timestamptz$function$\n"
  },
  {
    "args": "time with time zone, time with time zone, smallint, internal",
    "name": "gin_compare_prefix_timetz",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.gin_compare_prefix_timetz(time with time zone, time with time zone, smallint, internal)\n RETURNS integer\n LANGUAGE c\n IMMUTABLE STRICT\nAS '$libdir/btree_gin', $function$gin_compare_prefix_timetz$function$\n"
  },
  {
    "args": "uuid, uuid, smallint, internal",
    "name": "gin_compare_prefix_uuid",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.gin_compare_prefix_uuid(uuid, uuid, smallint, internal)\n RETURNS integer\n LANGUAGE c\n IMMUTABLE STRICT\nAS '$libdir/btree_gin', $function$gin_compare_prefix_uuid$function$\n"
  },
  {
    "args": "bit varying, bit varying, smallint, internal",
    "name": "gin_compare_prefix_varbit",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.gin_compare_prefix_varbit(bit varying, bit varying, smallint, internal)\n RETURNS integer\n LANGUAGE c\n IMMUTABLE STRICT\nAS '$libdir/btree_gin', $function$gin_compare_prefix_varbit$function$\n"
  },
  {
    "args": "anyenum, anyenum",
    "name": "gin_enum_cmp",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.gin_enum_cmp(anyenum, anyenum)\n RETURNS integer\n LANGUAGE c\n IMMUTABLE STRICT\nAS '$libdir/btree_gin', $function$gin_enum_cmp$function$\n"
  },
  {
    "args": "anyenum, internal, smallint, internal, internal",
    "name": "gin_extract_query_anyenum",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.gin_extract_query_anyenum(anyenum, internal, smallint, internal, internal)\n RETURNS internal\n LANGUAGE c\n IMMUTABLE STRICT\nAS '$libdir/btree_gin', $function$gin_extract_query_anyenum$function$\n"
  },
  {
    "args": "bit, internal, smallint, internal, internal",
    "name": "gin_extract_query_bit",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.gin_extract_query_bit(bit, internal, smallint, internal, internal)\n RETURNS internal\n LANGUAGE c\n IMMUTABLE STRICT\nAS '$libdir/btree_gin', $function$gin_extract_query_bit$function$\n"
  },
  {
    "args": "boolean, internal, smallint, internal, internal",
    "name": "gin_extract_query_bool",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.gin_extract_query_bool(boolean, internal, smallint, internal, internal)\n RETURNS internal\n LANGUAGE c\n IMMUTABLE STRICT\nAS '$libdir/btree_gin', $function$gin_extract_query_bool$function$\n"
  },
  {
    "args": "character, internal, smallint, internal, internal",
    "name": "gin_extract_query_bpchar",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.gin_extract_query_bpchar(character, internal, smallint, internal, internal)\n RETURNS internal\n LANGUAGE c\n IMMUTABLE STRICT\nAS '$libdir/btree_gin', $function$gin_extract_query_bpchar$function$\n"
  },
  {
    "args": "bytea, internal, smallint, internal, internal",
    "name": "gin_extract_query_bytea",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.gin_extract_query_bytea(bytea, internal, smallint, internal, internal)\n RETURNS internal\n LANGUAGE c\n IMMUTABLE STRICT\nAS '$libdir/btree_gin', $function$gin_extract_query_bytea$function$\n"
  },
  {
    "args": "\"char\", internal, smallint, internal, internal",
    "name": "gin_extract_query_char",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.gin_extract_query_char(\"char\", internal, smallint, internal, internal)\n RETURNS internal\n LANGUAGE c\n IMMUTABLE STRICT\nAS '$libdir/btree_gin', $function$gin_extract_query_char$function$\n"
  },
  {
    "args": "cidr, internal, smallint, internal, internal",
    "name": "gin_extract_query_cidr",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.gin_extract_query_cidr(cidr, internal, smallint, internal, internal)\n RETURNS internal\n LANGUAGE c\n IMMUTABLE STRICT\nAS '$libdir/btree_gin', $function$gin_extract_query_cidr$function$\n"
  },
  {
    "args": "date, internal, smallint, internal, internal",
    "name": "gin_extract_query_date",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.gin_extract_query_date(date, internal, smallint, internal, internal)\n RETURNS internal\n LANGUAGE c\n IMMUTABLE STRICT\nAS '$libdir/btree_gin', $function$gin_extract_query_date$function$\n"
  },
  {
    "args": "real, internal, smallint, internal, internal",
    "name": "gin_extract_query_float4",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.gin_extract_query_float4(real, internal, smallint, internal, internal)\n RETURNS internal\n LANGUAGE c\n IMMUTABLE STRICT\nAS '$libdir/btree_gin', $function$gin_extract_query_float4$function$\n"
  },
  {
    "args": "double precision, internal, smallint, internal, internal",
    "name": "gin_extract_query_float8",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.gin_extract_query_float8(double precision, internal, smallint, internal, internal)\n RETURNS internal\n LANGUAGE c\n IMMUTABLE STRICT\nAS '$libdir/btree_gin', $function$gin_extract_query_float8$function$\n"
  },
  {
    "args": "inet, internal, smallint, internal, internal",
    "name": "gin_extract_query_inet",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.gin_extract_query_inet(inet, internal, smallint, internal, internal)\n RETURNS internal\n LANGUAGE c\n IMMUTABLE STRICT\nAS '$libdir/btree_gin', $function$gin_extract_query_inet$function$\n"
  },
  {
    "args": "smallint, internal, smallint, internal, internal",
    "name": "gin_extract_query_int2",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.gin_extract_query_int2(smallint, internal, smallint, internal, internal)\n RETURNS internal\n LANGUAGE c\n IMMUTABLE STRICT\nAS '$libdir/btree_gin', $function$gin_extract_query_int2$function$\n"
  },
  {
    "args": "integer, internal, smallint, internal, internal",
    "name": "gin_extract_query_int4",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.gin_extract_query_int4(integer, internal, smallint, internal, internal)\n RETURNS internal\n LANGUAGE c\n IMMUTABLE STRICT\nAS '$libdir/btree_gin', $function$gin_extract_query_int4$function$\n"
  },
  {
    "args": "bigint, internal, smallint, internal, internal",
    "name": "gin_extract_query_int8",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.gin_extract_query_int8(bigint, internal, smallint, internal, internal)\n RETURNS internal\n LANGUAGE c\n IMMUTABLE STRICT\nAS '$libdir/btree_gin', $function$gin_extract_query_int8$function$\n"
  },
  {
    "args": "interval, internal, smallint, internal, internal",
    "name": "gin_extract_query_interval",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.gin_extract_query_interval(interval, internal, smallint, internal, internal)\n RETURNS internal\n LANGUAGE c\n IMMUTABLE STRICT\nAS '$libdir/btree_gin', $function$gin_extract_query_interval$function$\n"
  },
  {
    "args": "macaddr, internal, smallint, internal, internal",
    "name": "gin_extract_query_macaddr",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.gin_extract_query_macaddr(macaddr, internal, smallint, internal, internal)\n RETURNS internal\n LANGUAGE c\n IMMUTABLE STRICT\nAS '$libdir/btree_gin', $function$gin_extract_query_macaddr$function$\n"
  },
  {
    "args": "macaddr8, internal, smallint, internal, internal",
    "name": "gin_extract_query_macaddr8",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.gin_extract_query_macaddr8(macaddr8, internal, smallint, internal, internal)\n RETURNS internal\n LANGUAGE c\n IMMUTABLE STRICT\nAS '$libdir/btree_gin', $function$gin_extract_query_macaddr8$function$\n"
  },
  {
    "args": "money, internal, smallint, internal, internal",
    "name": "gin_extract_query_money",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.gin_extract_query_money(money, internal, smallint, internal, internal)\n RETURNS internal\n LANGUAGE c\n IMMUTABLE STRICT\nAS '$libdir/btree_gin', $function$gin_extract_query_money$function$\n"
  },
  {
    "args": "name, internal, smallint, internal, internal",
    "name": "gin_extract_query_name",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.gin_extract_query_name(name, internal, smallint, internal, internal)\n RETURNS internal\n LANGUAGE c\n IMMUTABLE STRICT\nAS '$libdir/btree_gin', $function$gin_extract_query_name$function$\n"
  },
  {
    "args": "numeric, internal, smallint, internal, internal",
    "name": "gin_extract_query_numeric",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.gin_extract_query_numeric(numeric, internal, smallint, internal, internal)\n RETURNS internal\n LANGUAGE c\n IMMUTABLE STRICT\nAS '$libdir/btree_gin', $function$gin_extract_query_numeric$function$\n"
  },
  {
    "args": "oid, internal, smallint, internal, internal",
    "name": "gin_extract_query_oid",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.gin_extract_query_oid(oid, internal, smallint, internal, internal)\n RETURNS internal\n LANGUAGE c\n IMMUTABLE STRICT\nAS '$libdir/btree_gin', $function$gin_extract_query_oid$function$\n"
  },
  {
    "args": "text, internal, smallint, internal, internal",
    "name": "gin_extract_query_text",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.gin_extract_query_text(text, internal, smallint, internal, internal)\n RETURNS internal\n LANGUAGE c\n IMMUTABLE STRICT\nAS '$libdir/btree_gin', $function$gin_extract_query_text$function$\n"
  },
  {
    "args": "time without time zone, internal, smallint, internal, internal",
    "name": "gin_extract_query_time",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.gin_extract_query_time(time without time zone, internal, smallint, internal, internal)\n RETURNS internal\n LANGUAGE c\n IMMUTABLE STRICT\nAS '$libdir/btree_gin', $function$gin_extract_query_time$function$\n"
  },
  {
    "args": "timestamp without time zone, internal, smallint, internal, internal",
    "name": "gin_extract_query_timestamp",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.gin_extract_query_timestamp(timestamp without time zone, internal, smallint, internal, internal)\n RETURNS internal\n LANGUAGE c\n IMMUTABLE STRICT\nAS '$libdir/btree_gin', $function$gin_extract_query_timestamp$function$\n"
  },
  {
    "args": "timestamp with time zone, internal, smallint, internal, internal",
    "name": "gin_extract_query_timestamptz",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.gin_extract_query_timestamptz(timestamp with time zone, internal, smallint, internal, internal)\n RETURNS internal\n LANGUAGE c\n IMMUTABLE STRICT\nAS '$libdir/btree_gin', $function$gin_extract_query_timestamptz$function$\n"
  },
  {
    "args": "time with time zone, internal, smallint, internal, internal",
    "name": "gin_extract_query_timetz",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.gin_extract_query_timetz(time with time zone, internal, smallint, internal, internal)\n RETURNS internal\n LANGUAGE c\n IMMUTABLE STRICT\nAS '$libdir/btree_gin', $function$gin_extract_query_timetz$function$\n"
  },
  {
    "args": "text, internal, smallint, internal, internal, internal, internal",
    "name": "gin_extract_query_trgm",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.gin_extract_query_trgm(text, internal, smallint, internal, internal, internal, internal)\n RETURNS internal\n LANGUAGE c\n IMMUTABLE PARALLEL SAFE STRICT\nAS '$libdir/pg_trgm', $function$gin_extract_query_trgm$function$\n"
  },
  {
    "args": "uuid, internal, smallint, internal, internal",
    "name": "gin_extract_query_uuid",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.gin_extract_query_uuid(uuid, internal, smallint, internal, internal)\n RETURNS internal\n LANGUAGE c\n IMMUTABLE STRICT\nAS '$libdir/btree_gin', $function$gin_extract_query_uuid$function$\n"
  },
  {
    "args": "bit varying, internal, smallint, internal, internal",
    "name": "gin_extract_query_varbit",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.gin_extract_query_varbit(bit varying, internal, smallint, internal, internal)\n RETURNS internal\n LANGUAGE c\n IMMUTABLE STRICT\nAS '$libdir/btree_gin', $function$gin_extract_query_varbit$function$\n"
  },
  {
    "args": "anyenum, internal",
    "name": "gin_extract_value_anyenum",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.gin_extract_value_anyenum(anyenum, internal)\n RETURNS internal\n LANGUAGE c\n IMMUTABLE STRICT\nAS '$libdir/btree_gin', $function$gin_extract_value_anyenum$function$\n"
  },
  {
    "args": "bit, internal",
    "name": "gin_extract_value_bit",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.gin_extract_value_bit(bit, internal)\n RETURNS internal\n LANGUAGE c\n IMMUTABLE STRICT\nAS '$libdir/btree_gin', $function$gin_extract_value_bit$function$\n"
  },
  {
    "args": "boolean, internal",
    "name": "gin_extract_value_bool",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.gin_extract_value_bool(boolean, internal)\n RETURNS internal\n LANGUAGE c\n IMMUTABLE STRICT\nAS '$libdir/btree_gin', $function$gin_extract_value_bool$function$\n"
  },
  {
    "args": "character, internal",
    "name": "gin_extract_value_bpchar",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.gin_extract_value_bpchar(character, internal)\n RETURNS internal\n LANGUAGE c\n IMMUTABLE STRICT\nAS '$libdir/btree_gin', $function$gin_extract_value_bpchar$function$\n"
  },
  {
    "args": "bytea, internal",
    "name": "gin_extract_value_bytea",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.gin_extract_value_bytea(bytea, internal)\n RETURNS internal\n LANGUAGE c\n IMMUTABLE STRICT\nAS '$libdir/btree_gin', $function$gin_extract_value_bytea$function$\n"
  },
  {
    "args": "\"char\", internal",
    "name": "gin_extract_value_char",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.gin_extract_value_char(\"char\", internal)\n RETURNS internal\n LANGUAGE c\n IMMUTABLE STRICT\nAS '$libdir/btree_gin', $function$gin_extract_value_char$function$\n"
  },
  {
    "args": "cidr, internal",
    "name": "gin_extract_value_cidr",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.gin_extract_value_cidr(cidr, internal)\n RETURNS internal\n LANGUAGE c\n IMMUTABLE STRICT\nAS '$libdir/btree_gin', $function$gin_extract_value_cidr$function$\n"
  },
  {
    "args": "date, internal",
    "name": "gin_extract_value_date",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.gin_extract_value_date(date, internal)\n RETURNS internal\n LANGUAGE c\n IMMUTABLE STRICT\nAS '$libdir/btree_gin', $function$gin_extract_value_date$function$\n"
  },
  {
    "args": "real, internal",
    "name": "gin_extract_value_float4",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.gin_extract_value_float4(real, internal)\n RETURNS internal\n LANGUAGE c\n IMMUTABLE STRICT\nAS '$libdir/btree_gin', $function$gin_extract_value_float4$function$\n"
  },
  {
    "args": "double precision, internal",
    "name": "gin_extract_value_float8",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.gin_extract_value_float8(double precision, internal)\n RETURNS internal\n LANGUAGE c\n IMMUTABLE STRICT\nAS '$libdir/btree_gin', $function$gin_extract_value_float8$function$\n"
  },
  {
    "args": "inet, internal",
    "name": "gin_extract_value_inet",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.gin_extract_value_inet(inet, internal)\n RETURNS internal\n LANGUAGE c\n IMMUTABLE STRICT\nAS '$libdir/btree_gin', $function$gin_extract_value_inet$function$\n"
  },
  {
    "args": "smallint, internal",
    "name": "gin_extract_value_int2",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.gin_extract_value_int2(smallint, internal)\n RETURNS internal\n LANGUAGE c\n IMMUTABLE STRICT\nAS '$libdir/btree_gin', $function$gin_extract_value_int2$function$\n"
  },
  {
    "args": "integer, internal",
    "name": "gin_extract_value_int4",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.gin_extract_value_int4(integer, internal)\n RETURNS internal\n LANGUAGE c\n IMMUTABLE STRICT\nAS '$libdir/btree_gin', $function$gin_extract_value_int4$function$\n"
  },
  {
    "args": "bigint, internal",
    "name": "gin_extract_value_int8",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.gin_extract_value_int8(bigint, internal)\n RETURNS internal\n LANGUAGE c\n IMMUTABLE STRICT\nAS '$libdir/btree_gin', $function$gin_extract_value_int8$function$\n"
  },
  {
    "args": "interval, internal",
    "name": "gin_extract_value_interval",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.gin_extract_value_interval(interval, internal)\n RETURNS internal\n LANGUAGE c\n IMMUTABLE STRICT\nAS '$libdir/btree_gin', $function$gin_extract_value_interval$function$\n"
  },
  {
    "args": "macaddr, internal",
    "name": "gin_extract_value_macaddr",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.gin_extract_value_macaddr(macaddr, internal)\n RETURNS internal\n LANGUAGE c\n IMMUTABLE STRICT\nAS '$libdir/btree_gin', $function$gin_extract_value_macaddr$function$\n"
  },
  {
    "args": "macaddr8, internal",
    "name": "gin_extract_value_macaddr8",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.gin_extract_value_macaddr8(macaddr8, internal)\n RETURNS internal\n LANGUAGE c\n IMMUTABLE STRICT\nAS '$libdir/btree_gin', $function$gin_extract_value_macaddr8$function$\n"
  },
  {
    "args": "money, internal",
    "name": "gin_extract_value_money",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.gin_extract_value_money(money, internal)\n RETURNS internal\n LANGUAGE c\n IMMUTABLE STRICT\nAS '$libdir/btree_gin', $function$gin_extract_value_money$function$\n"
  },
  {
    "args": "name, internal",
    "name": "gin_extract_value_name",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.gin_extract_value_name(name, internal)\n RETURNS internal\n LANGUAGE c\n IMMUTABLE STRICT\nAS '$libdir/btree_gin', $function$gin_extract_value_name$function$\n"
  },
  {
    "args": "numeric, internal",
    "name": "gin_extract_value_numeric",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.gin_extract_value_numeric(numeric, internal)\n RETURNS internal\n LANGUAGE c\n IMMUTABLE STRICT\nAS '$libdir/btree_gin', $function$gin_extract_value_numeric$function$\n"
  },
  {
    "args": "oid, internal",
    "name": "gin_extract_value_oid",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.gin_extract_value_oid(oid, internal)\n RETURNS internal\n LANGUAGE c\n IMMUTABLE STRICT\nAS '$libdir/btree_gin', $function$gin_extract_value_oid$function$\n"
  },
  {
    "args": "text, internal",
    "name": "gin_extract_value_text",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.gin_extract_value_text(text, internal)\n RETURNS internal\n LANGUAGE c\n IMMUTABLE STRICT\nAS '$libdir/btree_gin', $function$gin_extract_value_text$function$\n"
  },
  {
    "args": "time without time zone, internal",
    "name": "gin_extract_value_time",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.gin_extract_value_time(time without time zone, internal)\n RETURNS internal\n LANGUAGE c\n IMMUTABLE STRICT\nAS '$libdir/btree_gin', $function$gin_extract_value_time$function$\n"
  },
  {
    "args": "timestamp without time zone, internal",
    "name": "gin_extract_value_timestamp",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.gin_extract_value_timestamp(timestamp without time zone, internal)\n RETURNS internal\n LANGUAGE c\n IMMUTABLE STRICT\nAS '$libdir/btree_gin', $function$gin_extract_value_timestamp$function$\n"
  },
  {
    "args": "timestamp with time zone, internal",
    "name": "gin_extract_value_timestamptz",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.gin_extract_value_timestamptz(timestamp with time zone, internal)\n RETURNS internal\n LANGUAGE c\n IMMUTABLE STRICT\nAS '$libdir/btree_gin', $function$gin_extract_value_timestamptz$function$\n"
  },
  {
    "args": "time with time zone, internal",
    "name": "gin_extract_value_timetz",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.gin_extract_value_timetz(time with time zone, internal)\n RETURNS internal\n LANGUAGE c\n IMMUTABLE STRICT\nAS '$libdir/btree_gin', $function$gin_extract_value_timetz$function$\n"
  },
  {
    "args": "text, internal",
    "name": "gin_extract_value_trgm",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.gin_extract_value_trgm(text, internal)\n RETURNS internal\n LANGUAGE c\n IMMUTABLE PARALLEL SAFE STRICT\nAS '$libdir/pg_trgm', $function$gin_extract_value_trgm$function$\n"
  },
  {
    "args": "uuid, internal",
    "name": "gin_extract_value_uuid",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.gin_extract_value_uuid(uuid, internal)\n RETURNS internal\n LANGUAGE c\n IMMUTABLE STRICT\nAS '$libdir/btree_gin', $function$gin_extract_value_uuid$function$\n"
  },
  {
    "args": "bit varying, internal",
    "name": "gin_extract_value_varbit",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.gin_extract_value_varbit(bit varying, internal)\n RETURNS internal\n LANGUAGE c\n IMMUTABLE STRICT\nAS '$libdir/btree_gin', $function$gin_extract_value_varbit$function$\n"
  },
  {
    "args": "numeric, numeric",
    "name": "gin_numeric_cmp",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.gin_numeric_cmp(numeric, numeric)\n RETURNS integer\n LANGUAGE c\n IMMUTABLE STRICT\nAS '$libdir/btree_gin', $function$gin_numeric_cmp$function$\n"
  },
  {
    "args": "internal, smallint, text, integer, internal, internal, internal, internal",
    "name": "gin_trgm_consistent",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.gin_trgm_consistent(internal, smallint, text, integer, internal, internal, internal, internal)\n RETURNS boolean\n LANGUAGE c\n IMMUTABLE PARALLEL SAFE STRICT\nAS '$libdir/pg_trgm', $function$gin_trgm_consistent$function$\n"
  },
  {
    "args": "internal, smallint, text, integer, internal, internal, internal",
    "name": "gin_trgm_triconsistent",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.gin_trgm_triconsistent(internal, smallint, text, integer, internal, internal, internal)\n RETURNS \"char\"\n LANGUAGE c\n IMMUTABLE PARALLEL SAFE STRICT\nAS '$libdir/pg_trgm', $function$gin_trgm_triconsistent$function$\n"
  },
  {
    "args": "internal",
    "name": "gtrgm_compress",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.gtrgm_compress(internal)\n RETURNS internal\n LANGUAGE c\n IMMUTABLE PARALLEL SAFE STRICT\nAS '$libdir/pg_trgm', $function$gtrgm_compress$function$\n"
  },
  {
    "args": "internal, text, smallint, oid, internal",
    "name": "gtrgm_consistent",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.gtrgm_consistent(internal, text, smallint, oid, internal)\n RETURNS boolean\n LANGUAGE c\n IMMUTABLE PARALLEL SAFE STRICT\nAS '$libdir/pg_trgm', $function$gtrgm_consistent$function$\n"
  },
  {
    "args": "internal",
    "name": "gtrgm_decompress",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.gtrgm_decompress(internal)\n RETURNS internal\n LANGUAGE c\n IMMUTABLE PARALLEL SAFE STRICT\nAS '$libdir/pg_trgm', $function$gtrgm_decompress$function$\n"
  },
  {
    "args": "internal, text, smallint, oid, internal",
    "name": "gtrgm_distance",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.gtrgm_distance(internal, text, smallint, oid, internal)\n RETURNS double precision\n LANGUAGE c\n IMMUTABLE PARALLEL SAFE STRICT\nAS '$libdir/pg_trgm', $function$gtrgm_distance$function$\n"
  },
  {
    "args": "cstring",
    "name": "gtrgm_in",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.gtrgm_in(cstring)\n RETURNS gtrgm\n LANGUAGE c\n IMMUTABLE PARALLEL SAFE STRICT\nAS '$libdir/pg_trgm', $function$gtrgm_in$function$\n"
  },
  {
    "args": "internal",
    "name": "gtrgm_options",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.gtrgm_options(internal)\n RETURNS void\n LANGUAGE c\n IMMUTABLE PARALLEL SAFE\nAS '$libdir/pg_trgm', $function$gtrgm_options$function$\n"
  },
  {
    "args": "gtrgm",
    "name": "gtrgm_out",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.gtrgm_out(gtrgm)\n RETURNS cstring\n LANGUAGE c\n IMMUTABLE PARALLEL SAFE STRICT\nAS '$libdir/pg_trgm', $function$gtrgm_out$function$\n"
  },
  {
    "args": "internal, internal, internal",
    "name": "gtrgm_penalty",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.gtrgm_penalty(internal, internal, internal)\n RETURNS internal\n LANGUAGE c\n IMMUTABLE PARALLEL SAFE STRICT\nAS '$libdir/pg_trgm', $function$gtrgm_penalty$function$\n"
  },
  {
    "args": "internal, internal",
    "name": "gtrgm_picksplit",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.gtrgm_picksplit(internal, internal)\n RETURNS internal\n LANGUAGE c\n IMMUTABLE PARALLEL SAFE STRICT\nAS '$libdir/pg_trgm', $function$gtrgm_picksplit$function$\n"
  },
  {
    "args": "gtrgm, gtrgm, internal",
    "name": "gtrgm_same",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.gtrgm_same(gtrgm, gtrgm, internal)\n RETURNS internal\n LANGUAGE c\n IMMUTABLE PARALLEL SAFE STRICT\nAS '$libdir/pg_trgm', $function$gtrgm_same$function$\n"
  },
  {
    "args": "internal, internal",
    "name": "gtrgm_union",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.gtrgm_union(internal, internal)\n RETURNS gtrgm\n LANGUAGE c\n IMMUTABLE PARALLEL SAFE STRICT\nAS '$libdir/pg_trgm', $function$gtrgm_union$function$\n"
  },
  {
    "args": "halfvec, integer, boolean",
    "name": "halfvec",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.halfvec(halfvec, integer, boolean)\n RETURNS halfvec\n LANGUAGE c\n IMMUTABLE PARALLEL SAFE STRICT\nAS '$libdir/vector', $function$halfvec$function$\n"
  },
  {
    "args": "double precision[], halfvec",
    "name": "halfvec_accum",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.halfvec_accum(double precision[], halfvec)\n RETURNS double precision[]\n LANGUAGE c\n IMMUTABLE PARALLEL SAFE STRICT\nAS '$libdir/vector', $function$halfvec_accum$function$\n"
  },
  {
    "args": "halfvec, halfvec",
    "name": "halfvec_add",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.halfvec_add(halfvec, halfvec)\n RETURNS halfvec\n LANGUAGE c\n IMMUTABLE PARALLEL SAFE STRICT\nAS '$libdir/vector', $function$halfvec_add$function$\n"
  },
  {
    "args": "double precision[]",
    "name": "halfvec_avg",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.halfvec_avg(double precision[])\n RETURNS halfvec\n LANGUAGE c\n IMMUTABLE PARALLEL SAFE STRICT\nAS '$libdir/vector', $function$halfvec_avg$function$\n"
  },
  {
    "args": "halfvec, halfvec",
    "name": "halfvec_cmp",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.halfvec_cmp(halfvec, halfvec)\n RETURNS integer\n LANGUAGE c\n IMMUTABLE PARALLEL SAFE STRICT\nAS '$libdir/vector', $function$halfvec_cmp$function$\n"
  },
  {
    "args": "double precision[], double precision[]",
    "name": "halfvec_combine",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.halfvec_combine(double precision[], double precision[])\n RETURNS double precision[]\n LANGUAGE c\n IMMUTABLE PARALLEL SAFE STRICT\nAS '$libdir/vector', $function$vector_combine$function$\n"
  },
  {
    "args": "halfvec, halfvec",
    "name": "halfvec_concat",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.halfvec_concat(halfvec, halfvec)\n RETURNS halfvec\n LANGUAGE c\n IMMUTABLE PARALLEL SAFE STRICT\nAS '$libdir/vector', $function$halfvec_concat$function$\n"
  },
  {
    "args": "halfvec, halfvec",
    "name": "halfvec_eq",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.halfvec_eq(halfvec, halfvec)\n RETURNS boolean\n LANGUAGE c\n IMMUTABLE PARALLEL SAFE STRICT\nAS '$libdir/vector', $function$halfvec_eq$function$\n"
  },
  {
    "args": "halfvec, halfvec",
    "name": "halfvec_ge",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.halfvec_ge(halfvec, halfvec)\n RETURNS boolean\n LANGUAGE c\n IMMUTABLE PARALLEL SAFE STRICT\nAS '$libdir/vector', $function$halfvec_ge$function$\n"
  },
  {
    "args": "halfvec, halfvec",
    "name": "halfvec_gt",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.halfvec_gt(halfvec, halfvec)\n RETURNS boolean\n LANGUAGE c\n IMMUTABLE PARALLEL SAFE STRICT\nAS '$libdir/vector', $function$halfvec_gt$function$\n"
  },
  {
    "args": "cstring, oid, integer",
    "name": "halfvec_in",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.halfvec_in(cstring, oid, integer)\n RETURNS halfvec\n LANGUAGE c\n IMMUTABLE PARALLEL SAFE STRICT\nAS '$libdir/vector', $function$halfvec_in$function$\n"
  },
  {
    "args": "halfvec, halfvec",
    "name": "halfvec_l2_squared_distance",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.halfvec_l2_squared_distance(halfvec, halfvec)\n RETURNS double precision\n LANGUAGE c\n IMMUTABLE PARALLEL SAFE STRICT\nAS '$libdir/vector', $function$halfvec_l2_squared_distance$function$\n"
  },
  {
    "args": "halfvec, halfvec",
    "name": "halfvec_le",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.halfvec_le(halfvec, halfvec)\n RETURNS boolean\n LANGUAGE c\n IMMUTABLE PARALLEL SAFE STRICT\nAS '$libdir/vector', $function$halfvec_le$function$\n"
  },
  {
    "args": "halfvec, halfvec",
    "name": "halfvec_lt",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.halfvec_lt(halfvec, halfvec)\n RETURNS boolean\n LANGUAGE c\n IMMUTABLE PARALLEL SAFE STRICT\nAS '$libdir/vector', $function$halfvec_lt$function$\n"
  },
  {
    "args": "halfvec, halfvec",
    "name": "halfvec_mul",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.halfvec_mul(halfvec, halfvec)\n RETURNS halfvec\n LANGUAGE c\n IMMUTABLE PARALLEL SAFE STRICT\nAS '$libdir/vector', $function$halfvec_mul$function$\n"
  },
  {
    "args": "halfvec, halfvec",
    "name": "halfvec_ne",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.halfvec_ne(halfvec, halfvec)\n RETURNS boolean\n LANGUAGE c\n IMMUTABLE PARALLEL SAFE STRICT\nAS '$libdir/vector', $function$halfvec_ne$function$\n"
  },
  {
    "args": "halfvec, halfvec",
    "name": "halfvec_negative_inner_product",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.halfvec_negative_inner_product(halfvec, halfvec)\n RETURNS double precision\n LANGUAGE c\n IMMUTABLE PARALLEL SAFE STRICT\nAS '$libdir/vector', $function$halfvec_negative_inner_product$function$\n"
  },
  {
    "args": "halfvec",
    "name": "halfvec_out",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.halfvec_out(halfvec)\n RETURNS cstring\n LANGUAGE c\n IMMUTABLE PARALLEL SAFE STRICT\nAS '$libdir/vector', $function$halfvec_out$function$\n"
  },
  {
    "args": "internal, oid, integer",
    "name": "halfvec_recv",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.halfvec_recv(internal, oid, integer)\n RETURNS halfvec\n LANGUAGE c\n IMMUTABLE PARALLEL SAFE STRICT\nAS '$libdir/vector', $function$halfvec_recv$function$\n"
  },
  {
    "args": "halfvec",
    "name": "halfvec_send",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.halfvec_send(halfvec)\n RETURNS bytea\n LANGUAGE c\n IMMUTABLE PARALLEL SAFE STRICT\nAS '$libdir/vector', $function$halfvec_send$function$\n"
  },
  {
    "args": "halfvec, halfvec",
    "name": "halfvec_spherical_distance",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.halfvec_spherical_distance(halfvec, halfvec)\n RETURNS double precision\n LANGUAGE c\n IMMUTABLE PARALLEL SAFE STRICT\nAS '$libdir/vector', $function$halfvec_spherical_distance$function$\n"
  },
  {
    "args": "halfvec, halfvec",
    "name": "halfvec_sub",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.halfvec_sub(halfvec, halfvec)\n RETURNS halfvec\n LANGUAGE c\n IMMUTABLE PARALLEL SAFE STRICT\nAS '$libdir/vector', $function$halfvec_sub$function$\n"
  },
  {
    "args": "halfvec, integer, boolean",
    "name": "halfvec_to_float4",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.halfvec_to_float4(halfvec, integer, boolean)\n RETURNS real[]\n LANGUAGE c\n IMMUTABLE PARALLEL SAFE STRICT\nAS '$libdir/vector', $function$halfvec_to_float4$function$\n"
  },
  {
    "args": "halfvec, integer, boolean",
    "name": "halfvec_to_sparsevec",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.halfvec_to_sparsevec(halfvec, integer, boolean)\n RETURNS sparsevec\n LANGUAGE c\n IMMUTABLE PARALLEL SAFE STRICT\nAS '$libdir/vector', $function$halfvec_to_sparsevec$function$\n"
  },
  {
    "args": "halfvec, integer, boolean",
    "name": "halfvec_to_vector",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.halfvec_to_vector(halfvec, integer, boolean)\n RETURNS vector\n LANGUAGE c\n IMMUTABLE PARALLEL SAFE STRICT\nAS '$libdir/vector', $function$halfvec_to_vector$function$\n"
  },
  {
    "args": "cstring[]",
    "name": "halfvec_typmod_in",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.halfvec_typmod_in(cstring[])\n RETURNS integer\n LANGUAGE c\n IMMUTABLE PARALLEL SAFE STRICT\nAS '$libdir/vector', $function$halfvec_typmod_in$function$\n"
  },
  {
    "args": "bit, bit",
    "name": "hamming_distance",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.hamming_distance(bit, bit)\n RETURNS double precision\n LANGUAGE c\n IMMUTABLE PARALLEL SAFE STRICT\nAS '$libdir/vector', $function$hamming_distance$function$\n"
  },
  {
    "args": "",
    "name": "handle_manual_brief_generation",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.handle_manual_brief_generation()\n RETURNS trigger\n LANGUAGE plpgsql\nAS $function$DECLARE\r\n  v_job_id TEXT;\r\nBEGIN\r\n  -- Only process if this is a manual generation (not from a queue job)\r\n  -- Check if there's a metadata field that indicates this came from a job\r\n  IF (TG_OP = 'INSERT' OR TG_OP = 'UPDATE') THEN\r\n    \r\n    -- Extract job_id from metadata if it exists (we'll add this in the worker)\r\n    v_job_id := NEW.metadata->>'queue_job_id';\r\n    \r\n    -- Only cancel OTHER jobs, not the one that created this brief\r\n    IF v_job_id IS NULL OR NEW.generation_status = 'failed' THEN\r\n      -- This is a manual generation or a retry, cancel pending jobs\r\n      UPDATE queue_jobs \r\n      SET \r\n        status = 'cancelled',\r\n        error_message = 'Cancelled due to newer brief generation request',\r\n        processed_at = now()\r\n      WHERE \r\n        user_id = NEW.user_id \r\n        AND job_type = 'generate_daily_brief'\r\n        AND status IN ('pending', 'processing')\r\n        AND DATE(scheduled_for) = NEW.brief_date\r\n        AND (v_job_id IS NULL OR queue_job_id != v_job_id);\r\n    END IF;\r\n    \r\n  END IF;\r\n  \r\n  RETURN NEW;\r\nEND;$function$\n"
  },
  {
    "args": "internal",
    "name": "hnsw_bit_support",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.hnsw_bit_support(internal)\n RETURNS internal\n LANGUAGE c\nAS '$libdir/vector', $function$hnsw_bit_support$function$\n"
  },
  {
    "args": "internal",
    "name": "hnsw_halfvec_support",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.hnsw_halfvec_support(internal)\n RETURNS internal\n LANGUAGE c\nAS '$libdir/vector', $function$hnsw_halfvec_support$function$\n"
  },
  {
    "args": "internal",
    "name": "hnsw_sparsevec_support",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.hnsw_sparsevec_support(internal)\n RETURNS internal\n LANGUAGE c\nAS '$libdir/vector', $function$hnsw_sparsevec_support$function$\n"
  },
  {
    "args": "internal",
    "name": "hnswhandler",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.hnswhandler(internal)\n RETURNS index_am_handler\n LANGUAGE c\nAS '$libdir/vector', $function$hnswhandler$function$\n"
  },
  {
    "args": "",
    "name": "increment_agent_session_message_count",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.increment_agent_session_message_count()\n RETURNS trigger\n LANGUAGE plpgsql\nAS $function$\nBEGIN\n    UPDATE agent_chat_sessions\n    SET message_count = message_count + 1\n    WHERE id = NEW.agent_session_id;\n    RETURN NEW;\nEND;\n$function$\n"
  },
  {
    "args": "p_session_id uuid, p_message_increment integer, p_token_increment integer, p_tool_increment integer",
    "name": "increment_chat_session_metrics",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.increment_chat_session_metrics(p_session_id uuid, p_message_increment integer DEFAULT 0, p_token_increment integer DEFAULT 0, p_tool_increment integer DEFAULT 0)\n RETURNS void\n LANGUAGE plpgsql\nAS $function$\nBEGIN\n\tUPDATE chat_sessions\n\tSET message_count = COALESCE(message_count, 0) + COALESCE(p_message_increment, 0),\n\t\ttotal_tokens_used = COALESCE(total_tokens_used, 0) + COALESCE(p_token_increment, 0),\n\t\ttool_call_count = COALESCE(tool_call_count, 0) + COALESCE(p_tool_increment, 0),\n\t\tupdated_at = NOW()\n\tWHERE id = p_session_id;\nEND;\n$function$\n"
  },
  {
    "args": "row_id bigint",
    "name": "increment_migration_retry_count",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.increment_migration_retry_count(row_id bigint)\n RETURNS void\n LANGUAGE plpgsql\n SECURITY DEFINER\nAS $function$\nBEGIN\n    UPDATE migration_log\n    SET\n        retry_count = COALESCE(retry_count, 0) + 1,\n        last_retry_at = NOW()\n    WHERE id = row_id;\nEND;\n$function$\n"
  },
  {
    "args": "question_ids uuid[]",
    "name": "increment_question_display_count",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.increment_question_display_count(question_ids uuid[])\n RETURNS void\n LANGUAGE plpgsql\n SECURITY DEFINER\nAS $function$\nBEGIN\n  UPDATE project_questions\n  SET \n    shown_to_user_count = shown_to_user_count + 1,\n    updated_at = NOW()\n  WHERE id = ANY(question_ids);\nEND;\n$function$\n"
  },
  {
    "args": "halfvec, halfvec",
    "name": "inner_product",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.inner_product(halfvec, halfvec)\n RETURNS double precision\n LANGUAGE c\n IMMUTABLE PARALLEL SAFE STRICT\nAS '$libdir/vector', $function$halfvec_inner_product$function$\n"
  },
  {
    "args": "sparsevec, sparsevec",
    "name": "inner_product",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.inner_product(sparsevec, sparsevec)\n RETURNS double precision\n LANGUAGE c\n IMMUTABLE PARALLEL SAFE STRICT\nAS '$libdir/vector', $function$sparsevec_inner_product$function$\n"
  },
  {
    "args": "vector, vector",
    "name": "inner_product",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.inner_product(vector, vector)\n RETURNS double precision\n LANGUAGE c\n IMMUTABLE PARALLEL SAFE STRICT\nAS '$libdir/vector', $function$inner_product$function$\n"
  },
  {
    "args": "",
    "name": "is_admin",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.is_admin()\n RETURNS boolean\n LANGUAGE sql\n STABLE SECURITY DEFINER\n SET search_path TO 'public'\nAS $function$\n  SELECT COALESCE(\n    (SELECT is_admin FROM users WHERE id = auth.uid()),\n    false\n  );\n$function$\n"
  },
  {
    "args": "user_id uuid",
    "name": "is_admin",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.is_admin(user_id uuid)\n RETURNS boolean\n LANGUAGE plpgsql\n STABLE SECURITY DEFINER\nAS $function$\nBEGIN\n  RETURN EXISTS (\n    SELECT 1 FROM admin_users\n    WHERE admin_users.user_id = $1\n  );\nEND;\n$function$\n"
  },
  {
    "args": "internal",
    "name": "ivfflat_bit_support",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.ivfflat_bit_support(internal)\n RETURNS internal\n LANGUAGE c\nAS '$libdir/vector', $function$ivfflat_bit_support$function$\n"
  },
  {
    "args": "internal",
    "name": "ivfflat_halfvec_support",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.ivfflat_halfvec_support(internal)\n RETURNS internal\n LANGUAGE c\nAS '$libdir/vector', $function$ivfflat_halfvec_support$function$\n"
  },
  {
    "args": "internal",
    "name": "ivfflathandler",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.ivfflathandler(internal)\n RETURNS index_am_handler\n LANGUAGE c\nAS '$libdir/vector', $function$ivfflathandler$function$\n"
  },
  {
    "args": "bit, bit",
    "name": "jaccard_distance",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.jaccard_distance(bit, bit)\n RETURNS double precision\n LANGUAGE c\n IMMUTABLE PARALLEL SAFE STRICT\nAS '$libdir/vector', $function$jaccard_distance$function$\n"
  },
  {
    "args": "halfvec, halfvec",
    "name": "l1_distance",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.l1_distance(halfvec, halfvec)\n RETURNS double precision\n LANGUAGE c\n IMMUTABLE PARALLEL SAFE STRICT\nAS '$libdir/vector', $function$halfvec_l1_distance$function$\n"
  },
  {
    "args": "sparsevec, sparsevec",
    "name": "l1_distance",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.l1_distance(sparsevec, sparsevec)\n RETURNS double precision\n LANGUAGE c\n IMMUTABLE PARALLEL SAFE STRICT\nAS '$libdir/vector', $function$sparsevec_l1_distance$function$\n"
  },
  {
    "args": "vector, vector",
    "name": "l1_distance",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.l1_distance(vector, vector)\n RETURNS double precision\n LANGUAGE c\n IMMUTABLE PARALLEL SAFE STRICT\nAS '$libdir/vector', $function$l1_distance$function$\n"
  },
  {
    "args": "halfvec, halfvec",
    "name": "l2_distance",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.l2_distance(halfvec, halfvec)\n RETURNS double precision\n LANGUAGE c\n IMMUTABLE PARALLEL SAFE STRICT\nAS '$libdir/vector', $function$halfvec_l2_distance$function$\n"
  },
  {
    "args": "sparsevec, sparsevec",
    "name": "l2_distance",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.l2_distance(sparsevec, sparsevec)\n RETURNS double precision\n LANGUAGE c\n IMMUTABLE PARALLEL SAFE STRICT\nAS '$libdir/vector', $function$sparsevec_l2_distance$function$\n"
  },
  {
    "args": "vector, vector",
    "name": "l2_distance",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.l2_distance(vector, vector)\n RETURNS double precision\n LANGUAGE c\n IMMUTABLE PARALLEL SAFE STRICT\nAS '$libdir/vector', $function$l2_distance$function$\n"
  },
  {
    "args": "halfvec",
    "name": "l2_norm",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.l2_norm(halfvec)\n RETURNS double precision\n LANGUAGE c\n IMMUTABLE PARALLEL SAFE STRICT\nAS '$libdir/vector', $function$halfvec_l2_norm$function$\n"
  },
  {
    "args": "sparsevec",
    "name": "l2_norm",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.l2_norm(sparsevec)\n RETURNS double precision\n LANGUAGE c\n IMMUTABLE PARALLEL SAFE STRICT\nAS '$libdir/vector', $function$sparsevec_l2_norm$function$\n"
  },
  {
    "args": "halfvec",
    "name": "l2_normalize",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.l2_normalize(halfvec)\n RETURNS halfvec\n LANGUAGE c\n IMMUTABLE PARALLEL SAFE STRICT\nAS '$libdir/vector', $function$halfvec_l2_normalize$function$\n"
  },
  {
    "args": "sparsevec",
    "name": "l2_normalize",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.l2_normalize(sparsevec)\n RETURNS sparsevec\n LANGUAGE c\n IMMUTABLE PARALLEL SAFE STRICT\nAS '$libdir/vector', $function$sparsevec_l2_normalize$function$\n"
  },
  {
    "args": "vector",
    "name": "l2_normalize",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.l2_normalize(vector)\n RETURNS vector\n LANGUAGE c\n IMMUTABLE PARALLEL SAFE STRICT\nAS '$libdir/vector', $function$l2_normalize$function$\n"
  },
  {
    "args": "",
    "name": "list_pending_project_invites",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.list_pending_project_invites()\n RETURNS TABLE(invite_id uuid, project_id uuid, project_name text, role_key text, access text, status text, expires_at timestamp with time zone, created_at timestamp with time zone, invited_by_actor_id uuid, invited_by_name text, invited_by_email text)\n LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO 'public'\nAS $function$\nDECLARE\n  v_auth_user_id uuid;\n  v_user_email text;\nBEGIN\n  v_auth_user_id := auth.uid();\n  IF v_auth_user_id IS NULL THEN\n    RAISE EXCEPTION 'Authentication required';\n  END IF;\n\n  SELECT email INTO v_user_email\n  FROM public.users\n  WHERE id = v_auth_user_id;\n\n  IF v_user_email IS NULL THEN\n    SELECT email INTO v_user_email\n    FROM onto_actors\n    WHERE user_id = v_auth_user_id\n    LIMIT 1;\n  END IF;\n\n  IF v_user_email IS NULL OR length(trim(v_user_email)) = 0 THEN\n    RAISE EXCEPTION 'User email missing';\n  END IF;\n\n  UPDATE onto_project_invites AS i\n  SET status = 'expired'\n  WHERE i.status = 'pending'\n    AND i.expires_at < now()\n    AND lower(i.invitee_email) = lower(trim(v_user_email));\n\n  RETURN QUERY\n  SELECT\n    i.id,\n    i.project_id,\n    p.name,\n    i.role_key,\n    i.access,\n    i.status,\n    i.expires_at,\n    i.created_at,\n    i.invited_by_actor_id,\n    COALESCE(u.name, a.name, u.email, a.email) AS invited_by_name,\n    COALESCE(u.email, a.email) AS invited_by_email\n  FROM onto_project_invites i\n  JOIN onto_projects p ON p.id = i.project_id\n  LEFT JOIN onto_actors a ON a.id = i.invited_by_actor_id\n  LEFT JOIN public.users u ON u.id = a.user_id\n  WHERE lower(i.invitee_email) = lower(trim(v_user_email))\n    AND i.status = 'pending'\n    AND i.expires_at >= now()\n    AND p.deleted_at IS NULL\n  ORDER BY i.created_at DESC;\nEND;\n$function$\n"
  },
  {
    "args": "p_level text, p_message text, p_namespace text, p_correlation_id uuid, p_event_id uuid, p_delivery_id uuid, p_user_id uuid, p_context jsonb, p_metadata jsonb",
    "name": "log_notification_event",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.log_notification_event(p_level text, p_message text, p_namespace text DEFAULT 'db_function'::text, p_correlation_id uuid DEFAULT NULL::uuid, p_event_id uuid DEFAULT NULL::uuid, p_delivery_id uuid DEFAULT NULL::uuid, p_user_id uuid DEFAULT NULL::uuid, p_context jsonb DEFAULT '{}'::jsonb, p_metadata jsonb DEFAULT '{}'::jsonb)\n RETURNS void\n LANGUAGE plpgsql\n SECURITY DEFINER\nAS $function$\nBEGIN\n  -- Insert log entry into notification_logs table\n  -- Note: This is non-blocking and won't fail the transaction if logging fails\n  INSERT INTO notification_logs (\n    level,\n    message,\n    namespace,\n    correlation_id,\n    notification_event_id,\n    notification_delivery_id,\n    user_id,\n    metadata,\n    created_at\n  ) VALUES (\n    p_level,\n    p_message,\n    p_namespace,\n    p_correlation_id,\n    p_event_id,\n    p_delivery_id,\n    p_user_id,\n    p_context || p_metadata,  -- Merge context and metadata\n    NOW()\n  );\nEXCEPTION\n  WHEN OTHERS THEN\n    -- Don't fail the transaction if logging fails\n    -- Just silently continue (logging is best-effort)\n    NULL;\nEND;\n$function$\n"
  },
  {
    "args": "",
    "name": "notify_user_signup",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.notify_user_signup()\n RETURNS trigger\n LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO 'public'\nAS $function$\nDECLARE\n  v_has_subscriptions BOOLEAN;\n  v_has_emit_function BOOLEAN;\n  v_has_events_table BOOLEAN;\nBEGIN\n  -- Check if notification_events table exists\n  SELECT EXISTS (\n    SELECT 1 FROM information_schema.tables\n    WHERE table_schema = 'public' AND table_name = 'notification_events'\n  ) INTO v_has_events_table;\n\n  -- Only proceed if table exists\n  IF NOT v_has_events_table THEN\n    RAISE WARNING 'notification_events table does not exist, skipping notification';\n    RETURN NEW;\n  END IF;\n\n  -- Check if notification_subscriptions exists and has data\n  SELECT EXISTS (\n    SELECT 1 FROM notification_subscriptions\n    WHERE event_type = 'user.signup' AND is_active = true\n  ) INTO v_has_subscriptions;\n\n  -- Check if emit_notification_event function exists\n  SELECT EXISTS (\n    SELECT 1 FROM pg_proc\n    WHERE proname = 'emit_notification_event'\n  ) INTO v_has_emit_function;\n\n  -- Only emit if we have the function and active subscriptions\n  IF v_has_emit_function AND v_has_subscriptions THEN\n    BEGIN\n      -- Now the user exists in auth.users, so foreign key constraint will be satisfied\n      PERFORM emit_notification_event(\n        p_event_type := 'user.signup',\n        p_event_source := 'database_trigger',\n        p_actor_user_id := NEW.id,  -- This is now safe - user exists in database\n        p_payload := jsonb_build_object(\n          'user_id', NEW.id,\n          'user_email', NEW.email,\n          'signup_method', COALESCE(\n            -- Query provider from auth.identities, not auth.users\n            (SELECT provider FROM auth.identities WHERE user_id = NEW.id LIMIT 1),\n            'email'\n          ),\n          -- Removed referral_source as column doesn't exist\n          'created_at', NEW.created_at\n        )\n      );\n    EXCEPTION\n      WHEN foreign_key_violation THEN\n        -- Specific handling for foreign key issues\n        RAISE WARNING 'Foreign key violation in notification: user % may not exist in auth.users yet', NEW.id;\n        RETURN NEW;\n      WHEN OTHERS THEN\n        -- Log other errors but don't fail user creation\n        RAISE WARNING 'Failed to emit signup notification for user %: %', NEW.id, SQLERRM;\n        RETURN NEW;\n    END;\n  END IF;\n\n  RETURN NEW;\nEXCEPTION\n  WHEN OTHERS THEN\n    -- Ultimate fallback - ensure user creation always succeeds\n    RAISE WARNING 'notify_user_signup error for user %: %', NEW.id, SQLERRM;\n    RETURN NEW;\nEND;\n$function$\n"
  },
  {
    "args": "p_guard jsonb, p_entity jsonb",
    "name": "onto_check_guard",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.onto_check_guard(p_guard jsonb, p_entity jsonb)\n RETURNS boolean\n LANGUAGE plpgsql\nAS $function$\ndeclare\n\tv_type text;\n\tv_path text;\n\tv_key text;\n\tv_value text;\n\tv_pattern text;\n\tv_current text;\nbegin\n\tif p_guard is null or jsonb_typeof(p_guard) <> 'object' then\n\t\treturn false;\n\tend if;\n\n\tv_type := p_guard->>'type';\n\tif v_type is null then\n\t\treturn false;\n\tend if;\n\n\tcase v_type\n\t\twhen 'has_property' then\n\t\t\tv_path := p_guard->>'path';\n\t\t\tif v_path is null or length(v_path) = 0 then\n\t\t\t\treturn false;\n\t\t\tend if;\n\t\t\treturn onto_jsonb_has_value(p_entity, v_path);\n\n\t\twhen 'has_facet' then\n\t\t\tv_key := p_guard->>'key';\n\t\t\tv_value := p_guard->>'value';\n\t\t\tif v_key is null or v_value is null then\n\t\t\t\treturn false;\n\t\t\tend if;\n\t\t\treturn onto_jsonb_extract_text(p_entity, 'props.facets.' || v_key) = v_value;\n\n\t\twhen 'facet_in' then\n\t\t\tv_key := p_guard->>'key';\n\t\t\tif v_key is null or p_guard->'values' is null then\n\t\t\t\treturn false;\n\t\t\tend if;\n\n\t\t\tv_value := onto_jsonb_extract_text(p_entity, 'props.facets.' || v_key);\n\t\t\tif v_value is null then\n\t\t\t\treturn false;\n\t\t\tend if;\n\n\t\t\treturn exists (\n\t\t\t\tselect 1\n\t\t\t\tfrom jsonb_array_elements_text(p_guard->'values') as vals(val)\n\t\t\t\twhere vals.val = v_value\n\t\t\t);\n\n\t\twhen 'all_facets_set' then\n\t\t\tif p_guard->'keys' is null then\n\t\t\t\treturn false;\n\t\t\tend if;\n\n\t\t\treturn not exists (\n\t\t\t\tselect 1\n\t\t\t\tfrom jsonb_array_elements_text(p_guard->'keys') as facet_keys(key)\n\t\t\t\twhere not onto_jsonb_has_value(p_entity, 'props.facets.' || facet_keys.key)\n\t\t\t);\n\n\t\twhen 'type_key_matches' then\n\t\t\tv_pattern := p_guard->>'pattern';\n\t\t\tif v_pattern is null then\n\t\t\t\treturn false;\n\t\t\tend if;\n\n\t\t\tv_pattern := replace(v_pattern, '*', '.*');\n\t\t\tv_current := coalesce(p_entity->>'type_key', '');\n\t\t\t-- Use case-sensitive regex to match the transformed pattern\n\t\t\treturn v_current ~ v_pattern;\n\n\t\telse\n\t\t\treturn false;\n\tend case;\nend;\n$function$\n"
  },
  {
    "args": "p_project_id uuid, p_entity_type text, p_entity_id uuid",
    "name": "onto_comment_validate_target",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.onto_comment_validate_target(p_project_id uuid, p_entity_type text, p_entity_id uuid)\n RETURNS boolean\n LANGUAGE plpgsql\nAS $function$\nBEGIN\n  IF p_project_id IS NULL OR p_entity_type IS NULL OR p_entity_id IS NULL THEN\n    RETURN false;\n  END IF;\n\n  CASE p_entity_type\n    WHEN 'project' THEN\n      RETURN p_entity_id = p_project_id;\n    WHEN 'task' THEN\n      RETURN EXISTS (\n        SELECT 1 FROM onto_tasks t\n        WHERE t.id = p_entity_id AND t.project_id = p_project_id\n      );\n    WHEN 'plan' THEN\n      RETURN EXISTS (\n        SELECT 1 FROM onto_plans pl\n        WHERE pl.id = p_entity_id AND pl.project_id = p_project_id\n      );\n    WHEN 'output' THEN\n      RETURN EXISTS (\n        SELECT 1 FROM onto_outputs o\n        WHERE o.id = p_entity_id AND o.project_id = p_project_id\n      );\n    WHEN 'document' THEN\n      RETURN EXISTS (\n        SELECT 1 FROM onto_documents d\n        WHERE d.id = p_entity_id AND d.project_id = p_project_id\n      );\n    WHEN 'goal' THEN\n      RETURN EXISTS (\n        SELECT 1 FROM onto_goals g\n        WHERE g.id = p_entity_id AND g.project_id = p_project_id\n      );\n    WHEN 'requirement' THEN\n      RETURN EXISTS (\n        SELECT 1 FROM onto_requirements r\n        WHERE r.id = p_entity_id AND r.project_id = p_project_id\n      );\n    WHEN 'milestone' THEN\n      RETURN EXISTS (\n        SELECT 1 FROM onto_milestones m\n        WHERE m.id = p_entity_id AND m.project_id = p_project_id\n      );\n    WHEN 'risk' THEN\n      RETURN EXISTS (\n        SELECT 1 FROM onto_risks rk\n        WHERE rk.id = p_entity_id AND rk.project_id = p_project_id\n      );\n    WHEN 'decision' THEN\n      RETURN EXISTS (\n        SELECT 1 FROM onto_decisions dc\n        WHERE dc.id = p_entity_id AND dc.project_id = p_project_id\n      );\n    WHEN 'event' THEN\n      RETURN EXISTS (\n        SELECT 1 FROM onto_events ev\n        WHERE ev.id = p_entity_id AND ev.project_id = p_project_id\n      );\n    WHEN 'metric' THEN\n      RETURN EXISTS (\n        SELECT 1 FROM onto_metrics mt\n        WHERE mt.id = p_entity_id AND mt.project_id = p_project_id\n      );\n    WHEN 'metric_point' THEN\n      RETURN EXISTS (\n        SELECT 1\n        FROM onto_metric_points mp\n        JOIN onto_metrics mt ON mt.id = mp.metric_id\n        WHERE mp.id = p_entity_id AND mt.project_id = p_project_id\n      );\n    WHEN 'source' THEN\n      RETURN EXISTS (\n        SELECT 1 FROM onto_sources s\n        WHERE s.id = p_entity_id AND s.project_id = p_project_id\n      );\n    WHEN 'signal' THEN\n      RETURN EXISTS (\n        SELECT 1 FROM onto_signals sg\n        WHERE sg.id = p_entity_id AND sg.project_id = p_project_id\n      );\n    WHEN 'insight' THEN\n      RETURN EXISTS (\n        SELECT 1 FROM onto_insights i\n        WHERE i.id = p_entity_id AND i.project_id = p_project_id\n      );\n    WHEN 'note' THEN\n      RETURN EXISTS (\n        SELECT 1 FROM onto_documents d\n        WHERE d.id = p_entity_id AND d.project_id = p_project_id\n      );\n    ELSE\n      RETURN false;\n  END CASE;\nEND;\n$function$\n"
  },
  {
    "args": "",
    "name": "onto_comments_before_insert",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.onto_comments_before_insert()\n RETURNS trigger\n LANGUAGE plpgsql\nAS $function$\nDECLARE\n  v_parent onto_comments%ROWTYPE;\nBEGIN\n  IF NEW.parent_id IS NULL THEN\n    IF NEW.root_id IS NOT NULL AND NEW.root_id <> NEW.id THEN\n      RAISE EXCEPTION 'root_id must match id for top-level comments';\n    END IF;\n    NEW.root_id := NEW.id;\n  ELSE\n    SELECT * INTO v_parent FROM onto_comments WHERE id = NEW.parent_id;\n    IF NOT FOUND THEN\n      RAISE EXCEPTION 'Parent comment not found';\n    END IF;\n\n    IF v_parent.project_id <> NEW.project_id\n      OR v_parent.entity_type <> NEW.entity_type\n      OR v_parent.entity_id <> NEW.entity_id THEN\n      RAISE EXCEPTION 'Parent comment must share target context';\n    END IF;\n\n    IF NEW.root_id IS NOT NULL AND NEW.root_id <> v_parent.root_id THEN\n      RAISE EXCEPTION 'root_id must match parent root_id';\n    END IF;\n\n    NEW.root_id := v_parent.root_id;\n  END IF;\n\n  IF NOT onto_comment_validate_target(NEW.project_id, NEW.entity_type, NEW.entity_id) THEN\n    RAISE EXCEPTION 'Invalid comment target';\n  END IF;\n\n  RETURN NEW;\nEND;\n$function$\n"
  },
  {
    "args": "",
    "name": "onto_comments_before_update",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.onto_comments_before_update()\n RETURNS trigger\n LANGUAGE plpgsql\nAS $function$\nBEGIN\n  IF NEW.project_id <> OLD.project_id\n    OR NEW.entity_type <> OLD.entity_type\n    OR NEW.entity_id <> OLD.entity_id\n    OR NEW.parent_id <> OLD.parent_id\n    OR NEW.root_id <> OLD.root_id\n    OR NEW.created_by <> OLD.created_by\n    OR NEW.created_at <> OLD.created_at\n    OR NEW.body_format <> OLD.body_format THEN\n    RAISE EXCEPTION 'Immutable comment fields cannot be changed';\n  END IF;\n\n  IF NEW.body IS DISTINCT FROM OLD.body THEN\n    NEW.edited_at := now();\n  END IF;\n\n  NEW.updated_at := now();\n  RETURN NEW;\nEND;\n$function$\n"
  },
  {
    "args": "p_json jsonb, p_path text",
    "name": "onto_jsonb_extract",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.onto_jsonb_extract(p_json jsonb, p_path text)\n RETURNS jsonb\n LANGUAGE sql\n IMMUTABLE\nAS $function$\n\tselect\n\t\tcase\n\t\t\twhen p_json is null or p_path is null or length(p_path) = 0 then null\n\t\t\telse p_json #> string_to_array(p_path, '.')\n\t\tend;\n$function$\n"
  },
  {
    "args": "p_json jsonb, p_path text",
    "name": "onto_jsonb_extract_text",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.onto_jsonb_extract_text(p_json jsonb, p_path text)\n RETURNS text\n LANGUAGE sql\n IMMUTABLE\nAS $function$\n\tselect\n\t\tcase\n\t\t\twhen p_json is null or p_path is null or length(p_path) = 0 then null\n\t\t\telse p_json #>> string_to_array(p_path, '.')\n\t\tend;\n$function$\n"
  },
  {
    "args": "p_json jsonb, p_path text",
    "name": "onto_jsonb_has_value",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.onto_jsonb_has_value(p_json jsonb, p_path text)\n RETURNS boolean\n LANGUAGE plpgsql\n IMMUTABLE\nAS $function$\ndeclare\n\tv_value jsonb;\nbegin\n\tif p_json is null or p_path is null or length(p_path) = 0 then\n\t\treturn false;\n\tend if;\n\n\tv_value := onto_jsonb_extract(p_json, p_path);\n\n\tif v_value is null then\n\t\treturn false;\n\tend if;\n\n\tif v_value = 'null'::jsonb then\n\t\treturn false;\n\tend if;\n\n\treturn true;\nend;\n$function$\n"
  },
  {
    "args": "p_actor_id uuid, p_query text, p_project_id uuid, p_types text[], p_limit integer",
    "name": "onto_search_entities",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.onto_search_entities(p_actor_id uuid, p_query text, p_project_id uuid DEFAULT NULL::uuid, p_types text[] DEFAULT NULL::text[], p_limit integer DEFAULT 50)\n RETURNS TABLE(type text, id uuid, project_id uuid, project_name text, title text, snippet text, score double precision)\n LANGUAGE plpgsql\nAS $function$\ndeclare\n  v_limit int := least(coalesce(p_limit, 50), 50);\n  v_query tsquery;\nbegin\n  if coalesce(trim(p_query), '') = '' then\n    return;\n  end if;\n\n  v_query := websearch_to_tsquery('english', p_query);\n\n  return query\n  with params as (select v_query as tsq)\n  select *\n  from (\n    -- Tasks\n    select\n      'task'::text as type,\n      t.id,\n      t.project_id,\n      p.name as project_name,\n      t.title as title,\n      ts_headline(\n        'english',\n        concat_ws(' ', coalesce(t.title, ''), coalesce(t.props::text, '')),\n        params.tsq,\n        'MaxFragments=2,MinWords=5,MaxWords=18'\n      ) as snippet,\n      (coalesce(ts_rank(t.search_vector, params.tsq), 0) * 0.6) +\n      (similarity(coalesce(t.title, ''), p_query) * 0.4) as score\n    from onto_tasks t\n    join params on true\n    left join onto_projects p on p.id = t.project_id\n    where t.created_by = p_actor_id\n      and t.deleted_at is null\n      and p.deleted_at is null\n      and (p_project_id is null or t.project_id = p_project_id)\n      and (p_types is null or 'task' = any(p_types))\n      and (\n        params.tsq @@ t.search_vector\n        or similarity(coalesce(t.title, ''), p_query) >= 0.2\n      )\n\n    union all\n\n    -- Plans\n    select\n      'plan'::text as type,\n      pl.id,\n      pl.project_id,\n      p.name as project_name,\n      pl.name as title,\n      ts_headline(\n        'english',\n        concat_ws(' ', coalesce(pl.name, ''), coalesce(pl.props::text, '')),\n        params.tsq,\n        'MaxFragments=2,MinWords=5,MaxWords=18'\n      ) as snippet,\n      (coalesce(ts_rank(pl.search_vector, params.tsq), 0) * 0.6) +\n      (similarity(coalesce(pl.name, ''), p_query) * 0.4) as score\n    from onto_plans pl\n    join params on true\n    left join onto_projects p on p.id = pl.project_id\n    where pl.created_by = p_actor_id\n      and pl.deleted_at is null\n      and p.deleted_at is null\n      and (p_project_id is null or pl.project_id = p_project_id)\n      and (p_types is null or 'plan' = any(p_types))\n      and (\n        params.tsq @@ pl.search_vector\n        or similarity(coalesce(pl.name, ''), p_query) >= 0.2\n      )\n\n    union all\n\n    -- Goals\n    select\n      'goal'::text as type,\n      g.id,\n      g.project_id,\n      p.name as project_name,\n      g.name as title,\n      ts_headline(\n        'english',\n        concat_ws(' ', coalesce(g.name, ''), coalesce(g.props::text, '')),\n        params.tsq,\n        'MaxFragments=2,MinWords=5,MaxWords=18'\n      ) as snippet,\n      (coalesce(ts_rank(g.search_vector, params.tsq), 0) * 0.6) +\n      (similarity(coalesce(g.name, ''), p_query) * 0.4) as score\n    from onto_goals g\n    join params on true\n    left join onto_projects p on p.id = g.project_id\n    where g.created_by = p_actor_id\n      and g.deleted_at is null\n      and p.deleted_at is null\n      and (p_project_id is null or g.project_id = p_project_id)\n      and (p_types is null or 'goal' = any(p_types))\n      and (\n        params.tsq @@ g.search_vector\n        or similarity(coalesce(g.name, ''), p_query) >= 0.2\n      )\n\n    union all\n\n    -- Milestones\n    select\n      'milestone'::text as type,\n      m.id,\n      m.project_id,\n      p.name as project_name,\n      m.title as title,\n      ts_headline(\n        'english',\n        concat_ws(' ', coalesce(m.title, ''), coalesce(m.props::text, '')),\n        params.tsq,\n        'MaxFragments=2,MinWords=5,MaxWords=18'\n      ) as snippet,\n      (coalesce(ts_rank(m.search_vector, params.tsq), 0) * 0.6) +\n      (similarity(coalesce(m.title, ''), p_query) * 0.4) as score\n    from onto_milestones m\n    join params on true\n    left join onto_projects p on p.id = m.project_id\n    where m.created_by = p_actor_id\n      and m.deleted_at is null\n      and p.deleted_at is null\n      and (p_project_id is null or m.project_id = p_project_id)\n      and (p_types is null or 'milestone' = any(p_types))\n      and (\n        params.tsq @@ m.search_vector\n        or similarity(coalesce(m.title, ''), p_query) >= 0.2\n      )\n\n    union all\n\n    -- Documents\n    select\n      'document'::text as type,\n      d.id,\n      d.project_id,\n      p.name as project_name,\n      d.title as title,\n      ts_headline(\n        'english',\n        concat_ws(' ', coalesce(d.title, ''), coalesce(d.props::text, '')),\n        params.tsq,\n        'MaxFragments=2,MinWords=5,MaxWords=18'\n      ) as snippet,\n      (coalesce(ts_rank(d.search_vector, params.tsq), 0) * 0.6) +\n      (similarity(coalesce(d.title, ''), p_query) * 0.4) as score\n    from onto_documents d\n    join params on true\n    left join onto_projects p on p.id = d.project_id\n    where d.created_by = p_actor_id\n      and d.deleted_at is null\n      and p.deleted_at is null\n      and (p_project_id is null or d.project_id = p_project_id)\n      and (p_types is null or 'document' = any(p_types))\n      and (\n        params.tsq @@ d.search_vector\n        or similarity(coalesce(d.title, ''), p_query) >= 0.2\n      )\n\n    union all\n\n    -- Outputs\n    select\n      'output'::text as type,\n      o.id,\n      o.project_id,\n      p.name as project_name,\n      o.name as title,\n      ts_headline(\n        'english',\n        concat_ws(' ', coalesce(o.name, ''), coalesce(o.props::text, '')),\n        params.tsq,\n        'MaxFragments=2,MinWords=5,MaxWords=18'\n      ) as snippet,\n      (coalesce(ts_rank(o.search_vector, params.tsq), 0) * 0.6) +\n      (similarity(coalesce(o.name, ''), p_query) * 0.4) as score\n    from onto_outputs o\n    join params on true\n    left join onto_projects p on p.id = o.project_id\n    where o.created_by = p_actor_id\n      and o.deleted_at is null\n      and p.deleted_at is null\n      and (p_project_id is null or o.project_id = p_project_id)\n      and (p_types is null or 'output' = any(p_types))\n      and (\n        params.tsq @@ o.search_vector\n        or similarity(coalesce(o.name, ''), p_query) >= 0.2\n      )\n\n    union all\n\n    -- Requirements\n    select\n      'requirement'::text as type,\n      r.id,\n      r.project_id,\n      p.name as project_name,\n      r.\"text\" as title,\n      ts_headline(\n        'english',\n        concat_ws(' ', coalesce(r.\"text\", ''), coalesce(r.props::text, '')),\n        params.tsq,\n        'MaxFragments=2,MinWords=5,MaxWords=18'\n      ) as snippet,\n      (coalesce(ts_rank(r.search_vector, params.tsq), 0) * 0.6) +\n      (similarity(coalesce(r.\"text\", ''), p_query) * 0.4) as score\n    from onto_requirements r\n    join params on true\n    left join onto_projects p on p.id = r.project_id\n    where r.created_by = p_actor_id\n      and r.deleted_at is null\n      and p.deleted_at is null\n      and (p_project_id is null or r.project_id = p_project_id)\n      and (p_types is null or 'requirement' = any(p_types))\n      and (\n        params.tsq @@ r.search_vector\n        or similarity(coalesce(r.\"text\", ''), p_query) >= 0.2\n      )\n  ) as results\n  order by score desc\n  limit v_limit;\nend;\n$function$\n"
  },
  {
    "args": "",
    "name": "prevent_privilege_escalation",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.prevent_privilege_escalation()\n RETURNS trigger\n LANGUAGE plpgsql\n SECURITY DEFINER\nAS $function$\nBEGIN\n  -- Check if is_admin field is being changed\n  IF OLD.is_admin IS DISTINCT FROM NEW.is_admin THEN\n    -- Check if the user making the change is an admin (using is_admin function to avoid recursion)\n    IF NOT is_admin(auth.uid()) THEN\n      RAISE EXCEPTION 'Cannot modify is_admin field. Only administrators can change user privileges.';\n    END IF;\n  END IF;\n\n  RETURN NEW;\nEND;\n$function$\n"
  },
  {
    "args": "p_user_id uuid, p_phone_number text, p_message text, p_priority sms_priority, p_scheduled_for timestamp with time zone, p_metadata jsonb",
    "name": "queue_sms_message",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.queue_sms_message(p_user_id uuid, p_phone_number text, p_message text, p_priority sms_priority DEFAULT 'normal'::sms_priority, p_scheduled_for timestamp with time zone DEFAULT NULL::timestamp with time zone, p_metadata jsonb DEFAULT '{}'::jsonb)\n RETURNS uuid\n LANGUAGE plpgsql\n SECURITY DEFINER\nAS $function$\nDECLARE\n  v_message_id UUID;\n  v_job_id UUID;\n  v_queue_priority INTEGER;\nBEGIN\n  -- Convert priority to numeric value for queue\n  v_queue_priority := CASE p_priority\n    WHEN 'urgent' THEN 1\n    WHEN 'high' THEN 5\n    WHEN 'normal' THEN 10\n    WHEN 'low' THEN 20\n  END;\n\n  -- Create SMS message record\n  INSERT INTO sms_messages (\n    user_id,\n    phone_number,\n    message_content,\n    priority,\n    scheduled_for,\n    metadata,\n    status\n  ) VALUES (\n    p_user_id,\n    p_phone_number,\n    p_message,\n    p_priority,\n    p_scheduled_for,\n    p_metadata,\n    CASE\n      WHEN p_scheduled_for IS NOT NULL AND p_scheduled_for > NOW()\n      THEN 'scheduled'::sms_status\n      ELSE 'pending'::sms_status\n    END\n  ) RETURNING id INTO v_message_id;\n\n  -- Queue the job if it should be sent now or soon\n  IF p_scheduled_for IS NULL OR p_scheduled_for <= NOW() + INTERVAL '5 minutes' THEN\n    -- Use existing add_queue_job function\n    v_job_id := add_queue_job(\n      p_user_id := p_user_id,\n      p_job_type := 'send_sms',\n      p_metadata := jsonb_build_object(\n        'message_id', v_message_id,\n        'phone_number', p_phone_number,\n        'message', p_message,\n        'priority', p_priority\n      ),\n      p_scheduled_for := COALESCE(p_scheduled_for, NOW()),\n      p_priority := v_queue_priority\n    );\n\n    -- Update message with queue job reference\n    UPDATE sms_messages\n    SET queue_job_id = v_job_id, status = 'queued'::sms_status\n    WHERE id = v_message_id;\n  END IF;\n\n  RETURN v_message_id;\nEND;\n$function$\n"
  },
  {
    "args": "p_metric_date date, p_metric_hour integer, p_user_id uuid, p_metric_type text, p_metric_value numeric, p_metadata jsonb",
    "name": "record_sms_metric",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.record_sms_metric(p_metric_date date, p_metric_hour integer, p_user_id uuid, p_metric_type text, p_metric_value numeric, p_metadata jsonb DEFAULT '{}'::jsonb)\n RETURNS void\n LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO 'public'\nAS $function$\nBEGIN\n  -- Atomic upsert: insert or increment existing value\n  INSERT INTO sms_metrics (\n    metric_date,\n    metric_hour,\n    user_id,\n    metric_type,\n    metric_value,\n    metadata,\n    created_at,\n    updated_at\n  )\n  VALUES (\n    p_metric_date,\n    p_metric_hour,\n    p_user_id,\n    p_metric_type,\n    p_metric_value,\n    p_metadata,\n    NOW(),\n    NOW()\n  )\n  ON CONFLICT (metric_date, metric_hour, user_id, metric_type)\n  DO UPDATE SET\n    -- Increment metric value (works for both counters and sum-based averages)\n    metric_value = sms_metrics.metric_value + EXCLUDED.metric_value,\n    -- Merge metadata (new keys added, existing preserved)\n    metadata = sms_metrics.metadata || EXCLUDED.metadata,\n    -- Update timestamp\n    updated_at = NOW();\n\nEXCEPTION\n  WHEN OTHERS THEN\n    -- Log error but don't fail (metrics should never block core functionality)\n    RAISE WARNING 'Error recording SMS metric: % (type: %, user: %)', SQLERRM, p_metric_type, p_user_id;\nEND;\n$function$\n"
  },
  {
    "args": "",
    "name": "refresh_sms_metrics_daily",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.refresh_sms_metrics_daily()\n RETURNS void\n LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO 'public'\nAS $function$\nBEGIN\n  -- CONCURRENTLY allows queries during refresh (requires unique index)\n  REFRESH MATERIALIZED VIEW CONCURRENTLY sms_metrics_daily;\n\nEXCEPTION\n  WHEN OTHERS THEN\n    -- Log error but don't fail (monitoring infrastructure should be resilient)\n    RAISE WARNING 'Error refreshing sms_metrics_daily materialized view: %', SQLERRM;\nEND;\n$function$\n"
  },
  {
    "args": "",
    "name": "refresh_user_migration_stats",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.refresh_user_migration_stats()\n RETURNS TABLE(refreshed boolean, duration_ms integer, row_count integer)\n LANGUAGE plpgsql\n SECURITY DEFINER\nAS $function$\nDECLARE\n    start_time TIMESTAMPTZ;\n    end_time TIMESTAMPTZ;\n    rows_count INTEGER;\nBEGIN\n    start_time := clock_timestamp();\n\n    REFRESH MATERIALIZED VIEW CONCURRENTLY user_migration_stats;\n\n    end_time := clock_timestamp();\n\n    SELECT COUNT(*) INTO rows_count FROM user_migration_stats;\n\n    RETURN QUERY SELECT\n        true AS refreshed,\n        EXTRACT(MILLISECONDS FROM (end_time - start_time))::INTEGER AS duration_ms,\n        rows_count AS row_count;\nEND;\n$function$\n"
  },
  {
    "args": "p_run_id uuid",
    "name": "release_migration_platform_lock",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.release_migration_platform_lock(p_run_id uuid)\n RETURNS boolean\n LANGUAGE plpgsql\n SECURITY DEFINER\nAS $function$\nDECLARE\n    v_released BOOLEAN;\nBEGIN\n    UPDATE migration_platform_lock\n    SET\n        run_id = NULL,\n        locked_by = NULL,\n        locked_at = NULL,\n        expires_at = NULL\n    WHERE id = 1 AND run_id = p_run_id;\n\n    RETURN FOUND;\nEND;\n$function$\n"
  },
  {
    "args": "p_project_id uuid, p_phase_updates jsonb, p_clear_task_dates boolean, p_affected_task_ids uuid[]",
    "name": "reorder_phases_with_tasks",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.reorder_phases_with_tasks(p_project_id uuid, p_phase_updates jsonb, p_clear_task_dates boolean DEFAULT false, p_affected_task_ids uuid[] DEFAULT NULL::uuid[])\n RETURNS jsonb\n LANGUAGE plpgsql\n SECURITY DEFINER\nAS $function$\r\nDECLARE\r\n  v_result JSONB;\r\n  v_phase_count INTEGER;\r\n  v_task_count INTEGER := 0;\r\nBEGIN\r\n  -- Start transaction implicitly\r\n  \r\n  -- Update phase orders\r\n  WITH updated_phases AS (\r\n    SELECT * FROM batch_update_phase_orders(p_project_id, p_phase_updates)\r\n  )\r\n  SELECT COUNT(*) INTO v_phase_count FROM updated_phases;\r\n\r\n  -- Clear task dates if requested\r\n  IF p_clear_task_dates AND p_affected_task_ids IS NOT NULL THEN\r\n    -- Clear task start dates\r\n    UPDATE tasks\r\n    SET \r\n      start_date = NULL,\r\n      updated_at = NOW()\r\n    WHERE id = ANY(p_affected_task_ids)\r\n      AND project_id = p_project_id;\r\n    \r\n    GET DIAGNOSTICS v_task_count = ROW_COUNT;\r\n\r\n    -- Update phase task assignments\r\n    UPDATE phase_tasks pt\r\n    SET \r\n      suggested_start_date = NULL,\r\n      assignment_reason = 'Phase reordering'\r\n    WHERE pt.phase_id IN (\r\n      SELECT id FROM phases WHERE project_id = p_project_id\r\n    );\r\n  END IF;\r\n\r\n  -- Build result\r\n  v_result := jsonb_build_object(\r\n    'success', true,\r\n    'phases_updated', v_phase_count,\r\n    'tasks_cleared', v_task_count,\r\n    'timestamp', NOW()\r\n  );\r\n\r\n  RETURN v_result;\r\nEND;\r\n$function$\n"
  },
  {
    "args": "p_stall_timeout text",
    "name": "reset_stalled_jobs",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.reset_stalled_jobs(p_stall_timeout text DEFAULT '5 minutes'::text)\n RETURNS integer\n LANGUAGE plpgsql\nAS $function$\nDECLARE\n  v_reset_count INTEGER;\nBEGIN\n  UPDATE queue_jobs\n  SET\n    status = 'pending',\n    started_at = NULL,\n    updated_at = NOW()\n  WHERE status = 'processing'\n    AND started_at < NOW() - p_stall_timeout::INTERVAL;\n\n  GET DIAGNOSTICS v_reset_count = ROW_COUNT;\n\n  IF v_reset_count > 0 THEN\n    RAISE NOTICE 'Reset % stalled jobs', v_reset_count;\n  END IF;\n\n  RETURN v_reset_count;\nEND;\n$function$\n"
  },
  {
    "args": "",
    "name": "save_project_version",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.save_project_version()\n RETURNS trigger\n LANGUAGE plpgsql\n SECURITY DEFINER\nAS $function$\nDECLARE\n    next_version INTEGER;\n    existing_count INTEGER;\nBEGIN\n    -- Prevent recursion from cleanup function\n    IF current_setting('app.skip_history_trigger', TRUE) = 'true' THEN\n        RETURN COALESCE(NEW, OLD);\n    END IF;\n\n    -- Handle INSERT operations (create initial version)\n    IF TG_OP = 'INSERT' THEN\n        -- Use advisory lock based on project_id to prevent race conditions for this specific project\n        PERFORM pg_advisory_xact_lock(hashtext(NEW.id::text));\n        \n        -- Use COALESCE with MAX to handle empty table case\n        SELECT COALESCE(MAX(version_number), 0) + 1 \n        INTO next_version\n        FROM projects_history\n        WHERE project_id = NEW.id;\n\n        INSERT INTO projects_history (\n            project_id,\n            version_number,\n            is_first_version,\n            project_data,\n            created_by\n        ) VALUES (\n            NEW.id,\n            next_version,\n            (next_version = 1), -- TRUE if this is version 1, FALSE otherwise\n            row_to_json(NEW)::jsonb,\n            NEW.user_id\n        );\n\n    -- Handle UPDATE operations (create new version with updated data)\n    ELSIF TG_OP = 'UPDATE' THEN\n        -- Only save if there are actual changes in the data\n        IF row_to_json(OLD)::jsonb != row_to_json(NEW)::jsonb THEN\n            -- Use advisory lock based on project_id to prevent race conditions for this specific project\n            PERFORM pg_advisory_xact_lock(hashtext(NEW.id::text));\n            \n            -- Use atomic increment without FOR UPDATE\n            SELECT COALESCE(MAX(version_number), 0) + 1 \n            INTO next_version\n            FROM projects_history\n            WHERE project_id = NEW.id;\n\n            INSERT INTO projects_history (\n                project_id,\n                version_number,\n                is_first_version,\n                project_data,\n                created_by\n            ) VALUES (\n                NEW.id,\n                next_version,\n                FALSE, -- Updates are never first version\n                row_to_json(NEW)::jsonb,\n                NEW.user_id\n            );\n\n            -- Get count for cleanup check (after insert to ensure accurate count)\n            SELECT COUNT(*)\n            INTO existing_count\n            FROM projects_history\n            WHERE project_id = NEW.id;\n\n            -- Clean up history (with recursion protection)\n            IF existing_count > 5 THEN\n                PERFORM set_config('app.skip_history_trigger', 'true', TRUE);\n                PERFORM cleanup_project_history(NEW.id);\n                PERFORM set_config('app.skip_history_trigger', 'false', TRUE);\n            END IF;\n        END IF;\n    END IF;\n\n    RETURN COALESCE(NEW, OLD);\nEND;\n$function$\n"
  },
  {
    "args": "search_query text, current_user_id uuid, items_per_category integer",
    "name": "search_all_content",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.search_all_content(search_query text, current_user_id uuid, items_per_category integer DEFAULT 5)\n RETURNS TABLE(item_type text, item_id uuid, title text, description text, tags text[], status text, project_id uuid, created_at timestamp with time zone, updated_at timestamp with time zone, relevance_score double precision, is_completed boolean, is_deleted boolean, matched_fields text[])\n LANGUAGE plpgsql\nAS $function$\nDECLARE\n    normalized_query text;\nBEGIN\n    -- Normalize the search query\n    normalized_query := lower(unaccent(trim(search_query)));\n    \n    RETURN QUERY\n    WITH \n    -- Search Brain Dumps\n    brain_dump_results AS (\n        SELECT \n            'braindump'::text as item_type,\n            bd.id as item_id,\n            bd.title::text as title,\n            COALESCE(\n                LEFT(bd.ai_summary, 200),\n                LEFT(bd.content, 200)\n            )::text as description,\n            bd.tags as tags,\n            bd.status::text as status,\n            bd.project_id as project_id,\n            bd.created_at,\n            bd.updated_at,\n            -- Calculate relevance score with weighted fields\n            (\n                COALESCE(similarity(bd.title, normalized_query) * 3, 0) +\n                COALESCE(similarity(bd.content, normalized_query) * 2, 0) +\n                COALESCE(similarity(bd.ai_summary, normalized_query) * 2, 0) +\n                COALESCE(similarity(bd.ai_insights, normalized_query) * 1.5, 0) +\n                CASE WHEN bd.tags @> ARRAY[normalized_query] THEN 2 ELSE 0 END +\n                -- Status penalties for brain dumps\n                CASE bd.status::text\n                    WHEN 'pending' THEN 0.3\n                    WHEN 'parsed' THEN 0.5\n                    WHEN 'saved' THEN 0.5\n                    WHEN 'parsed_and_deleted' THEN -0.5\n                    ELSE 0\n                END +\n                -- Recency boost (items from last 7 days get a boost)\n                CASE \n                    WHEN bd.created_at > NOW() - INTERVAL '7 days' THEN 0.5\n                    WHEN bd.created_at > NOW() - INTERVAL '30 days' THEN 0.2\n                    ELSE 0\n                END\n            ) as relevance_score,\n            false as is_completed,\n            CASE WHEN bd.status = 'parsed_and_deleted' THEN true ELSE false END as is_deleted,\n            -- Track which fields matched\n            ARRAY_REMOVE(ARRAY[\n                CASE WHEN bd.title ILIKE '%' || normalized_query || '%' THEN 'title' END,\n                CASE WHEN bd.content ILIKE '%' || normalized_query || '%' THEN 'content' END,\n                CASE WHEN bd.ai_summary ILIKE '%' || normalized_query || '%' THEN 'summary' END,\n                CASE WHEN bd.ai_insights ILIKE '%' || normalized_query || '%' THEN 'insights' END,\n                CASE WHEN bd.tags @> ARRAY[normalized_query] THEN 'tags' END\n            ], NULL) as matched_fields\n        FROM brain_dumps bd\n        WHERE \n            bd.user_id = current_user_id\n            AND (\n                bd.title ILIKE '%' || normalized_query || '%'\n                OR bd.content ILIKE '%' || normalized_query || '%'\n                OR bd.ai_summary ILIKE '%' || normalized_query || '%'\n                OR bd.ai_insights ILIKE '%' || normalized_query || '%'\n                OR bd.tags @> ARRAY[normalized_query]\n                -- Fuzzy matching with similarity threshold\n                OR similarity(bd.title, normalized_query) > 0.2\n                OR similarity(bd.content, normalized_query) > 0.2\n                OR similarity(bd.ai_summary, normalized_query) > 0.2\n            )\n        ORDER BY relevance_score DESC, bd.created_at DESC\n        LIMIT items_per_category\n    ),\n    \n    -- Search Projects\n    project_results AS (\n        SELECT \n            'project'::text as item_type,\n            p.id as item_id,\n            p.name::text as title,\n            COALESCE(\n                LEFT(p.description, 200),\n                LEFT(p.executive_summary, 200),\n                LEFT(p.context, 200)\n            )::text as description,\n            p.tags as tags,\n            p.status::text as status,\n            p.id as project_id,\n            p.created_at,\n            p.updated_at,\n            -- Calculate relevance score with weighted fields\n            (\n                COALESCE(similarity(p.name, normalized_query) * 3, 0) +\n                COALESCE(similarity(p.description, normalized_query) * 2, 0) +\n                COALESCE(similarity(p.executive_summary, normalized_query) * 1.5, 0) +\n                COALESCE(similarity(p.context, normalized_query) * 1, 0) +\n                CASE WHEN p.tags @> ARRAY[normalized_query] THEN 2 ELSE 0 END +\n                -- Status penalties for projects\n                CASE p.status::text\n                    WHEN 'active' THEN 0.5\n                    WHEN 'paused' THEN 0\n                    WHEN 'completed' THEN -0.5\n                    WHEN 'archived' THEN -1\n                    ELSE 0\n                END +\n                -- Recency boost\n                CASE \n                    WHEN p.updated_at > NOW() - INTERVAL '7 days' THEN 0.5\n                    WHEN p.updated_at > NOW() - INTERVAL '30 days' THEN 0.2\n                    ELSE 0\n                END\n            ) as relevance_score,\n            CASE WHEN p.status = 'completed' THEN true ELSE false END as is_completed,\n            CASE WHEN p.status = 'archived' THEN true ELSE false END as is_deleted,\n            ARRAY_REMOVE(ARRAY[\n                CASE WHEN p.name ILIKE '%' || normalized_query || '%' THEN 'name' END,\n                CASE WHEN p.description ILIKE '%' || normalized_query || '%' THEN 'description' END,\n                CASE WHEN p.executive_summary ILIKE '%' || normalized_query || '%' THEN 'summary' END,\n                CASE WHEN p.context ILIKE '%' || normalized_query || '%' THEN 'context' END,\n                CASE WHEN p.tags @> ARRAY[normalized_query] THEN 'tags' END\n            ], NULL) as matched_fields\n        FROM projects p\n        WHERE \n            p.user_id = current_user_id\n            AND (\n                p.name ILIKE '%' || normalized_query || '%'\n                OR p.description ILIKE '%' || normalized_query || '%'\n                OR p.executive_summary ILIKE '%' || normalized_query || '%'\n                OR p.context ILIKE '%' || normalized_query || '%'\n                OR p.tags @> ARRAY[normalized_query]\n                OR similarity(p.name, normalized_query) > 0.2\n                OR similarity(p.description, normalized_query) > 0.2\n                OR similarity(p.executive_summary, normalized_query) > 0.2\n            )\n        ORDER BY relevance_score DESC, p.updated_at DESC\n        LIMIT items_per_category\n    ),\n    \n    -- Search Tasks\n    task_results AS (\n        SELECT \n            'task'::text as item_type,\n            t.id as item_id,\n            t.title::text as title,\n            COALESCE(\n                LEFT(t.description, 200),\n                LEFT(t.details, 200),\n                LEFT(t.task_steps, 200)\n            )::text as description,\n            NULL::text[] as tags,\n            t.status::text as status,\n            t.project_id as project_id,\n            t.created_at,\n            t.updated_at,\n            -- Calculate relevance score with weighted fields\n            (\n                COALESCE(similarity(t.title, normalized_query) * 3, 0) +\n                COALESCE(similarity(t.description, normalized_query) * 2, 0) +\n                COALESCE(similarity(t.details, normalized_query) * 1.5, 0) +\n                COALESCE(similarity(t.task_steps, normalized_query) * 1, 0) +\n                -- Priority boost\n                CASE t.priority::text\n                    WHEN 'high' THEN 0.5\n                    WHEN 'medium' THEN 0.2\n                    WHEN 'low' THEN 0\n                    ELSE 0\n                END +\n                -- Status adjustments for tasks\n                CASE t.status::text\n                    WHEN 'backlog' THEN 0.3\n                    WHEN 'in_progress' THEN 0.7\n                    WHEN 'done' THEN -0.5\n                    WHEN 'blocked' THEN 0.1\n                    ELSE 0\n                END +\n                -- Recency boost\n                CASE \n                    WHEN t.updated_at > NOW() - INTERVAL '7 days' THEN 0.5\n                    WHEN t.updated_at > NOW() - INTERVAL '30 days' THEN 0.2\n                    ELSE 0\n                END\n            ) as relevance_score,\n            CASE WHEN t.status = 'done' THEN true ELSE false END as is_completed,\n            CASE WHEN t.deleted_at IS NOT NULL THEN true ELSE false END as is_deleted,\n            ARRAY_REMOVE(ARRAY[\n                CASE WHEN t.title ILIKE '%' || normalized_query || '%' THEN 'title' END,\n                CASE WHEN t.description ILIKE '%' || normalized_query || '%' THEN 'description' END,\n                CASE WHEN t.details ILIKE '%' || normalized_query || '%' THEN 'details' END,\n                CASE WHEN t.task_steps ILIKE '%' || normalized_query || '%' THEN 'steps' END\n            ], NULL) as matched_fields\n        FROM tasks t\n        WHERE \n            t.user_id = current_user_id\n            AND (\n                t.title ILIKE '%' || normalized_query || '%'\n                OR t.description ILIKE '%' || normalized_query || '%'\n                OR t.details ILIKE '%' || normalized_query || '%'\n                OR t.task_steps ILIKE '%' || normalized_query || '%'\n                OR similarity(t.title, normalized_query) > 0.2\n                OR similarity(t.description, normalized_query) > 0.2\n                OR similarity(t.details, normalized_query) > 0.2\n            )\n        ORDER BY relevance_score DESC, t.updated_at DESC\n        LIMIT items_per_category\n    )\n    \n    -- Combine all results\n    SELECT * FROM brain_dump_results\n    UNION ALL\n    SELECT * FROM project_results\n    UNION ALL\n    SELECT * FROM task_results\n    ORDER BY item_type, relevance_score DESC;\nEND;\n$function$\n"
  },
  {
    "args": "query_embedding vector, similarity_threshold double precision",
    "name": "search_all_similar",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.search_all_similar(query_embedding vector, similarity_threshold double precision DEFAULT 0.8)\n RETURNS TABLE(table_name text, id uuid, content text, similarity double precision)\n LANGUAGE plpgsql\nAS $function$\r\nBEGIN\r\n  RETURN QUERY\r\n  -- Search projects\r\n  SELECT 'projects'::text, p.id, p.name::text, 1 - (p.embedding <=> query_embedding)\r\n  FROM projects p\r\n  WHERE p.embedding IS NOT NULL\r\n  AND 1 - (p.embedding <=> query_embedding) > similarity_threshold\r\n  \r\n  UNION ALL\r\n  \r\n  -- Search tasks\r\n  SELECT 'tasks'::text, t.id, t.title::text, 1 - (t.embedding <=> query_embedding)\r\n  FROM tasks t\r\n  WHERE t.embedding IS NOT NULL\r\n  AND 1 - (t.embedding <=> query_embedding) > similarity_threshold\r\n  \r\n  UNION ALL\r\n  \r\n  -- Search goals\r\n  SELECT 'goals'::text, g.id, g.title::text, 1 - (g.embedding <=> query_embedding)\r\n  FROM goals g\r\n  WHERE g.embedding IS NOT NULL\r\n  AND 1 - (g.embedding <=> query_embedding) > similarity_threshold\r\n  \r\n  UNION ALL\r\n  \r\n  -- Search notes\r\n  SELECT 'notes'::text, n.id, n.title::text, 1 - (n.embedding <=> query_embedding)\r\n  FROM notes n\r\n  WHERE n.embedding IS NOT NULL\r\n  AND 1 - (n.embedding <=> query_embedding) > similarity_threshold\r\n  \r\n  ORDER BY 4 DESC; -- Order by similarity\r\nEND;\r\n$function$\n"
  },
  {
    "args": "search_query text, current_user_id uuid, search_type text, page_offset integer, page_limit integer",
    "name": "search_by_type",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.search_by_type(search_query text, current_user_id uuid, search_type text, page_offset integer DEFAULT 0, page_limit integer DEFAULT 20)\n RETURNS TABLE(item_id uuid, title text, description text, tags text[], status text, project_id uuid, created_at timestamp with time zone, updated_at timestamp with time zone, relevance_score double precision, is_completed boolean, is_deleted boolean, matched_fields text[])\n LANGUAGE plpgsql\nAS $function$\nDECLARE\n    normalized_query text;\nBEGIN\n    normalized_query := lower(unaccent(trim(search_query)));\n    \n    IF search_type = 'braindump' THEN\n        RETURN QUERY\n        SELECT \n            bd.id as item_id,\n            bd.title::text as title,\n            COALESCE(LEFT(bd.ai_summary, 200), LEFT(bd.content, 200))::text as description,\n            bd.tags as tags,\n            bd.status::text as status,\n            bd.project_id as project_id,\n            bd.created_at,\n            bd.updated_at,\n            (\n                COALESCE(similarity(bd.title, normalized_query) * 3, 0) +\n                COALESCE(similarity(bd.content, normalized_query) * 2, 0) +\n                COALESCE(similarity(bd.ai_summary, normalized_query) * 2, 0) +\n                COALESCE(similarity(bd.ai_insights, normalized_query) * 1.5, 0) +\n                CASE WHEN bd.tags @> ARRAY[normalized_query] THEN 2 ELSE 0 END +\n                CASE bd.status::text\n                    WHEN 'pending' THEN 0.3\n                    WHEN 'parsed' THEN 0.5\n                    WHEN 'saved' THEN 0.5\n                    WHEN 'parsed_and_deleted' THEN -0.5\n                    ELSE 0\n                END +\n                CASE \n                    WHEN bd.created_at > NOW() - INTERVAL '7 days' THEN 0.5\n                    WHEN bd.created_at > NOW() - INTERVAL '30 days' THEN 0.2\n                    ELSE 0\n                END\n            ) as relevance_score,\n            false as is_completed,\n            CASE WHEN bd.status = 'parsed_and_deleted' THEN true ELSE false END as is_deleted,\n            ARRAY_REMOVE(ARRAY[\n                CASE WHEN bd.title ILIKE '%' || normalized_query || '%' THEN 'title' END,\n                CASE WHEN bd.content ILIKE '%' || normalized_query || '%' THEN 'content' END,\n                CASE WHEN bd.ai_summary ILIKE '%' || normalized_query || '%' THEN 'summary' END,\n                CASE WHEN bd.ai_insights ILIKE '%' || normalized_query || '%' THEN 'insights' END,\n                CASE WHEN bd.tags @> ARRAY[normalized_query] THEN 'tags' END\n            ], NULL) as matched_fields\n        FROM brain_dumps bd\n        WHERE \n            bd.user_id = current_user_id\n            AND (\n                bd.title ILIKE '%' || normalized_query || '%'\n                OR bd.content ILIKE '%' || normalized_query || '%'\n                OR bd.ai_summary ILIKE '%' || normalized_query || '%'\n                OR bd.ai_insights ILIKE '%' || normalized_query || '%'\n                OR bd.tags @> ARRAY[normalized_query]\n                OR similarity(bd.title, normalized_query) > 0.2\n                OR similarity(bd.content, normalized_query) > 0.2\n                OR similarity(bd.ai_summary, normalized_query) > 0.2\n            )\n        ORDER BY relevance_score DESC, bd.created_at DESC\n        OFFSET page_offset\n        LIMIT page_limit;\n        \n    ELSIF search_type = 'project' THEN\n        RETURN QUERY\n        SELECT \n            p.id as item_id,\n            p.name::text as title,\n            COALESCE(LEFT(p.description, 200), LEFT(p.executive_summary, 200))::text as description,\n            p.tags as tags,\n            p.status::text as status,\n            p.id as project_id,\n            p.created_at,\n            p.updated_at,\n            (\n                COALESCE(similarity(p.name, normalized_query) * 3, 0) +\n                COALESCE(similarity(p.description, normalized_query) * 2, 0) +\n                COALESCE(similarity(p.executive_summary, normalized_query) * 1.5, 0) +\n                COALESCE(similarity(p.context, normalized_query) * 1, 0) +\n                CASE WHEN p.tags @> ARRAY[normalized_query] THEN 2 ELSE 0 END +\n                CASE p.status::text\n                    WHEN 'active' THEN 0.5\n                    WHEN 'paused' THEN 0\n                    WHEN 'completed' THEN -0.5\n                    WHEN 'archived' THEN -1\n                    ELSE 0\n                END +\n                CASE \n                    WHEN p.updated_at > NOW() - INTERVAL '7 days' THEN 0.5\n                    WHEN p.updated_at > NOW() - INTERVAL '30 days' THEN 0.2\n                    ELSE 0\n                END\n            ) as relevance_score,\n            CASE WHEN p.status = 'completed' THEN true ELSE false END as is_completed,\n            CASE WHEN p.status = 'archived' THEN true ELSE false END as is_deleted,\n            ARRAY_REMOVE(ARRAY[\n                CASE WHEN p.name ILIKE '%' || normalized_query || '%' THEN 'name' END,\n                CASE WHEN p.description ILIKE '%' || normalized_query || '%' THEN 'description' END,\n                CASE WHEN p.executive_summary ILIKE '%' || normalized_query || '%' THEN 'summary' END,\n                CASE WHEN p.context ILIKE '%' || normalized_query || '%' THEN 'context' END,\n                CASE WHEN p.tags @> ARRAY[normalized_query] THEN 'tags' END\n            ], NULL) as matched_fields\n        FROM projects p\n        WHERE \n            p.user_id = current_user_id\n            AND (\n                p.name ILIKE '%' || normalized_query || '%'\n                OR p.description ILIKE '%' || normalized_query || '%'\n                OR p.executive_summary ILIKE '%' || normalized_query || '%'\n                OR p.context ILIKE '%' || normalized_query || '%'\n                OR p.tags @> ARRAY[normalized_query]\n                OR similarity(p.name, normalized_query) > 0.2\n                OR similarity(p.description, normalized_query) > 0.2\n                OR similarity(p.executive_summary, normalized_query) > 0.2\n            )\n        ORDER BY relevance_score DESC, p.updated_at DESC\n        OFFSET page_offset\n        LIMIT page_limit;\n        \n    ELSIF search_type = 'task' THEN\n        RETURN QUERY\n        SELECT \n            t.id as item_id,\n            t.title::text as title,\n            COALESCE(LEFT(t.description, 200), LEFT(t.details, 200))::text as description,\n            NULL::text[] as tags,\n            t.status::text as status,\n            t.project_id as project_id,\n            t.created_at,\n            t.updated_at,\n            (\n                COALESCE(similarity(t.title, normalized_query) * 3, 0) +\n                COALESCE(similarity(t.description, normalized_query) * 2, 0) +\n                COALESCE(similarity(t.details, normalized_query) * 1.5, 0) +\n                COALESCE(similarity(t.task_steps, normalized_query) * 1, 0) +\n                CASE t.priority::text\n                    WHEN 'high' THEN 0.5\n                    WHEN 'medium' THEN 0.2\n                    WHEN 'low' THEN 0\n                    ELSE 0\n                END +\n                CASE t.status::text\n                    WHEN 'backlog' THEN 0.3\n                    WHEN 'in_progress' THEN 0.7\n                    WHEN 'done' THEN -0.5\n                    WHEN 'blocked' THEN 0.1\n                    ELSE 0\n                END +\n                CASE \n                    WHEN t.updated_at > NOW() - INTERVAL '7 days' THEN 0.5\n                    WHEN t.updated_at > NOW() - INTERVAL '30 days' THEN 0.2\n                    ELSE 0\n                END\n            ) as relevance_score,\n            CASE WHEN t.status = 'done' THEN true ELSE false END as is_completed,\n            CASE WHEN t.deleted_at IS NOT NULL THEN true ELSE false END as is_deleted,\n            ARRAY_REMOVE(ARRAY[\n                CASE WHEN t.title ILIKE '%' || normalized_query || '%' THEN 'title' END,\n                CASE WHEN t.description ILIKE '%' || normalized_query || '%' THEN 'description' END,\n                CASE WHEN t.details ILIKE '%' || normalized_query || '%' THEN 'details' END,\n                CASE WHEN t.task_steps ILIKE '%' || normalized_query || '%' THEN 'steps' END\n            ], NULL) as matched_fields\n        FROM tasks t\n        WHERE \n            t.user_id = current_user_id\n            AND (\n                t.title ILIKE '%' || normalized_query || '%'\n                OR t.description ILIKE '%' || normalized_query || '%'\n                OR t.details ILIKE '%' || normalized_query || '%'\n                OR t.task_steps ILIKE '%' || normalized_query || '%'\n                OR similarity(t.title, normalized_query) > 0.2\n                OR similarity(t.description, normalized_query) > 0.2\n                OR similarity(t.details, normalized_query) > 0.2\n            )\n        ORDER BY relevance_score DESC, t.updated_at DESC\n        OFFSET page_offset\n        LIMIT page_limit;\n    END IF;\nEND;\n$function$\n"
  },
  {
    "args": "table_name text, query_embedding vector, similarity_threshold double precision, match_count integer",
    "name": "search_similar_items",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.search_similar_items(table_name text, query_embedding vector, similarity_threshold double precision DEFAULT 0.8, match_count integer DEFAULT 5)\n RETURNS TABLE(id uuid, content text, similarity double precision)\n LANGUAGE plpgsql\nAS $function$\r\nBEGIN\r\n  IF table_name = 'projects' THEN\r\n    RETURN QUERY\r\n    SELECT p.id, p.name::text, 1 - (p.embedding <=> query_embedding) as similarity\r\n    FROM projects p\r\n    WHERE p.embedding IS NOT NULL\r\n    AND 1 - (p.embedding <=> query_embedding) > similarity_threshold\r\n    ORDER BY p.embedding <=> query_embedding\r\n    LIMIT match_count;\r\n  ELSIF table_name = 'tasks' THEN\r\n    RETURN QUERY\r\n    SELECT t.id, t.title::text, 1 - (t.embedding <=> query_embedding) as similarity\r\n    FROM tasks t\r\n    WHERE t.embedding IS NOT NULL\r\n    AND 1 - (t.embedding <=> query_embedding) > similarity_threshold\r\n    ORDER BY t.embedding <=> query_embedding\r\n    LIMIT match_count;\r\n  -- Add more table cases as needed\r\n  END IF;\r\nEND;\r\n$function$\n"
  },
  {
    "args": "real",
    "name": "set_limit",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.set_limit(real)\n RETURNS real\n LANGUAGE c\n STRICT\nAS '$libdir/pg_trgm', $function$set_limit$function$\n"
  },
  {
    "args": "",
    "name": "set_project_log_actor",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.set_project_log_actor()\n RETURNS trigger\n LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO 'public'\nAS $function$\nBEGIN\n  IF NEW.changed_by_actor_id IS NULL THEN\n    NEW.changed_by_actor_id := current_actor_id();\n  END IF;\n\n  IF NEW.changed_by_actor_id IS NULL AND NEW.changed_by IS NOT NULL THEN\n    SELECT id INTO NEW.changed_by_actor_id\n    FROM onto_actors\n    WHERE user_id = NEW.changed_by;\n  END IF;\n\n  RETURN NEW;\nEND;\n$function$\n"
  },
  {
    "args": "",
    "name": "set_updated_at",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.set_updated_at()\n RETURNS trigger\n LANGUAGE plpgsql\nAS $function$\nbegin\n  new.updated_at = now();\n  return new;\nend$function$\n"
  },
  {
    "args": "",
    "name": "set_user_trial_period",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.set_user_trial_period()\n RETURNS trigger\n LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO 'public'\nAS $function$\nDECLARE\n  v_trial_days INTEGER;\nBEGIN\n  -- Get trial days from environment or use default\n  v_trial_days := COALESCE(\n    current_setting('app.trial_days', true)::INTEGER,\n    14\n  );\n\n  -- Set trial end date and subscription status for new users\n  IF NEW.subscription_status IS NULL OR NEW.subscription_status = 'free' THEN\n    NEW.subscription_status := 'trialing';\n    NEW.trial_ends_at := NOW() + (v_trial_days || ' days')::INTERVAL;\n  END IF;\n\n  RETURN NEW;\nEND;\n$function$\n"
  },
  {
    "args": "",
    "name": "show_limit",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.show_limit()\n RETURNS real\n LANGUAGE c\n STABLE PARALLEL SAFE STRICT\nAS '$libdir/pg_trgm', $function$show_limit$function$\n"
  },
  {
    "args": "text",
    "name": "show_trgm",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.show_trgm(text)\n RETURNS text[]\n LANGUAGE c\n IMMUTABLE PARALLEL SAFE STRICT\nAS '$libdir/pg_trgm', $function$show_trgm$function$\n"
  },
  {
    "args": "text, text",
    "name": "similarity",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.similarity(text, text)\n RETURNS real\n LANGUAGE c\n IMMUTABLE PARALLEL SAFE STRICT\nAS '$libdir/pg_trgm', $function$similarity$function$\n"
  },
  {
    "args": "text, text",
    "name": "similarity_dist",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.similarity_dist(text, text)\n RETURNS real\n LANGUAGE c\n IMMUTABLE PARALLEL SAFE STRICT\nAS '$libdir/pg_trgm', $function$similarity_dist$function$\n"
  },
  {
    "args": "text, text",
    "name": "similarity_op",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.similarity_op(text, text)\n RETURNS boolean\n LANGUAGE c\n STABLE PARALLEL SAFE STRICT\nAS '$libdir/pg_trgm', $function$similarity_op$function$\n"
  },
  {
    "args": "p_project_id uuid",
    "name": "soft_delete_onto_project",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.soft_delete_onto_project(p_project_id uuid)\n RETURNS void\n LANGUAGE plpgsql\nAS $function$\nDECLARE\n  v_now TIMESTAMPTZ := now();\nBEGIN\n  IF p_project_id IS NULL THEN\n    RAISE EXCEPTION 'Project ID required';\n  END IF;\n\n  -- Soft delete all child entities that support soft delete\n  -- Note: Not all child tables have deleted_at columns, so we only update those that do\n\n  -- Soft delete tasks\n  UPDATE onto_tasks\n  SET deleted_at = v_now, updated_at = v_now\n  WHERE project_id = p_project_id AND deleted_at IS NULL;\n\n  -- Soft delete plans\n  UPDATE onto_plans\n  SET deleted_at = v_now, updated_at = v_now\n  WHERE project_id = p_project_id AND deleted_at IS NULL;\n\n  -- Soft delete goals\n  UPDATE onto_goals\n  SET deleted_at = v_now, updated_at = v_now\n  WHERE project_id = p_project_id AND deleted_at IS NULL;\n\n  -- Soft delete documents\n  UPDATE onto_documents\n  SET deleted_at = v_now, updated_at = v_now\n  WHERE project_id = p_project_id AND deleted_at IS NULL;\n\n  -- Soft delete outputs\n  UPDATE onto_outputs\n  SET deleted_at = v_now, updated_at = v_now\n  WHERE project_id = p_project_id AND deleted_at IS NULL;\n\n  -- Soft delete milestones\n  UPDATE onto_milestones\n  SET deleted_at = v_now, updated_at = v_now\n  WHERE project_id = p_project_id AND deleted_at IS NULL;\n\n  -- Soft delete risks\n  UPDATE onto_risks\n  SET deleted_at = v_now, updated_at = v_now\n  WHERE project_id = p_project_id AND deleted_at IS NULL;\n\n  -- Soft delete decisions\n  UPDATE onto_decisions\n  SET deleted_at = v_now, updated_at = v_now\n  WHERE project_id = p_project_id AND deleted_at IS NULL;\n\n  -- Soft delete events\n  UPDATE onto_events\n  SET deleted_at = v_now, updated_at = v_now\n  WHERE project_id = p_project_id AND deleted_at IS NULL;\n\n  -- Soft delete requirements (if it has deleted_at)\n  UPDATE onto_requirements\n  SET deleted_at = v_now, updated_at = v_now\n  WHERE project_id = p_project_id AND deleted_at IS NULL;\n\n  -- Finally soft delete the project\n  UPDATE onto_projects\n  SET deleted_at = v_now, updated_at = v_now\n  WHERE id = p_project_id AND deleted_at IS NULL;\nEND;\n$function$\n"
  },
  {
    "args": "sparsevec, integer, boolean",
    "name": "sparsevec",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.sparsevec(sparsevec, integer, boolean)\n RETURNS sparsevec\n LANGUAGE c\n IMMUTABLE PARALLEL SAFE STRICT\nAS '$libdir/vector', $function$sparsevec$function$\n"
  },
  {
    "args": "sparsevec, sparsevec",
    "name": "sparsevec_cmp",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.sparsevec_cmp(sparsevec, sparsevec)\n RETURNS integer\n LANGUAGE c\n IMMUTABLE PARALLEL SAFE STRICT\nAS '$libdir/vector', $function$sparsevec_cmp$function$\n"
  },
  {
    "args": "sparsevec, sparsevec",
    "name": "sparsevec_eq",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.sparsevec_eq(sparsevec, sparsevec)\n RETURNS boolean\n LANGUAGE c\n IMMUTABLE PARALLEL SAFE STRICT\nAS '$libdir/vector', $function$sparsevec_eq$function$\n"
  },
  {
    "args": "sparsevec, sparsevec",
    "name": "sparsevec_ge",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.sparsevec_ge(sparsevec, sparsevec)\n RETURNS boolean\n LANGUAGE c\n IMMUTABLE PARALLEL SAFE STRICT\nAS '$libdir/vector', $function$sparsevec_ge$function$\n"
  },
  {
    "args": "sparsevec, sparsevec",
    "name": "sparsevec_gt",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.sparsevec_gt(sparsevec, sparsevec)\n RETURNS boolean\n LANGUAGE c\n IMMUTABLE PARALLEL SAFE STRICT\nAS '$libdir/vector', $function$sparsevec_gt$function$\n"
  },
  {
    "args": "cstring, oid, integer",
    "name": "sparsevec_in",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.sparsevec_in(cstring, oid, integer)\n RETURNS sparsevec\n LANGUAGE c\n IMMUTABLE PARALLEL SAFE STRICT\nAS '$libdir/vector', $function$sparsevec_in$function$\n"
  },
  {
    "args": "sparsevec, sparsevec",
    "name": "sparsevec_l2_squared_distance",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.sparsevec_l2_squared_distance(sparsevec, sparsevec)\n RETURNS double precision\n LANGUAGE c\n IMMUTABLE PARALLEL SAFE STRICT\nAS '$libdir/vector', $function$sparsevec_l2_squared_distance$function$\n"
  },
  {
    "args": "sparsevec, sparsevec",
    "name": "sparsevec_le",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.sparsevec_le(sparsevec, sparsevec)\n RETURNS boolean\n LANGUAGE c\n IMMUTABLE PARALLEL SAFE STRICT\nAS '$libdir/vector', $function$sparsevec_le$function$\n"
  },
  {
    "args": "sparsevec, sparsevec",
    "name": "sparsevec_lt",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.sparsevec_lt(sparsevec, sparsevec)\n RETURNS boolean\n LANGUAGE c\n IMMUTABLE PARALLEL SAFE STRICT\nAS '$libdir/vector', $function$sparsevec_lt$function$\n"
  },
  {
    "args": "sparsevec, sparsevec",
    "name": "sparsevec_ne",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.sparsevec_ne(sparsevec, sparsevec)\n RETURNS boolean\n LANGUAGE c\n IMMUTABLE PARALLEL SAFE STRICT\nAS '$libdir/vector', $function$sparsevec_ne$function$\n"
  },
  {
    "args": "sparsevec, sparsevec",
    "name": "sparsevec_negative_inner_product",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.sparsevec_negative_inner_product(sparsevec, sparsevec)\n RETURNS double precision\n LANGUAGE c\n IMMUTABLE PARALLEL SAFE STRICT\nAS '$libdir/vector', $function$sparsevec_negative_inner_product$function$\n"
  },
  {
    "args": "sparsevec",
    "name": "sparsevec_out",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.sparsevec_out(sparsevec)\n RETURNS cstring\n LANGUAGE c\n IMMUTABLE PARALLEL SAFE STRICT\nAS '$libdir/vector', $function$sparsevec_out$function$\n"
  },
  {
    "args": "internal, oid, integer",
    "name": "sparsevec_recv",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.sparsevec_recv(internal, oid, integer)\n RETURNS sparsevec\n LANGUAGE c\n IMMUTABLE PARALLEL SAFE STRICT\nAS '$libdir/vector', $function$sparsevec_recv$function$\n"
  },
  {
    "args": "sparsevec",
    "name": "sparsevec_send",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.sparsevec_send(sparsevec)\n RETURNS bytea\n LANGUAGE c\n IMMUTABLE PARALLEL SAFE STRICT\nAS '$libdir/vector', $function$sparsevec_send$function$\n"
  },
  {
    "args": "sparsevec, integer, boolean",
    "name": "sparsevec_to_halfvec",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.sparsevec_to_halfvec(sparsevec, integer, boolean)\n RETURNS halfvec\n LANGUAGE c\n IMMUTABLE PARALLEL SAFE STRICT\nAS '$libdir/vector', $function$sparsevec_to_halfvec$function$\n"
  },
  {
    "args": "sparsevec, integer, boolean",
    "name": "sparsevec_to_vector",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.sparsevec_to_vector(sparsevec, integer, boolean)\n RETURNS vector\n LANGUAGE c\n IMMUTABLE PARALLEL SAFE STRICT\nAS '$libdir/vector', $function$sparsevec_to_vector$function$\n"
  },
  {
    "args": "cstring[]",
    "name": "sparsevec_typmod_in",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.sparsevec_typmod_in(cstring[])\n RETURNS integer\n LANGUAGE c\n IMMUTABLE PARALLEL SAFE STRICT\nAS '$libdir/vector', $function$sparsevec_typmod_in$function$\n"
  },
  {
    "args": "p_user_id uuid, p_brief_date date, p_force_regenerate boolean",
    "name": "start_or_resume_brief_generation",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.start_or_resume_brief_generation(p_user_id uuid, p_brief_date date, p_force_regenerate boolean DEFAULT false)\n RETURNS TABLE(started boolean, brief_id uuid, message text)\n LANGUAGE plpgsql\n SECURITY DEFINER\nAS $function$\nDECLARE\n  v_existing_brief RECORD;\n  v_brief_id UUID;\n  v_message TEXT;\n  v_started BOOLEAN DEFAULT FALSE;\nBEGIN\n  -- Lock the row for this user and date to prevent concurrent modifications\n  SELECT * INTO v_existing_brief\n  FROM daily_briefs\n  WHERE user_id = p_user_id AND brief_date = p_brief_date\n  FOR UPDATE;\n\n  -- Check if brief exists and its status\n  IF v_existing_brief.id IS NOT NULL THEN\n    -- Check if we should force regenerate\n    IF p_force_regenerate THEN\n      -- Update existing brief to restart generation\n      UPDATE daily_briefs\n      SET\n        generation_status = 'processing',\n        generation_started_at = NOW(),\n        generation_error = NULL,\n        generation_completed_at = NULL,\n        generation_progress = jsonb_build_object('step', 'starting', 'progress', 0),\n        updated_at = NOW()\n      WHERE id = v_existing_brief.id;\n\n      v_brief_id := v_existing_brief.id;\n      v_started := TRUE;\n      v_message := 'Brief generation restarted';\n    ELSIF v_existing_brief.generation_status = 'processing' THEN\n      -- Brief is already being processed\n      RAISE EXCEPTION 'P0001:Brief generation already in progress' USING HINT = 'already in progress';\n    ELSIF v_existing_brief.generation_status = 'completed' AND NOT p_force_regenerate THEN\n      -- Brief already completed and not forcing\n      RAISE EXCEPTION 'P0002:Brief already completed for this date' USING HINT = 'already completed';\n    ELSE\n      -- Resume a failed generation\n      UPDATE daily_briefs\n      SET\n        generation_status = 'processing',\n        generation_started_at = NOW(),\n        generation_error = NULL,\n        updated_at = NOW()\n      WHERE id = v_existing_brief.id;\n\n      v_brief_id := v_existing_brief.id;\n      v_started := TRUE;\n      v_message := 'Brief generation resumed';\n    END IF;\n  ELSE\n    -- Create new brief\n    INSERT INTO daily_briefs (\n      user_id,\n      brief_date,\n      summary_content,\n      generation_status,\n      generation_started_at,\n      generation_progress\n    )\n    VALUES (\n      p_user_id,\n      p_brief_date,\n      '',\n      'processing',\n      NOW(),\n      jsonb_build_object('step', 'starting', 'progress', 0)\n    )\n    RETURNING id INTO v_brief_id;\n\n    v_started := TRUE;\n    v_message := 'New brief generation started';\n  END IF;\n\n  -- Return the result\n  RETURN QUERY\n  SELECT v_started, v_brief_id, v_message;\nEND;\n$function$\n"
  },
  {
    "args": "text, text",
    "name": "strict_word_similarity",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.strict_word_similarity(text, text)\n RETURNS real\n LANGUAGE c\n IMMUTABLE PARALLEL SAFE STRICT\nAS '$libdir/pg_trgm', $function$strict_word_similarity$function$\n"
  },
  {
    "args": "text, text",
    "name": "strict_word_similarity_commutator_op",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.strict_word_similarity_commutator_op(text, text)\n RETURNS boolean\n LANGUAGE c\n STABLE PARALLEL SAFE STRICT\nAS '$libdir/pg_trgm', $function$strict_word_similarity_commutator_op$function$\n"
  },
  {
    "args": "text, text",
    "name": "strict_word_similarity_dist_commutator_op",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.strict_word_similarity_dist_commutator_op(text, text)\n RETURNS real\n LANGUAGE c\n IMMUTABLE PARALLEL SAFE STRICT\nAS '$libdir/pg_trgm', $function$strict_word_similarity_dist_commutator_op$function$\n"
  },
  {
    "args": "text, text",
    "name": "strict_word_similarity_dist_op",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.strict_word_similarity_dist_op(text, text)\n RETURNS real\n LANGUAGE c\n IMMUTABLE PARALLEL SAFE STRICT\nAS '$libdir/pg_trgm', $function$strict_word_similarity_dist_op$function$\n"
  },
  {
    "args": "text, text",
    "name": "strict_word_similarity_op",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.strict_word_similarity_op(text, text)\n RETURNS boolean\n LANGUAGE c\n STABLE PARALLEL SAFE STRICT\nAS '$libdir/pg_trgm', $function$strict_word_similarity_op$function$\n"
  },
  {
    "args": "halfvec, integer, integer",
    "name": "subvector",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.subvector(halfvec, integer, integer)\n RETURNS halfvec\n LANGUAGE c\n IMMUTABLE PARALLEL SAFE STRICT\nAS '$libdir/vector', $function$halfvec_subvector$function$\n"
  },
  {
    "args": "vector, integer, integer",
    "name": "subvector",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.subvector(vector, integer, integer)\n RETURNS vector\n LANGUAGE c\n IMMUTABLE PARALLEL SAFE STRICT\nAS '$libdir/vector', $function$subvector$function$\n"
  },
  {
    "args": "",
    "name": "sync_legacy_mapping_from_props",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.sync_legacy_mapping_from_props()\n RETURNS trigger\n LANGUAGE plpgsql\nAS $function$\ndeclare\n\tlegacy_text text;\n\tlegacy_id uuid;\n\tmetadata jsonb;\nbegin\n\tif TG_ARGV[0] is null or TG_ARGV[1] is null then\n\t\treturn NEW;\n\tend if;\n\n\tif NEW.props is null then\n\t\treturn NEW;\n\tend if;\n\n\tlegacy_text := nullif(NEW.props->>'legacy_id', '');\n\tif legacy_text is null then\n\t\treturn NEW;\n\tend if;\n\n\tbegin\n\t\tlegacy_id := legacy_text::uuid;\n\texception\n\t\twhen invalid_text_representation then\n\t\t\t-- Ignore rows where legacy_id is not a valid UUID\n\t\t\treturn NEW;\n\tend;\n\n\tmetadata := jsonb_build_object(\n\t\t'source', 'trigger',\n\t\t'table', TG_TABLE_NAME,\n\t\t'operation', TG_OP\n\t);\n\n\tperform upsert_legacy_entity_mapping(TG_ARGV[0], legacy_id, TG_ARGV[1], NEW.id, metadata);\n\n\treturn NEW;\nend;\n$function$\n"
  },
  {
    "args": "p_series_id uuid, p_force boolean",
    "name": "task_series_delete",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.task_series_delete(p_series_id uuid, p_force boolean DEFAULT false)\n RETURNS TABLE(deleted_master integer, deleted_instances integer)\n LANGUAGE plpgsql\nAS $function$\ndeclare\n  v_deleted_instances integer := 0;\n  v_deleted_master integer := 0;\nbegin\n  delete from onto_tasks\n  where\n    props->>'series_id' = p_series_id\n    and coalesce(props->'series'->>'role', '') = 'instance'\n    and (p_force or state_key = 'todo');\n\n  get diagnostics v_deleted_instances = ROW_COUNT;\n\n  delete from onto_tasks\n  where\n    props->>'series_id' = p_series_id\n    and coalesce(props->'series'->>'role', '') = 'master';\n\n  get diagnostics v_deleted_master = ROW_COUNT;\n\n  if not p_force then\n    update onto_tasks\n      set\n        props = (props - 'series_id') - 'series',\n        updated_at = now()\n      where props->>'series_id' = p_series_id;\n  end if;\n\n  return query select coalesce(v_deleted_master, 0), coalesce(v_deleted_instances, 0);\nend;\n$function$\n"
  },
  {
    "args": "p_task_id uuid, p_series_id uuid, p_master_props jsonb, p_instance_rows jsonb",
    "name": "task_series_enable",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.task_series_enable(p_task_id uuid, p_series_id uuid, p_master_props jsonb, p_instance_rows jsonb)\n RETURNS void\n LANGUAGE plpgsql\nAS $function$\nbegin\n  update onto_tasks\n    set\n      props = p_master_props,\n      updated_at = now()\n    where id = p_task_id;\n\n  insert into onto_tasks (\n    project_id,\n    plan_id,\n    title,\n    state_key,\n    due_at,\n    priority,\n    props,\n    created_by\n  )\n  select\n    (instance->>'project_id')::uuid,\n    nullif(instance->>'plan_id', '')::uuid,\n    instance->>'title',\n    coalesce(instance->>'state_key', 'todo'),\n    (instance->>'due_at')::timestamptz,\n    nullif(instance->>'priority', '')::int,\n    coalesce(instance->'props', '{}'::jsonb),\n    (instance->>'created_by')::uuid\n  from jsonb_array_elements(p_instance_rows) as instance;\nend;\n$function$\n"
  },
  {
    "args": "regdictionary, text",
    "name": "unaccent",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.unaccent(regdictionary, text)\n RETURNS text\n LANGUAGE c\n STABLE PARALLEL SAFE STRICT\nAS '$libdir/unaccent', $function$unaccent_dict$function$\n"
  },
  {
    "args": "text",
    "name": "unaccent",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.unaccent(text)\n RETURNS text\n LANGUAGE c\n STABLE PARALLEL SAFE STRICT\nAS '$libdir/unaccent', $function$unaccent_dict$function$\n"
  },
  {
    "args": "internal",
    "name": "unaccent_init",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.unaccent_init(internal)\n RETURNS internal\n LANGUAGE c\n PARALLEL SAFE\nAS '$libdir/unaccent', $function$unaccent_init$function$\n"
  },
  {
    "args": "internal, internal, internal, internal",
    "name": "unaccent_lexize",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.unaccent_lexize(internal, internal, internal, internal)\n RETURNS internal\n LANGUAGE c\n PARALLEL SAFE\nAS '$libdir/unaccent', $function$unaccent_lexize$function$\n"
  },
  {
    "args": "",
    "name": "update_agent_plans_updated_at",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.update_agent_plans_updated_at()\n RETURNS trigger\n LANGUAGE plpgsql\nAS $function$\nBEGIN\n    NEW.updated_at = NOW();\n    RETURN NEW;\nEND;\n$function$\n"
  },
  {
    "args": "",
    "name": "update_chat_session_stats",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.update_chat_session_stats()\n RETURNS trigger\n LANGUAGE plpgsql\nAS $function$\nBEGIN\n  IF TG_OP = 'INSERT' THEN\n    UPDATE chat_sessions\n    SET\n      message_count = message_count + 1,\n      total_tokens_used = total_tokens_used + COALESCE(NEW.total_tokens, 0),\n      last_message_at = NEW.created_at,\n      updated_at = NOW()\n    WHERE id = NEW.session_id;\n  END IF;\n  RETURN NEW;\nEND;\n$function$\n"
  },
  {
    "args": "",
    "name": "update_draft_tasks_updated_at",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.update_draft_tasks_updated_at()\n RETURNS trigger\n LANGUAGE plpgsql\nAS $function$\nBEGIN\n    NEW.updated_at = CURRENT_TIMESTAMP;\n    RETURN NEW;\nEND;\n$function$\n"
  },
  {
    "args": "",
    "name": "update_error_logs_updated_at",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.update_error_logs_updated_at()\n RETURNS trigger\n LANGUAGE plpgsql\nAS $function$\nBEGIN\n    NEW.updated_at = NOW();\n    RETURN NEW;\nEND;\n$function$\n"
  },
  {
    "args": "p_user_id uuid, p_date date",
    "name": "update_llm_usage_summary",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.update_llm_usage_summary(p_user_id uuid, p_date date)\n RETURNS void\n LANGUAGE plpgsql\n SECURITY DEFINER\nAS $function$\r\nDECLARE\r\n  v_models_breakdown JSONB;\r\n  v_operations_breakdown JSONB;\r\nBEGIN\r\n  -- Build models breakdown\r\n  SELECT jsonb_object_agg(\r\n    model_used,\r\n    jsonb_build_object(\r\n      'requests', COUNT(*),\r\n      'cost', SUM(total_cost_usd),\r\n      'tokens', SUM(total_tokens)\r\n    )\r\n  )\r\n  INTO v_models_breakdown\r\n  FROM llm_usage_logs\r\n  WHERE user_id = p_user_id\r\n    AND created_at >= p_date::timestamp\r\n    AND created_at < (p_date + INTERVAL '1 day')::timestamp\r\n  GROUP BY model_used;\r\n\r\n  -- Build operations breakdown\r\n  SELECT jsonb_object_agg(\r\n    operation_type::text,\r\n    jsonb_build_object(\r\n      'requests', COUNT(*),\r\n      'cost', SUM(total_cost_usd),\r\n      'tokens', SUM(total_tokens)\r\n    )\r\n  )\r\n  INTO v_operations_breakdown\r\n  FROM llm_usage_logs\r\n  WHERE user_id = p_user_id\r\n    AND created_at >= p_date::timestamp\r\n    AND created_at < (p_date + INTERVAL '1 day')::timestamp\r\n  GROUP BY operation_type;\r\n\r\n  -- Upsert summary\r\n  INSERT INTO llm_usage_summary (\r\n    user_id,\r\n    summary_date,\r\n    summary_type,\r\n    total_requests,\r\n    successful_requests,\r\n    failed_requests,\r\n    total_tokens,\r\n    total_prompt_tokens,\r\n    total_completion_tokens,\r\n    total_cost_usd,\r\n    avg_response_time_ms,\r\n    min_response_time_ms,\r\n    max_response_time_ms,\r\n    models_used,\r\n    operations_breakdown\r\n  )\r\n  SELECT\r\n    p_user_id,\r\n    p_date,\r\n    'daily',\r\n    COUNT(*),\r\n    COUNT(*) FILTER (WHERE status = 'success'),\r\n    COUNT(*) FILTER (WHERE status != 'success'),\r\n    SUM(total_tokens),\r\n    SUM(prompt_tokens),\r\n    SUM(completion_tokens),\r\n    SUM(total_cost_usd),\r\n    AVG(response_time_ms)::INTEGER,\r\n    MIN(response_time_ms),\r\n    MAX(response_time_ms),\r\n    v_models_breakdown,\r\n    v_operations_breakdown\r\n  FROM llm_usage_logs\r\n  WHERE user_id = p_user_id\r\n    AND created_at >= p_date::timestamp\r\n    AND created_at < (p_date + INTERVAL '1 day')::timestamp\r\n  ON CONFLICT (user_id, summary_date, summary_type)\r\n  DO UPDATE SET\r\n    total_requests = EXCLUDED.total_requests,\r\n    successful_requests = EXCLUDED.successful_requests,\r\n    failed_requests = EXCLUDED.failed_requests,\r\n    total_tokens = EXCLUDED.total_tokens,\r\n    total_prompt_tokens = EXCLUDED.total_prompt_tokens,\r\n    total_completion_tokens = EXCLUDED.total_completion_tokens,\r\n    total_cost_usd = EXCLUDED.total_cost_usd,\r\n    avg_response_time_ms = EXCLUDED.avg_response_time_ms,\r\n    min_response_time_ms = EXCLUDED.min_response_time_ms,\r\n    max_response_time_ms = EXCLUDED.max_response_time_ms,\r\n    models_used = EXCLUDED.models_used,\r\n    operations_breakdown = EXCLUDED.operations_breakdown,\r\n    updated_at = NOW();\r\nEND;\r\n$function$\n"
  },
  {
    "args": "",
    "name": "update_notification_updated_at",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.update_notification_updated_at()\n RETURNS trigger\n LANGUAGE plpgsql\nAS $function$\nBEGIN\n  NEW.updated_at = NOW();\n  RETURN NEW;\nEND;\n$function$\n"
  },
  {
    "args": "",
    "name": "update_onto_documents_updated_at",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.update_onto_documents_updated_at()\n RETURNS trigger\n LANGUAGE plpgsql\nAS $function$\nbegin\n  new.updated_at = now();\n  return new;\nend;\n$function$\n"
  },
  {
    "args": "",
    "name": "update_project_drafts_updated_at",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.update_project_drafts_updated_at()\n RETURNS trigger\n LANGUAGE plpgsql\nAS $function$\nBEGIN\n    NEW.updated_at = CURRENT_TIMESTAMP;\n    RETURN NEW;\nEND;\n$function$\n"
  },
  {
    "args": "",
    "name": "update_recurring_tasks_on_project_change",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.update_recurring_tasks_on_project_change()\n RETURNS trigger\n LANGUAGE plpgsql\nAS $function$\nBEGIN\n    -- Only proceed if project end_date changed\n    IF OLD.end_date IS DISTINCT FROM NEW.end_date THEN\n        -- Update tasks with project-inherited end dates\n        UPDATE tasks\n        SET \n            recurrence_ends = NEW.end_date,\n            updated_at = NOW()\n        WHERE project_id = NEW.id\n            AND task_type = 'recurring'\n            AND recurrence_end_source = 'project_inherited'\n            AND deleted_at IS NULL;\n            \n        -- Log the update for audit trail\n        INSERT INTO recurring_task_migration_log (\n            task_id,\n            user_id,\n            project_id,\n            migration_type,\n            old_recurrence_ends,\n            new_recurrence_ends,\n            status\n        )\n        SELECT \n            id,\n            user_id,\n            project_id,\n            'project_update_cascade',\n            OLD.end_date,\n            NEW.end_date,\n            'completed'\n        FROM tasks\n        WHERE project_id = NEW.id\n            AND task_type = 'recurring'\n            AND recurrence_end_source = 'project_inherited'\n            AND deleted_at IS NULL;\n    END IF;\n    \n    RETURN NEW;\nEND;\n$function$\n"
  },
  {
    "args": "p_message_id uuid, p_twilio_sid text, p_twilio_status text, p_mapped_status text, p_error_code integer, p_error_message text",
    "name": "update_sms_status_atomic",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.update_sms_status_atomic(p_message_id uuid, p_twilio_sid text, p_twilio_status text, p_mapped_status text, p_error_code integer DEFAULT NULL::integer, p_error_message text DEFAULT NULL::text)\n RETURNS TABLE(notification_delivery_id uuid, user_id uuid, sent_at timestamp with time zone, delivered_at timestamp with time zone, attempt_count integer, max_attempts integer, priority text, updated_sms boolean, updated_delivery boolean)\n LANGUAGE plpgsql\nAS $function$\nDECLARE\n  v_sms_record RECORD;\n  v_delivery_status TEXT;\n  v_timestamp TIMESTAMPTZ := NOW();\n  v_sms_updated BOOLEAN := FALSE;\n  v_delivery_updated BOOLEAN := FALSE;\nBEGIN\n  -- Start transaction (function is atomic by default)\n\n  -- Prepare SMS message update data\n  -- Build status-specific timestamps\n  DECLARE\n    v_sms_update_sent_at TIMESTAMPTZ;\n    v_sms_update_delivered_at TIMESTAMPTZ;\n  BEGIN\n    -- Determine sent_at timestamp\n    IF p_twilio_status IN ('sent', 'sending') THEN\n      v_sms_update_sent_at := v_timestamp;\n    ELSE\n      v_sms_update_sent_at := NULL; -- Don't update if not sent\n    END IF;\n\n    -- Determine delivered_at timestamp\n    IF p_twilio_status = 'delivered' THEN\n      v_sms_update_delivered_at := v_timestamp;\n    ELSE\n      v_sms_update_delivered_at := NULL;\n    END IF;\n\n    -- Update sms_messages table\n    UPDATE sms_messages\n    SET\n      twilio_status = p_twilio_status,\n      status = p_mapped_status::sms_status,\n      sent_at = COALESCE(v_sms_update_sent_at, sms_messages.sent_at),\n      delivered_at = COALESCE(v_sms_update_delivered_at, sms_messages.delivered_at),\n      twilio_error_code = COALESCE(p_error_code, sms_messages.twilio_error_code),\n      twilio_error_message = COALESCE(p_error_message, sms_messages.twilio_error_message),\n      updated_at = v_timestamp\n    WHERE sms_messages.id = p_message_id\n      AND sms_messages.twilio_sid = p_twilio_sid\n    RETURNING\n      sms_messages.notification_delivery_id,\n      sms_messages.user_id,\n      sms_messages.sent_at,\n      sms_messages.delivered_at,\n      sms_messages.attempt_count,\n      sms_messages.max_attempts,\n      sms_messages.priority\n    INTO v_sms_record;\n\n    IF FOUND THEN\n      v_sms_updated := TRUE;\n    ELSE\n      -- SMS message not found, return early\n      RETURN QUERY SELECT\n        NULL::UUID,\n        NULL::UUID,\n        NULL::TIMESTAMPTZ,\n        NULL::TIMESTAMPTZ,\n        NULL::INTEGER,\n        NULL::INTEGER,\n        NULL::TEXT,\n        FALSE,\n        FALSE;\n      RETURN;\n    END IF;\n  END;\n\n  -- Update notification_deliveries if linked\n  IF v_sms_record.notification_delivery_id IS NOT NULL THEN\n    -- Map Twilio status to notification delivery status\n    v_delivery_status := CASE\n      WHEN p_twilio_status IN ('queued', 'accepted') THEN 'pending'\n      WHEN p_twilio_status IN ('sending', 'sent', 'receiving') THEN 'sent'\n      WHEN p_twilio_status IN ('received', 'delivered') THEN 'delivered'\n      WHEN p_twilio_status IN ('failed', 'undelivered', 'canceled') THEN 'failed'\n      ELSE 'pending'\n    END;\n\n    -- Prepare delivery update with conditional timestamps\n    UPDATE notification_deliveries\n    SET\n      status = v_delivery_status::notification_status,\n      sent_at = CASE\n        WHEN p_twilio_status IN ('sent', 'sending', 'receiving') THEN v_timestamp\n        ELSE notification_deliveries.sent_at\n      END,\n      delivered_at = CASE\n        WHEN p_twilio_status IN ('delivered', 'received') THEN v_timestamp\n        ELSE notification_deliveries.delivered_at\n      END,\n      failed_at = CASE\n        WHEN p_twilio_status IN ('failed', 'undelivered', 'canceled') THEN v_timestamp\n        ELSE notification_deliveries.failed_at\n      END,\n      last_error = CASE\n        WHEN p_error_message IS NOT NULL THEN\n          CASE\n            WHEN p_error_code IS NOT NULL THEN p_error_message || ' (Code: ' || p_error_code || ')'\n            ELSE p_error_message\n          END\n        WHEN p_error_code IS NOT NULL THEN 'Twilio error code: ' || p_error_code\n        ELSE notification_deliveries.last_error\n      END,\n      updated_at = v_timestamp\n    WHERE notification_deliveries.id = v_sms_record.notification_delivery_id;\n\n    IF FOUND THEN\n      v_delivery_updated := TRUE;\n    END IF;\n  END IF;\n\n  -- Return result with all relevant data\n  RETURN QUERY SELECT\n    v_sms_record.notification_delivery_id,\n    v_sms_record.user_id,\n    v_sms_record.sent_at,\n    v_sms_record.delivered_at,\n    v_sms_record.attempt_count,\n    v_sms_record.max_attempts,\n    v_sms_record.priority,\n    v_sms_updated,\n    v_delivery_updated;\nEND;\n$function$\n"
  },
  {
    "args": "",
    "name": "update_task_due_date_on_phase_assignment",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.update_task_due_date_on_phase_assignment()\n RETURNS trigger\n LANGUAGE plpgsql\nAS $function$\r\nBEGIN\r\n    -- Update the task's due date to the suggested date if provided\r\n    IF NEW.suggested_due_date IS NOT NULL THEN\r\n        UPDATE tasks \r\n        SET due_date = NEW.suggested_due_date,\r\n            updated_at = CURRENT_TIMESTAMP\r\n        WHERE id = NEW.task_id;\r\n    END IF;\r\n    \r\n    RETURN NEW;\r\nEND;\r\n$function$\n"
  },
  {
    "args": "",
    "name": "update_tool_call_count",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.update_tool_call_count()\n RETURNS trigger\n LANGUAGE plpgsql\nAS $function$\nBEGIN\n  IF TG_OP = 'INSERT' THEN\n    UPDATE chat_sessions\n    SET\n      tool_call_count = tool_call_count + 1,\n      updated_at = NOW()\n    WHERE id = NEW.session_id;\n  END IF;\n  RETURN NEW;\nEND;\n$function$\n"
  },
  {
    "args": "",
    "name": "update_updated_at_column",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.update_updated_at_column()\n RETURNS trigger\n LANGUAGE plpgsql\nAS $function$\nBEGIN\n  NEW.updated_at = now();\n  RETURN NEW;\nEND;\n$function$\n"
  },
  {
    "args": "",
    "name": "update_user_onboarding_status",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.update_user_onboarding_status()\n RETURNS trigger\n LANGUAGE plpgsql\nAS $function$\r\nBEGIN\r\n    UPDATE users \r\n    SET completed_onboarding = check_onboarding_complete(NEW.user_id)\r\n    WHERE id = NEW.user_id;\r\n    RETURN NEW;\r\nEND;\r\n$function$\n"
  },
  {
    "args": "p_legacy_table text, p_legacy_id uuid, p_onto_table text, p_onto_id uuid, p_metadata jsonb",
    "name": "upsert_legacy_entity_mapping",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.upsert_legacy_entity_mapping(p_legacy_table text, p_legacy_id uuid, p_onto_table text, p_onto_id uuid, p_metadata jsonb DEFAULT '{}'::jsonb)\n RETURNS void\n LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO 'public'\nAS $function$\nbegin\n\tif p_legacy_id is null or p_onto_id is null then\n\t\treturn;\n\tend if;\n\n\tinsert into legacy_entity_mappings (legacy_table, legacy_id, onto_table, onto_id, metadata, migrated_at)\n\tvalues (\n\t\tp_legacy_table,\n\t\tp_legacy_id,\n\t\tp_onto_table,\n\t\tp_onto_id,\n\t\tcoalesce(jsonb_strip_nulls(p_metadata), '{}'::jsonb),\n\t\tnow()\n\t)\n\ton conflict (legacy_table, legacy_id) do update\n\tset\n\t\tonto_table = excluded.onto_table,\n\t\tonto_id = excluded.onto_id,\n\t\tmetadata = jsonb_strip_nulls(coalesce(legacy_entity_mappings.metadata, '{}'::jsonb) || excluded.metadata),\n\t\tmigrated_at = excluded.migrated_at;\nend;\n$function$\n"
  },
  {
    "args": "p_facets jsonb, p_scope text",
    "name": "validate_facet_values",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.validate_facet_values(p_facets jsonb, p_scope text)\n RETURNS TABLE(facet_key text, provided_value text, error text)\n LANGUAGE plpgsql\nAS $function$\ndeclare\n\tv_entry record;\n\tv_text_value text;\nbegin\n\tif p_facets is null or jsonb_typeof(p_facets) <> 'object' then\n\t\treturn;\n\tend if;\n\n\tif p_scope is null or length(trim(p_scope)) = 0 then\n\t\traise exception 'validate_facet_values requires a non-null scope';\n\t\treturn;\n\tend if;\n\n\tfor v_entry in\n\t\tselect key, value\n\t\tfrom jsonb_each(p_facets)\n\tloop\n\t\t-- Skip null values\n\t\tif v_entry.value is null or v_entry.value = 'null'::jsonb then\n\t\t\tcontinue;\n\t\tend if;\n\n\t\tif jsonb_typeof(v_entry.value) <> 'string' then\n\t\t\tfacet_key := v_entry.key;\n\t\t\tprovided_value := v_entry.value::text;\n\t\t\terror := 'Facet value must be a string';\n\t\t\treturn next;\n\t\t\tcontinue;\n\t\tend if;\n\n\t\tv_text_value := v_entry.value #>> '{}';\n\n\t\t-- Ensure the facet key exists and applies to the given scope\n\t\tif not exists (\n\t\t\tselect 1\n\t\t\tfrom onto_facet_definitions d\n\t\t\twhere d.key = v_entry.key\n\t\t) then\n\t\t\tfacet_key := v_entry.key;\n\t\t\tprovided_value := v_text_value;\n\t\t\terror := format('Unknown facet key: %s', v_entry.key);\n\t\t\treturn next;\n\t\t\tcontinue;\n\t\tend if;\n\n\t\tif not exists (\n\t\t\tselect 1\n\t\t\tfrom onto_facet_definitions d\n\t\t\twhere d.key = v_entry.key\n\t\t\t\tand p_scope = any(d.applies_to)\n\t\t) then\n\t\t\tfacet_key := v_entry.key;\n\t\t\tprovided_value := v_text_value;\n\t\t\terror := format('Facet \"%s\" does not apply to scope \"%s\"', v_entry.key, p_scope);\n\t\t\treturn next;\n\t\t\tcontinue;\n\t\tend if;\n\n\t\t-- Ensure the value is among the allowed options\n\t\tif not exists (\n\t\t\tselect 1\n\t\t\tfrom onto_facet_values v\n\t\t\twhere v.facet_key = v_entry.key\n\t\t\t\tand v.value = v_text_value\n\t\t) then\n\t\t\tfacet_key := v_entry.key;\n\t\t\tprovided_value := v_text_value;\n\t\t\terror := format('Facet value \"%s\" is not allowed for \"%s\"', v_text_value, v_entry.key);\n\t\t\treturn next;\n\t\tend if;\n\tend loop;\nend;\n$function$\n"
  },
  {
    "args": "vector, integer, boolean",
    "name": "vector",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.vector(vector, integer, boolean)\n RETURNS vector\n LANGUAGE c\n IMMUTABLE PARALLEL SAFE STRICT\nAS '$libdir/vector', $function$vector$function$\n"
  },
  {
    "args": "double precision[], vector",
    "name": "vector_accum",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.vector_accum(double precision[], vector)\n RETURNS double precision[]\n LANGUAGE c\n IMMUTABLE PARALLEL SAFE STRICT\nAS '$libdir/vector', $function$vector_accum$function$\n"
  },
  {
    "args": "vector, vector",
    "name": "vector_add",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.vector_add(vector, vector)\n RETURNS vector\n LANGUAGE c\n IMMUTABLE PARALLEL SAFE STRICT\nAS '$libdir/vector', $function$vector_add$function$\n"
  },
  {
    "args": "double precision[]",
    "name": "vector_avg",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.vector_avg(double precision[])\n RETURNS vector\n LANGUAGE c\n IMMUTABLE PARALLEL SAFE STRICT\nAS '$libdir/vector', $function$vector_avg$function$\n"
  },
  {
    "args": "vector, vector",
    "name": "vector_cmp",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.vector_cmp(vector, vector)\n RETURNS integer\n LANGUAGE c\n IMMUTABLE PARALLEL SAFE STRICT\nAS '$libdir/vector', $function$vector_cmp$function$\n"
  },
  {
    "args": "double precision[], double precision[]",
    "name": "vector_combine",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.vector_combine(double precision[], double precision[])\n RETURNS double precision[]\n LANGUAGE c\n IMMUTABLE PARALLEL SAFE STRICT\nAS '$libdir/vector', $function$vector_combine$function$\n"
  },
  {
    "args": "vector, vector",
    "name": "vector_concat",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.vector_concat(vector, vector)\n RETURNS vector\n LANGUAGE c\n IMMUTABLE PARALLEL SAFE STRICT\nAS '$libdir/vector', $function$vector_concat$function$\n"
  },
  {
    "args": "halfvec",
    "name": "vector_dims",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.vector_dims(halfvec)\n RETURNS integer\n LANGUAGE c\n IMMUTABLE PARALLEL SAFE STRICT\nAS '$libdir/vector', $function$halfvec_vector_dims$function$\n"
  },
  {
    "args": "vector",
    "name": "vector_dims",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.vector_dims(vector)\n RETURNS integer\n LANGUAGE c\n IMMUTABLE PARALLEL SAFE STRICT\nAS '$libdir/vector', $function$vector_dims$function$\n"
  },
  {
    "args": "vector, vector",
    "name": "vector_eq",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.vector_eq(vector, vector)\n RETURNS boolean\n LANGUAGE c\n IMMUTABLE PARALLEL SAFE STRICT\nAS '$libdir/vector', $function$vector_eq$function$\n"
  },
  {
    "args": "vector, vector",
    "name": "vector_ge",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.vector_ge(vector, vector)\n RETURNS boolean\n LANGUAGE c\n IMMUTABLE PARALLEL SAFE STRICT\nAS '$libdir/vector', $function$vector_ge$function$\n"
  },
  {
    "args": "vector, vector",
    "name": "vector_gt",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.vector_gt(vector, vector)\n RETURNS boolean\n LANGUAGE c\n IMMUTABLE PARALLEL SAFE STRICT\nAS '$libdir/vector', $function$vector_gt$function$\n"
  },
  {
    "args": "cstring, oid, integer",
    "name": "vector_in",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.vector_in(cstring, oid, integer)\n RETURNS vector\n LANGUAGE c\n IMMUTABLE PARALLEL SAFE STRICT\nAS '$libdir/vector', $function$vector_in$function$\n"
  },
  {
    "args": "vector, vector",
    "name": "vector_l2_squared_distance",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.vector_l2_squared_distance(vector, vector)\n RETURNS double precision\n LANGUAGE c\n IMMUTABLE PARALLEL SAFE STRICT\nAS '$libdir/vector', $function$vector_l2_squared_distance$function$\n"
  },
  {
    "args": "vector, vector",
    "name": "vector_le",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.vector_le(vector, vector)\n RETURNS boolean\n LANGUAGE c\n IMMUTABLE PARALLEL SAFE STRICT\nAS '$libdir/vector', $function$vector_le$function$\n"
  },
  {
    "args": "vector, vector",
    "name": "vector_lt",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.vector_lt(vector, vector)\n RETURNS boolean\n LANGUAGE c\n IMMUTABLE PARALLEL SAFE STRICT\nAS '$libdir/vector', $function$vector_lt$function$\n"
  },
  {
    "args": "vector, vector",
    "name": "vector_mul",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.vector_mul(vector, vector)\n RETURNS vector\n LANGUAGE c\n IMMUTABLE PARALLEL SAFE STRICT\nAS '$libdir/vector', $function$vector_mul$function$\n"
  },
  {
    "args": "vector, vector",
    "name": "vector_ne",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.vector_ne(vector, vector)\n RETURNS boolean\n LANGUAGE c\n IMMUTABLE PARALLEL SAFE STRICT\nAS '$libdir/vector', $function$vector_ne$function$\n"
  },
  {
    "args": "vector, vector",
    "name": "vector_negative_inner_product",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.vector_negative_inner_product(vector, vector)\n RETURNS double precision\n LANGUAGE c\n IMMUTABLE PARALLEL SAFE STRICT\nAS '$libdir/vector', $function$vector_negative_inner_product$function$\n"
  },
  {
    "args": "vector",
    "name": "vector_norm",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.vector_norm(vector)\n RETURNS double precision\n LANGUAGE c\n IMMUTABLE PARALLEL SAFE STRICT\nAS '$libdir/vector', $function$vector_norm$function$\n"
  },
  {
    "args": "vector",
    "name": "vector_out",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.vector_out(vector)\n RETURNS cstring\n LANGUAGE c\n IMMUTABLE PARALLEL SAFE STRICT\nAS '$libdir/vector', $function$vector_out$function$\n"
  },
  {
    "args": "internal, oid, integer",
    "name": "vector_recv",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.vector_recv(internal, oid, integer)\n RETURNS vector\n LANGUAGE c\n IMMUTABLE PARALLEL SAFE STRICT\nAS '$libdir/vector', $function$vector_recv$function$\n"
  },
  {
    "args": "vector",
    "name": "vector_send",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.vector_send(vector)\n RETURNS bytea\n LANGUAGE c\n IMMUTABLE PARALLEL SAFE STRICT\nAS '$libdir/vector', $function$vector_send$function$\n"
  },
  {
    "args": "vector, vector",
    "name": "vector_spherical_distance",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.vector_spherical_distance(vector, vector)\n RETURNS double precision\n LANGUAGE c\n IMMUTABLE PARALLEL SAFE STRICT\nAS '$libdir/vector', $function$vector_spherical_distance$function$\n"
  },
  {
    "args": "vector, vector",
    "name": "vector_sub",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.vector_sub(vector, vector)\n RETURNS vector\n LANGUAGE c\n IMMUTABLE PARALLEL SAFE STRICT\nAS '$libdir/vector', $function$vector_sub$function$\n"
  },
  {
    "args": "vector, integer, boolean",
    "name": "vector_to_float4",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.vector_to_float4(vector, integer, boolean)\n RETURNS real[]\n LANGUAGE c\n IMMUTABLE PARALLEL SAFE STRICT\nAS '$libdir/vector', $function$vector_to_float4$function$\n"
  },
  {
    "args": "vector, integer, boolean",
    "name": "vector_to_halfvec",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.vector_to_halfvec(vector, integer, boolean)\n RETURNS halfvec\n LANGUAGE c\n IMMUTABLE PARALLEL SAFE STRICT\nAS '$libdir/vector', $function$vector_to_halfvec$function$\n"
  },
  {
    "args": "vector, integer, boolean",
    "name": "vector_to_sparsevec",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.vector_to_sparsevec(vector, integer, boolean)\n RETURNS sparsevec\n LANGUAGE c\n IMMUTABLE PARALLEL SAFE STRICT\nAS '$libdir/vector', $function$vector_to_sparsevec$function$\n"
  },
  {
    "args": "cstring[]",
    "name": "vector_typmod_in",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.vector_typmod_in(cstring[])\n RETURNS integer\n LANGUAGE c\n IMMUTABLE PARALLEL SAFE STRICT\nAS '$libdir/vector', $function$vector_typmod_in$function$\n"
  },
  {
    "args": "text, text",
    "name": "word_similarity",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.word_similarity(text, text)\n RETURNS real\n LANGUAGE c\n IMMUTABLE PARALLEL SAFE STRICT\nAS '$libdir/pg_trgm', $function$word_similarity$function$\n"
  },
  {
    "args": "text, text",
    "name": "word_similarity_commutator_op",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.word_similarity_commutator_op(text, text)\n RETURNS boolean\n LANGUAGE c\n STABLE PARALLEL SAFE STRICT\nAS '$libdir/pg_trgm', $function$word_similarity_commutator_op$function$\n"
  },
  {
    "args": "text, text",
    "name": "word_similarity_dist_commutator_op",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.word_similarity_dist_commutator_op(text, text)\n RETURNS real\n LANGUAGE c\n IMMUTABLE PARALLEL SAFE STRICT\nAS '$libdir/pg_trgm', $function$word_similarity_dist_commutator_op$function$\n"
  },
  {
    "args": "text, text",
    "name": "word_similarity_dist_op",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.word_similarity_dist_op(text, text)\n RETURNS real\n LANGUAGE c\n IMMUTABLE PARALLEL SAFE STRICT\nAS '$libdir/pg_trgm', $function$word_similarity_dist_op$function$\n"
  },
  {
    "args": "text, text",
    "name": "word_similarity_op",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.word_similarity_op(text, text)\n RETURNS boolean\n LANGUAGE c\n STABLE PARALLEL SAFE STRICT\nAS '$libdir/pg_trgm', $function$word_similarity_op$function$\n"
  }
]
