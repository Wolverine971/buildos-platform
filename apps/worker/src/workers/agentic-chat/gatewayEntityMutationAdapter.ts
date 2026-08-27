// apps/worker/src/workers/agentic-chat/gatewayEntityMutationAdapter.ts
import { withComputedMilestoneState } from '@buildos/agentic-chat-runtime/tools/milestone-state';
import { runGatewayWriteOp } from '@buildos/shared-agent-ops/gateway/op-execution-gateway';
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
import {
	type AgenticChatReviewedMutationToolNameV1,
	reviewedAgenticChatGatewayMutationSpecV1
} from './mutationToolCatalog';

type GatewayRunner = typeof runGatewayWriteOp;
type GatewayEntityKind = 'document' | 'goal' | 'plan' | 'milestone' | 'risk';

type GatewayEntityMutationConfig = {
	mode: 'create' | 'update';
	entityKind: GatewayEntityKind;
	entityIdArgument: string | null;
	displayField: 'name' | 'title';
	fallbackLabel: string;
};

const GATEWAY_ENTITY_MUTATION_CONFIG = {
	update_onto_document: {
		mode: 'update',
		entityKind: 'document',
		entityIdArgument: 'document_id',
		displayField: 'title',
		fallbackLabel: 'Document'
	},
	create_onto_goal: {
		mode: 'create',
		entityKind: 'goal',
		entityIdArgument: null,
		displayField: 'name',
		fallbackLabel: 'Goal'
	},
	update_onto_goal: {
		mode: 'update',
		entityKind: 'goal',
		entityIdArgument: 'goal_id',
		displayField: 'name',
		fallbackLabel: 'Goal'
	},
	create_onto_plan: {
		mode: 'create',
		entityKind: 'plan',
		entityIdArgument: null,
		displayField: 'name',
		fallbackLabel: 'Plan'
	},
	update_onto_plan: {
		mode: 'update',
		entityKind: 'plan',
		entityIdArgument: 'plan_id',
		displayField: 'name',
		fallbackLabel: 'Plan'
	},
	create_onto_milestone: {
		mode: 'create',
		entityKind: 'milestone',
		entityIdArgument: null,
		displayField: 'title',
		fallbackLabel: 'Milestone'
	},
	update_onto_milestone: {
		mode: 'update',
		entityKind: 'milestone',
		entityIdArgument: 'milestone_id',
		displayField: 'title',
		fallbackLabel: 'Milestone'
	},
	create_onto_risk: {
		mode: 'create',
		entityKind: 'risk',
		entityIdArgument: null,
		displayField: 'title',
		fallbackLabel: 'Risk'
	},
	update_onto_risk: {
		mode: 'update',
		entityKind: 'risk',
		entityIdArgument: 'risk_id',
		displayField: 'title',
		fallbackLabel: 'Risk'
	}
} as const satisfies Partial<
	Record<AgenticChatReviewedMutationToolNameV1, GatewayEntityMutationConfig>
>;

export type AgenticChatGatewayEntityMutationToolNameV1 =
	keyof typeof GATEWAY_ENTITY_MUTATION_CONFIG;

export const AGENTIC_CHAT_GATEWAY_ENTITY_MUTATION_TOOL_NAMES_V1 = Object.freeze(
	Object.keys(GATEWAY_ENTITY_MUTATION_CONFIG) as AgenticChatGatewayEntityMutationToolNameV1[]
);

/**
 * One-attempt adapter for reviewed shared-gateway entity writes that have no
 * domain-level effect-key persistence or exact replay query.
 */
export class AgenticChatGatewayEntityMutationAdapter implements AgenticChatMutatingToolPortV1 {
	private readonly runGateway: GatewayRunner;

	constructor(
		private readonly client: SupabaseClient<Database>,
		options: { runGateway?: GatewayRunner } = {}
	) {
		this.runGateway = options.runGateway ?? runGatewayWriteOp;
	}

	async execute(input: MutationInput): Promise<JsonObject> {
		const config = gatewayEntityMutationConfig(input.toolName);
		const reviewedSpec = reviewedAgenticChatGatewayMutationSpecV1(input.toolName);
		if (!config || !reviewedSpec) {
			throw knownFailure(
				'mutation_adapter_not_allowlisted',
				`No straightforward gateway entity adapter is enabled for ${input.toolName}`
			);
		}

		assertMutationAdapterBoundary(input, {
			toolName: input.toolName,
			operationName: reviewedSpec.operationName,
			downstreamIdempotencySupported: false,
			reviewedArgumentNames: new Set(reviewedSpec.reviewedArgumentNames)
		});

		const contextProjectId = requestProjectId(input);
		const argumentProjectId =
			config.mode === 'create'
				? requiredUuid(input.arguments.project_id, 'project_id')
				: null;
		if (
			contextProjectId !== null &&
			argumentProjectId !== null &&
			contextProjectId !== argumentProjectId
		) {
			throw knownFailure(
				'mutation_project_scope_mismatch',
				`${input.toolName} project_id is outside the admitted turn context`
			);
		}
		const projectId = contextProjectId ?? argumentProjectId;
		const expectedEntityId =
			config.entityIdArgument === null
				? null
				: requiredUuid(input.arguments[config.entityIdArgument], config.entityIdArgument);
		const gatewayArguments = normalizeGatewayArguments(input);

		let result: Awaited<ReturnType<GatewayRunner>>;
		try {
			result = await this.runGateway({
				admin: this.client,
				userId: input.executionInput.claim.userId,
				scope: {
					mode: 'read_write',
					allowed_ops: [reviewedSpec.operationName],
					...(projectId
						? { project_ids: [projectId], write_project_ids: [projectId] }
						: {})
				},
				op: reviewedSpec.operationName,
				args: gatewayArguments,
				chatSessionId: input.executionInput.claim.sessionId
			});
		} catch (error) {
			throw uncertainFailure(
				`${input.toolName}_gateway_threw`,
				canonicalGatewayError(error, input.toolName)
			);
		}

		if (!result.ok) {
			throwGatewayResultFailure(input.toolName, result.error);
		}

		const entity = requireEntityReceipt({
			value: result.data,
			input,
			config,
			projectId,
			expectedEntityId
		});
		const display =
			typeof entity[config.displayField] === 'string'
				? entity[config.displayField]
				: config.mode === 'update' && expectedEntityId
					? expectedEntityId
					: config.fallbackLabel;
		const receipt = canonicalMutationReceipt(
			{
				[config.entityKind]: entity,
				message: `${config.mode === 'create' ? 'Created' : 'Updated'} ontology ${
					config.entityKind
				} "${display}"`
			},
			input.toolName
		);
		assertMutationReceiptSize(receipt, input.toolName);
		return receipt;
	}
}

