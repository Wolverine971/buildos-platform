import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
	buildQuestionTreeExportNameMock,
	buildQuestionTreeExportZipMock,
	createAdminSupabaseClientMock,
	getAdminUserIdMock
} = vi.hoisted(() => ({
	buildQuestionTreeExportNameMock: vi.fn(),
	buildQuestionTreeExportZipMock: vi.fn(),
	createAdminSupabaseClientMock: vi.fn(),
	getAdminUserIdMock: vi.fn()
}));

vi.mock('$lib/supabase/admin', () => ({
	createAdminSupabaseClient: createAdminSupabaseClientMock
}));

vi.mock('$lib/server/question-tree-admin', () => ({
	getAdminUserId: getAdminUserIdMock
}));

vi.mock('$lib/services/question-tree/export', () => ({
	buildQuestionTreeExportName: buildQuestionTreeExportNameMock,
	buildQuestionTreeExportZip: buildQuestionTreeExportZipMock
}));

import { GET } from './+server';

describe('GET Question Tree export', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		getAdminUserIdMock.mockResolvedValue('admin-1');
		buildQuestionTreeExportNameMock.mockReturnValue('question-tree-test-run');
		buildQuestionTreeExportZipMock.mockReturnValue(new Uint8Array([0x50, 0x4b, 0x03, 0x04]));
	});

	it('exports the complete admin snapshot without applying the UI event limit', async () => {
		const run = {
			id: 'run-1',
			root_question: 'What did the tree find?',
			created_at: '2026-08-02T10:00:00.000Z'
		};
		const nodes = [{ id: 'node-1', node_number: 1 }];
		const proposals = [{ id: 'proposal-1' }];
		const events = Array.from({ length: 501 }, (_, index) => ({
			id: `event-${index + 1}`,
			seq: index + 1
		}));
		const orderCalls: Record<string, Array<[string, { ascending: boolean }]>> = {};
		const rangeCalls: Record<string, Array<[number, number]>> = {};
		const from = vi.fn((table: string) => {
			if (table === 'question_tree_runs') {
				return {
					select: vi.fn(() => ({
						eq: vi.fn(() => ({
							maybeSingle: vi.fn().mockResolvedValue({ data: run, error: null })
						}))
					}))
				};
			}

			const data =
				table === 'question_tree_nodes'
					? nodes
					: table === 'question_tree_proposals'
						? proposals
						: events;
			return {
				select: vi.fn(() => ({
					eq: vi.fn(() => ({
						order: vi.fn((column: string, options: { ascending: boolean }) => {
							(orderCalls[table] ??= []).push([column, options]);
							return {
								range: vi.fn((fromIndex: number, toIndex: number) => {
									(rangeCalls[table] ??= []).push([fromIndex, toIndex]);
									return Promise.resolve({
										data: data.slice(fromIndex, toIndex + 1),
										error: null
									});
								})
							};
						})
					}))
				}))
			};
		});
		createAdminSupabaseClientMock.mockReturnValue({ from });

		const response = await GET({
			params: { runId: 'run-1' },
			locals: { supabase: {}, safeGetSession: vi.fn() }
		} as any);

		expect(response.status).toBe(200);
		expect(response.headers.get('content-type')).toBe('application/zip');
		expect(response.headers.get('content-disposition')).toBe(
			'attachment; filename="question-tree-test-run.zip"'
		);
		expect(orderCalls.question_tree_events).toEqual([
			['seq', { ascending: true }],
			['seq', { ascending: true }]
		]);
		expect(rangeCalls.question_tree_events).toEqual([
			[0, 499],
			[500, 999]
		]);
		expect(buildQuestionTreeExportZipMock).toHaveBeenCalledWith({
			run,
			nodes,
			proposals,
			events
		});
		expect(new Uint8Array(await response.arrayBuffer())).toEqual(
			new Uint8Array([0x50, 0x4b, 0x03, 0x04])
		);
	});

	it('rejects non-admin callers before reading or exporting data', async () => {
		getAdminUserIdMock.mockResolvedValue(null);

		const response = await GET({
			params: { runId: 'run-1' },
			locals: { supabase: {}, safeGetSession: vi.fn() }
		} as any);

		expect(response.status).toBe(403);
		expect(createAdminSupabaseClientMock).not.toHaveBeenCalled();
		expect(buildQuestionTreeExportZipMock).not.toHaveBeenCalled();
	});
});
