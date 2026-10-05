// packages/agentic-chat-runtime/src/loop/table-writes.test.ts
//
// BuildOS Tables (2026-10-04): a table is a document for the loop. Table writes
// land in the write ledger as document effects on the table id, "table" in a
// declared contract is the document kind, the contract admits the table write
// tools, and table_id is validated as a strict UUID like any entity id.
import { beforeAll, describe, expect, it } from 'vitest';
import type { ChatToolCall } from '@buildos/shared-types';
import { TABLE_TOOL_DEFINITIONS } from '../catalog/definitions/tables';
import { getToolRegistry } from '../catalog/registry';
import { provideAgenticChatLoopToolCatalog } from './tool-catalog';
import type { FastToolExecution } from './shared';
import {
	getSafeWriteToolNamesForTurnContract,
	parseDeclaredTurnContract,
	resolveTurnContractOutcomeFromLedger
} from './turn-contract';
import { validateToolCalls } from './tool-validation';
import { buildWriteLedger } from './write-ledger';

beforeAll(() => {
	provideAgenticChatLoopToolCatalog(() => getToolRegistry());
});

const TABLE_ID = '70000000-0000-4000-8000-000000000007';
const PROJECT_ID = '40000000-0000-4000-8000-000000000004';

function call(name: string, args: Record<string, unknown>, id = `call:${name}`): ChatToolCall {
	return { id, type: 'function', function: { name, arguments: JSON.stringify(args) } };
}

function execution(
	name: string,
	args: Record<string, unknown>,
	result: Record<string, unknown> = {},
	success = true
): FastToolExecution {
	const toolCall = call(name, args);
	return {
		toolCall,
		result: { tool_call_id: toolCall.id, success, result: success ? result : undefined }
	} as FastToolExecution;
}

describe('table writes in the write ledger', () => {
	it('records a row batch as a document update on the table with rows, cells, and columns', () => {
		const [entry] = buildWriteLedger([
			execution(
				'update_onto_table_rows',
				{
					table_id: TABLE_ID,
					update: [
						{
							row: 'r4',
							values: { 'Hiring manager': 'Ana Ruiz' },
							sources: { 'Hiring manager': 'https://example.com/ana' }
						}
					],
					add: [{ values: { Company: 'Linear', Status: 'Applied' } }]
				},
				{ document: { id: TABLE_ID, project_id: PROJECT_ID, title: 'Job applications' } }
			)
		]);
		expect(entry).toMatchObject({
			toolName: 'update_onto_table_rows',
			status: 'success',
			action: 'update',
			entityKind: 'document',
			entityId: TABLE_ID
		});
		expect(entry!.changedFields).toEqual(
			expect.arrayContaining(['rows', 'cells', 'hiring_manager', 'company', 'status'])
		);
		// Cell values and sources never become ledger fields.
		expect(entry!.changedFields).not.toContain('table_id');
		expect(JSON.stringify(entry)).not.toContain('Ana Ruiz');
	});

	it('records a column change as a document update naming the column', () => {
		const [entry] = buildWriteLedger([
			execution('update_onto_table', {
				table_id: TABLE_ID,
				column_changes: [{ action: 'add', name: 'Remote policy', type: 'select' }]
			})
		]);
		expect(entry).toMatchObject({
			entityKind: 'document',
			entityId: TABLE_ID,
			action: 'update'
		});
		expect(entry!.changedFields).toEqual(expect.arrayContaining(['columns', 'remote_policy']));
	});

	it('records a table create as a document create', () => {
		const [entry] = buildWriteLedger([
			execution(
				'create_onto_table',
				{
					project_id: PROJECT_ID,
					title: 'Job applications',
					columns: [{ name: 'Company' }]
				},
				{ document: { id: TABLE_ID, project_id: PROJECT_ID, title: 'Job applications' } }
			)
		]);
		expect(entry).toMatchObject({ action: 'create', entityKind: 'document' });
	});
});

describe('table writes under a declared turn contract', () => {
	it('reads "table" as the document kind and admits the table write tools', () => {
		const contract = parseDeclaredTurnContract({
			outcomes: [
				{
					action: 'update',
					entity_kind: 'table',
					target_ids: [TABLE_ID],
					required_fields: ['rows'],
					description: 'Fill the Remote policy column',
					minimum_successful_effects: 1
				}
			]
		});
		expect(contract).not.toBeNull();
		expect(contract!.outcomes[0]!.entityKind).toBe('document');
		expect(getSafeWriteToolNamesForTurnContract(contract)).toEqual(
			expect.arrayContaining(['update_onto_table', 'update_onto_table_rows'])
		);
	});

	it('is fulfilled by a successful row batch on the named table', () => {
		const contract = parseDeclaredTurnContract({
			outcomes: [
				{
					action: 'update',
					entity_kind: 'document',
					target_ids: [TABLE_ID],
					required_fields: ['rows'],
					description: 'Add the hiring manager',
					minimum_successful_effects: 1
				}
			]
		})!;
		const ledger = buildWriteLedger([
			execution('update_onto_table_rows', {
				table_id: TABLE_ID,
				update: [{ row: 'r4', values: { 'Hiring manager': 'Ana Ruiz' } }]
			})
		]);
		expect(resolveTurnContractOutcomeFromLedger(contract, ledger).fulfilled).toBe(true);

		const failed = buildWriteLedger([
			execution(
				'update_onto_table_rows',
				{ table_id: TABLE_ID, update: [{ row: 'r4', values: { X: 1 } }] },
				{},
				false
			)
		]);
		expect(resolveTurnContractOutcomeFromLedger(contract, failed).fulfilled).toBe(false);
	});
});

describe('table tool argument validation', () => {
	it('rejects a row handle or title passed as table_id', () => {
		for (const tableId of ['r12', 'Job applications']) {
			const issues = validateToolCalls(
				[
					call('update_onto_table_rows', {
						table_id: tableId,
						add: [{ values: { A: 1 } }]
					})
				],
				TABLE_TOOL_DEFINITIONS
			);
			expect(issues, tableId).toHaveLength(1);
			expect(issues[0]!.errors.join(' '), tableId).toContain('table_id');
		}
	});

	it('accepts a well-formed row batch and a read', () => {
		expect(
			validateToolCalls(
				[
					call('update_onto_table_rows', {
						table_id: TABLE_ID,
						update: [{ row: 'r4', values: { Status: 'Interview' } }]
					}),
					call('read_table_rows', {
						table_id: TABLE_ID,
						filters: [{ column: 'Status', op: 'eq', value: 'Interview' }]
					})
				],
				TABLE_TOOL_DEFINITIONS
			)
		).toEqual([]);
	});
});
