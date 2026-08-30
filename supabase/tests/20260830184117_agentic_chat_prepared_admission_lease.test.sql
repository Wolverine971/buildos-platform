-- supabase/tests/20260830184117_agentic_chat_prepared_admission_lease.test.sql
-- Prepared-admission lease database proof.
set request.jwt.claims = '{"role":"service_role"}';

insert into public.users (id, name) values
	('11111111-1111-4111-8111-111111111111', 'Owner'),
	('22222222-2222-4222-8222-222222222222', 'Member');
insert into public.onto_actors (id, user_id, name) values
	('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111', 'Owner actor'),
	('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '22222222-2222-4222-8222-222222222222', 'Member actor');
insert into public.onto_projects (id, created_by, name) values
	('33333333-3333-4333-8333-333333333333', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Shared project');
insert into public.onto_project_members (id, project_id, actor_id, access) values
	(
		'44444444-4444-4444-8444-444444444444',
		'33333333-3333-4333-8333-333333333333',
		'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
		'read'
	);
insert into public.chat_sessions (
	id, user_id, context_type, entity_id, summary, agent_metadata
) values
	(
		'55555555-5555-4555-8555-555555555555',
		'22222222-2222-4222-8222-222222222222',
		'project',
		'33333333-3333-4333-8333-333333333333',
		'Current summary',
		'{"trusted":true}'::jsonb
	),
	(
		'66666666-6666-4666-8666-666666666666',
		'11111111-1111-4111-8111-111111111111',
		'global',
		null,
		null,
		'{}'::jsonb
	);

insert into public.agentic_chat_prepared_prompts (
	id, user_id, session_id, context_type, entity_id, project_id, cache_key,
	nonce_sha256, context_payload, history_for_model, history_strategy,
	history_compressed, raw_history_count, history_for_model_count,
	prepared_surfaces, default_surface_profile, context_payload_sha256,
	context_invalidation_token, expires_at, created_at
) values
	(
		'77777777-7777-4777-8777-777777777777',
		'22222222-2222-4222-8222-222222222222',
		'55555555-5555-4555-8555-555555555555',
		'project',
		'33333333-3333-4333-8333-333333333333',
		'33333333-3333-4333-8333-333333333333',
		'v2|project|33333333-3333-4333-8333-333333333333',
		repeat('c', 64),
		'{"contextType":"project","data":{"source":"prepared"}}'::jsonb,
		'[{"role":"assistant","content":"Earlier answer"}]'::jsonb,
		'raw_history', false, 1, 1,
		'{"worker_realtime:project_write_document":{"surface_profile":"worker_realtime:project_write_document","system_prompt":"Prepared prompt","sections":[]}}'::jsonb,
		'project_write_document', repeat('d', 64),
		public.get_agentic_chat_context_invalidation_token(
			'project',
			'22222222-2222-4222-8222-222222222222',
			'33333333-3333-4333-8333-333333333333'
		),
		now() + interval '2 minutes',
		now() - interval '5 seconds'
	),
	(
		'88888888-8888-4888-8888-888888888888',
		'11111111-1111-4111-8111-111111111111',
		'66666666-6666-4666-8666-666666666666',
		'global', null, null, 'v2|global|none', repeat('e', 64),
		'{"contextType":"global","data":{"source":"prepared"}}'::jsonb,
		'[]'::jsonb, 'raw_history', false, 0, 0,
		'{"worker_realtime:global_basic":{"surface_profile":"worker_realtime:global_basic","system_prompt":"Prepared global prompt","sections":[]}}'::jsonb,
		'global_basic', repeat('f', 64),
		public.get_agentic_chat_context_invalidation_token(
			'global', '11111111-1111-4111-8111-111111111111', null
		),
		now() + interval '2 minutes',
		now() - interval '5 seconds'
	);

do $$
declare
	v_receipt jsonb;
begin
	v_receipt := public.inspect_agentic_chat_prepared_admission(
		'22222222-2222-4222-8222-222222222222',
		'77777777-7777-4777-8777-777777777777',
		repeat('c', 64),
		'55555555-5555-4555-8555-555555555555',
		'project',
		'33333333-3333-4333-8333-333333333333',
		'33333333-3333-4333-8333-333333333333',
		now()
	);
	if v_receipt->>'outcome' <> 'hit'
		or v_receipt#>>'{prepared_prompt,id}' <> '77777777-7777-4777-8777-777777777777'
		or v_receipt#>>'{session,id}' <> '55555555-5555-4555-8555-555555555555' then
		raise exception 'valid project lease did not hit: %', v_receipt;
	end if;

	v_receipt := public.inspect_agentic_chat_prepared_admission(
		'11111111-1111-4111-8111-111111111111',
		'88888888-8888-4888-8888-888888888888',
		repeat('e', 64),
		'66666666-6666-4666-8666-666666666666',
		'global', null, null, now()
	);
	if v_receipt->>'outcome' <> 'hit' then
		raise exception 'valid global lease did not hit: %', v_receipt;
	end if;

	v_receipt := public.inspect_agentic_chat_prepared_admission(
		'22222222-2222-4222-8222-222222222222',
		'77777777-7777-4777-8777-777777777777',
		repeat('0', 64),
		'55555555-5555-4555-8555-555555555555',
		'project',
		'33333333-3333-4333-8333-333333333333',
		'33333333-3333-4333-8333-333333333333',
		now()
	);
	if v_receipt->>'reason' <> 'nonce_mismatch' then
		raise exception 'wrong nonce did not fail closed: %', v_receipt;
	end if;
end;
$$;

do $$
declare
	v_receipt jsonb;
	v_global_token text;
begin
	v_receipt := public.inspect_agentic_chat_prepared_admission(
		'22222222-2222-4222-8222-222222222222',
		'77777777-7777-4777-8777-777777777777', repeat('c', 64),
		'55555555-5555-4555-8555-555555555555', 'project',
		'00000000-0000-4000-8000-000000000000',
		'33333333-3333-4333-8333-333333333333', now()
	);
	if v_receipt->>'reason' <> 'scope_mismatch' then
		raise exception 'scope mismatch did not fail closed: %', v_receipt;
	end if;

	update public.agentic_chat_prepared_prompts
	set consumed_at = now()
	where id = '88888888-8888-4888-8888-888888888888';
	v_receipt := public.inspect_agentic_chat_prepared_admission(
		'11111111-1111-4111-8111-111111111111',
		'88888888-8888-4888-8888-888888888888', repeat('e', 64),
		'66666666-6666-4666-8666-666666666666', 'global', null, null, now()
	);
	if v_receipt->>'reason' <> 'consumed' then
		raise exception 'consumed lease did not fail closed: %', v_receipt;
	end if;

	update public.agentic_chat_prepared_prompts
	set consumed_at = null, expires_at = now() - interval '1 second'
	where id = '88888888-8888-4888-8888-888888888888';
	v_receipt := public.inspect_agentic_chat_prepared_admission(
		'11111111-1111-4111-8111-111111111111',
		'88888888-8888-4888-8888-888888888888', repeat('e', 64),
		'66666666-6666-4666-8666-666666666666', 'global', null, null, now()
	);
	if v_receipt->>'reason' <> 'expired' then
		raise exception 'expired lease did not fail closed: %', v_receipt;
	end if;

	v_global_token := public.get_agentic_chat_context_invalidation_token(
		'global', '11111111-1111-4111-8111-111111111111', null
	);
	update public.agentic_chat_prepared_prompts
	set expires_at = now() + interval '2 minutes',
		context_invalidation_token = 'global:v1:stale'
	where id = '88888888-8888-4888-8888-888888888888';
	v_receipt := public.inspect_agentic_chat_prepared_admission(
		'11111111-1111-4111-8111-111111111111',
		'88888888-8888-4888-8888-888888888888', repeat('e', 64),
		'66666666-6666-4666-8666-666666666666', 'global', null, null, now()
	);
	if v_receipt->>'reason' <> 'stale_context' then
		raise exception 'stale context generation did not fail closed: %', v_receipt;
	end if;
	update public.agentic_chat_prepared_prompts
	set context_invalidation_token = v_global_token
	where id = '88888888-8888-4888-8888-888888888888';
end;
$$;

insert into public.chat_messages (
	id, session_id, user_id, role, content, created_at
) values (
	'99999999-9999-4999-8999-999999999999',
	'55555555-5555-4555-8555-555555555555',
	'22222222-2222-4222-8222-222222222222',
	'assistant', 'Newer answer', now()
);

do $$
declare
	v_receipt jsonb;
begin
	v_receipt := public.inspect_agentic_chat_prepared_admission(
		'22222222-2222-4222-8222-222222222222',
		'77777777-7777-4777-8777-777777777777', repeat('c', 64),
		'55555555-5555-4555-8555-555555555555', 'project',
		'33333333-3333-4333-8333-333333333333',
		'33333333-3333-4333-8333-333333333333', now()
	);
	if v_receipt->>'reason' <> 'stale_history' then
		raise exception 'newer history did not fail closed: %', v_receipt;
	end if;
end;
$$;

delete from public.chat_messages where id = '99999999-9999-4999-8999-999999999999';
insert into public.chat_turn_checkpoints (
	id, session_id, user_id, status
) values (
	'aaaaaaaa-1111-4111-8111-111111111111',
	'55555555-5555-4555-8555-555555555555',
	'22222222-2222-4222-8222-222222222222',
	'active'
);

do $$
declare
	v_receipt jsonb;
begin
	v_receipt := public.inspect_agentic_chat_prepared_admission(
		'22222222-2222-4222-8222-222222222222',
		'77777777-7777-4777-8777-777777777777', repeat('c', 64),
		'55555555-5555-4555-8555-555555555555', 'project',
		'33333333-3333-4333-8333-333333333333',
		'33333333-3333-4333-8333-333333333333', now()
	);
	if v_receipt->>'reason' <> 'checkpoint_required' then
		raise exception 'checkpoint did not require fallback: %', v_receipt;
	end if;
end;
$$;

delete from public.chat_turn_checkpoints
where id = 'aaaaaaaa-1111-4111-8111-111111111111';
delete from public.onto_project_members
where id = '44444444-4444-4444-8444-444444444444';
insert into public.agentic_chat_prepared_prompts (
	id, user_id, session_id, context_type, entity_id, project_id, cache_key,
	nonce_sha256, context_payload, history_for_model, history_strategy,
	history_compressed, raw_history_count, history_for_model_count,
	prepared_surfaces, default_surface_profile, context_payload_sha256,
	context_invalidation_token, expires_at, created_at
) values (
	'bbbbbbbb-1111-4111-8111-111111111111',
	'22222222-2222-4222-8222-222222222222',
	'55555555-5555-4555-8555-555555555555',
	'project',
	'33333333-3333-4333-8333-333333333333',
	'33333333-3333-4333-8333-333333333333',
	'v2|project|revoked', repeat('1', 64), '{}'::jsonb, '[]'::jsonb,
	'raw_history', false, 0, 0, '{}'::jsonb, 'project_write_document',
	repeat('2', 64), 'project:v1:stale', now() + interval '2 minutes', now()
);

do $$
declare
	v_receipt jsonb;
begin
	v_receipt := public.inspect_agentic_chat_prepared_admission(
		'22222222-2222-4222-8222-222222222222',
		'bbbbbbbb-1111-4111-8111-111111111111', repeat('1', 64),
		'55555555-5555-4555-8555-555555555555', 'project',
		'33333333-3333-4333-8333-333333333333',
		'33333333-3333-4333-8333-333333333333', now()
	);
	if v_receipt->>'reason' <> 'access_revoked' then
		raise exception 'revoked project access did not fail closed: %', v_receipt;
	end if;
end;
$$;

do $$
begin
	if to_regclass('public.idx_chat_messages_session_user_created_at') is null then
		raise exception 'prepared history currency index is missing';
	end if;
	if has_function_privilege(
		'anon',
		'public.inspect_agentic_chat_prepared_admission(uuid,uuid,text,uuid,text,uuid,uuid,timestamptz)',
		'execute'
	) then
		raise exception 'anon unexpectedly can inspect prepared admission leases';
	end if;
	if has_function_privilege(
		'authenticated',
		'public.inspect_agentic_chat_prepared_admission(uuid,uuid,text,uuid,text,uuid,uuid,timestamptz)',
		'execute'
	) then
		raise exception 'authenticated unexpectedly can inspect prepared admission leases';
	end if;
	if not has_function_privilege(
		'service_role',
		'public.inspect_agentic_chat_prepared_admission(uuid,uuid,text,uuid,text,uuid,uuid,timestamptz)',
		'execute'
	) then
		raise exception 'service_role cannot inspect prepared admission leases';
	end if;
end;
$$;

select 'agentic_chat_prepared_admission_lease_ok' as proof;
