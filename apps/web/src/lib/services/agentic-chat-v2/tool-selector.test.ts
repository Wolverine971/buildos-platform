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
	it('returns a hybrid gateway surface when gateway flag is enabled', () => {
		mockEnv['AGENTIC_CHAT_TOOL_GATEWAY'] = 'true';

		const tools = selectFastChatTools({ contextType: 'global' });
		const names = tools.map((tool) => tool.function?.name).filter(Boolean);

		expect(names).toContain('skill_load');
		expect(names).toContain('tool_search');
		expect(names).toContain('tool_schema');
		expect(names).not.toContain('execute_op');
		expect(names).toContain('get_workspace_overview');
		expect(names).toContain('get_project_overview');
		expect(names).toContain('search_buildos');
		expect(names).toContain('list_onto_tasks');
	});

	it('returns legacy tools when gateway flag is disabled', () => {
		mockEnv['AGENTIC_CHAT_TOOL_GATEWAY'] = 'false';

		const tools = selectFastChatTools({ contextType: 'global' });
		const names = tools.map((tool) => tool.function?.name).filter(Boolean);

		expect(names.length).toBeGreaterThan(3);
		expect(names).not.toContain('skill_load');
		expect(names).not.toContain('execute_op');
		expect(names).toContain('web_search');
		expect(names).toContain('web_visit');
		expect(names).toContain('list_calendar_events');
		expect(names).not.toContain('get_project_calendar');
		expect(names).not.toContain('set_project_calendar');
	});

	it('keeps project calendar mapping tools available in project context', () => {
		const tools = selectFastChatTools({ contextType: 'project' });
		const names = tools.map((tool) => tool.function?.name).filter(Boolean);

		expect(names).toContain('get_project_calendar');
		expect(names).toContain('set_project_calendar');
	});
});
