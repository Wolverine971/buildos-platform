// apps/worker/src/workers/agentic-chat/gatewayDocumentRelationshipMutationAdapter.ts
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
import { reviewedAgenticChatGatewayMutationSpecV1 } from './mutationToolCatalog';

type GatewayRunner = typeof runGatewayWriteOp;

export const AGENTIC_CHAT_DOCUMENT_RELATIONSHIP_MUTATION_TOOL_NAMES_V1 = Object.freeze([
	'move_document_in_tree',
	'create_task_document'
] as const);

export type AgenticChatDocumentRelationshipMutationToolNameV1 =
	(typeof AGENTIC_CHAT_DOCUMENT_RELATIONSHIP_MUTATION_TOOL_NAMES_V1)[number];

type ReviewedDispatch = {
	toolName: AgenticChatDocumentRelationshipMutationToolNameV1;
	projectId: string;
	gatewayArguments: Record<string, unknown>;
	/** Present only for a parent-by-title move; the destination id is unknown pre-flight. */
	parentTitle?: string;
};

const MAX_PARENT_TITLE_LENGTH = 120;

/**
 * Bounded document-relationship writes: exact UUID tree placement, parent-by-title
 * grouping (reuse the document with that title or create it, then move), and
 * attaching an existing document to a task. Task-document creation remains
 * outside this adapter. A title move can commit the parent before the move
 * fails, so any gateway failure on that branch is classified as uncertain
 * rather than known, and the receipt must prove placement against the parent
 * id the gateway resolved.
 */
export class AgenticChatGatewayDocumentRelationshipMutationAdapter
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
		const dispatch = reviewedDispatch(input);
		const spec = reviewedAgenticChatGatewayMutationSpecV1(dispatch.toolName);
		if (!spec) {
			throw knownFailure(
				'mutation_adapter_not_allowlisted',
				`No document relationship adapter is enabled for ${input.toolName}`
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
			if (dispatch.parentTitle !== undefined) {
				// The title branch may have created the parent document before the
				// move failed; the outcome is not provably unchanged.
				throw uncertainFailure(
					`${dispatch.toolName}_title_branch_uncertain`,
					result.error?.message ??
						`${dispatch.toolName} failed after resolving a parent by title`
				);
			}
			throwGatewayResultFailure(dispatch.toolName, result.error);
		}

		const receipt =
			dispatch.toolName === 'move_document_in_tree'
				? moveReceipt(result.data, dispatch)
				: attachReceipt(result.data, dispatch);
		assertMutationReceiptSize(receipt, dispatch.toolName);
		return receipt;
	}
}

