// apps/web/src/routes/projects/[id]/ProjectRecentChats.test.ts
// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ProjectRecentChats from './ProjectRecentChats.svelte';

const PROJECT_ID = '11111111-1111-4111-8111-111111111111';

beforeEach(() => {
	vi.stubGlobal(
		'fetch',
		vi.fn(
			async () =>
				new Response(
					JSON.stringify({
						success: true,
						data: {
							chats: [
								{
									id: 'chat-1',
									title: 'Launch positioning review',
									summary:
										'Compared the launch narrative with customer research.',
									chat_topics: ['positioning'],
									context_type: 'project',
									entity_id: PROJECT_ID,
									message_count: 8,
									status: 'completed',
									focus_label: 'Launch plan',
									focus_type: 'plan',
									created_at: '2026-08-20T10:00:00.000Z',
									updated_at: '2026-08-20T11:00:00.000Z',
									last_message_at: '2026-08-20T11:00:00.000Z',
									last_activity_at: '2026-08-20T11:00:00.000Z'
								}
							],
							total: 1,
							hasMore: false
						}
					}),
					{ status: 200, headers: { 'Content-Type': 'application/json' } }
				)
		)
	);
});

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

describe('ProjectRecentChats', () => {
	it('summarizes and reopens a saved project conversation', async () => {
		const onOpenChat = vi.fn();
		render(ProjectRecentChats, { props: { projectId: PROJECT_ID, onOpenChat } });

		const reopen = await screen.findByRole('button', {
			name: 'Reopen chat: Launch positioning review'
		});
		expect(
			screen.getByText('Compared the launch narrative with customer research.')
		).toBeInTheDocument();
		expect(screen.getByText(/Launch plan/)).toBeInTheDocument();

		await fireEvent.click(reopen);
		expect(onOpenChat).toHaveBeenCalledWith('chat-1');
	});
});
