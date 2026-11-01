// apps/mobile/tests/chat-changes.test.ts
import { describe, expect, it } from 'vitest';
import type { ChatSessionHistoryResponse } from '@buildos/api-client';
import type { AgentSSEMessage } from '@buildos/shared-types';

import {
	buildDocumentChanges,
	buildTableChanges,
	changesFromExecutions,
	describeSavedInProject,
	describeTableChange,
	entityWebPath,
	extractCreatedEntity,
	extractDocumentChangeReceipt,
	extractTableChangeReceipt
} from '@/lib/chat/changes';
import { demoHistory, seedDemo } from '@/lib/chat/demo';
import {
	type ChangesRow,
	createSessionStore,
	type WorkerTurnHandle
} from '@/lib/chat/session-store';

const SESSION = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const TURN = '11111111-2222-4333-8444-555555555555';
const PROJECT = 'pppppppp-0000-4000-8000-000000000001';
const DOC = 'dddddddd-0000-4000-8000-000000000001';
const TABLE = 'tttttttt-0000-4000-8000-000000000001';

const handle: WorkerTurnHandle = {
	contractVersion: 'agentic_chat_worker_v1',
	executionMode: 'worker_realtime',
	streamRunId: 'stream_1',
	clientTurnId: 'turn_1',
	sessionId: SESSION,
	turnRunId: TURN
};

function semantic(event: Record<string, unknown>): AgentSSEMessage {
	return { turn_run_id: TURN, ...event } as AgentSSEMessage;
}

function documentReceipt(overrides: Record<string, unknown> = {}) {
	return {
		version: 1,
		document_id: DOC,
		project_id: PROJECT,
		title: 'Launch checklist',
		lines_added: 4,
		lines_removed: 1,
		chars_before: 10,
		chars_after: 20,
		before_hash: 'h0',
		after_hash: 'h1',
		hunks: [
			{
				old_start: 1,
				new_start: 1,
				lines: [
					{ kind: 'remove', text: '- Screenshots: TODO' },
					{ kind: 'add', text: '- Screenshots: three sizes' }
				]
			}
		],
		hunks_truncated: false,
		revert_patch: { ops: ['r1'] },
		...overrides
	};
}

function tableReceipt(overrides: Record<string, unknown> = {}) {
	return {
		kind: 'table_change',
		document_id: TABLE,
		project_id: PROJECT,
		title: 'Beta testers',
		revision: 7,
		rows_added: 3,
		rows_updated: 1,
		rows_deleted: 0,
		cells_changed: 7,
		columns_changed: [],
		sample: [{ row: 'Priya', column: 'Status', before: 'Invited', after: 'Active' }],
		inverse_ops: [{ op: 'delete_rows' }],
		applied_revision: 8,
		...overrides
	};
}

