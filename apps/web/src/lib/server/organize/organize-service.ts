// apps/web/src/lib/server/organize/organize-service.ts
import type { Database } from '@buildos/shared-types';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { OrganizeMove, OrganizeProject } from '$lib/components/organize/organize-plan';
import { loadOrganizeSnapshot, OrganizeSnapshotError } from './organize-snapshot';
import {
	compileOrganizePlan,
	buildOrganizeInverse,
	OrganizePlanError,
	type ManifestStep,
	type SkippedMove
} from './organize-transaction';

type Client = SupabaseClient<Database>;
/** Matches private.organize_authorize; enforced here before any project is read. */
export const MAX_ORGANIZE_PROJECTS = 20;
export class OrganizeError extends Error {
	constructor(
		message: string,
		readonly status = 409
	) {
		super(message);
	}
}
export interface OrganizeRequest {
	moves: OrganizeMove[];
	project_versions: Record<string, string>;
	confirmation_token?: string;
	batch_id?: string;
}
/** Preserve RPC receipt fields when adding skipped moves; object-spread inference drops them. */
export type OrganizeUndoResult = Record<string, unknown> & { skipped?: SkippedMove[] };
type Batch = {
	id: string;
	user_id: string;
	project_ids: string[];
	inverse_of: string | null;
	plan: ReturnType<typeof compileOrganizePlan>;
	manifest: ManifestStep[];
	receipt: Record<string, unknown>;
	created_at: string;
};

async function rpc(admin: Client, name: string, args: Record<string, unknown>) {
	const { data, error } = await admin.rpc(name as never, args as never);
	if (error) {
		const code = error.message;
		if (code.includes('access_denied') || code.includes('service_only'))
			throw new OrganizeError('Edit access to every project is required.', 403);
		if (code.includes('stale_preview'))
			throw new OrganizeError(
				'The projects or move impact changed. Preview again before applying.'
			);
		if (code.includes('already_undone'))
			throw new OrganizeError(
				'This batch has already been undone. Undo its inverse to redo it.'
			);
		if (code.includes('blocked'))
			throw new OrganizeError('This move is blocked. Review the latest preview.');
		if (code.includes('idempotency_conflict'))
			throw new OrganizeError('This batch ID was already used for a different request.');
		throw new OrganizeError(
			'The move could not be completed. Refresh the projects and try again.',
			error.code === '42501' ? 403 : 409
		);
	}
	if (!data || typeof data !== 'object' || Array.isArray(data))
		throw new OrganizeError('Invalid Organize response.', 500);
	return data as Record<string, unknown>;
}
/** Edit access per project through the session client (the rule SQL enforces
 * again under lock), checked in parallel rounds of MAX_ORGANIZE_PROJECTS. */
async function writableProjects(session: Client, ids: string[]) {
	const writable = new Set<string>();
	for (let start = 0; start < ids.length; start += MAX_ORGANIZE_PROJECTS) {
		const chunk = ids.slice(start, start + MAX_ORGANIZE_PROJECTS);
		const results = await Promise.all(
			chunk.map((id) =>
				session.rpc('current_actor_has_project_member_access', {
					p_project_id: id,
					p_required_access: 'write'
				})
			)
		);
		results.forEach(({ data, error }, index) => {
			if (error) throw new OrganizeError('Could not check project access.', 500);
			if (data === true) writable.add(chunk[index]!);
		});
	}
	return writable;
}
/** Edit access to every project is confirmed before any project contents load. */
async function snapshots(session: Client, ids: string[]): Promise<OrganizeProject[]> {
	if (ids.length > MAX_ORGANIZE_PROJECTS)
		throw new OrganizeError(
			`A batch can touch at most ${MAX_ORGANIZE_PROJECTS} projects.`,
			400
		);
	const writable = await writableProjects(session, ids);
	if (ids.some((id) => !writable.has(id)))
		throw new OrganizeError('Edit access to every project is required.', 403);
	const loaded = await Promise.all(
		ids.map((id) => loadOrganizeSnapshot(session, id, { writeChecked: true }))
	);
	return loaded.map(({ project }) => project);
}
/** Planner rejections keep their user-facing message; defects are logged and
 * reported generically. Both happen before any write. */
