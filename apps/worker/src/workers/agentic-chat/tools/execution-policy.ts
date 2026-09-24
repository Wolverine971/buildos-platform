// apps/worker/src/workers/agentic-chat/tools/execution-policy.ts
import type { JsonObject } from '@buildos/shared-types';
import type {
	AgenticChatToolExecutionCallKindV1,
	AgenticChatToolExecutionResourceV1
} from './execution-graph';

export type AgenticChatToolExecutionPolicyInputV1 = {
	toolName: string;
	kind: AgenticChatToolExecutionCallKindV1;
	arguments: JsonObject;
	concurrentReadsEnabled: boolean;
	concurrentMutationsEnabled: boolean;
};

export type AgenticChatResolvedToolExecutionPolicyV1 = {
	executionPolicy: 'parallel_safe' | 'serial';
	resources: readonly AgenticChatToolExecutionResourceV1[];
};

const ROW_LOCAL_MUTATIONS = new Map<string, readonly string[]>([
	['update_onto_document', ['document_id']],
	['update_onto_task', ['task_id']],
	['update_onto_goal', ['goal_id']],
	['update_onto_plan', ['plan_id']],
	['update_onto_milestone', ['milestone_id']],
	['update_onto_risk', ['risk_id']],
	['update_onto_project', ['project_id']],
	['create_onto_document', ['project_id']],
	['create_onto_task', ['project_id']],
	['create_onto_goal', ['project_id']],
	['create_onto_plan', ['project_id']],
	['create_onto_milestone', ['project_id']],
	['create_onto_risk', ['project_id']]
]);

/**
 * Creates whose server path inserts only new rows (task, containment edges,
 * project log) and reads no project-wide state it then rewrites. They take a
 * shared hold on their project, so sibling creates run together while a
 * project update still orders against them. Document creates stay exclusive:
 * they rewrite the project's document tree. Tasker 101: five task creates ran
 * as layers [1,1,1,1,1] under the exclusive hold, ~1.7 s each on the gate.
 * Requires migration 20260924193000 (task create locks its project first):
 * without it, three or more concurrent creates starve each other in the
 * database for 12-97 s. With it, five creates finish in about 1 s.
 */
const SHARED_PROJECT_CREATES: ReadonlySet<string> = new Set(['create_onto_task']);

/**
 * Resolve concurrency only from reviewed worker policy and exact domain IDs.
 * Unknown-scope mutations fail closed to serial execution.
 */
export function resolveAgenticChatToolExecutionPolicyV1(
	input: AgenticChatToolExecutionPolicyInputV1
): AgenticChatResolvedToolExecutionPolicyV1 {
	if (input.kind === 'read') {
		return {
			executionPolicy: input.concurrentReadsEnabled ? 'parallel_safe' : 'serial',
			resources: identifierResources(input.arguments, 'read')
		};
	}
	if (!input.concurrentMutationsEnabled) {
		return { executionPolicy: 'serial', resources: [] };
	}

	const resourceFields = ROW_LOCAL_MUTATIONS.get(input.toolName);
	if (!resourceFields) {
		return { executionPolicy: 'serial', resources: [] };
	}
	const access: AgenticChatToolExecutionResourceV1['access'] = SHARED_PROJECT_CREATES.has(
		input.toolName
	)
		? 'read'
		: 'write';
	const resources = resourceFields.flatMap((fieldName) => {
		const value = input.arguments[fieldName];
		return typeof value === 'string' && value.length > 0
			? [{ key: resourceKey(fieldName, value), access }]
			: [];
	});
	return resources.length === resourceFields.length
		? { executionPolicy: 'parallel_safe', resources }
		: { executionPolicy: 'serial', resources: [] };
}

function identifierResources(
	arguments_: JsonObject,
	access: AgenticChatToolExecutionResourceV1['access']
): AgenticChatToolExecutionResourceV1[] {
	return Object.entries(arguments_)
		.filter(
			([name, value]) =>
				typeof value === 'string' &&
				value.length > 0 &&
				(name === 'id' || name.endsWith('_id'))
		)
		.map(([name, value]) => ({
			key: resourceKey(name, value as string),
			access
		}))
		.sort((left, right) => left.key.localeCompare(right.key));
}

function resourceKey(fieldName: string, value: string): string {
	const normalizedField = fieldName
		.replace(/^expected_source_/, '')
		.replace(/^destination_/, '')
		.replace(/_id$/, '');
	return `${normalizedField}:${value}`;
}
