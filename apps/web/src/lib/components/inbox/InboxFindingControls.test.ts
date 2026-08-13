// apps/web/src/lib/components/inbox/InboxFindingControls.test.ts
// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import InboxFindingControls from './InboxFindingControls.svelte';

describe('InboxFindingControls', () => {
	afterEach(cleanup);

	it('uses one response for both Mark handled and Dismiss', async () => {
		const onNoteChange = vi.fn();
		const onAddress = vi.fn();
		const onReject = vi.fn();
		const view = render(InboxFindingControls, {
			props: {
				idPrefix: 'finding',
				onNoteChange,
				onAddress,
				onReject
			}
		});

		const note = screen.getByLabelText('Your response');
		const markHandled = screen.getByRole('button', { name: 'Mark handled' });
		const dismiss = screen.getByRole('button', { name: 'Dismiss' });

		expect(markHandled).toBeDisabled();
		await fireEvent.input(note, { target: { value: 'Already covered in the launch plan.' } });
		expect(onNoteChange).toHaveBeenCalledWith('Already covered in the launch plan.');

		await view.rerender({
			idPrefix: 'finding',
			note: '  Already covered in the launch plan.  ',
			onNoteChange,
			onAddress,
			onReject
		});

		expect(markHandled).toBeEnabled();
		await fireEvent.click(markHandled);
		await fireEvent.click(dismiss);

		expect(onAddress).toHaveBeenCalledWith('Already covered in the launch plan.');
		expect(onReject).toHaveBeenCalledWith('Already covered in the launch plan.');
	});

	it('allows a dismissal without a note', async () => {
		const onReject = vi.fn();
		render(InboxFindingControls, {
			props: {
				idPrefix: 'finding',
				onReject
			}
		});

		await fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));

		expect(onReject).toHaveBeenCalledWith('');
		expect(
			screen.getByText('Required to mark handled; optional as a dismissal note.')
		).toBeInTheDocument();
	});

	it('uses decision-shaped labels for response and follow-up actions', () => {
		render(InboxFindingControls, {
			props: {
				idPrefix: 'finding',
				note: 'I will update the launch plan.',
				canChat: true,
				onAddress: vi.fn(),
				onChat: vi.fn()
			}
		});

		expect(screen.getByRole('button', { name: 'Mark handled' })).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Discuss' })).toBeInTheDocument();
		expect(screen.queryByRole('button', { name: 'Address' })).not.toBeInTheDocument();
		expect(screen.queryByRole('button', { name: 'Respond' })).not.toBeInTheDocument();
	});
});
