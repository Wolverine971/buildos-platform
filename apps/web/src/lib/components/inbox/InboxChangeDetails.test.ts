// apps/web/src/lib/components/inbox/InboxChangeDetails.test.ts
// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import InboxChangeDetails from './InboxChangeDetails.svelte';

describe('InboxChangeDetails', () => {
	afterEach(cleanup);

	it('does not present preview-only findings as zero proposed changes', () => {
		render(InboxChangeDetails, {
			props: {
				operations: [],
				preview: {
					summary: 'The project has drifted from its stated goal.',
					before: ['Goal exists without supporting work'],
					after: ['Choose whether to keep the goal active'],
					impact: 'The project needs a decision, not an automatic mutation.'
				}
			}
		});

		expect(screen.queryByText(/proposed change/i)).not.toBeInTheDocument();
	});
});
