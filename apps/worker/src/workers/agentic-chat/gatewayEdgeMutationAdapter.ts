// apps/worker/src/workers/agentic-chat/gatewayEdgeMutationAdapter.ts
import { runGatewayWriteOp } from '@buildos/shared-agent-ops/gateway/op-execution-gateway';
import {
	type EntityKind,
	normalizeEdgeDirection
} from '@buildos/shared-agent-ops/ontology/edge-direction';
import { resolveEdgeRelationship } from '@buildos/shared-agent-ops/ontology/edge-relationship-resolver';
import {
	type Database,
	type JsonObject,
	type JsonValue,
	canonicalizeAgenticChatJson
} from '@buildos/shared-types';
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

export const AGENTIC_CHAT_EDGE_MUTATION_TOOL_NAMES_V1 = Object.freeze([
	'link_onto_entities',
	'unlink_onto_edge'
] as const);

export type AgenticChatEdgeMutationToolNameV1 =
	(typeof AGENTIC_CHAT_EDGE_MUTATION_TOOL_NAMES_V1)[number];

const REVIEWED_LINK_ENTITY_KINDS = Object.freeze([
	'plan',
	'goal',
	'milestone',
	'task',
	'document',
	'risk',
	'metric',
	'source'
] as const satisfies readonly EntityKind[]);

type ReviewedLinkEntityKind = (typeof REVIEWED_LINK_ENTITY_KINDS)[number];

type ExpectedEdge = {
	src_kind: ReviewedLinkEntityKind;
	src_id: string;
	dst_kind: ReviewedLinkEntityKind;
	dst_id: string;
	rel: string;
	props: Record<string, unknown>;
};

type LinkDispatch = {
	toolName: 'link_onto_entities';
	projectId: string;
	gatewayArguments: ExpectedEdge;
	expectedEdge: ExpectedEdge;
};

type UnlinkDispatch = {
	toolName: 'unlink_onto_edge';
	projectId: string;
	gatewayArguments: { edge_id: string };
	edgeId: string;
};

type ReviewedDispatch = LinkDispatch | UnlinkDispatch;

/**
 * Bounded exact-edge writes. Neither operation is retryable: general edges have
 * no uniqueness constraint and deletes have no durable tombstone.
 */
export class AgenticChatGatewayEdgeMutationAdapter implements AgenticChatMutatingToolPortV1 {
	private readonly runGateway: GatewayRunner;

	constructor(
		private readonly client: SupabaseClient<Database>,
		options: { runGateway?: GatewayRunner } = {}
	) {
		this.runGateway = options.runGateway ?? runGatewayWriteOp;
	}

	async execute(input: MutationInput): Promise<JsonObject> {
		const dispatch = reviewedDispatch(input);
		const spec = reviewedAgenticChatGatewayMutationSpecV1(dispatch.toolName);
		if (!spec) {
			throw knownFailure(
				'mutation_adapter_not_allowlisted',
				`No edge adapter is enabled for ${input.toolName}`
			);
		}

		let result: Awaited<ReturnType<GatewayRunner>>;
		try {
			result = await this.runGateway({
				admin: this.client,
				userId: input.executionInput.claim.userId,
				scope: {
					mode: 'read_write',
					allowed_ops: [spec.operationName],
					project_ids: [dispatch.projectId],
					write_project_ids: [dispatch.projectId]
				},
				op: spec.operationName,
				args: dispatch.gatewayArguments,
				callSessionId: input.executionInput.claim.sessionId
			});
		} catch (error) {
			throw uncertainFailure(
				`${dispatch.toolName}_gateway_threw`,
				canonicalGatewayError(error, dispatch.toolName)
			);
		}

		if (!result.ok) {
			throwGatewayResultFailure(dispatch.toolName, result.error);
		}

		const receipt =
			dispatch.toolName === 'link_onto_entities'
				? linkReceipt(result.data, dispatch)
				: unlinkReceipt(result.data, dispatch);
		assertMutationReceiptSize(receipt, dispatch.toolName);
		return receipt;
	}
}

