// apps/worker/src/workers/agentic-chat/readOnlyTool.ts
import {
	type GatewayReadOpResult,
	runGatewayReadOp
} from '@buildos/shared-agent-ops/gateway/op-execution-gateway';
import {
	type Database,
	type JsonObject,
	type JsonValue,
	canonicalizeAgenticChatJson
} from '@buildos/shared-types';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { AgenticChatFixtureReadToolPortV1 } from './fixtureTurnExecutor';
import { AgenticChatProviderExecutionError } from './providerContract';

const PROJECT_OVERVIEW_TOOL_NAME = 'get_project_overview';
const PROJECT_STATUS_OP = 'onto.project.status.get';
const MAX_RESULT_BYTES = 480 * 1024;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export const AGENTIC_CHAT_PRODUCTION_READ_TOOL_NAMES_V1 = Object.freeze([
	PROJECT_OVERVIEW_TOOL_NAME
] as const);

/**
 * This is intentionally copied into the worker rather than consuming the
 * admission artifact's broader tool surface. A deployment can expose only the
 * reviewed schema below even when the immutable prompt was prepared with many
 * legacy tools.
 */
export const AGENTIC_CHAT_PRODUCTION_READ_TOOLS_V1 = Object.freeze([
	Object.freeze({
		type: 'function' as const,
		function: Object.freeze({
			name: PROJECT_OVERVIEW_TOOL_NAME,
			description:
				'Get a read-only BuildOS status summary for one accessible project. Pass exactly one of project_id or query.',
			parameters: Object.freeze({
				type: 'object',
				additionalProperties: false,
				properties: Object.freeze({
					project_id: Object.freeze({
						type: 'string',
						format: 'uuid',
						description: 'Exact project UUID when known.'
					}),
					query: Object.freeze({
						type: 'string',
						minLength: 1,
						maxLength: 200,
						description: 'Project name query when the UUID is not known.'
					})
				}),
				oneOf: Object.freeze([
					Object.freeze({ required: Object.freeze(['project_id']) }),
					Object.freeze({ required: Object.freeze(['query']) })
				])
			})
		})
	})
]);

type AgenticChatReadOpRunnerV1 = (input: {
	admin: SupabaseClient<Database>;
	userId: string;
	projectId: string | null;
	arguments: JsonObject;
}) => Promise<GatewayReadOpResult>;

/** One-tool, one-op production read adapter. No mutation capability is present. */
export class AgenticChatReadOnlyToolAdapter implements AgenticChatFixtureReadToolPortV1 {
	private readonly now: () => number;
	private readonly runOp: AgenticChatReadOpRunnerV1;

	constructor(
		private readonly client: SupabaseClient<Database>,
		options: {
			now?: () => number;
			runOp?: AgenticChatReadOpRunnerV1;
		} = {}
	) {
		this.now = options.now ?? Date.now;
		this.runOp = options.runOp ?? runProjectStatusOp;
	}

