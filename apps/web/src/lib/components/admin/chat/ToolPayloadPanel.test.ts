// apps/web/src/lib/components/admin/chat/ToolPayloadPanel.test.ts
// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import ToolPayloadPanel from './ToolPayloadPanel.svelte';

afterEach(cleanup);

describe('ToolPayloadPanel', () => {
	it('shows a readable request summary before the full JSON', () => {
		const view = render(ToolPayloadPanel, {
			props: {
				kind: 'request',
				value: '{"query":"read gmail email inbox","group":"email","limit":10}',
				emptyLabel: 'No request recorded.'
			}
		});

		expect(screen.getByText('What the tool received')).toBeInTheDocument();
		expect(screen.getByText('read gmail email inbox')).toBeInTheDocument();
		expect(screen.getByText('email')).toBeInTheDocument();
		expect(view.container.querySelector('details')?.open).toBe(false);
	});

	it('summarizes truncated result previews and keeps the raw preview expandable', async () => {
		const rawPreview =
			'{"type":"tool_search_results","query":"read gmail email inbox","total_matches":3,"matches":[{"op":"email.accounts.list","summary":"List connected accounts","group":"email","kind":"read","entity":"account"}...';
		const view = render(ToolPayloadPanel, {
			props: {
				kind: 'response',
				value: rawPreview,
				emptyLabel: 'No response recorded.'
			}
		});

		expect(screen.getByText('3 results for “read gmail email inbox”')).toBeInTheDocument();
		expect(screen.getByText('email.accounts.list')).toBeInTheDocument();

		await fireEvent.click(screen.getByText('Full response'));
		const disclosure = view.container.querySelector('details');
		expect(disclosure?.open).toBe(true);
		expect(view.container.querySelector('pre')).toHaveTextContent(rawPreview);
	});
});
