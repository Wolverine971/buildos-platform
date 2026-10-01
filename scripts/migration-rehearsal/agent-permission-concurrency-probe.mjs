// scripts/migration-rehearsal/agent-permission-concurrency-probe.mjs
// Local socket-only concurrency probe. Never accepts a database URL.
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
const cluster = process.argv[2];
if (!/^\/(private\/)?tmp\/buildos-rehearsal-[A-Za-z0-9_]+$/.test(cluster ?? ''))
	throw Error('Pass a kept local rehearsal cluster');
const { Client } = createRequire(resolve('apps/worker/package.json'))('pg');
const ctl = (...args) =>
	execFileSync('/opt/homebrew/opt/postgresql@16/bin/pg_ctl', ['-D', `${cluster}/data`, ...args], {
		stdio: 'pipe'
	});
ctl(
	'-l',
	`${cluster}/postgres.log`,
	'-o',
	`-p 5432 -k ${cluster}/socket -c listen_addresses='' -c fsync=off -c deadlock_timeout=100ms`,
	'-w',
	'start'
);
const connect = async () => {
	const c = new Client({
		host: `${cluster}/socket`,
		port: 5432,
		user: 'postgres',
		database: 'postgres'
	});
	await c.connect();
	await c.query("SET statement_timeout='5s'");
	return c;
};
const admin = await connect();
const uid = randomUUID(),
	owner = randomUUID(),
	actor = randomUUID(),
	ownerActor = randomUUID(),
	project = randomUUID(),
	project2 = randomUUID(),
	doc = randomUUID(),
	caller = randomUUID(),
	member = randomUUID(),
	grant = randomUUID(),
	token = randomUUID();