	async execute(
		input: Parameters<AgenticChatFixtureReadToolPortV1['execute']>[0]
	): ReturnType<AgenticChatFixtureReadToolPortV1['execute']> {
		if (input.toolName !== PROJECT_OVERVIEW_TOOL_NAME) {
			throw providerError('read_tool_not_allowlisted', 'permanent');
		}
		throwIfAborted(input.signal);
		const args = validateProjectOverviewArguments(input.arguments);
		const context = requireRecord(input.executionInput.requestPayload.context);
		const projectId = canonicalUuidOrNull(context.projectId);
		if ((context.type === 'project' || context.type === 'ontology') && projectId === null) {
			throw providerError('read_tool_context_invalid', 'permanent');
		}
		const startedAt = this.now();
		const result = await this.runOp({
			admin: this.client,
			userId: input.executionInput.claim.userId,
			projectId,
			arguments: args
		});
		throwIfAborted(input.signal);
		if (!result.ok) {
			const failureClass =
				result.error?.code === 'INTERNAL' ? ('unknown' as const) : ('permanent' as const);
			throw new AgenticChatProviderExecutionError(
				'read_tool_execution_failed',
				failureClass,
				canonicalError(result.error?.message)
			);
		}

		const canonical = canonicalizeAgenticChatJson(result.data as JsonValue);
		if (Buffer.byteLength(canonical, 'utf8') > MAX_RESULT_BYTES) {
			throw providerError('read_tool_result_too_large', 'permanent');
		}
		const parsed = JSON.parse(canonical) as unknown;
		if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
			throw providerError('read_tool_result_invalid', 'unknown');
		}
		const payload = parsed as JsonObject;
		const project = requireOptionalRecord(payload.project);
		const affectedProjectId = canonicalUuidOrNull(project?.id);
		const expectedProjectId = projectId ?? canonicalUuidOrNull(args.project_id);
		if (
			project === null ||
			affectedProjectId === null ||
			(expectedProjectId !== null && affectedProjectId !== expectedProjectId)
		) {
			throw providerError('read_tool_result_invalid', 'unknown');
		}
		const affectedEntities = [
			{
				type: 'project',
				id: affectedProjectId,
				...(typeof project.name === 'string' && project.name.trim()
					? { name: project.name.trim().slice(0, 500) }
					: {})
			} satisfies JsonObject
		];
		const duration = Math.min(2_147_483_647, Math.max(0, Math.floor(this.now() - startedAt)));

		return {
			result: payload,
			executionTimeMs: duration,
			tokensConsumed: null,
			affectedEntities,
			toolCategory: 'project_read',
			resultCount: 1,
			zeroResult: false,
			requiresUserAction: false
		};
	}
}

function runProjectStatusOp(input: {
	admin: SupabaseClient<Database>;
	userId: string;
	projectId: string | null;
	arguments: JsonObject;
}): Promise<GatewayReadOpResult> {
	return runGatewayReadOp({
		admin: input.admin,
		userId: input.userId,
		scope: {
			mode: 'read_only',
			allowed_ops: [PROJECT_STATUS_OP],
			...(input.projectId ? { project_ids: [input.projectId] } : {})
		},
		op: PROJECT_STATUS_OP,
		args: input.arguments
	});
}

function validateProjectOverviewArguments(value: JsonObject): JsonObject {
	const keys = Object.keys(value);
	if (keys.some((key) => key !== 'project_id' && key !== 'query')) {
		throw providerError('read_tool_arguments_invalid', 'permanent');
	}
	const projectId = value.project_id;
	const query = value.query;
	const hasProjectId = projectId !== undefined;
	const hasQuery = query !== undefined;
	if (hasProjectId === hasQuery) {
		throw providerError('read_tool_arguments_invalid', 'permanent');
	}
	if (hasProjectId && canonicalUuidOrNull(projectId) === null) {
		throw providerError('read_tool_arguments_invalid', 'permanent');
	}
	if (
		hasQuery &&
		(typeof query !== 'string' || !query.trim() || query !== query.trim() || query.length > 200)
	) {
		throw providerError('read_tool_arguments_invalid', 'permanent');
	}
	return value;
}

function canonicalUuidOrNull(value: unknown): string | null {
	return typeof value === 'string' && UUID_PATTERN.test(value) && value === value.toLowerCase()
		? value
		: null;
}

function requireRecord(value: unknown): Record<string, unknown> {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		throw providerError('read_tool_context_invalid', 'permanent');
	}
	return value as Record<string, unknown>;
}

function requireOptionalRecord(value: unknown): Record<string, unknown> | null {
	return value && typeof value === 'object' && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: null;
}

function throwIfAborted(signal: AbortSignal): void {
	if (!signal.aborted) return;
	throw signal.reason instanceof Error ? signal.reason : new Error('Execution aborted');
}

function canonicalError(value: unknown): string {
	const message = value instanceof Error ? value.message : String(value ?? '');
	return message.trim().slice(0, 2_000) || 'Agentic Chat read tool failed';
}

function providerError(
	code: string,
	failureClass: 'permanent' | 'unknown'
): AgenticChatProviderExecutionError {
	return new AgenticChatProviderExecutionError(code, failureClass, code.replaceAll('_', ' '));
}
