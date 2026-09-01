// packages/shared-agent-ops/src/gateway/op-execution-gateway.validation.test.ts
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

	it('canonicalizes common task-create aliases and task draft state', () => {
		const result = normalizeAndValidateGatewayWriteArgs('onto.task.create', {
			project_id: '00000000-0000-4000-8000-000000000001',
			name: 'Build six-week content calendar',
			goal_ids: ['00000000-0000-4000-8000-000000000002'],
			milestone_id: '00000000-0000-4000-8000-000000000003',
			state_key: 'draft'
		});

		expect(result).toMatchObject({
			ok: true,
			args: {
				title: 'Build six-week content calendar',
				goal_id: '00000000-0000-4000-8000-000000000002',
				supporting_milestone_id: '00000000-0000-4000-8000-000000000003',
				state_key: 'todo'
			}
		});
	});

	it('rejects ambiguous plural task goals instead of dropping information', () => {
		const result = normalizeAndValidateGatewayWriteArgs('onto.task.create', {
			project_id: '00000000-0000-4000-8000-000000000001',
			title: 'Ambiguous task',
			goal_ids: [
				'00000000-0000-4000-8000-000000000002',
				'00000000-0000-4000-8000-000000000003'
			]
		});

		expect(result).toMatchObject({
			ok: false,
			error: { message: 'Unsupported parameter: goal_ids' }
		});
	});

	it('normalizes edge aliases but rejects placeholder endpoint ids', () => {
		const result = normalizeAndValidateGatewayWriteArgs('onto.edge.link', {
			project_id: '00000000-0000-4000-8000-000000000001',
			from_type: 'task',
			from_id: 'PLACEHOLDER_FOR_TASK_ID',
			to_type: 'goal',
			to_id: '00000000-0000-4000-8000-000000000002',
			relationship: 'contributes_to'
		});

		expect(result).toMatchObject({
			ok: false,
			error: { message: 'src_id must be a valid UUID' }
		});
	});

	it('validates nested UUID arrays before staging or committing', () => {
		const result = normalizeAndValidateGatewayWriteArgs('onto.task.create', {
			project_id: '00000000-0000-4000-8000-000000000001',
			title: 'Assigned task',
			assignee_actor_ids: ['not-an-actor-id']
		});

		expect(result).toMatchObject({
			ok: false,
			error: { message: 'assignee_actor_ids[0] must be a valid UUID' }
		});
	});
});
