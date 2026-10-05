// apps/worker/tests/agenticChatTableEditPreview.test.ts
//
// BuildOS Tables (2026-10-04): every update_onto_table_rows call is dry-run
// against the stored table before review. A batch naming a row handle or column
// that does not exist goes back to the acting model as a validation issue (no
// review round), and one that can apply reaches the reviewer as exact counts
// plus sample cell diffs.
import { describe, expect, it, vi } from 'vitest';
import type { MutationBatch } from '@buildos/agentic-chat-runtime/loop';
import {
	formatTableEditPreviewsForReview,
	previewTableEditCalls,
	toTableEditPreviewOutcome,
	type AgenticChatTableEditPreviewPort,
	type TableEditPreviewOutcome
} from '../src/workers/agentic-chat/provider/table-edit-preview';
import type { CompletedProviderToolCall } from '../src/workers/agentic-chat/provider/stream-tool-calls';

const TABLE_ID = '70000000-0000-4000-8000-000000000007';
const OTHER_TABLE_ID = '71000000-0000-4000-8000-000000000007';
const REQUEST = { userId: 'user-1', projectId: 'project-1' };

function rowsCall(id: string, args: Record<string, unknown>): CompletedProviderToolCall {
	const json = JSON.stringify(args);
	return {
		id,
		name: 'update_onto_table_rows',
		arguments: args as CompletedProviderToolCall['arguments'],
		canonicalArguments: json,
		canonicalProviderArguments: json
	};
}

function port(outcome: (args: Record<string, unknown>) => TableEditPreviewOutcome) {
	const preview = vi.fn(async ({ args }: { args: Record<string, unknown> }) => outcome(args));
	return { port: { preview } as AgenticChatTableEditPreviewPort, preview };
}

describe('toTableEditPreviewOutcome', () => {
	it('reduces the gateway dry run to counts and clipped samples', () => {
		const outcome = toTableEditPreviewOutcome(
			{
				table_id: TABLE_ID,
				project_id: 'project-1',
				title: 'Job applications',
				revision: 4,
				row_count: 40,
				preview: {
					rows_added: 1,
					rows_updated: 2,
					rows_deleted: 0,
					cells_changed: 3,
					sample: Array.from({ length: 12 }, (_, index) => ({
						row: `r${index + 1}`,
						column: 'Notes',
						before: '',
						after: 'x'.repeat(400)
					}))
				},
				summary: '1 added, 2 updated · 3 cells'
			},
			''
		);
		expect(outcome.status).toBe('previewed');
		if (outcome.status !== 'previewed') return;
		expect(outcome.preview).toMatchObject({
			table_id: TABLE_ID,
			title: 'Job applications',
			rows_added: 1,
			rows_updated: 2,
			cells_changed: 3
		});
		expect(outcome.preview.sample).toHaveLength(8);
		expect(outcome.preview.sample[0]!.after.length).toBeLessThanOrEqual(161);
	});

	it('turns resolution errors into a rejection that asks for a fresh read', () => {
		const outcome = toTableEditPreviewOutcome(
			{ errors: ['Row r99 does not exist', 'Column "Remote" does not exist'] },
			TABLE_ID
		);
		expect(outcome).toEqual({
			status: 'rejected',
			message: expect.stringContaining(
				'Row r99 does not exist; Column "Remote" does not exist'
			)
		});
		expect(outcome.status === 'rejected' && outcome.message).toContain('read_table_rows');
	});

	it('treats an unrecognized response as unavailable, never as a pass', () => {
		expect(toTableEditPreviewOutcome(null, TABLE_ID)).toEqual({ status: 'unavailable' });
	});
});

describe('previewTableEditCalls', () => {
	it('previews the first call on each table and returns validation issues for rejects', async () => {
		const { port: fake, preview } = port((args) =>
			args.table_id === TABLE_ID
				? {
						status: 'previewed',
						preview: {
							table_id: TABLE_ID,
							title: 'Job applications',
							rows_added: 0,
							rows_updated: 1,
							rows_deleted: 0,
							cells_changed: 1,
							sample: [
								{
									row: 'r4',
									column: 'Status',
									before: 'Applied',
									after: 'Interview'
								}
							]
						}
					}
				: { status: 'rejected', message: 'Row r99 does not exist.' }
		);
		const first = rowsCall('call-1', {
			table_id: TABLE_ID,
			update: [{ row: 'r4', values: { Status: 'Interview' } }]
		});
		// A second call on the same table may address rows the first adds: not previewed.
		const second = rowsCall('call-2', {
			table_id: TABLE_ID,
			update: [{ row: 'r50', values: { Status: 'Offer' } }]
		});
		const other = rowsCall('call-3', {
			table_id: OTHER_TABLE_ID,
			update: [{ row: 'r99', values: { Status: 'Offer' } }]
		});

		const { issues, previews } = await previewTableEditCalls(
			fake,
			[first, second, other],
			REQUEST
		);

		expect(preview).toHaveBeenCalledTimes(2);
		expect([...previews.keys()]).toEqual(['call-1']);
		expect(issues).toHaveLength(1);
		expect(issues[0]).toMatchObject({
			toolName: 'update_onto_table_rows',
			op: 'onto.table.rows.update'
		});
		expect(issues[0]!.errors[0]).toContain('nothing was written');
		expect(issues[0]!.errors[0]).toContain('Row r99 does not exist.');
	});

	it('fails open when the port throws or the gateway lacks the dry run', async () => {
		const preview = vi.fn(async () => {
			throw new Error('network');
		});
		const { issues, previews } = await previewTableEditCalls(
			{ preview } as AgenticChatTableEditPreviewPort,
			[rowsCall('call-1', { table_id: TABLE_ID, add: [{ values: { Company: 'Linear' } }] })],
			REQUEST
		);
		expect(issues).toEqual([]);
		expect(previews.size).toBe(0);
	});

	it('ignores every other tool', async () => {
		const { port: fake, preview } = port(() => ({ status: 'unavailable' }));
		const json = JSON.stringify({ table_id: TABLE_ID, title: 'Renamed' });
		await previewTableEditCalls(
			fake,
			[
				{
					id: 'call-1',
					name: 'update_onto_table',
					arguments: { table_id: TABLE_ID, title: 'Renamed' },
					canonicalArguments: json,
					canonicalProviderArguments: json
				}
			],
			REQUEST
		);
		expect(preview).not.toHaveBeenCalled();
	});
});

describe('formatTableEditPreviewsForReview', () => {
	it('renders only the previews of the held batch, numbered by call position', () => {
		const batch = {
			version: 1,
			calls: [
				{ id: 'call-a', name: 'create_onto_task', arguments: '{}' },
				{ id: 'call-b', name: 'update_onto_table_rows', arguments: '{}' }
			]
		} as unknown as MutationBatch;
		const text = formatTableEditPreviewsForReview(
			batch,
			new Map([
				[
					'call-b',
					{
						table_id: TABLE_ID,
						title: 'Job applications',
						rows_added: 3,
						rows_updated: 0,
						rows_deleted: 0,
						cells_changed: 7,
						sample: []
					}
				]
			])
		);
		expect(text).toContain('Server preview of the held table changes');
		expect(text).toContain('"call":2');
		expect(text).toContain('"cells_changed":7');
		expect(formatTableEditPreviewsForReview(batch, new Map())).toBeNull();
	});
});
