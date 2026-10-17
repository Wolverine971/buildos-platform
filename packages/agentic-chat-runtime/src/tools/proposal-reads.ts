// packages/agentic-chat-runtime/src/tools/proposal-reads.ts
//
// The proposal tools (tasker 122, WP4/WP5; docs/specs/PROPOSAL_CARD_RAIL_PLAN_2026-10-17.md
// §2-§3). Chat *proposes* nesting one project under another, or combining a
// whole project into another; the user's click on the card is the only
// consent, and the web runs the change under the user's own authority.
//
// Nothing here writes product data. Each tool checks access and the
// structural rules, then returns either a card envelope (the shared-agent-ops
// chat-cards contract) or a non-card result (`blocked` / `no_change`). The one
// side effect is the quick duplicate check the host starts through
// `context.proposal.startDuplicateCheck`; a failed or slow start only drops
// the strip from the card.
//
// The card id is the chat_tool_executions row id this call is persisted
// under, handed in as `context.proposal.toolExecutionId`. A host without the
// card rail cannot mint a card: both tools throw without that context.
//
// Every decision reads structured fields only: RPC results, ids, counts and
// codes. The fold preview runs with the host's service client and the turn's
// user id (the RPC is service-only and re-checks admin on both projects).
import { parseProjectFamilyV1, type ProjectFamilyV1 } from '@buildos/shared-types';
import {
	buildProposalCardEnvelopeV1,
	buildProposalCardNonCardResultV1,
	classifyFoldBlocker,
	parseFoldImpactV1,
	projectCombinePayloadFromImpact,
	PROJECT_COMBINE_TOOL_NAME,
	PROJECT_PARENT_TOOL_NAME,
	type FoldImpactV1,
	type ProjectCombineProposalPayloadV1,
	type ProjectParentEffectCode,
	type ProjectParentProposalPayloadV1,
	type ProposalCardEnvelopeV1,
	type ProposalCardKind,
	type ProposalCardNonCardResultV1,
	type ProposalDuplicateCheckRefV1
} from '@buildos/shared-agent-ops/chat-cards/proposal-card';
import { PROJECT_PARENT_MEMBER_NAME_LIMIT } from '@buildos/shared-agent-ops/chat-cards/project-parent-card';
import { AgenticChatToolAccessDeniedError, type AgenticChatToolAccessLevelV1 } from './access-port';
import type { AgenticChatSharedReadContextV1 } from './ontology-reads';

/** The proposal tools, for hosts that must treat them apart from ordinary reads (memo, gates). */
export const AGENTIC_CHAT_PROPOSAL_TOOL_NAMES_V1 = Object.freeze([
	PROJECT_PARENT_TOOL_NAME,
	PROJECT_COMBINE_TOOL_NAME
] as const);

export function isAgenticChatProposalToolNameV1(value: unknown): boolean {
	return (
		typeof value === 'string' &&
		(AGENTIC_CHAT_PROPOSAL_TOOL_NAMES_V1 as readonly string[]).includes(value)
	);
}

/**
 * What a card-rendering host hands the proposal tools. `toolExecutionId` is the
 * stable id of the chat_tool_executions row this call will be persisted under,
 * which the web resolver loads by `id = card_id` and session.
 */
export type AgenticChatProposalCardContextV1 = {
	toolExecutionId: string;
	sessionId: string;
	turnRunId: string;
	/**
	 * Starts (or reuses) a quick duplicate check over these projects, the first
	 * being the root. Resolves null when it could not start in time; never throws
	 * on purpose, and a throw is treated as null.
	 */
	startDuplicateCheck(projectIds: readonly string[]): Promise<ProposalDuplicateCheckRefV1 | null>;
	/** Clock for proposed_at / checked_at; defaults to now. */
	now?: () => Date;
};

export interface SharedProposeProjectParentArgs {
	project_id: string;
	parent_project_id: string | null;
	note?: string;
}

export interface SharedProposeProjectCombineArgs {
	source_project_id: string;
	destination_project_id: string;
	note?: string;
}

export type ProposalToolResultV1<P> = ProposalCardEnvelopeV1<P> | ProposalCardNonCardResultV1;

