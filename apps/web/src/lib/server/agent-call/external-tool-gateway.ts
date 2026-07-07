// apps/web/src/lib/server/agent-call/external-tool-gateway.ts
//
// Web-side adapter + discovery surface for the BuildOS agent-call gateway.
//
// The op-execution core (handlers, dispatcher, registry building, write audit
// wiring) lives in @buildos/shared-agent-ops so a Node worker (no
// SvelteKit/$lib/$env) can execute BuildOS write+read ops. This file keeps the
// web-only concerns:
//   - tool discovery (tool_search / tool_schema / skill_load + direct tools)
//   - the concrete CalendarPort adapter (CalendarExecutor)
//   - the concrete TaskSyncPort adapter (TaskEventSyncService)
//   - wiring the web tool registry into the shared dispatcher
import type {
	AgentCallScope,
	BuildosAgentDiscoveryToolName,
	BuildosAgentToolDefinition
} from '@buildos/shared-types';
import {
	buildExecError,
	buildExternalGatewayRegistry as buildExternalGatewayRegistryCore,
	buildExternalToolDescription,
	clampLimit,
	executeGatewayOp,
	summarizeDescription,
	EXTERNAL_CUSTOM_OPS,
	type ExternalGatewayRegistry,
	type ExternalGatewayRegistryEntry,
	type RegistryOp,
	type CalendarPort,
	type TaskSyncPort
} from '@buildos/shared-agent-ops/gateway/op-execution-gateway';
import { ensureActorId } from '$lib/services/ontology/ontology-projects.service';
import { TaskEventSyncService } from '$lib/services/ontology/task-event-sync.service';
import { GATEWAY_TOOL_DEFINITIONS } from '$lib/services/agentic-chat/tools/core/definitions/gateway';
import { getToolRegistry } from '$lib/services/agentic-chat/tools/registry/tool-registry';
import { searchToolRegistry } from '$lib/services/agentic-chat/tools/registry/tool-search';
import { normalizeGatewayOpName } from '$lib/services/agentic-chat/tools/registry/gateway-op-aliases';
import { loadSkill } from '$lib/services/agentic-chat/tools/skills/skill-load';
import {
	defaultAllowedOpsForMode,
	isSupportedOp,
	isWriteOp,
	requiredScopeModeForOp
} from './agent-call-policy';
import { CalendarExecutor } from '$lib/services/agentic-chat/tools/core/executors/calendar-executor';
import type { SecurityEventLogOptions } from '$lib/server/security-event-logger';
import type { ActivityLogActorContext } from '$lib/services/async-activity-logger';

type ToolHelpFormat = 'short' | 'full';

const EXTERNAL_DISCOVERY_TOOL_NAMES = new Set<BuildosAgentDiscoveryToolName>([
	'skill_load',
	'tool_search',
	'tool_schema'
]);

// ---------------------------------------------------------------------------
// Port adapters + dependency wiring
// ---------------------------------------------------------------------------

/**
 * CalendarPort adapter: builds the concrete CalendarExecutor from the execution
 * params. Mirrors the previous behavior where a fresh executor was created per
 * op call.
 */
function createCalendarPort(params: {
	admin: any;
	userId: string;
	callerId?: string;
	callSessionId?: string;
}): CalendarPort {
	const activityLogActorContext: ActivityLogActorContext | undefined =
		params.callerId || params.callSessionId
			? {
					externalAgentCallerId: params.callerId ?? null,
					agentCallSessionId: params.callSessionId ?? null
				}
			: undefined;

	return new CalendarExecutor({
		supabase: params.admin,
		userId: params.userId,
		sessionId: params.callSessionId,
		fetchFn: fetch,
		getActorId: () => ensureActorId(params.admin, params.userId),
		getAdminSupabase: () => params.admin,
		getAuthHeaders: async () => ({
			'Content-Type': 'application/json',
			'X-Change-Source': 'agent_call'
		}),
		activityLogActorContext
	});
}

