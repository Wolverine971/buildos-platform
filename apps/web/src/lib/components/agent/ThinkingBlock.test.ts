// apps/web/src/lib/components/agent/ThinkingBlock.test.ts
// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import ThinkingBlock from './ThinkingBlock.svelte';
import type { ActivityEntry, ThinkingBlockMessage } from './agent-chat.types';

const source = readFileSync(
	resolve(process.cwd(), 'src/lib/components/agent/ThinkingBlock.svelte'),
	'utf8'
);

function activity(index: number): ActivityEntry {
	return {
		id: `activity-${index}`,
		content: `Tool activity ${index}`,
		timestamp: new Date(`2026-08-27T12:00:0${index}.000Z`),
		activityType: 'tool_call',
		status: 'completed'
	};
}

function thinkingBlock(): ThinkingBlockMessage {
	return {
		id: 'thinking-1',
		type: 'thinking_block',
		content: 'Building the response',
		timestamp: new Date('2026-08-27T12:00:00.000Z'),
		activities: [1, 2, 3, 4].map(activity),
		status: 'active',
		isCollapsed: false
	};
}

describe('ThinkingBlock', () => {
	afterEach(cleanup);

	it('keeps the compact and expanded log states accessible', async () => {
		render(ThinkingBlock, {
			props: {
				block: thinkingBlock(),
				onToggleCollapse: vi.fn()
			}
		});

		const log = screen.getByRole('log', { name: 'BuildOS thinking log' });
		const showMore = screen.getByRole('button', { name: 'Show more activity' });

		expect(log).not.toHaveClass('thinking-log-expanded');
		expect(showMore).toHaveAttribute('aria-expanded', 'false');

		await fireEvent.click(showMore);

		expect(log).toHaveClass('thinking-log-expanded');
		expect(screen.getByRole('button', { name: 'Show less activity' })).toHaveAttribute(
			'aria-expanded',
			'true'
		);
	});

	it('does not animate layout ceilings or spacing', () => {
		expect(source).not.toMatch(/\b(?:max-height|max-width|padding|border-width)\s+\d+ms\b/);
		expect(source).toContain('grid-template-rows: 0fr');
		expect(source).toContain('grid-template-rows: 1fr');
		expect(source).toContain('transition: transform 160ms');
	});

	it('disables the replacement disclosure motion for reduced motion', () => {
		const reducedMotion = source.slice(
			source.indexOf('@media (prefers-reduced-motion: reduce)')
		);

		expect(reducedMotion).toContain('.activity-count-badge');
		expect(reducedMotion).toContain('.thinking-body');
		expect(reducedMotion).toContain('.thinking-log-chevron');
		expect(reducedMotion).toContain('transition: none');
	});
});