const clients = [];
try {
	await admin.query(
		`INSERT INTO auth.users(id,email) VALUES($1,'concurrent-agent@example.test'),($2,'concurrent-owner@example.test')`,
		[uid, owner]
	);
	await admin.query(
		`INSERT INTO public.users(id,email) VALUES($1,'concurrent-agent@example.test'),($2,'concurrent-owner@example.test') ON CONFLICT DO NOTHING`,
		[uid, owner]
	);
	await admin.query(
		`INSERT INTO public.onto_actors(id,user_id,kind,name) VALUES($1,$2,'human','Agent owner'),($3,$4,'human','Project owner')`,
		[actor, uid, ownerActor, owner]
	);
	await admin.query(
		`INSERT INTO public.onto_projects(id,name,type_key,created_by) VALUES($1,'Concurrency','project.base',$2),($3,'Move destination','project.base',$2)`,
		[project, ownerActor, project2]
	);
	await admin.query(
		`INSERT INTO public.onto_project_members(id,project_id,actor_id,role_key,access) VALUES($1,$2,$3,'editor','write')`,
		[member, project, actor]
	);
	await admin.query(
		`INSERT INTO public.onto_documents(id,project_id,title,type_key,created_by) VALUES($1,$2,'Before','document.base',$3)`,
		[doc, project, ownerActor]
	);
	await admin.query(
		`INSERT INTO public.external_agent_callers(id,user_id,provider,caller_key,token_prefix,token_hash,project_scope_mode) VALUES($1,$2,'test','Concurrency','test','concurrency-hash','selected')`,
		[caller, uid]
	);
	await admin.query(
		`INSERT INTO public.agent_oauth_clients(client_id,client_name) VALUES('concurrency-client','Concurrency')`
	);
	await admin.query(
		`INSERT INTO public.agent_oauth_grants(id,user_id,client_id,external_agent_caller_id,resource,scope,project_scope_mode) VALUES($1,$2,'concurrency-client',$3,'https://fixture.test/mcp','buildos.read buildos.write','selected')`,
		[grant, uid, caller]
	);
	await admin.query(
		`INSERT INTO public.external_agent_project_permissions(user_id,external_agent_caller_id,agent_oauth_grant_id,project_id) VALUES($1,$2,$3,$4)`,
		[uid, caller, grant, project]
	);
	await admin.query(
		`INSERT INTO public.agent_oauth_access_tokens(id,grant_id,client_id,user_id,external_agent_caller_id,token_hash,token_prefix,resource,scope,expires_at) VALUES($1,$2,'concurrency-client',$3,$4,'concurrent-token','test','https://fixture.test/mcp','buildos.read buildos.write',now()+interval '1 hour')`,
		[token, grant, uid, caller]
	);
	await admin.query('SELECT public.set_agent_permission_feature(true)');
	const ref = { kind: 'oauth', caller_id: caller, grant_id: grant, access_token_id: token };
	const before = (
		await admin.query('SELECT public.agent_edit_snapshot($1,$2) AS s', [
			'document.edit.v1',
			doc
		])
	).rows[0].s;
	const proposal = { kind: 'document', target_id: doc, changes: { title: 'After' } };
	for (let i = 0; i < 3; i++) clients.push(await connect());
	const created = await Promise.all(
		clients.map((c, i) =>
			c.query('SELECT public.create_agent_permission_request($1,$2,$3,$4,$5) AS r', [
				ref,
				`parallel-${i}`,
				proposal,
				before,
				{ title: 'After' }
			])
		)
	);
	const r = created[0].rows[0].r;
	if (!created.every((v) => v.rows[0].r.id === r.id))
		throw Error('Concurrent request dedupe failed');
	const claims = JSON.stringify({ sub: uid, role: 'authenticated' });
	await Promise.all(
		clients.map((c) => c.query("SELECT set_config('request.jwt.claims',$1,false)", [claims]))
	);
	const applied = await Promise.all(
		clients
			.slice(0, 2)
			.map((c) =>
				c.query('SELECT public.decide_agent_permission_request($1,$2,$3) AS r', [
					r.id,
					r.reviewed_digest,
					'always'
				])
			)
	);
	if (!applied.every((v) => v.rows[0].r.status === 'applied'))
		throw Error('Concurrent approval failed');
	const versions = await admin.query(
		'SELECT count(*)::int AS n FROM public.onto_document_versions WHERE document_id=$1',
		[doc]
	);
	if (versions.rows[0].n !== 1) throw Error('Duplicate checkpoint');
	// Race against the deployed task mover, which locks both projects before the task.
	const task = randomUUID();
	await admin.query(
		'INSERT INTO public.onto_tasks(id,project_id,title,created_by) VALUES($1,$2,$3,$4)',
		[task, project, 'Move me', ownerActor]
	);
	const taskBefore = (
		await admin.query('SELECT public.agent_edit_snapshot($1,$2) AS s', ['task.edit.v1', task])
	).rows[0].s;
	const taskRequest = (
		await clients[1].query(
			'SELECT public.create_agent_permission_request($1,$2,$3,$4,$5) AS r',
			[
				ref,
				'moving-task',
				{ kind: 'task', target_id: task, changes: { title: 'Must not apply' } },
				taskBefore,
				{ title: 'Must not apply' }
			]
		)
	).rows[0].r;
	await clients[0].query('BEGIN');
	await clients[0].query("SELECT set_config('request.jwt.claims',$1,true)", [
		JSON.stringify({ sub: owner, role: 'authenticated' })
	]);
	await clients[0].query('SAVEPOINT mover');
	let moved;
	try {
		moved = (
			await clients[0].query('SELECT public.onto_task_move_atomic($1,$2,$3) AS r', [
				task,
				project,
				project2
			])
		).rows[0].r;
	} catch (error) {
		if (error.code !== '42703' || !error.message.includes('plan_id')) throw error;
		await clients[0].query('ROLLBACK TO SAVEPOINT mover');
		console.log(
			'BLOCKED: deployed onto_task_move_atomic references removed plan_id. Testing equivalent project-first row move; deployed-writer compatibility remains unverified.'
		);
		await clients[0].query(
			'SELECT id FROM public.onto_projects WHERE id=ANY($1::uuid[]) ORDER BY id FOR UPDATE',
			[[project, project2]]
		);
		await clients[0].query('UPDATE public.onto_tasks SET project_id=$1 WHERE id=$2', [
			project2,
			task
		]);
		moved = { requires_user_action: false };
	}
	if (moved.requires_user_action)
		throw Error('Fixture task unexpectedly requires move confirmation');
	const racingApproval = clients[1].query(
		'SELECT public.decide_agent_permission_request($1,$2,$3) AS r',
		[taskRequest.id, taskRequest.reviewed_digest, 'always']
	);
	await clients[0].query('COMMIT');
	if ((await racingApproval).rows[0].r.status !== 'stale')
		throw Error('Moved target was not stale');
	const movedTask = (
		await admin.query('SELECT title,project_id FROM public.onto_tasks WHERE id=$1', [task])
	).rows[0];
	if (movedTask.project_id !== project2 || movedTask.title !== 'Move me')
		throw Error('Approval escaped task move');
	// Hold the existing project/member mutation RPC open after it has revoked access.
	await clients[0].query('BEGIN');
	await clients[0].query("SELECT set_config('request.jwt.claims',$1,true)", [
		JSON.stringify({ sub: owner, role: 'authenticated' })
	]);
	await clients[0].query("SELECT public.update_project_membership_guarded($1,$2,'remove')", [
		project,
		member
	]);
	const next = (
		await admin.query('SELECT public.agent_edit_snapshot($1,$2) AS s', [
			'document.edit.v1',
			doc
		])
	).rows[0].s;
	const write = clients[1]
		.query('SELECT public.apply_scoped_agent_edit($1,$2,$3,$4,$5)', [
			ref,
			'revocation-race',
			{ kind: 'document', target_id: doc, changes: { title: 'Unauthorized' } },
			next,
			{ title: 'Unauthorized' }
		])
		.then(
			() => ({ ok: true }),
			(e) => ({ ok: false, code: e.code, message: e.message })
		);
	await clients[0].query('COMMIT');
	const outcome = await write;
	if (outcome.ok || ['40P01', '57014'].includes(outcome.code))
		throw Error(`Revocation race failed: ${JSON.stringify(outcome)}`);
	const title = (await admin.query('SELECT title FROM public.onto_documents WHERE id=$1', [doc]))
		.rows[0].title;
	if (title !== 'After') throw Error('Write escaped membership revocation');
	// RLS removes the stored content from the caller owner's authenticated session.
	await clients[1].query('SET ROLE authenticated');
	const hidden = await clients[1].query(
		'SELECT id FROM public.agent_permission_requests WHERE id=$1',
		[r.id]
	);
	if (hidden.rows.length)
		throw Error('Request payload remained readable after membership removal');
	await clients[1].query('RESET ROLE');
	for (const action of ['role', 'leave', 'caller']) {
		// Restore the fixture, then create a fresh owner-approved standing rule.
		await admin.query(
			"UPDATE public.onto_project_members SET removed_at=NULL,role_key='editor',access='write' WHERE id=$1",
			[member]
		);
		await clients[1].query("SELECT set_config('request.jwt.claims',$1,false)", [claims]);
		const snapshot = (
			await admin.query('SELECT public.agent_edit_snapshot($1,$2) AS s', [
				'document.edit.v1',
				doc
			])
		).rows[0].s;
		const seed = (
			await clients[1].query(
				'SELECT public.create_agent_permission_request($1,$2,$3,$4,$5) AS r',
				[
					ref,
					`seed-${action}`,
					{ kind: 'document', target_id: doc, changes: { title: `Before ${action}` } },
					snapshot,
					{ title: `Before ${action}` }
				]
			)
		).rows[0].r;
		await clients[1].query('SELECT public.decide_agent_permission_request($1,$2,$3)', [
			seed.id,
			seed.reviewed_digest,
			'always'
		]);
		const current = (
			await admin.query('SELECT public.agent_edit_snapshot($1,$2) AS s', [
				'document.edit.v1',
				doc
			])
		).rows[0].s;
		await clients[0].query('BEGIN');
		await clients[0].query("SELECT set_config('request.jwt.claims',$1,true)", [
			JSON.stringify({ sub: action === 'leave' ? uid : owner, role: 'authenticated' })
		]);
		if (action === 'caller')
			await clients[0].query(
				"UPDATE public.external_agent_callers SET status='revoked' WHERE id=$1",
				[caller]
			);
		else
			await clients[0].query('SELECT public.update_project_membership_guarded($1,$2,$3,$4)', [
				project,
				member,
				action,
				action === 'role' ? 'viewer' : null
			]);
		const racingWrite = clients[1]
			.query('SELECT public.apply_scoped_agent_edit($1,$2,$3,$4,$5)', [
				ref,
				`race-${action}`,
				{ kind: 'document', target_id: doc, changes: { title: 'Unauthorized' } },
				current,
				{ title: 'Unauthorized' }
			])
			.then(
				() => ({ ok: true }),
				(e) => ({ ok: false, code: e.code })
			);
		await clients[0].query('COMMIT');
		const result = await racingWrite;
		if (result.ok || ['40P01', '57014'].includes(result.code))
			throw Error(`${action} race failed: ${JSON.stringify(result)}`);
	}
	console.log(
		'PASS: concurrent request dedupe and approvals; task move makes approval stale; member removal/downgrade/leave and caller revocation block scoped writes without deadlocks; RLS hides revoked project payloads.'
	);
} finally {
	await Promise.all(clients.map((c) => c.end()));
	await admin.end();
	ctl('-m', 'fast', '-w', 'stop');
}
