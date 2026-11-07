// apps/web/src/lib/components/agent/AgentMessageList.continue.test.ts
// @vitest-environment jsdom
// The Continue chip is admin-only, so this file signs in an admin; the main list tests run without one.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { page } from '$app/state';
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import AgentMessageList from './AgentMessageList.svelte';
import type { UIMessage } from './agent-chat.types';

vi.mock('$app/state', () => ({ page: { data: { user: { is_admin: true } } } }));

const at = new Date('2026-11-05T12:00:00Z');

function globalTurn(projects: Array<{ id: string; name: string; p: number }>): UIMessage[] {
	return [
		{ id: 'u1', type: 'user', content: 'Push Griffin to Monday', timestamp: at },
		{
			id: 'b1',
			type: 'thinking_block',
			content: 'Complete',
			timestamp: at,
			status: 'completed',
			activities: [
				{
					id: 'sel',
					content: 'Context picked',
					timestamp: at,
					activityType: 'ontology_loaded',
					metadata: {
						contextSelection: {
							type: 'context_selection',
							version: 1,
							mode: 'on',
							visible: true,
							injected: true,
							status: 'selected',
							failure: null,
							client_turn_id: 'c',
							turn_run_id: 't',
							project_id: null,
							workspace: { scope: 'projects', dig: false, checked: 6 },
							projects: projects.map((project) => ({ ...project, hop2: 'ran' })),
							items: [],
							counts: { full: 0, summary: 0, checked: 0 }
						}
					}
				}
			]
		} as UIMessage,
		{ id: 'a1', type: 'assistant', content: 'Moved Griffin to Monday.', timestamp: at }
	];
}

function props(messages: UIMessage[], onContinueInProject = vi.fn()) {
	return {
		messages,
		onToggleThinkingBlock: vi.fn(),
		onScroll: vi.fn(),
		displayContextLabel: 'Workspace',
		selectedContextType: 'global' as const,
		onContinueInProject
	};
}

describe('Continue in project', () => {
	afterEach(cleanup);

	it('offers the one project a workspace turn was about', async () => {
		const onContinue = vi.fn();
		render(
			AgentMessageList,
			props(globalTurn([{ id: 'p-wayne', name: 'Wayne Strategies', p: 0.9 }]), onContinue)
		);
		await fireEvent.click(screen.getByRole('button', { name: /Continue in Wayne Strategies/ }));
		expect(onContinue).toHaveBeenCalledWith({ id: 'p-wayne', name: 'Wayne Strategies' });
	});

	it('stays hidden when the turn touched several projects', () => {
		render(
			AgentMessageList,
			props(
				globalTurn([
					{ id: 'p-wayne', name: 'Wayne Strategies', p: 0.9 },
					{ id: 'p-9t', name: '9takes', p: 0.8 }
				])
			)
		);
		expect(screen.queryByRole('button', { name: /Continue in/ })).toBeNull();
	});

	it('stays hidden for someone who is not an admin', () => {
		const user = (page.data as { user: { is_admin: boolean } }).user;
		user.is_admin = false;
		try {
			render(
				AgentMessageList,
				props(globalTurn([{ id: 'p-wayne', name: 'Wayne Strategies', p: 0.9 }]))
			);
			expect(screen.queryByRole('button', { name: /Continue in/ })).toBeNull();
		} finally {
			user.is_admin = true;
		}
	});
});
