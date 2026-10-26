// packages/shared-agent-ops/src/chat-cards/project-parent-card.ts
//
// The nest card (tasker 122, WP4): `propose_project_parent` proposes putting a
// project inside another one (attach) or taking it out (detach). The click runs
// `onto_project_set_parent_atomic` under the user's own session, which decides
// access from auth.uid(); Undo restores the previous parent.
//
// Client-safe: no Node imports. Structured fields only.
import type {
	ProposalCardEnvelopeV1,
	ProposalCardKindSpecV1,
	ProposalCardResolutionV1,
	ProposalCardState,
	ProposalCardUndoV1
} from './proposal-card';
import {
	count,
	digestOf,
	isRecord,
	parseDuplicateCheckRef,
	parseProjectRef,
	PROPOSAL_CARD_TTL_MS,
	PROPOSAL_CARD_UNDO_TTL_MS,
	sortedStrings,
	text,
	uuid,
	type ProjectRefV1,
	type ProposalDuplicateCheckRefV1
} from './card-fields';

export const PROJECT_PARENT_TOOL_NAME = 'propose_project_parent' as const;
export const PROJECT_PARENT_CHOICES = ['apply', 'cancel'] as const;
export type ProjectParentChoice = (typeof PROJECT_PARENT_CHOICES)[number];
/** Child-only members are named up to this many; the count stays exact. */
export const PROJECT_PARENT_MEMBER_NAME_LIMIT = 5;

export const PROJECT_PARENT_EFFECT_CODES = [
	'nothing_moves',
	'no_access_change',
	'leaves_previous_parent',
	'creates_shared_folder'
] as const;
export type ProjectParentEffectCode = (typeof PROJECT_PARENT_EFFECT_CODES)[number];

export type ProjectParentProposalPayloadV1 = {
	version: 1;
	action: 'attach' | 'detach';
	project: ProjectRefV1;
	/** The parent when the card was proposed (null: top level). */
	from_parent: ProjectRefV1 | null;
	/** The parent the click sets (null: detach). */
	to_parent: ProjectRefV1 | null;
	/** People in the child who are not in the parent (names capped, count exact). */
	child_only_members: { names: string[]; count: number };
	effects: ProjectParentEffectCode[];
	/** Undo re-attaches (detach, or a move between parents), which needs admin on both. */
	undo_needs_admin_on_both: boolean;
	duplicate_check: ProposalDuplicateCheckRefV1 | null;
	note: string | null;
};

/** What `setProjectParent` returned (decide and undo alike). */
export type ProjectParentReceiptV1 = {
	project_id: string;
	parent_project_id: string | null;
	previous_parent_project_id: string | null;
	shared_folder_document_id: string | null;
};

const EFFECTS = new Set<string>(PROJECT_PARENT_EFFECT_CODES);

function nullableRef(value: unknown): ProjectRefV1 | null | undefined {
	if (value === null || value === undefined) return null;
	return parseProjectRef(value) ?? undefined;
}

export function parseProjectParentPayload(value: unknown): ProjectParentProposalPayloadV1 | null {
	if (!isRecord(value) || value.version !== 1) return null;
	const action = value.action;
	if (action !== 'attach' && action !== 'detach') return null;
	const project = parseProjectRef(value.project);
	const fromParent = nullableRef(value.from_parent);
	const toParent = nullableRef(value.to_parent);
	if (!project || fromParent === undefined || toParent === undefined) return null;
	if (action === 'attach' && (!toParent || toParent.id === project.id)) return null;
	if (action === 'detach' && (toParent || !fromParent)) return null;
	if (fromParent && toParent && fromParent.id === toParent.id) return null;
	const members = isRecord(value.child_only_members) ? value.child_only_members : null;
	const names = Array.isArray(members?.names) ? members.names : null;
	const memberCount = count(members?.count);
	if (
		!names ||
		memberCount === null ||
		names.length > PROJECT_PARENT_MEMBER_NAME_LIMIT ||
		names.some((name) => typeof name !== 'string') ||
		memberCount < names.length
	)
		return null;
	if (
		!Array.isArray(value.effects) ||
		value.effects.some((effect) => typeof effect !== 'string' || !EFFECTS.has(effect))
	)
		return null;
	return {
		version: 1,
		action,
		project,
		from_parent: fromParent,
		to_parent: toParent,
		child_only_members: { names: names as string[], count: memberCount },
		effects: [...new Set(value.effects as ProjectParentEffectCode[])],
		undo_needs_admin_on_both: value.undo_needs_admin_on_both === true,
		duplicate_check: parseDuplicateCheckRef(value.duplicate_check),
		note: text(value.note)
	};
}

function parseReceipt(value: unknown): ProjectParentReceiptV1 | null {
	if (!isRecord(value)) return null;
	const projectId = uuid(value.project_id);
	if (!projectId) return null;
	const optional = (field: unknown): string | null | undefined =>
		field === null || field === undefined ? null : (uuid(field) ?? undefined);
	const parent = optional(value.parent_project_id);
	const previous = optional(value.previous_parent_project_id);
	const folder = optional(value.shared_folder_document_id);
	if (parent === undefined || previous === undefined || folder === undefined) return null;
	return {
		project_id: projectId,
		parent_project_id: parent,
		previous_parent_project_id: previous,
		shared_folder_document_id: folder
	};
}