// The card contract's own UUID shape (card-fields.ts). Arguments must match it
// exactly, or the resolver's argument check could not match the payload.
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NOTE_LIMIT = 200;

type ProjectRow = {
	id: string;
	name: string;
	parent_project_id: string | null;
	archived_at: string | null;
	deleted_at: string | null;
	merged_into_project_id: string | null;
	shared_folder_document_id: string | null;
	created_by: string | null;
};

type ProjectRefV1 = { id: string; name: string };

// ---------------------------------------------------------------------------
// Shared helpers.

function requireProposalContext(
	context: AgenticChatSharedReadContextV1,
	toolName: string
): AgenticChatProposalCardContextV1 {
	const proposal = context.proposal;
	if (!proposal || !UUID_PATTERN.test(proposal.toolExecutionId)) {
		throw new Error(`${toolName} is only available where chat can show its card.`);
	}
	return proposal;
}

function requiredUuid(value: unknown, field: string): string {
	if (typeof value !== 'string' || !UUID_PATTERN.test(value)) {
		throw new Error(`${field} must be a project UUID.`);
	}
	return value.toLowerCase();
}

function cleanNote(value: unknown): string | null {
	if (typeof value !== 'string') return null;
	const note = value.trim().slice(0, NOTE_LIMIT);
	return note.length > 0 ? note : null;
}

function nowOf(proposal: AgenticChatProposalCardContextV1): Date {
	return proposal.now?.() ?? new Date();
}

function withSignal<Q>(query: Q, signal: AbortSignal | undefined): Q {
	const candidate = query as { abortSignal?: (signal: AbortSignal) => Q };
	return signal && typeof candidate.abortSignal === 'function'
		? candidate.abortSignal(signal)
		: query;
}

/** Access as a boolean: a denial is an answer, any other failure is a tool failure. */
async function hasAccess(
	context: AgenticChatSharedReadContextV1,
	projectId: string,
	level: AgenticChatToolAccessLevelV1
): Promise<boolean> {
	try {
		await context.access.assertProjectAccess(projectId, level);
		return true;
	} catch (error) {
		if (error instanceof AgenticChatToolAccessDeniedError) return false;
		throw error;
	}
}

/** Raw rows over the host client. Only call after access to each id is checked. */
async function loadProjectRows(
	context: AgenticChatSharedReadContextV1,
	ids: readonly string[]
): Promise<Map<string, ProjectRow>> {
	const query = withSignal(
		context.client
			.from('onto_projects')
			.select(
				'id, name, parent_project_id, archived_at, deleted_at, merged_into_project_id, shared_folder_document_id, created_by'
			)
			.in('id', [...ids]),
		context.signal
	);
	const { data, error } = await query;
	if (error) throw new Error(`Could not load the projects: ${error.message}`);
	const rows = new Map<string, ProjectRow>();
	for (const row of (data ?? []) as ProjectRow[]) rows.set(row.id.toLowerCase(), row);
	return rows;
}

/** `onto_project_family_v1` with the explicit actor (service role) or the caller's own session. */
async function loadFamily(
	context: AgenticChatSharedReadContextV1,
	projectId: string,
	actorId: string
): Promise<ProjectFamilyV1> {
	const { data, error } = await withSignal(
		context.client.rpc('onto_project_family_v1', {
			p_project_id: projectId,
			p_actor_id: actorId
		}),
		context.signal
	);
	if (error) {
		if (error.code === '42501') throw new AgenticChatToolAccessDeniedError();
		throw new Error(`Could not load the project family: ${error.message}`);
	}
	const family = parseProjectFamilyV1(data);
	if (!family) throw new Error('Could not read the project family.');
	return family;
}

/**
 * People who can open the child but not the parent (members plus the creator,
 * the way the fold preview counts them), the acting user aside. Names capped,
 * count exact. Informational only, so a failed lookup shows nobody.
 */
