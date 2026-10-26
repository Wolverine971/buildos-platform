// apps/web/tests/browser/supabase-fixture.mjs
import { createServer } from 'node:http';
import { createHmac, randomUUID } from 'node:crypto';
export const ids = {
	user: '10000000-0000-4000-8000-000000000001',
	actor: '20000000-0000-4000-8000-000000000001',
	project: '30000000-0000-4000-8000-000000000001',
	task: '40000000-0000-4000-8000-000000000001',
	invite: '50000000-0000-4000-8000-000000000001',
	session: '60000000-0000-4000-8000-000000000001'
};
export const credentials = {
	email: 'browser@example.test',
	password: 'Browser-fixture-password-1!'
};
let tables, invites, unexpected, calls;
const now = () => new Date().toISOString();
const access = {
	can_edit: true,
	can_admin: true,
	can_invite: true,
	can_view_logs: true,
	is_owner: true,
	is_authenticated: true,
	current_actor_id: ids.actor
};
function reset() {
	const stamp = now();
	const profile = {
		id: ids.user,
		email: credentials.email,
		name: 'Browser Tester',
		timezone: 'UTC',
		is_admin: false,
		deletion_status: null,
		onboarding_completed_at: stamp,
		onboarding_step: 'complete',
		created_at: stamp,
		updated_at: stamp
	};
	const project = {
		id: ids.project,
		name: 'Browser test project',
		description: 'A synthetic browser fixture',
		kind: 'project',
		type_key: 'project.generic',
		state_key: 'active',
		created_by: ids.actor,
		props: {},
		created_at: stamp,
		updated_at: stamp,
		access_role: 'owner',
		access_level: 'admin',
		task_count: 1,
		document_count: 0,
		goal_count: 0,
		plan_count: 0,
		milestone_count: 0,
		risk_count: 0,
		image_count: 0,
		next_step_short: null,
		next_step_long: null,
		icon_svg: null,
		icon_emoji: null
	};
	tables = {
		users: [profile],
		onto_actors: [{ id: ids.actor, user_id: ids.user, name: profile.name }],
		onto_projects: [project],
		onto_tasks: [
			{
				id: ids.task,
				project_id: ids.project,
				title: 'Review browser fixture',
				description: 'Edit me through the real task UI',
				type_key: 'task.execute',
				state_key: 'todo',
				priority: 2,
				due_at: stamp.slice(0, 10) + 'T23:59:59.000Z',
				start_at: null,
				created_at: stamp,
				updated_at: stamp,
				created_by: ids.actor,
				deleted_at: null,
				archived_at: null,
				props: {}
			}
		],
		onto_project_members: [
			{
				id: randomUUID(),
				project_id: ids.project,
				actor_id: ids.actor,
				user_id: ids.user,
				role_key: 'owner',
				access: 'admin'
			}
		]
	};
	// Explicitly empty boundaries. Unknown tables/RPCs fail and are reported to the test.
	for (const name of [
		'external_agent_callers',
		'user_email_connections',
		'onto_edges',
		'onto_documents',
		'onto_goals',
		'onto_plans',
		'onto_milestones',
		'onto_risks',
		'onto_events',
		'onto_task_assignees',
		'onto_project_logs',
		'security_events',
		'errors',
		'notifications',
		'notification_subscriptions',
		'user_notification_preferences',
		'user_brief_preferences',
		'daily_briefs',
		'chat_sessions',
		'chat_messages',
		'chat_capture_checkpoints',
		'chat_session_members',
		'user_calendar_connections',
		'workspace_suggestions',
		'onto_project_integrations',
		'user_contexts',
		'agent_permission_requests',
		'inbox_items',
		'chat_turn_runs',
		'chat_tool_executions',
		'chat_session_visibility',
		'chat_sessions_projects',
		'onto_task_documents', 'onto_task_entities',
		'onto_project_activity',
		'onto_project_calendar_links',
		'user_calendar_preferences'
	])
		tables[name] = [];
	tables.ontology_daily_briefs = [{ id:randomUUID(), user_id:ids.user, actor_id:ids.actor, brief_date:stamp.slice(0,10), generation_status:'completed', executive_summary:'A fixture day', llm_analysis:'A fixture day', created_at:stamp, updated_at:stamp, metadata:{} }];
	invites = [];
	unexpected = [];
	calls = [];
}
function user() {
	return {
		id: ids.user,
		aud: 'authenticated',
		role: 'authenticated',
		email: credentials.email,
		email_confirmed_at: now(),
		created_at: now(),
		app_metadata: { provider: 'email', providers: ['email'] },
		user_metadata: { name: 'Browser Tester' },
		identities: []
	};
}
function token() {
	const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
	const body = [
		encode({ alg: 'HS256', typ: 'JWT' }),
		encode({
			sub: ids.user,
			aud: 'authenticated',
			role: 'authenticated',
			email: credentials.email,
			iat: Math.floor(Date.now() / 1000),
			exp: Math.floor(Date.now() / 1000) + 3600
		})
	].join('.');
	return (
		body +
		'.' +
		createHmac('sha256', 'local-browser-fixture-only').update(body).digest('base64url')
	);
}
function rpc(name, body) {
	const project = tables.onto_projects[0];
	switch (name) {
		case 'log_client_error': tables.errors.push(body); return randomUUID();
		case 'get_chat_session_restore_v1': return { messages: tables.chat_messages, toolExecutions:[], turnRuns:tables.chat_turn_runs, turnEvents:[], workflows:[], truncated:false, historyWindow:{ toolsTruncated:false, eventsTruncated:false } };
		case 'ensure_actor_for_user':
			return ids.actor;
		case 'get_onto_project_summaries_v1':
			return tables.onto_projects;
		case 'list_calendar_items':
			return [];
		case 'list_pending_project_invites':
			return invites;
		case 'get_project_skeleton_with_access_v2':
			return { ...project, access, route_access_state: 'allowed' };
		case 'onto_project_family_v1':
			return { project_id: ids.project, parent: null, children: [], shelf: [] };
		case 'get_project_route_redirect':
			return { status: 'not_merged' };
		case 'get_project_full':
		case 'get_project_full_v2_initial':
			return {
				project,
				tasks: tables.onto_tasks,
				goals: [],
				plans: [],
				milestones: [],
				risks: [],
				documents: [],
				edges: [],
				access,
				members: tables.onto_project_members
			};
		case 'current_actor_has_project_member_access':
		case 'current_actor_has_project_access':
			return true;
		case 'onto_task_update_with_relationships_atomic': {
			const task = tables.onto_tasks.find((row) => row.id === body.p_task_id);
			if (!task) throw new Error('Unknown fixture task');
			Object.assign(task, body.p_updates, { updated_at: now() });
			return { task, assignees: [] };
		}
		case 'accept_project_invite_by_id': {
			const invite = invites.find((row) => row.invite_id === body.p_invite_id);
			if (!invite) throw new Error('Unknown fixture invite');
			invites = invites.filter((row) => row !== invite);
			return [
				{
					...invite,
					status: 'accepted',
					role_key: 'editor',
					access: 'write',
					agent_access: 'read'
				}
			];
		}
		default:
			throw new Error(`Unimplemented fixture RPC ${name}`);
	}
}
function matches(row, params) {
	for (const [key, value] of params) {
		if (['select', 'order', 'limit', 'offset', 'on_conflict', 'or', 'and'].includes(key))
			continue;
		const [op, ...rest] = value.split('.');
		const expected = rest.join('.');
		const actual = row[key];
		if (op === 'eq' && String(actual) !== expected) return false;
		if (op === 'neq' && String(actual) === expected) return false;
		if (op === 'is' && expected === 'null' && actual != null) return false;
		if (
			op === 'in' &&
			!expected
				.slice(1, -1)
				.split(',')
				.map((v) => v.replaceAll('"', ''))
				.includes(String(actual))
		)
			return false;
		if (op === 'lt' && !(actual < expected)) return false;
		if (op === 'gte' && !(actual >= expected)) return false;
	}
	return true;
}
export async function startFixtures() {
	reset();
	const server = createServer(async (req, res) => {
		res.setHeader('access-control-allow-origin', 'http://127.0.0.1:4173');
		res.setHeader(
			'access-control-allow-headers',
			'authorization,apikey,content-type,x-client-info,prefer,range,accept-profile,content-profile,x-supabase-api-version'
		);
		res.setHeader('access-control-allow-methods', 'GET,HEAD,POST,PATCH,DELETE,OPTIONS');
		res.setHeader('access-control-expose-headers', 'content-range');
		res.setHeader('content-type', 'application/json');
		if (req.method === 'OPTIONS') {
			res.end();
			return;
		}
		const url = new URL(req.url, 'http://127.0.0.1:54329');
		let body = '';
		for await (const part of req) body += part;
		try {
			const data = body ? JSON.parse(body) : {};
			let result;
			if (url.pathname === '/__fixture/reset') {
				reset();
				result = ids;
			} else if (url.pathname === '/__fixture/state')
				result = { tables, invites, unexpected, calls };
			else if (url.pathname === '/__fixture/invite') {
				invites = [
					{
						invite_id: ids.invite,
						project_id: ids.project,
						project_name: 'Browser test project',
						role_key: 'editor',
						access: 'write',
						status: 'pending',
						expires_at: new Date(Date.now() + 86400_000).toISOString(),
						created_at: now(),
						can_accept: true,
						invited_by_name: 'Fixture Owner'
					}
				];
				result = invites;
			} else if (url.pathname === '/auth/v1/token') {
				if (
					url.searchParams.get('grant_type') === 'password' &&
					(data.email !== credentials.email || data.password !== credentials.password)
				) {
					res.statusCode = 400;
					result = {
						error: 'invalid_grant',
						error_description: 'Invalid login credentials'
					};
				} else
					result = {
						access_token: token(),
						token_type: 'bearer',
						expires_in: 3600,
						expires_at: Math.floor(Date.now() / 1000) + 3600,
						refresh_token: 'fixture-refresh-token',
						user: user()
					};
			} else if (url.pathname === '/auth/v1/user') result = user();
			else if (url.pathname === '/auth/v1/logout') result = {};
			else if (url.pathname === '/auth/v1/.well-known/jwks.json') result = { keys: [] };
			else if (url.pathname.startsWith('/rest/v1/')) {
				calls.push({
					method: req.method,
					path: url.pathname,
					query: url.search,
					body: data
				});
				const name = url.pathname.slice('/rest/v1/'.length);
				if (name.startsWith('rpc/')) result = rpc(name.slice(4), data);
				else {
					if (!Object.hasOwn(tables, name))
						throw new Error(`Unimplemented fixture table ${name}`);
					let selected = tables[name].filter((row) => matches(row, url.searchParams));
					if (req.method === 'PATCH') selected.forEach((row) => Object.assign(row, data));
					if (req.method === 'POST') {
						const rows = Array.isArray(data) ? data : [data];
						selected = rows.map((row) => {
							const existing =
								row.id && tables[name].find((item) => item.id === row.id);
							if (existing) return Object.assign(existing, row);
							const created = { id: randomUUID(), created_at: now(), ...row };
							tables[name].push(created);
							return created;
						});
					}
					if (req.method === 'DELETE')
						tables[name] = tables[name].filter((row) => !selected.includes(row));
					res.setHeader(
						'content-range',
						selected.length ? `0-${selected.length - 1}/${selected.length}` : '*/0'
					);
					result = String(req.headers.accept).includes('vnd.pgrst.object')
						? (selected[0] ?? null)
						: selected;
					if (req.method === 'HEAD') {
						res.end();
						return;
					}
				}
			} else throw new Error(`Unimplemented fixture endpoint ${req.method} ${url.pathname}`);
			res.end(JSON.stringify(result));
		} catch (error) {
			unexpected.push(error.message);
			console.error(error.message);
			res.statusCode = 500;
			res.end(JSON.stringify({ message: error.message, code: 'FIXTURE_UNIMPLEMENTED' }));
		}
	});
	await new Promise((resolve, reject) => {
		server.once('error', reject);
		server.listen(54329, '127.0.0.1', resolve);
	});
	return server;
}
