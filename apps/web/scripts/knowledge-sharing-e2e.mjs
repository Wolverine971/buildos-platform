// apps/web/scripts/knowledge-sharing-e2e.mjs
//
// Two-account walk-through of knowledge in shared projects (tasker 168) against a running web
// server and the database it points at. Free (no model or search calls are made by this
// script; the task insert may queue the normal entity read for the owner, which costs a
// fraction of a cent on the worker).
//
//   node apps/web/scripts/knowledge-sharing-e2e.mjs [--base http://localhost:5177] [--keep]
//
// Two dedicated test accounts (created once, logins kept in apps/web/.env, gitignored):
// KNOWLEDGE_E2E_OWNER_* and KNOWLEDGE_E2E_COLLAB_*. The owner gets a project with one task and
// a person in their People (headline from the web, email from a contacts import, a note); the
// collaborator joins as editor. Then: the collaborator sees the public detail and "1 contact
// detail · Ask" but not the email or note → asks → the owner sees the ask and shares contact
// details while both are in the project → the collaborator sees the email labelled as a grant
// → "Add to my People" copies only the public detail → the collaborator leaves → nothing
// shows. Cleans up the project and entries unless --keep.

import { createClient } from '@supabase/supabase-js';
import { randomBytes } from 'node:crypto';
import { appendFileSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const envPath = join(here, '..', '.env');
const env = Object.fromEntries(
	readFileSync(envPath, 'utf8')
		.split('\n')
		.filter((line) => /^[A-Z0-9_]+=/.test(line))
		.map((line) => {
			const i = line.indexOf('=');
			return [line.slice(0, i), line.slice(i + 1).replace(/^["']|["']$/g, '')];
		})
);
const args = process.argv.slice(2);
const base = args.includes('--base') ? args[args.indexOf('--base') + 1] : 'http://localhost:5177';
const keep = args.includes('--keep');

const admin = createClient(env.PUBLIC_SUPABASE_URL, env.PRIVATE_SUPABASE_SERVICE_KEY, {
	auth: { persistSession: false }
});

let failures = 0;
function check(label, ok, detail) {
	console.log(
		`${ok ? '✓' : '✗'} ${label}${ok || detail === undefined ? '' : ` — ${JSON.stringify(detail).slice(0, 400)}`}`
	);
	if (!ok) failures++;
}

async function ensureAccount(role, email, name) {
	const prefix = `KNOWLEDGE_E2E_${role}`;
	let password = env[`${prefix}_PASSWORD`];
	if (!password) {
		password = randomBytes(18).toString('base64url');
		appendFileSync(
			envPath,
			`\n# tasker 168 two-account check (apps/web/scripts/knowledge-sharing-e2e.mjs)\n${prefix}_EMAIL=${email}\n${prefix}_PASSWORD=${password}\n`
		);
		const { error } = await admin.auth.admin.createUser({
			email,
			password,
			email_confirm: true
		});
		if (error && !/already/i.test(error.message))
			throw new Error(`create ${role}: ${error.message}`);
	}
	const login = await fetch(`${base}/api/auth/login`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ email, password })
	});
	const body = await login.json().catch(() => null);
	const userId = body?.data?.user?.id;
	if (!login.ok || !userId) throw new Error(`login ${role} failed (${login.status})`);
	const cookie = login.headers
		.getSetCookie()
		.map((c) => c.split(';')[0])
		.join('; ');
	await admin.from('users').upsert({ id: userId, email, name }, { onConflict: 'id' });
	let { data: actor } = await admin
		.from('onto_actors')
		.select('id')
		.eq('user_id', userId)
		.maybeSingle();
	if (!actor) {
		({ data: actor } = await admin
			.from('onto_actors')
			.insert({ user_id: userId, kind: 'human', name })
			.select('id')
			.single());
	}
	const call = async (method, path, payload) => {
		const response = await fetch(`${base}${path}`, {
			method,
			headers: { cookie, ...(payload ? { 'Content-Type': 'application/json' } : {}) },
			body: payload ? JSON.stringify(payload) : undefined
		});
		const json = await response.json().catch(() => null);
		return { status: response.status, data: json?.data, error: json?.error };
	};
	return { userId, actorId: actor.id, name, call };
}

const owner = await ensureAccount(
	'OWNER',
	env.KNOWLEDGE_E2E_OWNER_EMAIL ?? 'djwayne35+kg-owner@gmail.com',
	'KG Owner'
);
const collab = await ensureAccount(
	'COLLAB',
	env.KNOWLEDGE_E2E_COLLAB_EMAIL ?? 'djwayne35+kg-collab@gmail.com',
	'KG Collaborator'
);
console.log('accounts ready');

// --- Fixture: project, task, membership, the owner's entry --------------------------------
const stamp = new Date().toISOString().slice(0, 16);
const { data: project, error: projectError } = await admin
	.from('onto_projects')
	.insert({
		name: `KG share check ${stamp}`,
		type_key: 'project.base',
		created_by: owner.actorId
	})
	.select('id')
	.single();
if (projectError) throw new Error(`project: ${projectError.message}`);
await admin.from('onto_project_members').upsert(
	[
		{ project_id: project.id, actor_id: owner.actorId, role_key: 'owner', access: 'admin' },
		{ project_id: project.id, actor_id: collab.actorId, role_key: 'editor', access: 'write' }
	],
	{ onConflict: 'project_id,actor_id' }
);
const { data: task } = await admin
	.from('onto_tasks')
	.insert({
		project_id: project.id,
		title: 'Pitch Kyle Kulinski on the sponsorship',
		created_by: owner.actorId
	})
	.select('id')
	.single();

const { data: kyle } = await admin
	.from('knowledge_entities')
	.insert({
		kind: 'person',
		name: 'Kyle Kulinski',
		scope: 'private',
		owner_user_id: owner.userId,
		created_via: 'manual'
	})
	.select('id')
	.single();
const source = async (row) =>
	(
		await admin
			.from('knowledge_sources')
			.insert({ scope: 'private', owner_user_id: owner.userId, ...row })
			.select('id')
			.single()
	).data.id;
const webSource = await source({
	source_type: 'web',
	url: 'https://example.com/kyle-kulinski',
	title: 'Bio'
});
const importSource = await source({ source_type: 'import', title: 'Contacts' });
const fact = async (row, sourceId) => {
	const { data } = await admin
		.from('knowledge_facts')
		.insert({ entity_id: kyle.id, scope: 'private', owner_user_id: owner.userId, ...row })
		.select('id')
		.single();
	if (sourceId)
		await admin
			.from('knowledge_fact_sources')
			.insert({ fact_id: data.id, source_id: sourceId });
};
const { data: run } = await admin
	.from('knowledge_runs')
	.insert({
		owner_user_id: owner.userId,
		run_type: 'enrichment',
		status: 'completed',
		title: 'e2e'
	})
	.select('id')
	.single();
await fact(
	{
		predicate: 'headline',
		value_text: 'Host of Secular Talk',
		created_via: 'enrichment',
		run_id: run.id
	},
	webSource
);
// Typed into chat with a URL: not the public web (review fix), so ask-only like the email.
await fact(
	{ predicate: 'description', value_text: 'Moving to Acme next month', created_via: 'chat' },
	webSource
);
await fact(
	{ predicate: 'email', value_text: 'kyle.e2e@example.com', created_via: 'import' },
	importSource
);
await fact(
	{ predicate: 'note', value_text: 'Prefers a text before a call', created_via: 'manual' },
	null
);
// A booking line written in the project's own task: shared while the task still says it.
await admin
	.from('onto_tasks')
	.update({ description: 'Booking line (410) 555-0177' })
	.eq('id', task.id);
const taskSource = await source({ source_type: 'task', record_id: task.id, title: 'Pitch' });
await fact({ predicate: 'phone', value_text: '+14105550177', created_via: 'task' }, taskSource);
await admin.from('knowledge_record_links').insert({
	entity_id: kyle.id,
	owner_user_id: owner.userId,
	record_kind: 'task',
	record_id: task.id,
	quote: 'Kyle Kulinski',
	created_via: 'manual'
});
console.log('fixture ready');

const kyleIn = (lens) => lens?.entries?.find((e) => e.entity.id === kyle.id);
let ownCopy = null;
try {
	// --- 1. Collaborator sees the public detail and a count, never the values ----------------
	const first = await collab.call(
		'GET',
		`/api/onto/task-entities?task_ids=${task.id}&knowledge=1`
	);
	const seen = kyleIn(first.data?.lens);
	check('collaborator gets a lens entry from the owner', Boolean(seen), first);
	check('it says whose People it is', seen?.owner?.name === 'KG Owner', seen?.owner);
	check(
		'headline (web) shows',
		seen?.facts?.some((f) => f.predicate === 'headline' && f.source_url),
		seen?.facts
	);
	check(
		'email, note and the chat-typed claim never sent',
		!JSON.stringify(seen ?? {}).includes('kyle.e2e@') &&
			!JSON.stringify(seen ?? {}).includes('Prefers a text') &&
			!JSON.stringify(seen ?? {}).includes('Moving to Acme')
	);
	check('"1 contact detail" is counted', seen?.hidden?.contact === 1, seen?.hidden);
	const mentions = await collab.call(
		'GET',
		`/api/knowledge/mentions?record_kind=task&record_id=${task.id}`
	);
	check(
		'doc/task reader gets the same lens',
		Boolean(kyleIn(mentions.data?.lens)),
		mentions.status
	);
	const direct = await collab.call('GET', `/api/knowledge/entities/${kyle.id}`);
	check(
		'collaborator cannot open the owner entry directly',
		direct.status === 404,
		direct.status
	);

	check(
		'booking line from the task shows while the task says it',
		seen?.facts?.some((f) => f.value === '+14105550177'),
		seen?.facts
	);
	await admin
		.from('onto_tasks')
		.update({ description: 'Booking line changed, ask the office' })
		.eq('id', task.id);
	const edited = kyleIn(
		(await collab.call('GET', `/api/onto/task-entities?task_ids=${task.id}&knowledge=1`)).data
			?.lens
	);
	check(
		'edited out of the task: no longer shown, counted instead',
		!JSON.stringify(edited ?? {}).includes('555017') && edited?.hidden?.contact === 2,
		edited
	);
	await admin
		.from('onto_tasks')
		.update({ description: 'Booking line (410) 555-0177' })
		.eq('id', task.id);

	// --- 2. Ask ---------------------------------------------------------------------------------
	const ask = await collab.call('POST', '/api/knowledge/shares', {
		action: 'ask',
		entity_id: kyle.id,
		project_id: project.id,
		what: 'contact'
	});
	check('ask is sent', ask.data?.status === 'requested' && ask.data?.id, ask);
	const again = await collab.call('POST', '/api/knowledge/shares', {
		action: 'ask',
		entity_id: kyle.id,
		project_id: project.id,
		what: 'contact'
	});
	check(
		'asking twice merges',
		again.data?.merged === true && again.data?.id === ask.data?.id,
		again
	);
	const selfGrant = await collab.call('PATCH', `/api/knowledge/shares/${ask.data?.id}`, {
		decision: 'grant'
	});
	check('collaborator cannot approve their own ask', selfGrant.status === 404, selfGrant);

	// --- 3. Owner sees and shares ---------------------------------------------------------------
	const mine = await owner.call('GET', '/api/knowledge/shares/mine');
	check(
		'owner Profile lists the ask',
		mine.data?.asks?.some(
			(a) => a.id === ask.data?.id && a.requested_by?.name === 'KG Collaborator'
		),
		mine.data?.asks
	);
	const card = await owner.call('GET', `/api/knowledge/entities/${kyle.id}`);
	check(
		'owner card shows the ask',
		card.data?.sharing?.shares?.some((s) => s.id === ask.data?.id && s.status === 'requested'),
		card.data?.sharing
	);
	check(
		'owner card lists the shared project + member',
		card.data?.sharing?.projects?.[0]?.members?.some((m) => m.name === 'KG Collaborator'),
		card.data?.sharing?.projects
	);
	const noteShare = await owner.call('PATCH', `/api/knowledge/shares/${ask.data?.id}`, {
		decision: 'grant',
		what: 'picked',
		predicates: ['note']
	});
	check('sharing a note is refused', noteShare.status === 400, noteShare);
	const grant = await owner.call('PATCH', `/api/knowledge/shares/${ask.data?.id}`, {
		decision: 'grant',
		what: 'contact',
		duration: 'membership'
	});
	check('owner shares contact details', grant.data?.status === 'granted', grant);

	// --- 4. Collaborator sees the email, labelled -----------------------------------------------
	const after = kyleIn(
		(await collab.call('GET', `/api/onto/task-entities?task_ids=${task.id}&knowledge=1`)).data
			?.lens
	);
	check(
		'email now shows as a grant',
		after?.facts?.some((f) => f.predicate === 'email' && f.via === 'grant'),
		after?.facts
	);
	check('note still never shows', !JSON.stringify(after ?? {}).includes('Prefers a text'));
	check(
		'grant reads "while you\'re both in" (membership)',
		after?.grant?.duration === 'membership',
		after?.grant
	);

	// --- 5. Add to my People copies the public detail only --------------------------------------
	const { data: own } = await admin
		.from('knowledge_entities')
		.insert({
			kind: 'person',
			name: 'Kyle Kulinski',
			scope: 'private',
			owner_user_id: collab.userId,
			created_via: 'manual'
		})
		.select('id')
		.single();
	ownCopy = own.id;
	const adopt = await collab.call('POST', '/api/knowledge/lens/adopt', {
		project_id: project.id,
		record_kind: 'task',
		record_id: task.id,
		from_entity_id: kyle.id,
		into_entity_id: own.id
	});
	const { data: copied } = await admin
		.from('knowledge_facts')
		.select('predicate')
		.eq('entity_id', own.id);
	check(
		'adopt copies the headline only',
		adopt.data?.copied === 1 && copied?.length === 1 && copied[0].predicate === 'headline',
		{ adopt, copied }
	);

	// --- 5b. People tab: the collaborator sees the owner's name as theirs-to-ask ------------
	const people = await collab.call(
		'GET',
		`/api/knowledge/project-people?project_id=${project.id}`
	);
	check(
		"People tab lists the owner's entry for the collaborator",
		people.data?.shared === true && people.data?.others?.some((e) => e.entity.id === kyle.id),
		people.data
	);
	check(
		'People tab never carries the note',
		!JSON.stringify(people.data ?? {}).includes('Prefers a text')
	);
	const ownerPeople = await owner.call(
		'GET',
		`/api/knowledge/project-people?project_id=${project.id}`
	);
	check(
		'owner People tab lists their own entry',
		ownerPeople.data?.mine?.some((e) => e.id === kyle.id),
		ownerPeople.data
	);

	// --- 6. Leaving the project ends it ---------------------------------------------------------
	await admin
		.from('onto_project_members')
		.update({ removed_at: new Date().toISOString() })
		.eq('project_id', project.id)
		.eq('actor_id', collab.actorId);
	const gone = await collab.call(
		'GET',
		`/api/onto/task-entities?task_ids=${task.id}&knowledge=1`
	);
	check(
		'removed collaborator sees nothing',
		!kyleIn(gone.data?.lens),
		gone.data?.lens ?? gone.status
	);
	const lensDirect = await collab.call(
		'GET',
		`/api/knowledge/lens?project_id=${project.id}&record_kind=task&record_ids=${task.id}`
	);
	check(
		'lens route refuses a former member',
		lensDirect.status === 403 || !lensDirect.data?.entries?.length,
		lensDirect
	);
	const lapsed = await owner.call('GET', `/api/knowledge/entities/${kyle.id}`);
	check(
		'owner sees the grant is no longer live',
		lapsed.data?.sharing?.shares?.find((s) => s.id === ask.data?.id)?.live === false,
		lapsed.data?.sharing?.shares
	);
	const { data: events } = await admin
		.from('knowledge_share_events')
		.select('event')
		.eq('share_id', ask.data?.id);
	check(
		'history recorded ask + grant',
		['requested', 'granted'].every((e) => events?.some((r) => r.event === e)),
		events
	);
} finally {
	if (!keep) {
		await admin.from('knowledge_entities').delete().eq('id', kyle.id);
		if (ownCopy) await admin.from('knowledge_entities').delete().eq('id', ownCopy);
		await admin
			.from('knowledge_sources')
			.delete()
			.in('id', [webSource, importSource, taskSource]);
		await admin.from('onto_projects').delete().eq('id', project.id);
		await admin.from('knowledge_runs').delete().eq('id', run.id);
		console.log('cleaned up');
	}
}
console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
process.exit(failures ? 1 : 0);
