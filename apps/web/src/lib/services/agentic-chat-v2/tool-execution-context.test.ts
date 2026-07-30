// apps/web/src/lib/services/agentic-chat-v2/tool-execution-context.test.ts
import { describe, expect, it } from 'vitest';
import { buildToolExecutionOntologyContext } from './tool-execution-context';

describe('buildToolExecutionOntologyContext', () => {
	it('carries the server-approved START HERE workspace contract into tool execution', () => {
		const context = buildToolExecutionOntologyContext({
			contextScope: { projectId: 'project-1', projectName: 'The Glass Harbor' },
			promptContext: {
				contextType: 'project',
				projectId: 'project-1',
				projectName: 'The Glass Harbor',
				data: {
					project: { id: 'project-1', name: 'The Glass Harbor' },
					start_here: {
						agent_workspace: {
							mode: 'living_reference',
							domain_profile: 'fiction_story',
							domain_affinity: 'writing.fiction',
							untrusted_extra: 'discard me'
						}
					},
					documents: [{ id: 'structure-1', title: 'Story Structure', state_key: 'draft' }]
				}
			}
		});

		expect(context?.entities.project?.props).toMatchObject({
			agent_workspace: {
				mode: 'living_reference',
				domain_profile: 'fiction_story',
				domain_affinity: 'writing.fiction'
			}
		});
		expect((context?.entities.project?.props as any).agent_workspace).not.toHaveProperty(
			'untrusted_extra'
		);
		expect(context?.entities.documents).toEqual([
			expect.objectContaining({ id: 'structure-1', title: 'Story Structure' })
		]);
	});
});
