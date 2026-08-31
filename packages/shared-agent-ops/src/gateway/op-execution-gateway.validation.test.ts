import { describe, expect, it } from 'vitest';
import { normalizeAndValidateGatewayWriteArgs } from './op-execution-gateway.validation';

describe('gateway write argument compatibility aliases', () => {
	it('canonicalizes document-create parent_id before strict schema validation', () => {
		const result = normalizeAndValidateGatewayWriteArgs('onto.document.create', {
			project_id: '00000000-0000-4000-8000-000000000001',
			title: 'Campaign brief',
			parent_id: '00000000-0000-4000-8000-000000000002'
		});

		expect(result).toEqual({
			ok: true,
			args: {
				project_id: '00000000-0000-4000-8000-000000000001',
				title: 'Campaign brief',
				parent_document_id: '00000000-0000-4000-8000-000000000002'
			},
			legacyAliasesUsed: [{ alias: 'parent_id', target: 'parent_document_id' }]
		});
	});

	it('canonicalizes document content aliases for create and update', () => {
		const create = normalizeAndValidateGatewayWriteArgs('onto.document.create', {
			project_id: '00000000-0000-4000-8000-000000000001',
			title: 'Campaign brief',
			body_markdown: '# Campaign'
		});
		const update = normalizeAndValidateGatewayWriteArgs('onto.document.update', {
			document_id: '00000000-0000-4000-8000-000000000002',
			body_markdown: '# Revised campaign'
		});

		expect(create.ok && create.args).toMatchObject({ content: '# Campaign' });
		expect(update.ok && update.args).toMatchObject({ content: '# Revised campaign' });
	});

	it('keeps canonical document arguments unchanged', () => {
		const result = normalizeAndValidateGatewayWriteArgs('onto.document.create', {
			project_id: '00000000-0000-4000-8000-000000000001',
			title: 'Campaign brief',
			content: '# Campaign',
			parent_document_id: '00000000-0000-4000-8000-000000000002'
		});

		expect(result).toMatchObject({
			ok: true,
			legacyAliasesUsed: [],
			args: {
				content: '# Campaign',
				parent_document_id: '00000000-0000-4000-8000-000000000002'
			}
		});
	});
});
