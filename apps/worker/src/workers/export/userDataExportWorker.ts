// apps/worker/src/workers/export/userDataExportWorker.ts
//
// Queue job 'user_data_export' (Settings → Your data → Download my data). Builds
// the user's zip (exportContent.ts), uploads it in parts no larger than the
// Storage object limit to the private user-exports bucket, and marks the
// user_data_exports row ready through complete_user_data_export(), which starts
// the 7-day download window. Any failure marks the row failed with a code, never
// content, and removes parts already uploaded.
//
// An account being deleted is never exported: users.deletion_status is checked
// before anything is read and again right before each part is uploaded.
import type { UserDataExportJobMetadata } from '@buildos/shared-types';
import { supabase } from '../../lib/supabase';
import { PermanentQueueError } from '../../lib/queueErrors';
import type { ProcessingJob } from '../../lib/supabaseQueue';
import { PartedZipWriter } from './exportArchive';
import {
	EXPORT_STAGES,
	type ExportCounts,
	type ExportDb,
	ExportError,
	type ExportStage,
	buildUserDataExport
} from './exportContent';

export const USER_DATA_EXPORT_JOB = 'user_data_export' as const;
export const USER_DATA_EXPORT_BUCKET = 'user-exports';

// The bucket allows 50 MiB per object (20260924190300); parts stay under it.
const DEFAULT_PART_MAX_BYTES = 40 * 1024 * 1024;

export function userDataExportPartMaxBytes(): number {
	const configured = Number.parseInt(process.env.USER_DATA_EXPORT_PART_MAX_BYTES ?? '', 10);
	return Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_PART_MAX_BYTES;
}

/** Part 1 is {user_id}/{export_id}.zip; later parts add .part{n}. The web download route and the SQL cleanup read the same names. */
export function userDataExportObjectPath(userId: string, exportId: string, part = 1): string {
	return part <= 1 ? `${userId}/${exportId}.zip` : `${userId}/${exportId}.part${part}.zip`;
}

export type UserDataExportResult =
	| { success: true; exportId: string; partCount: number; byteSize: number; counts: ExportCounts }
	| { success: false; exportId: string; skipped: true; reason: string };

function errorCode(error: unknown): string {
	if (error instanceof ExportError) return error.code;
	return 'unexpected';
}

async function assertAccountNotDeleting(db: ExportDb, userId: string): Promise<void> {
	const { data, error } = await db
		.from('users')
		.select('deletion_status')
		.eq('id', userId)
		.maybeSingle();
	if (error) throw new ExportError('load_account_failed');
	if (!data) throw new ExportError('account_not_found');
	if (data.deletion_status !== null && data.deletion_status !== 'none') {
		throw new ExportError('account_deletion_pending');
	}
}

async function markFailed(db: ExportDb, exportId: string, code: string): Promise<void> {
	const { error } = await db
		.from('user_data_exports')
		.update({ status: 'failed', error_code: code, completed_at: new Date().toISOString() })
		.eq('id', exportId)
		.in('status', ['queued', 'running']);
	if (error)
		console.warn(`⚠️ user_data_export ${exportId}: could not record failure (${error.code})`);
}

export async function processUserDataExportJob(
	job: ProcessingJob<UserDataExportJobMetadata>,
	deps: { db?: ExportDb; partMaxBytes?: number } = {}
): Promise<UserDataExportResult> {
	const db = deps.db ?? (supabase as unknown as ExportDb);
	const { exportId, userId } = job.data ?? ({} as Partial<UserDataExportJobMetadata>);
	if (typeof exportId !== 'string' || typeof userId !== 'string' || userId !== job.userId) {
		throw new PermanentQueueError(
			'invalid_metadata',
			'user_data_export needs its export and user'
		);
	}

	const { data: row, error: rowError } = await db
		.from('user_data_exports')
		.select('id, user_id, status')
		.eq('id', exportId)
		.eq('user_id', userId)
		.maybeSingle();
	if (rowError)
		throw new PermanentQueueError('load_export_failed', 'user_data_export row unreadable');
	if (!row) throw new PermanentQueueError('export_not_found', 'user_data_export row missing');
	if (row.status !== 'queued' && row.status !== 'running') {
		return { success: false, exportId, skipped: true, reason: row.status };
	}

	const uploaded: string[] = [];
	const bucket = db.storage.from(USER_DATA_EXPORT_BUCKET);
	try {
		await assertAccountNotDeleting(db, userId);

		const { error: startError } = await db
			.from('user_data_exports')
			.update({ status: 'running', started_at: new Date().toISOString(), error_code: null })
			.eq('id', exportId)
			.in('status', ['queued', 'running']);
		if (startError) throw new ExportError('start_failed');

		const writer = new PartedZipWriter({
			maxPartBytes: deps.partMaxBytes ?? userDataExportPartMaxBytes(),
			onPart: async (part) => {
				// A deletion that starts mid-build must not leave a zip behind.
				await assertAccountNotDeleting(db, userId);
				if (job.signal.aborted) throw new ExportError('aborted');
				const path = userDataExportObjectPath(userId, exportId, part.index);
				const { error } = await bucket.upload(path, part.bytes, {
					contentType: 'application/zip',
					upsert: true
				});
				if (error) throw new ExportError('upload_failed');
				uploaded.push(path);
			}
		});

		const counts = await buildUserDataExport({
			db,
			userId,
			addFile: (path, data, options) => writer.addFile(path, data, options),
			checkpoint: async (stage: ExportStage) => {
				if (job.signal.aborted) throw new ExportError('aborted');
				const index = EXPORT_STAGES.indexOf(stage);
				await job.updateProgress({
					current: index + 1,
					total: EXPORT_STAGES.length + 1,
					message: stage
				});
			}
		});
		const { partCount, totalBytes } = await writer.finish();

		const { error: completeError } = await db.rpc('complete_user_data_export', {
			p_export_id: exportId,
			p_storage_path: userDataExportObjectPath(userId, exportId, 1),
			p_byte_size: totalBytes,
			p_part_count: partCount
		});
		if (completeError) throw new ExportError('complete_failed');

		console.log(
			`📦 user_data_export ${exportId}: ${partCount} part(s), ${totalBytes} bytes, projects=${counts.projects} documents=${counts.documents} tasks=${counts.tasks} chats=${counts.chats} briefs=${counts.briefs} braindumps=${counts.braindumps} voice_notes=${counts.voiceNotes} uploads=${counts.uploads} missing_files=${counts.missingFiles}`
		);
		return { success: true, exportId, partCount, byteSize: totalBytes, counts };
	} catch (error) {
		const code = errorCode(error);
		if (uploaded.length > 0) {
			const { error: removeError } = await bucket.remove(uploaded);
			// Leftovers are listed by list_privacy_expired_user_exports() an hour later.
			if (removeError) console.warn(`⚠️ user_data_export ${exportId}: part cleanup deferred`);
		}
		await markFailed(db, exportId, code);
		console.warn(`⚠️ user_data_export ${exportId} failed (code=${code})`);
		throw new PermanentQueueError(code, `user data export failed (${code})`);
	}
}