function compile(projects: OrganizeProject[], moves: OrganizeMove[]) {
	try {
		return compileOrganizePlan(projects, moves);
	} catch (error) {
		if (error instanceof OrganizePlanError) throw new OrganizeError(error.message, 400);
		console.error('[Organize] Could not compile plan', error);
		throw new OrganizeError(
			'These moves could not be planned. Refresh the projects and preview again.',
			400
		);
	}
}
/** The user_id filter is the only cross-user barrier here: the admin client bypasses RLS. */
async function readBatch(admin: Client, userId: string, id: string): Promise<Batch | null> {
	const { data, error } = await admin
		.from('onto_organize_batches' as never)
		.select('*')
		.eq('id', id)
		.eq('user_id', userId)
		.maybeSingle();
	if (error) throw new OrganizeError('Could not load the Organize batch.', 500);
	return data as Batch | null;
}

const moveKey = (moves: OrganizeMove[]) =>
	JSON.stringify(
		moves.map((m) => [
			m.kind,
			m.id,
			m.project_id,
			m.destination_project_id,
			m.parent_id,
			m.position
		])
	);
/** A saved batch is the definite outcome of its request, so its receipt is
 * returned without snapshot, version or access work: a retry after a lost
 * response, or after a project changed, was archived or lost access, must not
 * report a committed move as rejected. Only this user's batches are visible.
 */
async function savedReceipt(
	admin: Client,
	userId: string,
	batchId: string,
	inverseOf: string | null,
	moves?: OrganizeMove[]
) {
	const batch = await readBatch(admin, userId, batchId);
	if (!batch) return null;
	if (
		batch.inverse_of !== inverseOf ||
		(moves && moveKey(moves) !== moveKey(batch.plan?.moves ?? []))
	)
		throw new OrganizeError('This batch ID was already used for a different request.');
	return { ...batch.receipt, replayed: true };
}
/** Confirmed writes check their batch before starting and again if anything
 * fails, since a concurrent retry of the same batch may have committed it. */
async function confirmedWrite<T>(
	admin: Client,
	userId: string,
	batch: { id?: string; token?: string; inverseOf: string | null; moves?: OrganizeMove[] },
	write: () => Promise<T>
) {
	const batchId = batch.id;
	if (!batchId || !batch.token) return write();
	const check = () => savedReceipt(admin, userId, batchId, batch.inverseOf, batch.moves);
	const saved = await check();
	if (saved) return saved;
	try {
		return await write();
	} catch (error) {
		const committed = await check();
		if (committed) return committed;
		throw error;
	}
}

export async function previewOrApplyOrganize(input: {
	session: Client;
	admin: Client;
	userId: string;
	request: OrganizeRequest;
	apply: boolean;
}) {
	const { session, admin, userId, request, apply } = input;
	const run = async () => {
		const ids = [
			...new Set(
				request.moves.flatMap((move) => [move.project_id, move.destination_project_id])
			)
		].sort();
		const projects = await snapshots(session, ids);
		// Doc-tree revision, not updated_at: renames, props and next-step edits must
		// not invalidate a reviewed plan. SQL rechecks trees and moved rows under lock.
		if (
			projects.some(
				(project) =>
					String(project.structure.version) !== request.project_versions[project.id]
			)
		)
			throw new OrganizeError(
				'A project changed since it was opened. Refresh before previewing.'
			);
		const plan = compile(projects, request.moves);
		return rpc(admin, apply ? 'onto_organize_apply_atomic' : 'onto_organize_preview', {
			p_user_id: userId,
			p_plan: plan,
			...(apply
				? { p_batch_id: request.batch_id, p_confirmation_token: request.confirmation_token }
				: {})
		});
	};
	if (!apply) return run();
	return confirmedWrite(
		admin,
		userId,
		{
			id: request.batch_id,
			token: request.confirmation_token,
			inverseOf: null,
			moves: request.moves
		},
		run
	);
}
export async function undoOrganize(input: {
	session: Client;
	admin: Client;
	userId: string;
	sourceBatchId: string;
	batchId?: string;
	confirmationToken?: string;
}): Promise<OrganizeUndoResult> {
	const { session, admin, userId, sourceBatchId, batchId, confirmationToken } = input;
	const batch = { id: batchId, token: confirmationToken, inverseOf: sourceBatchId };
	return confirmedWrite(admin, userId, batch, async () => {
		const source = await readBatch(admin, userId, sourceBatchId);
		if (!source) throw new OrganizeError('Organize batch not found.', 404);
		const projects = await snapshots(session, source.project_ids);
		const { moves, skipped } = buildOrganizeInverse(projects, source.manifest);
		if (!moves.length) {
			// On a confirmed undo, nothing left to move can mean a concurrent retry just did it.
			const saved =
				batchId && confirmationToken
					? await savedReceipt(admin, userId, batchId, sourceBatchId)
					: null;
			return saved ?? { status: 'nothing_to_undo' as const, skipped };
		}
		const plan = { ...compile(projects, moves), skipped };
		const result = await rpc(
			admin,
			confirmationToken ? 'onto_organize_apply_atomic' : 'onto_organize_preview',
			{
				p_user_id: userId,
				p_plan: plan,
				p_inverse_of: sourceBatchId,
				...(confirmationToken
					? { p_batch_id: batchId, p_confirmation_token: confirmationToken }
					: {})
			}
		);
		return { ...result, skipped };
	});
}
/** History names at most this many items per batch; the rest are counted. */
const NAMED_MOVES_PER_BATCH = 3;
export type NamedMove = { kind: 'document' | 'task'; title: string; child_count: number };

