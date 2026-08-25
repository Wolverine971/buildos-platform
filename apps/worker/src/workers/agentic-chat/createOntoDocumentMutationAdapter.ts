// apps/worker/src/workers/agentic-chat/createOntoDocumentMutationAdapter.ts
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
import { AGENTIC_CHAT_REVIEWED_MUTATION_SPECS_V1 } from './mutationToolCatalog';

const TOOL_NAME = 'create_onto_document';
const MUTATION_SPEC = AGENTIC_CHAT_REVIEWED_MUTATION_SPECS_V1[TOOL_NAME];
const REVIEWED_ARGUMENT_NAMES = new Set(MUTATION_SPEC.reviewedArgumentNames);

type GatewayRunner = typeof runGatewayWriteOp;

/**
 * One-attempt worker adapter for `create_onto_document`.
 *
 * The shared handler has no domain-level effect-key persistence or exact replay
 * query. A thrown/ambiguous outcome must therefore reconcile as uncertain and
 * must never be retried automatically by the effect executor.
 */
export class AgenticChatCreateOntoDocumentMutationAdapter
	implements AgenticChatMutatingToolPortV1
{
	private readonly runGateway: GatewayRunner;

	constructor(
		private readonly client: SupabaseClient<Database>,
		options: { runGateway?: GatewayRunner } = {}
	) {
		this.runGateway = options.runGateway ?? runGatewayWriteOp;
	}

	async execute(input: MutationInput): Promise<JsonObject> {
		assertMutationAdapterBoundary(input, {
			toolName: TOOL_NAME,
			operationName: MUTATION_SPEC.operationName,
			downstreamIdempotencySupported: MUTATION_SPEC.downstreamIdempotencySupported,
			reviewedArgumentNames: REVIEWED_ARGUMENT_NAMES
		});

		const contextProjectId = requestProjectId(input);
		const argumentProjectId = requiredUuid(input.arguments.project_id, 'project_id');
		if (contextProjectId !== null && contextProjectId !== argumentProjectId) {
			throw knownFailure(
				'mutation_project_scope_mismatch',
				'create_onto_document project_id is outside the admitted turn context'
			);
		}
		const description =
			typeof input.arguments.description === 'string'
				? input.arguments.description.trim()
				: '';
		if (!description) {
			throw knownFailure(
				'mutation_arguments_not_admitted',
				'create_onto_document requires a non-empty signed description field'
			);
		}
		const gatewayArguments = { ...input.arguments } as Record<string, unknown>;
		gatewayArguments.description = description;
		// The signed chat tool retains the legacy `parent_id` name, while the
		// canonical shared gateway rejects aliases and accepts parent_document_id.
		if (Object.hasOwn(gatewayArguments, 'parent_id')) {
			gatewayArguments.parent_document_id =
				typeof gatewayArguments.parent_id === 'string' &&
				gatewayArguments.parent_id.trim().length === 0
					? null
					: gatewayArguments.parent_id;
			delete gatewayArguments.parent_id;
		}
		// The legacy document route treats an unusable position as omitted. Keep
		// that behavior even though the shared gateway validates more strictly.
		if (
			Object.hasOwn(gatewayArguments, 'position') &&
			(typeof gatewayArguments.position !== 'number' ||
				!Number.isInteger(gatewayArguments.position) ||
				gatewayArguments.position < 0)
		) {
			delete gatewayArguments.position;
		}

		let result: Awaited<ReturnType<GatewayRunner>>;
		try {
			result = await this.runGateway({
				admin: this.client,
				userId: input.executionInput.claim.userId,
				scope: {
					mode: 'read_write',
					allowed_ops: [MUTATION_SPEC.operationName],
					project_ids: [argumentProjectId],
					write_project_ids: [argumentProjectId]
				},
				op: MUTATION_SPEC.operationName,
				args: gatewayArguments,
				callSessionId: input.executionInput.claim.sessionId
			});
		} catch (error) {
			throw uncertainFailure(
				'create_onto_document_gateway_threw',
				canonicalGatewayError(error, TOOL_NAME)
			);
		}

		if (!result.ok) {
			throwGatewayResultFailure(TOOL_NAME, result.error);
		}

		const document = requireDocumentReceipt(result.data, argumentProjectId);
		const receipt = canonicalMutationReceipt(
			{
				document,
				message: `Created ontology document "${
					typeof document.title === 'string' ? document.title : 'Document'
				}"`
			},
			TOOL_NAME
		);
		assertMutationReceiptSize(receipt, TOOL_NAME);
		return receipt;
	}
}

function requireDocumentReceipt(
	value: Record<string, unknown> | undefined,
	projectId: string
): JsonObject {
	if (!isRecord(value) || !isRecord(value.document)) {
		throw uncertainFailure(
			'create_onto_document_receipt_invalid',
			'create_onto_document returned no document receipt'
		);
	}
	const document = { ...value.document };
	if (!canonicalUuid(document.id) || document.project_id !== projectId) {
		throw uncertainFailure(
			'create_onto_document_receipt_invalid',
			'create_onto_document returned a mismatched document receipt'
		);
	}
	delete document.project_name;
	// `origin` is gateway provenance metadata, not part of the legacy chat
	// document receipt. Keep the authoritative row metadata while preserving the
	// established model/public result shape.
	if (isRecord(document.props) && document.props.origin === 'external_agent') {
		const props = { ...document.props };
		delete props.origin;
		document.props = props;
	}
	return canonicalMutationReceipt(document, TOOL_NAME);
}
