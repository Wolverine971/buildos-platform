import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

const APP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const PAGE_SIZE = 1_000;
const ID_CHUNK_SIZE = 150;

export async function loadHealthData({ since, until, userId }) {
	loadEnvironment();
	const supabaseUrl = process.env.PUBLIC_SUPABASE_URL;
	const serviceKey = process.env.PRIVATE_SUPABASE_SERVICE_KEY;
	if (!supabaseUrl || !serviceKey) {
		throw new Error(
			'Missing PUBLIC_SUPABASE_URL or PRIVATE_SUPABASE_SERVICE_KEY in apps/web/.env.'
		);
	}

	const client = createClient(supabaseUrl, serviceKey, {
		auth: { persistSession: false, autoRefreshToken: false }
	});
	const turns = await fetchPaged((from, to) => {
		let query = client
			.from('chat_turn_runs')
			.select(
				'id,user_id,status,execution_mode,llm_pass_count,started_at,finished_at,failure_code,finished_reason,assistant_message_id,user_message_id,queue_job_id,request_message'
			)
			.gte('started_at', since)
			.lt('started_at', until)
			.order('started_at', { ascending: true })
			.order('id', { ascending: true });
		if (userId) query = query.eq('user_id', userId);
		return query.range(from, to);
	});

	const turnIds = turns.map((turn) => turn.id);
	const usage = await fetchRelated(
		client,
		'llm_usage_logs',
		'turn_run_id,operation_type,metadata,prompt_tokens,cached_prompt_tokens,response_time_ms,total_cost_usd',
		'turn_run_id',
		turnIds
	);
	const tools = await fetchRelated(
		client,
		'chat_tool_executions',
		'turn_run_id,tool_name,tool_category,success,effect_id,sequence_index',
		'turn_run_id',
		turnIds
	);
	const events = await fetchRelated(
		client,
		'chat_turn_events',
		'turn_run_id,event_type,payload,sequence_index,created_at',
		'turn_run_id',
		turnIds,
		(query) =>
			query.in('event_type', ['timing', 'done', 'turn_timing', 'terminal', 'surface_repair'])
	);
	const observations = await fetchRelated(
		client,
		'agentic_chat_execution_observations',
		'turn_run_id,event_type,payload,observed_at',
		'turn_run_id',
		turnIds
	);

	const messageIds = [
		...turns.map((turn) => turn.assistant_message_id),
		...turns.map((turn) => turn.user_message_id)
	].filter(Boolean);
	const messages = await fetchRelated(
		client,
		'chat_messages',
		'id,role,content,metadata,created_at',
		'id',
		messageIds
	);
	const queueJobIds = turns.map((turn) => turn.queue_job_id).filter(Boolean);
	const queueJobs = await fetchRelated(
		client,
		'queue_jobs',
		'id,error_message,metadata,scheduled_for,updated_at,status',
		'id',
		queueJobIds
	);

	return { turns, usage, tools, events, observations, messages, queueJobs };
}

function loadEnvironment() {
	const envPath = path.join(APP_ROOT, '.env');
	if (!fs.existsSync(envPath)) {
		throw new Error(`Expected a local environment file at ${envPath}.`);
	}
	dotenv.config({ path: envPath, quiet: true });
}

async function fetchRelated(client, table, select, column, ids, refine = (query) => query) {
	if (ids.length === 0) return [];
	const uniqueIds = [...new Set(ids)];
	const rows = [];
	for (let index = 0; index < uniqueIds.length; index += ID_CHUNK_SIZE) {
		const chunk = uniqueIds.slice(index, index + ID_CHUNK_SIZE);
		const page = await fetchPaged((from, to) => {
			const query = client.from(table).select(select).in(column, chunk);
			return refine(query).range(from, to);
		});
		rows.push(...page);
	}
	return rows;
}

async function fetchPaged(buildQuery) {
	const rows = [];
	for (let from = 0; ; from += PAGE_SIZE) {
		const { data, error } = await buildQuery(from, from + PAGE_SIZE - 1);
		if (error) throw new Error(`Production health read failed: ${error.message}`);
		rows.push(...(data ?? []));
		if (!data || data.length < PAGE_SIZE) break;
	}
	return rows;
}