/**
 * TaskSyncPort adapter: wraps TaskEventSyncService for the shared dispatcher.
 */
function createTaskSyncPort(admin: any): TaskSyncPort {
	return new TaskEventSyncService(admin);
}

/**
 * Builds the web tool registry's op map merged with the gateway custom ops, in
 * the shape the shared registry builder expects.
 */
function getRegistryOps(): Record<string, RegistryOp> {
	return getToolRegistry().ops as Record<string, RegistryOp>;
}

function getRegistryVersion(): string {
	return getToolRegistry().version;
}

/**
 * Web-local wrapper that supplies the registry dependencies the shared registry
 * builder needs. Keeps discovery call sites unchanged.
 */
function buildExternalGatewayRegistry(scope: AgentCallScope): ExternalGatewayRegistry {
	return buildExternalGatewayRegistryCore(scope, getRegistryOps(), getRegistryVersion());
}

/**
 * Executes a gateway op against the shared dispatcher, wiring the web registry
 * and the concrete calendar/task-sync ports.
 */
function runGatewayOp(params: {
	admin: any;
	userId: string;
	callerId?: string;
	callSessionId?: string;
	scope: AgentCallScope;
	arguments?: Record<string, unknown>;
	securityEventOptions?: SecurityEventLogOptions;
}): Promise<Record<string, unknown>> {
	return executeGatewayOp({
		...params,
		registryOps: getRegistryOps(),
		registryVersion: getRegistryVersion(),
		calendar: createCalendarPort({
			admin: params.admin,
			userId: params.userId,
			callerId: params.callerId,
			callSessionId: params.callSessionId
		}),
		taskSync: createTaskSyncPort(params.admin)
	});
}

// ---------------------------------------------------------------------------
// Discovery surface (web-only)
// ---------------------------------------------------------------------------

export function getBuildosAgentGatewayTools(scope: AgentCallScope): BuildosAgentToolDefinition[] {
	const discoveryTools = GATEWAY_TOOL_DEFINITIONS.filter((tool) =>
		EXTERNAL_DISCOVERY_TOOL_NAMES.has(tool.function.name as BuildosAgentDiscoveryToolName)
	).map((tool) => ({
		name: tool.function.name,
		description: tool.function.description,
		inputSchema: tool.function.parameters ?? { type: 'object', properties: {} }
	}));

	const registry = buildExternalGatewayRegistry(scope);
	const directTools = Object.values(registry.ops).map((entry) => ({
		name: entry.tool_name,
		description: buildExternalToolDescription(entry),
		inputSchema: buildExternalDirectToolSchema(entry)
	}));

	return [...discoveryTools, ...directTools];
}

function buildExternalDirectToolSchema(
	entry: ExternalGatewayRegistryEntry
): Record<string, unknown> {
	const schema = cloneSchema(entry.parameters_schema);
	if (!isWriteOp(entry.op)) {
		return schema;
	}

	const properties =
		schema.properties &&
		typeof schema.properties === 'object' &&
		!Array.isArray(schema.properties)
			? (schema.properties as Record<string, unknown>)
			: {};

	return {
		...schema,
		properties: {
			...properties,
			idempotency_key: {
				type: 'string',
				description:
					'Optional stable key for safely retrying the same external write without duplicating it.'
			},
			dry_run: {
				type: 'boolean',
				description: 'Return the validated write payload without mutating BuildOS.'
			}
		}
	};
}

function cloneSchema(schema: Record<string, unknown> | undefined): Record<string, unknown> {
	return JSON.parse(JSON.stringify(schema ?? { type: 'object', properties: {} })) as Record<
		string,
		unknown
	>;
}

function findExternalDirectTool(
	scope: AgentCallScope,
	toolName: string
): ExternalGatewayRegistryEntry | null {
	const registry = buildExternalGatewayRegistry(scope);
	return Object.values(registry.ops).find((entry) => entry.tool_name === toolName) ?? null;
}

