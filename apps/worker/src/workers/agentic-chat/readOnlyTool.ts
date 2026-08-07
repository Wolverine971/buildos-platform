// apps/worker/src/workers/agentic-chat/readOnlyTool.ts
import {
	type Database,
	type JsonObject,
	type JsonValue,
	canonicalizeAgenticChatJson
} from '@buildos/shared-types';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
	type AgenticChatSharedReadContextV1,
	type AgenticChatToolAccessPortV1,
	getDocumentOutline,
	getFieldInfo,
	getOntoDocumentDetails,
	getOntoProjectDetails,
	getProjectOverview,
	getWorkspaceOverview,
	listOntoDocuments,
	listOntoGoals,
	listOntoMilestones,
	listOntoPlans,
	listOntoProjects,
	listOntoRisks,
	listOntoTasks,
	readDocumentSection,
	searchOntoDocuments,
	searchOntoGoals,
	searchOntoMilestones,
	searchOntoPlans,
	searchOntoProjects,
	searchOntoRisks,
	searchOntoTasks
} from '@buildos/agentic-chat-runtime/tools';
import { TOOL_METADATA, searchTelemetryColumns } from '@buildos/agentic-chat-runtime/loop';
import { runWithAbortableDeadline } from './abortableDeadline';
import type { AgenticChatFixtureReadToolPortV1 } from './fixtureTurnExecutor';
import { AgenticChatProviderExecutionError } from './providerContract';
import { WorkerAgenticChatToolAccessAdapter } from './workerAccessAdapter';

const PROJECT_OVERVIEW_TOOL_NAME = 'get_project_overview';
const MAX_RESULT_BYTES = 480 * 1024;
export const AGENTIC_CHAT_READ_TOOL_TIMEOUT_MS = 30_000;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

type SharedReadToolRunner = (
	context: AgenticChatSharedReadContextV1,
	args: JsonObject
) => Promise<Record<string, unknown>>;

/**
 * The shared-allowlist dispatch table (Slice 18 S3): every read tool exported
 * by `@buildos/agentic-chat-runtime/tools` — the 18 ontology reads plus
 * get_workspace_overview / get_project_overview / get_field_info.
 * Deliberately excluded:
 * - change_chat_context: needs the web-only resolveDirectToolNames port and
 *   mutates session context;
 * - get_user_profile_overview: unmoved pending the usage_scope decision.
 * Arguments are passed through unvalidated at the envelope (`as never`): the
 * shared free functions carry the legacy executor's own argument validation,
 * transcribed from the web executor, so web and worker reject identically.
 */
const SHARED_READ_TOOL_RUNNERS: Readonly<Record<string, SharedReadToolRunner>> = Object.freeze({
	list_onto_projects: (context, args) => listOntoProjects(context, args as never),
	list_onto_tasks: (context, args) => listOntoTasks(context, args as never),
	list_onto_goals: (context, args) => listOntoGoals(context, args as never),
	list_onto_plans: (context, args) => listOntoPlans(context, args as never),
	list_onto_documents: (context, args) => listOntoDocuments(context, args as never),
	list_onto_milestones: (context, args) => listOntoMilestones(context, args as never),
	list_onto_risks: (context, args) => listOntoRisks(context, args as never),
	search_onto_projects: (context, args) => searchOntoProjects(context, args as never),
	search_onto_tasks: (context, args) => searchOntoTasks(context, args as never),
	search_onto_goals: (context, args) => searchOntoGoals(context, args as never),
	search_onto_plans: (context, args) => searchOntoPlans(context, args as never),
	search_onto_documents: (context, args) => searchOntoDocuments(context, args as never),
	search_onto_milestones: (context, args) => searchOntoMilestones(context, args as never),
	search_onto_risks: (context, args) => searchOntoRisks(context, args as never),
	get_onto_project_details: (context, args) => getOntoProjectDetails(context, args as never),
	get_onto_document_details: (context, args) => getOntoDocumentDetails(context, args as never),
	get_document_outline: (context, args) => getDocumentOutline(context, args as never),
	read_document_section: (context, args) => readDocumentSection(context, args as never),
	get_workspace_overview: (context, args) => getWorkspaceOverview(context, args as never),
	[PROJECT_OVERVIEW_TOOL_NAME]: (context, args) => getProjectOverview(context, args as never),
	get_field_info: async (_context, args) => getFieldInfo(args as never)
});

