// packages/shared-agent-ops/src/ontology/versioning.service.test.ts
//
// Covers the P0 document trust fix (Switching Bar 0.2 / 0.3):
//   - version numbers survive a concurrent writer claiming the same number
//   - an open coalescing window is distinguishable from a sealed revision
//
// See apps/web/docs/features/document-service/SWITCHING_BAR_AND_REVISED_ROADMAP_2026-08-26.md §5.

import { describe, expect, it } from 'vitest';
import {
	DEFAULT_DOCUMENT_VERSION_WINDOW_MINUTES,
	createOrMergeDocumentVersion,
	isVersionWindowOpen,
	type DocumentSnapshot
} from './versioning.service';

const DOCUMENT_ID = '10000000-0000-4000-8000-000000000001';
const ACTOR_ID = '20000000-0000-4000-8000-000000000002';
const OTHER_ACTOR_ID = '30000000-0000-4000-8000-000000000003';

function snapshot(content: string): DocumentSnapshot {
	return {
		title: 'Doc',
		content,
		description: null,
		props: {},
		state_key: 'draft',
		type_key: 'document.default',
		project_id: '40000000-0000-4000-8000-000000000004'
	};
}

const UNIQUE_VIOLATION = { code: '23505', message: 'duplicate key value' };

/**
 * Minimal Supabase stand-in covering only the calls the versioning service makes:
 * a `select` on onto_document_versions for the latest row, an `update` on
 * onto_documents for the outline cache, and an `insert` on onto_document_versions.
 */
function makeSupabase(options: {
	latest?: { id: string; number: number; created_by: string; created_at: string; props: unknown };
	/** Version numbers that are already taken and must fail the insert. */
	taken?: number[];
	/** Latest number reported on each re-read after a collision. */
	rereadNumbers?: number[];
}) {
	// Every number the service tried to claim, including the ones a concurrent
	// writer had already taken — the retry path is only observable here.
	const attempts: number[] = [];
	const inserts: Array<{ number: number }> = [];
	const taken = new Set(options.taken ?? []);
	const rereads = [...(options.rereadNumbers ?? [])];
	let latestSelects = 0;

	const supabase = {
		from(table: string) {
			if (table === 'onto_documents') {
				return { update: () => ({ eq: async () => ({ error: null }) }) };
			}

			return {
				select: () => ({
					eq: () => ({
						order: () => ({
							limit: () => ({
								maybeSingle: async () => {
									latestSelects += 1;
									// First read is the pre-insert lookup; later reads are
									// collision re-reads.
									if (latestSelects === 1) {
										return { data: options.latest ?? null, error: null };
									}
									const next = rereads.shift();
									return {
										data: next === undefined ? null : { number: next },
										error: null
									};
								}
							})
						})
					})
				}),
				insert: (row: { number: number }) => ({
					select: () => ({
						single: async () => {
							attempts.push(row.number);
							if (taken.has(row.number)) {
								return { data: null, error: UNIQUE_VIOLATION };
							}
							inserts.push({ number: row.number });
							return {
								data: { id: `version-${row.number}`, number: row.number },
								error: null
							};
						}
					})
				}),
				update: () => ({
					eq: () => ({
						select: () => ({
							single: async () => ({
								data: { id: options.latest?.id, number: options.latest?.number },
								error: null
							})
						})
					})
				})
			};
		}
	} as never;

	return { supabase, inserts, attempts };
}

describe('isVersionWindowOpen', () => {
	const now = new Date('2026-08-26T12:00:00.000Z');

	it('treats a window that ended inside the merge period as still open', () => {
		expect(
			isVersionWindowOpen(
				{
					window: {
						started_at: '2026-08-26T11:00:00.000Z',
						ended_at: '2026-08-26T11:30:00.000Z'
					}
				},
				{ now }
			)
		).toBe(true);
	});

	it('treats a window that ended beyond the merge period as sealed', () => {
		expect(
			isVersionWindowOpen(
				{
					window: {
						started_at: '2026-08-26T09:00:00.000Z',
						ended_at: '2026-08-26T10:30:00.000Z'
					}
				},
				{ now }
			)
		).toBe(false);
	});

	it('falls back to created_at when no window is recorded', () => {
		expect(isVersionWindowOpen({ createdAt: '2026-08-26T11:59:00.000Z' }, { now })).toBe(true);
		expect(isVersionWindowOpen({ createdAt: '2026-08-26T09:00:00.000Z' }, { now })).toBe(false);
	});

	it('is false when there is nothing to measure, and tolerates junk timestamps', () => {
		expect(isVersionWindowOpen({}, { now })).toBe(false);
		expect(isVersionWindowOpen({ createdAt: 'not-a-date' }, { now })).toBe(false);
	});

	it('honours a caller-supplied window length', () => {
		const input = { createdAt: '2026-08-26T11:00:00.000Z' };
		expect(isVersionWindowOpen(input, { now, mergeWindowMinutes: 30 })).toBe(false);
		expect(
			isVersionWindowOpen(input, {
				now,
				mergeWindowMinutes: DEFAULT_DOCUMENT_VERSION_WINDOW_MINUTES
			})
		).toBe(true);
	});
});

describe('createOrMergeDocumentVersion version numbering', () => {
	it('claims the next free number when a concurrent writer took the one it picked', async () => {
		// Pre-insert read sees v4, so it tries v5 — but a racing writer already
		// committed v5. The re-read reports v5 as latest, so it retries at v6.
		const { supabase, inserts, attempts } = makeSupabase({
			latest: {
				id: 'version-4',
				number: 4,
				created_by: OTHER_ACTOR_ID,
				created_at: '2026-08-26T09:00:00.000Z',
				props: {}
			},
			taken: [5],
			rereadNumbers: [5]
		});

		const result = await createOrMergeDocumentVersion({
			supabase,
			documentId: DOCUMENT_ID,
			actorId: ACTOR_ID,
			snapshot: snapshot('hello')
		});

		expect(attempts).toEqual([5, 6]);
		expect(inserts.map((i) => i.number)).toEqual([6]);
		expect(result).toMatchObject({ status: 'created', versionNumber: 6 });
	});

	it('gives up rather than looping forever under sustained contention', async () => {
		const { supabase, inserts, attempts } = makeSupabase({
			latest: {
				id: 'version-1',
				number: 1,
				created_by: OTHER_ACTOR_ID,
				created_at: '2026-08-26T09:00:00.000Z',
				props: {}
			},
			taken: [2, 3, 4, 5, 6, 7, 8],
			rereadNumbers: [2, 3, 4, 5, 6, 7]
		});

		await expect(
			createOrMergeDocumentVersion({
				supabase,
				documentId: DOCUMENT_ID,
				actorId: ACTOR_ID,
				snapshot: snapshot('hello')
			})
		).rejects.toMatchObject({ code: '23505' });

		// Bounded: five attempts, not an unbounded retry loop, and nothing committed.
		expect(attempts).toEqual([2, 3, 4, 5, 6]);
		expect(inserts).toHaveLength(0);
	});

	it('skips entirely when the snapshot is unchanged', async () => {
		const { supabase, inserts } = makeSupabase({});
		const unchanged = snapshot('same');

		const result = await createOrMergeDocumentVersion({
			supabase,
			documentId: DOCUMENT_ID,
			actorId: ACTOR_ID,
			snapshot: unchanged,
			previousSnapshot: unchanged
		});

		expect(result).toEqual({ status: 'skipped', reason: 'no_change' });
		expect(inserts).toHaveLength(0);
	});
});