async function childOnlyMembers(
	context: AgenticChatSharedReadContextV1,
	child: ProjectRow,
	parent: ProjectRow,
	actorId: string
): Promise<{ names: string[]; count: number }> {
	const none = { names: [], count: 0 };
	try {
		const { data, error } = await withSignal(
			context.client
				.from('onto_project_members')
				.select('project_id, actor_id')
				.in('project_id', [child.id, parent.id])
				.is('removed_at', null),
			context.signal
		);
		if (error) return none;
		const rows = (data ?? []) as Array<{ project_id: string; actor_id: string }>;
		const membersOf = (project: ProjectRow) =>
			new Set([
				...rows.filter((row) => row.project_id === project.id).map((row) => row.actor_id),
				...(project.created_by ? [project.created_by] : [])
			]);
		const parentMembers = membersOf(parent);
		const only = [...membersOf(child)].filter(
			(member) => member !== actorId && !parentMembers.has(member)
		);
		if (only.length === 0) return none;
		const { data: actors, error: actorError } = await withSignal(
			context.client.from('onto_actors').select('id, name').in('id', only),
			context.signal
		);
		const names = actorError
			? []
			: ((actors ?? []) as Array<{ id: string; name: string | null }>)
					.map((actor) => actor.name?.trim() || 'Someone')
					.sort((a, b) => a.localeCompare(b))
					.slice(0, PROJECT_PARENT_MEMBER_NAME_LIMIT);
		return { names, count: only.length };
	} catch {
		return none;
	}
}

async function startDuplicateCheck(
	proposal: AgenticChatProposalCardContextV1,
	projectIds: readonly string[]
): Promise<ProposalDuplicateCheckRefV1 | null> {
	try {
		return (await proposal.startDuplicateCheck(projectIds)) ?? null;
	} catch {
		return null;
	}
}

function nonCard(
	kind: ProposalCardKind,
	status: 'blocked' | 'no_change',
	reasonCode: string,
	message: string
): ProposalCardNonCardResultV1 {
	return buildProposalCardNonCardResultV1({ kind, status, reasonCode, message });
}

const ref = (row: { id: string; name: string }): ProjectRefV1 => ({
	id: row.id.toLowerCase(),
	name: row.name
});

const plural = (count: number, one: string, many: string) => (count === 1 ? one : many);

// ---------------------------------------------------------------------------
// propose_project_parent (plan §2).

/**
 * `propose_project_parent`: attach (`parent_project_id` set) or detach (null).
 * Attach needs admin on both projects and is blocked for self, a missing or
 * archived target, a target that is itself a child, and a project that has
 * sub-projects (`family.child_count`, which counts archived ones). Detach uses
 * the parent's `can_detach` (admin on either side). Already in place is
 * `no_change`.
 */
