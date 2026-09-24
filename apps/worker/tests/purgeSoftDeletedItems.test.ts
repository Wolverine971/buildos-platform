// apps/worker/tests/purgeSoftDeletedItems.test.ts
// Unit coverage for the soft-delete purge tasks in the privacy retention job.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	PRIVACY_RETENTION_TASKS,
	type PrivacyRetentionClient,
	runPrivacyRetention
} from '../src/scheduler/privacyRetention';

type RpcResponse = { data: unknown; error: { code?: string; message?: string } | null };

const PURGE_TASKS = PRIVACY_RETENTION_TASKS.filter(
	(task) =>
		task.rpc.startsWith('list_privacy_deleted_') ||
		task.rpc.startsWith('cleanup_privacy_deleted_')
);

function fakeClient(
	respond: (name: string, call: number) => RpcResponse,
	remove: (bucket: string, paths: string[]) => RpcResponse = () => ({ data: [], error: null })
) {
	const calls: string[] = [];
	const removals: Array<{ bucket: string; paths: string[] }> = [];
	const perName = new Map<string, number>();
	const client: PrivacyRetentionClient = {
		async rpc(name) {
			const call = (perName.get(name) ?? 0) + 1;
			perName.set(name, call);
			calls.push(name);
			return respond(name, call);
		},
		storage: {
			from(bucket) {
				return {
					async remove(paths) {
						removals.push({ bucket, paths });
						return remove(bucket, paths);
					}
				};
			}
		}
	};
	return { client, calls, removals };
}

describe('soft-delete purge tasks', () => {
	beforeEach(() => {
		vi.spyOn(console, 'log').mockImplementation(() => undefined);
		vi.spyOn(console, 'warn').mockImplementation(() => undefined);
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('schedules every function the purge migration defines', () => {
		const migration = readFileSync(
			resolve(
				process.cwd(),
				'../../supabase/migrations/20260924190400_purge_soft_deleted_items.sql'
			),
			'utf8'
		);
		const defined = [
			...migration.matchAll(
				/CREATE OR REPLACE FUNCTION public\.((?:cleanup|list|claim)_privacy_[a-z_]+)\(/g
			)
		].map((match) => match[1]);

		expect(defined).toHaveLength(9);
		expect(PURGE_TASKS.map((task) => task.rpc).sort()).toEqual([...defined].sort());
	});

	it('removes storage before any purge deletes a row', () => {
		const names = PRIVACY_RETENTION_TASKS.map((task) => task.rpc);
		const lastStorage = Math.max(
			names.indexOf('list_privacy_deleted_asset_objects'),
			names.indexOf('list_privacy_deleted_voice_note_objects')
		);
		const firstRowPurge = Math.min(
			...names.map((name, index) =>
				name.startsWith('cleanup_privacy_deleted_') ? index : Infinity
			)
		);

		expect(lastStorage).toBeGreaterThan(-1);
		expect(firstRowPurge).toBeGreaterThan(lastStorage);
	});

	it('sends each expired object to its own bucket, then purges the rows', async () => {
		const { client, calls, removals } = fakeClient((name, call) => {
			if (name === 'list_privacy_deleted_asset_objects') {
				return {
					data: call === 1 ? [{ object_name: 'projects/p1/assets/a1/original.png' }] : [],
					error: null
				};
			}
			if (name === 'list_privacy_deleted_voice_note_objects') {
				return { data: call === 1 ? [{ object_name: 'u1/old.webm' }] : [], error: null };
			}
			return {
				data:
					name === 'cleanup_privacy_deleted_project_items'
						? {
								onto_tasks_deleted: call === 1 ? 4 : 0,
								onto_comments_blanked: call === 1 ? 1 : 0,
								item_purge_failures: call === 1 ? 1 : 0
							}
						: {},
				error: null
			};
		});

		const summary = await runPrivacyRetention({ client, tasks: PURGE_TASKS });

		expect(removals).toEqual([
			{ bucket: 'onto-assets', paths: ['projects/p1/assets/a1/original.png'] },
			{ bucket: 'voice_notes', paths: ['u1/old.webm'] }
		]);
		expect(calls.indexOf('cleanup_privacy_deleted_projects')).toBeGreaterThan(
			calls.lastIndexOf('list_privacy_deleted_voice_note_objects')
		);
		expect(summary.results.every((result) => result.status === 'drained')).toBe(true);
		expect(
			summary.results.find(
				(result) => result.name === 'cleanup_privacy_deleted_project_items'
			)
		).toMatchObject({
			batches: 2,
			counts: { onto_tasks_deleted: 4, onto_comments_blanked: 1, item_purge_failures: 1 }
		});
	});

	it('still runs the row purges when a Storage removal fails', async () => {
		const { client, calls } = fakeClient(
			(name) =>
				name === 'list_privacy_deleted_voice_note_objects'
					? { data: [{ object_name: 'u1/old.webm' }], error: null }
					: { data: name.startsWith('list_') ? [] : {}, error: null },
			(bucket) =>
				bucket === 'voice_notes'
					? { data: null, error: { code: 'storage_unavailable' } }
					: { data: [], error: null }
		);

		const summary = await runPrivacyRetention({ client, tasks: PURGE_TASKS });
		const byName = new Map(summary.results.map((result) => [result.name, result]));

		expect(byName.get('deleted_voice_note_audio')).toMatchObject({
			status: 'failed',
			errorCode: 'storage_unavailable'
		});
		// The voice purge still runs; its SQL skips any note whose object remains.
		expect(calls).toContain('cleanup_privacy_deleted_voice_notes');
		expect(byName.get('cleanup_privacy_deleted_voice_notes')?.status).toBe('drained');
	});
});
