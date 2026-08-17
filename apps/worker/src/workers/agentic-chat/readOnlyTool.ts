// apps/worker/src/workers/agentic-chat/readOnlyTool.ts
import {
	type Database,
	type JsonObject,
	type JsonValue,
	canonicalizeAgenticChatJson
} from '@buildos/shared-types';
import type { SupabaseClient } from '@supabase/supabase-js';
import { type WebResearchPort, WebResearchPortError } from '@buildos/shared-agent-ops';
import {
	type AgenticChatSharedReadContextV1,
	type AgenticChatToolAccessPortV1,
	getDocumentOutline,
	getDocumentPath,
	getDocumentTree,
	getFieldInfo,
	getOntoDocumentDetails,
	getOntoGoalDetails,
	getOntoMilestoneDetails,
	getOntoPlanDetails,
	getOntoProjectDetails,
	getOntoProjectGraph,
	getOntoRiskDetails,
	getOntoTaskDetails,
	getProjectOverview,
	getWorkspaceOverview,
	listOntoDocuments,
	listOntoGoals,
	listOntoMilestones,
	listOntoPlans,
	listOntoProjects,
	listOntoRisks,
	listOntoTasks,
	listTaskDocuments,
	readDocumentSection,
	searchAllProjects,
	searchOntoDocuments,
	searchOntoGoals,
	searchOntoMilestones,
	searchOntoPlans,
	searchOntoProjects,
	searchOntoRisks,
	searchOntoTasks,
	searchOntology,
	searchProject
} from '@buildos/agentic-chat-runtime/tools';
import {
	CANCEL_TURN_CONTRACT_TOOL_NAME,
	DECLARE_READ_ONLY_TURN_TOOL_NAME,
	DECLARE_TURN_CONTRACT_TOOL_NAME,
	REQUEST_TURN_CLARIFICATION_TOOL_NAME,
	TOOL_METADATA,
	parseDeclaredTurnContract,
	searchTelemetryColumns
} from '@buildos/agentic-chat-runtime/loop';
import { runWithAbortableDeadline } from './abortableDeadline';
import type { AgenticChatFixtureReadToolPortV1 } from './fixtureTurnExecutor';
import { AgenticChatProviderExecutionError } from './providerContract';
import { WorkerAgenticChatToolAccessAdapter } from './workerAccessAdapter';

const PROJECT_OVERVIEW_TOOL_NAME = 'get_project_overview';
export const APPROVE_TURN_CONTRACT_REVIEW_TOOL_NAME = 'approve_turn_contract_review';
export const APPROVE_READ_ONLY_TURN_REVIEW_TOOL_NAME = 'approve_read_only_turn_review';
export const APPROVE_MUTATION_BATCH_REVIEW_TOOL_NAME = 'approve_mutation_batch_review';
const MAX_RESULT_BYTES = 480 * 1024;
export const AGENTIC_CHAT_READ_TOOL_TIMEOUT_MS = 30_000;
export const AGENTIC_CHAT_WEB_RESEARCH_TOOL_TIMEOUT_MS = 60_000;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

type SharedReadToolRunner = (
	context: AgenticChatSharedReadContextV1,
	args: JsonObject
) => Promise<Record<string, unknown>>;

