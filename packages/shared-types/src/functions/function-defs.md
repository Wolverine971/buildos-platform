<!-- packages/shared-types/src/functions/function-defs.md -->

[
{
"args": "token_hash text, p_actor_id uuid, p_user_email text",
"name": "accept_project_invite",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.accept_project_invite(p_token_hash text, p_actor_id uuid, p_user_email text)
RETURNS TABLE(project_id uuid, role_key text, access text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
v_invite onto_project_invites%ROWTYPE;
v_auth_user_id uuid;
v_actor_id uuid;
v_user_email text;
BEGIN
IF p_token_hash IS NULL OR length(trim(p_token_hash)) = 0 THEN
RAISE EXCEPTION 'Invite token missing';
END IF;

v_auth_user_id := auth.uid();
IF v_auth_user_id IS NULL THEN
RAISE EXCEPTION 'Authentication required';
END IF;

v_actor_id := ensure_actor_for_user(v_auth_user_id);

SELECT email INTO v_user_email
FROM public.users
WHERE id = v_auth_user_id;

IF v_user_email IS NULL THEN
SELECT email INTO v_user_email
FROM onto_actors
WHERE id = v_actor_id;
END IF;

IF v_user_email IS NULL OR length(trim(v_user_email)) = 0 THEN
RAISE EXCEPTION 'User email missing';
END IF;

IF p_actor_id IS NOT NULL AND p_actor_id <> v_actor_id THEN
RAISE EXCEPTION 'Actor mismatch';
END IF;

IF p_user_email IS NOT NULL AND lower(trim(p_user_email)) <> lower(trim(v_user_email)) THEN
RAISE EXCEPTION 'User email mismatch';
END IF;

SELECT * INTO v*invite
FROM onto_project_invites
WHERE token_hash = p_token_hash
FOR UPDATE;

IF NOT FOUND THEN
RAISE EXCEPTION 'Invite not found';
END IF;

IF v_invite.status <> 'pending' THEN
RAISE EXCEPTION 'Invite is not pending';
END IF;

IF v_invite.expires_at IS NOT NULL AND v_invite.expires_at < now() THEN
UPDATE onto_project_invites
SET status = 'expired'
WHERE id = v_invite.id;
RAISE EXCEPTION 'Invite has expired';
END IF;

IF lower(v_invite.invitee_email) <> lower(trim(v_user_email)) THEN
RAISE EXCEPTION 'Invite email mismatch';
END IF;

UPDATE onto_project_members AS m
SET role_key = v_invite.role_key,
access = v_invite.access,
removed_at = NULL,
removed_by_actor_id = NULL
WHERE m.project_id = v_invite.project_id
AND m.actor_id = v_actor_id;

IF NOT FOUND THEN
INSERT INTO onto_project_members (project_id, actor_id, role_key, access, added_by_actor_id)
VALUES (v_invite.project_id, v_actor_id, v_invite.role_key, v_invite.access, v_invite.invited_by_actor_id);
END IF;

UPDATE onto_project_invites
SET status = 'accepted',
accepted_by_actor_id = v_actor_id,
accepted_at = now()
WHERE id = v_invite.id;

RETURN QUERY SELECT v_invite.project_id, v_invite.role_key, v_invite.access;
END;
$function$
"
},
{
"args": "p_invite_id uuid",
"name": "accept_project_invite_by_id",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.accept_project_invite_by_id(p_invite_id uuid)
RETURNS TABLE(project_id uuid, role_key text, access text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
v_invite onto_project_invites%ROWTYPE;
v_auth_user_id uuid;
v_actor_id uuid;
v_user_email text;
BEGIN
IF p_invite_id IS NULL THEN
RAISE EXCEPTION 'Invite id missing';
END IF;

v_auth_user_id := auth.uid();
IF v_auth_user_id IS NULL THEN
RAISE EXCEPTION 'Authentication required';
END IF;

v_actor_id := ensure_actor_for_user(v_auth_user_id);

SELECT email INTO v_user_email
FROM public.users
WHERE id = v_auth_user_id;

IF v_user_email IS NULL THEN
SELECT email INTO v_user_email
FROM onto_actors
WHERE id = v_actor_id;
END IF;

IF v_user_email IS NULL OR length(trim(v_user_email)) = 0 THEN
RAISE EXCEPTION 'User email missing';
END IF;

SELECT \* INTO v_invite
FROM onto_project_invites
WHERE id = p_invite_id
FOR UPDATE;

IF NOT FOUND THEN
RAISE EXCEPTION 'Invite not found';
END IF;

IF v_invite.status <> 'pending' THEN
RAISE EXCEPTION 'Invite is not pending';
END IF;

IF v_invite.expires_at < now() THEN
UPDATE onto_project_invites
SET status = 'expired'
WHERE id = v_invite.id;
RAISE EXCEPTION 'Invite has expired';
END IF;

IF lower(v_invite.invitee_email) <> lower(trim(v_user_email)) THEN
RAISE EXCEPTION 'Invite email mismatch';
END IF;

UPDATE onto_project_members AS m
SET role_key = v_invite.role_key,
access = v_invite.access,
removed_at = NULL,
removed_by_actor_id = NULL
WHERE m.project_id = v_invite.project_id
AND m.actor_id = v_actor_id;

IF NOT FOUND THEN
INSERT INTO onto_project_members (project_id, actor_id, role_key, access, added_by_actor_id)
VALUES (v_invite.project_id, v_actor_id, v_invite.role_key, v_invite.access, v_invite.invited_by_actor_id);
END IF;

UPDATE onto_project_invites
SET status = 'accepted',
accepted_by_actor_id = v_actor_id,
accepted_at = now()
WHERE id = v_invite.id;

RETURN QUERY SELECT v_invite.project_id, v_invite.role_key, v_invite.access;
END;
$function$
"
},
{
"args": "p_run_id uuid, p_locked_by uuid, p_duration_minutes integer",
"name": "acquire_migration_platform_lock",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.acquire_migration_platform_lock(p_run_id uuid, p_locked_by uuid, p_duration_minutes integer DEFAULT 60)
RETURNS TABLE(acquired boolean, existing_run_id uuid, existing_locked_by uuid, existing_locked_at timestamp with time zone, existing_expires_at timestamp with time zone)
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
v_expires_at TIMESTAMPTZ;
v_current_lock RECORD;
BEGIN
v_expires_at := NOW() + (p_duration_minutes || ' minutes'): :INTERVAL;

-- Try to acquire the lock
UPDATE migration_platform_lock
SET
run_id = p_run_id,
locked_by = p_locked_by,
locked_at = NOW(),
expires_at = v_expires_at
WHERE id = 1
AND (run_id IS NULL OR expires_at < NOW())
RETURNING \* INTO v_current_lock;

IF FOUND THEN
-- Lock acquired
RETURN QUERY SELECT
true AS acquired,
NULL: :UUID AS existing_run_id,
NULL: :UUID AS existing_locked_by,
NULL: :TIMESTAMPTZ AS existing_locked_at,
NULL: :TIMESTAMPTZ AS existing_expires_at;
ELSE
-- Lock not acquired, return existing lock info
SELECT \* INTO v_current_lock FROM migration_platform_lock WHERE id = 1;

RETURN QUERY SELECT
false AS acquired,
v_current_lock.run_id AS existing_run_id,
v_current_lock.locked_by AS existing_locked_by,
v_current_lock.locked_at AS existing_locked_at,
v_current_lock.expires_at AS existing_expires_at;
END IF;
END;
$function$
"
},
{
"args": "",
"name": "add_project_owner_membership",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.add_project_owner_membership()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
INSERT INTO onto_project_members (project_id, actor_id, role_key, access, added_by_actor_id)
VALUES (NEW.id, NEW.created_by, 'owner', 'admin', NEW.created_by)
ON CONFLICT (project_id, actor_id) DO NOTHING;
RETURN NEW;
END;
$function$
"
},
{
"args": "p_user_id uuid, p_job_type text, p_metadata jsonb, p_priority integer, p_scheduled_for timestamp with time zone, p_dedup_key text",
"name": "add_queue_job",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.add_queue_job(p_user_id uuid, p_job_type text, p_metadata jsonb, p_priority integer DEFAULT 10, p_scheduled_for timestamp with time zone DEFAULT now(), p_dedup_key text DEFAULT NULL::text)
RETURNS uuid
LANGUAGE plpgsql
AS $function$
DECLARE
v_job_id UUID;
v_queue_job_id TEXT;
v_is_duplicate BOOLEAN := FALSE;
BEGIN
-- Generate queue_job_id
v_queue_job_id := p_job_type || '*' || gen*random_uuid(): :text;

INSERT INTO queue_jobs (
user_id, job_type, metadata, priority,
scheduled_for, dedup_key, status, queue_job_id
) VALUES (
p_user_id,
p_job_type: :queue_type,
p_metadata,
p_priority,
p_scheduled_for,
p_dedup_key,
'pending': :queue_status,
v_queue_job_id
)
ON CONFLICT (dedup_key)
WHERE dedup_key IS NOT NULL AND status IN ('pending', 'processing')
DO NOTHING
RETURNING id INTO v_job_id;

IF v_job_id IS NULL AND p_dedup_key IS NOT NULL THEN
SELECT id INTO v_job_id
FROM queue_jobs
WHERE dedup_key = p_dedup_key
AND status IN ('pending', 'processing')
ORDER BY created_at ASC
LIMIT 1;
END IF;

IF v_job_id IS NULL THEN
RAISE EXCEPTION 'Failed to create or find job with dedup_key: %', p_dedup_key;
END IF;

RETURN v_job_id;
END;
$function$
"
},
{
"args": "p_project_id uuid, p_deletes jsonb, p_updates jsonb, p_inserts jsonb",
"name": "apply_graph_reorg_changes",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.apply_graph_reorg_changes(p_project_id uuid, p_deletes jsonb, p_updates jsonb, p_inserts jsonb)
RETURNS jsonb
LANGUAGE plpgsql
AS $function$
declare
v_deletes jsonb := coalesce(p_deletes, '[]': :jsonb);
v_updates jsonb := coalesce(p_updates, '[]': :jsonb);
v_inserts jsonb := coalesce(p_inserts, '[]': :jsonb);
v_delete_count integer := 0;
v_update_count integer := 0;
v_insert_count integer := 0;
v_expected_deletes integer := 0;
v_expected_updates integer := 0;
begin
perform pg_advisory_xact_lock(hashtext(p_project_id: :text));

if jsonb*array_length(v_deletes) > 0 then
with del as (
select *
from jsonb*to_recordset(v_deletes)
as d(id uuid, src_kind text, src_id uuid, rel text, dst_kind text, dst_id uuid, props jsonb)
), deleted as (
delete from onto_edges e
using del d
where e.id = d.id
and e.project_id = p_project_id
and e.src_kind = d.src_kind
and e.src_id = d.src_id
and e.rel = d.rel
and e.dst_kind = d.dst_kind
and e.dst_id = d.dst_id
and e.props = coalesce(d.props, '{}': :jsonb)
returning e.id
)
select count(*) into v_delete_count from deleted;

select count(\*) into v_expected_deletes from jsonb_array_elements(v_deletes);

if v_delete_count <> v_expected_deletes then
raise exception 'Graph reorg conflict: delete mismatch (expected %, deleted %)', v_expected_deletes, v_delete_count
using errcode = '40001';
end if;
end if;

if jsonb*array_length(v_updates) > 0 then
with upd as (
select *
from jsonb*to_recordset(v_updates)
as u(
id uuid,
src_kind text,
src_id uuid,
rel text,
dst_kind text,
dst_id uuid,
props jsonb,
expected_props jsonb
)
), updated as (
update onto_edges e
set props = coalesce(u.props, '{}': :jsonb)
from upd u
where e.id = u.id
and e.project_id = p_project_id
and e.src_kind = u.src_kind
and e.src_id = u.src_id
and e.rel = u.rel
and e.dst_kind = u.dst_kind
and e.dst_id = u.dst_id
and e.props = coalesce(u.expected_props, '{}': :jsonb)
returning e.id
)
select count(*) into v_update_count from updated;

select count(\*) into v_expected_updates from jsonb_array_elements(v_updates);

if v_update_count <> v_expected_updates then
raise exception 'Graph reorg conflict: update mismatch (expected %, updated %)', v_expected_updates, v_update_count
using errcode = '40001';
end if;
end if;

if jsonb*array_length(v_inserts) > 0 then
with ins as (
select *
from jsonb*to_recordset(v_inserts)
as i(src_kind text, src_id uuid, rel text, dst_kind text, dst_id uuid, props jsonb)
), to_insert as (
select i.*
from ins i
left join onto_edges e
on e.project_id = p_project_id
and e.src_kind = i.src_kind
and e.src_id = i.src_id
and e.rel = i.rel
and e.dst_kind = i.dst_kind
and e.dst_id = i.dst_id
where e.id is null
), inserted as (
insert into onto_edges (project_id, src_kind, src_id, rel, dst_kind, dst_id, props)
select p_project_id, src_kind, src_id, rel, dst_kind, dst_id, coalesce(props, '{}': :jsonb)
from to_insert
returning id
)
select count(\*) into v_insert_count from inserted;
end if;

return jsonb_build_object(
'deleted', v_delete_count,
'updated', v_update_count,
'inserted', v_insert_count
);
end;
$function$
"
},
{
"args": "double precision[], integer, boolean",
"name": "array_to_halfvec",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.array_to_halfvec(double precision[], integer, boolean)
RETURNS halfvec
LANGUAGE c
IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$array_to_halfvec$function$
"
},
{
"args": "integer[], integer, boolean",
"name": "array_to_halfvec",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.array_to_halfvec(integer[], integer, boolean)
RETURNS halfvec
LANGUAGE c
IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$array_to_halfvec$function$
"
},
{
"args": "numeric[], integer, boolean",
"name": "array_to_halfvec",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.array_to_halfvec(numeric[], integer, boolean)
RETURNS halfvec
LANGUAGE c
IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$array_to_halfvec$function$
"
},
{
"args": "real[], integer, boolean",
"name": "array_to_halfvec",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.array_to_halfvec(real[], integer, boolean)
RETURNS halfvec
LANGUAGE c
IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$array_to_halfvec$function$
"
},
{
"args": "double precision[], integer, boolean",
"name": "array_to_sparsevec",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.array_to_sparsevec(double precision[], integer, boolean)
RETURNS sparsevec
LANGUAGE c
IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$array_to_sparsevec$function$
"
},
{
"args": "integer[], integer, boolean",
"name": "array_to_sparsevec",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.array_to_sparsevec(integer[], integer, boolean)
RETURNS sparsevec
LANGUAGE c
IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$array_to_sparsevec$function$
"
},
{
"args": "numeric[], integer, boolean",
"name": "array_to_sparsevec",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.array_to_sparsevec(numeric[], integer, boolean)
RETURNS sparsevec
LANGUAGE c
IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$array_to_sparsevec$function$
"
},
{
"args": "real[], integer, boolean",
"name": "array_to_sparsevec",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.array_to_sparsevec(real[], integer, boolean)
RETURNS sparsevec
LANGUAGE c
IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$array_to_sparsevec$function$
"
},
{
"args": "double precision[], integer, boolean",
"name": "array_to_vector",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.array_to_vector(double precision[], integer, boolean)
RETURNS vector
LANGUAGE c
IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$array_to_vector$function$
"
},
{
"args": "integer[], integer, boolean",
"name": "array_to_vector",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.array_to_vector(integer[], integer, boolean)
RETURNS vector
LANGUAGE c
IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$array_to_vector$function$
"
},
{
"args": "numeric[], integer, boolean",
"name": "array_to_vector",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.array_to_vector(numeric[], integer, boolean)
RETURNS vector
LANGUAGE c
IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$array_to_vector$function$
"
},
{
"args": "real[], integer, boolean",
"name": "array_to_vector",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.array_to_vector(real[], integer, boolean)
RETURNS vector
LANGUAGE c
IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$array_to_vector$function$
"
},
{
"args": "p_project_id uuid, p_updates jsonb",
"name": "batch_update_phase_dates",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.batch_update_phase_dates(p_project_id uuid, p_updates jsonb)
RETURNS TABLE(id uuid, start_date date, end_date date, updated_at timestamp with time zone)
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$\r
BEGIN\r
-- Validate dates\r
IF EXISTS (\r
SELECT 1\r
FROM jsonb_array_elements(p_updates) AS update_item\r
WHERE (update_item->>'start_date'): :DATE >= (update_item->>'end_date'): :DATE\r
) THEN\r
RAISE EXCEPTION 'Phase start date must be before end date';\r
END IF;\r
\r
-- Perform batch update\r
RETURN QUERY\r
UPDATE phases p\r
SET \r
start_date = (u.value->>'start_date'): :DATE,\r
end_date = (u.value->>'end_date'): :DATE,\r
updated_at = NOW()\r
FROM jsonb_array_elements(p_updates) AS u\r
WHERE p.id = (u.value->>'id'): :UUID\r
AND p.project_id = p_project_id\r
RETURNING p.id, p.start_date, p.end_date, p.updated_at;\r
END;\r
$function$
"
},
{
"args": "halfvec",
"name": "binary_quantize",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.binary_quantize(halfvec)
RETURNS bit
LANGUAGE c
IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$halfvec_binary_quantize$function$
"
},
{
"args": "vector",
"name": "binary_quantize",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.binary_quantize(vector)
RETURNS bit
LANGUAGE c
IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$binary_quantize$function$
"
},
{
"args": "p_user_id uuid, p_brief_date text, p_exclude_job_id uuid",
"name": "cancel_brief_jobs_for_date",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.cancel_brief_jobs_for_date(p_user_id uuid, p_brief_date text, p_exclude_job_id uuid DEFAULT NULL::uuid)
RETURNS TABLE(cancelled_count integer, cancelled_job_ids text[])
LANGUAGE plpgsql
AS $function$
DECLARE
v_cancelled_jobs TEXT[];
v_count INTEGER;
BEGIN
-- Cancel matching jobs and collect IDs
WITH cancelled AS (
UPDATE queue_jobs
SET
status = 'cancelled',
updated_at = NOW(),
error_message = 'Cancelled: Duplicate brief job for same date'
WHERE user_id = p_user_id
AND job_type = 'generate_daily_brief'
AND status IN ('pending', 'processing')
AND metadata->>'briefDate' = p_brief_date
AND (p_exclude_job_id IS NULL OR id != p_exclude_job_id)
RETURNING queue_job_id
)
SELECT
COUNT(\*): :INTEGER,
ARRAY_AGG(queue_job_id)
INTO v_count, v_cancelled_jobs
FROM cancelled;

RETURN QUERY SELECT v_count, v_cancelled_jobs;
END;
$function$
"
},
{
"args": "p_job_id uuid, p_reason text, p_allow_processing boolean",
"name": "cancel_job_with_reason",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.cancel_job_with_reason(p_job_id uuid, p_reason text, p_allow_processing boolean DEFAULT false)
RETURNS boolean
LANGUAGE plpgsql
AS $function$
DECLARE
v_updated INTEGER;
v_allowed_statuses TEXT[];
BEGIN
-- Determine which statuses we can cancel
v_allowed_statuses := ARRAY['pending'
];
IF p_allow_processing THEN
v_allowed_statuses := ARRAY['pending', 'processing'
];
END IF;

UPDATE queue_jobs
SET
status = 'cancelled',
error_message = p_reason,
updated_at = NOW()
WHERE id = p_job_id
AND status = ANY(v_allowed_statuses);

GET DIAGNOSTICS v_updated = ROW_COUNT;
RETURN v_updated > 0;
END;
$function$
"
},
{
"args": "p_user_id uuid, p_job_type text, p_metadata_filter jsonb, p_allowed_statuses text[]",
"name": "cancel_jobs_atomic",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.cancel_jobs_atomic(p_user_id uuid, p_job_type text, p_metadata_filter jsonb DEFAULT NULL::jsonb, p_allowed_statuses text[] DEFAULT ARRAY['pending'::text, 'processing'::text])
RETURNS TABLE(id uuid, queue_job_id text, job_type text, status text)
LANGUAGE plpgsql
AS $function$
BEGIN
RETURN QUERY
UPDATE queue_jobs
SET
status = 'cancelled',
updated_at = NOW()
WHERE queue_jobs.user_id = p_user_id
AND queue_jobs.job_type: :TEXT = p_job_type -- FIXED: Cast enum to TEXT for comparison
AND queue_jobs.status: :TEXT = ANY(p_allowed_statuses) -- FIXED: Cast enum to TEXT
AND (p_metadata_filter IS NULL OR queue_jobs.metadata @> p_metadata_filter)
RETURNING
queue_jobs.id,
queue_jobs.queue_job_id,
queue_jobs.job_type: :TEXT, -- FIXED: Cast enum to TEXT for output
queue_jobs.status: :TEXT; -- FIXED: Cast enum to TEXT for output
END;
$function$
"
},
{
"args": "p_user_id uuid, p_job_type text, p_window_start timestamp with time zone, p_window_end timestamp with time zone, p_exclude_job_id uuid",
"name": "cancel_jobs_in_time_window",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.cancel_jobs_in_time_window(p_user_id uuid, p_job_type text, p_window_start timestamp with time zone, p_window_end timestamp with time zone, p_exclude_job_id uuid DEFAULT NULL::uuid)
RETURNS integer
LANGUAGE plpgsql
AS $function$
DECLARE
v_count INTEGER;
BEGIN
UPDATE queue_jobs
SET
status = 'cancelled',
updated_at = NOW(),
error_message = 'Cancelled due to scheduling conflict'
WHERE user_id = p_user_id
AND job_type = p_job_type
AND status IN ('pending', 'generating')
AND scheduled_for >= p_window_start
AND scheduled_for <= p_window_end
AND (p_exclude_job_id IS NULL OR id != p_exclude_job_id);

GET DIAGNOSTICS v_count = ROW_COUNT;
RETURN v_count;
END;
$function$
"
},
{
"args": "p_calendar_event_id text, p_user_id uuid",
"name": "cancel_scheduled_sms_for_event",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.cancel_scheduled_sms_for_event(p_calendar_event_id text, p_user_id uuid DEFAULT NULL::uuid)
RETURNS TABLE(cancelled_count integer, message_ids uuid[])
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
v_cancelled_ids UUID[];
v_count INTEGER;
BEGIN
-- Cancel all scheduled SMS for this calendar event
WITH updated AS (
UPDATE scheduled_sms_messages
SET
status = 'cancelled',
cancelled_at = NOW(),
last_error = 'Event cancelled or deleted'
WHERE
calendar_event_id = p_calendar_event_id
AND status IN ('scheduled', 'queued')
AND (p_user_id IS NULL OR user_id = p_user_id)
RETURNING id
)
SELECT
array_agg(id),
COUNT(\*): :INTEGER
INTO v_cancelled_ids, v_count
FROM updated;

-- Return results
RETURN QUERY SELECT
COALESCE(v*count,
0),
COALESCE(v_cancelled_ids, ARRAY[]: :UUID[]);
END;
$function$
"
},
{
"args": "client_ip inet",
"name": "check_feedback_rate_limit",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.check_feedback_rate_limit(client_ip inet)
RETURNS boolean
LANGUAGE plpgsql
AS $function$\r
DECLARE\r
rate_record RECORD;\r
current_time TIMESTAMP WITH TIME ZONE := CURRENT_TIMESTAMP;\r
hour_ago TIMESTAMP WITH TIME ZONE := current_time - INTERVAL '1 hour';\r
day_ago TIMESTAMP WITH TIME ZONE := current_time - INTERVAL '24 hours';\r
BEGIN\r
-- Get or create rate limit record for this IP\r
SELECT * INTO rate*record \r
FROM feedback_rate_limit \r
WHERE ip_address = client_ip;\r
\r
IF NOT FOUND THEN\r
-- First submission from this IP\r
INSERT INTO feedback_rate_limit (ip_address, submission_count, first_submission, last_submission)\r
VALUES (client_ip,
1, current_time, current_time);\r
RETURN TRUE;\r
END IF;\r
\r
-- Check if IP is blocked\r
IF rate_record.is_blocked THEN\r
RETURN FALSE;\r
END IF;\r
\r
-- Reset counter if last submission was more than 24 hours ago\r
IF rate_record.last_submission < day_ago THEN\r
UPDATE feedback_rate_limit \r
SET submission_count = 1, \r
first_submission = current_time, \r
last_submission = current_time\r
WHERE ip_address = client_ip;\r
RETURN TRUE;\r
END IF;\r
\r
-- Check hourly limit (max 3 per hour)\r
IF rate_record.last_submission > hour_ago AND rate_record.submission_count >= 3 THEN\r
RETURN FALSE;\r
END IF;\r
\r
-- Check daily limit (max 10 per day)\r
IF rate_record.submission_count >= 10 THEN\r
-- Block this IP for 24 hours\r
UPDATE feedback_rate_limit \r
SET is_blocked = TRUE \r
WHERE ip_address = client_ip;\r
RETURN FALSE;\r
END IF;\r
\r
-- Update submission count\r
UPDATE feedback_rate_limit \r
SET submission_count = submission_count + 1,\r
last_submission = current_time\r
WHERE ip_address = client_ip;\r
\r
RETURN TRUE;\r
END;\r
$function$
"
},
{
"args": "p_job_types text[], p_batch_size integer",
"name": "claim_pending_jobs",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.claim_pending_jobs(p_job_types text[], p_batch_size integer DEFAULT 5)
RETURNS TABLE(id uuid, queue_job_id text, user_id uuid, job_type text, metadata jsonb, status text, priority integer, attempts integer, max_attempts integer, scheduled_for timestamp with time zone, created_at timestamp with time zone, updated_at timestamp with time zone, started_at timestamp with time zone, completed_at timestamp with time zone, error_message text)
LANGUAGE plpgsql
AS $function$
BEGIN
RETURN QUERY
UPDATE queue_jobs
SET
status = 'processing',
started_at = NOW(),
updated_at = NOW()
WHERE queue_jobs.id IN (
SELECT queue_jobs.id
FROM queue_jobs
WHERE queue_jobs.status = 'pending'
AND queue_jobs.job_type: :TEXT = ANY(p_job_types)
AND queue_jobs.scheduled_for <= NOW()
ORDER BY queue_jobs.priority DESC, queue_jobs.scheduled_for ASC
LIMIT p_batch_size
FOR UPDATE SKIP LOCKED
)
RETURNING
queue_jobs.id,
queue_jobs.queue_job_id,
queue_jobs.user_id,
queue_jobs.job_type: :TEXT, -- Cast enum to text
queue_jobs.metadata,
queue_jobs.status: :TEXT, -- FIXED: Cast enum to text
queue_jobs.priority,
queue_jobs.attempts,
queue_jobs.max_attempts,
queue_jobs.scheduled_for,
queue_jobs.created_at,
queue_jobs.updated_at,
queue_jobs.started_at,
queue_jobs.completed_at,
queue_jobs.error_message;
END;
$function$
"
},
{
"args": "target_project_id uuid",
"name": "cleanup_project_history",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.cleanup_project_history(target_project_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $function$\r
DECLARE\r
version_count INTEGER;\r
versions_to_delete INTEGER[];\r
BEGIN\r
-- Count total versions for this project\r
SELECT COUNT(*) INTO version_count \r
FROM projects_history \r
WHERE project_id = target_project_id;\r
\r
-- Only cleanup if we have more than 4 versions (1 first + 3 last)\r
IF version_count > 4 THEN\r
-- Get version numbers to delete (everything except first and last 3)\r
SELECT ARRAY_AGG(version_number) INTO versions_to_delete\r
FROM (\r
SELECT version_number\r
FROM projects_history\r
WHERE project_id = target_project_id\r
AND is_first_version = FALSE -- Never delete the first version\r
ORDER BY version_number DESC\r
OFFSET 3 -- Skip the last 3 versions\r
) versions_to_remove;\r
\r
-- Delete the intermediate versions\r
IF array_length(versions_to_delete, 1) > 0 THEN\r
DELETE FROM projects_history \r
WHERE project_id = target_project_id \r
AND version_number = ANY(versions_to_delete);\r
END IF;\r
END IF;\r
END;\r
$function$
"
},
{
"args": "p_user_id uuid, p_timeout_minutes integer",
"name": "cleanup_stale_brief_generations",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.cleanup_stale_brief_generations(p_user_id uuid, p_timeout_minutes integer DEFAULT 10)
RETURNS TABLE(id uuid, brief_date date)
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
v_timeout_interval INTERVAL;
BEGIN
v_timeout_interval := (p_timeout_minutes || ' minutes'): :INTERVAL;

-- Update stale processing briefs to failed
UPDATE daily_briefs
SET
generation_status = 'failed',
generation_error = 'Generation timeout after ' || p_timeout_minutes || ' minutes',
generation_completed_at = NOW(),
updated_at = NOW()
WHERE
user_id = p_user_id
AND generation_status = 'processing'
AND generation_started_at IS NOT NULL
AND generation_started_at < NOW() - v_timeout_interval;

-- Return the cleaned up briefs
RETURN QUERY
SELECT
db.id,
db.brief_date
FROM daily_briefs db
WHERE
db.user_id = p_user_id
AND db.generation_status = 'failed'
AND db.generation_error = 'Generation timeout after ' || p_timeout_minutes || ' minutes'
AND db.generation_completed_at >= NOW() - INTERVAL '1 minute';
END;
$function$
"
},
{
"args": "p_job_id uuid, p_result jsonb",
"name": "complete_queue_job",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.complete_queue_job(p_job_id uuid, p_result jsonb DEFAULT NULL::jsonb)
RETURNS boolean
LANGUAGE plpgsql
AS $function$
DECLARE
v_updated INTEGER;
BEGIN
UPDATE queue_jobs
SET
status = 'completed',
completed_at = NOW(),
updated_at = NOW(),
result = p_result
WHERE id = p_job_id
AND status = 'processing';

GET DIAGNOSTICS v_updated = ROW_COUNT;
RETURN v_updated > 0;
END;
$function$
"
},
{
"args": "p_task_id uuid, p_instance_date date, p_user_id uuid",
"name": "complete_recurring_instance",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.complete_recurring_instance(p_task_id uuid, p_instance_date date, p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
AS $function$
DECLARE
v_instance_id UUID;
BEGIN
-- Check if instance exists
SELECT id INTO v_instance_id
FROM recurring_task_instances
WHERE task_id = p_task_id
AND instance_date = p_instance_date
AND user_id = p_user_id;

IF v_instance_id IS NULL THEN
-- Create instance if it doesn't exist
INSERT INTO recurring_task_instances (task_id, instance_date, user_id, status, completed_at)
VALUES (p_task_id, p_instance_date, p_user_id, 'completed', CURRENT_TIMESTAMP);
ELSE
-- Update existing instance
UPDATE recurring_task_instances
SET status = 'completed',
completed_at = CURRENT_TIMESTAMP,
updated_at = CURRENT_TIMESTAMP
WHERE id = v_instance_id;
END IF;

RETURN TRUE;
EXCEPTION
WHEN OTHERS THEN
RETURN FALSE;
END;
$function$
"
},
{
"args": "halfvec, halfvec",
"name": "cosine_distance",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.cosine_distance(halfvec, halfvec)
RETURNS double precision
LANGUAGE c
IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$halfvec_cosine_distance$function$
"
},
{
"args": "sparsevec, sparsevec",
"name": "cosine_distance",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.cosine_distance(sparsevec, sparsevec)
RETURNS double precision
LANGUAGE c
IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$sparsevec_cosine_distance$function$
"
},
{
"args": "vector, vector",
"name": "cosine_distance",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.cosine_distance(vector, vector)
RETURNS double precision
LANGUAGE c
IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$cosine_distance$function$
"
},
{
"args": "target_project_id uuid, created_by_user uuid",
"name": "create_manual_project_version",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.create_manual_project_version(target_project_id uuid, created_by_user uuid DEFAULT NULL::uuid)
RETURNS integer
LANGUAGE plpgsql
AS $function$\r
DECLARE\r
next_version INTEGER;\r
project_record RECORD;\r
BEGIN\r
-- Get current project data\r
SELECT \* INTO project_record \r
FROM projects \r
WHERE id = target_project_id;\r
\r
IF NOT FOUND THEN\r
RAISE EXCEPTION 'Project not found: %', target_project_id;\r
END IF;\r
\r
-- Get next version number\r
SELECT COALESCE(MAX(version_number), 0) + 1 \r
INTO next_version\r
FROM projects_history \r
WHERE project_id = target_project_id;\r
\r
-- Insert new version\r
INSERT INTO projects_history (\r
project_id, \r
version_number, \r
is_first_version,\r
project_data, \r
created_by\r
) VALUES (\r
target_project_id,\r
next_version,\r
next_version = 1,\r
row_to_json(project_record): :jsonb,\r
COALESCE(created_by_user, project_record.user_id)\r
);\r
\r
-- Clean up history\r
PERFORM cleanup_project_history(target_project_id);\r
\r
RETURN next_version;\r
END;\r
$function$
"
},
{
"args": "p_delivery_id uuid, p_destination_url text",
"name": "create_tracking_link",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.create_tracking_link(p_delivery_id uuid, p_destination_url text)
RETURNS text
LANGUAGE plpgsql
AS $function$
DECLARE
v_short_code TEXT;
v_max_attempts INTEGER := 10;
v_attempt INTEGER := 0;
BEGIN
-- Validate inputs
IF p_delivery_id IS NULL THEN
RAISE EXCEPTION 'delivery_id cannot be null';
END IF;

IF p_destination_url IS NULL OR p_destination_url = '' THEN
RAISE EXCEPTION 'destination_url cannot be empty';
END IF;

-- Try to generate unique short code
LOOP
v_short_code := generate_short_code(6);

BEGIN
INSERT INTO notification_tracking_links (
short_code,
delivery_id,
destination_url
) VALUES (
v_short_code,
p_delivery_id,
p_destination_url
);

-- Success! Return the short code
RETURN v_short_code;

EXCEPTION WHEN unique_violation THEN
-- Collision detected, try again
v_attempt := v_attempt + 1;

IF v_attempt >= v_max_attempts THEN
RAISE EXCEPTION 'Failed to generate unique short code after % attempts', v_max_attempts;
END IF;

-- Log collision (optional, for monitoring)
RAISE NOTICE 'Short code collision on attempt %, retrying...', v_attempt;
END;
END LOOP;
END;
$function$
"
},
{
"args": "p_project_id uuid, p_required_access text",
"name": "current_actor_has_project_access",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.current_actor_has_project_access(p_project_id uuid, p_required_access text DEFAULT 'read'::text)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
v_actor_id uuid;
BEGIN
IF p_project_id IS NULL THEN
RETURN false;
END IF;

IF auth.role() = 'service_role' THEN
RETURN true;
END IF;

IF p_required_access = 'read' THEN
IF EXISTS (
SELECT 1 FROM onto_projects p
WHERE p.id = p_project_id
AND p.deleted_at IS NULL
AND p.is_public = true
) THEN
RETURN true;
END IF;
END IF;

IF is_admin() THEN
RETURN true;
END IF;

v_actor_id := current_actor_id();
IF v_actor_id IS NULL THEN
RETURN false;
END IF;

-- Owner always has access.
IF EXISTS (
SELECT 1 FROM onto_projects p
WHERE p.id = p_project_id AND p.created_by = v_actor_id
) THEN
RETURN true;
END IF;

RETURN EXISTS (
SELECT 1 FROM onto_project_members m
WHERE m.project_id = p_project_id
AND m.actor_id = v_actor_id
AND m.removed_at IS NULL
AND (
(p_required_access = 'read' AND m.access IN ('read', 'write', 'admin')) OR
(p_required_access = 'write' AND m.access IN ('write', 'admin')) OR
(p_required_access = 'admin' AND m.access = 'admin')
)
);
END;
$function$
"
},
{
"args": "",
"name": "current_actor_id",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.current_actor_id()
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
SELECT id
FROM onto_actors
WHERE user_id = auth.uid();
$function$
"
},
{
"args": "p_project_id uuid",
"name": "current_actor_is_project_member",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.current_actor_is_project_member(p_project_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
v_actor_id uuid;
BEGIN
IF p_project_id IS NULL THEN
RETURN false;
END IF;

IF is_admin() THEN
RETURN true;
END IF;

v_actor_id := current_actor_id();
IF v_actor_id IS NULL THEN
RETURN false;
END IF;

IF EXISTS (
SELECT 1 FROM onto_projects p
WHERE p.id = p_project_id AND p.created_by = v_actor_id
) THEN
RETURN true;
END IF;

RETURN EXISTS (
SELECT 1 FROM onto_project_members m
WHERE m.project_id = p_project_id
AND m.actor_id = v_actor_id
AND m.removed_at IS NULL
);
END;
$function$
"
},
{
"args": "p_invite_id uuid",
"name": "decline_project_invite",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.decline_project_invite(p_invite_id uuid)
RETURNS TABLE(invite_id uuid, status text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
v_invite onto_project_invites%ROWTYPE;
v_auth_user_id uuid;
v_actor_id uuid;
v_user_email text;
BEGIN
IF p_invite_id IS NULL THEN
RAISE EXCEPTION 'Invite id missing';
END IF;

v_auth_user_id := auth.uid();
IF v_auth_user_id IS NULL THEN
RAISE EXCEPTION 'Authentication required';
END IF;

v_actor_id := ensure_actor_for_user(v_auth_user_id);

SELECT email INTO v_user_email
FROM public.users
WHERE id = v_auth_user_id;

IF v_user_email IS NULL THEN
SELECT email INTO v_user_email
FROM onto_actors
WHERE id = v_actor_id;
END IF;

IF v_user_email IS NULL OR length(trim(v_user_email)) = 0 THEN
RAISE EXCEPTION 'User email missing';
END IF;

SELECT \* INTO v_invite
FROM onto_project_invites
WHERE id = p_invite_id
FOR UPDATE;

IF NOT FOUND THEN
RAISE EXCEPTION 'Invite not found';
END IF;

IF v_invite.status <> 'pending' THEN
RAISE EXCEPTION 'Invite is not pending';
END IF;

IF v_invite.expires_at < now() THEN
UPDATE onto_project_invites
SET status = 'expired'
WHERE id = v_invite.id;
RAISE EXCEPTION 'Invite has expired';
END IF;

IF lower(v_invite.invitee_email) <> lower(trim(v_user_email)) THEN
RAISE EXCEPTION 'Invite email mismatch';
END IF;

UPDATE onto_project_invites
SET status = 'declined'
WHERE id = v_invite.id;

RETURN QUERY SELECT v_invite.id, 'declined': :text;
END;
$function$
"
},
{
"args": "p_project_id uuid, p_order_threshold integer",
"name": "decrement_phase_order",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.decrement_phase_order(p_project_id uuid, p_order_threshold integer)
RETURNS void
LANGUAGE plpgsql
AS $function$\r
BEGIN\r
UPDATE phases\r
SET \"order\" = \"order\" - 1,\r
updated_at = NOW()\r
WHERE project_id = p_project_id\r
AND \"order\" > p_order_threshold;\r
END;\r
$function$
"
},
{
"args": "p_project_id uuid",
"name": "delete_onto_project",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.delete_onto_project(p_project_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $function$
DECLARE
\tv_goal_ids uuid[] := coalesce((select array_agg(id) from onto_goals where project_id = p_project_id), '{}': :uuid[]);
\tv_requirement_ids uuid[] := coalesce((select array_agg(id) from onto_requirements where project_id = p_project_id), '{}': :uuid[]);
\tv_plan_ids uuid[] := coalesce((select array_agg(id) from onto_plans where project_id = p_project_id), '{}': :uuid[]);
\tv_task_ids uuid[] := coalesce((select array_agg(id) from onto_tasks where project_id = p_project_id), '{}': :uuid[]);
\tv_output_ids uuid[] := coalesce((select array_agg(id) from onto_outputs where project_id = p_project_id), '{}': :uuid[]);
\tv_document_ids uuid[] := coalesce((select array_agg(id) from onto_documents where project_id = p_project_id), '{}': :uuid[]);
\tv_source_ids uuid[] := coalesce((select array_agg(id) from onto_sources where project_id = p_project_id), '{}': :uuid[]);
\tv_decision_ids uuid[] := coalesce((select array_agg(id) from onto_decisions where project_id = p_project_id), '{}': :uuid[]);
\tv_risk_ids uuid[] := coalesce((select array_agg(id) from onto_risks where project_id = p_project_id), '{}': :uuid[]);
\tv_milestone_ids uuid[] := coalesce((select array_agg(id) from onto_milestones where project_id = p_project_id), '{}': :uuid[]);
\tv_metric_ids uuid[] := coalesce((select array_agg(id) from onto_metrics where project_id = p_project_id), '{}': :uuid[]);
\tv_signal_ids uuid[] := coalesce((select array_agg(id) from onto_signals where project_id = p_project_id), '{}': :uuid[]);
\tv_insight_ids uuid[] := coalesce((select array_agg(id) from onto_insights where project_id = p_project_id), '{}': :uuid[]);
\tv_event_ids uuid[] := coalesce((select array_agg(id) from onto_events where project_id = p_project_id), '{}': :uuid[]);
\tv_all_ids uuid[] := array[p_project_id
];
BEGIN
\tIF p_project_id IS NULL THEN
\t\tRAISE EXCEPTION 'Project ID required';
\tEND IF;

\tv_all_ids := v_all_ids
\t\t|| v_goal_ids
\t\t|| v_requirement_ids
\t\t|| v_plan_ids
\t\t|| v_task_ids
\t\t|| v_output_ids
\t\t|| v_document_ids
\t\t|| v_source_ids
\t\t|| v_decision_ids
\t\t|| v_risk_ids
\t\t|| v_milestone_ids
\t\t|| v_metric_ids
\t\t|| v_signal_ids
\t\t|| v_insight_ids
\t\t|| v_event_ids;

\t-- Delete secondary records first
\tDELETE FROM onto_event_sync WHERE event_id = any(v_event_ids);
\tDELETE FROM onto_metric_points WHERE metric_id = any(v_metric_ids);
\tDELETE FROM onto_output_versions WHERE output_id = any(v_output_ids);
\tDELETE FROM onto_document_versions WHERE document_id = any(v_document_ids);

\t-- Remove edges/assignments/permissions referencing any of these entities
\tDELETE FROM onto_edges
\tWHERE src_id = any(v_all_ids) OR dst_id = any(v_all_ids);

\tDELETE FROM onto_assignments
\tWHERE object_id = any(v_all_ids)
\t\tAND object_kind = any (array['project','plan','task','goal','output','document','requirement','milestone','risk','decision','metric','event'
]);

\tDELETE FROM onto_permissions
\tWHERE object_id = any(v_all_ids)
\t\tAND object_kind = any (array['project','plan','task','goal','output','document','requirement','milestone','risk','decision','metric','event'
]);

\tDELETE FROM legacy_entity_mappings
\tWHERE onto_id = any(v_all_ids)
\t\tAND onto_table = any (array[
\t\t\t'onto_projects',
\t\t\t'onto_plans',
\t\t\t'onto_tasks',
\t\t\t'onto_goals',
\t\t\t'onto_outputs',
\t\t\t'onto_documents',
\t\t\t'onto_requirements',
\t\t\t'onto_milestones',
\t\t\t'onto_risks',
\t\t\t'onto_decisions',
\t\t\t'onto_sources',
\t\t\t'onto_metrics',
\t\t\t'onto_signals',
\t\t\t'onto_insights',
\t\t\t'onto_events'
\t\t
]);

\t-- Delete project-scoped tables
\tDELETE FROM onto_events WHERE project_id = p_project_id;
\tDELETE FROM onto_signals WHERE project_id = p_project_id;
\tDELETE FROM onto_insights WHERE project_id = p_project_id;
\tDELETE FROM onto_sources WHERE project_id = p_project_id;
\tDELETE FROM onto_decisions WHERE project_id = p_project_id;
\tDELETE FROM onto_risks WHERE project_id = p_project_id;
\tDELETE FROM onto_milestones WHERE project_id = p_project_id;
\tDELETE FROM onto_metrics WHERE project_id = p_project_id;
\tDELETE FROM onto_outputs WHERE project_id = p_project_id;
\tDELETE FROM onto_documents WHERE project_id = p_project_id;
\tDELETE FROM onto_tasks WHERE project_id = p_project_id;
\tDELETE FROM onto_plans WHERE project_id = p_project_id;
\tDELETE FROM onto_requirements WHERE project_id = p_project_id;
\tDELETE FROM onto_goals WHERE project_id = p_project_id;

\t-- Finally remove the project (project_calendars will cascade)
\tDELETE FROM onto_projects WHERE id = p_project_id;
END;
$function$
"
},
{
"args": "",
"name": "delete_phase_tasks_on_deleted",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.delete_phase_tasks_on_deleted()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
-- Check if the task is being marked as deleted (from null to timestamp)
IF NEW.deleted_at IS NOT NULL AND (OLD.deleted_at IS NULL) THEN
-- Delete all related records from phase_tasks table
DELETE FROM phase_tasks
WHERE task_id = NEW.id;

-- Log the deletion (optional - remove if not needed)
RAISE NOTICE 'Deleted phase_tasks records for deleted task %', NEW.id;
END IF;

-- Return the new record to continue with the update
RETURN NEW;
END;
$function$
"
},
{
"args": "",
"name": "delete_phase_tasks_on_insert_deleted",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.delete_phase_tasks_on_insert_deleted()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
-- If a task is inserted with deleted_at set, delete any phase_tasks
IF NEW.deleted_at IS NOT NULL THEN
DELETE FROM phase_tasks
WHERE task_id = NEW.id;

-- Log the deletion (optional)
RAISE NOTICE 'Deleted phase_tasks records for inserted deleted task %', NEW.id;
END IF;

RETURN NEW;
END;
$function$
"
},
{
"args": "p_event_type text, p_event_source text, p_actor_user_id uuid, p_target_user_id uuid, p_payload jsonb, p_metadata jsonb, p_scheduled_for timestamp with time zone",
"name": "emit_notification_event",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.emit_notification_event(p_event_type text, p_event_source text DEFAULT 'api_action'::text, p_actor_user_id uuid DEFAULT NULL::uuid, p_target_user_id uuid DEFAULT NULL::uuid, p_payload jsonb DEFAULT '{}'::jsonb, p_metadata jsonb DEFAULT '{}'::jsonb, p_scheduled_for timestamp with time zone DEFAULT NULL::timestamp with time zone)
RETURNS uuid
LANGUAGE plpgsql
AS $function$
DECLARE
v_event_id UUID;
v_subscription RECORD;
v_prefs RECORD;
v_push_sub RECORD;
v_delivery_id UUID;
v_queue_job_id TEXT;
v_correlation_id UUID;
v_enriched_metadata JSONB;
v_is_daily_brief BOOLEAN;
BEGIN
v_is_daily_brief := p_event_type IN ('brief.completed', 'brief.failed');

-- Extract or generate correlation ID
v_correlation_id := COALESCE(
(p_metadata->>'correlationId'): :UUID,
(p_payload->>'correlationId'): :UUID,
gen_random_uuid()
);

-- Enrich metadata with correlation ID
v_enriched_metadata := p_metadata || jsonb_build_object('correlationId', v_correlation_id);

-- Insert event with correlation ID
INSERT INTO notification_events (
event_type,
event_source,
actor_user_id,
target_user_id,
payload,
metadata,
correlation_id
) VALUES (
p_event_type,
p_event_source,
p_actor_user_id,
p_target_user_id,
p_payload,
v_enriched_metadata,
v_correlation_id
) RETURNING id INTO v_event_id;

-- Find active subscriptions for this event type (explicit opt-in only)
FOR v*subscription IN
SELECT * FROM notification*subscriptions
WHERE event_type = p_event_type
AND is_active = true
AND (admin_only IS TRUE OR created_by IS NOT NULL)
AND (p_target_user_id IS NULL OR user_id = p_target_user_id)
LOOP
-- Get user notification preferences (no event_type filter)
SELECT * INTO v_prefs
FROM user_notification_preferences
WHERE user_id = v_subscription.user_id;

-- If preferences are missing, fail closed
IF NOT FOUND THEN
RAISE NOTICE 'No preferences found for user %, skipping', v_subscription.user_id;
CONTINUE;
END IF;

-- Queue push notifications
IF COALESCE(v_prefs.push_enabled, false) THEN
FOR v_push_sub IN
SELECT \* FROM push_subscriptions
WHERE user_id = v_subscription.user_id
AND is_active = true
LOOP
INSERT INTO notification_deliveries (
event_id,
subscription_id,
recipient_user_id,
channel,
channel_identifier,
payload,
status,
correlation_id
) VALUES (
v_event_id,
v_subscription.id,
v_subscription.user_id,
'push',
v_push_sub.endpoint,
p_payload,
'pending',
v_correlation_id
) RETURNING id INTO v_delivery_id;

v_queue_job_id := 'notif*' || v*delivery_id || '*' || extract(epoch from now()): :bigint;
INSERT INTO queue*jobs (
user_id,
job_type,
status,
scheduled_for,
queue_job_id,
metadata
) VALUES (
v_subscription.user_id,
'send_notification',
'pending',
COALESCE(p_scheduled_for, NOW()),
v_queue_job_id,
jsonb_build_object(
'event_id', v_event_id,
'event_type', p_event_type,
'delivery_id', v_delivery_id,
'channel', 'push',
'correlationId', v_correlation_id
)
);
END LOOP;
END IF;

-- Queue in-app notifications
IF COALESCE(v_prefs.in_app_enabled, false) THEN
INSERT INTO notification_deliveries (
event_id,
subscription_id,
recipient_user_id,
channel,
payload,
status,
correlation_id
) VALUES (
v_event_id,
v_subscription.id,
v_subscription.user_id,
'in_app',
p_payload,
'pending',
v_correlation_id
) RETURNING id INTO v_delivery_id;

v_queue_job_id := 'notif*' || v*delivery_id || '*' || extract(epoch from now()): :bigint;
INSERT INTO queue*jobs (
user_id,
job_type,
status,
scheduled_for,
queue_job_id,
metadata
) VALUES (
v_subscription.user_id,
'send_notification',
'pending',
COALESCE(p_scheduled_for, NOW()),
v_queue_job_id,
jsonb_build_object(
'event_id', v_event_id,
'event_type', p_event_type,
'delivery_id', v_delivery_id,
'channel', 'in_app',
'correlationId', v_correlation_id
)
);
END IF;

-- Queue email notifications
IF (
(v_is_daily_brief AND COALESCE(v_prefs.should_email_daily_brief, false))
OR (NOT v_is_daily_brief AND COALESCE(v_prefs.email_enabled, false))
) THEN
INSERT INTO notification_deliveries (
event_id,
subscription_id,
recipient_user_id,
channel,
payload,
status,
correlation_id
) VALUES (
v_event_id,
v_subscription.id,
v_subscription.user_id,
'email',
p_payload,
'pending',
v_correlation_id
) RETURNING id INTO v_delivery_id;

v_queue_job_id := 'notif*' || v*delivery_id || '*' || extract(epoch from now()): :bigint;
INSERT INTO queue*jobs (
user_id,
job_type,
status,
scheduled_for,
queue_job_id,
metadata
) VALUES (
v_subscription.user_id,
'send_notification',
'pending',
COALESCE(p_scheduled_for, NOW()),
v_queue_job_id,
jsonb_build_object(
'event_id', v_event_id,
'event_type', p_event_type,
'delivery_id', v_delivery_id,
'channel', 'email',
'correlationId', v_correlation_id
)
);
END IF;

-- Queue SMS notifications
IF (
(v_is_daily_brief AND COALESCE(v_prefs.should_sms_daily_brief, false))
OR (NOT v_is_daily_brief AND COALESCE(v_prefs.sms_enabled, false))
) THEN
DECLARE
v_sms_prefs RECORD;
BEGIN
SELECT \* INTO v_sms_prefs
FROM user_sms_preferences
WHERE user_id = v_subscription.user_id
AND phone_verified = true
AND opted_out = false
AND phone_number IS NOT NULL;

IF FOUND THEN
INSERT INTO notification_deliveries (
event_id,
subscription_id,
recipient_user_id,
channel,
channel_identifier,
payload,
status,
correlation_id
) VALUES (
v_event_id,
v_subscription.id,
v_subscription.user_id,
'sms',
v_sms_prefs.phone_number,
p_payload,
'pending',
v_correlation_id
) RETURNING id INTO v_delivery_id;

v_queue_job_id := 'notif*' || v*delivery_id || '\*' || extract(epoch from now()): :bigint;
INSERT INTO queue_jobs (
user_id,
job_type,
status,
scheduled_for,
queue_job_id,
metadata
) VALUES (
v_subscription.user_id,
'send_notification',
'pending',
COALESCE(p_scheduled_for, NOW()),
v_queue_job_id,
jsonb_build_object(
'event_id', v_event_id,
'event_type', p_event_type,
'delivery_id', v_delivery_id,
'channel', 'sms',
'correlationId', v_correlation_id
)
);
END IF;
END;
END IF;

END LOOP;

RETURN v_event_id;
END;
$function$
"
},
{
"args": "p_user_id uuid",
"name": "ensure_actor_for_user",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.ensure_actor_for_user(p_user_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
declare
v_actor_id uuid;
v_user_name text;
v_user_email text;
begin
-- Check if actor already exists
select id into v_actor_id
from onto_actors
where user_id = p_user_id;

if v_actor_id is not null then
return v_actor_id;
end if;

-- Get user info
select name, email into v_user_name, v_user_email
from public.users
where id = p_user_id;

if v_user_name is null then
raise exception 'User not found: %', p_user_id;
end if;

-- Create new actor
insert into onto_actors (kind, name, email, user_id)
values ('human', coalesce(v_user_name, v_user_email, 'Unknown User'), v_user_email, p_user_id)
returning id into v_actor_id;

return v_actor_id;
end;
$function$
"
},
{
"args": "",
"name": "ensure_single_active_template",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.ensure_single_active_template()
RETURNS trigger
LANGUAGE plpgsql
AS $function$\r
BEGIN\r
-- If setting a template to in_use = true\r
IF NEW.in_use = true AND NEW.project_id IS NOT NULL THEN\r
-- Set all other templates for this project to in_use = false\r
UPDATE project_brief_templates\r
SET in_use = false,\r
updated_at = CURRENT_TIMESTAMP\r
WHERE project_id = NEW.project_id\r
AND user_id = NEW.user_id\r
AND id != NEW.id\r
AND in_use = true;\r
END IF;\r
\r
RETURN NEW;\r
END;\r
$function$
"
},
{
"args": "",
"name": "ensure_user_notification_preferences",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.ensure_user_notification_preferences()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
INSERT INTO user_notification_preferences (
id,
user_id,
email_enabled,
sms_enabled,
push_enabled,
in_app_enabled,
batch_enabled,
quiet_hours_enabled,
should_email_daily_brief,
should_sms_daily_brief,
priority,
created_at,
updated_at
)
VALUES (
gen_random_uuid(),
NEW.id,
false, -- email_enabled (explicit opt-in)
false, -- sms_enabled (explicit opt-in)
false, -- push_enabled (explicit opt-in)
false, -- in_app_enabled (explicit opt-in)
false, -- batch_enabled
false, -- quiet_hours_enabled
false, -- should_email_daily_brief (explicit opt-in)
false, -- should_sms_daily_brief (explicit opt-in)
'normal',
NOW(),
NOW()
)
ON CONFLICT (user_id) DO NOTHING;

RETURN NEW;
EXCEPTION
WHEN OTHERS THEN
RAISE WARNING 'Failed to create notification preferences for user %: %', NEW.id, SQLERRM;
RETURN NEW;
END;
$function$
"
},
{
"args": "p_job_id uuid, p_error_message text, p_retry boolean",
"name": "fail_queue_job",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.fail_queue_job(p_job_id uuid, p_error_message text, p_retry boolean DEFAULT true)
RETURNS boolean
LANGUAGE plpgsql
AS $function$
DECLARE
v_job RECORD;
v_updated INTEGER;
v_retry_delay INTEGER;
BEGIN
-- Get current job state
SELECT attempts, max_attempts
INTO v_job
FROM queue_jobs
WHERE id = p_job_id;

IF NOT FOUND THEN
RETURN FALSE;
END IF;

-- Calculate exponential backoff: 2^attempts minutes
v_retry_delay := POWER(2, COALESCE(v_job.attempts,
0));

-- Determine if we should retry
IF p_retry AND (COALESCE(v_job.attempts, 0) + 1 < COALESCE(v_job.max_attempts,
3)) THEN
-- Retry: increment attempts and schedule for later
UPDATE queue_jobs
SET
status = 'pending',
attempts = COALESCE(attempts, 0) + 1,
error_message = p_error_message,
updated_at = NOW(),
scheduled_for = NOW() + (v_retry_delay || ' minutes'): :INTERVAL
WHERE id = p_job_id;
ELSE
-- Final failure: mark as failed
UPDATE queue_jobs
SET
status = 'failed',
attempts = COALESCE(attempts, 0) + 1,
error_message = p_error_message,
completed_at = NOW(),
updated_at = NOW()
WHERE id = p_job_id;
END IF;

GET DIAGNOSTICS v_updated = ROW_COUNT;
RETURN v_updated > 0;
END;
$function$
"
},
{
"args": "p_draft_id uuid, p_user_id uuid",
"name": "finalize_draft_project",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.finalize_draft_project(p_draft_id uuid, p_user_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
v_project_id UUID;
v_draft RECORD;
v_task RECORD;
v_new_task_id UUID;
BEGIN
-- Get the draft
SELECT * INTO v*draft
FROM project_drafts
WHERE id = p_draft_id AND user_id = p_user_id;

IF NOT FOUND THEN
RAISE EXCEPTION 'Draft not found or not owned by user';
END IF;

IF v_draft.finalized_project_id IS NOT NULL THEN
RAISE EXCEPTION 'Draft already finalized';
END IF;

-- Create the project
INSERT INTO projects (
user_id, name, slug, description, context, executive_summary,
status, tags, start_date, end_date,
core_integrity_ideals, core_people_bonds, core_goals_momentum,
core_meaning_identity, core_reality_understanding, core_trust_safeguards,
core_opportunity_freedom, core_power_resources, core_harmony_integration,
calendar_color_id, calendar_settings, calendar_sync_enabled,
source, source_metadata
)
SELECT
user_id, name, slug, description, context, executive_summary,
status, tags, start_date, end_date,
core_integrity_ideals, core_people_bonds, core_goals_momentum,
core_meaning_identity, core_reality_understanding, core_trust_safeguards,
core_opportunity_freedom, core_power_resources, core_harmony_integration,
calendar_color_id, calendar_settings, calendar_sync_enabled,
'conversational_agent', jsonb_build_object('draft_id', id)
FROM project_drafts
WHERE id = p_draft_id
RETURNING id INTO v_project_id;

-- Create tasks from draft_tasks
FOR v_task IN
SELECT * FROM draft*tasks
WHERE draft_project_id = p_draft_id
ORDER BY parent_task_id NULLS FIRST -- Parents first
LOOP
INSERT INTO tasks (
user_id, project_id, title, description, details,
priority, status, task_type,
start_date, duration_minutes,
recurrence_pattern, recurrence_ends, recurrence_end_source,
task_steps, source, source_calendar_event_id, outdated
)
VALUES (
v_task.user_id, v_project_id, v_task.title, v_task.description, v_task.details,
v_task.priority, v_task.status, v_task.task_type,
v_task.start_date, v_task.duration_minutes,
v_task.recurrence_pattern, v_task.recurrence_ends, v_task.recurrence_end_source,
v_task.task_steps, 'conversational_agent', v_task.source_calendar_event_id, v_task.outdated
)
RETURNING id INTO v_new_task_id;

-- Update the draft task with finalized ID for reference
UPDATE draft_tasks
SET finalized_task_id = v_new_task_id
WHERE id = v_task.id;
END LOOP;

-- Mark draft as completed
UPDATE project_drafts
SET
completed_at = CURRENT_TIMESTAMP,
finalized_project_id = v_project_id
WHERE id = p_draft_id;

RETURN v_project_id;
END;
$function$
"
},
{
"args": "p_task_id uuid, p_start_date date, p_end_date date",
"name": "generate_recurring_instances",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.generate_recurring_instances(p_task_id uuid, p_start_date date, p_end_date date)
RETURNS TABLE(instance_date date)
LANGUAGE plpgsql
AS $function$
DECLARE
v_task RECORD;
v_current_date DATE;
v_pattern TEXT;
BEGIN
-- Get task details
SELECT * INTO v*task
FROM tasks
WHERE id = p_task_id
AND task_type = 'recurring';

IF NOT FOUND THEN
RETURN;
END IF;

v_pattern := v_task.recurrence_pattern;
v_current_date := COALESCE(v_task.start_date: :DATE, p_start_date);

-- Generate instances based on pattern
WHILE v_current_date <= p_end_date LOOP
-- Check if date should be included based on pattern
IF v_pattern = 'daily' THEN
RETURN QUERY SELECT v_current_date;
ELSIF v_pattern = 'weekdays' THEN
IF EXTRACT(DOW FROM v_current_date) BETWEEN 1 AND 5 THEN
RETURN QUERY SELECT v_current_date;
END IF;
ELSIF v_pattern = 'weekly' THEN
IF EXTRACT(DOW FROM v_current_date) = EXTRACT(DOW FROM v_task.start_date: :DATE) THEN
RETURN QUERY SELECT v_current_date;
END IF;
ELSIF v_pattern = 'biweekly' THEN
IF EXTRACT(DOW FROM v_current_date) = EXTRACT(DOW FROM v_task.start_date: :DATE)
AND ((v_current_date - v_task.start_date: :DATE) / 7) % 2 = 0 THEN
RETURN QUERY SELECT v_current_date;
END IF;
ELSIF v_pattern = 'monthly' THEN
IF EXTRACT(DAY FROM v_current_date) = EXTRACT(DAY FROM v_task.start_date: :DATE) THEN
RETURN QUERY SELECT v_current_date;
END IF;
ELSIF v_pattern = 'quarterly' THEN
IF EXTRACT(DAY FROM v_current_date) = EXTRACT(DAY FROM v_task.start_date: :DATE)
AND ((EXTRACT(YEAR FROM v_current_date) * 12 + EXTRACT(MONTH FROM v*current_date)) -
(EXTRACT(YEAR FROM v_task.start_date: :DATE) * 12 + EXTRACT(MONTH FROM v*task.start_date: :DATE))) % 3 = 0 THEN
RETURN QUERY SELECT v_current_date;
END IF;
ELSIF v_pattern = 'yearly' THEN
IF EXTRACT(MONTH FROM v_current_date) = EXTRACT(MONTH FROM v_task.start_date: :DATE)
AND EXTRACT(DAY FROM v_current_date) = EXTRACT(DAY FROM v_task.start_date: :DATE) THEN
RETURN QUERY SELECT v_current_date;
END IF;
END IF;

-- Move to next day
v_current_date := v_current_date + INTERVAL '1 day';

-- Check recurrence end date
IF v*task.recurrence_ends IS NOT NULL AND v_current_date > v_task.recurrence_ends: :DATE THEN
EXIT;
END IF;
END LOOP;
END;
$function$
"
},
{
"args": "length integer",
"name": "generate_short_code",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.generate_short_code(length integer DEFAULT 6)
RETURNS text
LANGUAGE plpgsql
AS $function$
DECLARE
chars TEXT := 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
result TEXT := '';
i INTEGER;
BEGIN
FOR i IN 1..length LOOP
result := result || substr(chars, floor(random() * length(chars) + 1): :int,
1);
END LOOP;
RETURN result;
END;
$function$
"
},
{
"args": "",
"name": "generate*tracking_id",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.generate_tracking_id()
RETURNS trigger
LANGUAGE plpgsql
AS $function$\r
BEGIN\r
IF NEW.tracking_id IS NULL AND NEW.tracking_enabled = true THEN\r
NEW.tracking_id = encode(gen_random_bytes(16), 'hex');\r
END IF;\r
RETURN NEW;\r
END;\r
$function$
"
},
{
"args": "p_start_date timestamp with time zone, p_end_date timestamp with time zone",
"name": "get_admin_model_breakdown",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.get_admin_model_breakdown(p_start_date timestamp with time zone, p_end_date timestamp with time zone)
RETURNS TABLE(model character varying, requests bigint, total_cost numeric, total_tokens bigint, avg_response_time integer, success_rate numeric)
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$\r
BEGIN\r
RETURN QUERY\r
SELECT\r
l.model_used as model,\r
COUNT(*): :BIGINT as requests,\r
SUM(l.total*cost_usd): :NUMERIC as total_cost,\r
SUM(l.total_tokens): :BIGINT as total_tokens,\r
AVG(l.response_time_ms): :INTEGER as avg_response_time,\r
(COUNT(\*) FILTER (WHERE l.status = 'success'): :NUMERIC / COUNT(*): :NUMERIC _ 100) as success*rate\r
FROM llm_usage_logs l\r
WHERE l.created_at BETWEEN p_start_date AND p_end_date\r
GROUP BY l.model_used\r
ORDER BY total_cost DESC;\r
END;\r
$function$
"
},
{
"args": "p_start_date timestamp with time zone, p_end_date timestamp with time zone",
"name": "get_admin_operation_breakdown",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.get_admin_operation_breakdown(p_start_date timestamp with time zone, p_end_date timestamp with time zone)
RETURNS TABLE(operation character varying, requests bigint, total_cost numeric, total_tokens bigint, avg_response_time integer, success_rate numeric)
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$\r
BEGIN\r
RETURN QUERY\r
SELECT\r
l.operation_type: :VARCHAR as operation,\r
COUNT(*): :BIGINT as requests,\r
SUM(l.total*cost_usd): :NUMERIC as total_cost,\r
SUM(l.total_tokens): :BIGINT as total_tokens,\r
AVG(l.response_time_ms): :INTEGER as avg_response_time,\r
(COUNT(*) FILTER (WHERE l.status = 'success'): :NUMERIC / COUNT(_): :NUMERIC \_ 100) as success*rate\r
FROM llm_usage_logs l\r
WHERE l.created_at BETWEEN p_start_date AND p_end_date\r
GROUP BY l.operation_type\r
ORDER BY total_cost DESC;\r
END;\r
$function$
"
},
{
"args": "p_start_date timestamp with time zone, p_end_date timestamp with time zone, p_limit integer",
"name": "get_admin_top_users",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.get_admin_top_users(p_start_date timestamp with time zone, p_end_date timestamp with time zone, p_limit integer DEFAULT 20)
RETURNS TABLE(user_id uuid, email character varying, name character varying, requests bigint, total_cost numeric, total_tokens bigint, avg_response_time integer, last_usage timestamp with time zone)
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$\r
BEGIN\r
RETURN QUERY\r
SELECT\r
l.user_id,\r
u.email: :VARCHAR,\r
u.name: :VARCHAR,\r
COUNT(*): :BIGINT as requests,\r
SUM(l.total*cost_usd): :NUMERIC as total_cost,\r
SUM(l.total_tokens): :BIGINT as total_tokens,\r
AVG(l.response_time_ms): :INTEGER as avg_response_time,\r
MAX(l.created_at) as last_usage\r
FROM llm_usage_logs l\r
JOIN users u ON u.id = l.user_id\r
WHERE l.created_at BETWEEN p_start_date AND p_end_date\r
GROUP BY l.user_id, u.email, u.name\r
ORDER BY total_cost DESC\r
LIMIT p_limit;\r
END;\r
$function$
"
},
{
"args": "p_brief_id text",
"name": "get_brief_email_status",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.get_brief_email_status(p_brief_id text)
RETURNS TABLE(email_id uuid, status text, sent_at timestamp with time zone, recipient_email text, recipient_status text, opened_at timestamp with time zone, open_count integer)
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
RETURN QUERY
SELECT
e.id as email_id,
e.status,
er.sent_at,
er.recipient_email,
er.status as recipient_status,
er.opened_at,
er.open_count
FROM emails e
LEFT JOIN email_recipients er ON er.email_id = e.id
WHERE e.category = 'daily_brief'
AND e.template_data->>'brief_id' = p_brief_id
ORDER BY e.created_at DESC
LIMIT 1;
END;
$function$
"
},
{
"args": "start_date date, end_date date",
"name": "get_brief_generation_stats",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.get_brief_generation_stats(start_date date, end_date date)
RETURNS TABLE(date date, total_briefs bigint, unique_users bigint, avg_briefs_per_user numeric)
LANGUAGE sql
STABLE
AS $function$
WITH date_series AS (
SELECT generate_series(start_date: :date, end_date: :date, '1 day': :interval): :date AS date
),
brief_counts AS (
SELECT
brief_date AS date,
COUNT(*) AS total\*briefs,
COUNT(DISTINCT user_id) AS unique_users
FROM ontology_daily_briefs
WHERE generation_status = 'completed'
AND brief_date BETWEEN start_date AND end_date
GROUP BY brief_date
)
SELECT
ds.date,
COALESCE(bc.total_briefs, 0) AS total_briefs,
COALESCE(bc.unique_users, 0) AS unique_users,
CASE
WHEN COALESCE(bc.unique_users, 0) > 0
THEN ROUND((bc.total_briefs: :numeric / bc.unique_users): :numeric, 2)
ELSE 0
END AS avg_briefs_per_user
FROM date_series ds
LEFT JOIN brief_counts bc ON bc.date = ds.date
ORDER BY ds.date;
$function$
"
},
{
"args": "start_date date, end_date date",
"name": "get_daily_active_users",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.get_daily_active_users(start_date date, end_date date)
RETURNS TABLE(date date, active_users bigint)
LANGUAGE sql
STABLE
AS $function$
WITH activity AS (
SELECT changed_by AS user_id, created_at: :date AS activity_date
FROM onto_project_logs
WHERE created_at: :date BETWEEN start_date AND end_date
UNION ALL
SELECT user_id, created_at: :date AS activity_date
FROM ontology_daily_briefs
WHERE generation_status = 'completed'
AND created_at: :date BETWEEN start_date AND end_date
UNION ALL
SELECT user_id, created_at: :date AS activity_date
FROM onto_braindumps
WHERE created_at: :date BETWEEN start_date AND end_date
UNION ALL
SELECT user_id, created_at: :date AS activity_date
FROM agent_chat_sessions
WHERE created_at: :date BETWEEN start_date AND end_date
)
SELECT
activity_date AS date,
COUNT(DISTINCT user_id) AS active_users
FROM activity
WHERE user_id IS NOT NULL
GROUP BY activity_date
ORDER BY activity_date;
$function$
"
},
{
"args": "start_date date, end_date date",
"name": "get_daily_visitors",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.get_daily_visitors(start_date date, end_date date)
RETURNS TABLE(date date, visitor_count bigint)
LANGUAGE plpgsql
AS $function$\r
BEGIN\r
RETURN QUERY\r
WITH date_series AS (\r
SELECT generate_series(start_date: :DATE, end_date: :DATE, '1 day': :INTERVAL): :DATE AS date\r
),\r
daily_counts AS (\r
SELECT \r
DATE(created_at AT TIME ZONE 'UTC') as visit_date,\r
COUNT(DISTINCT visitor_id) as visitor_count\r
FROM visitors \r
WHERE DATE(created_at AT TIME ZONE 'UTC') BETWEEN start_date AND end_date\r
GROUP BY DATE(created_at AT TIME ZONE 'UTC')\r
)\r
SELECT \r
ds.date,\r
COALESCE(dc.visitor_count, 0) as visitor_count\r
FROM date_series ds\r
LEFT JOIN daily_counts dc ON ds.date = dc.visit_date\r
ORDER BY ds.date ASC;\r
END;\r
$function$
"
},
{
"args": "p_user_id uuid, p_timezone text, p_date_start date, p_date_end date, p_today date",
"name": "get_dashboard_data",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.get_dashboard_data(p_user_id uuid, p_timezone text DEFAULT 'UTC'::text, p_date_start date DEFAULT NULL::date, p_date_end date DEFAULT NULL::date, p_today date DEFAULT NULL::date)
RETURNS json
LANGUAGE plpgsql
STABLE SECURITY DEFINER
AS $function$DECLARE
v_result JSON;
v_date_start DATE;
v_date_end DATE;
v_today DATE;
v_tomorrow DATE;
v_week_end DATE;
BEGIN
-- Set default dates if not provided
v_today := COALESCE(p_today, CURRENT_DATE);
v_date_start := COALESCE(p_date_start, v_today - INTERVAL '30 days');
v_date_end := COALESCE(p_date_end, v_today + INTERVAL '14 days');
v_tomorrow := v_today + INTERVAL '1 day';
v_week_end := v_today + INTERVAL '7 days';

-- Build the complete result in a single query
SELECT json_build_object(
'regular_tasks', (
SELECT COALESCE(json_agg(
json_build_object(
'id', t.id,
'title', t.title,
'description', t.description,
'status', t.status,
'priority', t.priority,
'task_type', t.task_type,
'details', t.details,
'start_date', t.start_date,
'duration_minutes', t.duration_minutes,
'project_id', t.project_id,
'created_at', t.created_at,
'updated_at', t.updated_at,
'recurrence_pattern', t.recurrence_pattern,
'project', CASE
WHEN p.id IS NOT NULL THEN json_build_object(
'id', p.id,
'name', p.name,
'slug', p.slug,
'status', p.status
)
ELSE NULL
END
) ORDER BY t.priority DESC, t.start_date ASC
), '[]': :json)
FROM tasks t
LEFT JOIN projects p ON t.project_id = p.id
WHERE t.user_id = p_user_id
AND t.status != 'done'
AND t.deleted_at IS NULL
AND t.start_date >= v_date_start
AND t.start_date <= v_date_end
),

'overdue_instances', (
SELECT COALESCE(json_agg(
json_build_object(
'id', ri.id,
'task_id', ri.task_id,
'instance_date', ri.instance_date,
'status', ri.status,
'completed_at', ri.completed_at,
'user_id', ri.user_id,
'created_at', ri.created_at,
'updated_at', ri.updated_at,
'task', json_build_object(
'id', t.id,
'title', t.title,
'description', t.description,
'details', t.details,
'status', t.status,
'priority', t.priority,
'task_type', t.task_type,
'start_date', t.start_date,
'duration_minutes', t.duration_minutes,
'project_id', t.project_id,
'created_at', t.created_at,
'updated_at', t.updated_at,
'recurrence_pattern', t.recurrence_pattern,
'recurrence_ends', t.recurrence_ends,
'recurrence_end_source', t.recurrence_end_source,
'project', CASE
WHEN p.id IS NOT NULL THEN json_build_object(
'id', p.id,
'name', p.name,
'slug', p.slug,
'description', p.description,
'status', p.status
)
ELSE NULL
END,
'calendar_events', (
SELECT COALESCE(json_agg(
json_build_object(
'id', tce.id,
'calendar_event_id', tce.calendar_event_id,
'calendar_id', tce.calendar_id,
'event_start', tce.event_start,
'event_end', tce.event_end,
'event_link', tce.event_link,
'sync_status', tce.sync_status
)
), '[]': :json)
FROM task_calendar_events tce
WHERE tce.task_id = t.id
)
)
) ORDER BY ri.instance_date DESC
), '[]': :json)
FROM recurring_task_instances ri
INNER JOIN tasks t ON ri.task_id = t.id
LEFT JOIN projects p ON t.project_id = p.id
WHERE ri.user_id = p_user_id
AND ri.instance_date < v_today
AND ri.status IN ('scheduled', 'overdue')
),

'week_instances', (
SELECT COALESCE(json_agg(
json_build_object(
'id', ri.id,
'task_id', ri.task_id,
'instance_date', ri.instance_date,
'status', ri.status,
'completed_at', ri.completed_at,
'user_id', ri.user_id,
'created_at', ri.created_at,
'updated_at', ri.updated_at,
'task', json_build_object(
'id', t.id,
'title', t.title,
'description', t.description,
'details', t.details,
'status', t.status,
'priority', t.priority,
'task_type', t.task_type,
'start_date', t.start_date,
'duration_minutes', t.duration_minutes,
'project_id', t.project_id,
'created_at', t.created_at,
'updated_at', t.updated_at,
'recurrence_pattern', t.recurrence_pattern,
'recurrence_ends', t.recurrence_ends,
'recurrence_end_source', t.recurrence_end_source,
'project', CASE
WHEN p.id IS NOT NULL THEN json_build_object(
'id', p.id,
'name', p.name,
'slug', p.slug,
'description', p.description,
'status', p.status
)
ELSE NULL
END,
'calendar_events', (
SELECT COALESCE(json_agg(
json_build_object(
'id', tce.id,
'calendar_event_id', tce.calendar_event_id,
'calendar_id', tce.calendar_id,
'event_start', tce.event_start,
'event_end', tce.event_end,
'event_link', tce.event_link,
'sync_status', tce.sync_status
)
), '[]': :json)
FROM task_calendar_events tce
WHERE tce.task_id = t.id
)
)
) ORDER BY ri.instance_date ASC
), '[]': :json)
FROM recurring_task_instances ri
INNER JOIN tasks t ON ri.task_id = t.id
LEFT JOIN projects p ON t.project_id = p.id
WHERE ri.user_id = p_user_id
AND ri.instance_date >= v_today
AND ri.instance_date <= v_week_end + INTERVAL '1 day'
AND ri.status IN ('scheduled', 'overdue')
),

'active_projects', (
SELECT COALESCE(json_agg(
json_build_object(
'id', p.id,
'name', p.name,
'slug', p.slug,
'status', p.status,
'updated_at', p.updated_at
) ORDER BY p.updated_at DESC
), '[]': :json)
FROM projects p
WHERE p.user_id = p_user_id
AND p.status = 'active'
LIMIT 10
),

'dates', json_build_object(
'today', v_today,
'tomorrow', v_tomorrow,
'week_end', v_week_end,
'date_start', v_date_start,
'date_end', v_date_end
),

'stats', json_build_object(
'total_tasks', (
SELECT COUNT(*)
FROM tasks
WHERE user*id = p_user_id
AND status != 'done'
AND deleted_at IS NULL
AND start_date BETWEEN v_date_start AND v_date_end
),
'overdue_count', (
SELECT COUNT(*)
FROM tasks
WHERE user*id = p_user_id
AND status NOT IN ('done')
AND deleted_at IS NULL
AND start_date < v_today
),
'today_count', (
SELECT COUNT(*)
FROM tasks
WHERE user*id = p_user_id
AND status != 'done'
AND deleted_at IS NULL
AND DATE(start_date) = v_today
),
'recurring_count', (
SELECT COUNT(*)
FROM tasks
WHERE user*id = p_user_id
AND task_type = 'recurring'
AND deleted_at IS NULL
)
)
) INTO v_result;

RETURN v*result;
END;$function$
"
},
{
"args": "user_ids uuid[]",
"name": "get_latest_ontology_daily_briefs",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.get_latest_ontology_daily_briefs(user_ids uuid[])
RETURNS TABLE(user_id uuid, brief_date date, generation_completed_at timestamp with time zone)
LANGUAGE sql
STABLE
AS $function$
\tSELECT DISTINCT ON (user_id)
\t\tuser_id,
\t\tbrief_date,
\t\tgeneration_completed_at
\tFROM ontology_daily_briefs
\tWHERE user_id = ANY (user_ids)
\tORDER BY user_id, brief_date DESC;
$function$
"
},
{
"args": "p_delivery_id uuid, p_days_back integer",
"name": "get_link_click_stats",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.get_link_click_stats(p_delivery_id uuid DEFAULT NULL::uuid, p_days_back integer DEFAULT 7)
RETURNS TABLE(total_links bigint, total_clicks bigint, unique_clicked_links bigint, click_through_rate numeric)
LANGUAGE plpgsql
STABLE
AS $function$
BEGIN
RETURN QUERY
SELECT
COUNT(*): :BIGINT as total*links,
SUM(click_count): :BIGINT as total_clicks,
COUNT(*) FILTER (WHERE click*count > 0): :BIGINT as unique_clicked_links,
CASE
WHEN COUNT(\*) > 0 THEN
ROUND(100.0 * COUNT(_) FILTER (WHERE click*count > 0) / COUNT(*), 2)
ELSE 0
END as click*through_rate
FROM notification_tracking_links
WHERE
(p_delivery_id IS NULL OR delivery_id = p_delivery_id)
AND created_at > NOW() - (p_days_back || ' days'): :INTERVAL;
END;
$function$
"
},
{
"args": "",
"name": "get_migration_platform_lock_status",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.get_migration_platform_lock_status()
RETURNS TABLE(is_locked boolean, run_id uuid, locked_by uuid, locked_by_email text, locked_at timestamp with time zone, expires_at timestamp with time zone)
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
RETURN QUERY
SELECT
(mpl.run_id IS NOT NULL AND mpl.expires_at > NOW()) AS is_locked,
mpl.run_id,
mpl.locked_by,
u.email AS locked_by_email,
mpl.locked_at,
mpl.expires_at
FROM migration_platform_lock mpl
LEFT JOIN auth.users u ON u.id = mpl.locked_by
WHERE mpl.id = 1;
END;
$function$
"
},
{
"args": "",
"name": "get_notification_active_subscriptions",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.get_notification_active_subscriptions()
RETURNS TABLE(user_id uuid, email text, name text, subscribed_events text[], push_enabled boolean, email_enabled boolean, sms_enabled boolean, in_app_enabled boolean, last_notification_sent timestamp with time zone)
LANGUAGE plpgsql
AS $function$
BEGIN
RETURN QUERY
SELECT
u.id AS user_id,
u.email,
u.name,
ARRAY_AGG(DISTINCT ns.event_type) AS subscribed_events,
BOOL_OR(unp.push_enabled) AS push_enabled,
BOOL_OR(unp.email_enabled) AS email_enabled,
BOOL_OR(unp.sms_enabled) AS sms_enabled,
BOOL_OR(unp.in_app_enabled) AS in_app_enabled,
MAX(nd.created_at) AS last_notification_sent
FROM users u
JOIN notification_subscriptions ns ON ns.user_id = u.id
LEFT JOIN user_notification_preferences unp ON unp.user_id = u.id AND unp.event_type = ns.event_type
LEFT JOIN notification_deliveries nd ON nd.recipient_user_id = u.id
WHERE ns.is_active = true
GROUP BY u.id, u.email, u.name
ORDER BY last_notification_sent DESC NULLS LAST;
END;
$function$
"
},
{
"args": "p_interval text",
"name": "get_notification_channel_performance",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.get_notification_channel_performance(p_interval text DEFAULT '7 days'::text)
RETURNS TABLE(channel text, total_sent bigint, sent bigint, delivered bigint, opened bigint, clicked bigint, failed bigint, success_rate numeric, delivery_rate numeric, open_rate numeric, click_rate numeric, avg_delivery_time_ms numeric)
LANGUAGE plpgsql
AS $function$
BEGIN
RETURN QUERY
SELECT
nd.channel,
COUNT(*) AS total*sent,
COUNT(*) FILTER (WHERE nd.status = 'sent') AS sent,
COUNT(_) FILTER (WHERE nd.status = 'delivered') AS delivered, -- FIXED
COUNT(_) FILTER (WHERE nd.opened*at IS NOT NULL) AS opened,
COUNT(*) FILTER (WHERE nd.clicked*at IS NOT NULL) AS clicked,
COUNT(*) FILTER (WHERE nd.status = 'failed') AS failed,
-- Success rate: % that were sent successfully
ROUND(
(COUNT(_) FILTER (WHERE nd.status = 'sent'): :NUMERIC / NULLIF(COUNT(_): :NUMERIC, 0) _ 100),
2
) AS success*rate,
-- Delivery rate: % that were confirmed delivered (NEW)
ROUND(
(COUNT(*) FILTER (WHERE nd.status = 'delivered'): :NUMERIC / NULLIF(COUNT(_) FILTER (WHERE nd.status = 'sent'): :NUMERIC, 0) _ 100),
2
) AS delivery*rate,
-- Open rate: % of sent that were opened
ROUND(
(COUNT(*) FILTER (WHERE nd.opened*at IS NOT NULL): :NUMERIC / NULLIF(COUNT(*) FILTER (WHERE nd.status = 'sent'): :NUMERIC, 0) _ 100),
2
) AS open_rate,
-- Click rate: % of opened that were clicked
ROUND(
(COUNT(_) FILTER (WHERE nd.clicked*at IS NOT NULL): :NUMERIC / NULLIF(COUNT(*) FILTER (WHERE nd.opened*at IS NOT NULL): :NUMERIC, 0) * 100),
2
) AS click*rate,
-- Average delivery time with explicit NULL filter (FIXED)
ROUND(
AVG(EXTRACT(EPOCH FROM (nd.sent_at - nd.created_at)) * 1000) FILTER (WHERE nd.sent\*at IS NOT NULL): :NUMERIC,
2
) AS avg_delivery_time_ms
FROM notification_deliveries nd
WHERE nd.created_at > NOW() - p_interval: :INTERVAL
GROUP BY nd.channel
ORDER BY total_sent DESC;
END;
$function$
"
},
{
"args": "p_interval text, p_granularity text",
"name": "get_notification_delivery_timeline",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.get_notification_delivery_timeline(p_interval text DEFAULT '7 days'::text, p_granularity text DEFAULT 'day'::text)
RETURNS TABLE(time_bucket timestamp with time zone, sent bigint, delivered bigint, opened bigint, clicked bigint, failed bigint)
LANGUAGE plpgsql
AS $function$
DECLARE
v_trunc_format TEXT;
BEGIN
-- Set truncation format based on granularity
v_trunc_format := CASE
WHEN p_granularity = 'hour' THEN 'hour'
ELSE 'day'
END;

RETURN QUERY
EXECUTE format('
SELECT
DATE*TRUNC(%L, nd.created_at) AS time_bucket,
COUNT(\*) FILTER (WHERE nd.status = ''sent'') AS sent,
COUNT(*) FILTER (WHERE nd.status = ''delivered'') AS delivered,
COUNT(_) FILTER (WHERE nd.opened*at IS NOT NULL) AS opened,
COUNT(*) FILTER (WHERE nd.clicked*at IS NOT NULL) AS clicked,
COUNT(*) FILTER (WHERE nd.status = ''failed'') AS failed
FROM notification*deliveries nd
WHERE nd.created_at > NOW() - %L: :INTERVAL
GROUP BY time_bucket
ORDER BY time_bucket ASC
', v_trunc_format, p_interval);
END;
$function$
"
},
{
"args": "p_interval text",
"name": "get_notification_event_performance",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.get_notification_event_performance(p_interval text DEFAULT '30 days'::text)
RETURNS TABLE(event_type text, total_events bigint, total_deliveries bigint, unique_subscribers bigint, avg_delivery_time_seconds numeric, open_rate numeric, click_rate numeric)
LANGUAGE plpgsql
AS $function$
BEGIN
RETURN QUERY
SELECT
ne.event_type,
COUNT(DISTINCT ne.id) AS total_events,
COUNT(nd.id) AS total_deliveries,
COUNT(DISTINCT ns.user_id) AS unique_subscribers,
-- FIXED: Added explicit NULL filter
ROUND(
AVG(EXTRACT(EPOCH FROM (nd.sent_at - nd.created_at))) FILTER (WHERE nd.sent_at IS NOT NULL): :NUMERIC,
2
) AS avg_delivery_time_seconds,
ROUND(
(COUNT(*) FILTER (WHERE nd.opened*at IS NOT NULL): :NUMERIC / NULLIF(COUNT(*) FILTER (WHERE nd.status = 'sent'): :NUMERIC, 0) _ 100),
2
) AS open*rate,
ROUND(
(COUNT(*) FILTER (WHERE nd.clicked*at IS NOT NULL): :NUMERIC / NULLIF(COUNT(*) FILTER (WHERE nd.opened*at IS NOT NULL): :NUMERIC, 0) * 100),
2
) AS click\*rate
FROM notification_events ne
LEFT JOIN notification_deliveries nd ON nd.event_id = ne.id
LEFT JOIN notification_subscriptions ns ON ns.event_type = ne.event_type
WHERE ne.created_at > NOW() - p_interval: :INTERVAL
GROUP BY ne.event_type
ORDER BY total_events DESC;
END;
$function$
"
},
{
"args": "p_interval text, p_limit integer",
"name": "get_notification_failed_deliveries",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.get_notification_failed_deliveries(p_interval text DEFAULT '24 hours'::text, p_limit integer DEFAULT 50)
RETURNS TABLE(delivery_id uuid, event_id uuid, event_type text, channel text, recipient_user_id uuid, recipient_email text, last_error text, attempts integer, max_attempts integer, created_at timestamp with time zone, failed_at timestamp with time zone)
LANGUAGE plpgsql
AS $function$
BEGIN
RETURN QUERY
SELECT
nd.id AS delivery_id,
ne.id AS event_id,
ne.event_type,
nd.channel,
nd.recipient_user_id,
u.email AS recipient_email,
nd.last_error,
nd.attempts,
nd.max_attempts,
nd.created_at,
nd.failed_at
FROM notification_deliveries nd
JOIN notification_events ne ON ne.id = nd.event_id
JOIN users u ON u.id = nd.recipient_user_id
WHERE nd.status = 'failed'
AND nd.created_at > NOW() - p_interval: :INTERVAL
ORDER BY nd.created_at DESC
LIMIT p_limit;
END;
$function$
"
},
{
"args": "p_interval text, p_offset text",
"name": "get_notification_overview_metrics",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.get_notification_overview_metrics(p_interval text DEFAULT '7 days'::text, p_offset text DEFAULT NULL::text)
RETURNS TABLE(total_sent bigint, delivery_success_rate numeric, avg_open_rate numeric, avg_click_rate numeric)
LANGUAGE plpgsql
AS $function$
DECLARE
v_start_time TIMESTAMPTZ;
v_end_time TIMESTAMPTZ;
BEGIN
-- Calculate time range
IF p_offset IS NULL THEN
v_end_time := NOW();
v_start_time := NOW() - p_interval: :INTERVAL;
ELSE
v_end_time := NOW() - p_offset: :INTERVAL;
v_start_time := v_end_time - p_interval: :INTERVAL;
END IF;

RETURN QUERY
SELECT
COUNT(*) FILTER (WHERE nd.status = 'sent') AS total*sent,
ROUND(
(COUNT(_) FILTER (WHERE nd.status = 'sent'): :NUMERIC / NULLIF(COUNT(_): :NUMERIC, 0) * 100),
2
) AS delivery*success*rate,
ROUND(
(COUNT(*) FILTER (WHERE nd.opened*at IS NOT NULL): :NUMERIC / NULLIF(COUNT(\*) FILTER (WHERE nd.status = 'sent'): :NUMERIC, 0) * 100),
2
) AS avg*open_rate,
ROUND(
(COUNT(*) FILTER (WHERE nd.clicked*at IS NOT NULL): :NUMERIC / NULLIF(COUNT(*) FILTER (WHERE nd.opened*at IS NOT NULL): :NUMERIC, 0) * 100),
2
) AS avg\*click_rate
FROM notification_deliveries nd
WHERE nd.created_at >= v_start_time
AND nd.created_at < v_end_time;
END;
$function$
"
},
{
"args": "p_project_id uuid, p_actor_id uuid",
"name": "get_project_full",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.get_project_full(p_project_id uuid, p_actor_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
v_project jsonb;
v_result jsonb;
BEGIN
IF NOT current_actor_has_project_access(p_project_id, 'read') THEN
RETURN NULL;
END IF;

-- Verify the project exists (exclude soft-deleted projects)
SELECT to_jsonb(p.*)
INTO v*project
FROM onto_projects p
WHERE p.id = p_project_id
AND p.deleted_at IS NULL;

IF v_project IS NULL THEN
RETURN NULL;
END IF;

SELECT jsonb_build_object(
'project', v_project,

'goals', COALESCE((
SELECT jsonb_agg(to_jsonb(g.*) ORDER BY g.created*at)
FROM onto_goals g
WHERE g.project_id = p_project_id
AND g.deleted_at IS NULL
), '[]': :jsonb),

'requirements', COALESCE((
SELECT jsonb_agg(to_jsonb(r.*) ORDER BY r.created*at)
FROM onto_requirements r
WHERE r.project_id = p_project_id
AND r.deleted_at IS NULL
), '[]': :jsonb),

'plans', COALESCE((
SELECT jsonb_agg(to_jsonb(pl.*) ORDER BY pl.created*at)
FROM onto_plans pl
WHERE pl.project_id = p_project_id
AND pl.deleted_at IS NULL
), '[]': :jsonb),

'tasks', COALESCE((
SELECT jsonb_agg(to_jsonb(t.*) ORDER BY t.created*at)
FROM onto_tasks t
WHERE t.project_id = p_project_id
AND t.deleted_at IS NULL
), '[]': :jsonb),

'outputs', COALESCE((
SELECT jsonb_agg(to_jsonb(o.*) ORDER BY o.created*at)
FROM onto_outputs o
WHERE o.project_id = p_project_id
AND o.deleted_at IS NULL
), '[]': :jsonb),

'documents', COALESCE((
SELECT jsonb_agg(to_jsonb(d.*) ORDER BY d.created*at)
FROM onto_documents d
WHERE d.project_id = p_project_id
AND d.deleted_at IS NULL
), '[]': :jsonb),

'sources', COALESCE((
SELECT jsonb_agg(to_jsonb(s.*) ORDER BY s.created*at)
FROM onto_sources s
WHERE s.project_id = p_project_id
), '[]': :jsonb),

'milestones', COALESCE((
SELECT jsonb_agg(to_jsonb(m.*) ORDER BY m.due*at)
FROM onto_milestones m
WHERE m.project_id = p_project_id
AND m.deleted_at IS NULL
), '[]': :jsonb),

'risks', COALESCE((
SELECT jsonb_agg(to_jsonb(rk.*) ORDER BY rk.created*at)
FROM onto_risks rk
WHERE rk.project_id = p_project_id
AND rk.deleted_at IS NULL
), '[]': :jsonb),

'decisions', COALESCE((
SELECT jsonb_agg(to_jsonb(dc.*) ORDER BY dc.decision*at)
FROM onto_decisions dc
WHERE dc.project_id = p_project_id
AND dc.deleted_at IS NULL
), '[]': :jsonb),

'metrics', COALESCE((
SELECT jsonb_agg(to_jsonb(mt.*) ORDER BY mt.created*at)
FROM onto_metrics mt
WHERE mt.project_id = p_project_id
), '[]': :jsonb),

'context_document', (
SELECT to_jsonb(d.*)
FROM onto*edges e
JOIN onto_documents d ON d.id = e.dst_id
WHERE e.src_kind = 'project'
AND e.src_id = p_project_id
AND e.rel = 'has_context_document'
AND e.dst_kind = 'document'
AND d.deleted_at IS NULL
LIMIT 1
)
)
INTO v_result;

RETURN v_result;
END;
$function$
"
},
{
"args": "p_token_hash text",
"name": "get_project_invite_preview",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.get_project_invite_preview(p_token_hash text)
RETURNS TABLE(invite_id uuid, project_id uuid, project_name text, role_key text, access text, status text, expires_at timestamp with time zone, created_at timestamp with time zone, invitee_email text, invited_by_actor_id uuid, invited_by_name text, invited_by_email text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
v_invite onto_project_invites%ROWTYPE;
BEGIN
IF p_token_hash IS NULL OR length(trim(p_token_hash)) = 0 THEN
RAISE EXCEPTION 'Invite token missing';
END IF;

SELECT * INTO v*invite
FROM onto_project_invites
WHERE token_hash = p_token_hash;

IF NOT FOUND THEN
RAISE EXCEPTION 'Invite not found';
END IF;

IF v_invite.status = 'pending' AND v_invite.expires_at < now() THEN
UPDATE onto_project_invites
SET status = 'expired'
WHERE id = v_invite.id;
END IF;

RETURN QUERY
SELECT
i.id,
i.project_id,
p.name,
i.role_key,
i.access,
i.status,
i.expires_at,
i.created_at,
i.invitee_email,
i.invited_by_actor_id,
COALESCE(u.name, a.name, u.email, a.email) AS invited_by_name,
COALESCE(u.email, a.email) AS invited_by_email
FROM onto_project_invites i
JOIN onto_projects p ON p.id = i.project_id
LEFT JOIN onto_actors a ON a.id = i.invited_by_actor_id
LEFT JOIN public.users u ON u.id = a.user_id
WHERE i.id = v_invite.id;
END;
$function$
"
},
{
"args": "p_project_id uuid, p_user_id uuid",
"name": "get_project_phases_hierarchy",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.get_project_phases_hierarchy(p_project_id uuid, p_user_id uuid DEFAULT NULL::uuid)
RETURNS json
LANGUAGE plpgsql
STABLE SECURITY DEFINER
AS $function$
DECLARE
v_result JSON;
v_project_user_id UUID;
BEGIN
-- Verify project ownership if user_id provided
IF p_user_id IS NOT NULL THEN
SELECT user_id INTO v_project_user_id
FROM projects
WHERE id = p_project_id;

IF v_project_user_id IS NULL OR v_project_user_id != p_user_id THEN
RETURN json_build_object('error', 'Unauthorized', 'phases', '[]': :json);
END IF;
END IF;

-- Build the complete phases hierarchy in a single query
SELECT json_build_object(
'phases', COALESCE(
(SELECT json_agg(phase_data ORDER BY phase_data->>'order')
FROM (
SELECT json_build_object(
'id', p.id,
'project_id', p.project_id,
'user_id', p.user_id,
'name', p.name,
'description', p.description,
'start_date', p.start_date,
'end_date', p.end_date,
'order', p.order,
'created_at', p.created_at,
'updated_at', p.updated_at,
'tasks', COALESCE(
(SELECT json_agg(
json_build_object(
'id', t.id,
'title', t.title,
'description', t.description,
'details', t.details,
'status', t.status,
'priority', t.priority,
'task_type', t.task_type,
'start_date', t.start_date,
'deleted_at', t.deleted_at,
'created_at', t.created_at,
'updated_at', t.updated_at,
'project_id', t.project_id,
'completed_at', t.completed_at,
'suggested_start_date', pt.suggested_start_date,
'assignment_reason', pt.assignment_reason,
'calendar_events', COALESCE(
(SELECT json_agg(
json_build_object(
'id', tce.id,
'calendar_event_id', tce.calendar_event_id,
'calendar_id', tce.calendar_id,
'event_start', tce.event_start,
'event_end', tce.event_end,
'event_link', tce.event_link,
'sync_status', tce.sync_status
)
)
FROM task_calendar_events tce
WHERE tce.task_id = t.id
), '[]': :json
)
)
)
FROM phase_tasks pt
INNER JOIN tasks t ON pt.task_id = t.id
WHERE pt.phase_id = p.id
), '[]': :json
),
'task_count', (
SELECT COUNT(*)
FROM phase*tasks pt2
INNER JOIN tasks t2 ON pt2.task_id = t2.id
WHERE pt2.phase_id = p.id
),
'completed_tasks', (
SELECT COUNT(*)
FROM phase*tasks pt3
INNER JOIN tasks t3 ON pt3.task_id = t3.id
WHERE pt3.phase_id = p.id
AND t3.status IN ('done')
)
) AS phase_data
FROM phases p
WHERE p.project_id = p_project_id
) AS phase_subquery
), '[]': :json
),
'metadata', json_build_object(
'total_phases', (SELECT COUNT(*) FROM phases WHERE project*id = p_project_id),
'total_tasks', (
SELECT COUNT(DISTINCT pt.task_id)
FROM phase_tasks pt
INNER JOIN phases p ON pt.phase_id = p.id
WHERE p.project_id = p_project_id
),
'project_id', p_project_id,
'fetched_at', NOW()
)
) INTO v_result;

RETURN v_result;
END;
$function$
"
},
{
"args": "p_project_id uuid, p_actor_id uuid",
"name": "get_project_skeleton",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.get_project_skeleton(p_project_id uuid, p_actor_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
AS $function$
SELECT jsonb_build_object(
'id', p.id,
'name', p.name,
'description', p.description,
'state_key', p.state_key,
'type_key', p.type_key,
'next_step_short', p.next_step_short,
'next_step_long', p.next_step_long,
'next_step_source', p.next_step_source,
'next_step_updated_at', p.next_step_updated_at,
'created_at', p.created_at,
'updated_at', p.updated_at,
-- Entity counts using scalar subqueries (filter soft-deleted entities)
'task_count', (SELECT count(*) FROM onto*tasks WHERE project_id = p.id AND deleted_at IS NULL),
'output_count', (SELECT count(*) FROM onto*outputs WHERE project_id = p.id AND deleted_at IS NULL),
'document_count', (SELECT count(*) FROM onto*documents WHERE project_id = p.id AND deleted_at IS NULL),
'goal_count', (SELECT count(*) FROM onto*goals WHERE project_id = p.id AND deleted_at IS NULL),
'plan_count', (SELECT count(*) FROM onto*plans WHERE project_id = p.id AND deleted_at IS NULL),
'milestone_count', (SELECT count(*) FROM onto*milestones WHERE project_id = p.id AND deleted_at IS NULL),
'risk_count', (SELECT count(*) FROM onto*risks WHERE project_id = p.id AND deleted_at IS NULL),
'decision_count', (SELECT count(*) FROM onto*decisions WHERE project_id = p.id AND deleted_at IS NULL)
)
FROM onto_projects p
WHERE p.id = p_project_id
AND p.deleted_at IS NULL
AND current_actor_has_project_access(p.id, 'read');
$function$
"
},
{
"args": "p_project_id uuid, p_user_id uuid",
"name": "get_project_statistics",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.get_project_statistics(p_project_id uuid, p_user_id uuid)
RETURNS json
LANGUAGE plpgsql
STABLE SECURITY DEFINER
AS $function$
DECLARE
v_result JSON;
v_project_user_id UUID;
BEGIN
-- Verify project ownership
SELECT user_id INTO v_project_user_id
FROM projects
WHERE id = p_project_id;

IF v_project_user_id IS NULL OR v_project_user_id != p_user_id THEN
RETURN json_build_object('error', 'Unauthorized');
END IF;

-- Calculate all statistics in a single query
SELECT json*build_object(
'stats', json_build_object(
'total', (
SELECT COUNT(*)
FROM tasks
WHERE project*id = p_project_id
AND user_id = p_user_id
AND deleted_at IS NULL
),
'completed', (
SELECT COUNT(*)
FROM tasks
WHERE project*id = p_project_id
AND user_id = p_user_id
AND deleted_at IS NULL
AND status = 'done'
),
'active', (
SELECT COUNT(*)
FROM tasks
WHERE project*id = p_project_id
AND user_id = p_user_id
AND deleted_at IS NULL
AND status != 'done'
),
'inProgress', (
SELECT COUNT(*)
FROM tasks
WHERE project*id = p_project_id
AND user_id = p_user_id
AND deleted_at IS NULL
AND status = 'in_progress'
),
'blocked', (
SELECT COUNT(*)
FROM tasks
WHERE project*id = p_project_id
AND user_id = p_user_id
AND deleted_at IS NULL
AND status = 'blocked'
),
'deleted', (
SELECT COUNT(*)
FROM tasks
WHERE project*id = p_project_id
AND user_id = p_user_id
AND deleted_at IS NOT NULL
),
'scheduled', (
SELECT COUNT(DISTINCT t.id)
FROM tasks t
INNER JOIN task_calendar_events tce ON t.id = tce.task_id
WHERE t.project_id = p_project_id
AND t.user_id = p_user_id
AND t.deleted_at IS NULL
AND t.status != 'done'
AND tce.sync_status IN ('synced', 'pending')
),
'hasPhases', (
SELECT COUNT(*) > 0
FROM phases
WHERE project*id = p_project_id
),
'completionRate', (
SELECT CASE
WHEN COUNT(\*) = 0 THEN 0
ELSE ROUND((COUNT(*) FILTER (WHERE status = 'done') _ 100.0) / COUNT(_))
END
FROM tasks
WHERE project*id = p_project_id
AND user_id = p_user_id
AND deleted_at IS NULL
),
'byPriority', (
SELECT json_object_agg(
COALESCE(priority: :text, 'none'),
count
)
FROM (
SELECT priority, COUNT(*) as count
FROM tasks
WHERE project*id = p_project_id
AND user_id = p_user_id
AND deleted_at IS NULL
AND status != 'done'
GROUP BY priority
) priority_counts
),
'byStatus', (
SELECT json_object_agg(
status,
count
)
FROM (
SELECT status, COUNT(*) as count
FROM tasks
WHERE project*id = p_project_id
AND user_id = p_user_id
AND deleted_at IS NULL
GROUP BY status
) status_counts
),
'byType', (
SELECT json_object_agg(
COALESCE(task_type, 'one_off'),
count
)
FROM (
SELECT task_type, COUNT(*) as count
FROM tasks
WHERE project*id = p_project_id
AND user_id = p_user_id
AND deleted_at IS NULL
GROUP BY task_type
) type_counts
),
'phasesCount', (
SELECT COUNT(*)
FROM phases
WHERE project\*id = p_project_id
),
'averageTasksPerPhase', (
SELECT CASE
WHEN COUNT(DISTINCT p.id) = 0 THEN 0
ELSE ROUND(COUNT(pt.task_id): :numeric / COUNT(DISTINCT p.id), 1)
END
FROM phases p
LEFT JOIN phase_tasks pt ON p.id = pt.phase_id
WHERE p.project_id = p_project_id
)
),
'metadata', json_build_object(
'project_id', p_project_id,
'calculated_at', NOW(),
'user_id', p_user_id
)
) INTO v_result;

RETURN v_result;
END;
$function$
"
},
{
"args": "p_user_id uuid, p_status text, p_search text, p_limit integer, p_offset integer",
"name": "get_projects_with_stats",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.get_projects_with_stats(p_user_id uuid, p_status text DEFAULT 'all'::text, p_search text DEFAULT ''::text, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0)
RETURNS json
LANGUAGE plpgsql
STABLE SECURITY DEFINER
AS $function$
DECLARE
v_result JSON;
v_total_count INTEGER;
BEGIN
-- Get total count for pagination
SELECT COUNT(*)
INTO v*total_count
FROM projects p
WHERE p.user_id = p_user_id
AND (p_status = 'all' OR p.status: :text = p_status)
AND (
p_search = '' OR
p.name ILIKE '%' || p_search || '%' OR
p.description ILIKE '%' || p_search || '%'
);

-- Build the complete result with projects and stats
SELECT json*build_object(
'projects', COALESCE(
(SELECT json_agg(project_data)
FROM (
SELECT json_build_object(
'id', p.id,
'user_id', p.user_id,
'name', p.name,
'slug', p.slug,
'description', p.description,
'status', p.status,
'calendar_color_id', p.calendar_color_id,
'start_date', p.start_date,
'end_date', p.end_date,
'created_at', p.created_at,
'updated_at', p.updated_at,
'taskStats', json_build_object(
'total', (
SELECT COUNT(*)
FROM tasks t
WHERE t.project*id = p.id
AND t.deleted_at IS NULL
),
'active', (
SELECT COUNT(*)
FROM tasks t
WHERE t.project*id = p.id
AND t.deleted_at IS NULL
AND t.status IN ('backlog', 'in_progress')
),
'completed', (
SELECT COUNT(*)
FROM tasks t
WHERE t.project*id = p.id
AND t.deleted_at IS NULL
AND t.status = 'done'
),
'blocked', (
SELECT COUNT(*)
FROM tasks t
WHERE t.project*id = p.id
AND t.deleted_at IS NULL
AND t.status = 'blocked'
),
'overdue', (
SELECT COUNT(*)
FROM tasks t
WHERE t.project*id = p.id
AND t.deleted_at IS NULL
AND t.status != 'done'
AND t.start_date < CURRENT_DATE
),
'completionRate', (
SELECT CASE
WHEN COUNT(\*) = 0 THEN 0
ELSE ROUND((COUNT(*) FILTER (WHERE status = 'done') _ 100.0) / COUNT(_))
END
FROM tasks t
WHERE t.project*id = p.id
AND t.deleted_at IS NULL
),
'highPriorityCount', (
SELECT COUNT(*)
FROM tasks t
WHERE t.project*id = p.id
AND t.deleted_at IS NULL
AND t.status != 'done'
AND t.priority = 'high'
),
'recentlyUpdated', (
SELECT COUNT(*)
FROM tasks t
WHERE t.project*id = p.id
AND t.deleted_at IS NULL
AND t.updated_at > NOW() - INTERVAL '7 days'
)
),
'phaseInfo', json_build_object(
'count', (
SELECT COUNT(*)
FROM phases ph
WHERE ph.project\*id = p.id
),
'activePhase', (
SELECT json_build_object(
'id', ph.id,
'name', ph.name,
'start_date', ph.start_date,
'end_date', ph.end_date
)
FROM phases ph
WHERE ph.project_id = p.id
AND ph.start_date <= CURRENT_DATE
AND ph.end_date >= CURRENT_DATE
ORDER BY ph.order ASC
LIMIT 1
)
),
'lastActivity', (
SELECT MAX(activity_date)
FROM (
SELECT MAX(t.updated_at) as activity_date
FROM tasks t
WHERE t.project_id = p.id
UNION ALL
SELECT MAX(ph.updated_at) as activity_date
FROM phases ph
WHERE ph.project_id = p.id
UNION ALL
SELECT p.updated_at as activity_date
) activities
),
'sortOrder', CASE p.status: :text
WHEN 'active' THEN 0
WHEN 'paused' THEN 1
WHEN 'completed' THEN 2
ELSE 3
END
) AS project_data
FROM projects p
WHERE p.user_id = p_user_id
AND (p_status = 'all' OR p.status: :text = p_status)
AND (
p_search = '' OR
p.name ILIKE '%' || p_search || '%' OR
p.description ILIKE '%' || p_search || '%'
)
ORDER BY
CASE p.status: :text
WHEN 'active' THEN 0
WHEN 'paused' THEN 1
WHEN 'completed' THEN 2
ELSE 3
END,
p.created_at DESC
LIMIT p_limit
OFFSET p_offset
) AS projects_subquery
), '[]': :json
),
'pagination', json_build_object(
'total', v_total_count,
'limit', p_limit,
'offset', p_offset,
'totalPages', CEIL(v_total_count: :numeric / p_limit)
),
'metadata', json_build_object(
'fetched_at', NOW(),
'user_id', p_user_id,
'filters', json_build_object(
'status', p_status,
'search', p_search
)
)
) INTO v_result;

RETURN v_result;
END;
$function$
"
},
{
"args": "",
"name": "get_revenue_metrics",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.get_revenue_metrics()
RETURNS TABLE(current_mrr numeric, previous_mrr numeric, mrr_growth numeric, total_revenue numeric, average_revenue_per_user numeric, churn_rate numeric, lifetime_value numeric)
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$\r
DECLARE\r
v_current_mrr NUMERIC;\r
v_previous_mrr NUMERIC;\r
v_total_users BIGINT;\r
v_churned_users BIGINT;\r
BEGIN\r
-- Calculate current MRR\r
SELECT COALESCE(SUM(\r
sp.price_cents / 100.0 / \r
CASE sp.billing_interval\r
WHEN 'month' THEN 1\r
WHEN 'year' THEN 12\r
ELSE 1\r
END\r
), 0) INTO v_current_mrr\r
FROM customer_subscriptions cs\r
JOIN subscription_plans sp ON cs.plan_id = sp.id\r
WHERE cs.status = 'active';\r
\r
-- Calculate previous month MRR\r
SELECT COALESCE(SUM(\r
sp.price_cents / 100.0 / \r
CASE sp.billing_interval\r
WHEN 'month' THEN 1\r
WHEN 'year' THEN 12\r
ELSE 1\r
END\r
), 0) INTO v_previous_mrr\r
FROM customer_subscriptions cs\r
JOIN subscription_plans sp ON cs.plan_id = sp.id\r
WHERE cs.status = 'active' \r
AND cs.created_at < date_trunc('month', CURRENT_DATE);\r
\r
-- Calculate total revenue\r
SELECT COALESCE(SUM(amount_paid / 100.0),
0)\r
FROM invoices\r
WHERE status = 'paid'\r
INTO total_revenue;\r
\r
-- Calculate active users\r
SELECT COUNT(DISTINCT user_id) INTO v_total_users\r
FROM customer_subscriptions\r
WHERE status = 'active';\r
\r
-- Calculate churned users in last 30 days\r
SELECT COUNT(DISTINCT user_id) INTO v_churned_users\r
FROM customer_subscriptions\r
WHERE status = 'canceled'\r
AND canceled_at >= CURRENT_DATE - INTERVAL '30 days';\r
\r
RETURN QUERY\r
SELECT\r
v_current_mrr AS current_mrr,\r
v_previous_mrr AS previous_mrr,\r
CASE \r
WHEN v_previous_mrr > 0 THEN \r
((v_current_mrr - v_previous_mrr) / v_previous_mrr * 100)\r
ELSE 0 \r
END AS mrr*growth,\r
total_revenue,\r
CASE \r
WHEN v_total_users > 0 THEN v_current_mrr / v_total_users\r
ELSE 0\r
END AS average_revenue_per_user,\r
CASE \r
WHEN v_total_users > 0 THEN (v_churned_users: :NUMERIC / v_total_users * 100)\r
ELSE 0\r
END AS churn*rate,\r
CASE \r
WHEN v_total_users > 0 AND v_churned_users > 0 THEN\r
(v_current_mrr / v_total_users) / (v_churned_users: :NUMERIC / v_total_users / 30)\r
ELSE 0\r
END AS lifetime_value;\r
END;\r
$function$
"
},
{
"args": "p_user_id uuid, p_start_date timestamp with time zone, p_end_date timestamp with time zone, p_status text",
"name": "get_scheduled_sms_for_user",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.get_scheduled_sms_for_user(p_user_id uuid, p_start_date timestamp with time zone DEFAULT now(), p_end_date timestamp with time zone DEFAULT NULL::timestamp with time zone, p_status text DEFAULT NULL::text)
RETURNS TABLE(id uuid, message_content text, message_type text, calendar_event_id text, event_title text, event_start timestamp with time zone, scheduled_for timestamp with time zone, status text, generated_via text, created_at timestamp with time zone)
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
RETURN QUERY
SELECT
ssm.id,
ssm.message_content,
ssm.message_type,
ssm.calendar_event_id,
ssm.event_title,
ssm.event_start,
ssm.scheduled_for,
ssm.status,
ssm.generated_via,
ssm.created_at
FROM scheduled_sms_messages ssm
WHERE
ssm.user_id = p_user_id
AND ssm.scheduled_for >= p_start_date
AND (p_end_date IS NULL OR ssm.scheduled_for <= p_end_date)
AND (p_status IS NULL OR ssm.status = p_status)
ORDER BY ssm.scheduled_for ASC;
END;
$function$
"
},
{
"args": "p_start_date date, p_end_date date",
"name": "get_sms_daily_metrics",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.get_sms_daily_metrics(p_start_date date, p_end_date date)
RETURNS TABLE(metric_date date, scheduled_count integer, sent_count integer, delivered_count integer, failed_count integer, cancelled_count integer, avg_delivery_time_ms numeric, avg_generation_time_ms numeric, llm_success_count integer, template_fallback_count integer, delivery_success_rate numeric, llm_success_rate numeric, llm_cost_usd numeric, sms_cost_usd numeric, opt_out_count integer, quiet_hours_skip_count integer, daily_limit_hit_count integer, delivery_rate_percent numeric, llm_success_rate_percent numeric, active_users integer)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
RETURN QUERY
SELECT
m.metric_date,
m.scheduled_count,
m.sent_count,
m.delivered_count,
m.failed_count,
m.cancelled_count,
m.avg_delivery_time_ms,
m.avg_generation_time_ms,
m.llm_success_count,
m.template_fallback_count,
m.delivery_success_rate,
m.llm_success_rate,
m.llm_cost_usd,
m.sms_cost_usd,
m.opt_out_count,
m.quiet_hours_skip_count,
m.daily_limit_hit_count,
m.delivery_rate_percent,
m.llm_success_rate_percent,
m.active_users
FROM sms_metrics_daily m
WHERE m.metric_date >= p_start_date
AND m.metric_date <= p_end_date
ORDER BY m.metric_date DESC;
END;
$function$
"
},
{
"args": "",
"name": "get_sms_notification_stats",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.get_sms_notification_stats()
RETURNS TABLE(total_users_with_phone bigint, users_phone_verified bigint, users_sms_enabled bigint, users_opted_out bigint, phone_verification_rate numeric, sms_adoption_rate numeric, opt_out_rate numeric, total_sms_sent_24h bigint, sms_delivery_rate_24h numeric, avg_sms_delivery_time_seconds numeric)
LANGUAGE plpgsql
STABLE
AS $function$
BEGIN
RETURN QUERY
WITH sms_prefs AS (
SELECT
COUNT(*) FILTER (WHERE phone*number IS NOT NULL) AS with_phone,
COUNT(*) FILTER (WHERE phone*verified = true) AS verified,
COUNT(*) FILTER (WHERE phone*verified = true) AS enabled, -- Assuming verified = enabled
COUNT(*) FILTER (WHERE opted*out = true) AS opted_out
FROM user_sms_preferences
),
sms_24h AS (
SELECT
COUNT(*) AS sent*count,
COUNT(*) FILTER (WHERE status = 'delivered') AS delivered*count,
-- FIXED: Added explicit NULL filter for delivered_at
AVG(EXTRACT(EPOCH FROM (delivered_at - created_at))) FILTER (WHERE delivered_at IS NOT NULL AND status = 'delivered') AS avg_delivery_seconds
FROM notification_deliveries
WHERE channel = 'sms'
AND created_at >= NOW() - INTERVAL '24 hours'
)
SELECT
(SELECT with_phone FROM sms_prefs),
(SELECT verified FROM sms_prefs),
(SELECT enabled FROM sms_prefs),
(SELECT opted_out FROM sms_prefs),
ROUND(
(SELECT verified FROM sms_prefs): :NUMERIC / NULLIF((SELECT with_phone FROM sms_prefs): :NUMERIC, 0) * 100,
2
),
ROUND(
(SELECT enabled FROM sms*prefs): :NUMERIC / NULLIF((SELECT verified FROM sms_prefs): :NUMERIC, 0) * 100,
2
),
ROUND(
(SELECT opted*out FROM sms_prefs): :NUMERIC / NULLIF((SELECT verified FROM sms_prefs): :NUMERIC, 0) * 100,
2
),
(SELECT sent*count FROM sms_24h),
ROUND(
(SELECT delivered_count FROM sms_24h): :NUMERIC / NULLIF((SELECT sent_count FROM sms_24h): :NUMERIC, 0) * 100,
2
),
(SELECT avg*delivery_seconds FROM sms_24h): :NUMERIC;
END;
$function$
"
},
{
"args": "",
"name": "get_subscription_overview",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.get_subscription_overview()
RETURNS TABLE(total_subscribers bigint, active_subscriptions bigint, trial_subscriptions bigint, canceled_subscriptions bigint, paused_subscriptions bigint, mrr numeric, arr numeric)
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$\r
BEGIN\r
RETURN QUERY\r
SELECT\r
COUNT(DISTINCT user_id) AS total_subscribers,\r
COUNT(*) FILTER (WHERE status = 'active') AS active*subscriptions,\r
COUNT(*) FILTER (WHERE status = 'trialing') AS trial*subscriptions,\r
COUNT(*) FILTER (WHERE status = 'canceled') AS canceled*subscriptions,\r
COUNT(*) FILTER (WHERE status = 'paused') AS paused*subscriptions,\r
COALESCE(SUM(\r
CASE \r
WHEN status = 'active' THEN \r
sp.price_cents / 100.0 / \r
CASE sp.billing_interval\r
WHEN 'month' THEN 1\r
WHEN 'year' THEN 12\r
ELSE 1\r
END\r
ELSE 0\r
END\r
), 0) AS mrr,\r
COALESCE(SUM(\r
CASE \r
WHEN status = 'active' THEN \r
sp.price_cents / 100.0 / \r
CASE sp.billing_interval\r
WHEN 'month' THEN 1\r
WHEN 'year' THEN 12\r
ELSE 1\r
END\r
ELSE 0\r
END\r
) * 12, 0) AS arr\r
FROM customer*subscriptions cs\r
LEFT JOIN subscription_plans sp ON cs.plan_id = sp.id;\r
END;\r
$function$
"
},
{
"args": "",
"name": "get_user_engagement_metrics",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.get_user_engagement_metrics()
RETURNS TABLE(total_users bigint, active_users_7d bigint, active_users_30d bigint, total_briefs bigint, avg_brief_length numeric, top_active_users json)
LANGUAGE sql
STABLE
AS $function$
WITH activity AS (
SELECT changed_by AS user_id, created_at
FROM onto_project_logs
WHERE created_at >= CURRENT_DATE - INTERVAL '30 days'
UNION ALL
SELECT user_id, created_at
FROM ontology_daily_briefs
WHERE generation_status = 'completed'
AND created_at >= CURRENT_DATE - INTERVAL '30 days'
UNION ALL
SELECT user_id, created_at
FROM onto_braindumps
WHERE created_at >= CURRENT_DATE - INTERVAL '30 days'
UNION ALL
SELECT user_id, created_at
FROM agent_chat_sessions
WHERE created_at >= CURRENT_DATE - INTERVAL '30 days'
),
top_users AS (
SELECT
u.email,
COUNT(db.id) AS brief_count,
MAX(db.created_at) AS last_brief
FROM users u
LEFT JOIN ontology_daily_briefs db
ON u.id = db.user_id
AND db.generation_status = 'completed'
AND db.created_at >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY u.id, u.email
ORDER BY brief_count DESC
LIMIT 10
)
SELECT
(SELECT COUNT(*) FROM users) AS total*users,
(SELECT COUNT(DISTINCT user_id) FROM activity
WHERE created_at >= CURRENT_DATE - INTERVAL '7 days') AS active_users_7d,
(SELECT COUNT(DISTINCT user_id) FROM activity
WHERE created_at >= CURRENT_DATE - INTERVAL '30 days') AS active_users_30d,
(SELECT COUNT(*) FROM ontology*daily_briefs
WHERE generation_status = 'completed') AS total_briefs,
(SELECT ROUND(AVG(LENGTH(COALESCE(executive_summary, '')))): :numeric
FROM ontology_daily_briefs
WHERE generation_status = 'completed') AS avg_brief_length,
(SELECT json_agg(row_to_json(t)) FROM top_users t) AS top_active_users;
$function$
"
},
{
"args": "p_user_id uuid, p_start_date timestamp with time zone, p_end_date timestamp with time zone",
"name": "get_user_llm_usage",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.get_user_llm_usage(p_user_id uuid, p_start_date timestamp with time zone, p_end_date timestamp with time zone)
RETURNS TABLE(total_requests bigint, total_cost numeric, total_tokens bigint, avg_response_time numeric, by_operation jsonb, by_model jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$\r
DECLARE\r
v_total_requests BIGINT;\r
v_total_cost NUMERIC;\r
v_total_tokens BIGINT;\r
v_avg_response_time NUMERIC;\r
v_by_operation JSONB;\r
v_by_model JSONB;\r
BEGIN\r
-- Get overall stats\r
SELECT\r
COUNT(*): :BIGINT,\r
COALESCE(SUM(l.total*cost_usd),
0): :NUMERIC,\r
COALESCE(SUM(l.total_tokens),
0): :BIGINT,\r
COALESCE(AVG(l.response_time_ms),
0): :NUMERIC\r
INTO v_total_requests, v_total_cost, v_total_tokens, v_avg_response_time\r
FROM llm_usage_logs l\r
WHERE l.user_id = p_user_id\r
AND l.created_at BETWEEN p_start_date AND p_end_date;\r
\r
-- Get breakdown by operation\r
SELECT COALESCE(\r
jsonb_object_agg(\r
operation_type: :text,\r
jsonb_build_object(\r
'requests', requests,\r
'cost', cost,\r
'tokens', tokens\r
)\r
),\r
'{}': :jsonb\r
)\r
INTO v_by_operation\r
FROM (\r
SELECT\r
l.operation_type,\r
COUNT(*) as requests,\r
SUM(l.total*cost_usd) as cost,\r
SUM(l.total_tokens) as tokens\r
FROM llm_usage_logs l\r
WHERE l.user_id = p_user_id\r
AND l.created_at BETWEEN p_start_date AND p_end_date\r
GROUP BY l.operation_type\r
) op_stats;\r
\r
-- Get breakdown by model\r
SELECT COALESCE(\r
jsonb_object_agg(\r
model_used,\r
jsonb_build_object(\r
'requests', requests,\r
'cost', cost,\r
'tokens', tokens\r
)\r
),\r
'{}': :jsonb\r
)\r
INTO v_by_model\r
FROM (\r
SELECT\r
l.model_used,\r
COUNT(*) as requests,\r
SUM(l.total*cost_usd) as cost,\r
SUM(l.total_tokens) as tokens\r
FROM llm_usage_logs l\r
WHERE l.user_id = p_user_id\r
AND l.created_at BETWEEN p_start_date AND p_end_date\r
GROUP BY l.model_used\r
) model_stats;\r
\r
-- Return single row with all computed values\r
RETURN QUERY\r
SELECT\r
v_total_requests,\r
v_total_cost,\r
v_total_tokens,\r
v_avg_response_time,\r
v_by_operation,\r
v_by_model;\r
END;\r
$function$
"
},
{
"args": "p_user_id uuid, p_days integer",
"name": "get_user_sms_metrics",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.get_user_sms_metrics(p_user_id uuid, p_days integer DEFAULT 30)
RETURNS TABLE(metric_date date, scheduled_count integer, sent_count integer, delivered_count integer, failed_count integer, llm_cost_usd numeric, delivery_rate numeric)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
RETURN QUERY
SELECT
m.metric_date,
COALESCE(SUM(CASE WHEN m.metric_type = 'scheduled_count' THEN m.metric_value ELSE 0 END),
0): :INTEGER as scheduled_count,
COALESCE(SUM(CASE WHEN m.metric_type = 'sent_count' THEN m.metric_value ELSE 0 END),
0): :INTEGER as sent_count,
COALESCE(SUM(CASE WHEN m.metric_type = 'delivered_count' THEN m.metric_value ELSE 0 END),
0): :INTEGER as delivered_count,
COALESCE(SUM(CASE WHEN m.metric_type = 'failed_count' THEN m.metric_value ELSE 0 END),
0): :INTEGER as failed_count,
COALESCE(SUM(CASE WHEN m.metric_type = 'llm_cost_usd' THEN m.metric_value ELSE 0 END),
0): :NUMERIC(10, 6) as llm_cost_usd,
CASE
WHEN SUM(CASE WHEN m.metric_type = 'sent_count' THEN m.metric_value ELSE 0 END) > 0
THEN (SUM(CASE WHEN m.metric_type = 'delivered_count' THEN m.metric_value ELSE 0 END): :NUMERIC /
SUM(CASE WHEN m.metric_type = 'sent_count' THEN m.metric_value ELSE 0 END) * 100)
ELSE 0
END: :NUMERIC(5, 2) as delivery*rate
FROM sms_metrics m
WHERE m.user_id = p_user_id
AND m.metric_hour IS NULL -- Only daily metrics
AND m.metric_date >= CURRENT_DATE - (p_days || ' days'): :INTERVAL
GROUP BY m.metric_date
ORDER BY m.metric_date DESC;
END;
$function$
"
},
{
"args": "user_uuid uuid",
"name": "get_user_subscription_status",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.get_user_subscription_status(user_uuid uuid)
RETURNS TABLE(has_subscription boolean, subscription_status text, current_period_end timestamp with time zone, is_beta_user boolean)
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$\r
BEGIN\r
RETURN QUERY\r
SELECT \r
COALESCE(cs.status IN ('active', 'trialing'), false) as has_subscription,\r
COALESCE(cs.status, 'free') as subscription_status,\r
cs.current_period_end,\r
EXISTS (\r
SELECT 1 FROM user_discounts ud\r
JOIN discount_codes dc ON ud.discount_code_id = dc.id\r
WHERE ud.user_id = user_uuid\r
AND dc.metadata->>'type' = 'beta_user'\r
) as is_beta_user\r
FROM users u\r
LEFT JOIN customer_subscriptions cs ON u.id = cs.user_id\r
AND cs.status IN ('active', 'trialing', 'past_due')\r
WHERE u.id = user_uuid\r
ORDER BY cs.created_at DESC\r
LIMIT 1;\r
END;\r
$function$
"
},
{
"args": "p_user_id uuid",
"name": "get_user_trial_status",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.get_user_trial_status(p_user_id uuid)
RETURNS TABLE(is_in_trial boolean, is_trial_expired boolean, is_in_grace_period boolean, days_until_trial_end integer, trial_end_date timestamp with time zone, has_active_subscription boolean, is_read_only boolean)
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$\r
DECLARE\r
v_user RECORD;\r
v_grace_period_days INTEGER := 7;\r
BEGIN\r
-- Get user data\r
SELECT \r
u.trial_ends_at,\r
u.subscription_status,\r
EXISTS(\r
SELECT 1 FROM customer_subscriptions cs\r
WHERE cs.user_id = u.id\r
AND cs.status = 'active'\r
) as has_active_sub\r
INTO v_user\r
FROM users u\r
WHERE u.id = p_user_id;\r
\r
-- Calculate trial status\r
RETURN QUERY\r
SELECT\r
-- Is in trial\r
CASE \r
WHEN v_user.trial_ends_at IS NULL THEN FALSE\r
WHEN v_user.has_active_sub THEN FALSE\r
WHEN v_user.trial_ends_at > NOW() THEN TRUE\r
ELSE FALSE\r
END as is_in_trial,\r
\r
-- Is trial expired (past grace period)\r
CASE\r
WHEN v_user.trial_ends_at IS NULL THEN FALSE\r
WHEN v_user.has_active_sub THEN FALSE\r
WHEN v_user.trial_ends_at + (v_grace_period_days || ' days'): :INTERVAL < NOW() THEN TRUE\r
ELSE FALSE\r
END as is_trial_expired,\r
\r
-- Is in grace period\r
CASE\r
WHEN v_user.trial_ends_at IS NULL THEN FALSE\r
WHEN v_user.has_active_sub THEN FALSE\r
WHEN v_user.trial_ends_at < NOW() \r
AND v_user.trial_ends_at + (v_grace_period_days || ' days'): :INTERVAL >= NOW() THEN TRUE\r
ELSE FALSE\r
END as is_in_grace_period,\r
\r
-- Days until trial end\r
CASE\r
WHEN v_user.trial_ends_at IS NULL THEN 0\r
WHEN v_user.has_active_sub THEN 0\r
ELSE GREATEST(0, EXTRACT(DAY FROM v_user.trial_ends_at - NOW()): :INTEGER)\r
END as days_until_trial_end,\r
\r
-- Trial end date\r
v_user.trial_ends_at,\r
\r
-- Has active subscription\r
v_user.has_active_sub,\r
\r
-- Is read only (trial expired or in grace period without subscription)\r
CASE\r
WHEN v_user.has_active_sub THEN FALSE\r
WHEN v_user.trial_ends_at IS NULL THEN FALSE\r
WHEN v_user.trial_ends_at < NOW() THEN TRUE\r
ELSE FALSE\r
END as is_read_only;\r
END;\r
$function$
"
},
{
"args": "",
"name": "get_visitor_overview",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.get_visitor_overview()
RETURNS TABLE(total_visitors bigint, visitors_7d bigint, visitors_30d bigint, unique_visitors_today bigint)
LANGUAGE plpgsql
AS $function$\r
BEGIN\r
RETURN QUERY\r
SELECT \r
(SELECT COUNT(DISTINCT visitor_id) FROM visitors) as total_visitors,\r
(SELECT COUNT(DISTINCT visitor_id) FROM visitors \r
WHERE created_at >= NOW() - INTERVAL '7 days') as visitors_7d,\r
(SELECT COUNT(DISTINCT visitor_id) FROM visitors \r
WHERE created_at >= NOW() - INTERVAL '30 days') as visitors_30d,\r
(SELECT COUNT(DISTINCT visitor_id) FROM visitors \r
WHERE DATE(created_at AT TIME ZONE 'UTC') = CURRENT_DATE) as unique_visitors_today;\r
END;\r
$function$
"
},
{
"args": "internal, smallint, anyelement, integer, internal, internal",
"name": "gin_btree_consistent",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.gin_btree_consistent(internal, smallint, anyelement, integer, internal, internal)
RETURNS boolean
LANGUAGE c
IMMUTABLE STRICT
AS '$libdir/btree_gin', $function$gin_btree_consistent$function$
"
},
{
"args": "anyenum, anyenum, smallint, internal",
"name": "gin_compare_prefix_anyenum",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.gin_compare_prefix_anyenum(anyenum, anyenum, smallint, internal)
RETURNS integer
LANGUAGE c
IMMUTABLE STRICT
AS '$libdir/btree_gin', $function$gin_compare_prefix_anyenum$function$
"
},
{
"args": "bit, bit, smallint, internal",
"name": "gin_compare_prefix_bit",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.gin_compare_prefix_bit(bit, bit, smallint, internal)
RETURNS integer
LANGUAGE c
IMMUTABLE STRICT
AS '$libdir/btree_gin', $function$gin_compare_prefix_bit$function$
"
},
{
"args": "boolean, boolean, smallint, internal",
"name": "gin_compare_prefix_bool",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.gin_compare_prefix_bool(boolean, boolean, smallint, internal)
RETURNS integer
LANGUAGE c
IMMUTABLE STRICT
AS '$libdir/btree_gin', $function$gin_compare_prefix_bool$function$
"
},
{
"args": "character, character, smallint, internal",
"name": "gin_compare_prefix_bpchar",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.gin_compare_prefix_bpchar(character, character, smallint, internal)
RETURNS integer
LANGUAGE c
IMMUTABLE STRICT
AS '$libdir/btree_gin', $function$gin_compare_prefix_bpchar$function$
"
},
{
"args": "bytea, bytea, smallint, internal",
"name": "gin_compare_prefix_bytea",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.gin_compare_prefix_bytea(bytea, bytea, smallint, internal)
RETURNS integer
LANGUAGE c
IMMUTABLE STRICT
AS '$libdir/btree_gin', $function$gin_compare_prefix_bytea$function$
"
},
{
"args": "\"char\", \"char\", smallint, internal",
"name": "gin_compare_prefix_char",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.gin_compare_prefix_char(\"char\", \"char\", smallint, internal)
RETURNS integer
LANGUAGE c
IMMUTABLE STRICT
AS '$libdir/btree_gin', $function$gin_compare_prefix_char$function$
"
},
{
"args": "cidr, cidr, smallint, internal",
"name": "gin_compare_prefix_cidr",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.gin_compare_prefix_cidr(cidr, cidr, smallint, internal)
RETURNS integer
LANGUAGE c
IMMUTABLE STRICT
AS '$libdir/btree_gin', $function$gin_compare_prefix_cidr$function$
"
},
{
"args": "date, date, smallint, internal",
"name": "gin_compare_prefix_date",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.gin_compare_prefix_date(date, date, smallint, internal)
RETURNS integer
LANGUAGE c
IMMUTABLE STRICT
AS '$libdir/btree_gin', $function$gin_compare_prefix_date$function$
"
},
{
"args": "real, real, smallint, internal",
"name": "gin_compare_prefix_float4",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.gin_compare_prefix_float4(real, real, smallint, internal)
RETURNS integer
LANGUAGE c
IMMUTABLE STRICT
AS '$libdir/btree_gin', $function$gin_compare_prefix_float4$function$
"
},
{
"args": "double precision, double precision, smallint, internal",
"name": "gin_compare_prefix_float8",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.gin_compare_prefix_float8(double precision, double precision, smallint, internal)
RETURNS integer
LANGUAGE c
IMMUTABLE STRICT
AS '$libdir/btree_gin', $function$gin_compare_prefix_float8$function$
"
},
{
"args": "inet, inet, smallint, internal",
"name": "gin_compare_prefix_inet",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.gin_compare_prefix_inet(inet, inet, smallint, internal)
RETURNS integer
LANGUAGE c
IMMUTABLE STRICT
AS '$libdir/btree_gin', $function$gin_compare_prefix_inet$function$
"
},
{
"args": "smallint, smallint, smallint, internal",
"name": "gin_compare_prefix_int2",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.gin_compare_prefix_int2(smallint, smallint, smallint, internal)
RETURNS integer
LANGUAGE c
IMMUTABLE STRICT
AS '$libdir/btree_gin', $function$gin_compare_prefix_int2$function$
"
},
{
"args": "integer, integer, smallint, internal",
"name": "gin_compare_prefix_int4",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.gin_compare_prefix_int4(integer, integer, smallint, internal)
RETURNS integer
LANGUAGE c
IMMUTABLE STRICT
AS '$libdir/btree_gin', $function$gin_compare_prefix_int4$function$
"
},
{
"args": "bigint, bigint, smallint, internal",
"name": "gin_compare_prefix_int8",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.gin_compare_prefix_int8(bigint, bigint, smallint, internal)
RETURNS integer
LANGUAGE c
IMMUTABLE STRICT
AS '$libdir/btree_gin', $function$gin_compare_prefix_int8$function$
"
},
{
"args": "interval, interval, smallint, internal",
"name": "gin_compare_prefix_interval",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.gin_compare_prefix_interval(interval, interval, smallint, internal)
RETURNS integer
LANGUAGE c
IMMUTABLE STRICT
AS '$libdir/btree_gin', $function$gin_compare_prefix_interval$function$
"
},
{
"args": "macaddr, macaddr, smallint, internal",
"name": "gin_compare_prefix_macaddr",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.gin_compare_prefix_macaddr(macaddr, macaddr, smallint, internal)
RETURNS integer
LANGUAGE c
IMMUTABLE STRICT
AS '$libdir/btree_gin', $function$gin_compare_prefix_macaddr$function$
"
},
{
"args": "macaddr8, macaddr8, smallint, internal",
"name": "gin_compare_prefix_macaddr8",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.gin_compare_prefix_macaddr8(macaddr8, macaddr8, smallint, internal)
RETURNS integer
LANGUAGE c
IMMUTABLE STRICT
AS '$libdir/btree_gin', $function$gin_compare_prefix_macaddr8$function$
"
},
{
"args": "money, money, smallint, internal",
"name": "gin_compare_prefix_money",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.gin_compare_prefix_money(money, money, smallint, internal)
RETURNS integer
LANGUAGE c
IMMUTABLE STRICT
AS '$libdir/btree_gin', $function$gin_compare_prefix_money$function$
"
},
{
"args": "name, name, smallint, internal",
"name": "gin_compare_prefix_name",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.gin_compare_prefix_name(name, name, smallint, internal)
RETURNS integer
LANGUAGE c
IMMUTABLE STRICT
AS '$libdir/btree_gin', $function$gin_compare_prefix_name$function$
"
},
{
"args": "numeric, numeric, smallint, internal",
"name": "gin_compare_prefix_numeric",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.gin_compare_prefix_numeric(numeric, numeric, smallint, internal)
RETURNS integer
LANGUAGE c
IMMUTABLE STRICT
AS '$libdir/btree_gin', $function$gin_compare_prefix_numeric$function$
"
},
{
"args": "oid, oid, smallint, internal",
"name": "gin_compare_prefix_oid",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.gin_compare_prefix_oid(oid, oid, smallint, internal)
RETURNS integer
LANGUAGE c
IMMUTABLE STRICT
AS '$libdir/btree_gin', $function$gin_compare_prefix_oid$function$
"
},
{
"args": "text, text, smallint, internal",
"name": "gin_compare_prefix_text",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.gin_compare_prefix_text(text, text, smallint, internal)
RETURNS integer
LANGUAGE c
IMMUTABLE STRICT
AS '$libdir/btree_gin', $function$gin_compare_prefix_text$function$
"
},
{
"args": "time without time zone, time without time zone, smallint, internal",
"name": "gin_compare_prefix_time",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.gin_compare_prefix_time(time without time zone, time without time zone, smallint, internal)
RETURNS integer
LANGUAGE c
IMMUTABLE STRICT
AS '$libdir/btree_gin', $function$gin_compare_prefix_time$function$
"
},
{
"args": "timestamp without time zone, timestamp without time zone, smallint, internal",
"name": "gin_compare_prefix_timestamp",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.gin_compare_prefix_timestamp(timestamp without time zone, timestamp without time zone, smallint, internal)
RETURNS integer
LANGUAGE c
IMMUTABLE STRICT
AS '$libdir/btree_gin', $function$gin_compare_prefix_timestamp$function$
"
},
{
"args": "timestamp with time zone, timestamp with time zone, smallint, internal",
"name": "gin_compare_prefix_timestamptz",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.gin_compare_prefix_timestamptz(timestamp with time zone, timestamp with time zone, smallint, internal)
RETURNS integer
LANGUAGE c
IMMUTABLE STRICT
AS '$libdir/btree_gin', $function$gin_compare_prefix_timestamptz$function$
"
},
{
"args": "time with time zone, time with time zone, smallint, internal",
"name": "gin_compare_prefix_timetz",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.gin_compare_prefix_timetz(time with time zone, time with time zone, smallint, internal)
RETURNS integer
LANGUAGE c
IMMUTABLE STRICT
AS '$libdir/btree_gin', $function$gin_compare_prefix_timetz$function$
"
},
{
"args": "uuid, uuid, smallint, internal",
"name": "gin_compare_prefix_uuid",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.gin_compare_prefix_uuid(uuid, uuid, smallint, internal)
RETURNS integer
LANGUAGE c
IMMUTABLE STRICT
AS '$libdir/btree_gin', $function$gin_compare_prefix_uuid$function$
"
},
{
"args": "bit varying, bit varying, smallint, internal",
"name": "gin_compare_prefix_varbit",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.gin_compare_prefix_varbit(bit varying, bit varying, smallint, internal)
RETURNS integer
LANGUAGE c
IMMUTABLE STRICT
AS '$libdir/btree_gin', $function$gin_compare_prefix_varbit$function$
"
},
{
"args": "anyenum, anyenum",
"name": "gin_enum_cmp",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.gin_enum_cmp(anyenum, anyenum)
RETURNS integer
LANGUAGE c
IMMUTABLE STRICT
AS '$libdir/btree_gin', $function$gin_enum_cmp$function$
"
},
{
"args": "anyenum, internal, smallint, internal, internal",
"name": "gin_extract_query_anyenum",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.gin_extract_query_anyenum(anyenum, internal, smallint, internal, internal)
RETURNS internal
LANGUAGE c
IMMUTABLE STRICT
AS '$libdir/btree_gin', $function$gin_extract_query_anyenum$function$
"
},
{
"args": "bit, internal, smallint, internal, internal",
"name": "gin_extract_query_bit",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.gin_extract_query_bit(bit, internal, smallint, internal, internal)
RETURNS internal
LANGUAGE c
IMMUTABLE STRICT
AS '$libdir/btree_gin', $function$gin_extract_query_bit$function$
"
},
{
"args": "boolean, internal, smallint, internal, internal",
"name": "gin_extract_query_bool",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.gin_extract_query_bool(boolean, internal, smallint, internal, internal)
RETURNS internal
LANGUAGE c
IMMUTABLE STRICT
AS '$libdir/btree_gin', $function$gin_extract_query_bool$function$
"
},
{
"args": "character, internal, smallint, internal, internal",
"name": "gin_extract_query_bpchar",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.gin_extract_query_bpchar(character, internal, smallint, internal, internal)
RETURNS internal
LANGUAGE c
IMMUTABLE STRICT
AS '$libdir/btree_gin', $function$gin_extract_query_bpchar$function$
"
},
{
"args": "bytea, internal, smallint, internal, internal",
"name": "gin_extract_query_bytea",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.gin_extract_query_bytea(bytea, internal, smallint, internal, internal)
RETURNS internal
LANGUAGE c
IMMUTABLE STRICT
AS '$libdir/btree_gin', $function$gin_extract_query_bytea$function$
"
},
{
"args": "\"char\", internal, smallint, internal, internal",
"name": "gin_extract_query_char",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.gin_extract_query_char(\"char\", internal, smallint, internal, internal)
RETURNS internal
LANGUAGE c
IMMUTABLE STRICT
AS '$libdir/btree_gin', $function$gin_extract_query_char$function$
"
},
{
"args": "cidr, internal, smallint, internal, internal",
"name": "gin_extract_query_cidr",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.gin_extract_query_cidr(cidr, internal, smallint, internal, internal)
RETURNS internal
LANGUAGE c
IMMUTABLE STRICT
AS '$libdir/btree_gin', $function$gin_extract_query_cidr$function$
"
},
{
"args": "date, internal, smallint, internal, internal",
"name": "gin_extract_query_date",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.gin_extract_query_date(date, internal, smallint, internal, internal)
RETURNS internal
LANGUAGE c
IMMUTABLE STRICT
AS '$libdir/btree_gin', $function$gin_extract_query_date$function$
"
},
{
"args": "real, internal, smallint, internal, internal",
"name": "gin_extract_query_float4",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.gin_extract_query_float4(real, internal, smallint, internal, internal)
RETURNS internal
LANGUAGE c
IMMUTABLE STRICT
AS '$libdir/btree_gin', $function$gin_extract_query_float4$function$
"
},
{
"args": "double precision, internal, smallint, internal, internal",
"name": "gin_extract_query_float8",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.gin_extract_query_float8(double precision, internal, smallint, internal, internal)
RETURNS internal
LANGUAGE c
IMMUTABLE STRICT
AS '$libdir/btree_gin', $function$gin_extract_query_float8$function$
"
},
{
"args": "inet, internal, smallint, internal, internal",
"name": "gin_extract_query_inet",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.gin_extract_query_inet(inet, internal, smallint, internal, internal)
RETURNS internal
LANGUAGE c
IMMUTABLE STRICT
AS '$libdir/btree_gin', $function$gin_extract_query_inet$function$
"
},
{
"args": "smallint, internal, smallint, internal, internal",
"name": "gin_extract_query_int2",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.gin_extract_query_int2(smallint, internal, smallint, internal, internal)
RETURNS internal
LANGUAGE c
IMMUTABLE STRICT
AS '$libdir/btree_gin', $function$gin_extract_query_int2$function$
"
},
{
"args": "integer, internal, smallint, internal, internal",
"name": "gin_extract_query_int4",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.gin_extract_query_int4(integer, internal, smallint, internal, internal)
RETURNS internal
LANGUAGE c
IMMUTABLE STRICT
AS '$libdir/btree_gin', $function$gin_extract_query_int4$function$
"
},
{
"args": "bigint, internal, smallint, internal, internal",
"name": "gin_extract_query_int8",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.gin_extract_query_int8(bigint, internal, smallint, internal, internal)
RETURNS internal
LANGUAGE c
IMMUTABLE STRICT
AS '$libdir/btree_gin', $function$gin_extract_query_int8$function$
"
},
{
"args": "interval, internal, smallint, internal, internal",
"name": "gin_extract_query_interval",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.gin_extract_query_interval(interval, internal, smallint, internal, internal)
RETURNS internal
LANGUAGE c
IMMUTABLE STRICT
AS '$libdir/btree_gin', $function$gin_extract_query_interval$function$
"
},
{
"args": "macaddr, internal, smallint, internal, internal",
"name": "gin_extract_query_macaddr",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.gin_extract_query_macaddr(macaddr, internal, smallint, internal, internal)
RETURNS internal
LANGUAGE c
IMMUTABLE STRICT
AS '$libdir/btree_gin', $function$gin_extract_query_macaddr$function$
"
},
{
"args": "macaddr8, internal, smallint, internal, internal",
"name": "gin_extract_query_macaddr8",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.gin_extract_query_macaddr8(macaddr8, internal, smallint, internal, internal)
RETURNS internal
LANGUAGE c
IMMUTABLE STRICT
AS '$libdir/btree_gin', $function$gin_extract_query_macaddr8$function$
"
},
{
"args": "money, internal, smallint, internal, internal",
"name": "gin_extract_query_money",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.gin_extract_query_money(money, internal, smallint, internal, internal)
RETURNS internal
LANGUAGE c
IMMUTABLE STRICT
AS '$libdir/btree_gin', $function$gin_extract_query_money$function$
"
},
{
"args": "name, internal, smallint, internal, internal",
"name": "gin_extract_query_name",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.gin_extract_query_name(name, internal, smallint, internal, internal)
RETURNS internal
LANGUAGE c
IMMUTABLE STRICT
AS '$libdir/btree_gin', $function$gin_extract_query_name$function$
"
},
{
"args": "numeric, internal, smallint, internal, internal",
"name": "gin_extract_query_numeric",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.gin_extract_query_numeric(numeric, internal, smallint, internal, internal)
RETURNS internal
LANGUAGE c
IMMUTABLE STRICT
AS '$libdir/btree_gin', $function$gin_extract_query_numeric$function$
"
},
{
"args": "oid, internal, smallint, internal, internal",
"name": "gin_extract_query_oid",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.gin_extract_query_oid(oid, internal, smallint, internal, internal)
RETURNS internal
LANGUAGE c
IMMUTABLE STRICT
AS '$libdir/btree_gin', $function$gin_extract_query_oid$function$
"
},
{
"args": "text, internal, smallint, internal, internal",
"name": "gin_extract_query_text",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.gin_extract_query_text(text, internal, smallint, internal, internal)
RETURNS internal
LANGUAGE c
IMMUTABLE STRICT
AS '$libdir/btree_gin', $function$gin_extract_query_text$function$
"
},
{
"args": "time without time zone, internal, smallint, internal, internal",
"name": "gin_extract_query_time",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.gin_extract_query_time(time without time zone, internal, smallint, internal, internal)
RETURNS internal
LANGUAGE c
IMMUTABLE STRICT
AS '$libdir/btree_gin', $function$gin_extract_query_time$function$
"
},
{
"args": "timestamp without time zone, internal, smallint, internal, internal",
"name": "gin_extract_query_timestamp",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.gin_extract_query_timestamp(timestamp without time zone, internal, smallint, internal, internal)
RETURNS internal
LANGUAGE c
IMMUTABLE STRICT
AS '$libdir/btree_gin', $function$gin_extract_query_timestamp$function$
"
},
{
"args": "timestamp with time zone, internal, smallint, internal, internal",
"name": "gin_extract_query_timestamptz",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.gin_extract_query_timestamptz(timestamp with time zone, internal, smallint, internal, internal)
RETURNS internal
LANGUAGE c
IMMUTABLE STRICT
AS '$libdir/btree_gin', $function$gin_extract_query_timestamptz$function$
"
},
{
"args": "time with time zone, internal, smallint, internal, internal",
"name": "gin_extract_query_timetz",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.gin_extract_query_timetz(time with time zone, internal, smallint, internal, internal)
RETURNS internal
LANGUAGE c
IMMUTABLE STRICT
AS '$libdir/btree_gin', $function$gin_extract_query_timetz$function$
"
},
{
"args": "text, internal, smallint, internal, internal, internal, internal",
"name": "gin_extract_query_trgm",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.gin_extract_query_trgm(text, internal, smallint, internal, internal, internal, internal)
RETURNS internal
LANGUAGE c
IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$gin_extract_query_trgm$function$
"
},
{
"args": "uuid, internal, smallint, internal, internal",
"name": "gin_extract_query_uuid",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.gin_extract_query_uuid(uuid, internal, smallint, internal, internal)
RETURNS internal
LANGUAGE c
IMMUTABLE STRICT
AS '$libdir/btree_gin', $function$gin_extract_query_uuid$function$
"
},
{
"args": "bit varying, internal, smallint, internal, internal",
"name": "gin_extract_query_varbit",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.gin_extract_query_varbit(bit varying, internal, smallint, internal, internal)
RETURNS internal
LANGUAGE c
IMMUTABLE STRICT
AS '$libdir/btree_gin', $function$gin_extract_query_varbit$function$
"
},
{
"args": "anyenum, internal",
"name": "gin_extract_value_anyenum",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.gin_extract_value_anyenum(anyenum, internal)
RETURNS internal
LANGUAGE c
IMMUTABLE STRICT
AS '$libdir/btree_gin', $function$gin_extract_value_anyenum$function$
"
},
{
"args": "bit, internal",
"name": "gin_extract_value_bit",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.gin_extract_value_bit(bit, internal)
RETURNS internal
LANGUAGE c
IMMUTABLE STRICT
AS '$libdir/btree_gin', $function$gin_extract_value_bit$function$
"
},
{
"args": "boolean, internal",
"name": "gin_extract_value_bool",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.gin_extract_value_bool(boolean, internal)
RETURNS internal
LANGUAGE c
IMMUTABLE STRICT
AS '$libdir/btree_gin', $function$gin_extract_value_bool$function$
"
},
{
"args": "character, internal",
"name": "gin_extract_value_bpchar",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.gin_extract_value_bpchar(character, internal)
RETURNS internal
LANGUAGE c
IMMUTABLE STRICT
AS '$libdir/btree_gin', $function$gin_extract_value_bpchar$function$
"
},
{
"args": "bytea, internal",
"name": "gin_extract_value_bytea",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.gin_extract_value_bytea(bytea, internal)
RETURNS internal
LANGUAGE c
IMMUTABLE STRICT
AS '$libdir/btree_gin', $function$gin_extract_value_bytea$function$
"
},
{
"args": "\"char\", internal",
"name": "gin_extract_value_char",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.gin_extract_value_char(\"char\", internal)
RETURNS internal
LANGUAGE c
IMMUTABLE STRICT
AS '$libdir/btree_gin', $function$gin_extract_value_char$function$
"
},
{
"args": "cidr, internal",
"name": "gin_extract_value_cidr",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.gin_extract_value_cidr(cidr, internal)
RETURNS internal
LANGUAGE c
IMMUTABLE STRICT
AS '$libdir/btree_gin', $function$gin_extract_value_cidr$function$
"
},
{
"args": "date, internal",
"name": "gin_extract_value_date",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.gin_extract_value_date(date, internal)
RETURNS internal
LANGUAGE c
IMMUTABLE STRICT
AS '$libdir/btree_gin', $function$gin_extract_value_date$function$
"
},
{
"args": "real, internal",
"name": "gin_extract_value_float4",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.gin_extract_value_float4(real, internal)
RETURNS internal
LANGUAGE c
IMMUTABLE STRICT
AS '$libdir/btree_gin', $function$gin_extract_value_float4$function$
"
},
{
"args": "double precision, internal",
"name": "gin_extract_value_float8",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.gin_extract_value_float8(double precision, internal)
RETURNS internal
LANGUAGE c
IMMUTABLE STRICT
AS '$libdir/btree_gin', $function$gin_extract_value_float8$function$
"
},
{
"args": "inet, internal",
"name": "gin_extract_value_inet",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.gin_extract_value_inet(inet, internal)
RETURNS internal
LANGUAGE c
IMMUTABLE STRICT
AS '$libdir/btree_gin', $function$gin_extract_value_inet$function$
"
},
{
"args": "smallint, internal",
"name": "gin_extract_value_int2",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.gin_extract_value_int2(smallint, internal)
RETURNS internal
LANGUAGE c
IMMUTABLE STRICT
AS '$libdir/btree_gin', $function$gin_extract_value_int2$function$
"
},
{
"args": "integer, internal",
"name": "gin_extract_value_int4",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.gin_extract_value_int4(integer, internal)
RETURNS internal
LANGUAGE c
IMMUTABLE STRICT
AS '$libdir/btree_gin', $function$gin_extract_value_int4$function$
"
},
{
"args": "bigint, internal",
"name": "gin_extract_value_int8",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.gin_extract_value_int8(bigint, internal)
RETURNS internal
LANGUAGE c
IMMUTABLE STRICT
AS '$libdir/btree_gin', $function$gin_extract_value_int8$function$
"
},
{
"args": "interval, internal",
"name": "gin_extract_value_interval",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.gin_extract_value_interval(interval, internal)
RETURNS internal
LANGUAGE c
IMMUTABLE STRICT
AS '$libdir/btree_gin', $function$gin_extract_value_interval$function$
"
},
{
"args": "macaddr, internal",
"name": "gin_extract_value_macaddr",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.gin_extract_value_macaddr(macaddr, internal)
RETURNS internal
LANGUAGE c
IMMUTABLE STRICT
AS '$libdir/btree_gin', $function$gin_extract_value_macaddr$function$
"
},
{
"args": "macaddr8, internal",
"name": "gin_extract_value_macaddr8",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.gin_extract_value_macaddr8(macaddr8, internal)
RETURNS internal
LANGUAGE c
IMMUTABLE STRICT
AS '$libdir/btree_gin', $function$gin_extract_value_macaddr8$function$
"
},
{
"args": "money, internal",
"name": "gin_extract_value_money",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.gin_extract_value_money(money, internal)
RETURNS internal
LANGUAGE c
IMMUTABLE STRICT
AS '$libdir/btree_gin', $function$gin_extract_value_money$function$
"
},
{
"args": "name, internal",
"name": "gin_extract_value_name",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.gin_extract_value_name(name, internal)
RETURNS internal
LANGUAGE c
IMMUTABLE STRICT
AS '$libdir/btree_gin', $function$gin_extract_value_name$function$
"
},
{
"args": "numeric, internal",
"name": "gin_extract_value_numeric",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.gin_extract_value_numeric(numeric, internal)
RETURNS internal
LANGUAGE c
IMMUTABLE STRICT
AS '$libdir/btree_gin', $function$gin_extract_value_numeric$function$
"
},
{
"args": "oid, internal",
"name": "gin_extract_value_oid",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.gin_extract_value_oid(oid, internal)
RETURNS internal
LANGUAGE c
IMMUTABLE STRICT
AS '$libdir/btree_gin', $function$gin_extract_value_oid$function$
"
},
{
"args": "text, internal",
"name": "gin_extract_value_text",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.gin_extract_value_text(text, internal)
RETURNS internal
LANGUAGE c
IMMUTABLE STRICT
AS '$libdir/btree_gin', $function$gin_extract_value_text$function$
"
},
{
"args": "time without time zone, internal",
"name": "gin_extract_value_time",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.gin_extract_value_time(time without time zone, internal)
RETURNS internal
LANGUAGE c
IMMUTABLE STRICT
AS '$libdir/btree_gin', $function$gin_extract_value_time$function$
"
},
{
"args": "timestamp without time zone, internal",
"name": "gin_extract_value_timestamp",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.gin_extract_value_timestamp(timestamp without time zone, internal)
RETURNS internal
LANGUAGE c
IMMUTABLE STRICT
AS '$libdir/btree_gin', $function$gin_extract_value_timestamp$function$
"
},
{
"args": "timestamp with time zone, internal",
"name": "gin_extract_value_timestamptz",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.gin_extract_value_timestamptz(timestamp with time zone, internal)
RETURNS internal
LANGUAGE c
IMMUTABLE STRICT
AS '$libdir/btree_gin', $function$gin_extract_value_timestamptz$function$
"
},
{
"args": "time with time zone, internal",
"name": "gin_extract_value_timetz",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.gin_extract_value_timetz(time with time zone, internal)
RETURNS internal
LANGUAGE c
IMMUTABLE STRICT
AS '$libdir/btree_gin', $function$gin_extract_value_timetz$function$
"
},
{
"args": "text, internal",
"name": "gin_extract_value_trgm",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.gin_extract_value_trgm(text, internal)
RETURNS internal
LANGUAGE c
IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$gin_extract_value_trgm$function$
"
},
{
"args": "uuid, internal",
"name": "gin_extract_value_uuid",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.gin_extract_value_uuid(uuid, internal)
RETURNS internal
LANGUAGE c
IMMUTABLE STRICT
AS '$libdir/btree_gin', $function$gin_extract_value_uuid$function$
"
},
{
"args": "bit varying, internal",
"name": "gin_extract_value_varbit",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.gin_extract_value_varbit(bit varying, internal)
RETURNS internal
LANGUAGE c
IMMUTABLE STRICT
AS '$libdir/btree_gin', $function$gin_extract_value_varbit$function$
"
},
{
"args": "numeric, numeric",
"name": "gin_numeric_cmp",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.gin_numeric_cmp(numeric, numeric)
RETURNS integer
LANGUAGE c
IMMUTABLE STRICT
AS '$libdir/btree_gin', $function$gin_numeric_cmp$function$
"
},
{
"args": "internal, smallint, text, integer, internal, internal, internal, internal",
"name": "gin_trgm_consistent",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.gin_trgm_consistent(internal, smallint, text, integer, internal, internal, internal, internal)
RETURNS boolean
LANGUAGE c
IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$gin_trgm_consistent$function$
"
},
{
"args": "internal, smallint, text, integer, internal, internal, internal",
"name": "gin_trgm_triconsistent",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.gin_trgm_triconsistent(internal, smallint, text, integer, internal, internal, internal)
RETURNS \"char\"
LANGUAGE c
IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$gin_trgm_triconsistent$function$
"
},
{
"args": "internal",
"name": "gtrgm_compress",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.gtrgm_compress(internal)
RETURNS internal
LANGUAGE c
IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$gtrgm_compress$function$
"
},
{
"args": "internal, text, smallint, oid, internal",
"name": "gtrgm_consistent",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.gtrgm_consistent(internal, text, smallint, oid, internal)
RETURNS boolean
LANGUAGE c
IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$gtrgm_consistent$function$
"
},
{
"args": "internal",
"name": "gtrgm_decompress",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.gtrgm_decompress(internal)
RETURNS internal
LANGUAGE c
IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$gtrgm_decompress$function$
"
},
{
"args": "internal, text, smallint, oid, internal",
"name": "gtrgm_distance",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.gtrgm_distance(internal, text, smallint, oid, internal)
RETURNS double precision
LANGUAGE c
IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$gtrgm_distance$function$
"
},
{
"args": "cstring",
"name": "gtrgm_in",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.gtrgm_in(cstring)
RETURNS gtrgm
LANGUAGE c
IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$gtrgm_in$function$
"
},
{
"args": "internal",
"name": "gtrgm_options",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.gtrgm_options(internal)
RETURNS void
LANGUAGE c
IMMUTABLE PARALLEL SAFE
AS '$libdir/pg_trgm', $function$gtrgm_options$function$
"
},
{
"args": "gtrgm",
"name": "gtrgm_out",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.gtrgm_out(gtrgm)
RETURNS cstring
LANGUAGE c
IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$gtrgm_out$function$
"
},
{
"args": "internal, internal, internal",
"name": "gtrgm_penalty",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.gtrgm_penalty(internal, internal, internal)
RETURNS internal
LANGUAGE c
IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$gtrgm_penalty$function$
"
},
{
"args": "internal, internal",
"name": "gtrgm_picksplit",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.gtrgm_picksplit(internal, internal)
RETURNS internal
LANGUAGE c
IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$gtrgm_picksplit$function$
"
},
{
"args": "gtrgm, gtrgm, internal",
"name": "gtrgm_same",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.gtrgm_same(gtrgm, gtrgm, internal)
RETURNS internal
LANGUAGE c
IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$gtrgm_same$function$
"
},
{
"args": "internal, internal",
"name": "gtrgm_union",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.gtrgm_union(internal, internal)
RETURNS gtrgm
LANGUAGE c
IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$gtrgm_union$function$
"
},
{
"args": "halfvec, integer, boolean",
"name": "halfvec",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.halfvec(halfvec, integer, boolean)
RETURNS halfvec
LANGUAGE c
IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$halfvec$function$
"
},
{
"args": "double precision[], halfvec",
"name": "halfvec_accum",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.halfvec_accum(double precision[], halfvec)
RETURNS double precision[]
LANGUAGE c
IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$halfvec_accum$function$
"
},
{
"args": "halfvec, halfvec",
"name": "halfvec_add",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.halfvec_add(halfvec, halfvec)
RETURNS halfvec
LANGUAGE c
IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$halfvec_add$function$
"
},
{
"args": "double precision[]",
"name": "halfvec_avg",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.halfvec_avg(double precision[])
RETURNS halfvec
LANGUAGE c
IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$halfvec_avg$function$
"
},
{
"args": "halfvec, halfvec",
"name": "halfvec_cmp",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.halfvec_cmp(halfvec, halfvec)
RETURNS integer
LANGUAGE c
IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$halfvec_cmp$function$
"
},
{
"args": "double precision[], double precision[]",
"name": "halfvec_combine",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.halfvec_combine(double precision[], double precision[])
RETURNS double precision[]
LANGUAGE c
IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$vector_combine$function$
"
},
{
"args": "halfvec, halfvec",
"name": "halfvec_concat",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.halfvec_concat(halfvec, halfvec)
RETURNS halfvec
LANGUAGE c
IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$halfvec_concat$function$
"
},
{
"args": "halfvec, halfvec",
"name": "halfvec_eq",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.halfvec_eq(halfvec, halfvec)
RETURNS boolean
LANGUAGE c
IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$halfvec_eq$function$
"
},
{
"args": "halfvec, halfvec",
"name": "halfvec_ge",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.halfvec_ge(halfvec, halfvec)
RETURNS boolean
LANGUAGE c
IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$halfvec_ge$function$
"
},
{
"args": "halfvec, halfvec",
"name": "halfvec_gt",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.halfvec_gt(halfvec, halfvec)
RETURNS boolean
LANGUAGE c
IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$halfvec_gt$function$
"
},
{
"args": "cstring, oid, integer",
"name": "halfvec_in",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.halfvec_in(cstring, oid, integer)
RETURNS halfvec
LANGUAGE c
IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$halfvec_in$function$
"
},
{
"args": "halfvec, halfvec",
"name": "halfvec_l2_squared_distance",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.halfvec_l2_squared_distance(halfvec, halfvec)
RETURNS double precision
LANGUAGE c
IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$halfvec_l2_squared_distance$function$
"
},
{
"args": "halfvec, halfvec",
"name": "halfvec_le",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.halfvec_le(halfvec, halfvec)
RETURNS boolean
LANGUAGE c
IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$halfvec_le$function$
"
},
{
"args": "halfvec, halfvec",
"name": "halfvec_lt",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.halfvec_lt(halfvec, halfvec)
RETURNS boolean
LANGUAGE c
IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$halfvec_lt$function$
"
},
{
"args": "halfvec, halfvec",
"name": "halfvec_mul",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.halfvec_mul(halfvec, halfvec)
RETURNS halfvec
LANGUAGE c
IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$halfvec_mul$function$
"
},
{
"args": "halfvec, halfvec",
"name": "halfvec_ne",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.halfvec_ne(halfvec, halfvec)
RETURNS boolean
LANGUAGE c
IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$halfvec_ne$function$
"
},
{
"args": "halfvec, halfvec",
"name": "halfvec_negative_inner_product",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.halfvec_negative_inner_product(halfvec, halfvec)
RETURNS double precision
LANGUAGE c
IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$halfvec_negative_inner_product$function$
"
},
{
"args": "halfvec",
"name": "halfvec_out",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.halfvec_out(halfvec)
RETURNS cstring
LANGUAGE c
IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$halfvec_out$function$
"
},
{
"args": "internal, oid, integer",
"name": "halfvec_recv",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.halfvec_recv(internal, oid, integer)
RETURNS halfvec
LANGUAGE c
IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$halfvec_recv$function$
"
},
{
"args": "halfvec",
"name": "halfvec_send",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.halfvec_send(halfvec)
RETURNS bytea
LANGUAGE c
IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$halfvec_send$function$
"
},
{
"args": "halfvec, halfvec",
"name": "halfvec_spherical_distance",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.halfvec_spherical_distance(halfvec, halfvec)
RETURNS double precision
LANGUAGE c
IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$halfvec_spherical_distance$function$
"
},
{
"args": "halfvec, halfvec",
"name": "halfvec_sub",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.halfvec_sub(halfvec, halfvec)
RETURNS halfvec
LANGUAGE c
IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$halfvec_sub$function$
"
},
{
"args": "halfvec, integer, boolean",
"name": "halfvec_to_float4",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.halfvec_to_float4(halfvec, integer, boolean)
RETURNS real[]
LANGUAGE c
IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$halfvec_to_float4$function$
"
},
{
"args": "halfvec, integer, boolean",
"name": "halfvec_to_sparsevec",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.halfvec_to_sparsevec(halfvec, integer, boolean)
RETURNS sparsevec
LANGUAGE c
IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$halfvec_to_sparsevec$function$
"
},
{
"args": "halfvec, integer, boolean",
"name": "halfvec_to_vector",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.halfvec_to_vector(halfvec, integer, boolean)
RETURNS vector
LANGUAGE c
IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$halfvec_to_vector$function$
"
},
{
"args": "cstring[]",
"name": "halfvec_typmod_in",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.halfvec_typmod_in(cstring[])
RETURNS integer
LANGUAGE c
IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$halfvec_typmod_in$function$
"
},
{
"args": "bit, bit",
"name": "hamming_distance",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.hamming_distance(bit, bit)
RETURNS double precision
LANGUAGE c
IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$hamming_distance$function$
"
},
{
"args": "",
"name": "handle_manual_brief_generation",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.handle_manual_brief_generation()
RETURNS trigger
LANGUAGE plpgsql
AS $function$DECLARE\r
v_job_id TEXT;\r
BEGIN\r
-- Only process if this is a manual generation (not from a queue job)\r
-- Check if there's a metadata field that indicates this came from a job\r
IF (TG_OP = 'INSERT' OR TG_OP = 'UPDATE') THEN\r
\r
-- Extract job_id from metadata if it exists (we'll add this in the worker)\r
v_job_id := NEW.metadata->>'queue_job_id';\r
\r
-- Only cancel OTHER jobs, not the one that created this brief\r
IF v_job_id IS NULL OR NEW.generation_status = 'failed' THEN\r
-- This is a manual generation or a retry, cancel pending jobs\r
UPDATE queue_jobs \r
SET \r
status = 'cancelled',\r
error_message = 'Cancelled due to newer brief generation request',\r
processed_at = now()\r
WHERE \r
user_id = NEW.user_id \r
AND job_type = 'generate_daily_brief'\r
AND status IN ('pending', 'processing')\r
AND DATE(scheduled_for) = NEW.brief_date\r
AND (v_job_id IS NULL OR queue_job_id != v_job_id);\r
END IF;\r
\r
END IF;\r
\r
RETURN NEW;\r
END;$function$
"
},
{
"args": "internal",
"name": "hnsw_bit_support",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.hnsw_bit_support(internal)
RETURNS internal
LANGUAGE c
AS '$libdir/vector', $function$hnsw_bit_support$function$
"
},
{
"args": "internal",
"name": "hnsw_halfvec_support",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.hnsw_halfvec_support(internal)
RETURNS internal
LANGUAGE c
AS '$libdir/vector', $function$hnsw_halfvec_support$function$
"
},
{
"args": "internal",
"name": "hnsw_sparsevec_support",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.hnsw_sparsevec_support(internal)
RETURNS internal
LANGUAGE c
AS '$libdir/vector', $function$hnsw_sparsevec_support$function$
"
},
{
"args": "internal",
"name": "hnswhandler",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.hnswhandler(internal)
RETURNS index_am_handler
LANGUAGE c
AS '$libdir/vector', $function$hnswhandler$function$
"
},
{
"args": "",
"name": "increment_agent_session_message_count",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.increment_agent_session_message_count()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
UPDATE agent_chat_sessions
SET message_count = message_count + 1
WHERE id = NEW.agent_session_id;
RETURN NEW;
END;
$function$
"
},
{
"args": "p_session_id uuid, p_message_increment integer, p_token_increment integer, p_tool_increment integer",
"name": "increment_chat_session_metrics",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.increment_chat_session_metrics(p_session_id uuid, p_message_increment integer DEFAULT 0, p_token_increment integer DEFAULT 0, p_tool_increment integer DEFAULT 0)
RETURNS void
LANGUAGE plpgsql
AS $function$
BEGIN
\tUPDATE chat_sessions
\tSET message_count = COALESCE(message_count, 0) + COALESCE(p_message_increment,
0),
\t\ttotal_tokens_used = COALESCE(total_tokens_used, 0) + COALESCE(p_token_increment,
0),
\t\ttool_call_count = COALESCE(tool_call_count, 0) + COALESCE(p_tool_increment,
0),
\t\tupdated_at = NOW()
\tWHERE id = p_session_id;
END;
$function$
"
},
{
"args": "row_id bigint",
"name": "increment_migration_retry_count",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.increment_migration_retry_count(row_id bigint)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
UPDATE migration_log
SET
retry_count = COALESCE(retry_count, 0) + 1,
last_retry_at = NOW()
WHERE id = row_id;
END;
$function$
"
},
{
"args": "question_ids uuid[]",
"name": "increment_question_display_count",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.increment_question_display_count(question_ids uuid[])
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
UPDATE project_questions
SET
shown_to_user_count = shown_to_user_count + 1,
updated_at = NOW()
WHERE id = ANY(question_ids);
END;
$function$
"
},
{
"args": "halfvec, halfvec",
"name": "inner_product",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.inner_product(halfvec, halfvec)
RETURNS double precision
LANGUAGE c
IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$halfvec_inner_product$function$
"
},
{
"args": "sparsevec, sparsevec",
"name": "inner_product",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.inner_product(sparsevec, sparsevec)
RETURNS double precision
LANGUAGE c
IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$sparsevec_inner_product$function$
"
},
{
"args": "vector, vector",
"name": "inner_product",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.inner_product(vector, vector)
RETURNS double precision
LANGUAGE c
IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$inner_product$function$
"
},
{
"args": "",
"name": "is_admin",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
SELECT COALESCE(
(SELECT is_admin FROM users WHERE id = auth.uid()),
false
);
$function$
"
},
{
"args": "user_id uuid",
"name": "is_admin",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.is_admin(user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
AS $function$
BEGIN
RETURN EXISTS (
SELECT 1 FROM admin_users
WHERE admin_users.user_id = $1
  );
END;
$function$
"
  },
  {
    "args": "internal",
    "name": "ivfflat_bit_support",
    "schema": "public",
    "definition": "CREATE OR REPLACE FUNCTION public.ivfflat_bit_support(internal)
 RETURNS internal
 LANGUAGE c
AS '$libdir/vector', $function$ivfflat_bit_support$function$
"
},
{
"args": "internal",
"name": "ivfflat_halfvec_support",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.ivfflat_halfvec_support(internal)
RETURNS internal
LANGUAGE c
AS '$libdir/vector', $function$ivfflat_halfvec_support$function$
"
},
{
"args": "internal",
"name": "ivfflathandler",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.ivfflathandler(internal)
RETURNS index_am_handler
LANGUAGE c
AS '$libdir/vector', $function$ivfflathandler$function$
"
},
{
"args": "bit, bit",
"name": "jaccard_distance",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.jaccard_distance(bit, bit)
RETURNS double precision
LANGUAGE c
IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$jaccard_distance$function$
"
},
{
"args": "halfvec, halfvec",
"name": "l1_distance",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.l1_distance(halfvec, halfvec)
RETURNS double precision
LANGUAGE c
IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$halfvec_l1_distance$function$
"
},
{
"args": "sparsevec, sparsevec",
"name": "l1_distance",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.l1_distance(sparsevec, sparsevec)
RETURNS double precision
LANGUAGE c
IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$sparsevec_l1_distance$function$
"
},
{
"args": "vector, vector",
"name": "l1_distance",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.l1_distance(vector, vector)
RETURNS double precision
LANGUAGE c
IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$l1_distance$function$
"
},
{
"args": "halfvec, halfvec",
"name": "l2_distance",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.l2_distance(halfvec, halfvec)
RETURNS double precision
LANGUAGE c
IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$halfvec_l2_distance$function$
"
},
{
"args": "sparsevec, sparsevec",
"name": "l2_distance",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.l2_distance(sparsevec, sparsevec)
RETURNS double precision
LANGUAGE c
IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$sparsevec_l2_distance$function$
"
},
{
"args": "vector, vector",
"name": "l2_distance",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.l2_distance(vector, vector)
RETURNS double precision
LANGUAGE c
IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$l2_distance$function$
"
},
{
"args": "halfvec",
"name": "l2_norm",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.l2_norm(halfvec)
RETURNS double precision
LANGUAGE c
IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$halfvec_l2_norm$function$
"
},
{
"args": "sparsevec",
"name": "l2_norm",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.l2_norm(sparsevec)
RETURNS double precision
LANGUAGE c
IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$sparsevec_l2_norm$function$
"
},
{
"args": "halfvec",
"name": "l2_normalize",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.l2_normalize(halfvec)
RETURNS halfvec
LANGUAGE c
IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$halfvec_l2_normalize$function$
"
},
{
"args": "sparsevec",
"name": "l2_normalize",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.l2_normalize(sparsevec)
RETURNS sparsevec
LANGUAGE c
IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$sparsevec_l2_normalize$function$
"
},
{
"args": "vector",
"name": "l2_normalize",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.l2_normalize(vector)
RETURNS vector
LANGUAGE c
IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$l2_normalize$function$
"
},
{
"args": "",
"name": "list_pending_project_invites",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.list_pending_project_invites()
RETURNS TABLE(invite_id uuid, project_id uuid, project_name text, role_key text, access text, status text, expires_at timestamp with time zone, created_at timestamp with time zone, invited_by_actor_id uuid, invited_by_name text, invited_by_email text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
v_auth_user_id uuid;
v_user_email text;
BEGIN
v_auth_user_id := auth.uid();
IF v_auth_user_id IS NULL THEN
RAISE EXCEPTION 'Authentication required';
END IF;

SELECT email INTO v_user_email
FROM public.users
WHERE id = v_auth_user_id;

IF v_user_email IS NULL THEN
SELECT email INTO v_user_email
FROM onto_actors
WHERE user_id = v_auth_user_id
LIMIT 1;
END IF;

IF v_user_email IS NULL OR length(trim(v_user_email)) = 0 THEN
RAISE EXCEPTION 'User email missing';
END IF;

UPDATE onto_project_invites AS i
SET status = 'expired'
WHERE i.status = 'pending'
AND i.expires_at < now()
AND lower(i.invitee_email) = lower(trim(v_user_email));

RETURN QUERY
SELECT
i.id,
i.project_id,
p.name,
i.role_key,
i.access,
i.status,
i.expires_at,
i.created_at,
i.invited_by_actor_id,
COALESCE(u.name, a.name, u.email, a.email) AS invited_by_name,
COALESCE(u.email, a.email) AS invited_by_email
FROM onto_project_invites i
JOIN onto_projects p ON p.id = i.project_id
LEFT JOIN onto_actors a ON a.id = i.invited_by_actor_id
LEFT JOIN public.users u ON u.id = a.user_id
WHERE lower(i.invitee_email) = lower(trim(v_user_email))
AND i.status = 'pending'
AND i.expires_at >= now()
AND p.deleted_at IS NULL
ORDER BY i.created_at DESC;
END;
$function$
"
},
{
"args": "p_level text, p_message text, p_namespace text, p_correlation_id uuid, p_event_id uuid, p_delivery_id uuid, p_user_id uuid, p_context jsonb, p_metadata jsonb",
"name": "log_notification_event",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.log_notification_event(p_level text, p_message text, p_namespace text DEFAULT 'db_function'::text, p_correlation_id uuid DEFAULT NULL::uuid, p_event_id uuid DEFAULT NULL::uuid, p_delivery_id uuid DEFAULT NULL::uuid, p_user_id uuid DEFAULT NULL::uuid, p_context jsonb DEFAULT '{}'::jsonb, p_metadata jsonb DEFAULT '{}'::jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
-- Insert log entry into notification_logs table
-- Note: This is non-blocking and won't fail the transaction if logging fails
INSERT INTO notification_logs (
level,
message,
namespace,
correlation_id,
notification_event_id,
notification_delivery_id,
user_id,
metadata,
created_at
) VALUES (
p_level,
p_message,
p_namespace,
p_correlation_id,
p_event_id,
p_delivery_id,
p_user_id,
p_context || p_metadata, -- Merge context and metadata
NOW()
);
EXCEPTION
WHEN OTHERS THEN
-- Don't fail the transaction if logging fails
-- Just silently continue (logging is best-effort)
NULL;
END;
$function$
"
},
{
"args": "",
"name": "notify_user_signup",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.notify_user_signup()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
v_has_subscriptions BOOLEAN;
v_has_emit_function BOOLEAN;
v_has_events_table BOOLEAN;
BEGIN
-- Check if notification_events table exists
SELECT EXISTS (
SELECT 1 FROM information_schema.tables
WHERE table_schema = 'public' AND table_name = 'notification_events'
) INTO v_has_events_table;

-- Only proceed if table exists
IF NOT v_has_events_table THEN
RAISE WARNING 'notification_events table does not exist, skipping notification';
RETURN NEW;
END IF;

-- Check if notification_subscriptions exists and has data
SELECT EXISTS (
SELECT 1 FROM notification_subscriptions
WHERE event_type = 'user.signup' AND is_active = true
) INTO v_has_subscriptions;

-- Check if emit_notification_event function exists
SELECT EXISTS (
SELECT 1 FROM pg_proc
WHERE proname = 'emit_notification_event'
) INTO v_has_emit_function;

-- Only emit if we have the function and active subscriptions
IF v_has_emit_function AND v_has_subscriptions THEN
BEGIN
-- Now the user exists in auth.users, so foreign key constraint will be satisfied
PERFORM emit_notification_event(
p_event_type := 'user.signup',
p_event_source := 'database_trigger',
p_actor_user_id := NEW.id, -- This is now safe - user exists in database
p_payload := jsonb_build_object(
'user_id', NEW.id,
'user_email', NEW.email,
'signup_method', COALESCE(
-- Query provider from auth.identities, not auth.users
(SELECT provider FROM auth.identities WHERE user_id = NEW.id LIMIT 1),
'email'
),
-- Removed referral_source as column doesn't exist
'created_at', NEW.created_at
)
);
EXCEPTION
WHEN foreign_key_violation THEN
-- Specific handling for foreign key issues
RAISE WARNING 'Foreign key violation in notification: user % may not exist in auth.users yet', NEW.id;
RETURN NEW;
WHEN OTHERS THEN
-- Log other errors but don't fail user creation
RAISE WARNING 'Failed to emit signup notification for user %: %', NEW.id, SQLERRM;
RETURN NEW;
END;
END IF;

RETURN NEW;
EXCEPTION
WHEN OTHERS THEN
-- Ultimate fallback - ensure user creation always succeeds
RAISE WARNING 'notify_user_signup error for user %: %', NEW.id, SQLERRM;
RETURN NEW;
END;
$function$
"
},
{
"args": "p_guard jsonb, p_entity jsonb",
"name": "onto_check_guard",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.onto_check_guard(p_guard jsonb, p_entity jsonb)
RETURNS boolean
LANGUAGE plpgsql
AS $function$
declare
\tv_type text;
\tv_path text;
\tv_key text;
\tv_value text;
\tv_pattern text;
\tv_current text;
begin
\tif p_guard is null or jsonb_typeof(p_guard) <> 'object' then
\t\treturn false;
\tend if;

\tv_type := p_guard->>'type';
\tif v_type is null then
\t\treturn false;
\tend if;

\tcase v_type
\t\twhen 'has_property' then
\t\t\tv_path := p_guard->>'path';
\t\t\tif v_path is null or length(v_path) = 0 then
\t\t\t\treturn false;
\t\t\tend if;
\t\t\treturn onto_jsonb_has_value(p_entity, v_path);

\t\twhen 'has_facet' then
\t\t\tv_key := p_guard->>'key';
\t\t\tv_value := p_guard->>'value';
\t\t\tif v_key is null or v_value is null then
\t\t\t\treturn false;
\t\t\tend if;
\t\t\treturn onto_jsonb_extract_text(p_entity, 'props.facets.' || v_key) = v_value;

\t\twhen 'facet_in' then
\t\t\tv_key := p_guard->>'key';
\t\t\tif v_key is null or p_guard->'values' is null then
\t\t\t\treturn false;
\t\t\tend if;

\t\t\tv_value := onto_jsonb_extract_text(p_entity, 'props.facets.' || v_key);
\t\t\tif v_value is null then
\t\t\t\treturn false;
\t\t\tend if;

\t\t\treturn exists (
\t\t\t\tselect 1
\t\t\t\tfrom jsonb_array_elements_text(p_guard->'values') as vals(val)
\t\t\t\twhere vals.val = v_value
\t\t\t);

\t\twhen 'all_facets_set' then
\t\t\tif p_guard->'keys' is null then
\t\t\t\treturn false;
\t\t\tend if;

\t\t\treturn not exists (
\t\t\t\tselect 1
\t\t\t\tfrom jsonb_array_elements_text(p_guard->'keys') as facet_keys(key)
\t\t\t\twhere not onto_jsonb_has_value(p_entity, 'props.facets.' || facet_keys.key)
\t\t\t);

\t\twhen 'type_key_matches' then
\t\t\tv_pattern := p_guard->>'pattern';
\t\t\tif v_pattern is null then
\t\t\t\treturn false;
\t\t\tend if;

\t\t\tv*pattern := replace(v_pattern, '\*', '.*');
\t\t\tv_current := coalesce(p_entity->>'type_key', '');
\t\t\t-- Use case-sensitive regex to match the transformed pattern
\t\t\treturn v_current ~ v_pattern;

\t\telse
\t\t\treturn false;
\tend case;
end;
$function$
"
},
{
"args": "p_project_id uuid, p_entity_type text, p_entity_id uuid",
"name": "onto_comment_validate_target",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.onto_comment_validate_target(p_project_id uuid, p_entity_type text, p_entity_id uuid)
RETURNS boolean
LANGUAGE plpgsql
AS $function$
BEGIN
IF p_project_id IS NULL OR p_entity_type IS NULL OR p_entity_id IS NULL THEN
RETURN false;
END IF;

CASE p*entity_type
WHEN 'project' THEN
RETURN p_entity_id = p_project_id;
WHEN 'task' THEN
RETURN EXISTS (
SELECT 1 FROM onto_tasks t
WHERE t.id = p_entity_id AND t.project_id = p_project_id
);
WHEN 'plan' THEN
RETURN EXISTS (
SELECT 1 FROM onto_plans pl
WHERE pl.id = p_entity_id AND pl.project_id = p_project_id
);
WHEN 'output' THEN
RETURN EXISTS (
SELECT 1 FROM onto_outputs o
WHERE o.id = p_entity_id AND o.project_id = p_project_id
);
WHEN 'document' THEN
RETURN EXISTS (
SELECT 1 FROM onto_documents d
WHERE d.id = p_entity_id AND d.project_id = p_project_id
);
WHEN 'goal' THEN
RETURN EXISTS (
SELECT 1 FROM onto_goals g
WHERE g.id = p_entity_id AND g.project_id = p_project_id
);
WHEN 'requirement' THEN
RETURN EXISTS (
SELECT 1 FROM onto_requirements r
WHERE r.id = p_entity_id AND r.project_id = p_project_id
);
WHEN 'milestone' THEN
RETURN EXISTS (
SELECT 1 FROM onto_milestones m
WHERE m.id = p_entity_id AND m.project_id = p_project_id
);
WHEN 'risk' THEN
RETURN EXISTS (
SELECT 1 FROM onto_risks rk
WHERE rk.id = p_entity_id AND rk.project_id = p_project_id
);
WHEN 'decision' THEN
RETURN EXISTS (
SELECT 1 FROM onto_decisions dc
WHERE dc.id = p_entity_id AND dc.project_id = p_project_id
);
WHEN 'event' THEN
RETURN EXISTS (
SELECT 1 FROM onto_events ev
WHERE ev.id = p_entity_id AND ev.project_id = p_project_id
);
WHEN 'metric' THEN
RETURN EXISTS (
SELECT 1 FROM onto_metrics mt
WHERE mt.id = p_entity_id AND mt.project_id = p_project_id
);
WHEN 'metric_point' THEN
RETURN EXISTS (
SELECT 1
FROM onto_metric_points mp
JOIN onto_metrics mt ON mt.id = mp.metric_id
WHERE mp.id = p_entity_id AND mt.project_id = p_project_id
);
WHEN 'source' THEN
RETURN EXISTS (
SELECT 1 FROM onto_sources s
WHERE s.id = p_entity_id AND s.project_id = p_project_id
);
WHEN 'signal' THEN
RETURN EXISTS (
SELECT 1 FROM onto_signals sg
WHERE sg.id = p_entity_id AND sg.project_id = p_project_id
);
WHEN 'insight' THEN
RETURN EXISTS (
SELECT 1 FROM onto_insights i
WHERE i.id = p_entity_id AND i.project_id = p_project_id
);
WHEN 'note' THEN
RETURN EXISTS (
SELECT 1 FROM onto_documents d
WHERE d.id = p_entity_id AND d.project_id = p_project_id
);
ELSE
RETURN false;
END CASE;
END;
$function$
"
},
{
"args": "",
"name": "onto_comments_before_insert",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.onto_comments_before_insert()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
v_parent onto_comments%ROWTYPE;
BEGIN
IF NEW.parent_id IS NULL THEN
IF NEW.root_id IS NOT NULL AND NEW.root_id <> NEW.id THEN
RAISE EXCEPTION 'root_id must match id for top-level comments';
END IF;
NEW.root_id := NEW.id;
ELSE
SELECT * INTO v\*parent FROM onto_comments WHERE id = NEW.parent_id;
IF NOT FOUND THEN
RAISE EXCEPTION 'Parent comment not found';
END IF;

IF v_parent.project_id <> NEW.project_id
OR v_parent.entity_type <> NEW.entity_type
OR v_parent.entity_id <> NEW.entity_id THEN
RAISE EXCEPTION 'Parent comment must share target context';
END IF;

IF NEW.root_id IS NOT NULL AND NEW.root_id <> v_parent.root_id THEN
RAISE EXCEPTION 'root_id must match parent root_id';
END IF;

NEW.root_id := v_parent.root_id;
END IF;

IF NOT onto_comment_validate_target(NEW.project_id, NEW.entity_type, NEW.entity_id) THEN
RAISE EXCEPTION 'Invalid comment target';
END IF;

RETURN NEW;
END;
$function$
"
},
{
"args": "",
"name": "onto_comments_before_update",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.onto_comments_before_update()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
IF NEW.project_id <> OLD.project_id
OR NEW.entity_type <> OLD.entity_type
OR NEW.entity_id <> OLD.entity_id
OR NEW.parent_id <> OLD.parent_id
OR NEW.root_id <> OLD.root_id
OR NEW.created_by <> OLD.created_by
OR NEW.created_at <> OLD.created_at
OR NEW.body_format <> OLD.body_format THEN
RAISE EXCEPTION 'Immutable comment fields cannot be changed';
END IF;

IF NEW.body IS DISTINCT FROM OLD.body THEN
NEW.edited_at := now();
END IF;

NEW.updated_at := now();
RETURN NEW;
END;
$function$
"
},
{
"args": "p_json jsonb, p_path text",
"name": "onto_jsonb_extract",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.onto_jsonb_extract(p_json jsonb, p_path text)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
AS $function$
\tselect
\t\tcase
\t\t\twhen p_json is null or p_path is null or length(p_path) = 0 then null
\t\t\telse p_json #> string_to_array(p_path, '.')
\t\tend;
$function$
"
},
{
"args": "p_json jsonb, p_path text",
"name": "onto_jsonb_extract_text",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.onto_jsonb_extract_text(p_json jsonb, p_path text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $function$
\tselect
\t\tcase
\t\t\twhen p_json is null or p_path is null or length(p_path) = 0 then null
\t\t\telse p_json #>> string_to_array(p_path, '.')
\t\tend;
$function$
"
},
{
"args": "p_json jsonb, p_path text",
"name": "onto_jsonb_has_value",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.onto_jsonb_has_value(p_json jsonb, p_path text)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
AS $function$
declare
\tv_value jsonb;
begin
\tif p_json is null or p_path is null or length(p_path) = 0 then
\t\treturn false;
\tend if;

\tv_value := onto_jsonb_extract(p_json, p_path);

\tif v_value is null then
\t\treturn false;
\tend if;

\tif v_value = 'null': :jsonb then
\t\treturn false;
\tend if;

\treturn true;
end;
$function$
"
},
{
"args": "p_actor_id uuid, p_query text, p_project_id uuid, p_types text[], p_limit integer",
"name": "onto_search_entities",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.onto_search_entities(p_actor_id uuid, p_query text, p_project_id uuid DEFAULT NULL::uuid, p_types text[] DEFAULT NULL::text[], p_limit integer DEFAULT 50)
RETURNS TABLE(type text, id uuid, project_id uuid, project_name text, title text, snippet text, score double precision)
LANGUAGE plpgsql
AS $function$
declare
v_limit int := least(coalesce(p_limit,
50),
50);
v_query tsquery;
begin
if coalesce(trim(p_query), '') = '' then
return;
end if;

v_query := websearch_to_tsquery('english', p_query);

return query
with params as (select v_query as tsq)
select *
from (
-- Tasks
select
'task': :text as type,
t.id,
t.project*id,
p.name as project_name,
t.title as title,
ts_headline(
'english',
concat_ws(' ', coalesce(t.title, ''), coalesce(t.props: :text, '')),
params.tsq,
'MaxFragments=2,MinWords=5,MaxWords=18'
) as snippet,
(coalesce(ts_rank(t.search_vector, params.tsq), 0) * 0.6) +
(similarity(coalesce(t.title, ''), p*query) * 0.4) as score
from onto*tasks t
join params on true
left join onto_projects p on p.id = t.project_id
where t.created_by = p_actor_id
and t.deleted_at is null
and p.deleted_at is null
and (p_project_id is null or t.project_id = p_project_id)
and (p_types is null or 'task' = any(p_types))
and (
params.tsq @@ t.search_vector
or similarity(coalesce(t.title, ''), p_query) >= 0.2
)

union all

-- Plans
select
'plan': :text as type,
pl.id,
pl.project_id,
p.name as project_name,
pl.name as title,
ts_headline(
'english',
concat_ws(' ', coalesce(pl.name, ''), coalesce(pl.props: :text, '')),
params.tsq,
'MaxFragments=2,MinWords=5,MaxWords=18'
) as snippet,
(coalesce(ts_rank(pl.search_vector, params.tsq), 0) * 0.6) +
(similarity(coalesce(pl.name, ''), p*query) * 0.4) as score
from onto*plans pl
join params on true
left join onto_projects p on p.id = pl.project_id
where pl.created_by = p_actor_id
and pl.deleted_at is null
and p.deleted_at is null
and (p_project_id is null or pl.project_id = p_project_id)
and (p_types is null or 'plan' = any(p_types))
and (
params.tsq @@ pl.search_vector
or similarity(coalesce(pl.name, ''), p_query) >= 0.2
)

union all

-- Goals
select
'goal': :text as type,
g.id,
g.project_id,
p.name as project_name,
g.name as title,
ts_headline(
'english',
concat_ws(' ', coalesce(g.name, ''), coalesce(g.props: :text, '')),
params.tsq,
'MaxFragments=2,MinWords=5,MaxWords=18'
) as snippet,
(coalesce(ts_rank(g.search_vector, params.tsq), 0) * 0.6) +
(similarity(coalesce(g.name, ''), p*query) * 0.4) as score
from onto*goals g
join params on true
left join onto_projects p on p.id = g.project_id
where g.created_by = p_actor_id
and g.deleted_at is null
and p.deleted_at is null
and (p_project_id is null or g.project_id = p_project_id)
and (p_types is null or 'goal' = any(p_types))
and (
params.tsq @@ g.search_vector
or similarity(coalesce(g.name, ''), p_query) >= 0.2
)

union all

-- Milestones
select
'milestone': :text as type,
m.id,
m.project_id,
p.name as project_name,
m.title as title,
ts_headline(
'english',
concat_ws(' ', coalesce(m.title, ''), coalesce(m.props: :text, '')),
params.tsq,
'MaxFragments=2,MinWords=5,MaxWords=18'
) as snippet,
(coalesce(ts_rank(m.search_vector, params.tsq), 0) * 0.6) +
(similarity(coalesce(m.title, ''), p*query) * 0.4) as score
from onto*milestones m
join params on true
left join onto_projects p on p.id = m.project_id
where m.created_by = p_actor_id
and m.deleted_at is null
and p.deleted_at is null
and (p_project_id is null or m.project_id = p_project_id)
and (p_types is null or 'milestone' = any(p_types))
and (
params.tsq @@ m.search_vector
or similarity(coalesce(m.title, ''), p_query) >= 0.2
)

union all

-- Documents
select
'document': :text as type,
d.id,
d.project_id,
p.name as project_name,
d.title as title,
ts_headline(
'english',
concat_ws(' ', coalesce(d.title, ''), coalesce(d.props: :text, '')),
params.tsq,
'MaxFragments=2,MinWords=5,MaxWords=18'
) as snippet,
(coalesce(ts_rank(d.search_vector, params.tsq), 0) * 0.6) +
(similarity(coalesce(d.title, ''), p*query) * 0.4) as score
from onto*documents d
join params on true
left join onto_projects p on p.id = d.project_id
where d.created_by = p_actor_id
and d.deleted_at is null
and p.deleted_at is null
and (p_project_id is null or d.project_id = p_project_id)
and (p_types is null or 'document' = any(p_types))
and (
params.tsq @@ d.search_vector
or similarity(coalesce(d.title, ''), p_query) >= 0.2
)

union all

-- Outputs
select
'output': :text as type,
o.id,
o.project_id,
p.name as project_name,
o.name as title,
ts_headline(
'english',
concat_ws(' ', coalesce(o.name, ''), coalesce(o.props: :text, '')),
params.tsq,
'MaxFragments=2,MinWords=5,MaxWords=18'
) as snippet,
(coalesce(ts_rank(o.search_vector, params.tsq), 0) * 0.6) +
(similarity(coalesce(o.name, ''), p*query) * 0.4) as score
from onto*outputs o
join params on true
left join onto_projects p on p.id = o.project_id
where o.created_by = p_actor_id
and o.deleted_at is null
and p.deleted_at is null
and (p_project_id is null or o.project_id = p_project_id)
and (p_types is null or 'output' = any(p_types))
and (
params.tsq @@ o.search_vector
or similarity(coalesce(o.name, ''), p_query) >= 0.2
)

union all

-- Requirements
select
'requirement': :text as type,
r.id,
r.project_id,
p.name as project_name,
r.\"text\" as title,
ts_headline(
'english',
concat_ws(' ', coalesce(r.\"text\", ''), coalesce(r.props::text, '')),
params.tsq,
'MaxFragments=2,MinWords=5,MaxWords=18'
) as snippet,
(coalesce(ts_rank(r.search_vector, params.tsq), 0) * 0.6) +
(similarity(coalesce(r.\"text\", ''), p*query) * 0.4) as score
from onto*requirements r
join params on true
left join onto_projects p on p.id = r.project_id
where r.created_by = p_actor_id
and r.deleted_at is null
and p.deleted_at is null
and (p_project_id is null or r.project_id = p_project_id)
and (p_types is null or 'requirement' = any(p_types))
and (
params.tsq @@ r.search_vector
or similarity(coalesce(r.\"text\", ''), p_query) >= 0.2
)
) as results
order by score desc
limit v_limit;
end;
$function$
"
},
{
"args": "",
"name": "prevent_privilege_escalation",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.prevent_privilege_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
-- Check if is_admin field is being changed
IF OLD.is_admin IS DISTINCT FROM NEW.is_admin THEN
-- Check if the user making the change is an admin (using is_admin function to avoid recursion)
IF NOT is_admin(auth.uid()) THEN
RAISE EXCEPTION 'Cannot modify is_admin field. Only administrators can change user privileges.';
END IF;
END IF;

RETURN NEW;
END;
$function$
"
},
{
"args": "p_user_id uuid, p_phone_number text, p_message text, p_priority sms_priority, p_scheduled_for timestamp with time zone, p_metadata jsonb",
"name": "queue_sms_message",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.queue_sms_message(p_user_id uuid, p_phone_number text, p_message text, p_priority sms_priority DEFAULT 'normal'::sms_priority, p_scheduled_for timestamp with time zone DEFAULT NULL::timestamp with time zone, p_metadata jsonb DEFAULT '{}'::jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
v_message_id UUID;
v_job_id UUID;
v_queue_priority INTEGER;
BEGIN
-- Convert priority to numeric value for queue
v_queue_priority := CASE p_priority
WHEN 'urgent' THEN 1
WHEN 'high' THEN 5
WHEN 'normal' THEN 10
WHEN 'low' THEN 20
END;

-- Create SMS message record
INSERT INTO sms_messages (
user_id,
phone_number,
message_content,
priority,
scheduled_for,
metadata,
status
) VALUES (
p_user_id,
p_phone_number,
p_message,
p_priority,
p_scheduled_for,
p_metadata,
CASE
WHEN p_scheduled_for IS NOT NULL AND p_scheduled_for > NOW()
THEN 'scheduled': :sms_status
ELSE 'pending': :sms_status
END
) RETURNING id INTO v_message_id;

-- Queue the job if it should be sent now or soon
IF p_scheduled_for IS NULL OR p_scheduled_for <= NOW() + INTERVAL '5 minutes' THEN
-- Use existing add_queue_job function
v_job_id := add_queue_job(
p_user_id := p_user_id,
p_job_type := 'send_sms',
p_metadata := jsonb_build_object(
'message_id', v_message_id,
'phone_number', p_phone_number,
'message', p_message,
'priority', p_priority
),
p_scheduled_for := COALESCE(p_scheduled_for, NOW()),
p_priority := v_queue_priority
);

-- Update message with queue job reference
UPDATE sms_messages
SET queue_job_id = v_job_id, status = 'queued': :sms_status
WHERE id = v_message_id;
END IF;

RETURN v_message_id;
END;
$function$
"
},
{
"args": "p_metric_date date, p_metric_hour integer, p_user_id uuid, p_metric_type text, p_metric_value numeric, p_metadata jsonb",
"name": "record_sms_metric",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.record_sms_metric(p_metric_date date, p_metric_hour integer, p_user_id uuid, p_metric_type text, p_metric_value numeric, p_metadata jsonb DEFAULT '{}'::jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
-- Atomic upsert: insert or increment existing value
INSERT INTO sms_metrics (
metric_date,
metric_hour,
user_id,
metric_type,
metric_value,
metadata,
created_at,
updated_at
)
VALUES (
p_metric_date,
p_metric_hour,
p_user_id,
p_metric_type,
p_metric_value,
p_metadata,
NOW(),
NOW()
)
ON CONFLICT (metric_date, metric_hour, user_id, metric_type)
DO UPDATE SET
-- Increment metric value (works for both counters and sum-based averages)
metric_value = sms_metrics.metric_value + EXCLUDED.metric_value,
-- Merge metadata (new keys added, existing preserved)
metadata = sms_metrics.metadata || EXCLUDED.metadata,
-- Update timestamp
updated_at = NOW();

EXCEPTION
WHEN OTHERS THEN
-- Log error but don't fail (metrics should never block core functionality)
RAISE WARNING 'Error recording SMS metric: % (type: %, user: %)', SQLERRM, p_metric_type, p_user_id;
END;
$function$
"
},
{
"args": "",
"name": "refresh_sms_metrics_daily",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.refresh_sms_metrics_daily()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
-- CONCURRENTLY allows queries during refresh (requires unique index)
REFRESH MATERIALIZED VIEW CONCURRENTLY sms_metrics_daily;

EXCEPTION
WHEN OTHERS THEN
-- Log error but don't fail (monitoring infrastructure should be resilient)
RAISE WARNING 'Error refreshing sms_metrics_daily materialized view: %', SQLERRM;
END;
$function$
"
},
{
"args": "",
"name": "refresh_user_migration_stats",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.refresh_user_migration_stats()
RETURNS TABLE(refreshed boolean, duration_ms integer, row_count integer)
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
start_time TIMESTAMPTZ;
end_time TIMESTAMPTZ;
rows_count INTEGER;
BEGIN
start_time := clock_timestamp();

REFRESH MATERIALIZED VIEW CONCURRENTLY user_migration_stats;

end_time := clock_timestamp();

SELECT COUNT(*) INTO rows*count FROM user_migration_stats;

RETURN QUERY SELECT
true AS refreshed,
EXTRACT(MILLISECONDS FROM (end_time - start_time)): :INTEGER AS duration_ms,
rows_count AS row_count;
END;
$function$
"
},
{
"args": "p_run_id uuid",
"name": "release_migration_platform_lock",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.release_migration_platform_lock(p_run_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
v_released BOOLEAN;
BEGIN
UPDATE migration_platform_lock
SET
run_id = NULL,
locked_by = NULL,
locked_at = NULL,
expires_at = NULL
WHERE id = 1 AND run_id = p_run_id;

RETURN FOUND;
END;
$function$
"
},
{
"args": "p_project_id uuid, p_phase_updates jsonb, p_clear_task_dates boolean, p_affected_task_ids uuid[]",
"name": "reorder_phases_with_tasks",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.reorder_phases_with_tasks(p_project_id uuid, p_phase_updates jsonb, p_clear_task_dates boolean DEFAULT false, p_affected_task_ids uuid[] DEFAULT NULL::uuid[])
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$\r
DECLARE\r
v_result JSONB;\r
v_phase_count INTEGER;\r
v_task_count INTEGER := 0;\r
BEGIN\r
-- Start transaction implicitly\r
\r
-- Update phase orders\r
WITH updated_phases AS (\r
SELECT * FROM batch*update_phase_orders(p_project_id, p_phase_updates)\r
)\r
SELECT COUNT(*) INTO v*phase_count FROM updated_phases;\r
\r
-- Clear task dates if requested\r
IF p_clear_task_dates AND p_affected_task_ids IS NOT NULL THEN\r
-- Clear task start dates\r
UPDATE tasks\r
SET \r
start_date = NULL,\r
updated_at = NOW()\r
WHERE id = ANY(p_affected_task_ids)\r
AND project_id = p_project_id;\r
\r
GET DIAGNOSTICS v_task_count = ROW_COUNT;\r
\r
-- Update phase task assignments\r
UPDATE phase_tasks pt\r
SET \r
suggested_start_date = NULL,\r
assignment_reason = 'Phase reordering'\r
WHERE pt.phase_id IN (\r
SELECT id FROM phases WHERE project_id = p_project_id\r
);\r
END IF;\r
\r
-- Build result\r
v_result := jsonb_build_object(\r
'success',
true,\r
'phases_updated', v_phase_count,\r
'tasks_cleared', v_task_count,\r
'timestamp', NOW()\r
);\r
\r
RETURN v_result;\r
END;\r
$function$
"
},
{
"args": "p_stall_timeout text",
"name": "reset_stalled_jobs",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.reset_stalled_jobs(p_stall_timeout text DEFAULT '5 minutes'::text)
RETURNS integer
LANGUAGE plpgsql
AS $function$
DECLARE
v_reset_count INTEGER;
BEGIN
UPDATE queue_jobs
SET
status = 'pending',
started_at = NULL,
updated_at = NOW()
WHERE status = 'processing'
AND started_at < NOW() - p_stall_timeout: :INTERVAL;

GET DIAGNOSTICS v_reset_count = ROW_COUNT;

IF v_reset_count > 0 THEN
RAISE NOTICE 'Reset % stalled jobs', v_reset_count;
END IF;

RETURN v_reset_count;
END;
$function$
"
},
{
"args": "",
"name": "save_project_version",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.save_project_version()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
next_version INTEGER;
existing_count INTEGER;
BEGIN
-- Prevent recursion from cleanup function
IF current_setting('app.skip_history_trigger', TRUE) = 'true' THEN
RETURN COALESCE(NEW, OLD);
END IF;

-- Handle INSERT operations (create initial version)
IF TG_OP = 'INSERT' THEN
-- Use advisory lock based on project_id to prevent race conditions for this specific project
PERFORM pg_advisory_xact_lock(hashtext(NEW.id: :text));

-- Use COALESCE with MAX to handle empty table case
SELECT COALESCE(MAX(version_number), 0) + 1
INTO next_version
FROM projects_history
WHERE project_id = NEW.id;

INSERT INTO projects_history (
project_id,
version_number,
is_first_version,
project_data,
created_by
) VALUES (
NEW.id,
next_version,
(next_version = 1), -- TRUE if this is version 1, FALSE otherwise
row_to_json(NEW): :jsonb,
NEW.user_id
);

-- Handle UPDATE operations (create new version with updated data)
ELSIF TG_OP = 'UPDATE' THEN
-- Only save if there are actual changes in the data
IF row_to_json(OLD): :jsonb != row_to_json(NEW): :jsonb THEN
-- Use advisory lock based on project_id to prevent race conditions for this specific project
PERFORM pg_advisory_xact_lock(hashtext(NEW.id: :text));

-- Use atomic increment without FOR UPDATE
SELECT COALESCE(MAX(version_number), 0) + 1
INTO next_version
FROM projects_history
WHERE project_id = NEW.id;

INSERT INTO projects_history (
project_id,
version_number,
is_first_version,
project_data,
created_by
) VALUES (
NEW.id,
next_version,
FALSE, -- Updates are never first version
row_to_json(NEW): :jsonb,
NEW.user_id
);

-- Get count for cleanup check (after insert to ensure accurate count)
SELECT COUNT(*)
INTO existing*count
FROM projects_history
WHERE project_id = NEW.id;

-- Clean up history (with recursion protection)
IF existing_count > 5 THEN
PERFORM set_config('app.skip_history_trigger', 'true', TRUE);
PERFORM cleanup_project_history(NEW.id);
PERFORM set_config('app.skip_history_trigger', 'false', TRUE);
END IF;
END IF;
END IF;

RETURN COALESCE(NEW, OLD);
END;
$function$
"
},
{
"args": "search_query text, current_user_id uuid, items_per_category integer",
"name": "search_all_content",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.search_all_content(search_query text, current_user_id uuid, items_per_category integer DEFAULT 5)
RETURNS TABLE(item_type text, item_id uuid, title text, description text, tags text[], status text, project_id uuid, created_at timestamp with time zone, updated_at timestamp with time zone, relevance_score double precision, is_completed boolean, is_deleted boolean, matched_fields text[])
LANGUAGE plpgsql
AS $function$
DECLARE
normalized_query text;
BEGIN
-- Normalize the search query
normalized_query := lower(unaccent(trim(search_query)));

RETURN QUERY
WITH
-- Search Brain Dumps
brain_dump_results AS (
SELECT
'braindump': :text as item_type,
bd.id as item_id,
bd.title: :text as title,
COALESCE(
LEFT(bd.ai_summary,
200),
LEFT(bd.content, 200)
): :text as description,
bd.tags as tags,
bd.status: :text as status,
bd.project_id as project_id,
bd.created_at,
bd.updated_at,
-- Calculate relevance score with weighted fields
(
COALESCE(similarity(bd.title, normalized_query) * 3, 0) +
COALESCE(similarity(bd.content, normalized*query) * 2, 0) +
COALESCE(similarity(bd.ai*summary, normalized_query) * 2, 0) +
COALESCE(similarity(bd.ai*insights, normalized_query) * 1.5, 0) +
CASE WHEN bd.tags @> ARRAY[normalized_query
] THEN 2 ELSE 0 END +
-- Status penalties for brain dumps
CASE bd.status: :text
WHEN 'pending' THEN 0.3
WHEN 'parsed' THEN 0.5
WHEN 'saved' THEN 0.5
WHEN 'parsed*and_deleted' THEN -0.5
ELSE 0
END +
-- Recency boost (items from last 7 days get a boost)
CASE
WHEN bd.created_at > NOW() - INTERVAL '7 days' THEN 0.5
WHEN bd.created_at > NOW() - INTERVAL '30 days' THEN 0.2
ELSE 0
END
) as relevance_score,
false as is_completed,
CASE WHEN bd.status = 'parsed_and_deleted' THEN true ELSE false END as is_deleted,
-- Track which fields matched
ARRAY_REMOVE(ARRAY[
CASE WHEN bd.title ILIKE '%' || normalized_query || '%' THEN 'title' END,
CASE WHEN bd.content ILIKE '%' || normalized_query || '%' THEN 'content' END,
CASE WHEN bd.ai_summary ILIKE '%' || normalized_query || '%' THEN 'summary' END,
CASE WHEN bd.ai_insights ILIKE '%' || normalized_query || '%' THEN 'insights' END,
CASE WHEN bd.tags @> ARRAY[normalized_query
] THEN 'tags' END
], NULL) as matched_fields
FROM brain_dumps bd
WHERE
bd.user_id = current_user_id
AND (
bd.title ILIKE '%' || normalized_query || '%'
OR bd.content ILIKE '%' || normalized_query || '%'
OR bd.ai_summary ILIKE '%' || normalized_query || '%'
OR bd.ai_insights ILIKE '%' || normalized_query || '%'
OR bd.tags @> ARRAY[normalized_query
]
-- Fuzzy matching with similarity threshold
OR similarity(bd.title, normalized_query) > 0.2
OR similarity(bd.content, normalized_query) > 0.2
OR similarity(bd.ai_summary, normalized_query) > 0.2
)
ORDER BY relevance_score DESC, bd.created_at DESC
LIMIT items_per_category
),

-- Search Projects
project_results AS (
SELECT
'project': :text as item_type,
p.id as item_id,
p.name: :text as title,
COALESCE(
LEFT(p.description,
200),
LEFT(p.executive_summary,
200),
LEFT(p.context, 200)
): :text as description,
p.tags as tags,
p.status: :text as status,
p.id as project_id,
p.created_at,
p.updated_at,
-- Calculate relevance score with weighted fields
(
COALESCE(similarity(p.name, normalized_query) * 3, 0) +
COALESCE(similarity(p.description, normalized*query) * 2, 0) +
COALESCE(similarity(p.executive*summary, normalized_query) * 1.5, 0) +
COALESCE(similarity(p.context, normalized*query) * 1, 0) +
CASE WHEN p.tags @> ARRAY[normalized_query
] THEN 2 ELSE 0 END +
-- Status penalties for projects
CASE p.status: :text
WHEN 'active' THEN 0.5
WHEN 'paused' THEN 0
WHEN 'completed' THEN -0.5
WHEN 'archived' THEN -1
ELSE 0
END +
-- Recency boost
CASE
WHEN p.updated*at > NOW() - INTERVAL '7 days' THEN 0.5
WHEN p.updated_at > NOW() - INTERVAL '30 days' THEN 0.2
ELSE 0
END
) as relevance_score,
CASE WHEN p.status = 'completed' THEN true ELSE false END as is_completed,
CASE WHEN p.status = 'archived' THEN true ELSE false END as is_deleted,
ARRAY_REMOVE(ARRAY[
CASE WHEN p.name ILIKE '%' || normalized_query || '%' THEN 'name' END,
CASE WHEN p.description ILIKE '%' || normalized_query || '%' THEN 'description' END,
CASE WHEN p.executive_summary ILIKE '%' || normalized_query || '%' THEN 'summary' END,
CASE WHEN p.context ILIKE '%' || normalized_query || '%' THEN 'context' END,
CASE WHEN p.tags @> ARRAY[normalized_query
] THEN 'tags' END
], NULL) as matched_fields
FROM projects p
WHERE
p.user_id = current_user_id
AND (
p.name ILIKE '%' || normalized_query || '%'
OR p.description ILIKE '%' || normalized_query || '%'
OR p.executive_summary ILIKE '%' || normalized_query || '%'
OR p.context ILIKE '%' || normalized_query || '%'
OR p.tags @> ARRAY[normalized_query
]
OR similarity(p.name, normalized_query) > 0.2
OR similarity(p.description, normalized_query) > 0.2
OR similarity(p.executive_summary, normalized_query) > 0.2
)
ORDER BY relevance_score DESC, p.updated_at DESC
LIMIT items_per_category
),

-- Search Tasks
task_results AS (
SELECT
'task': :text as item_type,
t.id as item_id,
t.title: :text as title,
COALESCE(
LEFT(t.description,
200),
LEFT(t.details,
200),
LEFT(t.task_steps, 200)
): :text as description,
NULL: :text[] as tags,
t.status: :text as status,
t.project_id as project_id,
t.created_at,
t.updated_at,
-- Calculate relevance score with weighted fields
(
COALESCE(similarity(t.title, normalized_query) * 3, 0) +
COALESCE(similarity(t.description, normalized*query) * 2, 0) +
COALESCE(similarity(t.details, normalized*query) * 1.5, 0) +
COALESCE(similarity(t.task*steps, normalized_query) * 1, 0) +
-- Priority boost
CASE t.priority: :text
WHEN 'high' THEN 0.5
WHEN 'medium' THEN 0.2
WHEN 'low' THEN 0
ELSE 0
END +
-- Status adjustments for tasks
CASE t.status: :text
WHEN 'backlog' THEN 0.3
WHEN 'in*progress' THEN 0.7
WHEN 'done' THEN -0.5
WHEN 'blocked' THEN 0.1
ELSE 0
END +
-- Recency boost
CASE
WHEN t.updated_at > NOW() - INTERVAL '7 days' THEN 0.5
WHEN t.updated_at > NOW() - INTERVAL '30 days' THEN 0.2
ELSE 0
END
) as relevance_score,
CASE WHEN t.status = 'done' THEN true ELSE false END as is_completed,
CASE WHEN t.deleted_at IS NOT NULL THEN true ELSE false END as is_deleted,
ARRAY_REMOVE(ARRAY[
CASE WHEN t.title ILIKE '%' || normalized_query || '%' THEN 'title' END,
CASE WHEN t.description ILIKE '%' || normalized_query || '%' THEN 'description' END,
CASE WHEN t.details ILIKE '%' || normalized_query || '%' THEN 'details' END,
CASE WHEN t.task_steps ILIKE '%' || normalized_query || '%' THEN 'steps' END
], NULL) as matched_fields
FROM tasks t
WHERE
t.user_id = current_user_id
AND (
t.title ILIKE '%' || normalized_query || '%'
OR t.description ILIKE '%' || normalized_query || '%'
OR t.details ILIKE '%' || normalized_query || '%'
OR t.task_steps ILIKE '%' || normalized_query || '%'
OR similarity(t.title, normalized_query) > 0.2
OR similarity(t.description, normalized_query) > 0.2
OR similarity(t.details, normalized_query) > 0.2
)
ORDER BY relevance_score DESC, t.updated_at DESC
LIMIT items_per_category
)

-- Combine all results
SELECT * FROM brain*dump_results
UNION ALL
SELECT * FROM project*results
UNION ALL
SELECT * FROM task*results
ORDER BY item_type, relevance_score DESC;
END;
$function$
"
},
{
"args": "query_embedding vector, similarity_threshold double precision",
"name": "search_all_similar",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.search_all_similar(query_embedding vector, similarity_threshold double precision DEFAULT 0.8)
RETURNS TABLE(table_name text, id uuid, content text, similarity double precision)
LANGUAGE plpgsql
AS $function$\r
BEGIN\r
RETURN QUERY\r
-- Search projects\r
SELECT 'projects': :text, p.id, p.name: :text,
1 - (p.embedding <=> query_embedding)\r
FROM projects p\r
WHERE p.embedding IS NOT NULL\r
AND 1 - (p.embedding <=> query_embedding) > similarity_threshold\r
\r
UNION ALL\r
\r
-- Search tasks\r
SELECT 'tasks': :text, t.id, t.title: :text,
1 - (t.embedding <=> query_embedding)\r
FROM tasks t\r
WHERE t.embedding IS NOT NULL\r
AND 1 - (t.embedding <=> query_embedding) > similarity_threshold\r
\r
UNION ALL\r
\r
-- Search goals\r
SELECT 'goals': :text, g.id, g.title: :text,
1 - (g.embedding <=> query_embedding)\r
FROM goals g\r
WHERE g.embedding IS NOT NULL\r
AND 1 - (g.embedding <=> query_embedding) > similarity_threshold\r
\r
UNION ALL\r
\r
-- Search notes\r
SELECT 'notes': :text, n.id, n.title: :text,
1 - (n.embedding <=> query_embedding)\r
FROM notes n\r
WHERE n.embedding IS NOT NULL\r
AND 1 - (n.embedding <=> query_embedding) > similarity_threshold\r
\r
ORDER BY 4 DESC; -- Order by similarity\r
END;\r
$function$
"
},
{
"args": "search_query text, current_user_id uuid, search_type text, page_offset integer, page_limit integer",
"name": "search_by_type",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.search_by_type(search_query text, current_user_id uuid, search_type text, page_offset integer DEFAULT 0, page_limit integer DEFAULT 20)
RETURNS TABLE(item_id uuid, title text, description text, tags text[], status text, project_id uuid, created_at timestamp with time zone, updated_at timestamp with time zone, relevance_score double precision, is_completed boolean, is_deleted boolean, matched_fields text[])
LANGUAGE plpgsql
AS $function$
DECLARE
normalized_query text;
BEGIN
normalized_query := lower(unaccent(trim(search_query)));

IF search_type = 'braindump' THEN
RETURN QUERY
SELECT
bd.id as item_id,
bd.title: :text as title,
COALESCE(LEFT(bd.ai_summary,
200), LEFT(bd.content,
200)): :text as description,
bd.tags as tags,
bd.status: :text as status,
bd.project_id as project_id,
bd.created_at,
bd.updated_at,
(
COALESCE(similarity(bd.title, normalized_query) * 3, 0) +
COALESCE(similarity(bd.content, normalized*query) * 2, 0) +
COALESCE(similarity(bd.ai*summary, normalized_query) * 2, 0) +
COALESCE(similarity(bd.ai*insights, normalized_query) * 1.5, 0) +
CASE WHEN bd.tags @> ARRAY[normalized_query
] THEN 2 ELSE 0 END +
CASE bd.status: :text
WHEN 'pending' THEN 0.3
WHEN 'parsed' THEN 0.5
WHEN 'saved' THEN 0.5
WHEN 'parsed*and_deleted' THEN -0.5
ELSE 0
END +
CASE
WHEN bd.created_at > NOW() - INTERVAL '7 days' THEN 0.5
WHEN bd.created_at > NOW() - INTERVAL '30 days' THEN 0.2
ELSE 0
END
) as relevance_score,
false as is_completed,
CASE WHEN bd.status = 'parsed_and_deleted' THEN true ELSE false END as is_deleted,
ARRAY_REMOVE(ARRAY[
CASE WHEN bd.title ILIKE '%' || normalized_query || '%' THEN 'title' END,
CASE WHEN bd.content ILIKE '%' || normalized_query || '%' THEN 'content' END,
CASE WHEN bd.ai_summary ILIKE '%' || normalized_query || '%' THEN 'summary' END,
CASE WHEN bd.ai_insights ILIKE '%' || normalized_query || '%' THEN 'insights' END,
CASE WHEN bd.tags @> ARRAY[normalized_query
] THEN 'tags' END
], NULL) as matched_fields
FROM brain_dumps bd
WHERE
bd.user_id = current_user_id
AND (
bd.title ILIKE '%' || normalized_query || '%'
OR bd.content ILIKE '%' || normalized_query || '%'
OR bd.ai_summary ILIKE '%' || normalized_query || '%'
OR bd.ai_insights ILIKE '%' || normalized_query || '%'
OR bd.tags @> ARRAY[normalized_query
]
OR similarity(bd.title, normalized_query) > 0.2
OR similarity(bd.content, normalized_query) > 0.2
OR similarity(bd.ai_summary, normalized_query) > 0.2
)
ORDER BY relevance_score DESC, bd.created_at DESC
OFFSET page_offset
LIMIT page_limit;

ELSIF search_type = 'project' THEN
RETURN QUERY
SELECT
p.id as item_id,
p.name: :text as title,
COALESCE(LEFT(p.description,
200), LEFT(p.executive_summary,
200)): :text as description,
p.tags as tags,
p.status: :text as status,
p.id as project_id,
p.created_at,
p.updated_at,
(
COALESCE(similarity(p.name, normalized_query) * 3, 0) +
COALESCE(similarity(p.description, normalized*query) * 2, 0) +
COALESCE(similarity(p.executive*summary, normalized_query) * 1.5, 0) +
COALESCE(similarity(p.context, normalized*query) * 1, 0) +
CASE WHEN p.tags @> ARRAY[normalized_query
] THEN 2 ELSE 0 END +
CASE p.status: :text
WHEN 'active' THEN 0.5
WHEN 'paused' THEN 0
WHEN 'completed' THEN -0.5
WHEN 'archived' THEN -1
ELSE 0
END +
CASE
WHEN p.updated*at > NOW() - INTERVAL '7 days' THEN 0.5
WHEN p.updated_at > NOW() - INTERVAL '30 days' THEN 0.2
ELSE 0
END
) as relevance_score,
CASE WHEN p.status = 'completed' THEN true ELSE false END as is_completed,
CASE WHEN p.status = 'archived' THEN true ELSE false END as is_deleted,
ARRAY_REMOVE(ARRAY[
CASE WHEN p.name ILIKE '%' || normalized_query || '%' THEN 'name' END,
CASE WHEN p.description ILIKE '%' || normalized_query || '%' THEN 'description' END,
CASE WHEN p.executive_summary ILIKE '%' || normalized_query || '%' THEN 'summary' END,
CASE WHEN p.context ILIKE '%' || normalized_query || '%' THEN 'context' END,
CASE WHEN p.tags @> ARRAY[normalized_query
] THEN 'tags' END
], NULL) as matched_fields
FROM projects p
WHERE
p.user_id = current_user_id
AND (
p.name ILIKE '%' || normalized_query || '%'
OR p.description ILIKE '%' || normalized_query || '%'
OR p.executive_summary ILIKE '%' || normalized_query || '%'
OR p.context ILIKE '%' || normalized_query || '%'
OR p.tags @> ARRAY[normalized_query
]
OR similarity(p.name, normalized_query) > 0.2
OR similarity(p.description, normalized_query) > 0.2
OR similarity(p.executive_summary, normalized_query) > 0.2
)
ORDER BY relevance_score DESC, p.updated_at DESC
OFFSET page_offset
LIMIT page_limit;

ELSIF search_type = 'task' THEN
RETURN QUERY
SELECT
t.id as item_id,
t.title: :text as title,
COALESCE(LEFT(t.description,
200), LEFT(t.details,
200)): :text as description,
NULL: :text[] as tags,
t.status: :text as status,
t.project_id as project_id,
t.created_at,
t.updated_at,
(
COALESCE(similarity(t.title, normalized_query) * 3, 0) +
COALESCE(similarity(t.description, normalized*query) * 2, 0) +
COALESCE(similarity(t.details, normalized*query) * 1.5, 0) +
COALESCE(similarity(t.task*steps, normalized_query) * 1, 0) +
CASE t.priority: :text
WHEN 'high' THEN 0.5
WHEN 'medium' THEN 0.2
WHEN 'low' THEN 0
ELSE 0
END +
CASE t.status: :text
WHEN 'backlog' THEN 0.3
WHEN 'in*progress' THEN 0.7
WHEN 'done' THEN -0.5
WHEN 'blocked' THEN 0.1
ELSE 0
END +
CASE
WHEN t.updated_at > NOW() - INTERVAL '7 days' THEN 0.5
WHEN t.updated_at > NOW() - INTERVAL '30 days' THEN 0.2
ELSE 0
END
) as relevance_score,
CASE WHEN t.status = 'done' THEN true ELSE false END as is_completed,
CASE WHEN t.deleted_at IS NOT NULL THEN true ELSE false END as is_deleted,
ARRAY_REMOVE(ARRAY[
CASE WHEN t.title ILIKE '%' || normalized_query || '%' THEN 'title' END,
CASE WHEN t.description ILIKE '%' || normalized_query || '%' THEN 'description' END,
CASE WHEN t.details ILIKE '%' || normalized_query || '%' THEN 'details' END,
CASE WHEN t.task_steps ILIKE '%' || normalized_query || '%' THEN 'steps' END
], NULL) as matched_fields
FROM tasks t
WHERE
t.user_id = current_user_id
AND (
t.title ILIKE '%' || normalized_query || '%'
OR t.description ILIKE '%' || normalized_query || '%'
OR t.details ILIKE '%' || normalized_query || '%'
OR t.task_steps ILIKE '%' || normalized_query || '%'
OR similarity(t.title, normalized_query) > 0.2
OR similarity(t.description, normalized_query) > 0.2
OR similarity(t.details, normalized_query) > 0.2
)
ORDER BY relevance_score DESC, t.updated_at DESC
OFFSET page_offset
LIMIT page_limit;
END IF;
END;
$function$
"
},
{
"args": "table_name text, query_embedding vector, similarity_threshold double precision, match_count integer",
"name": "search_similar_items",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.search_similar_items(table_name text, query_embedding vector, similarity_threshold double precision DEFAULT 0.8, match_count integer DEFAULT 5)
RETURNS TABLE(id uuid, content text, similarity double precision)
LANGUAGE plpgsql
AS $function$\r
BEGIN\r
IF table_name = 'projects' THEN\r
RETURN QUERY\r
SELECT p.id, p.name: :text,
1 - (p.embedding <=> query_embedding) as similarity\r
FROM projects p\r
WHERE p.embedding IS NOT NULL\r
AND 1 - (p.embedding <=> query_embedding) > similarity_threshold\r
ORDER BY p.embedding <=> query_embedding\r
LIMIT match_count;\r
ELSIF table_name = 'tasks' THEN\r
RETURN QUERY\r
SELECT t.id, t.title: :text,
1 - (t.embedding <=> query_embedding) as similarity\r
FROM tasks t\r
WHERE t.embedding IS NOT NULL\r
AND 1 - (t.embedding <=> query_embedding) > similarity_threshold\r
ORDER BY t.embedding <=> query_embedding\r
LIMIT match_count;\r
-- Add more table cases as needed\r
END IF;\r
END;\r
$function$
"
},
{
"args": "real",
"name": "set_limit",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.set_limit(real)
RETURNS real
LANGUAGE c
STRICT
AS '$libdir/pg_trgm', $function$set_limit$function$
"
},
{
"args": "",
"name": "set_project_log_actor",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.set_project_log_actor()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
IF NEW.changed_by_actor_id IS NULL THEN
NEW.changed_by_actor_id := current_actor_id();
END IF;

IF NEW.changed_by_actor_id IS NULL AND NEW.changed_by IS NOT NULL THEN
SELECT id INTO NEW.changed_by_actor_id
FROM onto_actors
WHERE user_id = NEW.changed_by;
END IF;

RETURN NEW;
END;
$function$
"
},
{
"args": "",
"name": "set_updated_at",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
begin
new.updated_at = now();
return new;
end$function$
"
},
{
"args": "",
"name": "set_user_trial_period",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.set_user_trial_period()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
v_trial_days INTEGER;
BEGIN
-- Get trial days from environment or use default
v_trial_days := COALESCE(
current_setting('app.trial_days', true): :INTEGER,
14
);

-- Set trial end date and subscription status for new users
IF NEW.subscription_status IS NULL OR NEW.subscription_status = 'free' THEN
NEW.subscription_status := 'trialing';
NEW.trial_ends_at := NOW() + (v_trial_days || ' days'): :INTERVAL;
END IF;

RETURN NEW;
END;
$function$
"
},
{
"args": "",
"name": "show_limit",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.show_limit()
RETURNS real
LANGUAGE c
STABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$show_limit$function$
"
},
{
"args": "text",
"name": "show_trgm",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.show_trgm(text)
RETURNS text[]
LANGUAGE c
IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$show_trgm$function$
"
},
{
"args": "text, text",
"name": "similarity",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.similarity(text, text)
RETURNS real
LANGUAGE c
IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$similarity$function$
"
},
{
"args": "text, text",
"name": "similarity_dist",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.similarity_dist(text, text)
RETURNS real
LANGUAGE c
IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$similarity_dist$function$
"
},
{
"args": "text, text",
"name": "similarity_op",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.similarity_op(text, text)
RETURNS boolean
LANGUAGE c
STABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$similarity_op$function$
"
},
{
"args": "p_project_id uuid",
"name": "soft_delete_onto_project",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.soft_delete_onto_project(p_project_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $function$
DECLARE
v_now TIMESTAMPTZ := now();
BEGIN
IF p_project_id IS NULL THEN
RAISE EXCEPTION 'Project ID required';
END IF;

-- Soft delete all child entities that support soft delete
-- Note: Not all child tables have deleted_at columns, so we only update those that do

-- Soft delete tasks
UPDATE onto_tasks
SET deleted_at = v_now, updated_at = v_now
WHERE project_id = p_project_id AND deleted_at IS NULL;

-- Soft delete plans
UPDATE onto_plans
SET deleted_at = v_now, updated_at = v_now
WHERE project_id = p_project_id AND deleted_at IS NULL;

-- Soft delete goals
UPDATE onto_goals
SET deleted_at = v_now, updated_at = v_now
WHERE project_id = p_project_id AND deleted_at IS NULL;

-- Soft delete documents
UPDATE onto_documents
SET deleted_at = v_now, updated_at = v_now
WHERE project_id = p_project_id AND deleted_at IS NULL;

-- Soft delete outputs
UPDATE onto_outputs
SET deleted_at = v_now, updated_at = v_now
WHERE project_id = p_project_id AND deleted_at IS NULL;

-- Soft delete milestones
UPDATE onto_milestones
SET deleted_at = v_now, updated_at = v_now
WHERE project_id = p_project_id AND deleted_at IS NULL;

-- Soft delete risks
UPDATE onto_risks
SET deleted_at = v_now, updated_at = v_now
WHERE project_id = p_project_id AND deleted_at IS NULL;

-- Soft delete decisions
UPDATE onto_decisions
SET deleted_at = v_now, updated_at = v_now
WHERE project_id = p_project_id AND deleted_at IS NULL;

-- Soft delete events
UPDATE onto_events
SET deleted_at = v_now, updated_at = v_now
WHERE project_id = p_project_id AND deleted_at IS NULL;

-- Soft delete requirements (if it has deleted_at)
UPDATE onto_requirements
SET deleted_at = v_now, updated_at = v_now
WHERE project_id = p_project_id AND deleted_at IS NULL;

-- Finally soft delete the project
UPDATE onto_projects
SET deleted_at = v_now, updated_at = v_now
WHERE id = p_project_id AND deleted_at IS NULL;
END;
$function$
"
},
{
"args": "sparsevec, integer, boolean",
"name": "sparsevec",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.sparsevec(sparsevec, integer, boolean)
RETURNS sparsevec
LANGUAGE c
IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$sparsevec$function$
"
},
{
"args": "sparsevec, sparsevec",
"name": "sparsevec_cmp",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.sparsevec_cmp(sparsevec, sparsevec)
RETURNS integer
LANGUAGE c
IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$sparsevec_cmp$function$
"
},
{
"args": "sparsevec, sparsevec",
"name": "sparsevec_eq",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.sparsevec_eq(sparsevec, sparsevec)
RETURNS boolean
LANGUAGE c
IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$sparsevec_eq$function$
"
},
{
"args": "sparsevec, sparsevec",
"name": "sparsevec_ge",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.sparsevec_ge(sparsevec, sparsevec)
RETURNS boolean
LANGUAGE c
IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$sparsevec_ge$function$
"
},
{
"args": "sparsevec, sparsevec",
"name": "sparsevec_gt",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.sparsevec_gt(sparsevec, sparsevec)
RETURNS boolean
LANGUAGE c
IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$sparsevec_gt$function$
"
},
{
"args": "cstring, oid, integer",
"name": "sparsevec_in",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.sparsevec_in(cstring, oid, integer)
RETURNS sparsevec
LANGUAGE c
IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$sparsevec_in$function$
"
},
{
"args": "sparsevec, sparsevec",
"name": "sparsevec_l2_squared_distance",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.sparsevec_l2_squared_distance(sparsevec, sparsevec)
RETURNS double precision
LANGUAGE c
IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$sparsevec_l2_squared_distance$function$
"
},
{
"args": "sparsevec, sparsevec",
"name": "sparsevec_le",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.sparsevec_le(sparsevec, sparsevec)
RETURNS boolean
LANGUAGE c
IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$sparsevec_le$function$
"
},
{
"args": "sparsevec, sparsevec",
"name": "sparsevec_lt",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.sparsevec_lt(sparsevec, sparsevec)
RETURNS boolean
LANGUAGE c
IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$sparsevec_lt$function$
"
},
{
"args": "sparsevec, sparsevec",
"name": "sparsevec_ne",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.sparsevec_ne(sparsevec, sparsevec)
RETURNS boolean
LANGUAGE c
IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$sparsevec_ne$function$
"
},
{
"args": "sparsevec, sparsevec",
"name": "sparsevec_negative_inner_product",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.sparsevec_negative_inner_product(sparsevec, sparsevec)
RETURNS double precision
LANGUAGE c
IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$sparsevec_negative_inner_product$function$
"
},
{
"args": "sparsevec",
"name": "sparsevec_out",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.sparsevec_out(sparsevec)
RETURNS cstring
LANGUAGE c
IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$sparsevec_out$function$
"
},
{
"args": "internal, oid, integer",
"name": "sparsevec_recv",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.sparsevec_recv(internal, oid, integer)
RETURNS sparsevec
LANGUAGE c
IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$sparsevec_recv$function$
"
},
{
"args": "sparsevec",
"name": "sparsevec_send",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.sparsevec_send(sparsevec)
RETURNS bytea
LANGUAGE c
IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$sparsevec_send$function$
"
},
{
"args": "sparsevec, integer, boolean",
"name": "sparsevec_to_halfvec",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.sparsevec_to_halfvec(sparsevec, integer, boolean)
RETURNS halfvec
LANGUAGE c
IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$sparsevec_to_halfvec$function$
"
},
{
"args": "sparsevec, integer, boolean",
"name": "sparsevec_to_vector",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.sparsevec_to_vector(sparsevec, integer, boolean)
RETURNS vector
LANGUAGE c
IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$sparsevec_to_vector$function$
"
},
{
"args": "cstring[]",
"name": "sparsevec_typmod_in",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.sparsevec_typmod_in(cstring[])
RETURNS integer
LANGUAGE c
IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$sparsevec_typmod_in$function$
"
},
{
"args": "p_user_id uuid, p_brief_date date, p_force_regenerate boolean",
"name": "start_or_resume_brief_generation",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.start_or_resume_brief_generation(p_user_id uuid, p_brief_date date, p_force_regenerate boolean DEFAULT false)
RETURNS TABLE(started boolean, brief_id uuid, message text)
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
v_existing_brief RECORD;
v_brief_id UUID;
v_message TEXT;
v_started BOOLEAN DEFAULT FALSE;
BEGIN
-- Lock the row for this user and date to prevent concurrent modifications
SELECT * INTO v*existing_brief
FROM daily_briefs
WHERE user_id = p_user_id AND brief_date = p_brief_date
FOR UPDATE;

-- Check if brief exists and its status
IF v_existing_brief.id IS NOT NULL THEN
-- Check if we should force regenerate
IF p_force_regenerate THEN
-- Update existing brief to restart generation
UPDATE daily_briefs
SET
generation_status = 'processing',
generation_started_at = NOW(),
generation_error = NULL,
generation_completed_at = NULL,
generation_progress = jsonb_build_object('step', 'starting', 'progress',
0),
updated_at = NOW()
WHERE id = v_existing_brief.id;

v_brief_id := v_existing_brief.id;
v_started := TRUE;
v_message := 'Brief generation restarted';
ELSIF v_existing_brief.generation_status = 'processing' THEN
-- Brief is already being processed
RAISE EXCEPTION 'P0001:Brief generation already in progress' USING HINT = 'already in progress';
ELSIF v_existing_brief.generation_status = 'completed' AND NOT p_force_regenerate THEN
-- Brief already completed and not forcing
RAISE EXCEPTION 'P0002:Brief already completed for this date' USING HINT = 'already completed';
ELSE
-- Resume a failed generation
UPDATE daily_briefs
SET
generation_status = 'processing',
generation_started_at = NOW(),
generation_error = NULL,
updated_at = NOW()
WHERE id = v_existing_brief.id;

v_brief_id := v_existing_brief.id;
v_started := TRUE;
v_message := 'Brief generation resumed';
END IF;
ELSE
-- Create new brief
INSERT INTO daily_briefs (
user_id,
brief_date,
summary_content,
generation_status,
generation_started_at,
generation_progress
)
VALUES (
p_user_id,
p_brief_date,
'',
'processing',
NOW(),
jsonb_build_object('step', 'starting', 'progress', 0)
)
RETURNING id INTO v_brief_id;

v_started := TRUE;
v_message := 'New brief generation started';
END IF;

-- Return the result
RETURN QUERY
SELECT v_started, v_brief_id, v_message;
END;
$function$
"
},
{
"args": "text, text",
"name": "strict_word_similarity",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.strict_word_similarity(text, text)
RETURNS real
LANGUAGE c
IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$strict_word_similarity$function$
"
},
{
"args": "text, text",
"name": "strict_word_similarity_commutator_op",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.strict_word_similarity_commutator_op(text, text)
RETURNS boolean
LANGUAGE c
STABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$strict_word_similarity_commutator_op$function$
"
},
{
"args": "text, text",
"name": "strict_word_similarity_dist_commutator_op",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.strict_word_similarity_dist_commutator_op(text, text)
RETURNS real
LANGUAGE c
IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$strict_word_similarity_dist_commutator_op$function$
"
},
{
"args": "text, text",
"name": "strict_word_similarity_dist_op",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.strict_word_similarity_dist_op(text, text)
RETURNS real
LANGUAGE c
IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$strict_word_similarity_dist_op$function$
"
},
{
"args": "text, text",
"name": "strict_word_similarity_op",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.strict_word_similarity_op(text, text)
RETURNS boolean
LANGUAGE c
STABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$strict_word_similarity_op$function$
"
},
{
"args": "halfvec, integer, integer",
"name": "subvector",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.subvector(halfvec, integer, integer)
RETURNS halfvec
LANGUAGE c
IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$halfvec_subvector$function$
"
},
{
"args": "vector, integer, integer",
"name": "subvector",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.subvector(vector, integer, integer)
RETURNS vector
LANGUAGE c
IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$subvector$function$
"
},
{
"args": "",
"name": "sync_legacy_mapping_from_props",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.sync_legacy_mapping_from_props()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
declare
\tlegacy_text text;
\tlegacy_id uuid;
\tmetadata jsonb;
begin
\tif TG_ARGV[
0
] is null or TG_ARGV[
1
] is null then
\t\treturn NEW;
\tend if;

\tif NEW.props is null then
\t\treturn NEW;
\tend if;

\tlegacy_text := nullif(NEW.props->>'legacy_id', '');
\tif legacy_text is null then
\t\treturn NEW;
\tend if;

\tbegin
\t\tlegacy_id := legacy_text: :uuid;
\texception
\t\twhen invalid_text_representation then
\t\t\t-- Ignore rows where legacy_id is not a valid UUID
\t\t\treturn NEW;
\tend;

\tmetadata := jsonb_build_object(
\t\t'source', 'trigger',
\t\t'table', TG_TABLE_NAME,
\t\t'operation', TG_OP
\t);

\tperform upsert_legacy_entity_mapping(TG_ARGV[
0
], legacy_id, TG_ARGV[
1
], NEW.id, metadata);

\treturn NEW;
end;
$function$
"
},
{
"args": "p_series_id uuid, p_force boolean",
"name": "task_series_delete",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.task_series_delete(p_series_id uuid, p_force boolean DEFAULT false)
RETURNS TABLE(deleted_master integer, deleted_instances integer)
LANGUAGE plpgsql
AS $function$
declare
v_deleted_instances integer := 0;
v_deleted_master integer := 0;
begin
delete from onto_tasks
where
props->>'series_id' = p_series_id
and coalesce(props->'series'->>'role', '') = 'instance'
and (p_force or state_key = 'todo');

get diagnostics v_deleted_instances = ROW_COUNT;

delete from onto_tasks
where
props->>'series_id' = p_series_id
and coalesce(props->'series'->>'role', '') = 'master';

get diagnostics v_deleted_master = ROW_COUNT;

if not p_force then
update onto_tasks
set
props = (props - 'series_id') - 'series',
updated_at = now()
where props->>'series_id' = p_series_id;
end if;

return query select coalesce(v_deleted_master,
0), coalesce(v_deleted_instances,
0);
end;
$function$
"
},
{
"args": "p_task_id uuid, p_series_id uuid, p_master_props jsonb, p_instance_rows jsonb",
"name": "task_series_enable",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.task_series_enable(p_task_id uuid, p_series_id uuid, p_master_props jsonb, p_instance_rows jsonb)
RETURNS void
LANGUAGE plpgsql
AS $function$
begin
update onto_tasks
set
props = p_master_props,
updated_at = now()
where id = p_task_id;

insert into onto_tasks (
project_id,
plan_id,
title,
state_key,
due_at,
priority,
props,
created_by
)
select
(instance->>'project_id'): :uuid,
nullif(instance->>'plan_id', ''): :uuid,
instance->>'title',
coalesce(instance->>'state_key', 'todo'),
(instance->>'due_at'): :timestamptz,
nullif(instance->>'priority', ''): :int,
coalesce(instance->'props', '{}': :jsonb),
(instance->>'created_by'): :uuid
from jsonb_array_elements(p_instance_rows) as instance;
end;
$function$
"
},
{
"args": "regdictionary, text",
"name": "unaccent",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.unaccent(regdictionary, text)
RETURNS text
LANGUAGE c
STABLE PARALLEL SAFE STRICT
AS '$libdir/unaccent', $function$unaccent_dict$function$
"
},
{
"args": "text",
"name": "unaccent",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.unaccent(text)
RETURNS text
LANGUAGE c
STABLE PARALLEL SAFE STRICT
AS '$libdir/unaccent', $function$unaccent_dict$function$
"
},
{
"args": "internal",
"name": "unaccent_init",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.unaccent_init(internal)
RETURNS internal
LANGUAGE c
PARALLEL SAFE
AS '$libdir/unaccent', $function$unaccent_init$function$
"
},
{
"args": "internal, internal, internal, internal",
"name": "unaccent_lexize",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.unaccent_lexize(internal, internal, internal, internal)
RETURNS internal
LANGUAGE c
PARALLEL SAFE
AS '$libdir/unaccent', $function$unaccent_lexize$function$
"
},
{
"args": "",
"name": "update_agent_plans_updated_at",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.update_agent_plans_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
NEW.updated_at = NOW();
RETURN NEW;
END;
$function$
"
},
{
"args": "",
"name": "update_chat_session_stats",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.update_chat_session_stats()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
IF TG_OP = 'INSERT' THEN
UPDATE chat_sessions
SET
message_count = message_count + 1,
total_tokens_used = total_tokens_used + COALESCE(NEW.total_tokens,
0),
last_message_at = NEW.created_at,
updated_at = NOW()
WHERE id = NEW.session_id;
END IF;
RETURN NEW;
END;
$function$
"
},
{
"args": "",
"name": "update_draft_tasks_updated_at",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.update_draft_tasks_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
NEW.updated_at = CURRENT_TIMESTAMP;
RETURN NEW;
END;
$function$
"
},
{
"args": "",
"name": "update_error_logs_updated_at",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.update_error_logs_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
NEW.updated_at = NOW();
RETURN NEW;
END;
$function$
"
},
{
"args": "p_user_id uuid, p_date date",
"name": "update_llm_usage_summary",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.update_llm_usage_summary(p_user_id uuid, p_date date)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$\r
DECLARE\r
v_models_breakdown JSONB;\r
v_operations_breakdown JSONB;\r
BEGIN\r
-- Build models breakdown\r
SELECT jsonb_object_agg(\r
model_used,\r
jsonb_build_object(\r
'requests', COUNT(*),\r
'cost', SUM(total*cost_usd),\r
'tokens', SUM(total_tokens)\r
)\r
)\r
INTO v_models_breakdown\r
FROM llm_usage_logs\r
WHERE user_id = p_user_id\r
AND created_at >= p_date: :timestamp\r
AND created_at < (p_date + INTERVAL '1 day'): :timestamp\r
GROUP BY model_used;\r
\r
-- Build operations breakdown\r
SELECT jsonb_object_agg(\r
operation_type: :text,\r
jsonb_build_object(\r
'requests', COUNT(*),\r
'cost', SUM(total*cost_usd),\r
'tokens', SUM(total_tokens)\r
)\r
)\r
INTO v_operations_breakdown\r
FROM llm_usage_logs\r
WHERE user_id = p_user_id\r
AND created_at >= p_date: :timestamp\r
AND created_at < (p_date + INTERVAL '1 day'): :timestamp\r
GROUP BY operation_type;\r
\r
-- Upsert summary\r
INSERT INTO llm_usage_summary (\r
user_id,\r
summary_date,\r
summary_type,\r
total_requests,\r
successful_requests,\r
failed_requests,\r
total_tokens,\r
total_prompt_tokens,\r
total_completion_tokens,\r
total_cost_usd,\r
avg_response_time_ms,\r
min_response_time_ms,\r
max_response_time_ms,\r
models_used,\r
operations_breakdown\r
)\r
SELECT\r
p_user_id,\r
p_date,\r
'daily',\r
COUNT(\*),\r
COUNT(\_) FILTER (WHERE status = 'success'),\r
COUNT(\*) FILTER (WHERE status != 'success'),\r
SUM(total_tokens),\r
SUM(prompt_tokens),\r
SUM(completion_tokens),\r
SUM(total_cost_usd),\r
AVG(response_time_ms): :INTEGER,\r
MIN(response_time_ms),\r
MAX(response_time_ms),\r
v_models_breakdown,\r
v_operations_breakdown\r
FROM llm_usage_logs\r
WHERE user_id = p_user_id\r
AND created_at >= p_date: :timestamp\r
AND created_at < (p_date + INTERVAL '1 day'): :timestamp\r
ON CONFLICT (user_id, summary_date, summary_type)\r
DO UPDATE SET\r
total_requests = EXCLUDED.total_requests,\r
successful_requests = EXCLUDED.successful_requests,\r
failed_requests = EXCLUDED.failed_requests,\r
total_tokens = EXCLUDED.total_tokens,\r
total_prompt_tokens = EXCLUDED.total_prompt_tokens,\r
total_completion_tokens = EXCLUDED.total_completion_tokens,\r
total_cost_usd = EXCLUDED.total_cost_usd,\r
avg_response_time_ms = EXCLUDED.avg_response_time_ms,\r
min_response_time_ms = EXCLUDED.min_response_time_ms,\r
max_response_time_ms = EXCLUDED.max_response_time_ms,\r
models_used = EXCLUDED.models_used,\r
operations_breakdown = EXCLUDED.operations_breakdown,\r
updated_at = NOW();\r
END;\r
$function$
"
},
{
"args": "",
"name": "update_notification_updated_at",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.update_notification_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
NEW.updated_at = NOW();
RETURN NEW;
END;
$function$
"
},
{
"args": "",
"name": "update_onto_documents_updated_at",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.update_onto_documents_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
begin
new.updated_at = now();
return new;
end;
$function$
"
},
{
"args": "",
"name": "update_project_drafts_updated_at",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.update_project_drafts_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
NEW.updated_at = CURRENT_TIMESTAMP;
RETURN NEW;
END;
$function$
"
},
{
"args": "",
"name": "update_recurring_tasks_on_project_change",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.update_recurring_tasks_on_project_change()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
-- Only proceed if project end_date changed
IF OLD.end_date IS DISTINCT FROM NEW.end_date THEN
-- Update tasks with project-inherited end dates
UPDATE tasks
SET
recurrence_ends = NEW.end_date,
updated_at = NOW()
WHERE project_id = NEW.id
AND task_type = 'recurring'
AND recurrence_end_source = 'project_inherited'
AND deleted_at IS NULL;

-- Log the update for audit trail
INSERT INTO recurring_task_migration_log (
task_id,
user_id,
project_id,
migration_type,
old_recurrence_ends,
new_recurrence_ends,
status
)
SELECT
id,
user_id,
project_id,
'project_update_cascade',
OLD.end_date,
NEW.end_date,
'completed'
FROM tasks
WHERE project_id = NEW.id
AND task_type = 'recurring'
AND recurrence_end_source = 'project_inherited'
AND deleted_at IS NULL;
END IF;

RETURN NEW;
END;
$function$
"
},
{
"args": "p_message_id uuid, p_twilio_sid text, p_twilio_status text, p_mapped_status text, p_error_code integer, p_error_message text",
"name": "update_sms_status_atomic",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.update_sms_status_atomic(p_message_id uuid, p_twilio_sid text, p_twilio_status text, p_mapped_status text, p_error_code integer DEFAULT NULL::integer, p_error_message text DEFAULT NULL::text)
RETURNS TABLE(notification_delivery_id uuid, user_id uuid, sent_at timestamp with time zone, delivered_at timestamp with time zone, attempt_count integer, max_attempts integer, priority text, updated_sms boolean, updated_delivery boolean)
LANGUAGE plpgsql
AS $function$
DECLARE
v_sms_record RECORD;
v_delivery_status TEXT;
v_timestamp TIMESTAMPTZ := NOW();
v_sms_updated BOOLEAN := FALSE;
v_delivery_updated BOOLEAN := FALSE;
BEGIN
-- Start transaction (function is atomic by default)

-- Prepare SMS message update data
-- Build status-specific timestamps
DECLARE
v_sms_update_sent_at TIMESTAMPTZ;
v_sms_update_delivered_at TIMESTAMPTZ;
BEGIN
-- Determine sent_at timestamp
IF p_twilio_status IN ('sent', 'sending') THEN
v_sms_update_sent_at := v_timestamp;
ELSE
v_sms_update_sent_at := NULL; -- Don't update if not sent
END IF;

-- Determine delivered_at timestamp
IF p_twilio_status = 'delivered' THEN
v_sms_update_delivered_at := v_timestamp;
ELSE
v_sms_update_delivered_at := NULL;
END IF;

-- Update sms_messages table
UPDATE sms_messages
SET
twilio_status = p_twilio_status,
status = p_mapped_status: :sms_status,
sent_at = COALESCE(v_sms_update_sent_at, sms_messages.sent_at),
delivered_at = COALESCE(v_sms_update_delivered_at, sms_messages.delivered_at),
twilio_error_code = COALESCE(p_error_code, sms_messages.twilio_error_code),
twilio_error_message = COALESCE(p_error_message, sms_messages.twilio_error_message),
updated_at = v_timestamp
WHERE sms_messages.id = p_message_id
AND sms_messages.twilio_sid = p_twilio_sid
RETURNING
sms_messages.notification_delivery_id,
sms_messages.user_id,
sms_messages.sent_at,
sms_messages.delivered_at,
sms_messages.attempt_count,
sms_messages.max_attempts,
sms_messages.priority
INTO v_sms_record;

IF FOUND THEN
v_sms_updated := TRUE;
ELSE
-- SMS message not found, return early
RETURN QUERY SELECT
NULL: :UUID,
NULL: :UUID,
NULL: :TIMESTAMPTZ,
NULL: :TIMESTAMPTZ,
NULL: :INTEGER,
NULL: :INTEGER,
NULL: :TEXT,
FALSE,
FALSE;
RETURN;
END IF;
END;

-- Update notification_deliveries if linked
IF v_sms_record.notification_delivery_id IS NOT NULL THEN
-- Map Twilio status to notification delivery status
v_delivery_status := CASE
WHEN p_twilio_status IN ('queued', 'accepted') THEN 'pending'
WHEN p_twilio_status IN ('sending', 'sent', 'receiving') THEN 'sent'
WHEN p_twilio_status IN ('received', 'delivered') THEN 'delivered'
WHEN p_twilio_status IN ('failed', 'undelivered', 'canceled') THEN 'failed'
ELSE 'pending'
END;

-- Prepare delivery update with conditional timestamps
UPDATE notification_deliveries
SET
status = v_delivery_status: :notification_status,
sent_at = CASE
WHEN p_twilio_status IN ('sent', 'sending', 'receiving') THEN v_timestamp
ELSE notification_deliveries.sent_at
END,
delivered_at = CASE
WHEN p_twilio_status IN ('delivered', 'received') THEN v_timestamp
ELSE notification_deliveries.delivered_at
END,
failed_at = CASE
WHEN p_twilio_status IN ('failed', 'undelivered', 'canceled') THEN v_timestamp
ELSE notification_deliveries.failed_at
END,
last_error = CASE
WHEN p_error_message IS NOT NULL THEN
CASE
WHEN p_error_code IS NOT NULL THEN p_error_message || ' (Code: ' || p_error_code || ')'
ELSE p_error_message
END
WHEN p_error_code IS NOT NULL THEN 'Twilio error code: ' || p_error_code
ELSE notification_deliveries.last_error
END,
updated_at = v_timestamp
WHERE notification_deliveries.id = v_sms_record.notification_delivery_id;

IF FOUND THEN
v_delivery_updated := TRUE;
END IF;
END IF;

-- Return result with all relevant data
RETURN QUERY SELECT
v_sms_record.notification_delivery_id,
v_sms_record.user_id,
v_sms_record.sent_at,
v_sms_record.delivered_at,
v_sms_record.attempt_count,
v_sms_record.max_attempts,
v_sms_record.priority,
v_sms_updated,
v_delivery_updated;
END;
$function$
"
},
{
"args": "",
"name": "update_task_due_date_on_phase_assignment",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.update_task_due_date_on_phase_assignment()
RETURNS trigger
LANGUAGE plpgsql
AS $function$\r
BEGIN\r
-- Update the task's due date to the suggested date if provided\r
IF NEW.suggested_due_date IS NOT NULL THEN\r
UPDATE tasks \r
SET due_date = NEW.suggested_due_date,\r
updated_at = CURRENT_TIMESTAMP\r
WHERE id = NEW.task_id;\r
END IF;\r
\r
RETURN NEW;\r
END;\r
$function$
"
},
{
"args": "",
"name": "update_tool_call_count",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.update_tool_call_count()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
IF TG_OP = 'INSERT' THEN
UPDATE chat_sessions
SET
tool_call_count = tool_call_count + 1,
updated_at = NOW()
WHERE id = NEW.session_id;
END IF;
RETURN NEW;
END;
$function$
"
},
{
"args": "",
"name": "update_updated_at_column",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
NEW.updated_at = now();
RETURN NEW;
END;
$function$
"
},
{
"args": "",
"name": "update_user_onboarding_status",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.update_user_onboarding_status()
RETURNS trigger
LANGUAGE plpgsql
AS $function$\r
BEGIN\r
UPDATE users \r
SET completed_onboarding = check_onboarding_complete(NEW.user_id)\r
WHERE id = NEW.user_id;\r
RETURN NEW;\r
END;\r
$function$
"
},
{
"args": "p_legacy_table text, p_legacy_id uuid, p_onto_table text, p_onto_id uuid, p_metadata jsonb",
"name": "upsert_legacy_entity_mapping",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.upsert_legacy_entity_mapping(p_legacy_table text, p_legacy_id uuid, p_onto_table text, p_onto_id uuid, p_metadata jsonb DEFAULT '{}'::jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
begin
\tif p_legacy_id is null or p_onto_id is null then
\t\treturn;
\tend if;

\tinsert into legacy_entity_mappings (legacy_table, legacy_id, onto_table, onto_id, metadata, migrated_at)
\tvalues (
\t\tp_legacy_table,
\t\tp_legacy_id,
\t\tp_onto_table,
\t\tp_onto_id,
\t\tcoalesce(jsonb_strip_nulls(p_metadata), '{}': :jsonb),
\t\tnow()
\t)
\ton conflict (legacy_table, legacy_id) do update
\tset
\t\tonto_table = excluded.onto_table,
\t\tonto_id = excluded.onto_id,
\t\tmetadata = jsonb_strip_nulls(coalesce(legacy_entity_mappings.metadata, '{}': :jsonb) || excluded.metadata),
\t\tmigrated_at = excluded.migrated_at;
end;
$function$
"
},
{
"args": "p_facets jsonb, p_scope text",
"name": "validate_facet_values",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.validate_facet_values(p_facets jsonb, p_scope text)
RETURNS TABLE(facet_key text, provided_value text, error text)
LANGUAGE plpgsql
AS $function$
declare
\tv_entry record;
\tv_text_value text;
begin
\tif p_facets is null or jsonb_typeof(p_facets) <> 'object' then
\t\treturn;
\tend if;

\tif p_scope is null or length(trim(p_scope)) = 0 then
\t\traise exception 'validate_facet_values requires a non-null scope';
\t\treturn;
\tend if;

\tfor v_entry in
\t\tselect key, value
\t\tfrom jsonb_each(p_facets)
\tloop
\t\t-- Skip null values
\t\tif v_entry.value is null or v_entry.value = 'null': :jsonb then
\t\t\tcontinue;
\t\tend if;

\t\tif jsonb_typeof(v_entry.value) <> 'string' then
\t\t\tfacet_key := v_entry.key;
\t\t\tprovided_value := v_entry.value: :text;
\t\t\terror := 'Facet value must be a string';
\t\t\treturn next;
\t\t\tcontinue;
\t\tend if;

\t\tv_text_value := v_entry.value #>> '{}';

\t\t-- Ensure the facet key exists and applies to the given scope
\t\tif not exists (
\t\t\tselect 1
\t\t\tfrom onto_facet_definitions d
\t\t\twhere d.key = v_entry.key
\t\t) then
\t\t\tfacet_key := v_entry.key;
\t\t\tprovided_value := v_text_value;
\t\t\terror := format('Unknown facet key: %s', v_entry.key);
\t\t\treturn next;
\t\t\tcontinue;
\t\tend if;

\t\tif not exists (
\t\t\tselect 1
\t\t\tfrom onto_facet_definitions d
\t\t\twhere d.key = v_entry.key
\t\t\t\tand p_scope = any(d.applies_to)
\t\t) then
\t\t\tfacet_key := v_entry.key;
\t\t\tprovided_value := v_text_value;
\t\t\terror := format('Facet \"%s\" does not apply to scope \"%s\"', v_entry.key, p_scope);
\t\t\treturn next;
\t\t\tcontinue;
\t\tend if;

\t\t-- Ensure the value is among the allowed options
\t\tif not exists (
\t\t\tselect 1
\t\t\tfrom onto_facet_values v
\t\t\twhere v.facet_key = v_entry.key
\t\t\t\tand v.value = v_text_value
\t\t) then
\t\t\tfacet_key := v_entry.key;
\t\t\tprovided_value := v_text_value;
\t\t\terror := format('Facet value \"%s\" is not allowed for \"%s\"', v_text_value, v_entry.key);
\t\t\treturn next;
\t\tend if;
\tend loop;
end;
$function$
"
},
{
"args": "vector, integer, boolean",
"name": "vector",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.vector(vector, integer, boolean)
RETURNS vector
LANGUAGE c
IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$vector$function$
"
},
{
"args": "double precision[], vector",
"name": "vector_accum",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.vector_accum(double precision[], vector)
RETURNS double precision[]
LANGUAGE c
IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$vector_accum$function$
"
},
{
"args": "vector, vector",
"name": "vector_add",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.vector_add(vector, vector)
RETURNS vector
LANGUAGE c
IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$vector_add$function$
"
},
{
"args": "double precision[]",
"name": "vector_avg",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.vector_avg(double precision[])
RETURNS vector
LANGUAGE c
IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$vector_avg$function$
"
},
{
"args": "vector, vector",
"name": "vector_cmp",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.vector_cmp(vector, vector)
RETURNS integer
LANGUAGE c
IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$vector_cmp$function$
"
},
{
"args": "double precision[], double precision[]",
"name": "vector_combine",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.vector_combine(double precision[], double precision[])
RETURNS double precision[]
LANGUAGE c
IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$vector_combine$function$
"
},
{
"args": "vector, vector",
"name": "vector_concat",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.vector_concat(vector, vector)
RETURNS vector
LANGUAGE c
IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$vector_concat$function$
"
},
{
"args": "halfvec",
"name": "vector_dims",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.vector_dims(halfvec)
RETURNS integer
LANGUAGE c
IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$halfvec_vector_dims$function$
"
},
{
"args": "vector",
"name": "vector_dims",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.vector_dims(vector)
RETURNS integer
LANGUAGE c
IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$vector_dims$function$
"
},
{
"args": "vector, vector",
"name": "vector_eq",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.vector_eq(vector, vector)
RETURNS boolean
LANGUAGE c
IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$vector_eq$function$
"
},
{
"args": "vector, vector",
"name": "vector_ge",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.vector_ge(vector, vector)
RETURNS boolean
LANGUAGE c
IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$vector_ge$function$
"
},
{
"args": "vector, vector",
"name": "vector_gt",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.vector_gt(vector, vector)
RETURNS boolean
LANGUAGE c
IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$vector_gt$function$
"
},
{
"args": "cstring, oid, integer",
"name": "vector_in",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.vector_in(cstring, oid, integer)
RETURNS vector
LANGUAGE c
IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$vector_in$function$
"
},
{
"args": "vector, vector",
"name": "vector_l2_squared_distance",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.vector_l2_squared_distance(vector, vector)
RETURNS double precision
LANGUAGE c
IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$vector_l2_squared_distance$function$
"
},
{
"args": "vector, vector",
"name": "vector_le",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.vector_le(vector, vector)
RETURNS boolean
LANGUAGE c
IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$vector_le$function$
"
},
{
"args": "vector, vector",
"name": "vector_lt",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.vector_lt(vector, vector)
RETURNS boolean
LANGUAGE c
IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$vector_lt$function$
"
},
{
"args": "vector, vector",
"name": "vector_mul",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.vector_mul(vector, vector)
RETURNS vector
LANGUAGE c
IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$vector_mul$function$
"
},
{
"args": "vector, vector",
"name": "vector_ne",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.vector_ne(vector, vector)
RETURNS boolean
LANGUAGE c
IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$vector_ne$function$
"
},
{
"args": "vector, vector",
"name": "vector_negative_inner_product",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.vector_negative_inner_product(vector, vector)
RETURNS double precision
LANGUAGE c
IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$vector_negative_inner_product$function$
"
},
{
"args": "vector",
"name": "vector_norm",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.vector_norm(vector)
RETURNS double precision
LANGUAGE c
IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$vector_norm$function$
"
},
{
"args": "vector",
"name": "vector_out",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.vector_out(vector)
RETURNS cstring
LANGUAGE c
IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$vector_out$function$
"
},
{
"args": "internal, oid, integer",
"name": "vector_recv",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.vector_recv(internal, oid, integer)
RETURNS vector
LANGUAGE c
IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$vector_recv$function$
"
},
{
"args": "vector",
"name": "vector_send",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.vector_send(vector)
RETURNS bytea
LANGUAGE c
IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$vector_send$function$
"
},
{
"args": "vector, vector",
"name": "vector_spherical_distance",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.vector_spherical_distance(vector, vector)
RETURNS double precision
LANGUAGE c
IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$vector_spherical_distance$function$
"
},
{
"args": "vector, vector",
"name": "vector_sub",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.vector_sub(vector, vector)
RETURNS vector
LANGUAGE c
IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$vector_sub$function$
"
},
{
"args": "vector, integer, boolean",
"name": "vector_to_float4",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.vector_to_float4(vector, integer, boolean)
RETURNS real[]
LANGUAGE c
IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$vector_to_float4$function$
"
},
{
"args": "vector, integer, boolean",
"name": "vector_to_halfvec",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.vector_to_halfvec(vector, integer, boolean)
RETURNS halfvec
LANGUAGE c
IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$vector_to_halfvec$function$
"
},
{
"args": "vector, integer, boolean",
"name": "vector_to_sparsevec",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.vector_to_sparsevec(vector, integer, boolean)
RETURNS sparsevec
LANGUAGE c
IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$vector_to_sparsevec$function$
"
},
{
"args": "cstring[]",
"name": "vector_typmod_in",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.vector_typmod_in(cstring[])
RETURNS integer
LANGUAGE c
IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$vector_typmod_in$function$
"
},
{
"args": "text, text",
"name": "word_similarity",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.word_similarity(text, text)
RETURNS real
LANGUAGE c
IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$word_similarity$function$
"
},
{
"args": "text, text",
"name": "word_similarity_commutator_op",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.word_similarity_commutator_op(text, text)
RETURNS boolean
LANGUAGE c
STABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$word_similarity_commutator_op$function$
"
},
{
"args": "text, text",
"name": "word_similarity_dist_commutator_op",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.word_similarity_dist_commutator_op(text, text)
RETURNS real
LANGUAGE c
IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$word_similarity_dist_commutator_op$function$
"
},
{
"args": "text, text",
"name": "word_similarity_dist_op",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.word_similarity_dist_op(text, text)
RETURNS real
LANGUAGE c
IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$word_similarity_dist_op$function$
"
},
{
"args": "text, text",
"name": "word_similarity_op",
"schema": "public",
"definition": "CREATE OR REPLACE FUNCTION public.word_similarity_op(text, text)
RETURNS boolean
LANGUAGE c
STABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$word_similarity_op$function$
"
}
]
