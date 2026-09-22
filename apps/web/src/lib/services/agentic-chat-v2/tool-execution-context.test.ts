// apps/web/src/lib/services/agentic-chat-v2/tool-execution-context.test.ts
import { describe, expect, it } from 'vitest';
import { buildToolExecutionOntologyContext } from './tool-execution-context';

describe('buildToolExecutionOntologyContext', () => {
	it('carries prompt-context documents into tool execution', () => {
		const context = buildToolExecutionOntologyContext({
			contextScope: { projectId: 'project-1', projectName: 'The Glass Harbor' },
			promptContext: {
				contextType: 'project',
				projectId: 'project-1',
				projectName: 'The Glass Harbor',
				data: {
					project: { id: 'project-1', name: 'The Glass Harbor' },
					documents: [{ id: 'structure-1', title: 'Story Structure', state_key: 'draft' }]
				}
			}
		});

		expect(context?.entities.documents).toEqual([
			expect.objectContaining({ id: 'structure-1', title: 'Story Structure' })
		]);
	});
});