/**
 * The shared-allowlist dispatch table (Slice 18 S3): every read tool exported
 * by `@buildos/agentic-chat-runtime/tools` — the 31 ontology reads plus
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
	[APPROVE_READ_ONLY_TURN_REVIEW_TOOL_NAME]: (_context, args) => {
		const reason = typeof args.reason === 'string' ? args.reason.trim().slice(0, 500) : '';
		const dispositionSha256 =
			typeof args.disposition_sha256 === 'string' ? args.disposition_sha256.trim() : '';
		if (!reason || !/^[0-9a-f]{64}$/.test(dispositionSha256)) {
			throw new Error(
				'Read-only turn review approval failed: provide a reason and the exact reviewed disposition SHA-256.'
			);
		}
		return Promise.resolve({
			status: 'read_only_turn_review_approved',
			reason,
			disposition_sha256: dispositionSha256,
			instruction:
				'The independently reviewed read-only disposition may proceed without durable mutations.'
		});
	},
	[APPROVE_MUTATION_BATCH_REVIEW_TOOL_NAME]: (_context, args) => {
		const reason = typeof args.reason === 'string' ? args.reason.trim().slice(0, 500) : '';
		const batchSha256 = typeof args.batch_sha256 === 'string' ? args.batch_sha256.trim() : '';
		if (!reason || !/^[0-9a-f]{64}$/.test(batchSha256)) {
			throw new Error(
				'Mutation batch review approval failed: provide a reason and the exact reviewed batch SHA-256.'
			);
		}
		return Promise.resolve({
			status: 'mutation_batch_review_approved',
			reason,
			batch_sha256: batchSha256,
			instruction:
				'The independently reviewed mutation batch may proceed exactly as proposed.'
		});
	},
	[APPROVE_TURN_CONTRACT_REVIEW_TOOL_NAME]: (_context, args) => {
		const reason = typeof args.reason === 'string' ? args.reason.trim().slice(0, 500) : '';
		const contractSha256 =
			typeof args.contract_sha256 === 'string' ? args.contract_sha256.trim() : '';
		if (!reason || !/^[0-9a-f]{64}$/.test(contractSha256)) {
			throw new Error(
				'Turn contract review approval failed: provide a reason and the exact reviewed contract SHA-256.'
			);
		}
		return Promise.resolve({
			status: 'turn_contract_review_approved',
			reason,
			contract_sha256: contractSha256,
			instruction:
				'The independently reviewed contract may proceed. Execute only its approved semantic outcomes.'
		});
	},
	[CANCEL_TURN_CONTRACT_TOOL_NAME]: (_context, args) => {
		const reason = typeof args.reason === 'string' ? args.reason.trim().slice(0, 240) : '';
		if (!reason) {
			throw new Error(
				'Turn contract cancellation failed: provide a concise reason grounded in the current user message.'
			);
		}
		return Promise.resolve({
			status: 'cancelled',
			reason,
			instruction: 'Do not execute the cancelled durable outcomes.'
		});
	},
	[DECLARE_READ_ONLY_TURN_TOOL_NAME]: (_context, args) => {
		const reason = typeof args.reason === 'string' ? args.reason.trim().slice(0, 240) : '';
		if (!reason) {
			throw new Error(
				'Read-only turn declaration failed: explain why the current request commissions no durable data change.'
			);
		}
		return Promise.resolve({
			status: 'read_only_declared',
			reason,
			instruction:
				'Continue with reads or answer from evidence; do not claim a durable mutation.'
		});
	},
	[REQUEST_TURN_CLARIFICATION_TOOL_NAME]: (_context, args) => {
		const reason = typeof args.reason === 'string' ? args.reason.trim().slice(0, 240) : '';
		const question =
			typeof args.question === 'string' ? args.question.trim().slice(0, 500) : '';
		if (!reason || !question) {
			throw new Error(
				'Turn clarification failed: provide the unresolved semantic choice and a concise question for the user.'
			);
		}
		return Promise.resolve({
			status: 'clarification_required',
			reason,
			question,
			requires_user_action: true,
			instruction:
				'Ask the question and wait for the user. Do not perform a durable mutation in this turn.'
		});
	},
	[DECLARE_TURN_CONTRACT_TOOL_NAME]: (_context, args) => {
		const contract = parseDeclaredTurnContract(args);
		if (!contract) {
			throw new Error(
				'Turn contract validation failed: provide at least one supported semantic outcome.'
			);
		}
		return Promise.resolve({
			status: 'declared',
			contract,
			instruction:
				'Continue until every declared outcome is backed by successful durable effects, or explain the concrete blocker.'
		});
	},
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
	search_all_projects: (context, args) => searchAllProjects(context, args as never),
	search_buildos: (context, args) => searchAllProjects(context, args as never),
	search_project: (context, args) => searchProject(context, args as never),
	search_ontology: (context, args) => searchOntology(context, args as never),
	get_onto_project_details: (context, args) => getOntoProjectDetails(context, args as never),
	get_onto_project_graph: (context, args) => getOntoProjectGraph(context, args as never),
	get_onto_document_details: (context, args) => getOntoDocumentDetails(context, args as never),
	get_onto_goal_details: (context, args) => getOntoGoalDetails(context, args as never),
	get_onto_plan_details: (context, args) => getOntoPlanDetails(context, args as never),
	get_onto_milestone_details: (context, args) => getOntoMilestoneDetails(context, args as never),
	get_onto_risk_details: (context, args) => getOntoRiskDetails(context, args as never),
	get_onto_task_details: (context, args) => getOntoTaskDetails(context, args as never),
	list_task_documents: (context, args) => listTaskDocuments(context, args as never),
	get_document_outline: (context, args) => getDocumentOutline(context, args as never),
	read_document_section: (context, args) => readDocumentSection(context, args as never),
	get_document_tree: (context, args) => getDocumentTree(context, args as never),
	get_document_path: (context, args) => getDocumentPath(context, args as never),
	get_workspace_overview: (context, args) => getWorkspaceOverview(context, args as never),
	[PROJECT_OVERVIEW_TOOL_NAME]: (context, args) => getProjectOverview(context, args as never),
	get_field_info: async (_context, args) => getFieldInfo(args as never)
});

export const AGENTIC_CHAT_WEB_RESEARCH_TOOL_NAMES_V1 = Object.freeze([
	'web_search',
	'web_visit'
] as const);

export const AGENTIC_CHAT_PRODUCTION_READ_TOOL_NAMES_V1 = Object.freeze([
	...Object.keys(SHARED_READ_TOOL_RUNNERS),
	...AGENTIC_CHAT_WEB_RESEARCH_TOOL_NAMES_V1
]);

/**
 * Keep the provider and executor on the same reviewed name catalog. The actual
 * schemas remain the immutable admission artifact's definitions so the worker
 * preserves the exact context-specific surface selected by the web host.
 */
