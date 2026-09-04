// apps/worker/src/workers/agentic-chat/mutation-argument-normalizers.ts
//
// The named pure functions the reviewed mutation table points at.
//
// Every legacy quirk that used to justify a bespoke adapter file lives here as
// one small function with an id: date coercions, alias renames, fail-closed
// argument fences, and the few receipts that are not a single entity row. The
// table in `mutationToolCatalog.ts` composes them; `tableMutationAdapter.ts`
// executes them. Nothing here touches the database or the network.

import { withComputedMilestoneState } from '@buildos/agentic-chat-runtime/tools/milestone-state';
import {
	type EntityKind,
	normalizeEdgeDirection
} from '@buildos/shared-agent-ops/ontology/edge-direction';
import { buildEntityMentionPingToolResult } from '@buildos/shared-agent-ops/ops/entity-mention-ping.service';
import { buildTaskMoveToolResult } from '@buildos/shared-agent-ops/ontology/task-move.service';
import { resolveEdgeRelationship } from '@buildos/shared-agent-ops/ontology/edge-relationship-resolver';
import {
	sanitizeProjectForClient,
	sanitizeProjectPropsPatchInput
} from '@buildos/shared-agent-ops/utils/project-props-sanitizer';
import {
	type JsonObject,
	type JsonValue,
	canonicalizeAgenticChatJson
} from '@buildos/shared-types';
import {
	type MutationInput,
	canonicalMutationReceipt,
	canonicalUuid,
	isRecord,
	knownFailure,
	requiredUuid,
	uncertainFailure
} from './mutationAdapterBoundary';
import type {
	AgenticChatMutationArgumentNormalizerIdV1,
	AgenticChatMutationReceiptBuilderIdV1,
	AgenticChatMutationReceiptPostProcessorIdV1
} from './mutationToolCatalog';

/** Mutable state shared by one table-driven execution. */
export type AgenticChatMutationExecutionContextV1 = {
	toolName: string;
	input: MutationInput;
	/** Arguments as they will reach the runner. Normalizers rewrite this in place. */
	args: Record<string, unknown>;
	/** The resolved project fence, or null for an unfenced write. */
	projectId: string | null;
	/**
	 * Values a normalizer resolved that a receipt builder must prove the
	 * downstream commit against (the canonical edge, a parent title, ...).
	 */
	expected: Record<string, unknown>;
};

export type AgenticChatMutationArgumentNormalizerV1 = (
	context: AgenticChatMutationExecutionContextV1
) => void;

export type AgenticChatMutationReceiptPostProcessorV1 = (
	entity: Record<string, unknown>,
	context: AgenticChatMutationExecutionContextV1
) => Record<string, unknown>;

export type AgenticChatMutationReceiptBuilderV1 = (
	data: Record<string, unknown> | undefined,
	context: AgenticChatMutationExecutionContextV1
) => JsonObject;

const MAX_PARENT_TITLE_LENGTH = 120;
const MAX_MENTIONED_USERS = 25;
const MAX_MESSAGE_SUFFIX_LENGTH = 280;
const ALLOWED_PING_ENTITY_TYPES = new Set(['task', 'goal', 'document']);
const KNOWN_TASK_MOVE_STATUSES = ['moved', 'already_moved', 'confirmation_required', 'blocked'];
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

// ---------------------------------------------------------------------------
// Argument normalizers
// ---------------------------------------------------------------------------

export const AGENTIC_CHAT_MUTATION_ARGUMENT_NORMALIZERS_V1: Readonly<
	Record<AgenticChatMutationArgumentNormalizerIdV1, AgenticChatMutationArgumentNormalizerV1>
