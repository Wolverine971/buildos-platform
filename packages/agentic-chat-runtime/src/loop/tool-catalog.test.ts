import { describe, expect, it, vi } from 'vitest';

describe('Agentic Chat loop tool catalog', () => {
	it('shares the installed provider across independent module instances', async () => {
		vi.resetModules();
		const installer = await import('./tool-catalog');
		const catalog = {
			ops: {},
			byToolName: {
				search_project: {
					op: 'search_project',
					tool_name: 'search_project',
					kind: 'read' as const
				}
			}
		};
		installer.provideAgenticChatLoopToolCatalog(() => catalog);

		vi.resetModules();
		const consumer = await import('./tool-catalog');

		expect(consumer.getAgenticChatLoopToolCatalog()).toBe(catalog);
	});
});
