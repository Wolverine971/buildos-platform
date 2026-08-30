-- supabase/tests/20260830173250_agentic_chat_materialized_context_cache.test.sql
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

do $$
declare
	v_owner_global_before text;
	v_member_global_before text;
	v_member_project_before text;
	v_member_project_after text;
begin
	v_owner_global_before := public.get_agentic_chat_context_invalidation_token(
		'global',
		'11111111-1111-4111-8111-111111111111',
		null
	);
	v_member_global_before := public.get_agentic_chat_context_invalidation_token(
		'global',
		'22222222-2222-4222-8222-222222222222',
		null
	);
	v_member_project_before := public.get_agentic_chat_context_invalidation_token(
		'project',
		'22222222-2222-4222-8222-222222222222',
		'33333333-3333-4333-8333-333333333333'
	);

	if v_owner_global_before is null or v_member_global_before is null then
		raise exception 'owner/member global generation token missing';
	end if;
	if v_member_project_before <> 'project:v1:33333333-3333-4333-8333-333333333333:2' then
		raise exception 'unexpected initial member project token: %', v_member_project_before;
	end if;

	insert into public.agentic_chat_context_snapshots (
		user_id, cache_key, context_type, project_id, context_cache_version,
		invalidation_token, context_payload, context_payload_sha256, expires_at
	) values
		(
			'11111111-1111-4111-8111-111111111111', 'owner-global', 'global', null, 2,
			v_owner_global_before, '{}'::jsonb,
			'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', now() + interval '15 minutes'
		),
		(
			'22222222-2222-4222-8222-222222222222', 'member-global', 'global', null, 2,
			v_member_global_before, '{}'::jsonb,
			'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', now() + interval '15 minutes'
		),
		(
			'22222222-2222-4222-8222-222222222222', 'member-project', 'project',
			'33333333-3333-4333-8333-333333333333', 2, v_member_project_before, '{}'::jsonb,
			'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', now() + interval '15 minutes'
		);

	insert into public.agentic_chat_prepared_prompts (
		id, user_id, context_type, project_id, expires_at
	) values
		(
			'55555555-5555-4555-8555-555555555555',
			'22222222-2222-4222-8222-222222222222',
			'project', '33333333-3333-4333-8333-333333333333', now() + interval '2 minutes'
		),
		(
			'66666666-6666-4666-8666-666666666666',
			'22222222-2222-4222-8222-222222222222',
			'global', null, now() + interval '2 minutes'
		);

	insert into public.onto_goals (id, project_id, name) values (
		'77777777-7777-4777-8777-777777777777',
		'33333333-3333-4333-8333-333333333333',
		'Changed goal'
	);

	if exists (
		select 1 from public.agentic_chat_context_snapshots
		where cache_key in ('owner-global', 'member-global', 'member-project')
	) then
		raise exception 'project mutation did not clear all materialized snapshots';
	end if;
	if exists (
		select 1 from public.agentic_chat_prepared_prompts
		where id in (
			'55555555-5555-4555-8555-555555555555',
			'66666666-6666-4666-8666-666666666666'
		)
	) then
		raise exception 'project mutation did not clear project/member-global prepared prompts';
	end if;

	v_member_project_after := public.get_agentic_chat_context_invalidation_token(
		'project',
		'22222222-2222-4222-8222-222222222222',
		'33333333-3333-4333-8333-333333333333'
	);
	if v_member_project_after <> 'project:v1:33333333-3333-4333-8333-333333333333:3' then
		raise exception 'project generation did not increment exactly once: %', v_member_project_after;
	end if;
end;
$$;

insert into public.agentic_chat_context_snapshots (
	user_id, cache_key, context_type, context_cache_version, invalidation_token,
	context_payload, context_payload_sha256, expires_at
) values (
	'22222222-2222-4222-8222-222222222222', 'member-global-removal', 'global', 2,
	public.get_agentic_chat_context_invalidation_token(
		'global', '22222222-2222-4222-8222-222222222222', null
	),
	'{}'::jsonb,
	'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
	now() + interval '15 minutes'
);

delete from public.onto_project_members
where id = '44444444-4444-4444-8444-444444444444';

do $$
declare
	v_removed_member_token text;
	v_removed_member_project_token text;
begin
	if exists (
		select 1 from public.agentic_chat_context_snapshots
		where cache_key = 'member-global-removal'
	) then
		raise exception 'membership removal did not invalidate the removed member global cache';
	end if;

	v_removed_member_token := public.get_agentic_chat_context_invalidation_token(
		'global', '22222222-2222-4222-8222-222222222222', null
	);
	v_removed_member_project_token := public.get_agentic_chat_context_invalidation_token(
		'project',
		'22222222-2222-4222-8222-222222222222',
		'33333333-3333-4333-8333-333333333333'
	);
	if v_removed_member_token <> 'global:v1:a2e4822a98337283e39f7b60acf85ec9' then
		raise exception 'removed member global token still includes shared project: %', v_removed_member_token;
	end if;
	if v_removed_member_project_token is not null then
		raise exception 'removed member retained project generation access';
	end if;
end;
$$;

do $$
begin
	if has_table_privilege('authenticated', 'public.agentic_chat_context_snapshots', 'select') then
		raise exception 'authenticated unexpectedly has snapshot table access';
	end if;
	if has_table_privilege('anon', 'public.agentic_chat_context_snapshots', 'select') then
		raise exception 'anon unexpectedly has snapshot table access';
	end if;
	if not has_table_privilege('service_role', 'public.agentic_chat_context_snapshots', 'select') then
		raise exception 'service_role is missing snapshot table access';
	end if;
	if not (
		select relrowsecurity
		from pg_class
		where oid = 'public.agentic_chat_context_snapshots'::regclass
	) then
		raise exception 'snapshot table RLS is disabled';
	end if;
end;
$$;

select 'agentic_chat_materialized_context_cache_ok' as proof;
