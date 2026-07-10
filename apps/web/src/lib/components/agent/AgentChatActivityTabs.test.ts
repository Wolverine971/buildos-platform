// apps/web/src/lib/components/agent/AgentChatActivityTabs.test.ts
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import AgentChatActivityTabs from './AgentChatActivityTabs.svelte';
import type { AgentTimelineItem } from './agent-chat.types';

function changeItem(index: number): AgentTimelineItem {
	return {
		id: `change-${index}`,
		sessionId: 'session-1',
		source: 'entity_change',
		kind: 'change',
		status: 'completed',
		timestamp: '2026-07-10T12:00:00.000Z',
		title: `Change ${index}`,
		entityRefs: []
	};
}

describe('AgentChatActivityTabs', () => {
	afterEach(() => {
		cleanup();
	});

	it('renders the mobile tab strip as four equal columns without horizontal scrolling', () => {
		const { container } = render(AgentChatActivityTabs, {
			props: {
				activeTab: 'chat',
				timelineItems: [],
				onTabChange: vi.fn()
			}
		});

		const tablist = screen.getByRole('tablist', { name: 'Agent chat views' });
		expect(tablist).toHaveClass('grid', 'grid-cols-4');
		expect(container.querySelectorAll('[role="tab"]')).toHaveLength(4);
	});

	it('caps the visible count while preserving the exact count for assistive text', async () => {
		const onTabChange = vi.fn();
		render(AgentChatActivityTabs, {
			props: {
				activeTab: 'chat',
				timelineItems: Array.from({ length: 105 }, (_, index) => changeItem(index)),
				onTabChange
			}
		});

		const changesTab = screen.getByRole('tab', { name: 'Changes, 105 entries' });
		expect(changesTab).toHaveTextContent('99+');

		await fireEvent.click(changesTab);
		expect(onTabChange).toHaveBeenCalledWith('changes');
	});
});
