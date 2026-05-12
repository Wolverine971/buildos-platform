// apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator/tool-payload-compaction.test.ts
import { describe, expect, it } from 'vitest';
import type { ChatToolCall, ChatToolResult } from '@buildos/shared-types';
import { buildToolPayloadForModel } from './tool-payload-compaction';

function toolCall(name: string): ChatToolCall {
	return {
		id: `call:${name}`,
		type: 'function',
		function: {
			name,
			arguments: '{}'
		}
	};
}

function toolResult(result: unknown): ChatToolResult {
	return {
		tool_call_id: 'call:test',
		success: true,
		result
	};
}

const parseArgs = () => ({ args: {} });

describe('buildToolPayloadForModel', () => {
	it('compacts ontology search results and strips internal fields', () => {
		const payload = buildToolPayloadForModel(
			toolCall('search_project'),
			toolResult({
				query: 'Rod Chamberlin',
				search_scope: 'project',
				project_id: 'project-1',
				total_returned: 2,
				total: 2,
				maybe_more: false,
				message: 'Found 2 matches.',
				search_vector: "'rod':1",
				results: [
					{
						type: 'document',
						id: 'doc-1',
						project_id: 'project-1',
						project_name: 'Tacemus',
						title: 'Rod Chamberlin',
						state_key: 'draft',
						type_key: 'document.default',
						score: 0.99,
						path: 'project:project-1/document:doc-1',
						snippet: 'Relevant meeting prep snippet',
						search_vector: "'internal':1",
						extra_large_field: 'x'.repeat(2000)
					}
				]
			}),
			parseArgs
		) as Record<string, any>;

		expect(JSON.stringify(payload)).not.toContain('search_vector');
		expect(payload.results).toEqual([
			expect.objectContaining({
				type: 'document',
				id: 'doc-1',
				title: 'Rod Chamberlin',
				snippet: 'Relevant meeting prep snippet'
			})
		]);
		expect(JSON.stringify(payload)).not.toContain('extra_large_field');
	});

	it('compacts document detail payloads to content previews', () => {
		const payload = buildToolPayloadForModel(
			toolCall('get_onto_document_details'),
			toolResult({
				message: 'Complete ontology document details loaded.',
				document: {
					id: 'doc-1',
					project_id: 'project-1',
					title: 'Rod Chamberlin Compliance Check-in Prep',
					description: 'Preparation notes',
					type_key: 'document.default',
					state_key: 'draft',
					content: `# Prep\n\n${'Approved compliance talking point. '.repeat(200)}`,
					props: {
						body_markdown: 'duplicate markdown body',
						search_vector: "'nested':1"
					},
					search_vector: "'internal':1"
				}
			}),
			parseArgs
		) as Record<string, any>;

		expect(JSON.stringify(payload)).not.toContain('search_vector');
		expect(JSON.stringify(payload)).not.toContain('duplicate markdown body');
		expect(payload.document).toEqual(
			expect.objectContaining({
				id: 'doc-1',
				title: 'Rod Chamberlin Compliance Check-in Prep',
				content_length: expect.any(Number),
				content_preview: expect.stringContaining('Approved compliance talking point')
			})
		);
	});

	it('compacts project detail payloads to counts and summaries', () => {
		const payload = buildToolPayloadForModel(
			toolCall('get_onto_project_details'),
			toolResult({
				message: 'Complete ontology project details loaded.',
				project: {
					id: 'project-1',
					name: 'Tacemus Website Design',
					description: 'Website design company',
					type_key: 'project.service.website',
					state_key: 'planning',
					task_count: 2,
					document_count: 1,
					search_vector: "'internal':1"
				},
				counts: {
					tasks: 4,
					requirements: 3,
					documents: 9
				},
				tasks: [
					{
						id: 'task-1',
						title: 'Follow up with Rod',
						description: 'Resolve compliance status',
						state_key: 'todo',
						search_vector: "'task':1"
					}
				],
				requirements: [
					{
						id: 'req-1',
						text: 'Compliance status must be resolved before launch.',
						type_key: 'requirement.compliance',
						search_vector: "'requirement':1"
					}
				],
				documents: [
					{
						id: 'doc-1',
						title: 'Rod notes',
						content: 'long document body'.repeat(500),
						props: { search_vector: "'doc':1" }
					}
				]
			}),
			parseArgs
		) as Record<string, any>;

		const serialized = JSON.stringify(payload);
		expect(serialized).not.toContain('search_vector');
		expect(serialized).not.toContain('long document bodylong document body');
		expect(payload.counts).toEqual(
			expect.objectContaining({ tasks: 4, requirements: 3, documents: 9 })
		);
		expect(payload.tasks).toEqual(expect.objectContaining({ total: 4, truncated: true }));
		expect(payload.tasks.items[0]).toEqual(
			expect.objectContaining({
				id: 'task-1',
				title: 'Follow up with Rod'
			})
		);
		expect(payload.requirements.items[0]).toEqual(
			expect.objectContaining({
				id: 'req-1',
				text: 'Compliance status must be resolved before launch.'
			})
		);
		expect(payload.documents.items[0]).toEqual(
			expect.objectContaining({
				id: 'doc-1',
				title: 'Rod notes',
				content_length: expect.any(Number)
			})
		);
	});
});
