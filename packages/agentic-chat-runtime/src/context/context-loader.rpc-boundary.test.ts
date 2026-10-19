// packages/agentic-chat-runtime/src/context/context-loader.rpc-boundary.test.ts
import { describe, expect, it, vi } from 'vitest';
import type { Database } from '@buildos/shared-types';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createFastChatContextLoader } from './context-loader';

describe('project context authorization boundary', () => {
	it('does not query project tables for a whitespace-only ontology project ID', async () => {
		const rpc = vi.fn();
		const from = vi.fn((table: string) => {
			if (table !== 'users') throw new Error(`Unauthorized table read: ${table}`);
			return {
				select: () => ({
					eq: () => ({
						maybeSingle: async () => ({ data: { timezone: 'UTC' }, error: null })
					})
				})
			};
		});
		const loader = createFastChatContextLoader({ logger: { warn: vi.fn() } });

		const context = await loader.loadFastChatPromptContext({
			supabase: { rpc, from } as unknown as SupabaseClient<Database>,
			userId: '00000000-0000-4000-8000-000000000001',
			contextType: 'ontology',
			projectFocus: {
				projectId: '   ',
				projectName: 'Invalid project',
				focusType: 'project-wide',
				focusEntityId: null,
				focusEntityName: null
			}
		});

		expect(context).toMatchObject({ data: null, projectId: null, contextLoadSource: 'none' });
		expect(rpc).not.toHaveBeenCalled();
		expect(from.mock.calls.map(([table]) => table)).toEqual(['users']);
	});
});
