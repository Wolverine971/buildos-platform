// packages/agentic-chat-runtime/src/loop/update-onto-asset.test.ts
//
// Loop semantics for the project image write (2026-09-22): preflight
// validation (an explicit null document_id is the "unfile" change) and the
// write ledger the final answer is grounded in.
import { beforeAll, describe, expect, it } from 'vitest';
import type { ChatToolCall, ChatToolDefinition, ChatToolResult } from '@buildos/shared-types';
import { ONTOLOGY_WRITE_TOOLS } from '../catalog/definitions/ontology-write';
import type { FastToolExecution } from './shared';
import { provideAgenticChatLoopToolCatalog } from './tool-catalog';
import { validateToolCalls } from './tool-validation';
import { buildWriteLedger } from './write-ledger';

const ASSET_ID = '11111111-1111-4111-8111-111111111111';
const DOCUMENT_ID = '22222222-2222-4222-8222-222222222222';
const PROJECT_ID = '33333333-3333-4333-8333-333333333333';

const updateAssetTool = ONTOLOGY_WRITE_TOOLS.find(
	(tool) => tool.function.name === 'update_onto_asset'
) as ChatToolDefinition;

beforeAll(() => {
	provideAgenticChatLoopToolCatalog(() => ({ ops: {}, byToolName: {} }));
});

function call(args: Record<string, unknown>, id = 'asset-call-1'): ChatToolCall {
	return {
		id,
		type: 'function',
		function: { name: 'update_onto_asset', arguments: JSON.stringify(args) }
	};
}

function execution(
	args: Record<string, unknown>,
	result: Partial<ChatToolResult> = {}
): FastToolExecution {
	const toolCall = call(args);
	return {
		toolCall,
		result: { tool_call_id: toolCall.id, success: true, result: {}, ...result }
	};
}

describe('update_onto_asset preflight validation', () => {
	it('is a catalog tool that requires only asset_id', () => {
		expect(updateAssetTool.function.parameters.required).toEqual(['asset_id']);
		expect(Object.keys(updateAssetTool.function.parameters.properties)).toEqual([
			'asset_id',
			'caption',
			'alt_text',
			'document_id'
		]);
	});

	it('accepts naming, filing, and unfiling with an explicit null', () => {
		expect(
			validateToolCalls(
				[call({ asset_id: ASSET_ID, caption: 'Company logo' })],
				[updateAssetTool]
			)
		).toEqual([]);
		expect(
			validateToolCalls(
				[call({ asset_id: ASSET_ID, document_id: DOCUMENT_ID })],
				[updateAssetTool]
			)
		).toEqual([]);
		expect(
			validateToolCalls([call({ asset_id: ASSET_ID, document_id: null })], [updateAssetTool])
		).toEqual([]);
	});

	it('rejects a call that changes nothing or names a malformed id', () => {
		expect(validateToolCalls([call({ asset_id: ASSET_ID })], [updateAssetTool])).toEqual([
			expect.objectContaining({
				errors: [
					'No update fields provided for update_onto_asset. Include at least one field to change.'
				]
			})
		]);
		expect(
			validateToolCalls([call({ asset_id: 'logo.png', caption: 'Logo' })], [updateAssetTool])
		).toEqual([
			expect.objectContaining({
				errors: expect.arrayContaining(['Invalid asset_id: expected UUID'])
			})
		]);
		expect(
			validateToolCalls(
				[call({ asset_id: ASSET_ID, document_id: 'Brand guide' })],
				[updateAssetTool]
			)
		).toEqual([
			expect.objectContaining({
				errors: expect.arrayContaining(['Invalid document_id: expected UUID'])
			})
		]);
	});
});

describe('update_onto_asset write ledger', () => {
	it('records the saved name and the document the image was filed under', () => {
		const [entry] = buildWriteLedger([
			execution(
				{ asset_id: ASSET_ID, caption: 'Company logo', document_id: DOCUMENT_ID },
				{
					result: {
						asset: { id: ASSET_ID, project_id: PROJECT_ID, caption: 'Company logo' },
						placement: {
							kind: 'document',
							document_id: DOCUMENT_ID,
							document_title: 'Brand guide'
						},
						message: 'Named image "Company logo" and filed it under "Brand guide".'
					}
				}
			)
		]);
		expect(entry).toMatchObject({
			toolName: 'update_onto_asset',
			status: 'success',
			action: 'update',
			entityKind: 'asset',
			entityId: ASSET_ID,
			title: 'Company logo',
			parentId: DOCUMENT_ID,
			parentTitle: 'Brand guide',
			changedFields: ['caption', 'document_id'],
			changedValues: { caption: 'Company logo', document_id: DOCUMENT_ID }
		});
	});

	it('records an unfile as a document_id change to null', () => {
		const [entry] = buildWriteLedger([
			execution(
				{ asset_id: ASSET_ID, document_id: null },
				{
					result: {
						asset: { id: ASSET_ID, project_id: PROJECT_ID, caption: null },
						placement: { kind: 'images_shelf' }
					}
				}
			)
		]);
		expect(entry).toMatchObject({
			entityId: ASSET_ID,
			changedFields: ['document_id'],
			changedValues: { document_id: 'null' }
		});
		expect(entry?.parentId).toBeUndefined();
	});
});
