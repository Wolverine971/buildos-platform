// apps/web/scripts/reentry-compass/probe1-recon.mjs
// Phase 0 recon probe — READ ONLY. Counts + distinct-value distributions needed to
// operationalize "user-attributed mutation" and "return episode" for tasker/43.
import { readFileSync } from 'fs';

const envRaw = readFileSync(new URL('../../.env', import.meta.url).pathname, 'utf8');
const env = {};
for (const line of envRaw.split('\n')) {
	const t = line.trim();
	if (!t || t.startsWith('#')) continue;
	const i = t.indexOf('=');
	if (i < 0) continue;
	env[t.slice(0, i).trim()] = t
		.slice(i + 1)
		.trim()
		.replace(/^["']|["']$/g, '');
}

import { createRequire } from 'module';
const require = createRequire(new URL('../../package.json', import.meta.url).pathname);
const { createClient } = require('@supabase/supabase-js');
const sb = createClient(env.PUBLIC_SUPABASE_URL, env.PRIVATE_SUPABASE_SERVICE_KEY, {
	auth: { persistSession: false }
});

async function count(table, filter) {
	let q = sb.from(table).select('*', { count: 'exact', head: true });
	if (filter) q = filter(q);
	const { count: c, error } = await q;
	return error ? `ERR: ${error.message}` : c;
}

const out = {};
out.counts = {
	users: await count('users'),
	onto_projects: await count('onto_projects'),
	onto_projects_live: await count('onto_projects', (q) =>
		q.is('deleted_at', null).is('archived_at', null)
	),
	onto_project_logs: await count('onto_project_logs'),
	onto_tasks: await count('onto_tasks'),
	user_activity_logs: await count('user_activity_logs'),
	chat_messages: await count('chat_messages'),
	feature_flags: await count('feature_flags')
};

// Distribution of change_source / entity_type / action in onto_project_logs (page through).
const dist = { change_source: {}, entity_type: {}, action: {}, by_month: {} };
let from = 0;
const PAGE = 1000;
let userIds = new Set();
for (;;) {
	const { data, error } = await sb
		.from('onto_project_logs')
		.select('change_source, entity_type, action, changed_by, created_at')
		.order('created_at', { ascending: true })
		.range(from, from + PAGE - 1);
	if (error) {
		out.logsError = error.message;
		break;
	}
	for (const r of data) {
		dist.change_source[r.change_source ?? '<null>'] =
			(dist.change_source[r.change_source ?? '<null>'] || 0) + 1;
		dist.entity_type[r.entity_type] = (dist.entity_type[r.entity_type] || 0) + 1;
		dist.action[r.action] = (dist.action[r.action] || 0) + 1;
		const m = (r.created_at || '').slice(0, 7);
		dist.by_month[m] = (dist.by_month[m] || 0) + 1;
		if (r.changed_by) userIds.add(r.changed_by);
	}
	if (data.length < PAGE) break;
	from += PAGE;
	if (from > 500000) break;
}
out.log_dist = dist;
out.distinct_changed_by = userIds.size;

// user_activity_logs shape (if populated)
{
	const { data, error } = await sb
		.from('user_activity_logs')
		.select('*')
		.order('created_at', { ascending: false })
		.limit(5);
	out.user_activity_sample = error ? `ERR: ${error.message}` : data;
}

// users table shape: one row, keys only + internal-flag related fields
{
	const { data, error } = await sb.from('users').select('*').limit(1);
	out.users_columns = error ? `ERR: ${error.message}` : Object.keys(data?.[0] ?? {});
}

// feature_flags shape
{
	const { data, error } = await sb.from('feature_flags').select('*').limit(5);
	out.feature_flags_sample = error ? `ERR: ${error.message}` : data;
}

console.log(JSON.stringify(out, null, 2));