describe('reading what a tool result changed', () => {
	it('finds the entity a create_onto_* call made, and nothing for other tools', () => {
		const result = {
			tool_call_id: 'c1',
			success: true,
			result: { task: { id: 't1', title: 'App Store screenshots', project_id: PROJECT } }
		};
		expect(extractCreatedEntity('create_onto_task', '{"title":"x"}', result)).toEqual({
			kind: 'task',
			id: 't1',
			name: 'App Store screenshots',
			projectId: PROJECT
		});
		expect(extractCreatedEntity('update_onto_task', '{}', result)).toBeNull();
		expect(extractCreatedEntity('create_onto_task', '{}', { success: true })).toBeNull();
	});

	it('falls back to the call arguments for the name and project, and reads a table as a document', () => {
		const created = extractCreatedEntity(
			'create_onto_table',
			{ title: 'Leads', project_id: PROJECT },
			{ result: { entity_id: 'tbl1' } }
		);
		expect(created).toEqual({
			kind: 'document',
			id: 'tbl1',
			name: 'Leads',
			projectId: PROJECT
		});
		const project = extractCreatedEntity('create_onto_project', '{}', {
			data: { project: { id: 'p9', name: 'Fading Crown' } }
		});
		expect(project).toEqual({
			kind: 'project',
			id: 'p9',
			name: 'Fading Crown',
			projectId: 'p9'
		});
	});

	it('reads document and table receipts from live and stored result shapes', () => {
		const receipt = documentReceipt();
		expect(extractDocumentChangeReceipt({ result: { document_change: receipt } })).toEqual(
			receipt
		);
		expect(extractDocumentChangeReceipt({ document_change: receipt })).toEqual(receipt);
		expect(extractDocumentChangeReceipt({ data: { document_change: receipt } })).toEqual(
			receipt
		);
		expect(
			extractDocumentChangeReceipt({ result: { document_change: { version: 2 } } })
		).toBeNull();
		const table = tableReceipt();
		expect(extractTableChangeReceipt({ result: { table_change: table } })).toEqual(table);
		expect(
			extractTableChangeReceipt({ result: { table_change: { kind: 'other' } } })
		).toBeNull();
	});

	it('merges a turn’s edits to one document into one card, Undo chained newest first', () => {
		const first = documentReceipt();
		const second = documentReceipt({
			before_hash: 'h1',
			after_hash: 'h2',
			lines_added: 2,
			lines_removed: 0,
			title: 'Launch checklist (final)',
			revert_patch: { ops: ['r2'] }
		});
		const [card, ...rest] = buildDocumentChanges([first, second, second] as never);
		expect(rest).toEqual([]);
		expect(card).toMatchObject({
			id: `${DOC}:h2`,
			title: 'Launch checklist (final)',
			linesAdded: 6,
			linesRemoved: 1,
			editCount: 2,
			beforeHash: 'h0',
			afterHash: 'h2',
			revertPatches: [{ ops: ['r2'] }, { ops: ['r1'] }]
		});
		expect(card!.hunks).toHaveLength(2);
		const tooLarge = buildDocumentChanges([
			first,
			documentReceipt({ after_hash: 'h3', revert_patch: null })
		] as never);
		expect(tooLarge[0]!.revertPatches).toBeNull();
	});

	it('merges table receipts, skips empty batches and words the counts', () => {
		const [card] = buildTableChanges([
			tableReceipt(),
			tableReceipt({
				applied_revision: 9,
				rows_added: 0,
				cells_changed: 2,
				columns_changed: ['Email']
			}),
			tableReceipt({
				applied_revision: 10,
				rows_added: 0,
				rows_updated: 0,
				cells_changed: 0,
				columns_changed: []
			})
		] as never);
		expect(card).toMatchObject({
			id: `${TABLE}:9`,
			rowsAdded: 3,
			cellsChanged: 9,
			columnsChanged: ['Email'],
			changeCount: 2
		});
		expect(describeTableChange(card!)).toBe('+3 rows · 9 cells · 1 column');
		expect(
			describeTableChange({
				rowsAdded: 0,
				rowsUpdated: 2,
				rowsDeleted: 1,
				cellsChanged: 0,
				columnsChanged: []
			})
		).toBe('2 rows changed · 1 deleted');
	});

	it('words what else was saved into a new project, and the website path for the rest', () => {
		expect(
			describeSavedInProject([
				{ kind: 'task', id: 'a', name: 'A', projectId: 'p' },
				{ kind: 'task', id: 'b', name: 'B', projectId: 'p' },
				{ kind: 'document', id: 'c', name: 'C', projectId: 'p' }
			])
		).toBe('2 tasks · 1 document');
		expect(entityWebPath({ kind: 'goal', id: 'g1', name: 'G', projectId: 'p1' })).toBe(
			'/projects/p1?entity=goal&entity_id=g1'
		);
		expect(entityWebPath({ kind: 'goal', id: 'g1', name: 'G', projectId: null })).toBeNull();
	});
});

