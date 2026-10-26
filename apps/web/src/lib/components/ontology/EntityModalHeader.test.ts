// apps/web/src/lib/components/ontology/EntityModalHeader.test.ts
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import EntityModalHeader from './EntityModalHeader.svelte';

const icon = createRawSnippet(() => ({ render: () => '<svg aria-label="Task" role="img"></svg>' }));

afterEach(cleanup);

describe('EntityModalHeader', () => {
	it('renders the entity identity as an accessible heading and updates it when renamed', async () => {
		const view = render(EntityModalHeader, { title: 'Prepare the launch', icon });
		expect(
			screen.getByRole('heading', { level: 2, name: 'Prepare the launch' })
		).toBeInTheDocument();
		expect(screen.getByRole('img', { name: 'Task' })).toBeInTheDocument();
		expect(screen.queryByRole('button')).not.toBeInTheDocument();
		await view.rerender({ title: 'Publish the launch', icon });
		expect(
			screen.getByRole('heading', { level: 2, name: 'Publish the launch' })
		).toBeInTheDocument();
		expect(
			screen.queryByRole('heading', { name: 'Prepare the launch' })
		).not.toBeInTheDocument();
	});

	it('exposes optional actions without changing the heading or swallowing interaction', async () => {
		const onClose = vi.fn();
		const actions = createRawSnippet(() => ({
			render: () => '<button type="button">Close task</button>',
			setup: (element) => {
				element.addEventListener('click', onClose);
				return () => element.removeEventListener('click', onClose);
			}
		}));
		render(EntityModalHeader, { title: 'Prepare the launch', icon, actions });
		await fireEvent.click(screen.getByRole('button', { name: 'Close task' }));
		expect(onClose).toHaveBeenCalledOnce();
		expect(screen.getByRole('heading', { name: 'Prepare the launch' })).toBeInTheDocument();
	});
});
