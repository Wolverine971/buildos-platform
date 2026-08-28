// apps/worker/src/workers/agentic-chat/provider/tool-surface.ts
import {
	AGENTIC_CHAT_STANDARD_CONTROL_TOOL_DEFINITIONS_V1,
	DECLARE_READ_ONLY_TURN_TOOL_NAME
} from '@buildos/agentic-chat-runtime/catalog';
import { provideAgenticChatLoopToolCatalog } from '@buildos/agentic-chat-runtime/loop';
import {
	type JsonObject,
	type JsonValue,
	canonicalizeAgenticChatJson,
	decodeAgenticChatToolSurfaceV1
} from '@buildos/shared-types';
import type { AgenticChatWorkerExecutionInputV1 } from '../executionInput';
import {
	AGENTIC_CHAT_REVIEWED_MUTATION_SPECS_V1,
	type AgenticChatProviderMutationCapabilitiesV1,
	reviewedAgenticChatMutationSpecV1
} from '../mutationToolCatalog';
import {
	AGENTIC_CHAT_PRODUCTION_READ_TOOL_NAMES_V1,
	isAgenticChatProductionReadToolNameV1
} from '../tools/execution-adapter';
import type { AgenticChatTurnProviderToolV1 } from './contracts';

const WORKER_READ_LOOP_CATALOG_ENTRIES = AGENTIC_CHAT_PRODUCTION_READ_TOOL_NAMES_V1.map(
	(toolName) => {
		const op = workerReadOpForToolName(toolName);
		return [toolName, { op, tool_name: toolName, kind: 'read' as const }] as const;
	}
);
const WORKER_MUTATION_LOOP_CATALOG_ENTRIES = Object.entries(
	AGENTIC_CHAT_REVIEWED_MUTATION_SPECS_V1
).map(
	([toolName, spec]) =>
		[toolName, { op: spec.operationName, tool_name: toolName, kind: 'write' as const }] as const
);
const WORKER_LOOP_CATALOG = Object.freeze({
	ops: Object.freeze(
		Object.fromEntries(
			[...WORKER_READ_LOOP_CATALOG_ENTRIES, ...WORKER_MUTATION_LOOP_CATALOG_ENTRIES].map(
				([, entry]) => [entry.op, entry]
			)
		)
	),
	byToolName: Object.freeze(
		Object.fromEntries([
			...WORKER_READ_LOOP_CATALOG_ENTRIES,
			...WORKER_MUTATION_LOOP_CATALOG_ENTRIES
		])
	)
});

// Worker and web are separate hosts. Web installs its full registry; the
// worker installs reviewed reads plus capability-gated mutation identities.
provideAgenticChatLoopToolCatalog(() => WORKER_LOOP_CATALOG);

export function buildWorkerToolSurfaceOverride(
	input: AgenticChatWorkerExecutionInputV1,
	tools: readonly AgenticChatTurnProviderToolV1[]
): string | null {
	const decoded = decodeAgenticChatToolSurfaceV1(input.artifact.prepared.toolSurface);
	if (!decoded.ok) return null;
	const artifactNames = decoded.surface.toolNames;
	const callableNames = tools.map((tool) => tool.function.name);
	if (
		artifactNames.length === callableNames.length &&
		artifactNames.every((name) => callableNames.includes(name))
	) {
		return null;
	}
	return [
		'Worker execution surface override: the callable tools in this turn are exactly:',
		callableNames.length > 0 ? callableNames.join(', ') : 'none',
		'Any earlier routing or tool-surface instruction that names an absent tool is inactive for this turn.',
		'Do not delay a safe direct action merely because an absent discovery, skill, or context tool was suggested; use the callable tools that are present.'
	].join(' ');
}

export function productionToolsFor(
	input: AgenticChatWorkerExecutionInputV1,
	mutationCapabilities: Readonly<Partial<AgenticChatProviderMutationCapabilitiesV1>>,
	mountStandardControls: boolean
): readonly AgenticChatTurnProviderToolV1[] {
	const decoded = decodeAgenticChatToolSurfaceV1(input.artifact.prepared.toolSurface);
	if (!decoded.ok) return [];
	const surface = decoded.surface;
	const selectedNames = new Set(surface.toolNames);
	const seen = new Set<string>();
	const tools: AgenticChatTurnProviderToolV1[] = [];
	for (const definition of surface.definitions) {
		const tool = readArtifactToolDefinition(definition);
		if (
			!tool ||
			tool.function.name === DECLARE_READ_ONLY_TURN_TOOL_NAME ||
			!selectedNames.has(tool.function.name) ||
			(!isAgenticChatProductionReadToolNameV1(tool.function.name) &&
				!isEnabledMutationTool(tool.function.name, mutationCapabilities)) ||
			seen.has(tool.function.name)
		) {
			continue;
		}
		const reviewedTool = reviewedProviderToolDefinition(tool);
		if (!reviewedTool) continue;
		seen.add(tool.function.name);
		tools.push(withToolSchedulingSidecars(reviewedTool));
	}

	// Standard controls carry no data-mutation capability. Mutation-capable
	// artifacts normally include them, but the legacy project-create surface was
	// admitted with only create_onto_project. Mounting the shared deterministic
	// control schemas closes that orchestration gap while the immutable artifact
	// remains the authority for every mutation tool and its arguments.
	if (
		mountStandardControls &&
		tools.some((tool) => reviewedAgenticChatMutationSpecV1(tool.function.name))
	) {
		for (const definition of AGENTIC_CHAT_STANDARD_CONTROL_TOOL_DEFINITIONS_V1) {
			if (definition.function.name === DECLARE_READ_ONLY_TURN_TOOL_NAME) continue;
			if (seen.has(definition.function.name)) continue;
			const control = readArtifactToolDefinition(definition);
			if (!control || !isAgenticChatProductionReadToolNameV1(control.function.name)) continue;
			seen.add(control.function.name);
			tools.push(withToolSchedulingSidecars(control));
		}
	}
	return tools;
}