> = Object.freeze({
	/** The worker never runs a model-authored document merge. */
	reject_merge_llm_update_strategy: ({ toolName, args }) => {
		if (args.update_strategy === 'merge_llm') {
			throw knownFailure(
				'mutation_arguments_not_admitted',
				`${toolName} does not support merge_llm in this execution mode`
			);
		}
	},

	/** An empty props patch is a no-op the canonical op rejects. */
	drop_empty_props: ({ args }) => {
		if (isRecord(args.props) && Object.keys(args.props).length === 0) delete args.props;
	},

	require_trimmed_description: ({ toolName, args }) => {
		const description = typeof args.description === 'string' ? args.description.trim() : '';
		if (!description) {
			throw knownFailure(
				'mutation_arguments_not_admitted',
				`${toolName} requires a non-empty signed description field`
			);
		}
		args.description = description;
	},

	/**
	 * The signed chat tool retains the legacy `parent_id` name, while the
	 * canonical shared gateway rejects aliases and accepts parent_document_id.
	 */
	rename_parent_id_to_parent_document_id: ({ args }) => {
		if (!Object.hasOwn(args, 'parent_id')) return;
		args.parent_document_id =
			typeof args.parent_id === 'string' && args.parent_id.trim().length === 0
				? null
				: args.parent_id;
		delete args.parent_id;
	},

	/**
	 * The legacy document route treats an unusable position as omitted. Keep
	 * that behavior even though the shared gateway validates more strictly.
	 */
	drop_unusable_document_position: ({ args }) => {
		if (!Object.hasOwn(args, 'position')) return;
		if (
			typeof args.position !== 'number' ||
			!Number.isInteger(args.position) ||
			args.position < 0
		) {
			delete args.position;
		}
	},

	/**
	 * `project_id` is a legacy direct-tool scope/assignee hint, not a field on
	 * the canonical gateway operation. Keep it as a worker scope fence only.
	 */
	drop_scope_only_project_id: ({ args }) => {
		delete args.project_id;
	},

	normalize_target_date_end_of_day: ({ args }) => {
		if (!Object.hasOwn(args, 'target_date')) return;
		args.target_date = normalizeLegacyDate(args.target_date, 'target_date', true);
	},

	normalize_due_at_start_of_day: ({ args }) => {
		if (!Object.hasOwn(args, 'due_at')) return;
		args.due_at = normalizeLegacyDate(args.due_at, 'due_at', false);
	},

	require_signed_impact: ({ toolName, args }) => {
		if (typeof args.impact !== 'string') {
			throw knownFailure(
				'mutation_arguments_not_admitted',
				`${toolName} requires the signed impact field`
			);
		}
	},

	/**
	 * The legacy project-row update: state aliases, date-only bounds, a props
	 * patch narrowed to client-writable keys, and a fail-closed empty-patch
	 * check that must run after sanitization.
	 */
	normalize_project_row_update: ({ args }) => {
		let changed = 0;
		for (const field of ['name', 'description'] as const) {
			if (args[field] !== undefined) changed += 1;
		}
		if (args.state_key !== undefined) {
			args.state_key = normalizeLegacyProjectState(args.state_key);
			changed += 1;
		}
		for (const field of ['start_at', 'end_at'] as const) {
			if (!Object.hasOwn(args, field)) continue;
			args[field] = normalizeLegacyProjectDate(args[field], field);
			changed += 1;
		}
		if (Object.hasOwn(args, 'props')) {
			const props = sanitizeProjectPropsPatchInput(args.props);
			if (props && Object.keys(props).length > 0) {
				args.props = props;
				changed += 1;
			} else {
				delete args.props;
			}
		}
		if (changed === 0) {
			throw knownFailure(
				'mutation_arguments_not_admitted',
				'No updates provided for ontology project'
			);
		}
	},

	/**
	 * Resolve one exact non-project edge: reviewed kinds only, no self-links,
	 * canonical relationship direction. The normalized edge is also what the
	 * receipt must prove, so it is stashed on the execution context.
	 */
	normalize_edge_link_arguments: (context) => {
		const args = context.args;
		const srcKind = reviewedEntityKind(args.src_kind, 'src_kind');
		const dstKind = reviewedEntityKind(args.dst_kind, 'dst_kind');
		const srcId = requiredUuid(args.src_id, 'src_id');
		const dstId = requiredUuid(args.dst_id, 'dst_id');
		if (srcId === dstId) {
			throw knownFailure(
				'mutation_arguments_not_admitted',
				'link_onto_entities cannot create a self-referencing edge'
			);
		}
		const rel = requiredShortText(args.rel, 'rel', 128);
		const props = normalizedEdgeProps(args.props);
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
			throw knownFailure(
				'mutation_arguments_not_admitted',
				'rel cannot link these entity kinds'
			);
		}
		const expectedEdge: ExpectedEdge = {
			src_kind: normalized.src_kind,
			src_id: normalized.src_id,
			dst_kind: normalized.dst_kind,
			dst_id: normalized.dst_id,
			rel: normalized.rel,
			props: normalized.props
		};
		context.expected.edge = expectedEdge;
		context.args = { ...expectedEdge };
	},

	reduce_to_edge_id: (context) => {
		context.args = { edge_id: requiredUuid(context.args.edge_id, 'edge_id') };
	},

	/**
	 * An exact parent UUID wins over a title; the title is only the id-free
	 * grouping path for parents that may not exist yet.
	 */
	normalize_document_tree_move_arguments: (context) => {
		const args = context.args;
		const newParentId = optionalParentId(args.new_parent_id);
		const newPosition = normalizedTreePosition(args.new_position);
		const parentTitle =
			newParentId === null ? normalizedParentTitle(args.new_parent_title) : null;
		context.args = {
			project_id: args.project_id,
			document_id: args.document_id,
			new_parent_id: newParentId,
			...(parentTitle !== null ? { new_parent_title: parentTitle } : {}),
			new_position: newPosition
		};
		if (parentTitle !== null) context.expected.parentTitle = parentTitle;
	},

	normalize_task_document_arguments: (context) => {
		const args = context.args;
		context.args = {
			task_id: args.task_id,
			document_id: args.document_id,
			role: normalizedRole(args.role)
		};
	},

	normalize_task_move_arguments: (context) => {
		const args = context.args;
		if (args.expected_source_project_id === args.destination_project_id) {
			throw knownFailure(
				'mutation_scope_invalid',
				'move_onto_task requires different source and destination projects'
			);
		}
		args.confirmation_token = normalizedConfirmationToken(args.confirmation_token);
	},

	normalize_entity_ping_arguments: (context) => {
		const args = context.args;
		if (args.mode !== 'ping') {
			throw knownFailure(
				'mutation_arguments_not_admitted',
				'tag_onto_entity requires explicit mode "ping" in the worker'
			);
		}
		const entityType = requiredPingEntityType(args.entity_type);
		const entityId = requiredUuid(args.entity_id, 'entity_id');
		const mentionedUserIds = requiredMentionedUserIds(args.mentioned_user_ids);
		const messageSuffix = optionalMessageSuffix(args.message);
		context.expected.entityType = entityType;
		context.expected.entityId = entityId;
		context.expected.mentionedUserIds = mentionedUserIds;
		context.expected.messageSuffix = messageSuffix;
	}
});

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
			{ created: value.created, message: 'Linked entities successfully.' },
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
	}
});

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

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