function subtreeSize(node: ManifestStep['subtree']): number {
	return node ? 1 + (node.children ?? []).reduce((sum, child) => sum + subtreeSize(child), 0) : 0;
}

/** Each moved item once, in first-move order, with its last move's subtree. */
function distinctMoves(manifest: ManifestStep[] | null | undefined) {
	const steps = new Map<string, ManifestStep>();
	for (const step of Array.isArray(manifest) ? manifest : []) {
		if ((step?.kind === 'document' || step?.kind === 'task') && typeof step.id === 'string')
			steps.set(`${step.kind}:${step.id}`, step);
	}
	return [...steps.values()];
}

/**
 * Titles for what each batch moved, read now through the viewer's session client:
 * RLS returns only items the viewer can read today, and titles never live in the
 * journal. One query per entity table for the whole page; fails open to counts.
 */
async function nameMoves(session: Client, batches: Pick<Batch, 'id' | 'manifest'>[]) {
	const moves = new Map(batches.map((batch) => [batch.id, distinctMoves(batch.manifest)]));
	const wanted = { document: new Set<string>(), task: new Set<string>() };
	for (const steps of moves.values())
		for (const step of steps.slice(0, NAMED_MOVES_PER_BATCH)) wanted[step.kind].add(step.id);
	const titles = new Map<string, string>();
	try {
		const none = { data: [] as { id: string; title: string | null }[], error: null };
		const lookups = await Promise.all([
			wanted.document.size
				? session
						.from('onto_documents')
						.select('id,title')
						.in('id', [...wanted.document])
						.is('deleted_at', null)
				: none,
			wanted.task.size
				? session
						.from('onto_tasks')
						.select('id,title')
						.in('id', [...wanted.task])
						.is('deleted_at', null)
				: none
		]);
		(['document', 'task'] as const).forEach((kind, index) => {
			const { data, error } = lookups[index]!;
			if (error) throw error;
			for (const row of (data ?? []) as { id: string; title: string | null }[])
				titles.set(`${kind}:${row.id}`, row.title || 'Untitled');
		});
	} catch (error) {
		console.error('[Organize] Could not name history items', error);
		titles.clear();
	}
	return new Map(
		[...moves].map(([id, steps]) => {
			const named: NamedMove[] = [];
			for (const step of steps.slice(0, NAMED_MOVES_PER_BATCH)) {
				const title = titles.get(`${step.kind}:${step.id}`);
				if (title)
					named.push({
						kind: step.kind,
						title,
						child_count: Math.max(0, subtreeSize(step.subtree) - 1)
					});
			}
			return [id, { moved: named, moved_count: steps.length }];
		})
	);
}

export async function organizeHistory(
	session: Client,
	admin: Client,
	userId: string,
	projectId: string
) {
	if (!(await writableProjects(session, [projectId])).has(projectId))
		throw new OrganizeError('Edit access to this project is required.', 403);
	const { data, error } = await admin
		.from('onto_organize_batches' as never)
		.select('id,user_id,project_ids,inverse_of,manifest,receipt,created_at')
		.eq('user_id', userId)
		.contains('project_ids', [projectId])
		.order('created_at', { ascending: false })
		.limit(30);
	if (error) throw new OrganizeError('Could not load Organize history.', 500);
	const batches = (data ?? []) as unknown as Batch[];
	const others = [...new Set(batches.flatMap((batch) => batch.project_ids))].filter(
		(id) => id !== projectId
	);
	const allowed = await writableProjects(session, others);
	allowed.add(projectId);
	const visible = batches.filter((batch) => batch.project_ids.every((id) => allowed.has(id)));
	const named = await nameMoves(session, visible);
	return visible.map(({ id, inverse_of, receipt, created_at }) => ({
		id,
		inverse_of,
		receipt,
		created_at,
		...named.get(id)!
	}));
}
export { OrganizeSnapshotError };
