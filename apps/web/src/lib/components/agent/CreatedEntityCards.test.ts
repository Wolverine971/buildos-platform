// apps/web/src/lib/components/agent/CreatedEntityCards.test.ts
// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import CreatedEntityCards from './CreatedEntityCards.svelte';

describe('CreatedEntityCards', () => {
	it('shows a saved project receipt with real counts and actionable links', () => {
		render(CreatedEntityCards, {
			entities: [
				{ kind: 'project', id: 'p1', projectId: 'p1', name: 'Launch' },
				{ kind: 'task', id: 't1', projectId: 'p1', name: 'Write brief' },
				{ kind: 'goal', id: 'g1', projectId: 'p1', name: 'First customer' },
				{ kind: 'task', id: 't2', projectId: 'p2', name: 'Unrelated task' }
			]
		});
		expect(screen.getByText('Project saved')).toBeInTheDocument();
		expect(screen.getByText(/Saved in this conversation: 1 goal · 1 task/)).toBeInTheDocument();
		expect(screen.getByRole('link', { name: /Open project/ })).toHaveAttribute(
			'href',
			'/projects/p1'
		);
		expect(screen.getByRole('link', { name: /Open a task/ })).toHaveAttribute(
			'href',
			'/projects/p1?entity=task&entity_id=t1'
		);
	});
	it('does not imply missing tasks or project completion from a partial save', () => {
		render(CreatedEntityCards, {
			entities: [{ kind: 'project', id: 'p1', projectId: 'p1', name: 'Partial project' }]
		});
		expect(screen.getByText('Project saved')).toBeInTheDocument();
		expect(screen.queryByRole('link', { name: /Open a task/ })).toBeNull();
		expect(screen.queryByText(/Saved in this conversation:/)).toBeNull();
	});
	it('retains ordinary entity chips when no project was created', () => {
		render(CreatedEntityCards, {
			entities: [{ kind: 'task', id: 't1', projectId: 'p1', name: 'Write brief' }]
		});
		expect(screen.queryByText('Project saved')).toBeNull();
		expect(screen.getByRole('link')).toHaveAttribute(
			'href',
			'/projects/p1?entity=task&entity_id=t1'
		);
	});
});
