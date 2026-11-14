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

	it('groups steps into project cards with what the finder pulled in', () => {
		const tool = (id: string, args: Record<string, unknown>): ActivityEntry => ({
			id,
			content: `Ran ${id}`,
			timestamp: new Date('2026-11-05T12:00:01.000Z'),
			activityType: 'tool_call',
			status: 'completed',
			metadata: {
				toolName: id,
				arguments: args,
				line: { verb: `Ran ${id}`, tone: 'done', text: id }
			}
		});
		const block: ThinkingBlockMessage = {
			id: 'thinking-cards',
			type: 'thinking_block',
			content: 'Complete',
			timestamp: new Date('2026-11-05T12:00:00.000Z'),
			completedAt: new Date('2026-11-05T12:00:06.000Z'),
			status: 'completed',
			isCollapsed: false,
			activities: [
				{
					id: 'selection',
					content: 'Context picked',
					timestamp: new Date('2026-11-05T12:00:00.500Z'),
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
							project_id: 'p-wayne',
							workspace: null,
							projects: [],
							items: [
								{
									kind: 'document',
									id: 'd',
									label: 'Worklist',
									tier: 'full',
									sections: []
								},
								{
									kind: 'task',
									id: 'g',
									label: 'Griffin',
									tier: 'summary',
									sections: []
								}
							],
							counts: { full: 1, summary: 1, checked: 5 },
							elapsed_ms: 300
						}
					}
				},
				tool('search_tasks', { project_id: 'p-wayne', query: 'Cutlass' }),
				tool('list_goals', { project_id: 'p-other' })
			]
		};
		render(ThinkingBlock, {
			block,
			onToggleCollapse: vi.fn(),
			turnCards: { sessionProject: { id: 'p-wayne', name: 'Wayne Strategies' } }
		});

		const cards = screen.getByTestId('turn-cards');
		expect(cards.textContent).toContain('Wayne Strategies');
		// The ledger says what the model had: a document card and a one-liner, nothing opened.
		const ledger = screen.getByTestId('turn-ledger');
		expect(ledger.textContent).toContain('Looked through 5 · 2 in view · 0 opened');
		expect(ledger.textContent).toContain('Summary and headings only');
		expect(ledger.textContent).toContain('One-line summary only');
		expect(ledger.textContent).toContain('Worklist');
		expect(ledger.textContent).toContain('Griffin');
		expect(cards.textContent).not.toMatch(/pulled in/i);
		expect(cards.textContent).toContain('Another project');
		expect(screen.getByText('2 projects · 2 steps')).toBeTruthy();
		expect(screen.queryByRole('log', { name: 'BuildOS thinking log' })).toBeNull();
	});

	describe('rows only claim what is true now', () => {
		const P = 'p-wayne';
		const session = { sessionProject: { id: P, name: 'Wayne Strategies' } };
		const step = (
			id: string,
			line: Record<string, unknown>,
			metadata: Record<string, unknown> = {},
			status: ActivityEntry['status'] = 'completed'
		): ActivityEntry => ({
			id,
			content: String(line.verb ?? id),
			timestamp: new Date('2026-11-13T12:00:01.000Z'),
			activityType: 'tool_call',
			status,
			toolCallId: id,
			metadata: { toolName: id, arguments: { project_id: P }, line, ...metadata }
		});
		const finished = (activities: ActivityEntry[]): ThinkingBlockMessage => ({
			id: 'thinking-truth',
			type: 'thinking_block',
			content: 'Complete',
			timestamp: new Date('2026-11-13T12:00:00.000Z'),
			completedAt: new Date('2026-11-13T12:00:06.000Z'),
			status: 'completed',
			isCollapsed: false,
			activities
		});
		const docUpdate = {
			affectedEntities: [
				{ kind: 'document', id: 'd1', title: 'Menu', projectId: P, operation: 'updated' }
			],
			result: { document_change: { lines_added: 12, lines_removed: 3 } }
		};

		it('a held change is not badged, not counted, and says it waits on the person', () => {
			render(ThinkingBlock, {
				block: finished([
					step(
						'held',
						{
							verb: 'Needs your choice to update document',
							tone: 'awaiting',
							target: 'Menu'
						},
						{ ...docUpdate, requiresUserAction: true }
					)
				]),
				onToggleCollapse: vi.fn(),
				turnCards: session
			});
			const row = document.querySelector('[data-step-slot="held"]')!;
			expect(row.getAttribute('data-step-tone')).toBe('awaiting');
			expect(row.textContent).toContain('Needs your choice to update document');
			expect(row.querySelector('.step-action')).toBeNull();
			expect(row.textContent).not.toContain('+12');
			// Nothing was saved, so the header keeps the step count and the ledger shows no change.
			expect(document.querySelector('.activity-count-badge')?.textContent).toBe('1 step');
			expect(screen.queryByTestId('turn-ledger')).toBeNull();
		});

		it('an undone change reads Undone and leaves the receipt; an approved one reads Updated', async () => {
			const block = finished([
				step(
					'saved',
					{ verb: 'Updated document', tone: 'done', target: 'Menu' },
					docUpdate
				),
				step(
					'held',
					{
						verb: 'Needs your choice to update document',
						tone: 'awaiting',
						target: 'Menu'
					},
					{ ...docUpdate, requiresUserAction: true }
				)
			]);
			const view = render(ThinkingBlock, {
				block,
				onToggleCollapse: vi.fn(),
				turnCards: session
			});
			expect(screen.getByText('1 updated')).toBeTruthy();
			expect(
				document.querySelector('[data-step-slot="saved"] .step-action')?.textContent
			).toBe('Updated');

			await view.rerender({
				block,
				settled: {
					saved: { state: 'undone', label: 'Undone' },
					held: { state: 'approved', label: 'Updated' }
				}
			});
			const saved = document.querySelector('[data-step-slot="saved"]')!;
			expect(saved.getAttribute('data-step-tone')).toBe('undone');
			expect(saved.querySelector('.step-action')?.textContent).toBe('Undone');
			expect(saved.textContent).not.toContain('+12');
			const held = document.querySelector('[data-step-slot="held"]')!;
			expect(held.getAttribute('data-step-tone')).toBe('done');
			expect(held.querySelector('.step-action')?.textContent).toBe('Updated');
			expect(held.textContent).not.toContain('Needs your choice');
			expect(screen.queryByText('1 updated')).toBeNull();
		});

		it('never links a list to the one record it happened to return', () => {
			render(ThinkingBlock, {
				block: finished([
					step(
						'list',
						{ verb: 'Listed tasks', tone: 'done', target: 'Wayne Strategies' },
						{ result: { tasks: [{ id: 't1', title: 'Send invoice', project_id: P }] } }
					),
					step(
						'open',
						{ verb: 'Read task', tone: 'done', target: 'Send invoice' },
						{ result: { task: { id: 't1', title: 'Send invoice', project_id: P } } }
					)
				]),
				onToggleCollapse: vi.fn(),
				turnCards: session
			});
			const list = document.querySelector('[data-step-slot="list"]')!;
			expect(list.querySelector('a.step-target-link')).toBeNull();
			// The task it returned is still reachable, under its own name.
			expect(list.querySelector('a.record-chip')?.textContent).toContain('Send invoice');
			const open = document.querySelector('[data-step-slot="open"]')!;
			expect(open.querySelector('a.step-target-link')?.textContent).toContain('Send invoice');
		});

		it('says where a brain dump is being filed, and when context could not be checked', () => {
			const selection = (payload: Record<string, unknown>): ActivityEntry => ({
				id: 'sel',
				content: 'Context picked',
				timestamp: new Date('2026-11-13T12:00:00.500Z'),
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
						workspace: null,
						projects: [],
						items: [],
						counts: { full: 0, summary: 0, checked: 0 },
						elapsed_ms: 300,
						...payload
					}
				}
			});
			const view = render(ThinkingBlock, {
				block: finished([
					selection({
						workspace: { scope: 'projects', dig: false, capture: true, checked: 51 },
						projects: [
							{ id: 'p-cadre', name: 'The Cadre', p: 0.8, hop2: 'skipped' },
							{ id: 'p-ws', name: 'Workspace', p: 0.6, hop2: 'skipped' }
						]
					})
				]),
				onToggleCollapse: vi.fn(),
				turnCards: { sessionProject: null }
			});
			expect(screen.getByTestId('turn-picked').textContent).toContain(
				'Filing into: The Cadre · Workspace'
			);
			view.unmount();

			render(ThinkingBlock, {
				block: finished([
					selection({
						project_id: P,
						injected: false,
						status: 'unavailable',
						failure: 'deadline'
					})
				]),
				onToggleCollapse: vi.fn(),
				turnCards: session
			});
			expect(screen.getByTestId('turn-context-line').textContent).toBe(
				"Couldn't check project context this turn (it took too long)"
			);
		});
	});
});
