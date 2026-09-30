// apps/web/src/lib/server/organize/organize-transaction.ts
// Server compilation reuses the browser's pure planner; SQL independently checks
// the full sequence, subtree identities and final trees under project locks.
import type { DocTreeNode } from '$lib/types/onto-api';
import {
	previewOrganizePlan,
	visibleDocumentTree,
	flattenDocumentTree,
	type OrganizeMove,
	type OrganizeProject
} from '$lib/components/organize/organize-plan';
import { findNodeById } from '$lib/services/ontology/doc-structure.service';

export interface Location {
	project_id: string;
	parent_id: string | null;
	position: number;
}
export interface ManifestStep {
	kind: 'document' | 'task';
	id: string;
	before: Location;
	after: Location;
	subtree: { id: string; children: ManifestStep['subtree'][] } | null;
}
export type SkippedMove = { id: string; kind: string; reason: string };

/** A move the planner rejected; its message was written for the user. */
export class OrganizePlanError extends Error {}

/** The shared browser planner rejects moves by throwing plain `Error`s with
 * user-facing messages. Any other error type (TypeError, RangeError, ...) is a
 * defect whose message must never reach a client. */
export function isPlannerRejection(error: unknown): error is Error {
	return (
		error instanceof OrganizePlanError ||
		(error instanceof Error && Object.getPrototypeOf(error) === Error.prototype)
	);
}

export function compileOrganizePlan(projects: OrganizeProject[], moves: OrganizeMove[]) {
	if (!moves.length) throw new OrganizePlanError('Choose at least one move.');
	let preview: ReturnType<typeof previewOrganizePlan>;
	try {
		preview = previewOrganizePlan(projects, moves);
	} catch (error) {
		throw isPlannerRejection(error) ? new OrganizePlanError(error.message) : error;
	}
	return {
		projects: projects.map(({ id, updated_at }) => ({ id, updated_at })),
		moves,
		trees: preview.projects.map((project) => ({
			project_id: project.id,
			root: visibleDocumentTree(project)
		}))
	};
}

type CanonicalNode = { id: string; children: CanonicalNode[] };
function canonical(nodes: DocTreeNode[]): CanonicalNode[] {
	return nodes.map((node) => ({ id: node.id, children: canonical(node.children ?? []) }));
}

/** Reverse against current state, preserving edits and never moving new children
 * that were added after the batch. Replaying in reverse handles repeated moves.
 * Positions are intentionally checked: a later manual reorder is user work.
 */
export function buildOrganizeInverse(projects: OrganizeProject[], manifest: ManifestStep[]) {
	let staged = projects;
	const moves: OrganizeMove[] = [];
	const skipped: SkippedMove[] = [];
	const stopped = new Set<string>();
	for (const step of [...manifest].reverse()) {
		const key = `${step.kind}:${step.id}`;
		const source = staged.find((project) => project.id === step.after.project_id);
		const destination = staged.find((project) => project.id === step.before.project_id);
		let reason: string | null = null;
		let position = step.before.position;
		if (stopped.has(key)) reason = 'A later move of this item could not be undone.';
		else if (!source?.can_write || !destination?.can_write)
			reason = 'Edit access is no longer available.';
		else if (step.kind === 'task') {
			if (!source.tasks.some((task) => task.id === step.id))
				reason = 'The task is no longer where this batch left it.';
		} else {
			const location = flattenDocumentTree(source).find(({ node }) => node.id === step.id);
			if (
				!location ||
				location.parent_id !== step.after.parent_id ||
				location.index !== step.after.position
			)
				reason = 'The document was moved or reordered after this batch.';
			else if (
				JSON.stringify(canonical([location.node])[0]) !==
				JSON.stringify(canonical([step.subtree as DocTreeNode])[0])
			)
				reason = 'The document subtree changed after this batch.';
			else {
				const root = visibleDocumentTree(destination);
				const parent = step.before.parent_id
					? findNodeById(root, step.before.parent_id)
					: null;
				if (step.before.parent_id && !parent)
					reason = 'The original folder is no longer available.';
				else {
					const siblings = parent ? (parent.node.children ?? []) : root;
					position = Math.min(position, siblings.length);
					// Planner indices refer to the destination before removing the source.
					if (
						source.id === destination.id &&
						step.after.parent_id === step.before.parent_id &&
						location.index < position
					)
						position += 1;
					position = Math.min(position, siblings.length);
				}
			}
		}
		const move: OrganizeMove = {
			kind: step.kind,
			id: step.id,
			project_id: step.after.project_id,
			destination_project_id: step.before.project_id,
			parent_id: step.before.parent_id,
			position
		};
		if (!reason) {
			try {
				staged = previewOrganizePlan(staged, [move]).projects;
				moves.push(move);
			} catch (error) {
				// Skip reasons reach the client; only planner rejections carry safe messages.
				if (isPlannerRejection(error)) reason = error.message;
				else {
					console.error('[Organize] Inverse planning failed', error);
					reason = 'The inverse move is no longer valid.';
				}
			}
		}
		if (reason) {
			stopped.add(key);
			skipped.push({ id: step.id, kind: step.kind, reason });
		}
	}
	return { moves, skipped };
}