function buildDirectToolGatewayArguments(
	entry: ExternalGatewayRegistryEntry,
	args: Record<string, unknown> | undefined
): Record<string, unknown> {
	const input = { ...(args ?? {}) };
	const idempotencyKey =
		typeof input.idempotency_key === 'string' && input.idempotency_key.trim()
			? input.idempotency_key.trim()
			: undefined;
	const dryRun = input.dry_run === true;
	delete input.idempotency_key;
	delete input.dry_run;

	return {
		op: entry.op,
		args: input,
		...(idempotencyKey ? { idempotency_key: idempotencyKey } : {}),
		...(dryRun ? { dry_run: true } : {})
	};
}

function normalizeToolSearchFilterArgs(args: Record<string, unknown> | undefined): {
	query: string;
	group?: 'onto' | 'util' | 'cal';
	kind?: 'read' | 'write';
	entity?: string;
	capability?: string;
	limit: number;
} {
	return {
		query: typeof args?.query === 'string' ? args.query.trim() : '',
		capability:
			typeof args?.capability === 'string' && args.capability.trim()
				? args.capability.trim()
				: undefined,
		group:
			args?.group === 'onto' || args?.group === 'util' || args?.group === 'cal'
				? (args.group as 'onto' | 'util' | 'cal')
				: undefined,
		kind:
			args?.kind === 'read' || args?.kind === 'write'
				? (args.kind as 'read' | 'write')
				: undefined,
		entity:
			typeof args?.entity === 'string' && args.entity.trim() ? args.entity.trim() : undefined,
		limit: clampLimit(args?.limit, 8, 1, 25)
	};
}

function scoreExternalRegistryEntry(entry: RegistryOp, query: string): number {
	const normalizedQuery = query.trim().toLowerCase();
	if (!normalizedQuery) return 1;

	const haystack = [
		entry.op,
		entry.tool_name,
		entry.description,
		entry.group,
		entry.kind,
		entry.entity,
		entry.action
	]
		.filter((value): value is string => typeof value === 'string' && value.length > 0)
		.join(' ')
		.toLowerCase();
	const tokens = normalizedQuery.split(/\s+/).filter(Boolean);
	let score = 0;

	if (entry.op.toLowerCase() === normalizedQuery) score += 200;
	if (entry.op.toLowerCase().includes(normalizedQuery)) score += 100;
	if (entry.tool_name.toLowerCase().includes(normalizedQuery)) score += 60;
	for (const token of tokens) {
		if (haystack.includes(token)) score += 20;
	}

	return score;
}

function buildExternalToolSearchMatch(
	entry: ExternalGatewayRegistryEntry
): Record<string, unknown> {
	return {
		op: entry.op,
		summary: summarizeDescription(buildExternalToolDescription(entry)),
		group: entry.group,
		kind: entry.kind,
		entity: entry.entity,
		action: entry.action,
		tool_name: entry.tool_name,
		related_skills: []
	};
}