function argumentsMatch(args: unknown, payload: ProjectParentProposalPayloadV1): boolean {
	if (!isRecord(args)) return false;
	if (uuid(args.project_id) !== payload.project.id) return false;
	const parentArg = args.parent_project_id;
	if (parentArg === null || parentArg === undefined) return payload.to_parent === null;
	return uuid(parentArg) === (payload.to_parent?.id ?? null);
}

export function projectParentDigest(payload: ProjectParentProposalPayloadV1): string {
	return digestOf({
		kind: 'project_parent',
		action: payload.action,
		project: payload.project.id,
		from_parent: payload.from_parent?.id ?? null,
		to_parent: payload.to_parent?.id ?? null,
		child_only_members: payload.child_only_members.count,
		effects: sortedStrings(payload.effects)
	});
}

function projectHref(id: string): string {
	return `/projects/${id}`;
}

function describeResolution(
	resolution: ProposalCardResolutionV1<ProjectParentReceiptV1>,
	payload: ProjectParentProposalPayloadV1
) {
	const project = payload.project;
	switch (resolution.outcome) {
		case 'applied':
			return {
				text:
					payload.action === 'attach'
						? `${project.name} is now inside ${payload.to_parent!.name}`
						: `${project.name} is no longer inside ${payload.from_parent!.name}`,
				href: projectHref(project.id)
			};
		case 'cancelled':
			return { text: 'Cancelled. Nothing changed.', href: null };
		case 'stale':
			return {
				text: staleText(resolution.reason_code, payload),
				href: projectHref(project.id)
			};
		case 'unknown':
			return {
				text: 'BuildOS couldn’t confirm whether this saved. Open the project to check.',
				href: projectHref(project.id)
			};
	}
}

/** Stale reasons are RPC identifiers (project hierarchy migrations) or `parent_changed`. */
function staleText(reason: string | null, payload: ProjectParentProposalPayloadV1): string {
	switch (reason) {
		case 'project_parent_is_a_child':
			return `${payload.to_parent?.name ?? 'That project'} is already inside another project, so nothing changed.`;
		case 'project_has_children':
			return `${payload.project.name} now has its own sub-projects, so it can’t go inside another project. Nothing changed.`;
		case 'project_parent_not_found':
		case 'project_not_found':
			return 'One of these projects no longer exists or is archived. Nothing changed.';
		default:
			return 'Where this project sits changed since this card. Nothing changed. Ask again.';
	}
}

function describeUndo(
	undo: ProposalCardUndoV1<ProjectParentReceiptV1>,
	payload: ProjectParentProposalPayloadV1
) {
	const project = payload.project;
	switch (undo.outcome) {
		case 'undone':
			return {
				text: payload.from_parent
					? `Undone. ${project.name} is back inside ${payload.from_parent.name}.`
					: `Undone. ${project.name} is back at the top level.`,
				href: projectHref(project.id)
			};
		case 'stale':
			return {
				text: 'Couldn’t undo: this project moved again since. Nothing changed.',
				href: projectHref(project.id)
			};
		case 'unknown':
			return {
				text: 'BuildOS couldn’t confirm whether the undo saved. Open the project to check.',
				href: projectHref(project.id)
			};
	}
}

function noteMeaning(
	state: ProposalCardState,
	payload: ProjectParentProposalPayloadV1,
	_card: ProposalCardEnvelopeV1<ProjectParentProposalPayloadV1>
): string {
	switch (state) {
		case 'pending':
			return 'The user has not chosen yet and nothing changed. If they want this, point them to the card; do not propose it again.';
		case 'applied':
			return payload.action === 'attach'
				? 'The user confirmed. The project now sits inside to_parent. Nothing inside either project moved and nobody gained or lost access.'
				: 'The user confirmed. The project is no longer inside from_parent and is now top level. Nothing inside it moved.';
		case 'cancelled':
			return 'The user cancelled. Nothing changed.';
		case 'stale':
			return 'Something changed before the user chose, so nothing was saved. Check where the project sits now before proposing again.';
		case 'unknown':
			return 'BuildOS could not confirm whether this saved. Ask the user to check the project before trying again.';
		case 'undone':
			return 'The user undid this. The project is back where it was before the card (from_parent).';
	}
}

export const PROJECT_PARENT_CARD_SPEC: ProposalCardKindSpecV1<
	ProjectParentProposalPayloadV1,
	ProjectParentReceiptV1,
	ProjectParentReceiptV1
> = {
	kind: 'project_parent',
	toolName: PROJECT_PARENT_TOOL_NAME,
	ttlMs: PROPOSAL_CARD_TTL_MS,
	undoTtlMs: PROPOSAL_CARD_UNDO_TTL_MS,
	choices: PROJECT_PARENT_CHOICES,
	hasPreview: false,
	hasUndoPreview: false,
	parsePayload: parseProjectParentPayload,
	parseReceipt,
	parseUndoReceipt: parseReceipt,
	argumentsMatch,
	digest: projectParentDigest,
	modelView: (payload) => ({
		action: payload.action,
		project: payload.project,
		from_parent: payload.from_parent,
		to_parent: payload.to_parent,
		effects: payload.effects,
		child_only_members: payload.child_only_members,
		undo_needs_admin_on_both: payload.undo_needs_admin_on_both,
		duplicate_check_run_id: payload.duplicate_check?.run_id ?? null
	}),
	subjects: (payload) => [
		{ role: 'project', ...payload.project },
		...(payload.from_parent ? [{ role: 'from_parent', ...payload.from_parent }] : []),
		...(payload.to_parent ? [{ role: 'to_parent', ...payload.to_parent }] : [])
	],
	describeResolution,
	describeUndo,
	noteMeaning
};
