// apps/worker/src/workers/agentic-chat/mutations/receipt-builders.ts
//
// Entity-receipt post-processors and whole-receipt builders for the reviewed
// mutation table.
//
// Split out of `argument-normalizers.ts`, which still owns the argument
// normalizers, the shared `AgenticChatMutationExecutionContextV1` context
// type, the `ExpectedEdge` shape a normalizer hands off to the `edge_link`
// builder below, and the two small cross-cutting helpers (`invalidReceipt`,
// `sameJson`) imported here. `argument-normalizers.ts` re-exports everything
// below, so existing imports of that module are unaffected. The table in
// `mutationToolCatalog.ts` composes these; `tableMutationAdapter.ts` executes
// them. Nothing here touches the database or the network.

import { withComputedMilestoneState } from '@buildos/agentic-chat-runtime/tools/milestone-state';
import { buildEntityMentionPingToolResult } from '@buildos/shared-agent-ops/ops/entity-mention-ping.service';
import { buildTaskMoveToolResult } from '@buildos/shared-agent-ops/ontology/task-move.service';
import { sanitizeProjectForClient } from '@buildos/shared-agent-ops/utils/project-props-sanitizer';
import { type JsonObject } from '@buildos/shared-types';
import {
	canonicalMutationReceipt,
	canonicalUuid,
	isRecord,
	uncertainFailure
} from './adapter-boundary';
import {
	type AgenticChatMutationExecutionContextV1,
	type ExpectedEdge,
	invalidReceipt,
	sameJson
} from './execution-context';
import type {
	AgenticChatMutationReceiptBuilderIdV1,
	AgenticChatMutationReceiptPostProcessorIdV1
} from './tool-catalog';

export type AgenticChatMutationReceiptPostProcessorV1 = (
	entity: Record<string, unknown>,
	context: AgenticChatMutationExecutionContextV1
) => Record<string, unknown>;

export type AgenticChatMutationReceiptBuilderV1 = (
	data: Record<string, unknown> | undefined,
	context: AgenticChatMutationExecutionContextV1
) => JsonObject;

const KNOWN_TASK_MOVE_STATUSES = ['moved', 'already_moved', 'confirmation_required', 'blocked'];

// ---------------------------------------------------------------------------
// Entity-receipt post-processors
// ---------------------------------------------------------------------------

export const AGENTIC_CHAT_MUTATION_RECEIPT_POST_PROCESSORS_V1: Readonly<
	Record<AgenticChatMutationReceiptPostProcessorIdV1, AgenticChatMutationReceiptPostProcessorV1>
> = Object.freeze({
	/**
	 * `origin` is gateway provenance metadata, not part of the legacy chat
	 * document receipt.
	 */
	strip_external_agent_origin: (entity) => {
		if (!isRecord(entity.props) || entity.props.origin !== 'external_agent') return entity;
		const props = { ...entity.props };
		delete props.origin;
		return { ...entity, props };
	},

	milestone_state: (entity) => {
		const next = { ...entity };
		delete next.type_key;
		return withComputedMilestoneState(next);
	},

	/** The create op does not echo the parent goal the caller signed. */
	carry_goal_id_argument: (entity, context) => ({
		...entity,
		goal_id: context.input.arguments.goal_id ?? null
	}),

	sanitize_project_for_client: (entity) => sanitizeProjectForClient(entity)
});

// ---------------------------------------------------------------------------
// Whole-receipt builders
// ---------------------------------------------------------------------------

export const AGENTIC_CHAT_MUTATION_RECEIPT_BUILDERS_V1: Readonly<
	Record<AgenticChatMutationReceiptBuilderIdV1, AgenticChatMutationReceiptBuilderV1>