function gatewayEntityMutationConfig(toolName: string): GatewayEntityMutationConfig | null {
	if (!Object.hasOwn(GATEWAY_ENTITY_MUTATION_CONFIG, toolName)) return null;
	return GATEWAY_ENTITY_MUTATION_CONFIG[toolName as AgenticChatGatewayEntityMutationToolNameV1];
}

function normalizeGatewayArguments(input: MutationInput): Record<string, unknown> {
	const args = { ...input.arguments } as Record<string, unknown>;
	if (input.toolName === 'update_onto_document') {
		if (args.update_strategy === 'merge_llm') {
			throw knownFailure(
				'mutation_arguments_not_admitted',
				'update_onto_document does not support merge_llm in this execution mode'
			);
		}
		if (isRecord(args.props) && Object.keys(args.props).length === 0) {
			delete args.props;
		}
	}
	if (input.toolName === 'create_onto_milestone') {
		requiredUuid(args.goal_id, 'goal_id');
	}
	if (input.toolName === 'create_onto_risk' && typeof args.impact !== 'string') {
		throw knownFailure(
			'mutation_arguments_not_admitted',
			'create_onto_risk requires the signed impact field'
		);
	}
	if (
		(input.toolName === 'create_onto_goal' || input.toolName === 'update_onto_goal') &&
		Object.hasOwn(args, 'target_date')
	) {
		args.target_date = normalizeLegacyDate(args.target_date, 'target_date', true);
	}
	if (
		(input.toolName === 'create_onto_milestone' ||
			input.toolName === 'update_onto_milestone') &&
		Object.hasOwn(args, 'due_at')
	) {
		args.due_at = normalizeLegacyDate(args.due_at, 'due_at', false);
	}
	return args;
}

function normalizeLegacyDate(value: unknown, field: string, endOfDate: boolean): string | null {
	if (value === null || value === '') return null;
	if (typeof value !== 'string') {
		throw knownFailure('mutation_arguments_not_admitted', `${field} must be a valid date`);
	}
	const text = value.trim();
	if (!text) return null;
	const dateOnly = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
	const date = dateOnly
		? new Date(
				Date.UTC(
					Number(dateOnly[1]),
					Number(dateOnly[2]) - 1,
					Number(dateOnly[3]),
					endOfDate ? 23 : 0,
					endOfDate ? 59 : 0,
					endOfDate ? 59 : 0
				)
			)
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

function requireEntityReceipt(params: {
	value: Record<string, unknown> | undefined;
	input: MutationInput;
	config: GatewayEntityMutationConfig;
	projectId: string | null;
	expectedEntityId: string | null;
}): JsonObject {
	const candidate = params.value?.[params.config.entityKind];
	if (!isRecord(candidate)) {
		throw uncertainFailure(
			`${params.input.toolName}_receipt_invalid`,
			`${params.input.toolName} returned no ${params.config.entityKind} receipt`
		);
	}
	let entity = { ...candidate };
	if (
		!canonicalUuid(entity.id) ||
		!canonicalUuid(entity.project_id) ||
		(params.expectedEntityId !== null && entity.id !== params.expectedEntityId) ||
		(params.projectId !== null && entity.project_id !== params.projectId)
	) {
		throw uncertainFailure(
			`${params.input.toolName}_receipt_invalid`,
			`${params.input.toolName} returned a mismatched ${params.config.entityKind} receipt`
		);
	}
	delete entity.project_name;
	if (
		params.config.entityKind === 'document' &&
		isRecord(entity.props) &&
		entity.props.origin === 'external_agent'
	) {
		const props = { ...entity.props };
		delete props.origin;
		entity.props = props;
	}
	if (params.config.entityKind === 'milestone') {
		delete entity.type_key;
		entity = withComputedMilestoneState(entity);
		if (params.config.mode === 'create') {
			entity.goal_id = params.input.arguments.goal_id ?? null;
		}
	}
	return canonicalMutationReceipt(entity, params.input.toolName);
}
