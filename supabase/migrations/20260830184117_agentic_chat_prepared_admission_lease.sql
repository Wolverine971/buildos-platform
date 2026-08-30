-- supabase/migrations/20260830184117_agentic_chat_prepared_admission_lease.sql
-- Agentic Chat prepared-admission lease.
--
-- Collapses the common worker prepared-hit authorization, session, context
-- generation, history-currency, and checkpoint-eligibility reads into one
-- service-only inspection. The final atomic admission RPC remains the only
-- prepared-prompt consumption and durable turn-creation boundary.

create index if not exists idx_chat_messages_session_user_created_at
	on public.chat_messages(session_id, user_id, created_at desc);

create or replace function public.inspect_agentic_chat_prepared_admission(
	p_user_id uuid,
	p_prepared_prompt_id uuid,
	p_nonce_sha256 text,
	p_session_id uuid,
	p_context_type text,
	p_entity_id uuid default null,
	p_project_id uuid default null,
	p_now timestamptz default clock_timestamp()
)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public
as $function$
declare
	v_request_role text;
	v_prepared public.agentic_chat_prepared_prompts%rowtype;
	v_session public.chat_sessions%rowtype;
	v_actor_id uuid;
	v_actual_context_token text;
begin
	v_request_role := coalesce(
		nullif(
			nullif(current_setting('request.jwt.claims', true), '')::jsonb->>'role',
			''
		),
		current_user
	);
	if v_request_role <> 'service_role' then
		raise exception 'agentic_chat_prepared_admission_service_role_required'
			using errcode = '42501';
	end if;

	if p_user_id is null
		or p_prepared_prompt_id is null
		or p_session_id is null
		or p_context_type not in ('global', 'project', 'ontology')
		or p_nonce_sha256 is null
		or p_nonce_sha256 !~ '^[0-9a-f]{64}$'
		or p_now is null then
		return jsonb_build_object('outcome', 'fallback', 'reason', 'invalid_request');
	end if;

	select prepared.*
	into v_prepared
	from public.agentic_chat_prepared_prompts prepared
	where prepared.id = p_prepared_prompt_id;
	if not found then
		return jsonb_build_object('outcome', 'fallback', 'reason', 'not_found');
	end if;

	if v_prepared.nonce_sha256 is distinct from p_nonce_sha256 then
		return jsonb_build_object('outcome', 'fallback', 'reason', 'nonce_mismatch');
	end if;
	if v_prepared.consumed_at is not null then
		return jsonb_build_object('outcome', 'fallback', 'reason', 'consumed');
	end if;
	if v_prepared.expires_at <= p_now then
		return jsonb_build_object('outcome', 'fallback', 'reason', 'expired');
	end if;
	if v_prepared.user_id is distinct from p_user_id
		or v_prepared.session_id is distinct from p_session_id
		or v_prepared.context_type is distinct from p_context_type
		or v_prepared.entity_id is distinct from p_entity_id
		or v_prepared.project_id is distinct from p_project_id then
		return jsonb_build_object('outcome', 'fallback', 'reason', 'scope_mismatch');
	end if;

	select sessions.*
	into v_session
	from public.chat_sessions sessions
	where sessions.id = p_session_id
		and sessions.user_id = p_user_id;
	if not found
		or v_session.context_type is distinct from p_context_type
		or v_session.entity_id is distinct from p_entity_id then
		return jsonb_build_object('outcome', 'fallback', 'reason', 'session_mismatch');
	end if;

	select actors.id
	into v_actor_id
	from public.onto_actors actors
	where actors.user_id = p_user_id
	limit 1;
	if v_actor_id is null then
		return jsonb_build_object('outcome', 'fallback', 'reason', 'access_revoked');
	end if;
	if p_context_type in ('project', 'ontology') and (
		p_project_id is null
		or not public.actor_has_project_member_access(v_actor_id, p_project_id, 'read')
	) then
		return jsonb_build_object('outcome', 'fallback', 'reason', 'access_revoked');
	end if;

	if v_prepared.context_invalidation_token is null then
		return jsonb_build_object('outcome', 'fallback', 'reason', 'missing_context_generation');
	end if;
	v_actual_context_token := public.get_agentic_chat_context_invalidation_token(
		p_context_type,
		p_user_id,
		p_project_id
	);
	if v_actual_context_token is null
		or v_actual_context_token is distinct from v_prepared.context_invalidation_token then
		return jsonb_build_object('outcome', 'fallback', 'reason', 'stale_context');
	end if;

	if exists (
		select 1
		from public.chat_messages messages
		where messages.session_id = p_session_id
			and messages.user_id = p_user_id
			and messages.created_at > v_prepared.created_at
	) then
		return jsonb_build_object('outcome', 'fallback', 'reason', 'stale_history');
	end if;

	-- The normal checkpoint path performs lifecycle recovery before freezing a
	-- resume snapshot. Keep that path authoritative whenever any active/resuming
	-- checkpoint could require recovery or message augmentation.
	if exists (
		select 1
		from public.chat_turn_checkpoints checkpoints
		where checkpoints.session_id = p_session_id
			and checkpoints.user_id = p_user_id
			and checkpoints.status in ('active', 'resuming')
	) then
		return jsonb_build_object('outcome', 'fallback', 'reason', 'checkpoint_required');
	end if;

	return jsonb_build_object(
		'outcome', 'hit',
		'prepared_prompt', to_jsonb(v_prepared),
		'session', to_jsonb(v_session),
		'validated_at', p_now
	);
end;
$function$;

revoke all on function public.inspect_agentic_chat_prepared_admission(
	uuid, uuid, text, uuid, text, uuid, uuid, timestamptz
) from public, anon, authenticated;
grant execute on function public.inspect_agentic_chat_prepared_admission(
	uuid, uuid, text, uuid, text, uuid, uuid, timestamptz
) to service_role;

comment on function public.inspect_agentic_chat_prepared_admission(
	uuid, uuid, text, uuid, text, uuid, uuid, timestamptz
) is
	'Service-only one-read validation for worker prepared-admission leases; final admission remains the consumption/race boundary.';

comment on index public.idx_chat_messages_session_user_created_at is
	'Supports prepared-history currency checks without scanning a session message history.';
