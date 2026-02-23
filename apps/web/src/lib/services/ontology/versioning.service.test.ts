import { describe, expect, it } from 'vitest';

import {
	createOrMergeDocumentVersion,
	type DocumentSnapshot
} from './versioning.service';

type VersioningState = {
	latestVersion: Record<string, unknown> | null;
	latestError?: Error | null;
	mergeResult?: { id: string; number: number } | null;
	mergeError?: Error | null;
	insertResult?: { id: string; number: number } | null;
	insertError?: Error | null;
	updatePayload?: Record<string, unknown>;
	insertPayload?: Record<string, unknown>;
};

function createSupabaseMock(state: VersioningState) {
	return {
		from: () => {
			let mode: 'merge' | 'insert' | null = null;

			const builder = {
				select: () => builder,
				eq: () => builder,
				order: () => builder,
				limit: () => builder,
				maybeSingle: async () => ({
					data: state.latestVersion,
					error: state.latestError ?? null
				}),
				update: (payload: Record<string, unknown>) => {
					mode = 'merge';
					state.updatePayload = payload;
					return builder;
				},
				insert: (payload: Record<string, unknown>) => {
					mode = 'insert';
					state.insertPayload = payload;
					return builder;
				},
				single: async () => {
					if (mode === 'merge') {
						return { data: state.mergeResult ?? null, error: state.mergeError ?? null };
					}
					if (mode === 'insert') {
						return { data: state.insertResult ?? null, error: state.insertError ?? null };
					}
					return { data: null, error: null };
				}
			};

			return builder;
		}
	} as any;
}

const BASE_SNAPSHOT: DocumentSnapshot = {
	title: 'Doc',
	content: 'Before',
	description: null,
	props: {},
	state_key: 'draft',
	type_key: 'document.default',
	project_id: 'project-1'
};

describe('createOrMergeDocumentVersion', () => {
	it('creates a new version when forceCreateVersion is true inside merge window', async () => {
		const now = new Date().toISOString();
		const state: VersioningState = {
			latestVersion: {
				id: 'v1',
				number: 1,
				created_by: 'actor-1',
				created_at: now,
				props: {
					snapshot_hash: 'old-hash',
					window: { started_at: now, ended_at: now },
					change_count: 1
				}
			},
			insertResult: { id: 'v2', number: 2 }
		};
		const supabase = createSupabaseMock(state);

		const result = await createOrMergeDocumentVersion({
			supabase,
			documentId: 'doc-1',
			actorId: 'actor-1',
			snapshot: { ...BASE_SNAPSHOT, content: 'After' },
			previousSnapshot: BASE_SNAPSHOT,
			forceCreateVersion: true
		});

		expect(result).toEqual({
			status: 'created',
			versionNumber: 2,
			versionId: 'v2'
		});
		expect(state.insertPayload).toBeDefined();
		expect(state.updatePayload).toBeUndefined();
	});

	it('creates a version even when snapshot is unchanged if forceCreateVersion is true', async () => {
		const now = new Date().toISOString();
		const state: VersioningState = {
			latestVersion: {
				id: 'v2',
				number: 2,
				created_by: 'actor-1',
				created_at: now,
				props: {
					snapshot_hash: 'same-hash',
					window: { started_at: now, ended_at: now },
					change_count: 3
				}
			},
			insertResult: { id: 'v3', number: 3 }
		};
		const supabase = createSupabaseMock(state);

		const result = await createOrMergeDocumentVersion({
			supabase,
			documentId: 'doc-1',
			actorId: 'actor-1',
			snapshot: BASE_SNAPSHOT,
			previousSnapshot: BASE_SNAPSHOT,
			forceCreateVersion: true
		});

		expect(result).toEqual({
			status: 'created',
			versionNumber: 3,
			versionId: 'v3'
		});
		expect(state.insertPayload).toBeDefined();
		expect(state.updatePayload).toBeUndefined();
	});
});
