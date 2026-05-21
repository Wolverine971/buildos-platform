// apps/web/scripts/backfill-agent-call-project-logs.ts
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.PUBLIC_SUPABASE_URL;
const SERVICE_KEY =
	process.env.PRIVATE_SUPABASE_SERVICE_KEY ||
	process.env.PRIVATE_PRIVATE_SUPABASE_SERVICE_KEY ||
	process.env.SUPABASE_SERVICE_KEY;

const WRITE_OP_ACTIONS: Record<string, 'created' | 'updated' | 'deleted'> = {
	'onto.task.create': 'created',
	'onto.task.update': 'updated',
	'onto.task.docs.create_or_attach': 'created',
	'onto.document.create': 'created',
	'onto.document.update': 'updated',
	'onto.document.tree.move': 'updated',
	'onto.project.create': 'created',
	'onto.project.update': 'updated',
	'onto.goal.create': 'created',
	'onto.goal.update': 'updated',
	'onto.plan.create': 'created',
	'onto.plan.update': 'updated',
	'onto.milestone.create': 'created',
	'onto.milestone.update': 'updated',
	'onto.risk.create': 'created',
	'onto.risk.update': 'updated',
	'onto.edge.link': 'created',
	'onto.edge.unlink': 'updated',
	'cal.event.create': 'created',
	'cal.event.update': 'updated',
	'cal.event.delete': 'deleted',
	'cal.project.set': 'updated'
};

const TABLE_BY_KIND: Record<string, { table: string; select: string }> = {
	task: { table: 'onto_tasks', select: 'id, project_id, title, type_key, state_key' },
	document: { table: 'onto_documents', select: 'id, project_id, title, type_key, state_key' },
	goal: { table: 'onto_goals', select: 'id, project_id, name, type_key, state_key' },
	plan: { table: 'onto_plans', select: 'id, project_id, name, type_key, state_key' },
	milestone: { table: 'onto_milestones', select: 'id, project_id, title, type_key, state_key' },
	risk: { table: 'onto_risks', select: 'id, project_id, title, type_key, state_key' },
	event: { table: 'onto_events', select: 'id, project_id, title, type_key, state_key' },
	edge: { table: 'onto_edges', select: 'id, project_id, src_kind, src_id, dst_kind, dst_id, rel' }
};

type JsonRecord = Record<string, unknown>;

type AgentCallExecution = {
	id: string;
	created_at: string;
	status: string;
	op: string;
	entity_kind: string | null;
	entity_id: string | null;
	user_id: string;
	external_agent_caller_id: string | null;
	agent_call_session_id: string | null;
	response_payload: JsonRecord | null;
};

type ProjectLogInsert = {
	project_id: string;
	entity_type: string;
	entity_id: string;
	action: 'created' | 'updated' | 'deleted';
	before_data: JsonRecord | null;
	after_data: JsonRecord | null;
	changed_by: string;
	change_source: 'agent_call';
	external_agent_caller_id: string | null;
	agent_call_session_id: string | null;
	created_at: string;
};

function getArg(name: string): string | undefined {
	const prefixed = `--${name}=`;
	const entry = process.argv.find((arg) => arg.startsWith(prefixed));
	return entry?.slice(prefixed.length);
}

function hasFlag(name: string): boolean {
	return process.argv.includes(`--${name}`);
}

function asRecord(value: unknown): JsonRecord | null {
	return value && typeof value === 'object' && !Array.isArray(value)
		? (value as JsonRecord)
		: null;
}

function compact(value: unknown, fallback: JsonRecord): JsonRecord {
	const record = asRecord(value);
	if (!record) return fallback;

	const out: JsonRecord = {};
	for (const key of [
		'id',
		'project_id',
		'project_name',
		'title',
		'name',
		'type_key',
		'state_key',
		'priority',
		'due_at',
		'start_at',
		'completed_at',
		'rel',
		'src_kind',
		'src_id',
		'dst_kind',
		'dst_id'
	]) {
		if (record[key] !== undefined) out[key] = record[key];
	}

	return Object.keys(out).length > 0 ? out : fallback;
}

function resultRecord(execution: AgentCallExecution): JsonRecord | null {
	const payload = asRecord(execution.response_payload);
	return asRecord(payload?.result);
}

function entityPayload(execution: AgentCallExecution): unknown {
	const result = resultRecord(execution);
	if (!result || !execution.entity_kind) return null;
	return result[execution.entity_kind] ?? null;
}

function projectIdFromResponse(execution: AgentCallExecution): string | null {
	const result = resultRecord(execution);
	const entity = asRecord(entityPayload(execution));
	if (typeof entity?.project_id === 'string') return entity.project_id;
	if (typeof entity?.id === 'string' && execution.entity_kind === 'project') return entity.id;
	if (typeof result?.project_id === 'string') return result.project_id;

	const project = asRecord(result?.project);
	if (typeof project?.id === 'string') return project.id;
	if (execution.entity_kind === 'project' && execution.entity_id) return execution.entity_id;

	return null;
}

