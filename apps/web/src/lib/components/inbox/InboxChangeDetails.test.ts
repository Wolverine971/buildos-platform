// apps/web/src/lib/components/inbox/InboxChangeDetails.test.ts
// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import InboxChangeDetails from './InboxChangeDetails.svelte';

describe('InboxChangeDetails', () => {
	afterEach(cleanup);

	it('does not present preview-only findings as zero proposed changes', () => {
		render(InboxChangeDetails, {
			props: {
				verifiedChangeSummary: null
			}
		});

		expect(screen.queryByText(/proposed change/i)).not.toBeInTheDocument();
	});

	it('renders only current server-resolved target and destination names', async () => {
		render(InboxChangeDetails, {
			props: {
				verifiedChangeSummary: {
					headline:
						'Move "The Mirror Moment — Current Title" under "Mood Board Carousel Strategy — Current Title".',
					operation_count: 1,
					structural_fingerprint: 'fingerprint',
					verified_at: '2026-08-13T12:00:00.000Z',
					operations: [
						{
							key: 'move_document_in_tree:doc-1:0',
							action: 'move',
							actionLabel: 'Move',
							entityLabel: 'document',
							target: 'The Mirror Moment — Current Title',
							summary:
								'Move "The Mirror Moment — Current Title" under "Mood Board Carousel Strategy — Current Title".',
							changes: [
								{ label: 'Current location', value: 'Top level' },
								{
									label: 'New location',
									value: 'Mood Board Carousel Strategy — Current Title'
								}
							]
						}
					]
				}
			}
		});

		await fireEvent.click(screen.getByRole('button', { name: /show 1 proposed change/i }));

		expect(screen.getAllByText('The Mirror Moment — Current Title').length).toBeGreaterThan(0);
		expect(
			screen.getByText('Mood Board Carousel Strategy — Current Title')
		).toBeInTheDocument();
		expect(screen.queryByText(/wrong model label/i)).not.toBeInTheDocument();
	});
});
