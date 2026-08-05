// scripts/verify-agentic-chat-read-canary.ts

import { config } from 'dotenv';
import {
	type AgenticChatReadCanaryEvidence,
	parseAgenticChatReadCanaryTurnIdArgument,
	verifyAgenticChatReadCanaryEvidence
} from './lib/agentic-chat-read-canary.js';

config({ path: '.env' });
config({ path: '.env.local', override: true });

const requestedTurnRunId = parseAgenticChatReadCanaryTurnIdArgument(process.argv.slice(2));

if (!requestedTurnRunId) {
	fail('Usage: pnpm verify:agentic-chat-read-canary -- --turn-id <canonical-uuid>');
}
const turnRunId: string = requestedTurnRunId;

const configuredSupabaseUrl = process.env.PUBLIC_SUPABASE_URL?.trim().replace(/\/$/, '');
const configuredServiceKey = process.env.PRIVATE_SUPABASE_SERVICE_KEY?.trim();
if (!configuredSupabaseUrl || !configuredServiceKey) {
	fail('PUBLIC_SUPABASE_URL and PRIVATE_SUPABASE_SERVICE_KEY are required.');
}
const supabaseUrl: string = configuredSupabaseUrl;
const serviceKey: string = configuredServiceKey;

void main().catch((error: unknown) => {
	fail(error instanceof Error ? error.message : 'Canary evidence verification failed.');
});

async function main(): Promise<never> {
	const turns = await select('chat_turn_runs', {
		select: 'id,assistant_message_id,correlation_id,execution_generation,execution_mode,failure_code,finished_reason,input_artifact_id,last_event_sequence,prompt_snapshot_id,queue_job_id,session_id,status,stream_run_id,terminal_event_id,tool_call_count,tool_round_count,transport_contract_version,user_id',
		id: `eq.${turnRunId}`,
		limit: '2'
	});
	if (turns.length !== 1) {
		reportAndExit(
			verifyAgenticChatReadCanaryEvidence(emptyEvidence({ turns }), turnRunId),
			'Canary evidence failed before linked-row collection.'
		);
	}

	const turn = turns[0] as Record<string, unknown>;
	const generation = String(turn.execution_generation ?? '');
	const inputArtifactId = text(turn.input_artifact_id);
	const promptSnapshotId = text(turn.prompt_snapshot_id);
	const assistantMessageId = text(turn.assistant_message_id);
	const queueJobId = text(turn.queue_job_id);

	const [
		artifacts,
		toolExecutions,
		events,
		streamStates,
		promptSnapshots,
		assistantMessages,
		effects,
		queueJobs,
		lifecycleObservations
	] = await Promise.all([
		linked('chat_turn_input_artifacts', inputArtifactId, {
			select: 'id,artifact_version,prepared,session_id,turn_run_id,user_id'
		}),
		select('chat_tool_executions', {
			select: 'affected_entities,arguments,created_at,effect_id,error_message,message_id,provider_tool_call_id,requires_user_action,result,result_count,sequence_index,session_id,stream_run_id,success,tool_category,tool_name,turn_run_id,zero_result',
			turn_run_id: `eq.${turnRunId}`,
			order: 'sequence_index.asc',
			limit: '3'
		}),
		select('chat_turn_events', {
			select: 'created_at,event_id,event_type,execution_generation,payload,phase,sequence_index,session_id,stream_run_id,turn_run_id,user_id',
			turn_run_id: `eq.${turnRunId}`,
			execution_generation: `eq.${generation}`,
			order: 'sequence_index.asc',
			limit: '100'
		}),
		select('chat_turn_stream_state', {
			select: 'assistant_text,durable_through_sequence,execution_generation,projection,projection_durable_sequence,reconcile_required,session_id,snapshot_sequence,turn_run_id,user_id',
			turn_run_id: `eq.${turnRunId}`,
			limit: '2'
		}),
		linked('chat_prompt_snapshots', promptSnapshotId, {
			select: 'id,messages_sha256,model_messages,session_id,snapshot_version,system_prompt_sha256,tool_definitions,turn_run_id,user_id'
		}),
		linked('chat_messages', assistantMessageId, {
			select: 'completion_tokens,content,id,metadata,prompt_tokens,role,session_id,total_tokens,user_id'
		}),
		select('chat_turn_effects', {
			select: 'id',
			turn_run_id: `eq.${turnRunId}`,
			limit: '2'
		}),
		linked('queue_jobs', queueJobId, {
			select: 'completed_at,error_message,id,job_type,metadata,result,status,user_id'
		}),
		select('agentic_chat_worker_lifecycle_observations', {
			select: 'event_type,execution_generation,observation_sequence_index,phase,session_id,stream_run_id,turn_run_id,user_id',
			turn_run_id: `eq.${turnRunId}`,
			execution_generation: `eq.${generation}`,
			order: 'observation_sequence_index.asc',
			limit: '20'
		})
	]);

	const verification = verifyAgenticChatReadCanaryEvidence(
		{
			turns,
			artifacts,
			toolExecutions,
			events,
			streamStates,
			promptSnapshots,
			assistantMessages,
			effects,
			queueJobs,
			lifecycleObservations
		},
		turnRunId
	);
	return reportAndExit(verification, 'Canary durable evidence verification completed.');
}

async function select(table: string, parameters: Record<string, string>): Promise<unknown[]> {
	const url = new URL(`/rest/v1/${table}`, supabaseUrl);
	for (const [key, value] of Object.entries(parameters)) url.searchParams.set(key, value);
	const response = await fetch(url, {
		headers: {
			Accept: 'application/json',
			Authorization: `Bearer ${serviceKey}`,
			apikey: serviceKey
		},
		signal: AbortSignal.timeout(30_000)
	});
	if (!response.ok) {
		const requestId = response.headers.get('x-request-id');
		throw new Error(
			`Supabase read for ${table} failed with HTTP ${response.status}${requestId ? ` (request ${requestId})` : ''}.`
		);
	}
	const body: unknown = await response.json();
	if (!Array.isArray(body))
		throw new Error(`Supabase read for ${table} returned a non-array body.`);
	return body;
}

function linked(
	table: string,
	id: string | null,
	parameters: Record<string, string>
): Promise<unknown[]> {
	return id ? select(table, { ...parameters, id: `eq.${id}`, limit: '2' }) : Promise.resolve([]);
}

function text(value: unknown): string | null {
	return typeof value === 'string' && value.length > 0 ? value : null;
}

function emptyEvidence(
	overrides: Partial<AgenticChatReadCanaryEvidence> = {}
): AgenticChatReadCanaryEvidence {
	return {
		turns: [],
		artifacts: [],
		toolExecutions: [],
		events: [],
		streamStates: [],
		promptSnapshots: [],
		assistantMessages: [],
		effects: [],
		queueJobs: [],
		lifecycleObservations: [],
		...overrides
	};
}

function reportAndExit(
	verification: ReturnType<typeof verifyAgenticChatReadCanaryEvidence>,
	label: string
): never {
	console.log(label);
	console.log(JSON.stringify(verification.summary, null, 2));
	console.log(
		'Provider HTTP tool schema and second-pass tool disabling remain source-controlled test gates; durable rows cannot reconstruct those requests.'
	);
	if (!verification.ok) {
		for (const [index, failure] of verification.failures.entries()) {
			console.error(`${index + 1}. [${failure.code}] ${failure.message}`);
		}
		process.exit(1);
	}
	console.log('PASS: the turn satisfies the bounded production read durable-evidence contract.');
	process.exit(0);
}

function fail(message: string): never {
	console.error(`error: ${message}`);
	process.exit(2);
}