const AGENTIC_CHAT_PRODUCTION_READ_TOOL_NAME_SET_V1 = new Set(
	AGENTIC_CHAT_PRODUCTION_READ_TOOL_NAMES_V1
);

export function isAgenticChatProductionReadToolNameV1(value: unknown): value is string {
	return typeof value === 'string' && AGENTIC_CHAT_PRODUCTION_READ_TOOL_NAME_SET_V1.has(value);
}

/**
 * Shared-allowlist production read adapter. Dispatches every allowlisted read
 * to the shared implementations in `@buildos/agentic-chat-runtime/tools` over
 * the worker access adapter. No mutation capability is present.
 */
export class AgenticChatReadOnlyToolAdapter implements AgenticChatFixtureReadToolPortV1 {
	private readonly now: () => number;
	private readonly timeoutMs: number;
	private readonly webResearchTimeoutMs: number;
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
			webResearchTimeoutMs?: number;
			webResearch?: WebResearchPort;
			createAccessAdapter?: (userId: string) => AgenticChatToolAccessPortV1;
		} = {}
	) {
		this.now = options.now ?? Date.now;
		this.timeoutMs = options.timeoutMs ?? AGENTIC_CHAT_READ_TOOL_TIMEOUT_MS;
		this.webResearchTimeoutMs =
			options.webResearchTimeoutMs ?? AGENTIC_CHAT_WEB_RESEARCH_TOOL_TIMEOUT_MS;
		this.webResearch = options.webResearch;
		this.createAccessAdapter =
			options.createAccessAdapter ??
			((userId) => new WorkerAgenticChatToolAccessAdapter({ client: this.client, userId }));
	}

	async execute(
		input: Parameters<AgenticChatFixtureReadToolPortV1['execute']>[0]
	): ReturnType<AgenticChatFixtureReadToolPortV1['execute']> {
		if (!isAgenticChatProductionReadToolNameV1(input.toolName)) {
			throw providerError('read_tool_not_allowlisted', 'permanent');
		}
		const webResearchTool = AGENTIC_CHAT_WEB_RESEARCH_TOOL_NAMES_V1.includes(
			input.toolName as (typeof AGENTIC_CHAT_WEB_RESEARCH_TOOL_NAMES_V1)[number]
		);
		const runner = webResearchTool ? null : SHARED_READ_TOOL_RUNNERS[input.toolName]!;
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
		const sharedContext: AgenticChatSharedReadContextV1 | null = webResearchTool
			? null
			: {
					client: this.client,
					access: this.accessAdapterFor(input.executionInput.claim.userId)
				};
		const startedAt = this.now();
		let rawResult: Record<string, unknown>;
		try {
			rawResult = await runWithAbortableDeadline({
				parentSignal: input.signal,
				timeoutMs: webResearchTool ? this.webResearchTimeoutMs : this.timeoutMs,
				createTimeoutError: () =>
					new AgenticChatProviderExecutionError(
						'read_tool_timeout',
						'transient_infra',
						`Agentic Chat read tool exceeded its ${
							webResearchTool ? this.webResearchTimeoutMs : this.timeoutMs
						}ms deadline`
					),
				run: async () => {
					if (!webResearchTool) return runner!(sharedContext!, input.arguments);
					const executeWebResearch =
						input.toolName === 'web_search'
							? this.webResearch?.search
							: this.webResearch?.visit;
					if (!executeWebResearch) {
						throw new AgenticChatProviderExecutionError(
							'read_tool_execution_failed',
							'transient_infra',
							`Agentic Chat ${input.toolName} is not configured`
						);
					}
					return requireResultRecord(await executeWebResearch(input.arguments));
				}
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
				readToolFailureClass(error, webResearchTool),
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

		const affectedEntities: JsonObject[] = [];
		if (input.toolName === PROJECT_OVERVIEW_TOOL_NAME) {
			// The project payload still needs an identity fence, but legacy read
			// persistence does not infer affected entities from read results and
			// search telemetry intentionally ignores non-search overview tools.
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
			}
		}
		// Same derivation the legacy web SSE path persists
		// (turn-persistence.ts -> searchTelemetryColumns): search tools count
		// their primary result array, everything else records no evidence.
		const telemetry = searchTelemetryColumns({
			toolName: input.toolName,
			success: true,
			result: payload
		});
		const duration = Math.min(2_147_483_647, Math.max(0, Math.floor(this.now() - startedAt)));

		return {
			result: payload,
			executionTimeMs: duration,
			tokensConsumed: null,
			affectedEntities,
			// Per-tool category from the shared TOOL_METADATA ('search' for the
			// list/search reads, 'read' for detail/overview reads, 'utility' for
			// get_field_info). The hosted chat_tool_executions constraint was widened
			// and verified before the worker catalog admitted these categories.
			toolCategory: TOOL_METADATA[input.toolName]?.category ?? null,
			resultCount: telemetry.result_count,
			zeroResult: telemetry.zero_result,
			requiresUserAction: input.toolName === REQUEST_TURN_CLARIFICATION_TOOL_NAME
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

	private readonly webResearch: WebResearchPort | undefined;
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

function readToolFailureClass(
	error: unknown,
	webResearchTool: boolean
): 'permanent' | 'transient_infra' | 'unknown' {
	if (!webResearchTool) return sharedToolFailureClass(error);
	if (error instanceof WebResearchPortError) {
		return error.code === 'VALIDATION_ERROR' ? 'permanent' : 'transient_infra';
	}
	return 'transient_infra';
}

function requireResultRecord(value: unknown): Record<string, unknown> {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		throw new WebResearchPortError('Web research result is not an object');
	}
	return value as Record<string, unknown>;
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
