// apps/web/src/lib/server/project-fold/project-fold.service.ts
//
// Web side of the project fold ("Combine", tasker 122 WP5): preview, apply,
// unfold preview and unfold apply, following organize-service.ts. The session
// client checks admin on both projects first (the same rule SQL re-checks under
// lock); then the service-only RPCs run with the admin client and the session
// user's id. SQL (supabase/migrations/20260930220000_project_fold_foundation.sql,
// 20260930220100_project_unfold.sql, 20261017170000_project_fold_v1_readiness.sql)
// stays the authority for access, tokens, blockers and idempotency.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@buildos/shared-types';
import {
	parseFoldImpactV1,
	parseUnfoldImpactV1,
	type FoldImpactV1,
	type UnfoldImpactV1
} from '@buildos/shared-agent-ops/chat-cards/project-combine-card';

type Client = SupabaseClient<Database>;

export type ProjectFoldErrorCode =
	| 'access_denied'
	| 'invalid'
	| 'same_project'
	| 'project_missing'
	| 'destination_archived'
	| 'source_already_merged'
	| 'invalid_member_addition'
	| 'stale_preview'
	| 'blocked'
	| 'idempotency_conflict'
	| 'unfold_not_found'
	| 'unfold_already_done'
	| 'unfold_source_changed'
	| 'service_only'
	| 'not_deployed'
	| 'invalid_response'
	| 'unknown';

export class ProjectFoldError extends Error {
	constructor(
		readonly code: ProjectFoldErrorCode,
		message: string,
		readonly status: number,
		/** The SQL exception identifier, when the error came from the RPC. */
		readonly rpcCode: string | null = null,
		/** Blocker codes from `project_fold_blocked: [...]` / `project_unfold_blocked: [...]`. */
		readonly blockers: string[] = []
	) {
		super(message);
		this.name = 'ProjectFoldError';
	}
}

// Fixed identifiers raised by the fold migrations.
const RPC_ERRORS: Record<string, { code: ProjectFoldErrorCode; status: number; message: string }> =
	{
		project_fold_service_only: {
			code: 'service_only',
			status: 500,
			message: 'Combining projects isn’t available right now. Nothing changed.'
		},
		project_fold_access_denied: {
			code: 'access_denied',
			status: 403,
			message: 'You need admin access to both projects to combine them.'
		},
		project_fold_invalid_arguments: {
			code: 'invalid',
			status: 400,
			message: 'Invalid combine request.'
		},
		project_fold_same_project: {
			code: 'same_project',
			status: 400,
			message: 'A project can’t be combined into itself.'
		},
		project_fold_project_missing: {
			code: 'project_missing',
			status: 404,
			message: 'One of these projects no longer exists.'
		},
		project_fold_destination_archived: {
			code: 'destination_archived',
			status: 409,
			message: 'The destination is archived or was combined into another project.'
		},
		project_fold_source_already_merged: {
			code: 'source_already_merged',
			status: 409,
			message: 'This project was already combined into another project.'
		},
		project_fold_invalid_member_addition: {
			code: 'invalid_member_addition',
			status: 409,
			message: 'The people to add changed since this preview. Check again.'
		},
		project_fold_stale_preview: {
			code: 'stale_preview',
			status: 409,
			message: 'The projects changed since this preview. Check again.'
		},
		project_fold_blocked: {
			code: 'blocked',
			status: 409,
			message: 'This combine is blocked. Check the latest preview.'
		},
		project_fold_idempotency_conflict: {
			code: 'idempotency_conflict',
			status: 409,
			message: 'This combine was already run with different choices.'
		},
		project_unfold_not_found: {
			code: 'unfold_not_found',
			status: 404,
			message: 'This combine can no longer be undone.'
		},
		project_unfold_already_done: {
			code: 'unfold_already_done',
			status: 409,
			message: 'This combine was already undone.'
		},
		project_unfold_source_changed: {
			code: 'unfold_source_changed',
			status: 409,
			message: 'The combined project changed since, so this can’t be undone here.'
		},
		project_unfold_stale_preview: {
			code: 'stale_preview',
			status: 409,
			message: 'The projects changed since this preview. Check again.'
		},
		project_unfold_blocked: {
			code: 'blocked',
			status: 409,
			message: 'Undo is blocked right now. Check the latest preview.'
		}
	};