function entityTypeForLog(execution: AgentCallExecution): string | null {
	if (execution.op === 'cal.project.set') return 'project';
	return execution.entity_kind;
}

async function resolveProjectId(
	supabase: ReturnType<typeof createClient>,
	execution: AgentCallExecution
): Promise<string | null> {
	const fromResponse = projectIdFromResponse(execution);
	if (fromResponse) return fromResponse;

	const kind = execution.entity_kind;
	const entityId = execution.entity_id;
	if (!kind || !entityId) return null;

	const mapping = TABLE_BY_KIND[kind];
	if (!mapping) return null;

	const { data, error } = await supabase
		.from(mapping.table)
		.select(mapping.select)
		.eq('id', entityId)
		.maybeSingle();

	if (error) {
		console.warn(`Failed to resolve ${kind} ${entityId}: ${error.message}`);
		return null;
	}

	const row = asRecord(data);
	return typeof row?.project_id === 'string' ? row.project_id : null;
}

function buildSnapshot(execution: AgentCallExecution, projectId: string): JsonRecord {
	return {
		...compact(entityPayload(execution), {
			id: execution.entity_id,
			project_id: projectId,
			op: execution.op
		}),
		agent_call_tool_execution_id: execution.id
	};
}

async function main() {
	if (!SUPABASE_URL || !SERVICE_KEY) {
		throw new Error('Missing PUBLIC_SUPABASE_URL or Supabase service key');
	}

	const since =
		getArg('since') ?? new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
	const limit = Number(getArg('limit') ?? 500);
	const projectIdFilter = getArg('project-id');
	const dryRun = hasFlag('dry-run');

	const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
		auth: { persistSession: false, autoRefreshToken: false }
	});

	const { data: executions, error } = await supabase
		.from('agent_call_tool_executions')
		.select(
			'id, created_at, status, op, entity_kind, entity_id, user_id, external_agent_caller_id, agent_call_session_id, response_payload'
		)
		.eq('status', 'succeeded')
		.gte('created_at', since)
		.in('op', Object.keys(WRITE_OP_ACTIONS))
		.order('created_at', { ascending: true })
		.limit(limit);

	if (error) throw error;

	const candidateExecutions = ((executions ?? []) as AgentCallExecution[]).filter(
		(execution) => execution.entity_id || execution.op === 'cal.project.set'
	);
	const inserts: ProjectLogInsert[] = [];
	const skipped: Array<{ id: string; op: string; reason: string }> = [];

	for (const execution of candidateExecutions) {
		const action = WRITE_OP_ACTIONS[execution.op];
		const entityType = entityTypeForLog(execution);
		const projectId = await resolveProjectId(supabase, execution);
		const entityId =
			execution.op === 'cal.project.set' ? projectId : execution.entity_id ?? null;

		if (!action || !entityType || !projectId || !entityId) {
			skipped.push({ id: execution.id, op: execution.op, reason: 'missing entity/project' });
			continue;
		}
		if (projectIdFilter && projectId !== projectIdFilter) {
			continue;
		}

		const { data: existing, error: existingError } = await supabase
			.from('onto_project_logs')
			.select('id')
			.eq('project_id', projectId)
			.eq('entity_type', entityType)
			.eq('entity_id', entityId)
			.eq('change_source', 'agent_call')
			.eq('agent_call_session_id', execution.agent_call_session_id)
			.maybeSingle();

		if (existingError) throw existingError;
		if (existing) continue;

		const snapshot = buildSnapshot(execution, projectId);
		inserts.push({
			project_id: projectId,
			entity_type: entityType,
			entity_id: entityId,
			action,
			before_data: action === 'created' ? null : { op: execution.op },
			after_data: action === 'deleted' ? null : snapshot,
			changed_by: execution.user_id,
			change_source: 'agent_call',
			external_agent_caller_id: execution.external_agent_caller_id,
			agent_call_session_id: execution.agent_call_session_id,
			created_at: execution.created_at
		});
	}

	console.log(
		JSON.stringify(
			{
				since,
				projectId: projectIdFilter ?? null,
				dryRun,
				candidates: candidateExecutions.length,
				toInsert: inserts.length,
				skipped,
				preview: inserts.slice(0, 10).map((insert) => ({
					created_at: insert.created_at,
					project_id: insert.project_id,
					entity_type: insert.entity_type,
					entity_id: insert.entity_id,
					action: insert.action,
					caller: insert.external_agent_caller_id
				}))
			},
			null,
			2
		)
	);

	if (dryRun || inserts.length === 0) return;

	const { error: insertError } = await supabase.from('onto_project_logs').insert(inserts);
	if (insertError) throw insertError;
	console.log(`Inserted ${inserts.length} project activity log(s).`);
}

main().catch((error) => {
	console.error(error instanceof Error ? error.message : error);
	process.exit(1);
});
