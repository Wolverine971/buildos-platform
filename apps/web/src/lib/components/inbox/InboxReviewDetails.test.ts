// apps/web/src/lib/components/inbox/InboxReviewDetails.test.ts
// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import InboxReviewDetails from './InboxReviewDetails.svelte';

describe('InboxReviewDetails', () => {
	afterEach(cleanup);

	it('keeps provenance, context, and evidence behind one native disclosure', async () => {
		render(InboxReviewDetails, {
			props: {
				metadata: ['Project review', 'Drift', 'Reviewed Aug 13'],
				summary: 'The active plan still references an old launch date.',
				evidence: ['Doc: Launch plan']
			}
		});

		const disclosure = screen.getByText('Details').closest('summary');
		expect(disclosure).not.toBeNull();
		expect(screen.getByText('Project review · Drift · Reviewed Aug 13')).not.toBeVisible();

		await fireEvent.click(disclosure!);

		expect(screen.getByText('Project review · Drift · Reviewed Aug 13')).toBeVisible();
		expect(screen.getByText('Doc: Launch plan')).toBeVisible();
	});
});
