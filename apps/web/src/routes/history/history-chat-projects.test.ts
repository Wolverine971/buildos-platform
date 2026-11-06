// apps/web/src/routes/history/history-chat-projects.test.ts
import { describe, expect, it } from 'vitest';
import { chatScopeFallbackLabel, rankChatProjects } from './history-chat-projects';

const projects = [
	{ id: 'p-alpha', name: 'Alpha', kind: 'project' },
	{ id: 'p-beta', name: 'Beta', kind: 'project' },
	{ id: 'p-gamma', name: 'Gamma', kind: 'project' },
	{ id: 'p-ws', name: 'Workspace', kind: 'workspace' }
];

const noTrails = { focusBySession: new Map(), links: [], changes: [], reads: [] };

describe('rankChatProjects', () => {
	it('uses the home project for a project chat', () => {
		const result = rankChatProjects(
			[{ id: 's1', context_type: 'project', entity_id: 'p-beta' }],
			noTrails,
			projects
		);
		expect(result.get('s1')).toEqual({
			projects: [{ id: 'p-beta', name: 'Beta' }],
			workspace: false
		});
	});

	it('ranks a workspace chat: focus, then edits, then reads', () => {
		const result = rankChatProjects(
			[{ id: 's1', context_type: 'global', entity_id: null }],
			{
				focusBySession: new Map([['s1', 'p-gamma']]),
				links: [],
				changes: [{ chat_session_id: 's1', project_id: 'p-alpha' }],
				reads: [
					{ chat_session_id: 's1', project_id: 'p-beta' },
					{ chat_session_id: 's1', project_id: 'p-beta' },
					{ chat_session_id: 's1', project_id: 'p-alpha' }
				]
			},
			projects
		);
		expect(result.get('s1')?.projects.map((p) => p.name)).toEqual(['Gamma', 'Alpha', 'Beta']);
		expect(result.get('s1')?.workspace).toBe(true);
	});

	it('never lists the Workspace pseudo-project, but flags it', () => {
		const result = rankChatProjects(
			[{ id: 's1', context_type: 'project', entity_id: 'p-ws' }],
			noTrails,
			projects
		);
		expect(result.get('s1')).toEqual({ projects: [], workspace: true });
	});

	it('drops projects it cannot name (deleted or hidden)', () => {
		const result = rankChatProjects(
			[{ id: 's1', context_type: 'project', entity_id: 'p-gone' }],
			noTrails,
			projects
		);
		expect(result.get('s1')).toEqual({ projects: [], workspace: false });
	});
});

describe('chatScopeFallbackLabel', () => {
	it('labels chats with no projects', () => {
		expect(chatScopeFallbackLabel('global', true)).toBe('Workspace chat');
		expect(chatScopeFallbackLabel('project', true)).toBe('Workspace chat');
		expect(chatScopeFallbackLabel('project')).toBe('Project chat');
		expect(chatScopeFallbackLabel('daily_brief')).toBe('Daily brief');
		expect(chatScopeFallbackLabel('project_create')).toBe('New project');
	});
});