/** `project_fold_blocked: ["a", "b"]` → ['a', 'b'] (a structured jsonb list, not prose). */
function blockersFrom(message: string): string[] {
	const colon = message.indexOf(':');
	if (colon < 0) return [];
	try {
		const parsed: unknown = JSON.parse(message.slice(colon + 1).trim());
		return Array.isArray(parsed)
			? parsed.filter((entry): entry is string => typeof entry === 'string')
			: [];
	} catch {
		return [];
	}
}

export function toProjectFoldError(error: unknown): ProjectFoldError {
	if (error instanceof ProjectFoldError) return error;
	const record = typeof error === 'object' && error ? (error as Record<string, unknown>) : {};
	const message = typeof record.message === 'string' ? record.message : String(error ?? '');
	const pgCode = typeof record.code === 'string' ? record.code : '';
	// The exception identifier leads the message (a fixed snake_case token).
	const identifier = /^\s*([a-z_]+)/.exec(message)?.[1] ?? '';
	const mapped = RPC_ERRORS[identifier];
	if (mapped)
		return new ProjectFoldError(
			mapped.code,
			mapped.message,
			mapped.status,
			identifier,
			mapped.code === 'blocked' ? blockersFrom(message) : []
		);
	// PostgREST: function not in the schema cache (the fold migrations are not applied).
	if (pgCode === 'PGRST202' || pgCode === '42883')
		return new ProjectFoldError(
			'not_deployed',
			'Combining projects isn’t switched on yet. Nothing changed.',
			503
		);
	if (pgCode === '42501')
		return new ProjectFoldError(
			'access_denied',
			'You need admin access to both projects to combine them.',
			403
		);
	return new ProjectFoldError(
		'unknown',
		'The combine could not be completed. Refresh the projects and try again.',
		500
	);
}

type FoldRpcName =
	| 'onto_project_fold_preview'
	| 'onto_project_fold_apply'
	| 'onto_project_unfold_preview'
	| 'onto_project_unfold_apply';

/**
 * The only untyped call in this module: the fold RPCs and their manifest table
 * are not in the generated Database types. Types regenerate after the fold
 * migrations are applied; then drop the casts here and in readProjectFoldManifest.
 */
async function callFoldRpc(
	admin: Client,
	name: FoldRpcName,
	args: Record<string, unknown>
): Promise<Record<string, unknown>> {
	let result: { data: unknown; error: unknown };
	try {
		result = await (admin.rpc as any).call(admin, name, args);
	} catch (error) {
		throw toProjectFoldError(error);
	}
	if (result.error) throw toProjectFoldError(result.error);
	const data = result.data;
	if (!data || typeof data !== 'object' || Array.isArray(data))
		throw new ProjectFoldError('invalid_response', 'Invalid combine response.', 500);
	return data as Record<string, unknown>;
}

/** Admin on every project, through the session client (SQL re-checks under lock). */
async function requireAdmin(session: Client, projectIds: readonly string[]): Promise<void> {
	const results = await Promise.all(
		[...new Set(projectIds)].map((projectId) =>
			session.rpc('current_actor_has_project_member_access', {
				p_project_id: projectId,
				p_required_access: 'admin'
			})
		)
	);
	if (results.some((result) => result.error))
		throw new ProjectFoldError('unknown', 'Could not check project access.', 500);
	if (results.some((result) => result.data !== true))
		throw new ProjectFoldError(
			'access_denied',
			'You need admin access to both projects to combine them.',
			403
		);
}