export const AGENTIC_CHAT_PRODUCTION_READ_TOOL_NAMES_V1 = Object.freeze(
	Object.keys(SHARED_READ_TOOL_RUNNERS)
);

/**
 * The provider-advertised tool schema surface. This is intentionally copied
 * into the worker rather than consuming the admission artifact's broader tool
 * surface: a deployment can expose only the reviewed schemas below even when
 * the immutable prompt was prepared with many legacy tools. The executor above
 * can dispatch the full shared allowlist, but the provider surface stays this
 * single reviewed schema until the catalog swap slice expands it.
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

/**
 * Shared-allowlist production read adapter. Dispatches every allowlisted read
 * to the shared implementations in `@buildos/agentic-chat-runtime/tools` over
 * the worker access adapter. No mutation capability is present.
 */
export class AgenticChatReadOnlyToolAdapter implements AgenticChatFixtureReadToolPortV1 {
	private readonly now: () => number;
	private readonly timeoutMs: number;
	private readonly createAccessAdapter: (userId: string) => AgenticChatToolAccessPortV1;
	/**
	 * Access adapters are cached per user so the actorId RPC amortizes across
	 * the many tool calls of one turn. Bounded: the worker process is
	 * long-lived, so the cache is cleared once it holds 256 users rather than
	 * growing without limit.
	 */
	private readonly accessAdapters = new Map<string, AgenticChatToolAccessPortV1>();

	constructor(
		private readonly client: SupabaseClient<Database>,
		options: {
			now?: () => number;
			timeoutMs?: number;
			createAccessAdapter?: (userId: string) => AgenticChatToolAccessPortV1;
		} = {}
	) {
		this.now = options.now ?? Date.now;
		this.timeoutMs = options.timeoutMs ?? AGENTIC_CHAT_READ_TOOL_TIMEOUT_MS;
		this.createAccessAdapter =
			options.createAccessAdapter ??
			((userId) => new WorkerAgenticChatToolAccessAdapter({ client: this.client, userId }));
	}

	async execute(
		input: Parameters<AgenticChatFixtureReadToolPortV1['execute']>[0]
	): ReturnType<AgenticChatFixtureReadToolPortV1['execute']> {
		if (!Object.hasOwn(SHARED_READ_TOOL_RUNNERS, input.toolName)) {
			throw providerError('read_tool_not_allowlisted', 'permanent');
		}
		const runner = SHARED_READ_TOOL_RUNNERS[input.toolName]!;
		throwIfAborted(input.signal);
		if (input.toolName === PROJECT_OVERVIEW_TOOL_NAME) {
			// Pre-swap context guard, kept exactly where it observably applied
			// before: only get_project_overview ever reached it (every other
			// name threw read_tool_not_allowlisted first). The shared tools
			// take explicit arguments and never read the session context, so
			// the guard stays validation-only.
			const context = requireRecord(input.executionInput.requestPayload.context);
			const contextProjectId = canonicalUuidOrNull(context.projectId);
			if (
				(context.type === 'project' || context.type === 'ontology') &&
				contextProjectId === null
			) {
				throw providerError('read_tool_context_invalid', 'permanent');
			}
		}
		const sharedContext: AgenticChatSharedReadContextV1 = {
			client: this.client,
			access: this.accessAdapterFor(input.executionInput.claim.userId)
		};
		const startedAt = this.now();
		let rawResult: Record<string, unknown>;
		try {
			rawResult = await runWithAbortableDeadline({
				parentSignal: input.signal,
				timeoutMs: this.timeoutMs,
				createTimeoutError: () =>
					new AgenticChatProviderExecutionError(
						'read_tool_timeout',
						'transient_infra',
						`Agentic Chat read tool exceeded its ${this.timeoutMs}ms deadline`
					),
				run: () => runner(sharedContext, input.arguments)
			});
		} catch (error) {
			// Deadline and envelope errors pass through untouched, as do parent
			// abort reasons; everything the shared implementations throw
			// (argument validation, access denial, database failures) maps to
			// the read_tool_execution_failed vocabulary the envelope always had.
			if (error instanceof AgenticChatProviderExecutionError) throw error;
			if (input.signal.aborted) throw error;
			throw new AgenticChatProviderExecutionError(
				'read_tool_execution_failed',
				sharedToolFailureClass(error),
				canonicalError(error)
			);
		}
		throwIfAborted(input.signal);

		const canonical = canonicalizeAgenticChatJson(rawResult as JsonValue);
		if (Buffer.byteLength(canonical, 'utf8') > MAX_RESULT_BYTES) {
			throw providerError('read_tool_result_too_large', 'permanent');
		}
		const parsed = JSON.parse(canonical) as unknown;
		if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
			throw providerError('read_tool_result_invalid', 'unknown');
		}
		const payload = parsed as JsonObject;

