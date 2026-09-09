// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
const { goto, loadNotifications } = vi.hoisted(() => ({
	goto: vi.fn(),
	loadNotifications: vi.fn()
}));
vi.mock('$app/navigation', () => ({ goto }));
vi.mock('$lib/services/onboarding-notifications', () => ({
	loadOnboardingNotifications: loadNotifications
}));
import ReadyStep from './ReadyStep.svelte';

const props = {
	userId: 'user-1',
	projectId: null,
	summary: {
		intent: 'explore' as const,
		stakes: 'low' as const,
		projectsCreated: 0,
		tasksCreated: 0,
		goalsCreated: 0,
		smsEnabled: false,
		emailEnabled: false
	}
};

describe('Ready completion handoff', () => {
	beforeEach(() => {
		goto.mockReset().mockResolvedValue(undefined);
		loadNotifications.mockReset().mockResolvedValue({
			emailEnabled: false,
			smsEnabled: false,
			smsBriefEnabled: false,
			smsRemindersEnabled: false,
			phoneVerified: false
		});
	});
	afterEach(() => {
		cleanup();
		vi.unstubAllGlobals();
		localStorage.clear();
	});
	it('does not claim completion or navigate on failure; retries successfully', async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(
				Response.json({ success: false, error: 'Save unavailable' }, { status: 503 })
			)
			.mockResolvedValueOnce(Response.json({ success: true }));
		vi.stubGlobal('fetch', fetchMock);
		render(ReadyStep, props);
		const finish = await screen.findByRole('button', { name: 'Finish setup and start today' });
		await waitFor(() => expect(finish).toBeEnabled());
		await fireEvent.click(finish);
		expect(await screen.findByRole('alert')).toHaveTextContent('Save unavailable');
		expect(goto).not.toHaveBeenCalled();
		expect(screen.queryByText('Setup complete')).not.toBeInTheDocument();
		await fireEvent.click(screen.getByRole('button', { name: 'Retry finishing setup' }));
		await waitFor(() =>
			expect(goto).toHaveBeenCalledWith('/today', { invalidateAll: true, replaceState: true })
		);
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});
	it('blocks duplicate commits and offers a direct link if navigation fails after saving', async () => {
		let resolveSave!: (response: Response) => void;
		const fetchMock = vi.fn(
			() =>
				new Promise<Response>((resolve) => {
					resolveSave = resolve;
				})
		);
		vi.stubGlobal('fetch', fetchMock);
		goto.mockRejectedValueOnce(new Error('Navigation failed'));
		localStorage.setItem('buildos:onboarding:user-1:capture', 'draft');
		render(ReadyStep, props);
		const finish = await screen.findByRole('button', { name: 'Finish setup and start today' });
		await waitFor(() => expect(finish).toBeEnabled());
		await fireEvent.click(finish);
		await fireEvent.click(finish);
		expect(fetchMock).toHaveBeenCalledTimes(1);
		resolveSave(Response.json({ success: true }));
		expect(await screen.findByRole('link', { name: 'Open Today' })).toHaveAttribute(
			'href',
			'/today'
		);
		await waitFor(() =>
			expect(screen.getByRole('alert')).toHaveTextContent('Setup is complete')
		);
		expect(localStorage.getItem('buildos:onboarding:user-1:capture')).toBeNull();
	});
});
