// apps/web/src/lib/components/inbox/InboxFindingControls.test.ts
// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import InboxFindingControls from './InboxFindingControls.svelte';

describe('InboxFindingControls', () => {
	afterEach(cleanup);

	it('uses one decision note for both Address and Dismiss', async () => {
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

		const note = screen.getByLabelText('Decision note');
		const address = screen.getByRole('button', { name: 'Address' });
		const dismiss = screen.getByRole('button', { name: 'Dismiss' });

		expect(address).toBeDisabled();
		await fireEvent.input(note, { target: { value: 'Already covered in the launch plan.' } });
		expect(onNoteChange).toHaveBeenCalledWith('Already covered in the launch plan.');

		await view.rerender({
			idPrefix: 'finding',
			note: '  Already covered in the launch plan.  ',
			onNoteChange,
			onAddress,
			onReject
		});

		expect(address).toBeEnabled();
		await fireEvent.click(address);
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
		expect(screen.getByText('Required to address; optional to dismiss.')).toBeInTheDocument();
	});
});