function withToolSchedulingSidecars(
	tool: AgenticChatTurnProviderToolV1
): AgenticChatTurnProviderToolV1 {
	const parameters = tool.function.parameters as Record<string, JsonValue>;
	const properties =
		parameters.properties &&
		typeof parameters.properties === 'object' &&
		!Array.isArray(parameters.properties)
			? (parameters.properties as JsonObject)
			: {};
	return {
		...tool,
		function: {
			...tool.function,
			parameters: {
				...tool.function.parameters,
				properties: {
					...properties,
					call_ref: {
						type: 'string',
						minLength: 1,
						maxLength: 128,
						description:
							'Optional stable name for this call within the current tool-call response.'
					},
					after: {
						type: 'array',
						maxItems: 40,
						uniqueItems: true,
						items: { type: 'string', minLength: 1, maxLength: 128 },
						description:
							'Optional same-response call_ref dependencies that must finish first.'
					}
				}
			}
		}
	};
}

function reviewedProviderToolDefinition(
	tool: AgenticChatTurnProviderToolV1
): AgenticChatTurnProviderToolV1 | null {
	const spec = reviewedAgenticChatMutationSpecV1(tool.function.name);
	if (!spec) return tool;
	const parameters = tool.function.parameters as Record<string, JsonValue>;
	const properties = parameters.properties;
	if (!properties || typeof properties !== 'object' || Array.isArray(properties)) {
		return null;
	}
	if (!spec.requiredNames.every((name) => Object.hasOwn(properties, name))) return null;
	const reviewedArgumentNames = new Set(spec.reviewedArgumentNames);
	const reviewedProperties = Object.fromEntries(
		Object.entries(properties)
			.filter(([name]) => reviewedArgumentNames.has(name))
			.map(([name, schema]) => [
				name,
				spec.propertyOverrides?.[name]
					? { ...(schema as JsonObject), ...spec.propertyOverrides[name] }
					: schema
			])
	) as JsonObject;
	return {
		...tool,
		function: {
			...tool.function,
			...(spec.descriptionOverride ? { description: spec.descriptionOverride } : {}),
			parameters: {
				...tool.function.parameters,
				additionalProperties: false,
				properties: reviewedProperties,
				required: [...spec.requiredNames]
			}
		}
	};
}

function isEnabledMutationTool(
	toolName: string,
	capabilities: Readonly<Partial<AgenticChatProviderMutationCapabilitiesV1>>
): boolean {
	const spec = reviewedAgenticChatMutationSpecV1(toolName);
	return spec !== null && capabilities[spec.capability] === true;
}

function readArtifactToolDefinition(value: unknown): AgenticChatTurnProviderToolV1 | null {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
	const record = value as Record<string, unknown>;
	if (record.type !== 'function' || !record.function || typeof record.function !== 'object') {
		return null;
	}
	const fn = record.function as Record<string, unknown>;
	if (
		typeof fn.name !== 'string' ||
		fn.name !== fn.name.trim() ||
		fn.name.length === 0 ||
		fn.name.length > 256 ||
		typeof fn.description !== 'string' ||
		fn.description.trim().length === 0 ||
		!fn.parameters ||
		typeof fn.parameters !== 'object' ||
		Array.isArray(fn.parameters) ||
		(fn.parameters as Record<string, unknown>).type !== 'object'
	) {
		return null;
	}
	try {
		const parameters = JSON.parse(
			canonicalizeAgenticChatJson(fn.parameters as JsonValue)
		) as JsonObject;
		return {
			type: 'function',
			function: {
				name: fn.name,
				description: fn.description,
				parameters
			}
		};
	} catch {
		return null;
	}
}

function workerReadOpForToolName(toolName: string): string {
	const exceptions: Readonly<Record<string, string>> = {
		search_all_projects: 'x.search.all_projects',
		search_project: 'x.search.project',
		search_ontology: 'onto.search',
		get_document_tree: 'onto.document.tree.get',
		get_document_path: 'onto.document.path.get',
		list_task_documents: 'onto.task.docs.list',
		get_onto_project_graph: 'onto.project.graph.get',
		get_field_info: 'util.schema.field_info',
		get_workspace_overview: 'util.workspace.overview',
		get_project_overview: 'util.project.overview',
		web_search: 'util.web.search',
		web_visit: 'util.web.visit'
	};
	const exception = exceptions[toolName];
	if (exception) return exception;

	const match = /^(list|search|get|create|update|delete)_(?:onto_)?(.+)$/.exec(toolName);
	if (!match) return `x.misc.${toolName}`;
	const action = match[1]!;
	const rawEntity = match[2]!.replace(/_details$/, '');
	const singularEntities: Readonly<Record<string, string>> = {
		projects: 'project',
		tasks: 'task',
		goals: 'goal',
		plans: 'plan',
		documents: 'document',
		milestones: 'milestone',
		risks: 'risk'
	};
	return `onto.${singularEntities[rawEntity] ?? rawEntity}.${action}`;
}
