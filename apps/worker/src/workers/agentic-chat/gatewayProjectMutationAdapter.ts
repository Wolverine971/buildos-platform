// apps/worker/src/workers/agentic-chat/gatewayProjectMutationAdapter.ts
import { runGatewayWriteOp } from '@buildos/shared-agent-ops/gateway/op-execution-gateway';
import {
	sanitizeProjectForClient,
	sanitizeProjectPropsPatchInput
} from '@buildos/shared-agent-ops/utils/project-props-sanitizer';
import { type Database, type JsonObject } from '@buildos/shared-types';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { AgenticChatMutatingToolPortV1 } from './mutation-executor';
import {
	type MutationInput,
	assertMutationAdapterBoundary,
	assertMutationReceiptSize,
	canonicalGatewayError,
	canonicalMutationReceipt,
	canonicalUuid,
	isRecord,
	knownFailure,
	requestProjectId,
	requiredUuid,
	throwGatewayResultFailure,
	uncertainFailure
} from './mutationAdapterBoundary';
import { reviewedAgenticChatGatewayMutationSpecV1 } from './mutationToolCatalog';

type GatewayRunner = typeof runGatewayWriteOp;

/**
 * One-attempt adapter for the reviewed project-row update. Project creation,
 * archival aliases, and graph/facet convenience fields remain separate
 * contracts; this path admits only the signed legacy tool surface.
 */
export class AgenticChatGatewayProjectMutationAdapter implements AgenticChatMutatingToolPortV1 {
	private readonly runGateway: GatewayRunner;

	constructor(
		private readonly client: SupabaseClient<Database>,
		options: { runGateway?: GatewayRunner } = {}
	) {
		this.runGateway = options.runGateway ?? runGatewayWriteOp;
	}

	async execute(input: MutationInput): Promise<JsonObject> {
		const reviewedSpec = reviewedAgenticChatGatewayMutationSpecV1('update_onto_project');
		if (!reviewedSpec) {
			throw knownFailure(
				'mutation_adapter_not_allowlisted',
				'No reviewed project update adapter is available'
			);
		}
		assertMutationAdapterBoundary(input, {
			toolName: 'update_onto_project',
			operationName: reviewedSpec.operationName,
			downstreamIdempotencySupported: false,
			reviewedArgumentNames: new Set(reviewedSpec.reviewedArgumentNames)
		});

		const projectId = requiredUuid(input.arguments.project_id, 'project_id');
		const contextProjectId = requestProjectId(input);
		if (contextProjectId !== null && contextProjectId !== projectId) {
			throw knownFailure(
				'mutation_project_scope_mismatch',
				'update_onto_project project_id is outside the admitted turn context'
			);
		}
		const gatewayArguments = normalizeProjectArguments(input.arguments);

		let result: Awaited<ReturnType<GatewayRunner>>;
		try {
			result = await this.runGateway({
				admin: this.client,
				userId: input.executionInput.claim.userId,
				scope: {
					mode: 'read_write',
					allowed_ops: [reviewedSpec.operationName],
					project_ids: [projectId],
					write_project_ids: [projectId]
				},
				op: reviewedSpec.operationName,
				args: gatewayArguments,
				chatSessionId: input.executionInput.claim.sessionId
			});
		} catch (error) {
			throw uncertainFailure(
				'update_onto_project_gateway_threw',
				canonicalGatewayError(error, input.toolName)
			);
		}

		if (!result.ok) {
			throwGatewayResultFailure(input.toolName, result.error);
		}

		const candidate = result.data?.project;
		if (!isRecord(candidate) || !canonicalUuid(candidate.id) || candidate.id !== projectId) {
			throw uncertainFailure(
				'update_onto_project_receipt_invalid',
				'update_onto_project returned a mismatched project receipt'
			);
		}
		const project = sanitizeProjectForClient(candidate);
		const display = typeof project.name === 'string' ? project.name : projectId;
		const receipt = canonicalMutationReceipt(
			{
				project,
				message: `Updated ontology project "${display}"`
			},
			input.toolName
		);
		assertMutationReceiptSize(receipt, input.toolName);
		return receipt;
	}
}

function normalizeProjectArguments(args: JsonObject): Record<string, unknown> {
	const normalized = { ...args } as Record<string, unknown>;
	let changed = 0;
	for (const field of ['name', 'description'] as const) {
		if (normalized[field] !== undefined) changed += 1;
	}
	if (normalized.state_key !== undefined) {
		normalized.state_key = normalizeLegacyProjectState(normalized.state_key);
		changed += 1;
	}
	for (const field of ['start_at', 'end_at'] as const) {
		if (!Object.hasOwn(normalized, field)) continue;
		normalized[field] = normalizeLegacyProjectDate(normalized[field], field);
		changed += 1;
	}
	if (Object.hasOwn(normalized, 'props')) {
		const props = sanitizeProjectPropsPatchInput(normalized.props);
		if (props && Object.keys(props).length > 0) {
			normalized.props = props;
			changed += 1;
		} else {
			delete normalized.props;
		}
	}
	if (changed === 0) {
		throw knownFailure(
			'mutation_arguments_not_admitted',
			'No updates provided for ontology project'
		);
	}
	return normalized;
}

function normalizeLegacyProjectState(value: unknown): unknown {
	if (typeof value !== 'string') return value;
	const normalized = value
		.trim()
		.toLowerCase()
		.replace(/[\s-]+/g, '_');
	const aliases: Record<string, string> = {
		in_progress: 'active',
		inprogress: 'active',
		started: 'active',
		working: 'active',
		ongoing: 'active',
		on_hold: 'paused',
		hold: 'paused',
		pending: 'planning',
		planned: 'planning',
		backlog: 'planning',
		todo: 'planning',
		draft: 'planning',
		complete: 'completed',
		done: 'completed',
		finished: 'completed',
		shipped: 'completed',
		canceled: 'cancelled',
		aborted: 'cancelled',
		abandoned: 'cancelled',
		archived: 'cancelled'
	};
	return aliases[normalized] ?? normalized;
}

function normalizeLegacyProjectDate(value: unknown, field: string): string | null {
	if (value === null || value === '') return null;
	if (typeof value !== 'string') {
		throw knownFailure('mutation_arguments_not_admitted', `${field} must be a valid date`);
	}
	const text = value.trim();
	if (!text) return null;
	const dateOnly = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
	const date = dateOnly
		? new Date(Date.UTC(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3])))
		: new Date(text);
	if (
		Number.isNaN(date.getTime()) ||
		(dateOnly !== null &&
			(date.getUTCFullYear() !== Number(dateOnly[1]) ||
				date.getUTCMonth() !== Number(dateOnly[2]) - 1 ||
				date.getUTCDate() !== Number(dateOnly[3])))
	) {
		throw knownFailure('mutation_arguments_not_admitted', `${field} must be a valid date`);
	}
	return date.toISOString();
}
