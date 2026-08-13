// apps/web/src/lib/components/inbox/InboxDecisionControls.test.ts
// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import InboxDecisionControls from './InboxDecisionControls.svelte';

describe('InboxDecisionControls', () => {
	afterEach(cleanup);

	it('names the proposed-change and discussion actions explicitly', () => {
		render(InboxDecisionControls, {
			props: {
				canChat: true,
				onApprove: vi.fn(),
				onChat: vi.fn()
			}
		});

		expect(screen.getByRole('button', { name: 'Approve change' })).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Discuss' })).toBeInTheDocument();
		expect(screen.queryByRole('button', { name: 'Accept' })).not.toBeInTheDocument();
	});
});
