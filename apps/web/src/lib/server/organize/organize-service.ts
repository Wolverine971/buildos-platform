// apps/web/src/lib/server/organize/organize-service.ts
import type { Database } from '@buildos/shared-types';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { OrganizeMove } from '$lib/components/organize/organize-plan';
import { loadOrganizeSnapshot, OrganizeSnapshotError } from './organize-snapshot';
import {
	compileOrganizePlan,
	buildOrganizeInverse,
	type ManifestStep
} from './organize-transaction';

type Client = SupabaseClient<Database>;
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
async function snapshots(session: Client, ids: string[]) {
	const loaded = await Promise.all(ids.map((id) => loadOrganizeSnapshot(session, id)));
	if (loaded.some(({ project }) => !project.can_write))
		throw new OrganizeError('Edit access to every project is required.', 403);
	return loaded.map(({ project }) => project);
}
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

/** Replays are checked before loading a fresh plan, so a lost HTTP response does
 * not turn a successful move into a misleading stale-preview error. SQL verifies
 * the original token/request hash and current access before returning the receipt.
 */
async function replay(
	admin: Client,
	userId: string,
	batchId: string | undefined,
	token: string | undefined,
	moves?: OrganizeMove[],
	inverseOf?: string
) {
	if (!batchId || !token) return null;
	const batch = await readBatch(admin, userId, batchId);
	if (!batch) return null;
	if ((inverseOf ?? null) !== batch.inverse_of)
		throw new OrganizeError('This batch ID was already used.');
	return rpc(admin, 'onto_organize_apply_atomic', {
		p_user_id: userId,
		p_batch_id: batchId,
		p_confirmation_token: token,
		p_inverse_of: inverseOf ?? null,
		p_plan: { ...batch.plan, moves: moves ?? batch.plan.moves }
	});
}
export async function previewOrApplyOrganize(input: {
	session: Client;
	admin: Client;
	userId: string;
	request: OrganizeRequest;
	apply: boolean;
}) {
	const { session, admin, userId, request, apply } = input;
	if (apply) {
		const previous = await replay(
			admin,
			userId,
			request.batch_id,
			request.confirmation_token,
			request.moves
		);
		if (previous) return previous;
	}
	const ids = [
		...new Set(request.moves.flatMap((move) => [move.project_id, move.destination_project_id]))
	].sort();
	const projects = await snapshots(session, ids);
	if (projects.some((project) => project.updated_at !== request.project_versions[project.id]))
		throw new OrganizeError(
			'A project changed since it was opened. Refresh before previewing.'
		);
	let plan: ReturnType<typeof compileOrganizePlan>;
	try {
		plan = compileOrganizePlan(projects, request.moves);
	} catch (error) {
		throw new OrganizeError(error instanceof Error ? error.message : 'Invalid plan.', 400);
	}
	return rpc(admin, apply ? 'onto_organize_apply_atomic' : 'onto_organize_preview', {
		p_user_id: userId,
		p_plan: plan,
		...(apply
			? { p_batch_id: request.batch_id, p_confirmation_token: request.confirmation_token }
			: {})
	});
}
export async function undoOrganize(input: {
	session: Client;
	admin: Client;
	userId: string;
	sourceBatchId: string;
	batchId?: string;
	confirmationToken?: string;
}) {
	const { session, admin, userId, sourceBatchId, batchId, confirmationToken } = input;
	const previous = await replay(
		admin,
		userId,
		batchId,
		confirmationToken,
		undefined,
		sourceBatchId
	);
	if (previous) return previous;
	const batch = await readBatch(admin, userId, sourceBatchId);
	if (!batch) throw new OrganizeError('Organize batch not found.', 404);
	const projects = await snapshots(session, batch.project_ids);
	const { moves, skipped } = buildOrganizeInverse(projects, batch.manifest);
	if (!moves.length) return { status: 'nothing_to_undo', skipped };
	const plan = { ...compileOrganizePlan(projects, moves), skipped };
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
}
export async function organizeHistory(
	session: Client,
	admin: Client,
	userId: string,
	projectId: string
) {
	const projectAccess = await session.rpc('current_actor_has_project_member_access', {
		p_project_id: projectId,
		p_required_access: 'write'
	});
	if (projectAccess.error) throw new OrganizeError('Could not check history access.', 500);
	if (!projectAccess.data)
		throw new OrganizeError('Edit access to this project is required.', 403);
	const { data, error } = await admin
		.from('onto_organize_batches' as never)
		.select('id,user_id,project_ids,inverse_of,receipt,created_at')
		.eq('user_id', userId)
		.contains('project_ids', [projectId])
		.order('created_at', { ascending: false })
		.limit(30);
	if (error) throw new OrganizeError('Could not load Organize history.', 500);
	const batches = (data ?? []) as unknown as Batch[];
	const allowed = new Map<string, boolean>([[projectId, true]]);
	for (const id of new Set(batches.flatMap((batch) => batch.project_ids))) {
		if (allowed.has(id)) continue;
		const access = await session.rpc('current_actor_has_project_member_access', {
			p_project_id: id,
			p_required_access: 'write'
		});
		if (access.error) throw new OrganizeError('Could not check history access.', 500);
		allowed.set(id, access.data === true);
	}
	return batches
		.filter((batch) => batch.project_ids.every((id) => allowed.get(id)))
		.map(({ id, inverse_of, receipt, created_at }) => ({
			id,
			inverse_of,
			receipt,
			created_at
		}));
}
export { OrganizeSnapshotError };