export async function proposeProjectParent(
	context: AgenticChatSharedReadContextV1,
	args: SharedProposeProjectParentArgs
): Promise<ProposalToolResultV1<ProjectParentProposalPayloadV1>> {
	const proposal = requireProposalContext(context, PROJECT_PARENT_TOOL_NAME);
	const projectId = requiredUuid(args?.project_id, 'project_id');
	const rawParent = args?.parent_project_id;
	const parentId =
		rawParent === null || rawParent === undefined
			? null
			: requiredUuid(rawParent, 'parent_project_id (or null to take it out of its parent)');
	const note = cleanNote(args?.note);
	const kind = 'project_parent' as const;

	if (parentId === projectId) {
		return nonCard(kind, 'blocked', 'parent_self', 'A project can’t go inside itself.');
	}
	await context.access.assertProjectAccess(projectId, 'read');
	const actorId = await context.access.getActorId();
	const [rows, family] = await Promise.all([
		loadProjectRows(context, parentId ? [projectId, parentId] : [projectId]),
		loadFamily(context, projectId, actorId)
	]);
	const project = rows.get(projectId);
	if (!project || project.deleted_at) throw new AgenticChatToolAccessDeniedError();
	const visibleParent = family.parent?.id
		? { id: family.parent.id.toLowerCase(), name: family.parent.name }
		: null;
	// The family RPC hides a parent the user can't open (or that is archived).
	// The click re-checks against what the user can see, so a card here would
	// always come back stale: say so now instead.
	if (project.parent_project_id && !visibleParent) {
		return nonCard(
			kind,
			'blocked',
			'current_parent_hidden',
			`${project.name} sits inside a project you can’t open or that is archived, so chat can’t move it. Nothing changed.`
		);
	}

	if (!parentId) {
		if (!visibleParent) {
			return nonCard(
				kind,
				'no_change',
				'already_top_level',
				`${project.name} isn’t inside another project, so there is nothing to take it out of.`
			);
		}
		if (family.parent?.can_detach !== true) {
			return nonCard(
				kind,
				'blocked',
				'admin_required',
				`Taking ${project.name} out of ${visibleParent.name} needs admin access to one of them. Nothing changed.`
			);
		}
		const payload: ProjectParentProposalPayloadV1 = {
			version: 1,
			action: 'detach',
			project: ref(project),
			from_parent: visibleParent,
			to_parent: null,
			child_only_members: { names: [], count: 0 },
			effects: ['nothing_moves', 'no_access_change', 'leaves_previous_parent'],
			// Undo puts it back inside the parent, which needs admin on both.
			undo_needs_admin_on_both: true,
			duplicate_check: null,
			note
		};
		return buildProposalCardEnvelopeV1({
			kind,
			cardId: proposal.toolExecutionId,
			sessionId: proposal.sessionId,
			proposedAt: nowOf(proposal),
			payload,
			message: `Needs your choice: take ${project.name} out of ${visibleParent.name}. Nothing has changed yet; the user's click on the card does it. Nothing inside either project moves and nobody's access changes.`
		});
	}

	const target = rows.get(parentId);
	const targetReadable = await hasAccess(context, parentId, 'read');
	if (!target || target.deleted_at || target.archived_at || !targetReadable) {
		return nonCard(
			kind,
			'blocked',
			'parent_not_found',
			'That parent project doesn’t exist, is archived, or you can’t open it. Nothing changed.'
		);
	}
	if (project.parent_project_id?.toLowerCase() === parentId) {
		return nonCard(
			kind,
			'no_change',
			'already_nested',
			`${project.name} is already inside ${target.name}.`
		);
	}
	const [adminHere, adminThere] = await Promise.all([
		hasAccess(context, projectId, 'admin'),
		hasAccess(context, parentId, 'admin')
	]);
	if (!adminHere || !adminThere) {
		const missing = [!adminHere ? project.name : null, !adminThere ? target.name : null]
			.filter(Boolean)
			.join(' and ');
		return nonCard(
			kind,
			'blocked',
			'admin_required',
			`Putting a project inside another needs admin access to both; you aren’t an admin of ${missing}. Nothing changed.`
		);
	}
	if (target.parent_project_id) {
		return nonCard(
			kind,
			'blocked',
			'parent_is_a_child',
			`${target.name} is already inside another project, and nesting goes one level deep. Nothing changed.`
		);
	}
	if (family.child_count > 0) {
		return nonCard(
			kind,
			'blocked',
			'has_children',
			`${project.name} has ${family.child_count} ${plural(family.child_count, 'sub-project', 'sub-projects')} (archived ones count), so it can’t go inside another project: nesting goes one level deep. Nothing changed.`
		);
	}

	const [members, duplicateCheck] = await Promise.all([
		childOnlyMembers(context, project, target, actorId),
		startDuplicateCheck(proposal, [projectId, parentId])
	]);
	const effects: ProjectParentEffectCode[] = ['nothing_moves', 'no_access_change'];
	if (visibleParent) effects.push('leaves_previous_parent');
	if (!target.shared_folder_document_id) effects.push('creates_shared_folder');
	const payload: ProjectParentProposalPayloadV1 = {
		version: 1,
		action: 'attach',
		project: ref(project),
		from_parent: visibleParent,
		to_parent: ref(target),
		child_only_members: members,
		effects,
		// Undo of a move between parents re-attaches, which needs admin on both;
		// undo of a first nest only detaches.
		undo_needs_admin_on_both: visibleParent !== null,
		duplicate_check: duplicateCheck,
		note
	};
	const leaving = visibleParent ? ` It leaves ${visibleParent.name}.` : '';
	const check = duplicateCheck ? ' A quick duplicate check of the two projects is running.' : '';
	return buildProposalCardEnvelopeV1({
		kind,
		cardId: proposal.toolExecutionId,
		sessionId: proposal.sessionId,
		proposedAt: nowOf(proposal),
		payload,
		message: `Needs your choice: put ${project.name} inside ${target.name}. Nothing has changed yet; the user's click on the card does it. Nothing inside either project moves and nobody's access changes.${leaving}${check}`
	});
}

