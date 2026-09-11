// apps/web/src/lib/tests/agentic-e2e/harness/gate-evidence.ts
// Raw evidence is opt-in and limited to the isolated QA database. Phase 0 keeps
// its existing redacted contract. Never serialize the context (cookies/clients).
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { ScenarioContext, TurnResult } from './types';
import { waitForToolExecutions } from './telemetry';

export function findGateProviderPassFiles(
	directory: string,
	usageRows: readonly { id: string; turn_run_id: string | null }[]
): string[] {
	if (!usageRows.length) throw new Error('Missing model usage evidence');
	const turnIds = new Set(usageRows.map((row) => row.turn_run_id).filter(Boolean));
	const files = readdirSync(directory).filter(
		(name) => name.endsWith('.json') && [...turnIds].some((id) => name.includes(`--${id}--`))
	);
	const captured = new Set<string>();
	for (const file of files) {
		const dump = JSON.parse(readFileSync(resolve(directory, file), 'utf8'));
		if (dump.outcome?.status && dump.outcome.status !== 'pending')
			captured.add(dump.usageLogId);
	}
	for (const row of usageRows) {
		if (!captured.has(row.id)) throw new Error(`Missing completed provider capture: ${row.id}`);
	}
	return files;
}

export async function gateSnapshot(ctx: ScenarioContext): Promise<Record<string, unknown> | null> {
	if (!process.env.AGENTIC_GATE_EVIDENCE_DIR) return null;
	if (process.env.AGENTIC_GATE_DATABASE_ISOLATED !== 'true')
		throw new Error('Raw gate capture requires an isolated database');
	const { data: projects, error } = await ctx.db.admin
		.from('onto_projects')
		.select('*')
		.eq('created_by', ctx.db.actorId)
		.is('deleted_at', null);
	if (error) throw new Error(`Gate snapshot projects: ${error.message}`);
	const ids = (projects ?? []).map((project) => project.id);
	const snapshot: Record<string, unknown> = { projects };
	for (const table of ['onto_tasks', 'onto_edges', 'onto_documents', 'onto_events'] as const) {
		if (!ids.length) {
			snapshot[table] = [];
			continue;
		}
		const { data, error } = await ctx.db.admin.from(table).select('*').in('project_id', ids);
		if (error) throw new Error(`Gate snapshot ${table}: ${error.message}`);
		snapshot[table] = data;
	}
	return snapshot;
}

export async function captureGateTurn(params: {
	ctx: ScenarioContext;
	scenarioId: string;
	repetition: number;
	turnIndex: number;
	result: TurnResult;
	evidence: Record<string, unknown>;
}): Promise<string[]> {
	const dir = process.env.AGENTIC_GATE_EVIDENCE_DIR;
	if (!dir) return [];
	if (process.env.AGENTIC_GATE_DATABASE_ISOLATED !== 'true')
		throw new Error('Raw gate capture requires an isolated database');
	const captureErrors: string[] = [];
	const record: Record<string, unknown> = { ...params.evidence, result: params.result };
	try {
		record.after = await gateSnapshot(params.ctx);
		if (params.result.streamRunId) {
			record.receipts = await waitForToolExecutions(
				params.ctx.db.admin,
				params.result.streamRunId,
				params.result.toolResults.length
			);
			const { data, error } = await params.ctx.db.admin
				.from('llm_usage_logs')
				.select(
					'id,turn_run_id,model_requested,model_used,provider,request_started_at,request_completed_at,prompt_tokens,cached_prompt_tokens,completion_tokens,reasoning_tokens,response_time_ms,total_cost_usd,metadata'
				)
				.eq('stream_run_id', params.result.streamRunId)
				.order('request_started_at');
			if (error) throw new Error(`Gate model evidence: ${error.message}`);
			record.modelPasses = data;
			const providerDirectory = process.env.AGENTIC_CHAT_LOCAL_PROMPT_DUMP_DIRECTORY;
			if (providerDirectory)
				record.providerPassFiles = findGateProviderPassFiles(providerDirectory, data ?? []);
		}
	} catch (error) {
		captureErrors.push(String(error));
	}
	mkdirSync(dir, { recursive: true, mode: 0o700 });
	const name = `${params.scenarioId}-${params.repetition}-${params.turnIndex}`.replace(
		/[^a-zA-Z0-9-]/g,
		'_'
	);
	writeFileSync(
		resolve(dir, `${name}.json`),
		JSON.stringify(
			{ schemaVersion: 1, ...record, captureErrors },
			(_key, value) =>
				value instanceof Error ? { name: value.name, message: value.message } : value,
			2
		) + '\n',
		{ mode: 0o600 }
	);
	return captureErrors;
}
