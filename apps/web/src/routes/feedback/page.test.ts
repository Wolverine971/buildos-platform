// apps/web/src/routes/feedback/page.test.ts
// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import FeedbackPage from './+page.svelte';

afterEach(() => cleanup());

describe('/feedback', () => {
	it('keeps submission disabled until the required feedback is ready', async () => {
		render(FeedbackPage);

		const submit = screen.getByRole('button', { name: 'Send feedback' });
		expect(
			screen.getByRole('heading', { level: 1, name: 'Help shape BuildOS' })
		).toBeInTheDocument();
		expect(submit).toBeDisabled();

		await fireEvent.click(screen.getByRole('radio', { name: /Feature request/ }));
		await fireEvent.input(screen.getByRole('textbox', { name: /What should we know/ }), {
			target: { value: 'A clearer weekly planning view would help.' }
		});

		expect(submit).toBeEnabled();
	});

	it('exposes a visible rating state through native radios', async () => {
		render(FeedbackPage);

		const fourStars = screen.getByRole('radio', { name: '4 out of 5' });
		await fireEvent.click(fourStars);

		expect(fourStars).toBeChecked();
		expect(screen.getByText('Great')).toBeInTheDocument();
	});

	it('shows linked validation feedback for an invalid reply email', async () => {
		render(FeedbackPage);

		const email = screen.getByRole('textbox', { name: /Email for a reply/ });
		await fireEvent.input(email, { target: { value: 'not-an-email' } });
		await fireEvent.blur(email);

		expect(email).toHaveAttribute('aria-invalid', 'true');
		expect(screen.getByRole('alert')).toHaveTextContent(/valid email/i);
	});
});