function mergeScopedToolSearchMatches(params: {
	payloadMatches: unknown[];
	registry: ExternalGatewayRegistry;
	args: Record<string, unknown> | undefined;
}): Record<string, unknown>[] {
	const filters = normalizeToolSearchFilterArgs(params.args);
	const internalRegistry = getToolRegistry();
	const scopedInternalMatches = params.payloadMatches.filter((match) => {
		const op =
			typeof (match as { op?: unknown }).op === 'string' ? (match as { op: string }).op : '';
		return Boolean(op) && Boolean(params.registry.ops[op]);
	}) as Record<string, unknown>[];
	const existingOps = new Set(
		scopedInternalMatches
			.map((match) => match.op)
			.filter((op): op is string => typeof op === 'string' && op.length > 0)
	);

	const customMatches = filters.capability
		? []
		: Object.values(params.registry.ops)
				.filter((entry) => !internalRegistry.ops[entry.op])
				.filter((entry) => {
					if (existingOps.has(entry.op)) return false;
					if (filters.group && entry.group !== filters.group) return false;
					if (filters.kind && entry.kind !== filters.kind) return false;
					if (filters.entity && entry.entity !== filters.entity) return false;
					return true;
				})
				.map((entry) => ({
					entry,
					score: scoreExternalRegistryEntry(entry, filters.query)
				}))
				.filter(({ score }) => score > 0)
				.sort((a, b) => {
					if (b.score !== a.score) return b.score - a.score;
					if (a.entry.kind !== b.entry.kind)
						return a.entry.kind.localeCompare(b.entry.kind);
					return a.entry.op.localeCompare(b.entry.op);
				})
				.map(({ entry }) => buildExternalToolSearchMatch(entry));

	return [...scopedInternalMatches, ...customMatches].slice(0, filters.limit);
}

function findKnownExternalCustomTool(toolName: string): RegistryOp | null {
	return (
		Object.values(EXTERNAL_CUSTOM_OPS).find((entry) => entry?.tool_name === toolName) ?? null
	);
}

function buildMinimalArgsTemplate(schema: Record<string, any>): Record<string, unknown> {
	const properties = (schema.properties ?? {}) as Record<string, Record<string, unknown>>;
	const required = new Set(Array.isArray(schema.required) ? (schema.required as string[]) : []);
	const template: Record<string, unknown> = {};

	for (const [name, definition] of Object.entries(properties)) {
		if (!required.has(name)) {
			continue;
		}

		const type = Array.isArray(definition.type) ? definition.type[0] : definition.type;
		if (name.endsWith('_id')) {
			template[name] = `<${name}>`;
			continue;
		}

		if (type === 'number' || type === 'integer') {
			template[name] = 1;
			continue;
		}

		if (type === 'object') {
			template[name] = {};
			continue;
		}

		template[name] = `<${name}>`;
	}

	return template;
}

function buildExternalOpHelp(
	entry: ExternalGatewayRegistryEntry,
	format: ToolHelpFormat,
	includeSchemas: boolean,
	includeExamples: boolean
): Record<string, unknown> {
	const schema = buildExternalDirectToolSchema(entry);
	const properties = (schema.properties ?? {}) as Record<string, Record<string, unknown>>;
	const required = Array.isArray(schema.required) ? (schema.required as string[]) : [];
	const args = Object.entries(properties).map(([name, definition]) => ({
		name,
		type: Array.isArray(definition.type)
			? definition.type.join(' | ')
			: (definition.type ?? 'any'),
		required: required.includes(name),
		description: definition.description
	}));
	const minimalArgs = buildMinimalArgsTemplate(schema);

	const help: Record<string, unknown> = {
		type: 'op',
		op: entry.op,
		tool_name: entry.tool_name,
		callable_tool: entry.tool_name,
		kind: entry.kind,
		summary: summarizeDescription(buildExternalToolDescription(entry)),
		usage: `${entry.tool_name}({ ... })`,
		required_scope_mode: entry.required_scope_mode,
		required_args: required,
		args
	};

	if (includeSchemas) {
		help.schema = schema;
	}

	if (includeExamples) {
		help.example_tool_call = {
			name: entry.tool_name,
			arguments: minimalArgs
		};
	}

	if (format === 'full') {
		help.description = buildExternalToolDescription(entry);
	}

	return help;
}