function reviewedDispatch(input: MutationInput): ReviewedDispatch {
	if (!isEdgeToolName(input.toolName)) {
		throw knownFailure(
			'mutation_adapter_not_allowlisted',
			`No edge adapter is enabled for ${input.toolName}`
		);
	}
	const spec = reviewedAgenticChatGatewayMutationSpecV1(input.toolName);
	if (!spec) {
		throw knownFailure(
			'mutation_adapter_not_allowlisted',
			`No reviewed mutation contract exists for ${input.toolName}`
		);
	}
	assertMutationAdapterBoundary(input, {
		toolName: input.toolName,
		operationName: spec.operationName,
		downstreamIdempotencySupported: spec.downstreamIdempotencySupported,
		reviewedArgumentNames: new Set(spec.reviewedArgumentNames)
	});

	const projectId = requestProjectId(input);
	if (projectId === null) {
		throw knownFailure(
			'mutation_context_invalid',
			`${input.toolName} requires an admitted project context`
		);
	}

	if (input.toolName === 'unlink_onto_edge') {
		const edgeId = requiredUuid(input.arguments.edge_id, 'edge_id');
		return {
			toolName: input.toolName,
			projectId,
			gatewayArguments: { edge_id: edgeId },
			edgeId
		};
	}

	const srcKind = reviewedEntityKind(input.arguments.src_kind, 'src_kind');
	const dstKind = reviewedEntityKind(input.arguments.dst_kind, 'dst_kind');
	const srcId = requiredUuid(input.arguments.src_id, 'src_id');
	const dstId = requiredUuid(input.arguments.dst_id, 'dst_id');
	if (srcId === dstId) {
		throw knownFailure(
			'mutation_arguments_not_admitted',
			'link_onto_entities cannot create a self-referencing edge'
		);
	}
	const rel = requiredShortText(input.arguments.rel, 'rel', 128);
	const props = normalizedProps(input.arguments.props);
	const resolved = resolveEdgeRelationship({ srcKind, dstKind, rel });
	if (!resolved.rel) {
		throw knownFailure('mutation_arguments_not_admitted', 'rel is invalid');
	}
	const normalized = normalizeEdgeDirection({
		src_kind: srcKind,
		src_id: srcId,
		dst_kind: dstKind,
		dst_id: dstId,
		rel: resolved.rel,
		props: {
			...props,
			...(resolved.original_rel && props.original_rel === undefined
				? { original_rel: resolved.original_rel }
				: {})
		}
	});
	if (
		!normalized ||
		!isReviewedEntityKind(normalized.src_kind) ||
		!isReviewedEntityKind(normalized.dst_kind)
	) {
		throw knownFailure('mutation_arguments_not_admitted', 'rel cannot link these entity kinds');
	}
	const expectedEdge: ExpectedEdge = {
		src_kind: normalized.src_kind,
		src_id: normalized.src_id,
		dst_kind: normalized.dst_kind,
		dst_id: normalized.dst_id,
		rel: normalized.rel,
		props: normalized.props
	};
	return {
		toolName: input.toolName,
		projectId,
		gatewayArguments: expectedEdge,
		expectedEdge
	};
}

function linkReceipt(
	value: Record<string, unknown> | undefined,
	dispatch: LinkDispatch
): JsonObject {
	if (!value || (value.created !== 0 && value.created !== 1) || !isRecord(value.edge)) {
		throw invalidReceipt(dispatch.toolName, 'returned no exact edge receipt');
	}
	const edge = value.edge;
	const expected = dispatch.expectedEdge;
	if (
		!canonicalUuid(edge.id) ||
		edge.project_id !== dispatch.projectId ||
		edge.src_kind !== expected.src_kind ||
		edge.src_id !== expected.src_id ||
		edge.dst_kind !== expected.dst_kind ||
		edge.dst_id !== expected.dst_id ||
		edge.rel !== expected.rel ||
		!isRecord(edge.props) ||
		(value.created === 1 && !sameJson(edge.props, expected.props))
	) {
		throw invalidReceipt(dispatch.toolName, 'returned a mismatched edge receipt');
	}
	return canonicalMutationReceipt(
		{ created: value.created, message: 'Linked entities successfully.' },
		dispatch.toolName
	);
}

function unlinkReceipt(
	value: Record<string, unknown> | undefined,
	dispatch: UnlinkDispatch
): JsonObject {
	if (
		!value ||
		value.deleted !== true ||
		value.edge_id !== dispatch.edgeId ||
		!isRecord(value.edge)
	) {
		throw invalidReceipt(dispatch.toolName, 'returned no exact deletion receipt');
	}
	const edge = value.edge;
	if (
		edge.id !== dispatch.edgeId ||
		edge.project_id !== dispatch.projectId ||
		!canonicalUuid(edge.src_id) ||
		!canonicalUuid(edge.dst_id) ||
		typeof edge.src_kind !== 'string' ||
		!edge.src_kind ||
		typeof edge.dst_kind !== 'string' ||
		!edge.dst_kind ||
		typeof edge.rel !== 'string' ||
		!edge.rel ||
		!isRecord(edge.props)
	) {
		throw invalidReceipt(dispatch.toolName, 'returned a mismatched deletion receipt');
	}
	return canonicalMutationReceipt(
		{ deleted: true, message: 'Unlinked entities successfully.' },
		dispatch.toolName
	);
}

function reviewedEntityKind(value: unknown, label: string): ReviewedLinkEntityKind {
	if (typeof value !== 'string' || value !== value.trim() || !isReviewedEntityKind(value)) {
		throw knownFailure(
			'mutation_arguments_not_admitted',
			`${label} must be a reviewed non-project ontology entity kind`
		);
	}
	return value;
}

function isReviewedEntityKind(value: string): value is ReviewedLinkEntityKind {
	return (REVIEWED_LINK_ENTITY_KINDS as readonly string[]).includes(value);
}

function requiredShortText(value: unknown, label: string, maxLength: number): string {
	if (typeof value !== 'string' || !value.trim() || value.trim().length > maxLength) {
		throw knownFailure(
			'mutation_arguments_not_admitted',
			`${label} must be a non-empty string of at most ${maxLength} characters`
		);
	}
	return value.trim();
}

function normalizedProps(value: unknown): Record<string, unknown> {
	if (value === undefined) return {};
	if (!isRecord(value)) {
		throw knownFailure('mutation_arguments_not_admitted', 'props must be an object');
	}
	return value;
}

function sameJson(left: Record<string, unknown>, right: Record<string, unknown>): boolean {
	return (
		canonicalizeAgenticChatJson(left as JsonValue) ===
		canonicalizeAgenticChatJson(right as JsonValue)
	);
}

function invalidReceipt(toolName: string, detail: string) {
	return uncertainFailure(`${toolName}_receipt_invalid`, `${toolName} ${detail}`);
}

function isEdgeToolName(toolName: string): toolName is AgenticChatEdgeMutationToolNameV1 {
	return (AGENTIC_CHAT_EDGE_MUTATION_TOOL_NAMES_V1 as readonly string[]).includes(toolName);
}