function reviewedDispatch(input: MutationInput): ReviewedDispatch {
	if (!isDocumentRelationshipToolName(input.toolName)) {
		throw knownFailure(
			'mutation_adapter_not_allowlisted',
			`No document relationship adapter is enabled for ${input.toolName}`
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

	if (input.toolName === 'move_document_in_tree') {
		const projectId = requiredUuid(input.arguments.project_id, 'project_id');
		const contextProjectId = requestProjectId(input);
		if (contextProjectId !== null && contextProjectId !== projectId) {
			throw knownFailure(
				'mutation_project_scope_mismatch',
				'move_document_in_tree project_id is outside the admitted turn context'
			);
		}
		const documentId = requiredUuid(input.arguments.document_id, 'document_id');
		const newParentId = optionalParentId(input.arguments.new_parent_id);
		const newPosition = normalizedPosition(input.arguments.new_position);
		// An exact parent UUID wins over a title; the title is only the id-free
		// grouping path for parents that may not exist yet.
		const parentTitle =
			newParentId === null ? normalizedParentTitle(input.arguments.new_parent_title) : null;
		return {
			toolName: input.toolName,
			projectId,
			gatewayArguments: {
				project_id: projectId,
				document_id: documentId,
				new_parent_id: newParentId,
				...(parentTitle !== null ? { new_parent_title: parentTitle } : {}),
				new_position: newPosition
			},
			...(parentTitle !== null ? { parentTitle } : {})
		};
	}

	const projectId = requestProjectId(input);
	if (projectId === null) {
		throw knownFailure(
			'mutation_context_invalid',
			'create_task_document requires an admitted project context'
		);
	}
	const taskId = requiredUuid(input.arguments.task_id, 'task_id');
	const documentId = requiredUuid(input.arguments.document_id, 'document_id');
	const role = normalizedRole(input.arguments.role);
	return {
		toolName: input.toolName,
		projectId,
		gatewayArguments: {
			task_id: taskId,
			document_id: documentId,
			role
		}
	};
}

function moveReceipt(
	value: Record<string, unknown> | undefined,
	dispatch: ReviewedDispatch
): JsonObject {
	if (
		!value ||
		value.project_id !== dispatch.projectId ||
		value.document_id !== dispatch.gatewayArguments.document_id ||
		!isRecord(value.structure)
	) {
		throw invalidReceipt(dispatch.toolName, 'returned no matching tree receipt');
	}
	const structure = canonicalMutationReceipt(
		{ structure: value.structure },
		dispatch.toolName
	).structure;
	if (!isRecord(structure)) {
		throw invalidReceipt(dispatch.toolName, 'returned an invalid document structure');
	}
	const documentId = String(dispatch.gatewayArguments.document_id);
	const requestedParentId =
		typeof dispatch.gatewayArguments.new_parent_id === 'string'
			? dispatch.gatewayArguments.new_parent_id
			: null;
	let expectedParentId: string | null = requestedParentId;
	let parentCreated = false;
	if (dispatch.parentTitle !== undefined) {
		// Parent-by-title: the destination id only exists in the gateway receipt.
		if (!canonicalUuid(value.parent_id) || value.parent_id === documentId) {
			throw invalidReceipt(dispatch.toolName, 'did not return the parent resolved by title');
		}
		expectedParentId = value.parent_id;
		parentCreated = value.parent_created === true;
	} else if (
		value.parent_id !== undefined &&
		value.parent_id !== null &&
		value.parent_id !== requestedParentId
	) {
		throw invalidReceipt(dispatch.toolName, 'returned a parent other than the requested one');
	}
	const placement = assertExactTreePlacement({
		structure,
		documentId,
		parentId: expectedParentId,
		position: Number(dispatch.gatewayArguments.new_position),
		toolName: dispatch.toolName
	});
	if (
		dispatch.parentTitle !== undefined &&
		(typeof placement.parentTitle !== 'string' ||
			placement.parentTitle.trim().toLowerCase() !== dispatch.parentTitle.toLowerCase())
	) {
		throw invalidReceipt(
			dispatch.toolName,
			'placed the document under a differently titled parent'
		);
	}
	const parentTitle =
		expectedParentId === null
			? null
			: typeof placement.parentTitle === 'string'
				? placement.parentTitle
				: null;
	const message =
		expectedParentId === null
			? `Moved document ${documentId} to the root of the doc structure.`
			: parentCreated
				? `Moved document ${documentId} under "${parentTitle ?? dispatch.parentTitle}" (parent document created).`
				: `Moved document ${documentId} under "${parentTitle ?? expectedParentId}".`;
	return canonicalMutationReceipt(
		{
			structure,
			parent_id: expectedParentId,
			parent_title: parentTitle,
			parent_created: parentCreated,
			message
		},
		dispatch.toolName
	);
}

function attachReceipt(
	value: Record<string, unknown> | undefined,
	dispatch: ReviewedDispatch
): JsonObject {
	if (!value || !isRecord(value.document) || !isRecord(value.edge)) {
		throw invalidReceipt(dispatch.toolName, 'returned no document/edge receipt');
	}
	const document = { ...value.document };
	const edge = value.edge;
	const taskId = dispatch.gatewayArguments.task_id;
	const documentId = dispatch.gatewayArguments.document_id;
	const role = dispatch.gatewayArguments.role;
	if (
		!canonicalUuid(document.id) ||
		document.id !== documentId ||
		document.project_id !== dispatch.projectId ||
		!canonicalUuid(edge.id) ||
		edge.project_id !== dispatch.projectId ||
		edge.src_kind !== 'task' ||
		edge.src_id !== taskId ||
		edge.dst_kind !== 'document' ||
		edge.dst_id !== documentId ||
		edge.rel !== 'task_has_document' ||
		!isRecord(edge.props) ||
		edge.props.role !== role
	) {
		throw invalidReceipt(dispatch.toolName, 'returned a mismatched document/edge receipt');
	}
	delete document.project_name;
	const publicEdge = {
		src_kind: edge.src_kind,
		src_id: edge.src_id,
		dst_kind: edge.dst_kind,
		dst_id: edge.dst_id,
		rel: edge.rel,
		props: edge.props
	};
	const title = typeof document.title === 'string' ? document.title : 'Document';
	return canonicalMutationReceipt(
		{
			document,
			edge: publicEdge,
			message: `Linked document "${title}" to task.`
		},
		dispatch.toolName
	);
}

type TreePlacement = {
	parentId: string | null;
	parentTitle: string | null;
	index: number;
	siblingCount: number;
};

function assertExactTreePlacement(input: {
	structure: Record<string, unknown>;
	documentId: string;
	parentId: string | null;
	position: number;
	toolName: string;
}): TreePlacement {
	if (!Number.isSafeInteger(input.structure.version) || !Array.isArray(input.structure.root)) {
		throw invalidReceipt(input.toolName, 'returned an invalid document structure');
	}
	const placements: TreePlacement[] = [];
	const visit = (nodes: unknown[], parent: { id: string; title: string | null } | null): void => {
		for (let index = 0; index < nodes.length; index += 1) {
			const node = nodes[index];
			if (!isRecord(node) || typeof node.id !== 'string') {
				throw invalidReceipt(input.toolName, 'returned a malformed tree node');
			}
			if (node.id === input.documentId) {
				placements.push({
					parentId: parent?.id ?? null,
					parentTitle: parent?.title ?? null,
					index,
					siblingCount: nodes.length
				});
			}
			if (node.children !== undefined) {
				if (!Array.isArray(node.children)) {
					throw invalidReceipt(input.toolName, 'returned malformed tree children');
				}
				visit(node.children, {
					id: node.id,
					title: typeof node.title === 'string' ? node.title : null
				});
			}
		}
	};
	visit(input.structure.root, null);
	const placement = placements[0];
	if (
		placements.length !== 1 ||
		!placement ||
		placement.parentId !== input.parentId ||
		placement.index !== Math.min(input.position, placement.siblingCount - 1)
	) {
		throw invalidReceipt(input.toolName, 'did not prove the requested tree placement');
	}
	return placement;
}

function optionalParentId(value: unknown): string | null {
	if (value === undefined || value === null || value === '') return null;
	return requiredUuid(value, 'new_parent_id');
}

function normalizedParentTitle(value: unknown): string | null {
	if (value === undefined || value === null || value === '') return null;
	if (typeof value !== 'string' || !value.trim()) {
		throw knownFailure(
			'mutation_arguments_not_admitted',
			'new_parent_title must be a non-empty string'
		);
	}
	const title = value.trim();
	if (title.length > MAX_PARENT_TITLE_LENGTH) {
		throw knownFailure(
			'mutation_arguments_not_admitted',
			`new_parent_title must be at most ${MAX_PARENT_TITLE_LENGTH} characters`
		);
	}
	return title;
}

function normalizedPosition(value: unknown): number {
	if (value === undefined) return 0;
	if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
		throw knownFailure(
			'mutation_arguments_not_admitted',
			'new_position must be a non-negative safe integer'
		);
	}
	return value;
}

function normalizedRole(value: unknown): string {
	if (value === undefined || value === null || value === '') return 'deliverable';
	if (typeof value !== 'string' || !value.trim()) {
		throw knownFailure('mutation_arguments_not_admitted', 'role must be a non-empty string');
	}
	const role = value.trim();
	if (role.length > 128) {
		throw knownFailure(
			'mutation_arguments_not_admitted',
			'role must be at most 128 characters'
		);
	}
	return role;
}

function invalidReceipt(toolName: string, detail: string) {
	return uncertainFailure(`${toolName}_receipt_invalid`, `${toolName} ${detail}`);
}

function isDocumentRelationshipToolName(
	toolName: string
): toolName is AgenticChatDocumentRelationshipMutationToolNameV1 {
	return (
		AGENTIC_CHAT_DOCUMENT_RELATIONSHIP_MUTATION_TOOL_NAMES_V1 as readonly string[]
	).includes(toolName);
}
