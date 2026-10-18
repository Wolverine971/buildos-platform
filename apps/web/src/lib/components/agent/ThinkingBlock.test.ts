// apps/web/src/lib/components/agent/ThinkingBlock.test.ts
// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { CHAT_WORKFLOW_PROTOTYPE_VERSION, type ChatWorkflowProgress } from '@buildos/shared-types';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import ThinkingBlock from './ThinkingBlock.svelte';
import type { ActivityEntry, ThinkingBlockMessage } from './agent-chat.types';
import { workflowProjectionFixture } from './agent-chat-workflow.fixture';

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

	it('says Stopping… while a stop is pending, with or without an activity log', async () => {
		const compact = { ...thinkingBlock(), activities: [], stopRequested: true };
		const view = render(ThinkingBlock, { block: compact, onToggleCollapse: vi.fn() });
		expect(screen.getByTestId('thinking-live-status').textContent).toContain('Stopping…');

		await view.rerender({ block: { ...thinkingBlock(), stopRequested: true } });
		expect(screen.getByText('Stopping…')).toBeInTheDocument();

		await view.rerender({
			block: { ...thinkingBlock(), stopRequested: true, status: 'cancelled' }
		});
		expect(screen.queryByText('Stopping…')).toBeNull();
	});

	it('renders a durable workflow result restored into ordinary chat activities', () => {
		const workflow = workflowProjectionFixture({
			phase: 'finished',
			terminalOutcome: 'partial'
		});
		workflow.steps[1]!.status = 'accepted';
		workflow.steps[1]!.acceptedFinding = { summary: 'Saved specialist finding', evidence: [] };
		const block = thinkingBlock();
		block.status = 'completed';
		block.activities = [{ ...activity(1), metadata: { workflow } }];
		render(ThinkingBlock, { block, onToggleCollapse: vi.fn() });
		expect(screen.getByText('Partial review ready')).toBeInTheDocument();
		expect(screen.getByText('Saved specialist finding')).toBeInTheDocument();
		expect(screen.queryByRole('log')).toBeNull();
	});

	it('restores specialist findings from durable activity metadata and shows unfinished work as stopped', async () => {
		const progress: ChatWorkflowProgress = {
			version: CHAT_WORKFLOW_PROTOTYPE_VERSION,
			steps: [
				{ id: 'context', label: 'Gather context', status: 'completed' },
				{ id: 'plan', label: 'Plan review', status: 'completed' },
				{
					id: 'analyst',
					label: 'Project analyst',
					status: 'completed',
					result: '<script>unsafe</script> Book the venue.'
				},
				{ id: 'reviewer', label: 'Risk reviewer', status: 'running' },
				{ id: 'answer', label: 'Combine', status: 'pending' }
			]
		};
		const block = thinkingBlock();
		block.status = 'cancelled';
		block.activities = [{ ...activity(1), metadata: { workflow: progress } }];
		const { container } = render(ThinkingBlock, {
			props: { block, onToggleCollapse: vi.fn() }
		});
		expect(screen.getByText('Review stopped')).toBeInTheDocument();
		expect(screen.getAllByText('stopped')).toHaveLength(2);
		expect(screen.getByText('<script>unsafe</script> Book the venue.')).toBeInTheDocument();
		expect(container.querySelector('script')).toBeNull();
		expect(screen.queryByRole('log')).toBeNull();
	});

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

	it('shows the live status as the only header text and crossfades changes', async () => {
		const block: ThinkingBlockMessage = {
			...thinkingBlock(),
			activities: [],
			content: 'Thinking…'
		};
		const { rerender } = render(ThinkingBlock, {
			props: { block, onToggleCollapse: vi.fn() }
		});

		const status = screen.getByTestId('thinking-live-status');
		expect(status).toHaveTextContent('Thinking…');
		expect(status.querySelector('.thinking-status-out')).toBeNull();

		await rerender({ block: { ...block, content: 'Writing the response…' } });

		const incoming = status.querySelector('.thinking-status-in');
		const outgoing = status.querySelector('.thinking-status-out');
		expect(incoming).toHaveTextContent('Writing the response…');
		expect(outgoing).toHaveTextContent('Thinking…');
		expect(outgoing).toHaveAttribute('aria-hidden', 'true');
	});

	it('never says "thinking" twice while a reply starts', () => {
		const { container } = render(ThinkingBlock, {
			props: {
				block: { ...thinkingBlock(), activities: [], content: 'Thinking…' },
				onToggleCollapse: vi.fn()
			}
		});
		const header = container.querySelector('.thinking-header')?.textContent ?? '';
		expect(header.match(/thinking/gi)).toHaveLength(1);
		expect(header).not.toContain('BuildOS');
	});

	it('prints one ellipsis style for server status copy', () => {
		render(ThinkingBlock, {
			props: {
				block: { ...thinkingBlock(), activities: [], content: 'Working...' },
				onToggleCollapse: vi.fn()
			}
		});
		expect(screen.getByTestId('thinking-live-status')).toHaveTextContent('Working…');
	});

	it('renders tool steps as verb, target, and what they found, and heads with the running one', () => {
		const block: ThinkingBlockMessage = {
			...thinkingBlock(),
			activities: [
				{
					id: 'goals',
					content: 'Listed goals: "Cadre Internal"',
					timestamp: new Date(),
					activityType: 'tool_call',
					status: 'completed',
					metadata: {
						line: { verb: 'Listed goals', target: 'Cadre Internal', tone: 'done' },
						outcome: '3 goals'
					}
				},
				{
					id: 'search',
					content: 'Searching projects: "Cadre"',
					timestamp: new Date(),
					activityType: 'tool_call',
					status: 'pending',
					metadata: {
						line: {
							verb: 'Searching projects',
							target: 'Cadre',
							quoted: true,
							tone: 'pending'
						}
					}
				},
				{
					id: 'choice',
					content:
						'Needs your choice to nest project: "Cadre Internal → Wayne Strategies"',
					timestamp: new Date(),
					activityType: 'tool_call',
					status: 'completed',
					metadata: {
						line: {
							verb: 'Needs your choice to nest project',
							target: 'Cadre Internal → Wayne Strategies',
							tone: 'awaiting'
						}
					}
				}
			]
		};
		const { container } = render(ThinkingBlock, {
			props: { block, onToggleCollapse: vi.fn() }
		});

		expect(screen.getByTestId('thinking-live-status')).toHaveTextContent('Searching projects…');
		expect(screen.getByText('3 steps')).toBeInTheDocument();
		const rows = [...container.querySelectorAll('[data-step-tone]')];
		expect(rows.map((row) => row.getAttribute('data-step-tone'))).toEqual([
			'done',
			'pending',
			'awaiting'
		]);
		expect(rows[0]).toHaveTextContent('Listed goals · Cadre Internal');
		expect(rows[0]).toHaveTextContent('3 goals');
		expect(rows[1]).toHaveTextContent('Searching projects · “Cadre”');
		expect(rows[2]).toHaveTextContent('Needs your choice to nest project');
		expect(rows[2]?.textContent?.match(/Needs your choice/g)).toHaveLength(1);
	});

	it('stops repeating a status row in the header once a later step finished it', () => {
		const block: ThinkingBlockMessage = {
			...thinkingBlock(),
			content: 'Checking the requested change...',
			activities: [
				{
					id: 'review',
					content: 'Checking the requested change...',
					timestamp: new Date(),
					activityType: 'state_change',
					metadata: { activityVisibility: 'activity_log' }
				},
				{
					id: 'combine',
					content: 'Checked combining projects',
					timestamp: new Date(),
					activityType: 'tool_call',
					status: 'completed',
					metadata: { line: { verb: 'Checked combining projects', tone: 'done' } }
				}
			]
		};
		const { container } = render(ThinkingBlock, {
			props: { block, onToggleCollapse: vi.fn() }
		});
		expect(screen.getByTestId('thinking-live-status')).toHaveTextContent('Working…');
		const rows = [...container.querySelectorAll('[data-step-tone]')];
		expect(rows[0]).toHaveAttribute('data-step-tone', 'done');
		expect(rows[0]).toHaveTextContent('Checking the requested change');
		expect(rows[0]?.textContent).not.toContain('…');
	});

	it('sums up a finished turn by its time and step count', () => {
		const started = new Date('2026-10-17T22:08:02.000Z');
		render(ThinkingBlock, {
			props: {
				block: {
					...thinkingBlock(),
					status: 'completed',
					timestamp: started,
					completedAt: new Date(started.getTime() + 55_000)
				},
				onToggleCollapse: vi.fn()
			}
		});
		expect(screen.getByText('Worked for 55s')).toBeInTheDocument();
		expect(screen.getByText('4 steps')).toBeInTheDocument();
		expect(screen.queryByTestId('thinking-live-status')).toBeNull();
	});

	it('labels a finished turn without tools by its time, with no filler detail', () => {
		const started = new Date('2026-10-17T22:08:02.000Z');
		const { container } = render(ThinkingBlock, {
			props: {
				block: {
					...thinkingBlock(),
					activities: [],
					status: 'completed',
					content: 'Complete',
					timestamp: started,
					completedAt: new Date(started.getTime() + 4_200)
				},
				onToggleCollapse: vi.fn()
			}
		});
		expect(container.querySelector('.thinking-header')).toHaveTextContent(/^Thought for 4s$/);
	});

	it('pulses the hammer with compositor-only properties and no radius transition', () => {
		const hammer = source.slice(source.indexOf('@keyframes thinking-hammer-pulse'));
		expect(source).not.toContain('text-shadow');
		expect(source).not.toMatch(/border-radius\s+\d+ms/);
		expect(hammer.slice(0, hammer.indexOf('.thinking-hammer {'))).toMatch(
			/opacity[\s\S]*transform/
		);
	});

	it('does not animate layout ceilings or spacing', () => {
		expect(source).not.toMatch(
			/\b(?:grid-template-rows|max-height|max-width|padding|border-width)\s+\d+ms\b/
		);
		expect(source).toContain('grid-template-rows: 0fr');
		expect(source).toContain('grid-template-rows: 1fr');
		expect(source).toContain('transition: transform 160ms');
	});

	it('disables the replacement disclosure motion for reduced motion', () => {
		const reducedMotion = source.slice(
			source.indexOf('@media (prefers-reduced-motion: reduce)')
		);

		expect(reducedMotion).toContain('.activity-count-badge');
		expect(reducedMotion).toContain('.thinking-log-chevron');
		expect(reducedMotion).toContain('.thinking-status-in');
		expect(reducedMotion).toContain('.thinking-hammer');
		expect(reducedMotion).toContain('transition: none');
	});
});