function normalizedEdgeProps(value: unknown): Record<string, unknown> {
	if (value === undefined) return {};
	if (!isRecord(value)) {
		throw knownFailure('mutation_arguments_not_admitted', 'props must be an object');
	}
	return value;
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

function normalizedTreePosition(value: unknown): number {
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

function normalizedConfirmationToken(value: unknown): string | null {
	if (value === undefined || value === null) return null;
	if (
		typeof value !== 'string' ||
		value !== value.trim() ||
		value.length === 0 ||
		value.length > 128
	) {
		throw knownFailure(
			'mutation_arguments_not_admitted',
			'confirmation_token must be a non-empty string of at most 128 characters'
		);
	}
	return value;
}

function requiredPingEntityType(value: unknown): 'task' | 'goal' | 'document' {
	if (typeof value !== 'string' || !ALLOWED_PING_ENTITY_TYPES.has(value)) {
		throw knownFailure(
			'mutation_arguments_not_admitted',
			'entity_type must be task, goal, or document'
		);
	}
	return value as 'task' | 'goal' | 'document';
}

function requiredMentionedUserIds(value: unknown): string[] {
	if (!Array.isArray(value) || value.length === 0 || value.length > MAX_MENTIONED_USERS) {
		throw knownFailure(
			'mutation_arguments_not_admitted',
			`mentioned_user_ids must contain 1-${MAX_MENTIONED_USERS} canonical user UUIDs`
		);
	}
	const normalized: string[] = [];
	const seen = new Set<string>();
	for (const userId of value) {
		if (!canonicalUuid(userId) || seen.has(userId)) {
			throw knownFailure(
				'mutation_arguments_not_admitted',
				'mentioned_user_ids must contain unique canonical user UUIDs'
			);
		}
		seen.add(userId);
		normalized.push(userId);
	}
	return normalized;
}

function optionalMessageSuffix(value: unknown): string | null {
	if (value === undefined || value === null) return null;
	if (typeof value !== 'string') {
		throw knownFailure('mutation_arguments_not_admitted', 'message must be a string');
	}
	const normalized = value.trim();
	if (normalized.length === 0) return null;
	if (normalized.length > MAX_MESSAGE_SUFFIX_LENGTH) {
		throw knownFailure(
			'mutation_arguments_not_admitted',
			`message must be at most ${MAX_MESSAGE_SUFFIX_LENGTH} characters`
		);
	}
	return normalized;
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

function sameJson(left: Record<string, unknown>, right: Record<string, unknown>): boolean {
	return (
		canonicalizeAgenticChatJson(left as JsonValue) ===
		canonicalizeAgenticChatJson(right as JsonValue)
	);
}

function invalidReceipt(toolName: string, detail: string) {
	return uncertainFailure(`${toolName}_receipt_invalid`, `${toolName} ${detail}`);
}
