// docs/technical/reviews/agentic-chat-harness-audit-2026-09-08/evidence/pull-h-raw.mjs
// Lane H raw pull. SELECT-only. Writes raw rows to the session scratchpad (never committed;
// they contain message text). Prints only distributions/keys. Never prints keys or emails.
import { createClient } from '/Users/djwayne/buildos-platform/apps/web/node_modules/@supabase/supabase-js/dist/index.mjs';
import fs from 'node:fs';
import path from 'node:path';

const RAW = process.env.RAW_DIR;
if (!RAW) throw new Error('RAW_DIR required');
fs.mkdirSync(RAW, { recursive: true });
const SINCE = process.env.SINCE ?? '2026-09-04T17:14:00Z';
const env = Object.fromEntries(
	fs
		.readFileSync('/Users/djwayne/buildos-platform/apps/web/.env', 'utf8')
		.split('\n')
		.filter((l) => l.includes('=') && !l.trim().startsWith('#'))
		.map((l) => {
			const i = l.indexOf('=');
			return [
				l.slice(0, i).trim(),
				l
					.slice(i + 1)
					.trim()
					.replace(/^"|"$/g, '')
			];
		})
);
const sb = createClient(env.PUBLIC_SUPABASE_URL, env.PRIVATE_SUPABASE_SERVICE_KEY, {
	auth: { persistSession: false }
});
const count = (arr, f) =>
	arr.reduce((m, x) => {
		const k = f(x) ?? 'null';
		m[k] = (m[k] || 0) + 1;
		return m;
	}, {});

async function paged(build) {
	const rows = [];
	for (let from = 0; ; from += 1000) {
		const { data, error } = await build(from, from + 999);
		if (error) throw new Error(error.message);
		rows.push(...(data ?? []));
		if (!data || data.length < 1000) break;
	}
	return rows;
}
async function related(table, select, col, ids, refine = (q) => q) {
	const out = [];
	const uniq = [...new Set(ids.filter(Boolean))];
	for (let i = 0; i < uniq.length; i += 150) {
		const chunk = uniq.slice(i, i + 150);
		out.push(
			...(await paged((a, b) =>
				refine(sb.from(table).select(select).in(col, chunk)).range(a, b)
			))
		);
	}
	return out;
}

// 1. turns (no request_payload)
const turns = await paged((a, b) =>
	sb
		.from('chat_turn_runs')
		.select(
			'id,user_id,session_id,status,execution_mode,context_type,source,entity_id,project_id,llm_pass_count,tool_call_count,tool_round_count,validation_failure_count,started_at,worker_started_at,execution_started_at,finished_at,terminalized_at,failure_code,finished_reason,cancel_reason,prepared_surface_profile,prepared_prompt_hit,prepared_prompt_miss_reason,request_prewarmed_context,history_for_model_count,raw_history_count,history_strategy,history_compressed,prompt_snapshot_id,first_lane,first_canonical_op,first_skill_path,first_help_path,mutation_reserved_at,irreversible_boundary_at,execution_generation,assistant_message_id,user_message_id,queue_job_id,stream_run_id,timing_metric_id,request_message'
		)
		.gte('started_at', SINCE)
		.order('started_at', { ascending: true })
		.range(a, b)
);
const ids = turns.map((t) => t.id);
console.log('turns', turns.length, JSON.stringify(count(turns, (t) => t.status)));

// 2. users -> class (email matched in code, never printed)
const { data: users, error: ue } = await sb
	.from('users')
	.select('id,email')
	.in('id', [...new Set(turns.map((t) => t.user_id))]);
if (ue) throw new Error(ue.message);
const userClass = Object.fromEntries(
	users.map((u) => {
		const e = (u.email || '').toLowerCase();
		const cls = e.includes('djwayne') ? 'DJ' : /e2e|harness|test/.test(e) ? 'HARNESS' : 'OTHER';
		return [u.id, cls];
	})
);
fs.writeFileSync(path.join(RAW, 'user-class.json'), JSON.stringify(userClass));
console.log('user classes', JSON.stringify(count(Object.values(userClass), (x) => x)));

