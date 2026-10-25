// apps/web/src/lib/components/people/ProjectJoinArrival.test.ts
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';

const mocks = vi.hoisted(() => ({
	page: {
		url: new URL('https://buildos.app/projects/project-1?joined=1'),
		state: { desktopCard: 'project' }
	},
	afterNavigate: vi.fn(),
	replaceState: vi.fn(),
	isSupported: vi.fn(() => true),
	requestPermission: vi.fn(async () => true),
	subscribe: vi.fn(async () => {}),
	success: vi.fn()
}));
vi.mock('$app/navigation', () => ({
	afterNavigate: mocks.afterNavigate,
	replaceState: mocks.replaceState
}));
vi.mock('$app/state', () => ({ page: mocks.page }));
vi.mock('$lib/services/browser-push.service', () => ({
	browserPushService: {
		isSupported: mocks.isSupported,
		requestPermission: mocks.requestPermission,
		subscribe: mocks.subscribe
	}
}));
vi.mock('$lib/stores/toast.store', () => ({ toastService: { success: mocks.success } }));
vi.mock('$lib/utils/ontology-client-logger', () => ({ logOntologyClientError: vi.fn() }));

import ProjectJoinArrival from './ProjectJoinArrival.svelte';

function arrive(props = { projectId: 'project-1', projectName: '9takes', isAuthenticated: true }) {
	const view = render(ProjectJoinArrival, { props });
	mocks.afterNavigate.mock.calls[0]?.[0]();
	return view;
}

beforeEach(() => {
	window.history.replaceState({}, '', '/projects/project-1?joined=1&tab=tasks#task-list');
	mocks.page.url = new URL(window.location.href);
	mocks.replaceState.mockImplementation((url, state) => {
		// Like SvelteKit's shallow replaceState, update history without changing page.url.
		window.history.replaceState({}, '', url);
		mocks.page.state = state;
	});
	mocks.isSupported.mockReturnValue(true);
	mocks.requestPermission.mockResolvedValue(true);
	vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
});
afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
	vi.clearAllMocks();
});

describe('project arrival', () => {
	it('shows one named toast from destination data and consumes only the arrival marker', async () => {
		arrive();
		expect(mocks.success).toHaveBeenCalledExactlyOnceWith('You joined 9takes');
		expect(mocks.replaceState).toHaveBeenCalledWith(
			new URL('/projects/project-1?tab=tasks#task-list', window.location.origin),
			{ desktopCard: 'project' }
		);
		mocks.afterNavigate.mock.calls[0]?.[0]();
		expect(mocks.success).toHaveBeenCalledTimes(1);
		expect(
			await screen.findByRole('button', { name: 'Enable push notifications' })
		).toBeInTheDocument();
		expect(fetch).not.toHaveBeenCalled();
		expect(mocks.requestPermission).not.toHaveBeenCalled();
	});

	it('does not replay arrival when Back remounts the project with its original route URL', async () => {
		const view = arrive();
		await fireEvent.click(await screen.findByRole('button', { name: 'Not now' }));
		expect(mocks.page.url.searchParams.get('joined')).toBe('1');
		expect(new URL(window.location.href).searchParams.has('joined')).toBe(false);
		view.unmount();
		mocks.afterNavigate.mockClear();

		// Back restores the consumed address, but route data retains SvelteKit's original URL.
		arrive();
		expect(mocks.success).toHaveBeenCalledExactlyOnceWith('You joined 9takes');
		expect(mocks.replaceState).toHaveBeenCalledTimes(1);
		expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
	});

	it('dismisses without changing any notification preference', async () => {
		arrive();
		await fireEvent.click(await screen.findByRole('button', { name: 'Not now' }));
		expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
		expect(fetch).not.toHaveBeenCalled();
		expect(mocks.subscribe).not.toHaveBeenCalled();
	});

	it('only enables push after an explicit click and browser permission', async () => {
		arrive();
		await fireEvent.click(
			await screen.findByRole('button', { name: 'Enable push notifications' })
		);
		await waitFor(() =>
			expect(fetch).toHaveBeenCalledWith('/api/notification-preferences', {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ push_enabled: true })
			})
		);
		expect(mocks.requestPermission).toHaveBeenCalledTimes(1);
		expect(mocks.subscribe).toHaveBeenCalledTimes(1);
		await waitFor(() => expect(screen.queryByRole('complementary')).not.toBeInTheDocument());
	});

	it('preserves preferences when browser permission is denied', async () => {
		mocks.requestPermission.mockResolvedValue(false);
		arrive();
		await fireEvent.click(
			await screen.findByRole('button', { name: 'Enable push notifications' })
		);
		expect(await screen.findByRole('alert')).toHaveTextContent(
			'Push permission wasn’t granted.'
		);
		expect(mocks.subscribe).not.toHaveBeenCalled();
		expect(fetch).not.toHaveBeenCalled();
	});

	it('keeps the project usable and offers retry when saving push fails', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));
		arrive();
		await fireEvent.click(
			await screen.findByRole('button', { name: 'Enable push notifications' })
		);
		expect(await screen.findByRole('alert')).toHaveTextContent(
			'Couldn’t save push notifications.'
		);
		expect(screen.getByRole('button', { name: 'Not now' })).toBeEnabled();
	});

	it('skips the push offer in unsupported browsers while retaining the arrival message', () => {
		mocks.isSupported.mockReturnValue(false);
		arrive();
		expect(mocks.success).toHaveBeenCalledWith('You joined 9takes');
		expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
	});

	it('does nothing on ordinary project visits or without authenticated data', () => {
		window.history.replaceState({}, '', '/projects/project-1');
		mocks.page.url = new URL(window.location.href);
		arrive().unmount();
		mocks.afterNavigate.mockClear();
		window.history.replaceState({}, '', '/projects/project-1?joined=1');
		mocks.page.url = new URL(window.location.href);
		arrive({ projectId: 'project-1', projectName: '9takes', isAuthenticated: false });
		expect(mocks.success).not.toHaveBeenCalled();
		expect(mocks.replaceState).not.toHaveBeenCalled();
		expect(fetch).not.toHaveBeenCalled();
	});
});
