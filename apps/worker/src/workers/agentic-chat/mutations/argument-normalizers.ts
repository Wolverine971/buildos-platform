// apps/worker/src/workers/agentic-chat/mutations/argument-normalizers.ts
//
// The named pure functions the reviewed mutation table points at.
//
// Argument normalizers. The shared execution context and receipt helpers live
// in `execution-context.ts`; receipt post-processors and whole-receipt builders
// live in `receipt-builders.ts`. Both are re-exported below so every existing
// import of this module keeps working. The table in `tool-catalog.ts` composes
// them; `table-adapter.ts` executes them. Nothing here touches the database or
// the network.

import { normalizeAgenticChatProjectStateV1 } from '@buildos/agentic-chat-runtime/loop';
import { normalizeEdgeDirection } from '@buildos/shared-agent-ops/ontology/edge-direction';
import { resolveEdgeRelationship } from '@buildos/shared-agent-ops/ontology/edge-relationship-resolver';
import { sanitizeProjectPropsPatchInput } from '@buildos/shared-agent-ops/utils/project-props-sanitizer';
import { canonicalUuid, isRecord, knownFailure, requiredUuid } from './adapter-boundary';
import {
	type AgenticChatMutationExecutionContextV1,
	type ExpectedEdge,
	REVIEWED_LINK_ENTITY_KINDS,
	type ReviewedLinkEntityKind
} from './execution-context';
import type { AgenticChatMutationArgumentNormalizerIdV1 } from './tool-catalog';

export type AgenticChatMutationArgumentNormalizerV1 = (
	context: AgenticChatMutationExecutionContextV1
) => void;

const MAX_PARENT_TITLE_LENGTH = 120;
const MAX_MENTIONED_USERS = 25;
const MAX_MESSAGE_SUFFIX_LENGTH = 280;
const ALLOWED_PING_ENTITY_TYPES = new Set(['task', 'goal', 'document']);

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
	 * `project_id` is not a field on the canonical gateway operation. By the
	 * time this runs, `resolveProjectFence` has already read it as the worker
	 * scope fence; the gateway resolves assignee handles against the task's own
	 * project, so nothing downstream needs it.
	 */
	drop_scope_only_project_id: ({ args }) => {
		delete args.project_id;
	},

	/**
	 * A task write from chat never creates a calendar event as a side effect.
	 * The REST default is 'auto', which is right for the UI (the user is
	 * looking at the scheduler) and wrong for an agent: case 4 of the
	 * 2026-09-10 browser rerun set a due date under an explicit "no calendar
	 * event" instruction and the tool created one anyway, because nothing in
	 * the harness forces the switch the model forgot to send. Silence now
	 * means no event; the model must ask for 'auto' to schedule one.
	 */
	default_calendar_sync_none: ({ args }) => {
		if (args.calendar_sync === 'auto') return;
		args.calendar_sync = 'none';
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
		for (const field of ['name', 'description', 'type_key'] as const) {
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
	},

	/**
	 * Name/file a project image. Only the four reviewed fields reach the
	 * gateway; `document_id` stays tri-state (omitted keeps the placement, null
	 * unfiles to the Images shelf, a UUID files it) and is remembered so the
	 * receipt must prove the placement that was asked for.
	 */
	normalize_asset_update_arguments: (context) => {
		const args = context.args;
		const next: Record<string, unknown> = { asset_id: args.asset_id };
		for (const field of ['caption', 'alt_text'] as const) {
			const value = args[field];
			if (value === undefined || value === null) continue;
			if (typeof value !== 'string' || !value.trim()) {
				throw knownFailure(
					'mutation_arguments_not_admitted',
					`${context.toolName} ${field} must be non-empty text; omit it to keep the current value`
				);
			}
			next[field] = value;
		}
		if (Object.hasOwn(args, 'document_id') && args.document_id !== undefined) {
			next.document_id =
				args.document_id === null ? null : requiredUuid(args.document_id, 'document_id');
			context.expected.placementDocumentId = next.document_id;
		}
		if (next.caption === undefined && next.alt_text === undefined && !('document_id' in next)) {
			throw knownFailure(
				'mutation_arguments_not_admitted',
				`${context.toolName} needs caption, alt_text, or document_id to change`
			);
		}
		context.args = next;
	},

	/**
	 * BuildOS never invites anyone or sets a reminder on a user's behalf. Neither
	 * field is a canonical calendar argument, so the admitted-argument fence
	 * already refuses them; this is the second lock, and it records what it took
	 * off so the receipt can say so rather than silently dropping intent.
	 */
	strip_calendar_attendees_and_reminders: (context) => {
		const stripped: string[] = [];
		for (const field of ['attendees', 'reminders']) {
			if (!Object.hasOwn(context.args, field)) continue;
			delete context.args[field];
			stripped.push(field);
		}
		if (stripped.length > 0) context.expected.strippedFields = stripped;
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
	// The runtime's alias table (packages/agentic-chat-runtime/src/loop/project-semantics.ts)
	// is byte-identical to the one this used to inline, so it is the single
	// source of truth for the rename. It also validates the result against the
	// canonical state set, which this worker path never did: an unrecognized
	// or empty-after-normalization string must still pass through unchanged
	// (as `normalized`, not the raw `value`) exactly like the old inline
	// `aliases[normalized] ?? normalized` did for every input.
	return normalizeAgenticChatProjectStateV1(value) ?? normalized;
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

export * from './execution-context';
export * from './receipt-builders';
