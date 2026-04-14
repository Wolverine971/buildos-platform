// apps/web/src/lib/services/agentic-chat-v2/tool-selector.test.ts
import { afterEach, describe, expect, it, vi } from 'vitest';

const mockEnv = vi.hoisted(() => ({}) as Record<string, string | undefined>);

vi.mock('$env/dynamic/private', () => ({
	env: mockEnv
}));

import { selectFastChatTools } from './tool-selector';

afterEach(() => {
	delete mockEnv['AGENTIC_CHAT_TOOL_GATEWAY'];
	delete mockEnv['LIBRI_INTEGRATION_ENABLED'];
});

describe('selectFastChatTools', () => {
	it('returns a hybrid gateway surface when gateway flag is enabled', () => {
		mockEnv['AGENTIC_CHAT_TOOL_GATEWAY'] = 'true';
		mockEnv['LIBRI_INTEGRATION_ENABLED'] = 'true';

		const tools = selectFastChatTools({ contextType: 'global' });
		const names = tools.map((tool) => tool.function?.name).filter(Boolean);

		expect(names).toContain('skill_load');
		expect(names).toContain('tool_search');
		expect(names).toContain('tool_schema');
		expect(names).not.toContain('execute_op');
		expect(names).toContain('get_workspace_overview');
		expect(names).toContain('get_project_overview');
		expect(names).toContain('resolve_libri_resource');
		expect(names).toContain('search_buildos');
		expect(names).toContain('list_onto_tasks');
	});

	it('returns legacy tools when gateway flag is disabled', () => {
		mockEnv['AGENTIC_CHAT_TOOL_GATEWAY'] = 'false';
		mockEnv['LIBRI_INTEGRATION_ENABLED'] = 'true';

		const tools = selectFastChatTools({ contextType: 'global' });
		const names = tools.map((tool) => tool.function?.name).filter(Boolean);

		expect(names.length).toBeGreaterThan(3);
		expect(names).not.toContain('skill_load');
		expect(names).not.toContain('execute_op');
		expect(names).toContain('web_search');
		expect(names).toContain('web_visit');
		expect(names).toContain('resolve_libri_resource');
		expect(names).toContain('list_calendar_events');
		expect(names).not.toContain('get_project_calendar');
		expect(names).not.toContain('set_project_calendar');
	});

	it('keeps project calendar mapping tools available in project context', () => {
		mockEnv['LIBRI_INTEGRATION_ENABLED'] = 'true';
		const tools = selectFastChatTools({ contextType: 'project' });
		const names = tools.map((tool) => tool.function?.name).filter(Boolean);

		expect(names).toContain('resolve_libri_resource');
		expect(names).toContain('get_project_calendar');
		expect(names).toContain('set_project_calendar');
	});

	it('does not expose Libri on the project-create or calendar hot path', () => {
		mockEnv['LIBRI_INTEGRATION_ENABLED'] = 'true';
		const projectCreateNames = selectFastChatTools({ contextType: 'project_create' })
			.map((tool) => tool.function?.name)
			.filter(Boolean);
		const calendarNames = selectFastChatTools({ contextType: 'calendar' })
			.map((tool) => tool.function?.name)
			.filter(Boolean);

		expect(projectCreateNames).not.toContain('resolve_libri_resource');
		expect(calendarNames).not.toContain('resolve_libri_resource');
	});

	it('does not expose Libri when the feature flag is disabled', () => {
		const names = selectFastChatTools({ contextType: 'global' })
			.map((tool) => tool.function?.name)
			.filter(Boolean);

		expect(names).not.toContain('resolve_libri_resource');
	});
});