export async function executeBuildosAgentGatewayTool(params: {
	admin: any;
	userId: string;
	callerId?: string;
	callSessionId?: string;
	scope: AgentCallScope;
	toolName: string;
	arguments?: Record<string, unknown>;
	securityEventOptions?: SecurityEventLogOptions;
}): Promise<Record<string, unknown>> {
	switch (params.toolName) {
		case 'skill_load': {
			const format =
				params.arguments?.format === 'full' || params.arguments?.format === 'short'
					? params.arguments.format
					: undefined;
			return loadSkill(
				typeof params.arguments?.skill === 'string'
					? params.arguments.skill
					: typeof params.arguments?.id === 'string'
						? params.arguments.id
						: typeof params.arguments?.path === 'string'
							? params.arguments.path
							: '',
				{
					format,
					include_examples: params.arguments?.include_examples !== false,
					surface: 'external_agent'
				}
			) as Record<string, unknown>;
		}
		case 'tool_search': {
			const registry = buildExternalGatewayRegistry(params.scope);
			const filters = normalizeToolSearchFilterArgs(params.arguments);
			const payload = searchToolRegistry({
				query: filters.query || undefined,
				capability: filters.capability,
				group: filters.group,
				kind: filters.kind,
				entity: filters.entity,
				limit: filters.limit,
				surface: 'external'
			}) as Record<string, unknown>;
			const matches = mergeScopedToolSearchMatches({
				payloadMatches: Array.isArray(payload.matches) ? payload.matches : [],
				registry,
				args: params.arguments
			});
			return {
				...payload,
				version: registry.version,
				total_matches: matches.length,
				matches
			};
		}
		case 'tool_schema': {
			const requestedOp =
				typeof params.arguments?.op === 'string'
					? params.arguments.op
					: typeof params.arguments?.path === 'string'
						? params.arguments.path
						: '';
			const canonicalOp = normalizeGatewayOpName(requestedOp);
			const registry = buildExternalGatewayRegistry(params.scope);
			const entry = registry.ops[canonicalOp];
			if (!entry) {
				return buildExecError(
					requestedOp,
					isSupportedOp(canonicalOp) ? 'FORBIDDEN' : 'NOT_FOUND',
					isSupportedOp(canonicalOp)
						? `Op ${canonicalOp} is outside the granted BuildOS call scope`
						: `Unknown op: ${requestedOp}`,
					isSupportedOp(canonicalOp) ? canonicalOp : 'root'
				);
			}
			return {
				...buildExternalOpHelp(
					entry,
					'full',
					params.arguments?.include_schema !== false,
					params.arguments?.include_examples !== false
				),
				type: 'tool_schema'
			} as Record<string, unknown>;
		}
		default:
			break;
	}

	const directEntry = findExternalDirectTool(params.scope, params.toolName);
	if (directEntry) {
		return runGatewayOp({
			...params,
			arguments: buildDirectToolGatewayArguments(directEntry, params.arguments)
		});
	}

	const customEntry = findKnownExternalCustomTool(params.toolName);
	if (customEntry && isSupportedOp(customEntry.op)) {
		return buildExecError(
			customEntry.op,
			'FORBIDDEN',
			`Tool ${params.toolName} is outside the granted BuildOS call scope`,
			customEntry.op,
			{
				granted_scope_mode: params.scope.mode,
				required_scope_mode: requiredScopeModeForOp(customEntry.op),
				allowed_ops: params.scope.allowed_ops ?? defaultAllowedOpsForMode(params.scope.mode)
			}
		);
	}

	const registryEntry = getToolRegistry().byToolName[params.toolName];
	const canonicalOp = registryEntry ? normalizeGatewayOpName(registryEntry.op) : '';
	if (canonicalOp && isSupportedOp(canonicalOp)) {
		return buildExecError(
			canonicalOp,
			'FORBIDDEN',
			`Tool ${params.toolName} is outside the granted BuildOS call scope`,
			canonicalOp,
			{
				granted_scope_mode: params.scope.mode,
				required_scope_mode: requiredScopeModeForOp(canonicalOp),
				allowed_ops: params.scope.allowed_ops ?? defaultAllowedOpsForMode(params.scope.mode)
			}
		);
	}

	return buildExecError(
		params.toolName,
		'NOT_FOUND',
		`Unsupported BuildOS tool: ${params.toolName}.`,
		'root'
	);
}
