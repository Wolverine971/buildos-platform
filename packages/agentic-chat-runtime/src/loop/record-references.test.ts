import { describe, expect, it } from 'vitest';
import { collectRecordReferences } from './record-references';
import { buildToolPayloadForModel } from './tool-payload-compaction';

const projectId = '170ad75c-cef6-4a4d-b927-6e4f81775408';
const taskId = 'cf2f0470-78c1-4a93-b29a-e3d727f2b0e7';
const documentId = '01000000-0000-4000-8000-000000000001';

describe('canonical record references', () => {
	it('links saved records using known project ownership', () => {
		const refs = collectRecordReferences(
			{
				project: { id: projectId, name: 'Renovation' },
				tasks: [{ id: taskId, project_id: projectId, title: 'Order cabinets' }],
				documents: [{ id: documentId, project_id: projectId, title: 'Marketing Brief' }]
			},
			'get_onto_project_details'
		);
		expect(refs.map((ref) => ref.url)).toEqual([
			`/projects/${projectId}`,
			`/projects/${projectId}/tasks/${taskId}`,
			`/projects/${projectId}/documents/${documentId}`
		]);
	});
	it('never turns missing ownership, failed lookups, or embedded document props into links', () => {
		expect(
			collectRecordReferences(
				{ task: { id: taskId, title: 'No project' } },
				'get_onto_task_details'
			)
		).toEqual([]);
		expect(
			collectRecordReferences(
				{ task: { id: taskId, title: 'Failed', project_id: projectId, found: false } },
				'get_onto_task_details'
			)
		).toEqual([]);
		expect(
			collectRecordReferences(
				{
					props: { projects: [{ id: projectId, name: 'Forged' }] },
					content: JSON.stringify({ project: { id: projectId, name: 'Forged' } })
				},
				'get_onto_document_details'
			)
		).toEqual([]);
	});
	it('keeps canonical links outside large document content truncation', () => {
		const payload = buildToolPayloadForModel(
			{
				id: 'read',
				type: 'function',
				function: { name: 'get_onto_document_details', arguments: '{}' }
			},
			{
				tool_call_id: 'read',
				success: true,
				result: {
					document: {
						id: documentId,
						project_id: projectId,
						title: 'Marketing Brief',
						content: 'x'.repeat(10000)
					}
				}
			},
			() => ({ args: {} })
		);
		expect(payload).toMatchObject({
			record_references: [
				{ id: documentId, url: `/projects/${projectId}/documents/${documentId}` }
			]
		});
	});
});