		let affectedEntities: JsonObject[] = [];
		let resultCount: number | null;
		let zeroResult: boolean | null;
		if (input.toolName === PROJECT_OVERVIEW_TOOL_NAME) {
			// Preserved pre-swap semantics: a resolved project pins the affected
			// entity and counts as one result. A payload without a project is a
			// legacy-shaped not_found/ambiguous match — web returns it to the
			// model, so the worker forwards it too with no result evidence.
			const project = requireOptionalRecord(payload.project);
			if (project !== null) {
				const affectedProjectId = canonicalUuidOrNull(project.id);
				const expectedProjectId = canonicalUuidOrNull(input.arguments.project_id);
				if (
					affectedProjectId === null ||
					(expectedProjectId !== null && affectedProjectId !== expectedProjectId)
				) {
					throw providerError('read_tool_result_invalid', 'unknown');
				}
				affectedEntities = [
					{
						type: 'project',
						id: affectedProjectId,
						...(typeof project.name === 'string' && project.name.trim()
							? { name: project.name.trim().slice(0, 500) }
							: {})
					} satisfies JsonObject
				];
				resultCount = 1;
				zeroResult = false;
			} else {
				resultCount = null;
				zeroResult = null;
			}
		} else {
			// Same derivation the legacy web SSE path persists
			// (turn-persistence.ts -> searchTelemetryColumns): search tools count
			// their primary result array, everything else records no evidence.
			const telemetry = searchTelemetryColumns({
				toolName: input.toolName,
				success: true,
				result: payload
			});
			resultCount = telemetry.result_count;
			zeroResult = telemetry.zero_result;
		}
		const duration = Math.min(2_147_483_647, Math.max(0, Math.floor(this.now() - startedAt)));

		return {
			result: payload,
			executionTimeMs: duration,
			tokensConsumed: null,
			affectedEntities,
			// Per-tool category from the shared TOOL_METADATA ('search' for the
			// list/search reads, 'read' for detail/overview reads, 'utility' for
			// get_field_info). NOTE: prod's chat_tool_executions_tool_category_check
			// constraint diff is still owed BEFORE the worker emits 'read'/'search'
			// live (S3 extraction map, T4 ops note).
			toolCategory: TOOL_METADATA[input.toolName]?.category ?? null,
			resultCount,
			zeroResult,
			requiresUserAction: false
		};
	}

	private accessAdapterFor(userId: string): AgenticChatToolAccessPortV1 {
		const cached = this.accessAdapters.get(userId);
		if (cached) return cached;
		if (this.accessAdapters.size >= 256) {
			this.accessAdapters.clear();
		}
		const created = this.createAccessAdapter(userId);
		this.accessAdapters.set(userId, created);
		return created;
	}
}

/**
 * Failure-class mapping for errors thrown by the shared read implementations.
 * Database/PostgREST failures carry a string `code` and map to 'unknown' (the
 * legacy gateway surfaced them as INTERNAL -> 'unknown'); plain Errors are the
 * shared logic's own argument validation and access denials -> 'permanent'.
 */
function sharedToolFailureClass(error: unknown): 'permanent' | 'unknown' {
	if (
		error &&
		typeof error === 'object' &&
		typeof (error as { code?: unknown }).code === 'string'
	) {
		return 'unknown';
	}
	return 'permanent';
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
	const message =
		value instanceof Error
			? value.message
			: value &&
				  typeof value === 'object' &&
				  typeof (value as { message?: unknown }).message === 'string'
				? (value as { message: string }).message
				: String(value ?? '');
	return message.trim().slice(0, 2_000) || 'Agentic Chat read tool failed';
}

function providerError(
	code: string,
	failureClass: 'permanent' | 'unknown'
): AgenticChatProviderExecutionError {
	return new AgenticChatProviderExecutionError(code, failureClass, code.replaceAll('_', ' '));
}
