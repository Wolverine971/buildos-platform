// apps/web/src/lib/services/agentic-chat-v2/specialist-workbench.server.ts
// Private catalog adapter: every query includes the verified session owner.
import {
	parseSpecialistWorkbenchDraftV1,
	compileSpecialistWorkbenchVersionV1,
	hashSpecialistWorkbenchValue,
	resolveSpecialistWorkbenchVersionV1
} from '@buildos/agentic-chat-runtime/specialists';
import type {
	WorkbenchDraftRow,
	WorkbenchVersionSummary,
	WorkbenchData
} from '../../types/specialist-workbench';

type DbResult = { data: unknown; error: { message?: string } | null };
interface Query extends PromiseLike<DbResult> {
	select(columns: string): Query;
	eq(column: string, value: unknown): Query;
	order(column: string, options: { ascending: boolean }): Query;
	limit(count: number): Query;
	maybeSingle(): PromiseLike<DbResult>;
}
export interface SpecialistWorkbenchClient {
	from(table: string): Query;
	rpc(name: string, args: Record<string, unknown>): PromiseLike<DbResult>;
}
export class SpecialistWorkbenchStoreError extends Error {
	constructor(
		public status: number,
		message: string
	) {
		super(message);
	}
}
const draftTable = 'agentic_chat_specialist_drafts';
const versionTable = 'agentic_chat_specialist_versions';
const versionColumns = 'draft_id,version,draft_revision,snapshot_hash,created_at,name';
const row = (value: unknown) => value as Record<string, any>;
function checked(response: DbResult): any {
	if (response.error)
		throw new SpecialistWorkbenchStoreError(
			503,
			'Specialist storage is unavailable. Keep your draft and try again.'
		);
	return response.data;
}
async function draftRow(value: unknown): Promise<WorkbenchDraftRow> {
	const r = row(value);
	const draft = parseSpecialistWorkbenchDraftV1(r.draft);
	if ((await hashSpecialistWorkbenchValue(draft)) !== r.draft_hash)
		throw new SpecialistWorkbenchStoreError(503, 'Saved draft integrity check failed.');
	return {
		id: r.id,
		revision: r.revision,
		draft,
		draftHash: r.draft_hash,
		updatedAt: r.updated_at
	};
}
function versionSummary(value: unknown): WorkbenchVersionSummary {
	const r = row(value);
	return {
		draftId: r.draft_id,
		version: r.version,
		draftRevision: r.draft_revision,
		snapshotHash: r.snapshot_hash,
		name: r.name ?? r.snapshot?.definition?.label ?? 'Specialist',
		createdAt: r.created_at
	};
}
function receipt(value: unknown): Record<string, any> {
	const r = row(value);
	if (!r || typeof r.outcome !== 'string')
		throw new SpecialistWorkbenchStoreError(503, 'Invalid specialist storage response.');
	if (r.outcome === 'conflict')
		throw new SpecialistWorkbenchStoreError(
			409,
			'This draft changed in another tab. Reload it before saving or publishing.'
		);
	if (r.outcome === 'not_found')
		throw new SpecialistWorkbenchStoreError(404, 'Specialist not found.');
	if (r.outcome === 'limit_reached')
		throw new SpecialistWorkbenchStoreError(409, 'The pilot catalog limit has been reached.');
	if (!['saved', 'published'].includes(r.outcome))
		throw new SpecialistWorkbenchStoreError(503, 'Invalid specialist storage outcome.');
	return r;
}
/** Picker data only: never fetch mutable drafts or published knowledge packets. */
export async function listPublishedSpecialistVersions(
	client: SpecialistWorkbenchClient,
	userId: string
): Promise<WorkbenchVersionSummary[]> {
	return checked(
		await client
			.from(versionTable)
			.select(versionColumns)
			.eq('user_id', userId)
			.order('created_at', { ascending: false })
			.limit(1000)
	).map(versionSummary);
}

export async function listSpecialistWorkbench(
	client: SpecialistWorkbenchClient,
	userId: string
): Promise<WorkbenchData> {
	const [drafts, versions] = await Promise.all([
		client
			.from(draftTable)
			.select('id,revision,draft,draft_hash,updated_at')
			.eq('user_id', userId)
			.order('updated_at', { ascending: false })
			.limit(20),
		listPublishedSpecialistVersions(client, userId)
	]);
	return {
		drafts: await Promise.all(checked(drafts).map(draftRow)),
		versions
	};
}
export async function saveSpecialistWorkbenchDraft(
	client: SpecialistWorkbenchClient,
	userId: string,
	id: string,
	expectedRevision: number,
	value: unknown
) {
	const draft = parseSpecialistWorkbenchDraftV1(value);
	const r = receipt(
		checked(
			await client.rpc('save_specialist_workbench_draft_v1', {
				p_user_id: userId,
				p_id: id,
				p_expected_revision: expectedRevision,
				p_draft: draft,
				p_draft_hash: await hashSpecialistWorkbenchValue(draft)
			})
		)
	);
	return { draft: await draftRow(r.draft) };
}
export async function getSpecialistWorkbenchVersion(
	client: SpecialistWorkbenchClient,
	userId: string,
	id: string,
	version: number
) {
	const r = checked(
		await client
			.from(versionTable)
			.select('draft_id,version,draft_revision,snapshot_hash,created_at,name,snapshot')
			.eq('user_id', userId)
			.eq('draft_id', id)
			.eq('version', version)
			.maybeSingle()
	);
	if (!r) throw new SpecialistWorkbenchStoreError(404, 'Version not found.');
	return {
		version: versionSummary(r),
		snapshot: await resolveSpecialistWorkbenchVersionV1(r.snapshot, r.snapshot_hash)
	};
}
export async function publishSpecialistWorkbenchVersion(
	client: SpecialistWorkbenchClient,
	userId: string,
	id: string,
	expectedRevision: number
) {
	const r = checked(
		await client
			.from(draftTable)
			.select('id,revision,draft,draft_hash,updated_at')
			.eq('user_id', userId)
			.eq('id', id)
			.maybeSingle()
	);
	if (!r) throw new SpecialistWorkbenchStoreError(404, 'Specialist not found.');
	const saved = await draftRow(r);
	if (saved.revision !== expectedRevision)
		throw new SpecialistWorkbenchStoreError(
			409,
			'This draft changed. Reload before publishing.'
		);
	const latest = checked(
		await client
			.from(versionTable)
			.select('version')
			.eq('user_id', userId)
			.eq('draft_id', id)
			.order('version', { ascending: false })
			.limit(1)
	);
	const snapshot = await compileSpecialistWorkbenchVersionV1({
		draftId: id,
		draftRevision: saved.revision,
		version: (latest[0]?.version ?? 0) + 1,
		draft: saved.draft
	});
	const published = receipt(
		checked(
			await client.rpc('publish_specialist_workbench_version_v1', {
				p_user_id: userId,
				p_id: id,
				p_expected_revision: expectedRevision,
				p_snapshot: snapshot,
				p_snapshot_hash: await hashSpecialistWorkbenchValue(snapshot)
			})
		)
	).version;
	return {
		version: versionSummary(published),
		snapshot: await resolveSpecialistWorkbenchVersionV1(
			published.snapshot,
			published.snapshot_hash
		)
	};
}