describe('session store: the changes row', () => {
	function runTurn(store: ReturnType<typeof createSessionStore>) {
		store.addUserMessage({ clientTurnId: 'turn_1', text: 'Do the three things' });
		store.adoptHandle(handle, 'queued');
		store.port.beginGeneration({ handle, executionGeneration: 0, status: 'running' });
		store.port.applySemanticEvent(
			semantic({
				type: 'tool_call',
				tool_call: {
					id: 'c1',
					type: 'function',
					function: {
						name: 'create_onto_task',
						arguments: JSON.stringify({ title: 'Screenshots', project_id: PROJECT })
					}
				}
			})
		);
		store.port.applySemanticEvent(
			semantic({
				type: 'tool_result',
				result: {
					tool_call_id: 'c1',
					success: true,
					result: { task: { id: 't1', title: 'Screenshots', project_id: PROJECT } }
				}
			})
		);
		store.port.applySemanticEvent(
			semantic({
				type: 'tool_call',
				tool_call: {
					id: 'c2',
					type: 'function',
					function: { name: 'update_onto_document', arguments: '{}' }
				}
			})
		);
		store.port.applySemanticEvent(
			semantic({
				type: 'tool_result',
				result: {
					tool_call_id: 'c2',
					success: true,
					result: { document_change: documentReceipt() }
				}
			})
		);
		// A failed write leaves nothing on the row.
		store.port.applySemanticEvent(
			semantic({
				type: 'tool_result',
				result: {
					tool_call_id: 'c3',
					success: false,
					result: { table_change: tableReceipt() }
				}
			})
		);
	}

	it('gathers receipts while the turn runs and shows them once, after the answer', () => {
		const store = createSessionStore({ now: () => 1_000, makeId: () => 'row' });
		runTurn(store);
		expect(store.getState().rows.map((row) => row.kind)).toEqual(['user', 'work', 'assistant']);
		store.port.appendAssistantText({ handle, executionGeneration: 0, text: 'Done.' });
		store.port.finishTurn({
			handle,
			status: 'completed',
			finishedReason: 'stop',
			failureCode: null
		});
		const rows = store.getState().rows;
		expect(rows.map((row) => row.kind)).toEqual(['user', 'work', 'assistant', 'changes']);
		const changes = rows[3] as ChangesRow;
		expect(changes.id).toBe(`changes:${TURN}`);
		expect(changes.changes.created).toEqual([
			{ kind: 'task', id: 't1', name: 'Screenshots', projectId: PROJECT }
		]);
		expect(changes.changes.documents).toHaveLength(1);
		expect(changes.changes.tables).toEqual([]);

		const changeId = changes.changes.documents[0]!.id;
		store.setChangeBusy(changes.id, changeId);
		expect((store.getState().rows[3] as ChangesRow).busy).toBe(changeId);
		store.settleChange(changes.id, changeId, { undone: false, note: 'The text has changed.' });
		expect((store.getState().rows[3] as ChangesRow).notes[changeId]).toBe(
			'The text has changed.'
		);
		store.settleChange(changes.id, changeId, { undone: true, note: null });
		const settled = store.getState().rows[3] as ChangesRow;
		expect(settled.undone).toEqual([changeId]);
		expect(settled.notes).toEqual({});
		expect(settled.busy).toBeNull();
	});

	it('still shows what a stopped turn made, after its work row when the answer was empty', () => {
		const store = createSessionStore({ now: () => 1_000, makeId: () => 'row' });
		runTurn(store);
		store.port.finishTurn({
			handle,
			status: 'cancelled',
			finishedReason: 'cancelled',
			failureCode: null
		});
		expect(store.getState().rows.map((row) => row.kind)).toEqual(['user', 'work', 'changes']);
	});

	it('rebuilds each turn’s row from stored tool executions, without repeating a chip', () => {
		const history = demoHistory(Date.now());
		const [run1, run2] = history.turnRuns;
		const execution = (
			id: string,
			turnRunId: string,
			tool: string,
			result: Record<string, unknown>,
			sequence: number,
			success = true
		) =>
			({
				id,
				session_id: SESSION,
				message_id: null,
				turn_run_id: turnRunId,
				stream_run_id: null,
				client_turn_id: null,
				provider_tool_call_id: null,
				tool_name: tool,
				tool_category: null,
				gateway_op: null,
				help_path: null,
				sequence_index: sequence,
				arguments: { project_id: PROJECT },
				result,
				result_count: null,
				zero_result: null,
				execution_time_ms: null,
				tokens_consumed: null,
				success,
				error_message: null,
				requires_user_action: null,
				affected_entities: [],
				created_at: new Date().toISOString()
			}) as unknown as ChatSessionHistoryResponse['toolExecutions'][number];
		const withChanges: ChatSessionHistoryResponse = {
			...history,
			toolExecutions: [
				execution(
					'x2',
					run2!.id,
					'update_onto_table_rows',
					{ table_change: tableReceipt() },
					2
				),
				execution(
					'x1',
					run2!.id,
					'create_onto_task',
					{ result: { task: { id: 't1', title: 'Screenshots' } } },
					1
				),
				// The same task again in the next turn: already shown, so no second chip.
				execution(
					'x3',
					run1!.id,
					'create_onto_task',
					{ result: { task: { id: 't1', title: 'Screenshots' } } },
					1
				),
				execution(
					'x4',
					run1!.id,
					'update_onto_document',
					{ document_change: documentReceipt() },
					2,
					false
				)
			]
		};
		const store = createSessionStore();
		store.restore(withChanges);
		const rows = store.getState().rows;
		const changeRows = rows.filter((row): row is ChangesRow => row.kind === 'changes');
		expect(changeRows.map((row) => row.turnRunId)).toEqual([run1!.id, run2!.id]);
		// Run 1 keeps the chip (it ran first); run 2's copy is dropped and its table stays.
		expect(changeRows[0]!.changes.created.map((entity) => entity.id)).toEqual(['t1']);
		expect(changeRows[0]!.changes.documents).toEqual([]);
		expect(changeRows[1]!.changes.created).toEqual([]);
		expect(changeRows[1]!.changes.tables).toHaveLength(1);
		// Each sits right after its turn's answer.
		const answer2 = rows.findIndex(
			(row) => row.kind === 'assistant' && row.turnRunId === run2!.id
		);
		expect(rows[answer2 + 1]).toBe(changeRows[1]);
	});

	it('changesFromExecutions ignores failed calls', () => {
		const changes = changesFromExecutions([
			{
				tool_name: 'create_onto_goal',
				arguments: {},
				result: { goal: { id: 'g1', name: 'Ship' } },
				success: false,
				sequence_index: 1,
				created_at: null,
				turn_run_id: TURN
			} as never
		]);
		expect(changes.created).toEqual([]);
	});

	it('the demo "changes" state ends with one changes row holding all three kinds', () => {
		const store = createSessionStore();
		seedDemo(store, 'changes');
		const row = store.getState().rows.at(-1) as ChangesRow;
		expect(row.kind).toBe('changes');
		expect(row.changes.created).toHaveLength(1);
		expect(row.changes.documents[0]).toMatchObject({
			title: 'Launch checklist',
			linesAdded: 4
		});
		expect(row.changes.tables[0]).toMatchObject({ title: 'Beta testers', rowsAdded: 3 });
	});
});