> = Object.freeze({
	edge_link: (value, context) => {
		const expected = context.expected.edge as ExpectedEdge;
		if (!value || (value.created !== 0 && value.created !== 1) || !isRecord(value.edge)) {
			throw invalidReceipt(context.toolName, 'returned no exact edge receipt');
		}
		const edge = value.edge;
		if (
			!canonicalUuid(edge.id) ||
			edge.project_id !== context.projectId ||
			edge.src_kind !== expected.src_kind ||
			edge.src_id !== expected.src_id ||
			edge.dst_kind !== expected.dst_kind ||
			edge.dst_id !== expected.dst_id ||
			edge.rel !== expected.rel ||
			!isRecord(edge.props) ||
			(value.created === 1 && !sameJson(edge.props, expected.props))
		) {
			throw invalidReceipt(context.toolName, 'returned a mismatched edge receipt');
		}
		return canonicalMutationReceipt(
			{
				created: value.created,
				edge_id: edge.id,
				edge: {
					id: edge.id,
					project_id: edge.project_id,
					src_kind: edge.src_kind,
					src_id: edge.src_id,
					dst_kind: edge.dst_kind,
					dst_id: edge.dst_id,
					rel: edge.rel
				},
				message: 'Linked entities successfully.'
			},
			context.toolName
		);
	},

	edge_unlink: (value, context) => {
		const edgeId = context.args.edge_id;
		if (!value || value.deleted !== true || value.edge_id !== edgeId || !isRecord(value.edge)) {
			throw invalidReceipt(context.toolName, 'returned no exact deletion receipt');
		}
		const edge = value.edge;
		if (
			edge.id !== edgeId ||
			edge.project_id !== context.projectId ||
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
			throw invalidReceipt(context.toolName, 'returned a mismatched deletion receipt');
		}
		return canonicalMutationReceipt(
			{ deleted: true, message: 'Unlinked entities successfully.' },
			context.toolName
		);
	},

	document_tree_move: (value, context) => {
		const toolName = context.toolName;
		const documentId = String(context.args.document_id);
		const parentTitleHint =
			typeof context.expected.parentTitle === 'string' ? context.expected.parentTitle : null;
		if (
			!value ||
			value.project_id !== context.projectId ||
			value.document_id !== context.args.document_id ||
			!isRecord(value.structure)
		) {
			throw invalidReceipt(toolName, 'returned no matching tree receipt');
		}
		const structure = canonicalMutationReceipt(
			{ structure: value.structure },
			toolName
		).structure;
		if (!isRecord(structure)) {
			throw invalidReceipt(toolName, 'returned an invalid document structure');
		}
		const requestedParentId =
			typeof context.args.new_parent_id === 'string' ? context.args.new_parent_id : null;
		let expectedParentId: string | null = requestedParentId;
		let parentCreated = false;
		if (parentTitleHint !== null) {
			// Parent-by-title: the destination id only exists in the gateway receipt.
			if (!canonicalUuid(value.parent_id) || value.parent_id === documentId) {
				throw invalidReceipt(toolName, 'did not return the parent resolved by title');
			}
			expectedParentId = value.parent_id;
			parentCreated = value.parent_created === true;
		} else if (
			value.parent_id !== undefined &&
			value.parent_id !== null &&
			value.parent_id !== requestedParentId
		) {
			throw invalidReceipt(toolName, 'returned a parent other than the requested one');
		}
		const placement = assertExactTreePlacement({
			structure,
			documentId,
			parentId: expectedParentId,
			position: Number(context.args.new_position),
			toolName
		});
		if (
			parentTitleHint !== null &&
			(typeof placement.parentTitle !== 'string' ||
				placement.parentTitle.trim().toLowerCase() !== parentTitleHint.toLowerCase())
		) {
			throw invalidReceipt(toolName, 'placed the document under a differently titled parent');
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
					? `Moved document ${documentId} under "${parentTitle ?? parentTitleHint}" (parent document created).`
					: `Moved document ${documentId} under "${parentTitle ?? expectedParentId}".`;
		return canonicalMutationReceipt(
			{
				structure,
				parent_id: expectedParentId,
				parent_title: parentTitle,
				parent_created: parentCreated,
				message
			},
			toolName
		);
	},

	task_document_attach: (value, context) => {
		const toolName = context.toolName;
		if (!value || !isRecord(value.document) || !isRecord(value.edge)) {
			throw invalidReceipt(toolName, 'returned no document/edge receipt');
		}
		const document = { ...value.document };
		const edge = value.edge;
		const { task_id: taskId, document_id: documentId, role } = context.args;
		if (
			!canonicalUuid(document.id) ||
			document.id !== documentId ||
			document.project_id !== context.projectId ||
			!canonicalUuid(edge.id) ||
			edge.project_id !== context.projectId ||
			edge.src_kind !== 'task' ||
			edge.src_id !== taskId ||
			edge.dst_kind !== 'document' ||
			edge.dst_id !== documentId ||
			edge.rel !== 'task_has_document' ||
			!isRecord(edge.props) ||
			edge.props.role !== role
		) {
			throw invalidReceipt(toolName, 'returned a mismatched document/edge receipt');
		}
		delete document.project_name;
		const title = typeof document.title === 'string' ? document.title : 'Document';
		return canonicalMutationReceipt(
			{
				document,
				edge: {
					src_kind: edge.src_kind,
					src_id: edge.src_id,
					dst_kind: edge.dst_kind,
					dst_id: edge.dst_id,
					rel: edge.rel,
					props: edge.props
				},
				message: `Linked document "${title}" to task.`
			},
			toolName
		);
	},

	task_move: (value, context) => {
		assertTaskMoveResult(value, {
			toolName: context.toolName,
			taskId: String(context.args.task_id),
			sourceProjectId: String(context.args.expected_source_project_id),
			destinationProjectId: String(context.args.destination_project_id)
		});
		return canonicalMutationReceipt(buildTaskMoveToolResult(value as never), context.toolName);
	},

	entity_ping: (value, context) => {
		const expectedMentioned = context.expected.mentionedUserIds as string[];
		const actorUserId = context.input.executionInput.claim.userId;
		const expectedNotified = expectedMentioned.filter((userId) => userId !== actorUserId);
		if (
			!isRecord(value) ||
			value.project_id !== context.projectId ||
			value.entity_type !== context.expected.entityType ||
			value.entity_id !== context.expected.entityId ||
			!sameOrderedStrings(value.mentioned_user_ids, expectedMentioned) ||
			!sameOrderedStrings(value.notified_user_ids, expectedNotified)
		) {
			throw uncertainFailure(
				`${context.toolName}_receipt_invalid`,
				'tag_onto_entity returned a mismatched or malformed receipt'
			);
		}
		return canonicalMutationReceipt(
			buildEntityMentionPingToolResult(value as never),
			context.toolName
		);
	},

	/**
	 * Prove the image receipt: the same asset, inside the admitted project, and
	 * — when a placement was requested — exactly that placement. Only the
	 * compact name + placement reach the model.
	 */
	asset_update: (value, context) => {
		const toolName = context.toolName;
		if (!value || !isRecord(value.asset) || !isRecord(value.placement)) {
			throw invalidReceipt(toolName, 'returned no image receipt');
		}
		const asset = value.asset;
		const placement = value.placement;
		if (
			asset.id !== context.args.asset_id ||
			!canonicalUuid(asset.project_id) ||
			(context.projectId !== null && asset.project_id !== context.projectId)
		) {
			throw invalidReceipt(toolName, 'returned a mismatched image receipt');
		}
		const isDocument = placement.kind === 'document' && canonicalUuid(placement.document_id);
		if (!isDocument && placement.kind !== 'images_shelf') {
			throw invalidReceipt(toolName, 'returned an unknown image placement');
		}
		if (Object.hasOwn(context.expected, 'placementDocumentId')) {
			const expected = context.expected.placementDocumentId;
			if (
				expected === null
					? placement.kind !== 'images_shelf'
					: !isDocument || placement.document_id !== expected
			) {
				throw invalidReceipt(toolName, 'placed the image somewhere other than requested');
			}
		}
		for (const field of ['caption', 'alt_text'] as const) {
			const requested = context.args[field];
			const saved = asset[field];
			if (
				typeof requested === 'string' &&
				(typeof saved !== 'string' ||
					saved.replace(/\s+/g, ' ').trim() !== requested.replace(/\s+/g, ' ').trim())
			) {
				throw invalidReceipt(toolName, `did not save the requested ${field}`);
			}
		}
		return canonicalMutationReceipt(
			{
				asset: {
					id: asset.id,
					project_id: asset.project_id,
					caption: typeof asset.caption === 'string' ? asset.caption : null,
					alt_text: typeof asset.alt_text === 'string' ? asset.alt_text : null
				},
				placement: isDocument
					? {
							kind: 'document',
							document_id: placement.document_id,
							document_title:
								typeof placement.document_title === 'string'
									? placement.document_title
									: null
						}
					: { kind: 'images_shelf' },
				message:
					typeof value.message === 'string' && value.message.trim()
						? value.message
						: 'Updated project image.'
			},
			toolName
		);
	},

	/**
	 * Calendar event receipt. The provider half can fail while the ontology row
	 * stands, so `ok` and `synced` are separate facts and a dead Google grant
	 * comes back as data — `reconnect_required` plus the same `client_action`
	 * envelope the Gmail connection handoff renders — never as a thrown error.
	 */
	calendar_event: (value, context) => {
		if (!isRecord(value)) {
			throw invalidReceipt(context.toolName, 'returned no calendar receipt');
		}
		const errorCode = typeof value.error_code === 'string' ? value.error_code : null;
		if (errorCode === null && value.ok !== true) {
			throw invalidReceipt(context.toolName, 'returned an unclassified calendar failure');
		}
		return canonicalMutationReceipt(
			{
				ok: value.ok === true,
				event_id: value.event_id ?? null,
				google_event_id: value.google_event_id ?? null,
				html_link: value.html_link ?? null,
				calendar_id: value.calendar_id ?? null,
				scope: value.scope ?? null,
				synced: value.synced === true,
				...(value.deleted === true ? { deleted: true } : {}),
				...(value.already_missing === true ? { already_missing: true } : {}),
				...(value.sync_error ? { sync_error: value.sync_error } : {}),
				...(value.task_link_created !== undefined
					? { task_link_created: value.task_link_created }
					: {}),
				...(value.task_link_error ? { task_link_error: value.task_link_error } : {}),
				...strippedFieldsReceipt(context),
				...calendarFailureReceipt(errorCode, value.connection_id ?? null),
				message: calendarEventMessage(context.toolName, value, errorCode)
			},
			context.toolName
		);
	},

	project_calendar: (value, context) => {
		if (!isRecord(value) || typeof value.project_id !== 'string') {
			throw invalidReceipt(context.toolName, 'returned no project calendar receipt');
		}
		const errorCode = typeof value.error_code === 'string' ? value.error_code : null;
		if (errorCode === null && value.ok !== true) {
			throw invalidReceipt(context.toolName, 'returned an unclassified calendar failure');
		}
		return canonicalMutationReceipt(
			{
				ok: value.ok === true,
				project_id: value.project_id,
				calendar_id: value.calendar_id ?? null,
				sync_mode: value.sync_mode ?? null,
				...strippedFieldsReceipt(context),
				...calendarFailureReceipt(errorCode, value.connection_id ?? null),
				message:
					errorCode === null
						? 'Updated the project calendar.'
						: calendarFailureMessage(errorCode)
			},
			context.toolName
		);
	}
});

const CALENDAR_RECONNECT_PATH = '/profile?tab=calendar';

/**
 * The `client_action` envelope shape the Gmail connection handoff already uses,
 * so one renderer can present either provider reconnection.
 */
function calendarFailureReceipt(
	errorCode: string | null,
	connectionId: unknown
): Record<string, unknown> {
	if (errorCode === null) return {};
	const connection = typeof connectionId === 'string' && connectionId ? connectionId : null;
	if (errorCode !== 'reconnect_required') {
		return { error_code: errorCode, connection_id: connection, requires_user_action: false };
	}
	return {
		error_code: errorCode,
		connection_id: connection,
		status: 'browser_handoff_required',
		requires_user_action: true,
		client_action: {
			kind: 'connect_google_calendar',
			action_id: `calendar:${connection ?? 'default'}`,
			mode: 'reconnect',
			connection_id: connection,
			title: 'Reconnect Google Calendar',
			description: `Reconnect Google Calendar from Profile > Calendar (${CALENDAR_RECONNECT_PATH}). The BuildOS record was saved; only the Google copy is missing.`,
			button_label: 'Reconnect Google Calendar'
		}
	};
}

function calendarFailureMessage(errorCode: string): string {
	return errorCode === 'reconnect_required'
		? 'Google Calendar must be reconnected before this change can reach Google. The BuildOS record was saved.'
		: 'Google Calendar is not configured in this environment, so nothing was sent to Google.';
}

function calendarEventMessage(
	toolName: string,
	value: Record<string, unknown>,
	errorCode: string | null
): string {
	if (errorCode !== null) return calendarFailureMessage(errorCode);
	const verb =
		toolName === 'create_calendar_event'
			? 'Created'
			: toolName === 'delete_calendar_event'
				? 'Deleted'
				: 'Updated';
	return value.synced === true
		? `${verb} the calendar event and synced it to Google.`
		: `${verb} the BuildOS calendar event; it is not synced to Google.`;
}

function strippedFieldsReceipt(
	context: AgenticChatMutationExecutionContextV1
): Record<string, unknown> {
	const stripped = context.expected.strippedFields;
	return Array.isArray(stripped) && stripped.length > 0 ? { stripped_fields: stripped } : {};
}

// ---------------------------------------------------------------------------
// Shared helpers (receipt-builder side)
// ---------------------------------------------------------------------------

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

function assertTaskMoveResult(
	result: Record<string, unknown> | undefined,
	expected: {
		toolName: string;
		taskId: string;
		sourceProjectId: string;
		destinationProjectId: string;
	}
): void {
	const invalid = () =>
		uncertainFailure(
			`${expected.toolName}_receipt_invalid`,
			'move_onto_task returned a mismatched or malformed receipt'
		);
	if (
		!isRecord(result) ||
		!KNOWN_TASK_MOVE_STATUSES.includes(String(result.status)) ||
		typeof result.requires_user_action !== 'boolean' ||
		!isRecord(result.task) ||
		result.task.id !== expected.taskId ||
		!isRecord(result.source_project) ||
		result.source_project.id !== expected.sourceProjectId ||
		!isRecord(result.destination_project) ||
		result.destination_project.id !== expected.destinationProjectId
	) {
		throw invalid();
	}

	if (result.status === 'moved') {
		if (
			result.requires_user_action ||
			result.task.project_id !== expected.destinationProjectId ||
			!isRecord(result.task_before) ||
			result.task_before.id !== expected.taskId ||
			result.task_before.project_id !== expected.sourceProjectId ||
			!isRecord(result.impact) ||
			!isRecord(result.applied)
		) {
			throw invalid();
		}
		return;
	}
	if (result.status === 'already_moved') {
		if (
			result.requires_user_action ||
			result.task.project_id !== expected.destinationProjectId
		) {
			throw invalid();
		}
		return;
	}
	if (
		!result.requires_user_action ||
		result.task.project_id !== expected.sourceProjectId ||
		!isRecord(result.impact)
	) {
		throw invalid();
	}
	if (
		result.status === 'confirmation_required' &&
		(typeof result.confirmation_token !== 'string' ||
			result.confirmation_token.length === 0 ||
			result.confirmation_token.length > 128)
	) {
		throw invalid();
	}
	if (
		result.status === 'blocked' &&
		(typeof result.blocker !== 'string' ||
			result.blocker.length === 0 ||
			typeof result.message !== 'string' ||
			result.message.length === 0)
	) {
		throw invalid();
	}
}

function sameOrderedStrings(value: unknown, expected: readonly string[]): boolean {
	return (
		Array.isArray(value) &&
		value.length === expected.length &&
		value.every((entry, index) => entry === expected[index])
	);
}
