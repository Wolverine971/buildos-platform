// apps/web/src/lib/components/agent/WorkflowProgressCard.test.ts
// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import WorkflowProgressCard from './WorkflowProgressCard.svelte';
import { workflowProjectionFixture } from './agent-chat-workflow.fixture';

afterEach(cleanup);

describe('WorkflowProgressCard durable progress', () => {
	it.each([
		['preparing', 'Preparing your project review'],
		['assessing', 'Planning the project review'],
		['executing', 'Reviewing your project'],
		['synthesizing', 'Combining recommendations']
	] as const)('shows the %s phase before any terminal outcome', (phase, title) => {
		render(WorkflowProgressCard, {
			progress: workflowProjectionFixture({ phase }),
			status: 'active'
		});
		expect(screen.getByRole('status')).toHaveTextContent(title);
		expect(screen.queryByText('Project review ready')).toBeNull();
	});

	it('restores saved findings, partial specialist coverage, and safe evidence labels', () => {
		const progress = workflowProjectionFixture({ phase: 'executing' });
		progress.steps[1] = {
			...progress.steps[1]!,
			status: 'accepted',
			quality: 'partial',
			acceptedFinding: {
				summary: '<script>unsafe</script> Book the venue.',
				evidence: [
					{ kind: 'project_record', id: 'task-1', version: 'v1', label: 'Venue task' }
				]
			}
		};
		progress.steps[2]!.status = 'claimed';
		const { container } = render(WorkflowProgressCard, { progress, status: 'active' });
		expect(screen.getByText('View findings')).toBeInTheDocument();
		expect(screen.getByText('<script>unsafe</script> Book the venue.')).toBeInTheDocument();
		expect(screen.getByText('Sources: Venue task')).toBeInTheDocument();
		expect(screen.getByText('partial')).toBeInTheDocument();
		expect(screen.getByText('running')).toBeInTheDocument();
		expect(container.querySelector('script')).toBeNull();
	});

	it.each([
		['complete', 'Project review ready'],
		['partial', 'Partial review ready'],
		['cancelled', 'Review stopped'],
		['failed', 'Review failed']
	] as const)(
		'uses the %s outcome even when the editor remains claimed',
		(terminalOutcome, title) => {
			const progress = workflowProjectionFixture({ phase: 'finished', terminalOutcome });
			progress.steps[3]!.status = 'claimed';
			if (terminalOutcome === 'complete') progress.answer.status = 'accepted';
			render(WorkflowProgressCard, { progress, status: 'active' });
			expect(screen.getByRole('status')).toHaveTextContent(title);
			const editor = screen.getByText('Combine recommendations').closest('li')!;
			expect(within(editor).queryByText('running')).toBeNull();
			expect(
				within(editor).getByText(
					terminalOutcome === 'complete'
						? 'completed'
						: terminalOutcome === 'cancelled'
							? 'stopped'
							: 'not completed'
				)
			).toBeInTheDocument();
		}
	);

	it('does not infer a successful review from a completed thinking block or accepted editor', () => {
		const progress = workflowProjectionFixture({ phase: 'finished' });
		progress.steps[3]!.status = 'accepted';
		render(WorkflowProgressCard, { progress, status: 'completed' });
		expect(screen.getByRole('status')).toHaveTextContent('Review incomplete');
		expect(screen.queryByText('Project review ready')).toBeNull();
	});

	it('explains missing coverage for a partial result without losing the saved finding', () => {
		const progress = workflowProjectionFixture({
			phase: 'finished',
			terminalOutcome: 'partial',
			coverageGap: 'The risk reviewer did not finish.'
		});
		progress.steps[1]!.status = 'accepted';
		progress.steps[1]!.acceptedFinding = {
			summary: 'The venue is the next dependency.',
			evidence: []
		};
		render(WorkflowProgressCard, { progress, status: 'completed' });
		expect(screen.getByText('The risk reviewer did not finish.')).toBeInTheDocument();
		expect(screen.getByText('The venue is the next dependency.')).toBeInTheDocument();
		expect(screen.getByRole('status')).toHaveTextContent('Partial review ready');
	});

	it('distinguishes recovery from a stopped review', async () => {
		const progress = workflowProjectionFixture({ phase: 'executing' });
		progress.transport.executionState = 'recovering';
		progress.steps[1]!.status = 'claimed';
		const { rerender } = render(WorkflowProgressCard, { progress, status: 'interrupted' });
		expect(screen.getByRole('status')).toHaveTextContent('Resuming project review');
		expect(screen.getByText('Resuming from saved progress.')).toBeInTheDocument();
		expect(screen.getByText('resuming')).toBeInTheDocument();
		await rerender({
			progress: { ...progress, phase: 'finished', terminalOutcome: 'cancelled' },
			status: 'cancelled'
		});
		expect(screen.getByRole('status')).toHaveTextContent('Review stopped');
		expect(screen.queryByText('Resuming from saved progress.')).toBeNull();
	});
});