// ---------------------------------------------------------------------------
// propose_project_combine (plan §3).

/** Fold RPC errors that are an answer for the user, not a tool failure. */
const FOLD_REFUSALS: Readonly<Record<string, { code: string; message: string }>> = {
	project_fold_access_denied: {
		code: 'admin_required',
		message: 'Combining needs admin access to both projects.'
	},
	project_fold_same_project: {
		code: 'same_project',
		message: 'A project can’t be combined into itself.'
	},
	project_fold_project_missing: {
		code: 'project_missing',
		message: 'One of these projects no longer exists.'
	},
	project_fold_destination_archived: {
		code: 'destination_archived',
		message: 'The destination is archived or was combined into another project.'
	},
	project_fold_source_already_merged: {
		code: 'source_already_merged',
		message: 'That project was already combined into another project.'
	}
};

/** Plain words for the blockers chat can't clear (structured codes in, fixed text out). */
function describeHardBlocker(code: string, impact: FoldImpactV1): string {
	switch (code) {
		case 'table_policy_incomplete':
			return 'combining isn’t fully switched on yet';
		case 'source_has_sub_projects':
			return `${impact.source.name} has sub-projects (take them out first)`;
		case 'recurring_task_not_supported':
			return 'recurring tasks can’t move yet';
		case 'recurring_event_not_supported':
			return 'recurring events can’t move yet';
		case 'event_links_not_supported':
			return 'some calendar events are linked to other records';
		case 'calendar_sync_not_deployed':
			return 'dated tasks can’t move until calendar sync is switched on';
		case 'asset_access_not_deployed':
			return 'files can’t move yet';
		case 'too_many_entities':
		case 'too_many_documents':
		case 'too_many_relationships':
		case 'too_many_embeddings':
		case 'too_many_documents_in_one_folder':
			return 'the project is too large to combine in one step';
		default:
			return `blocked (${code})`;
	}
}

function describeFixableBlocker(code: string, payload: ProjectCombineProposalPayloadV1): string {
	switch (code) {
		case 'standalone_events_not_supported': {
			const count = payload.upcoming_events_total;
			return `${count} upcoming ${plural(count, 'event', 'events')} in ${payload.source.name} must be moved or deleted`;
		}
		case 'pending_document_proposal':
			return `a pending document change in ${payload.source.name} must be accepted or dismissed`;
		default:
			return `blocked (${code})`;
	}
}

/** `project_fold_x: …` → `project_fold_x`: the SQL exception identifier leads the message. */
function foldErrorIdentifier(message: string): string {
	return /^\s*([a-z_]+)/.exec(message)?.[1] ?? '';
}

/**
 * `propose_project_combine`: admin on both, different projects, the source
 * not already combined and without sub-projects, then the fold preview. Hard
 * blockers (limits, policy drift, recurring items, calendar or asset rollout,
 * event links) return `blocked` with no card; blockers the user can clear
 * (upcoming events, a pending proposal) ride the card, which keeps its main
 * button disabled until "Check again" comes back clean. Lists are capped at 20
 * by the contract's payload builder.
 */