// 3. usage
const usage = await related(
	'llm_usage_logs',
	'id,turn_run_id,operation_type,model_requested,model_used,provider,profile,temperature,prompt_tokens,completion_tokens,cached_prompt_tokens,cache_write_tokens,reasoning_tokens,total_tokens,total_cost_usd,input_cost_usd,output_cost_usd,openrouter_cache_status,openrouter_usage_cost_usd,response_time_ms,status,error_message,max_tokens,metadata,request_started_at,request_completed_at,created_at',
	'turn_run_id',
	ids
);
console.log('usage', usage.length, JSON.stringify(count(usage, (u) => u.operation_type)));
const mk = {};
for (const u of usage) for (const k of Object.keys(u.metadata || {})) mk[k] = (mk[k] || 0) + 1;
console.log('usage metadata keys', JSON.stringify(mk));

// 4. tools
const tools = await related(
	'chat_tool_executions',
	'id,turn_run_id,tool_name,tool_category,success,error_message,execution_time_ms,zero_result,result_count,requires_user_action,sequence_index,effect_id,gateway_op,help_path,created_at,arguments,result',
	'turn_run_id',
	ids
);
console.log('tools', tools.length, JSON.stringify(count(tools, (t) => t.tool_category)));

// 5. events (all types; payload kept raw in scratchpad)
const events = await related(
	'chat_turn_events',
	'id,turn_run_id,event_type,phase,sequence_index,execution_generation,created_at,payload',
	'turn_run_id',
	ids
);
console.log('events', events.length, JSON.stringify(count(events, (e) => e.event_type)));
const pk = {};
for (const e of events) {
	const s = (pk[e.event_type] ||= {});
	for (const k of Object.keys(e.payload || {})) s[k] = (s[k] || 0) + 1;
}
console.log('event payload keys', JSON.stringify(pk));

// 6. observations
const obs = await related(
	'agentic_chat_execution_observations',
	'id,turn_run_id,event_type,phase,observed_at,execution_generation,payload',
	'turn_run_id',
	ids
);
console.log('observations', obs.length, JSON.stringify(count(obs, (o) => o.event_type)));
const ok = {};
for (const o of obs) {
	const s = (ok[o.event_type] ||= {});
	for (const k of Object.keys(o.payload || {})) s[k] = (s[k] || 0) + 1;
}
console.log('observation payload keys', JSON.stringify(ok));

// 7. prompt snapshots
const snaps = await related(
	'chat_prompt_snapshots',
	'id,turn_run_id,prompt_variant,snapshot_version,system_prompt_chars,message_chars,approx_prompt_tokens,prompt_sections,tool_definitions,model_messages,system_prompt,created_at',
	'turn_run_id',
	ids
);
console.log('snapshots', snaps.length, JSON.stringify(count(snaps, (s) => s.prompt_variant)));

// 8. messages (assistant + user)
const msgIds = [
	...turns.map((t) => t.assistant_message_id),
	...turns.map((t) => t.user_message_id)
].filter(Boolean);
const messages = await related(
	'chat_messages',
	'id,role,content,metadata,created_at,message_type,error_code,session_id',
	'id',
	msgIds
);
console.log('messages', messages.length, JSON.stringify(count(messages, (m) => m.role)));
const mmk = {};
for (const m of messages)
	for (const k of Object.keys(m.metadata || {}))
		mmk[`${m.role}:${k}`] = (mmk[`${m.role}:${k}`] || 0) + 1;
console.log('message metadata keys', JSON.stringify(mmk));

// 9. queue jobs
const jobs = await related(
	'queue_jobs',
	'id,queue_job_id,job_type,status,attempts,max_attempts,error_message,metadata,scheduled_for,started_at,processed_at,completed_at,created_at,updated_at',
	'id',
	turns.map((t) => t.queue_job_id)
);
console.log(
	'queue_jobs',
	jobs.length,
	JSON.stringify(count(jobs, (j) => `${j.job_type}:${j.status}`))
);
// also any agentic chat jobs in window not tied to a turn
const jobsWindow = await paged((a, b) =>
	sb
		.from('queue_jobs')
		.select(
			'id,queue_job_id,job_type,status,attempts,max_attempts,error_message,metadata,scheduled_for,started_at,processed_at,completed_at,created_at,updated_at'
		)
		.gte('created_at', SINCE)
		.eq('job_type', 'agentic_chat_turn')
		.range(a, b)
);
console.log(
	'agentic queue_jobs in window',
	jobsWindow.length,
	JSON.stringify(count(jobsWindow, (j) => `${j.job_type}:${j.status}`))
);

for (const [n, d] of Object.entries({
	turns,
	usage,
	tools,
	events,
	obs,
	snaps,
	messages,
	jobs,
	jobsWindow
}))
	fs.writeFileSync(path.join(RAW, `${n}.json`), JSON.stringify(d));
console.log('wrote raw to', RAW);
