// apps/mobile/tests/chat-helpers.test.ts
import { describe, expect, it, vi } from 'vitest';

import { createBearerFetch } from '@/lib/chat/bearer-fetch';
import {
	GLOBAL_TARGET,
	parseTargetParams,
	projectFocusFor,
	targetLabel,
	targetParams,
	turnContextFor
} from '@/lib/chat/context';
import { newChatId } from '@/lib/chat/ids';
import { toolLine } from '@/lib/chat/tool-lines';

describe('toolLine', () => {
	it('turns structured tool names into a verb and a target', () => {
		expect(toolLine('search_onto_tasks', '{"query":"launch"}')).toEqual({
			verb: 'Searching tasks',
			target: 'launch'
		});
		expect(toolLine('get_onto_project_details', { id: 'p1' })).toEqual({
			verb: 'Reading project details',
			target: null
		});
		expect(toolLine('create_onto_task', '{"title":"Write the intro"}')).toEqual({
			verb: 'Creating task',
			target: 'Write the intro'
		});
		expect(toolLine('web_search', '{"query":"expo 58"}').verb).toBe('Searching the web');
		expect(toolLine('mystery_tool', 'not json')).toEqual({
			verb: 'Mystery tool',
			target: null
		});
	});

	it('trims long targets', () => {
		const long = 'x'.repeat(80);
		expect(toolLine('search_onto_documents', { query: long }).target).toHaveLength(60);
	});
});

describe('createBearerFetch', () => {
	it("makes the core's relative, cookie requests absolute bearer requests", async () => {
		const inner = vi.fn(async () => new Response('{}', { status: 200 }));
		const bearer = createBearerFetch({
			baseUrl: 'https://build-os.com/',
			getAccessToken: async () => 'tok',
			fetchImpl: inner as unknown as typeof fetch
		});
		await bearer('/api/agent/v2/turns/t1/reconcile?after=3', {
			method: 'GET',
			headers: { Accept: 'application/json' },
			credentials: 'same-origin'
		});
		const [url, init] = inner.mock.calls[0] as unknown as [string, RequestInit];
		expect(url).toBe('https://build-os.com/api/agent/v2/turns/t1/reconcile?after=3');
		expect(init.credentials).toBe('omit');
		expect((init.headers as Headers).get('authorization')).toBe('Bearer tok');
		expect((init.headers as Headers).get('accept')).toBe('application/json');
	});

	it('sends no authorization header when signed out', async () => {
		const inner = vi.fn(async () => new Response('{}', { status: 401 }));
		const bearer = createBearerFetch({
			baseUrl: 'https://build-os.com',
			getAccessToken: async () => null,
			fetchImpl: inner as unknown as typeof fetch
		});
		await bearer('https://build-os.com/api/x');
		const [url, init] = inner.mock.calls[0] as unknown as [string, RequestInit];
		expect(url).toBe('https://build-os.com/api/x');
		expect((init.headers as Headers).has('authorization')).toBe(false);
	});
});

describe('chat context', () => {
	it('builds the admission context and project-wide focus the web sends', () => {
		const project = { type: 'project', projectId: 'p1', projectName: 'Fading Crown' } as const;
		expect(turnContextFor(GLOBAL_TARGET)).toEqual({
			type: 'global',
			entityId: null,
			projectId: null
		});
		expect(turnContextFor(project)).toEqual({
			type: 'project',
			entityId: 'p1',
			projectId: 'p1'
		});
		expect(projectFocusFor(GLOBAL_TARGET)).toBeNull();
		expect(projectFocusFor(project)).toMatchObject({
			focusType: 'project-wide',
			projectId: 'p1',
			projectName: 'Fading Crown'
		});
		expect(targetLabel(GLOBAL_TARGET)).toBe('Workspace');
		expect(targetLabel(project)).toBe('Fading Crown');
	});

	it('round-trips through route params', () => {
		const project = { type: 'project', projectId: 'p1', projectName: 'Fading Crown' } as const;
		expect(parseTargetParams(targetParams(project))).toEqual(project);
		expect(parseTargetParams(targetParams(GLOBAL_TARGET))).toEqual(GLOBAL_TARGET);
		expect(parseTargetParams({ context: 'project' })).toEqual(GLOBAL_TARGET);
	});
});

describe('newChatId', () => {
	it('is short, prefixed and unique', () => {
		const a = newChatId('turn');
		const b = newChatId('turn');
		expect(a).toMatch(/^turn_[0-9a-z]+_[0-9a-z]+$/);
		expect(a).not.toBe(b);
		expect(a.length).toBeLessThan(40);
	});
});