export async function proposeProjectCombine(
	context: AgenticChatSharedReadContextV1,
	args: SharedProposeProjectCombineArgs
): Promise<ProposalToolResultV1<ProjectCombineProposalPayloadV1>> {
	const proposal = requireProposalContext(context, PROJECT_COMBINE_TOOL_NAME);
	const sourceId = requiredUuid(args?.source_project_id, 'source_project_id');
	const destinationId = requiredUuid(args?.destination_project_id, 'destination_project_id');
	const note = cleanNote(args?.note);
	const kind = 'project_combine' as const;

	if (sourceId === destinationId) {
		return nonCard(kind, 'blocked', 'same_project', 'A project can’t be combined into itself.');
	}
	await Promise.all([
		context.access.assertProjectAccess(sourceId, 'read'),
		context.access.assertProjectAccess(destinationId, 'read')
	]);
	const actorId = await context.access.getActorId();
	const rows = await loadProjectRows(context, [sourceId, destinationId]);
	const source = rows.get(sourceId);
	const destination = rows.get(destinationId);
	if (!source || source.deleted_at || !destination || destination.deleted_at) {
		return nonCard(
			kind,
			'blocked',
			'project_missing',
			'One of these projects no longer exists. Nothing changed.'
		);
	}
	if (source.merged_into_project_id) {
		return nonCard(
			kind,
			'blocked',
			'source_already_merged',
			`${source.name} was already combined into another project. Nothing changed.`
		);
	}
	if (destination.archived_at || destination.merged_into_project_id) {
		return nonCard(
			kind,
			'blocked',
			'destination_archived',
			`${destination.name} is archived or was combined into another project, so nothing can be combined into it. Nothing changed.`
		);
	}
	const [adminSource, adminDestination] = await Promise.all([
		hasAccess(context, sourceId, 'admin'),
		hasAccess(context, destinationId, 'admin')
	]);
	if (!adminSource || !adminDestination) {
		const missing = [
			!adminSource ? source.name : null,
			!adminDestination ? destination.name : null
		]
			.filter(Boolean)
			.join(' and ');
		return nonCard(
			kind,
			'blocked',
			'admin_required',
			`Combining needs admin access to both projects; you aren’t an admin of ${missing}. Nothing changed.`
		);
	}
	const family = await loadFamily(context, sourceId, actorId);
	if (family.child_count > 0) {
		return nonCard(
			kind,
			'blocked',
			'source_has_sub_projects',
			`${source.name} has ${family.child_count} ${plural(family.child_count, 'sub-project', 'sub-projects')} (archived ones count). Take them out before combining it. Nothing changed.`
		);
	}

	const { data, error } = await withSignal(
		context.client.rpc('onto_project_fold_preview', {
			p_user_id: context.userId,
			p_source_project_id: sourceId,
			p_destination_project_id: destinationId,
			p_member_additions: []
		}),
		context.signal
	);
	if (error) {
		const refusal = FOLD_REFUSALS[foldErrorIdentifier(error.message ?? '')];
		if (refusal) {
			return nonCard(kind, 'blocked', refusal.code, `${refusal.message} Nothing changed.`);
		}
		if (error.code === 'PGRST202' || error.code === '42883') {
			return nonCard(
				kind,
				'blocked',
				'not_available',
				'Combining projects isn’t switched on yet. Nothing changed.'
			);
		}
		throw new Error(`Could not preview the combine: ${error.message}`);
	}
	const impact = parseFoldImpactV1(data);
	if (!impact) throw new Error('Could not read the combine preview.');

	const hard = impact.blockers.filter((blocker) => classifyFoldBlocker(blocker) === 'hard');
	if (hard.length > 0) {
		const reasons = [...new Set(hard.map((code) => describeHardBlocker(code, impact)))];
		return nonCard(
			kind,
			'blocked',
			hard[0]!,
			`Can’t combine ${source.name} into ${destination.name} from chat: ${reasons.join('; ')}. Nothing changed.`
		);
	}

	const duplicateCheck = await startDuplicateCheck(proposal, [destinationId, sourceId]);
	const checkedAt = nowOf(proposal);
	const payload = projectCombinePayloadFromImpact(impact, {
		checkedAt: checkedAt.toISOString(),
		duplicateCheck,
		note
	});
	const parts = [
		`Needs your choice: combine ${source.name} into ${destination.name}. Nothing has changed yet; the user's click on the card runs it.`
	];
	if (payload.members_missing_total > 0) {
		const count = payload.members_missing_total;
		parts.push(
			`${count} ${plural(count, 'person', 'people')} can open ${source.name} but not ${destination.name}; the user chooses on the card whether to remove them or add them.`
		);
	}
	if (payload.blockers.length > 0) {
		const reasons = [
			...new Set(
				payload.blockers.map((blocker) => describeFixableBlocker(blocker.code, payload))
			)
		];
		parts.push(
			`The card stays blocked until: ${reasons.join('; ')}. Offer to help with that; then the user presses Check again.`
		);
	}
	if (duplicateCheck) parts.push('A quick duplicate check of the two projects is running.');
	return buildProposalCardEnvelopeV1({
		kind,
		cardId: proposal.toolExecutionId,
		sessionId: proposal.sessionId,
		proposedAt: checkedAt,
		payload,
		message: parts.join(' ')
	});
}