const sortedUnique = (ids: readonly string[] | undefined) =>
	[...new Set((ids ?? []).map((id) => id.toLowerCase()))].sort();

type FoldInput = {
	session: Client;
	admin: Client;
	userId: string;
	sourceProjectId: string;
	destinationProjectId: string;
	/** Source members the destination lacks, added with their source role. */
	memberAdditions?: readonly string[];
};

export async function previewProjectFold(input: FoldInput): Promise<FoldImpactV1> {
	await requireAdmin(input.session, [input.sourceProjectId, input.destinationProjectId]);
	const data = await callFoldRpc(input.admin, 'onto_project_fold_preview', {
		p_user_id: input.userId,
		p_source_project_id: input.sourceProjectId,
		p_destination_project_id: input.destinationProjectId,
		p_member_additions: sortedUnique(input.memberAdditions)
	});
	const impact = parseFoldImpactV1(data);
	if (!impact) throw new ProjectFoldError('invalid_response', 'Invalid combine preview.', 500);
	return impact;
}

export type ProjectFoldReceiptV1 = {
	fold_id: string;
	source_project_id: string;
	destination_project_id: string;
	folder_document_id: string | null;
	members_added: string[];
	replayed: boolean;
	unfolded_at: string | null;
};

function str(value: unknown): string | null {
	return typeof value === 'string' && value ? value : null;
}

function parseFoldReceipt(data: Record<string, unknown>): ProjectFoldReceiptV1 | null {
	const foldId = str(data.fold_id);
	const source = str(data.source_project_id);
	const destination = str(data.destination_project_id);
	if (!foldId || !source || !destination) return null;
	const added = Array.isArray(data.members_added) ? data.members_added : [];
	return {
		fold_id: foldId,
		source_project_id: source,
		destination_project_id: destination,
		folder_document_id: str(data.folder_document_id),
		members_added: added
			.map((entry) =>
				entry && typeof entry === 'object'
					? str((entry as Record<string, unknown>).actor_id)
					: null
			)
			.filter((id): id is string => Boolean(id)),
		replayed: data.replayed === true,
		unfolded_at: str(data.unfolded_at)
	};
}

/** Idempotent by fold id: a retry with the same request replays the first receipt. */
export async function applyProjectFold(
	input: FoldInput & { confirmationToken: string; foldId: string }
): Promise<ProjectFoldReceiptV1> {
	await requireAdmin(input.session, [input.sourceProjectId, input.destinationProjectId]);
	const data = await callFoldRpc(input.admin, 'onto_project_fold_apply', {
		p_user_id: input.userId,
		p_source_project_id: input.sourceProjectId,
		p_destination_project_id: input.destinationProjectId,
		p_confirmation_token: input.confirmationToken,
		p_fold_id: input.foldId,
		p_member_additions: sortedUnique(input.memberAdditions)
	});
	const receipt = parseFoldReceipt(data);
	if (!receipt) throw new ProjectFoldError('invalid_response', 'Invalid combine receipt.', 500);
	return receipt;
}

export type ProjectFoldManifestV1 = {
	fold_id: string;
	source_project_id: string;
	destination_project_id: string;
	folder_document_id: string | null;
	receipt: ProjectFoldReceiptV1 | null;
	unfolded_at: string | null;
	unfold_receipt: Record<string, unknown> | null;
};

/**
 * The fold journal row (service-only table), for deciding what happened after
 * an uncertain apply or unfold. The user_id filter is the only cross-user
 * barrier: the admin client bypasses RLS.
 */
