// apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator/entity-kind-repair.ts
import type { ChatToolCall, ChatToolResult } from '@buildos/shared-types';
import { inferMaterializedToolsFromEntityResults } from '$lib/services/agentic-chat/tools/core/entity-result-materialization';
import { parseToolArguments } from './tool-arguments';

type EntityKind = 'project' | 'task' | 'document' | 'goal' | 'plan' | 'milestone' | 'risk';

export type KnownEntity = {
	id: string;
	kind: EntityKind;
	title?: string;
	stateKey?: string;
	sourceTool?: string;
};

type DetailExpectation = {
	argKey: string;
	kind: EntityKind;
};

const DETAIL_EXPECTATIONS: Record<string, DetailExpectation> = {
	get_onto_project_details: { argKey: 'project_id', kind: 'project' },
	get_onto_task_details: { argKey: 'task_id', kind: 'task' },
	list_task_documents: { argKey: 'task_id', kind: 'task' },
	get_onto_document_details: { argKey: 'document_id', kind: 'document' },
	get_document_outline: { argKey: 'document_id', kind: 'document' },
	read_document_section: { argKey: 'document_id', kind: 'document' },
	get_onto_goal_details: { argKey: 'goal_id', kind: 'goal' },
	get_onto_plan_details: { argKey: 'plan_id', kind: 'plan' },
	get_onto_milestone_details: { argKey: 'milestone_id', kind: 'milestone' },
	get_onto_risk_details: { argKey: 'risk_id', kind: 'risk' }
};

const COLLECTION_KIND_BY_KEY: Record<string, EntityKind> = {
	project: 'project',
	projects: 'project',
	task: 'task',
	tasks: 'task',
	document: 'document',
	documents: 'document',
	goal: 'goal',
	goals: 'goal',
	plan: 'plan',
	plans: 'plan',
	milestone: 'milestone',
	milestones: 'milestone',
	risk: 'risk',
	risks: 'risk'
};

export function rememberKnownEntitiesFromToolResult(params: {
	knownEntitiesById: Map<string, KnownEntity>;
	toolName: string;
	payload: unknown;
}): void {
	collectKnownEntities(params.payload, params.knownEntitiesById, params.toolName);
}

export function buildWrongEntityKindRepairResult(params: {
	toolCall: ChatToolCall;
	knownEntitiesById: Map<string, KnownEntity>;
}): ChatToolResult | null {
	const toolName = params.toolCall.function?.name?.trim() ?? '';
	const expectation = DETAIL_EXPECTATIONS[toolName];
	if (!expectation) return null;

	const parsed = parseToolArguments(params.toolCall.function?.arguments);
	const idValue = parsed.args[expectation.argKey];
	if (typeof idValue !== 'string' || !idValue.trim()) return null;

	const id = idValue.trim();
	const known = params.knownEntitiesById.get(id);
	if (!known || known.kind === expectation.kind) return null;

	const materializedTools = inferMaterializedToolsFromEntityResults({
		results: [{ id: known.id, type: known.kind }]
	});
	const titleText = known.title ? ` "${known.title}"` : '';
	const message = `That id is a ${known.kind}, not a ${expectation.kind}.${titleText} Use the ${known.kind} detail/link tools with the correct id argument.`;

	return {
		tool_call_id: params.toolCall.id,
		success: true,
		result: {
			status: 'wrong_entity_kind',
			found: false,
			expected_kind: expectation.kind,
			actual_kind: known.kind,
			id_arg: expectation.argKey,
			id,
			known_entity: {
				id: known.id,
				type: known.kind,
				title: known.title,
				state_key: known.stateKey
			},
			materialized_tools: materializedTools,
			message
		}
	};
}

function collectKnownEntities(
	value: unknown,
	knownEntitiesById: Map<string, KnownEntity>,
	sourceTool: string,
	collectionKind?: EntityKind
): void {
	if (!value || typeof value !== 'object') return;

	if (Array.isArray(value)) {
		for (const item of value) {
			collectKnownEntities(item, knownEntitiesById, sourceTool, collectionKind);
		}
		return;
	}

	const record = value as Record<string, unknown>;
	const kind =
		normalizeEntityKind(record.type ?? record.entity_type ?? record.kind) ?? collectionKind;
	const id = typeof record.id === 'string' ? record.id.trim() : '';
	if (kind && id) {
		const existing = knownEntitiesById.get(id);
		knownEntitiesById.set(id, {
			id,
			kind,
			title:
				typeof record.title === 'string'
					? record.title
					: typeof record.name === 'string'
						? record.name
						: existing?.title,
			stateKey:
				typeof record.state_key === 'string'
					? record.state_key
					: typeof record.status === 'string'
						? record.status
						: existing?.stateKey,
			sourceTool: existing?.sourceTool ?? sourceTool
		});
	}

	for (const [key, nested] of Object.entries(record)) {
		const nestedCollectionKind = COLLECTION_KIND_BY_KEY[key] ?? undefined;
		if (nestedCollectionKind || key === 'results') {
			collectKnownEntities(nested, knownEntitiesById, sourceTool, nestedCollectionKind);
		}
	}
}

function normalizeEntityKind(value: unknown): EntityKind | null {
	if (typeof value !== 'string') return null;
	const normalized = value.trim().toLowerCase();
	if (normalized === 'project' || normalized === 'projects') return 'project';
	if (normalized === 'task' || normalized === 'tasks') return 'task';
	if (normalized === 'document' || normalized === 'documents' || normalized === 'doc') {
		return 'document';
	}
	if (normalized === 'goal' || normalized === 'goals') return 'goal';
	if (normalized === 'plan' || normalized === 'plans') return 'plan';
	if (normalized === 'milestone' || normalized === 'milestones') return 'milestone';
	if (normalized === 'risk' || normalized === 'risks') return 'risk';
	return null;
}
