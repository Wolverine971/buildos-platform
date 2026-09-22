// apps/web/src/lib/components/profile/AgentKeysTab.test.ts
// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AgentKeysTab from './AgentKeysTab.svelte';

const FREEZE_WARNING = /This freezes today's list/;

function jsonResponse(body: unknown) {
	return new Response(JSON.stringify(body), {
		status: 200,
		headers: { 'Content-Type': 'application/json' }
	});
}

function project(id: string, name: string) {
	return {
		id,
		name,
		description: null,
		is_shared: false,
		external_agent_access: 'standard'
	};
}

beforeEach(() => {
	Object.defineProperty(window, 'scrollTo', {
		configurable: true,
		writable: true,
		value: vi.fn()
	});
	// jsdom has no Web Animations API; Modal transitions call element.animate.
	Object.defineProperty(Element.prototype, 'animate', {
		configurable: true,
		writable: true,
		value: vi.fn(() => ({
			cancel: vi.fn(),
			commitStyles: vi.fn(),
			finished: Promise.resolve(),
			play: vi.fn()
		}))
	});
	vi.stubGlobal(
		'fetch',
		vi.fn(async () =>
			jsonResponse({
				success: true,
				data: {
					buildos_agent: { id: 'agent-1', handle: 'buildos:user:1', status: 'active' },
					callers: [],
					available_projects: [project('p-1', 'Book project'), project('p-2', 'Website')]
				}
			})
		)
	);
});

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

async function openLimitedProjectPicker() {
	render(AgentKeysTab);
	await waitFor(() => expect(fetch).toHaveBeenCalled());
	await fireEvent.click((await screen.findAllByRole('button', { name: /Generate/ }))[0]!);
	await fireEvent.click(await screen.findByLabelText(/Only selected projects/));
}

describe('AgentKeysTab project scope', () => {
	it('warns that Select All in limited mode freezes the list, and offers All standard projects', async () => {
		await openLimitedProjectPicker();
		expect(screen.queryByText(FREEZE_WARNING)).toBeNull();

		await fireEvent.click(screen.getByRole('button', { name: 'Select All' }));
		expect(await screen.findByText(FREEZE_WARNING)).toBeTruthy();

		await fireEvent.click(screen.getByRole('button', { name: 'Use All standard projects' }));
		await waitFor(() => expect(screen.queryByText(FREEZE_WARNING)).toBeNull());
		expect((screen.getByLabelText(/All standard projects/) as HTMLInputElement).checked).toBe(
			true
		);
		// Owned standard projects are inherited in All mode, so no explicit picks remain.
		expect(screen.queryByRole('checkbox', { name: 'Book project' })).toBeNull();
	});

	it('does not warn while only some projects are picked', async () => {
		await openLimitedProjectPicker();
		await fireEvent.click(screen.getByRole('checkbox', { name: 'Book project' }));
		expect(screen.queryByText(FREEZE_WARNING)).toBeNull();
	});
});
