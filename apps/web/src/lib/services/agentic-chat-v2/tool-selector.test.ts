// apps/web/src/lib/services/agentic-chat-v2/tool-selector.test.ts
import { afterEach, describe, expect, it, vi } from 'vitest';

const mockEnv = vi.hoisted(() => ({}) as Record<string, string | undefined>);

vi.mock('$env/dynamic/private', () => ({
	env: mockEnv
}));

import { selectFastChatTools } from './tool-selector';

afterEach(() => {
	delete mockEnv['AGENTIC_CHAT_TOOL_GATEWAY'];
});

describe('selectFastChatTools', () => {
	it('returns only gateway tools when gateway flag is enabled', () => {
		mockEnv['AGENTIC_CHAT_TOOL_GATEWAY'] = 'true';

		const tools = selectFastChatTools({
			contextType: 'global',
			message: 'what is going on with my projects'
		});
		const names = tools.map((tool) => tool.function?.name);

		expect(names).toEqual(['tool_help', 'tool_exec']);
	});

	it('returns legacy tools when gateway flag is disabled', () => {
		mockEnv['AGENTIC_CHAT_TOOL_GATEWAY'] = 'false';

		const tools = selectFastChatTools({
			contextType: 'global',
			message: 'what is going on with my projects'
		});
		const names = tools.map((tool) => tool.function?.name).filter(Boolean);

		expect(names.length).toBeGreaterThan(3);
		expect(names).not.toContain('tool_help');
		expect(names).not.toContain('tool_exec');
	});
});
