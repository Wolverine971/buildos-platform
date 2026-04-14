// apps/web/src/lib/services/agentic-chat-v2/tool-selector.test.ts
import { afterEach, describe, expect, it, vi } from 'vitest';

import { selectFastChatTools } from './tool-selector';

afterEach(() => {
	vi.unstubAllEnvs();
});

describe('selectFastChatTools', () => {
	it('returns the canonical hybrid gateway surface', () => {
		vi.stubEnv('LIBRI_INTEGRATION_ENABLED', 'true');

		const tools = selectFastChatTools({ contextType: 'global' });
		const names = tools.map((tool) => tool.function?.name).filter(Boolean);

		expect(names).toContain('skill_load');
		expect(names).toContain('tool_search');
		expect(names).toContain('tool_schema');
		expect(names).toContain('get_workspace_overview');
		expect(names).toContain('get_project_overview');
		expect(names).toContain('resolve_libri_resource');
		expect(names).toContain('search_buildos');
		expect(names).toContain('list_onto_tasks');
	});

	it('keeps project calendar mapping tools available in project context', () => {
		vi.stubEnv('LIBRI_INTEGRATION_ENABLED', 'true');
		const tools = selectFastChatTools({ contextType: 'project' });
		const names = tools.map((tool) => tool.function?.name).filter(Boolean);

		expect(names).toContain('resolve_libri_resource');
		expect(names).toContain('get_project_calendar');
		expect(names).toContain('set_project_calendar');
	});

	it('does not expose Libri on the project-create or calendar hot path', () => {
		vi.stubEnv('LIBRI_INTEGRATION_ENABLED', 'true');
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
		vi.stubEnv('LIBRI_INTEGRATION_ENABLED', 'false');
		const names = selectFastChatTools({ contextType: 'global' })
			.map((tool) => tool.function?.name)
			.filter(Boolean);

		expect(names).not.toContain('resolve_libri_resource');
	});
});