export async function readProjectFoldManifest(
	admin: Client,
	userId: string,
	foldId: string
): Promise<ProjectFoldManifestV1 | null> {
	const { data, error } = await admin
		.from('onto_project_fold_manifests' as never)
		.select(
			'id, user_id, source_project_id, destination_project_id, folder_document_id, receipt, unfolded_at, unfold_receipt'
		)
		.eq('id', foldId)
		.eq('user_id', userId)
		.maybeSingle();
	if (error) throw toProjectFoldError(error);
	const row = data as Record<string, unknown> | null;
	if (!row) return null;
	const receipt =
		row.receipt && typeof row.receipt === 'object' && !Array.isArray(row.receipt)
			? parseFoldReceipt(row.receipt as Record<string, unknown>)
			: null;
	return {
		fold_id: String(row.id),
		source_project_id: String(row.source_project_id),
		destination_project_id: String(row.destination_project_id),
		folder_document_id: str(row.folder_document_id),
		receipt,
		unfolded_at: str(row.unfolded_at),
		unfold_receipt:
			row.unfold_receipt &&
			typeof row.unfold_receipt === 'object' &&
			!Array.isArray(row.unfold_receipt)
				? (row.unfold_receipt as Record<string, unknown>)
				: null
	};
}

type UnfoldInput = { session: Client; admin: Client; userId: string; foldId: string };

/** Source and destination come from this user's manifest; admin on both is checked first. */
async function unfoldProjects(input: UnfoldInput): Promise<ProjectFoldManifestV1> {
	const manifest = await readProjectFoldManifest(input.admin, input.userId, input.foldId);
	if (!manifest)
		throw new ProjectFoldError(
			'unfold_not_found',
			RPC_ERRORS.project_unfold_not_found!.message,
			404,
			'project_unfold_not_found'
		);
	await requireAdmin(input.session, [
		manifest.source_project_id,
		manifest.destination_project_id
	]);
	return manifest;
}

export async function previewProjectUnfold(input: UnfoldInput): Promise<UnfoldImpactV1> {
	await unfoldProjects(input);
	const data = await callFoldRpc(input.admin, 'onto_project_unfold_preview', {
		p_user_id: input.userId,
		p_fold_id: input.foldId
	});
	const impact = parseUnfoldImpactV1(data);
	if (!impact) throw new ProjectFoldError('invalid_response', 'Invalid undo preview.', 500);
	return impact;
}

export type ProjectUnfoldReceiptV1 = {
	fold_id: string;
	moved_back: number;
	staying: number;
	folder_removed: boolean;
	parent_restored: boolean;
	members_added_by_fold_stay: number;
	replayed: boolean;
};

function sumCounts(value: unknown): number {
	if (typeof value === 'number' && Number.isFinite(value)) return value;
	if (!value || typeof value !== 'object' || Array.isArray(value)) return 0;
	return Object.values(value as Record<string, unknown>).reduce<number>(
		(sum, entry) => sum + sumCounts(entry),
		0
	);
}

export function parseProjectUnfoldReceipt(
	data: Record<string, unknown>,
	foldId: string
): ProjectUnfoldReceiptV1 {
	const moved = (data.moved_back ?? {}) as Record<string, unknown>;
	return {
		fold_id: str(data.fold_id) ?? foldId,
		// Moved rows of every node kind; the asset links nested under assets count too.
		moved_back: sumCounts(moved),
		staying: Array.isArray(data.staying) ? data.staying.length : 0,
		folder_removed: data.folder_removed === true,
		parent_restored: data.parent_restored === true,
		members_added_by_fold_stay: Array.isArray(data.members_added_by_fold_stay)
			? data.members_added_by_fold_stay.length
			: 0,
		replayed: data.replayed === true
	};
}

/** One unfold per fold; a retry with the same token replays the receipt. */
export async function applyProjectUnfold(
	input: UnfoldInput & { confirmationToken: string }
): Promise<ProjectUnfoldReceiptV1> {
	await unfoldProjects(input);
	const data = await callFoldRpc(input.admin, 'onto_project_unfold_apply', {
		p_user_id: input.userId,
		p_fold_id: input.foldId,
		p_confirmation_token: input.confirmationToken
	});
	return parseProjectUnfoldReceipt(data, input.foldId);
}
