// apps/web/src/lib/components/agent/ProjectCreationRecovery.test.ts
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { tick } from 'svelte';
import ProjectCreationRecovery from './ProjectCreationRecovery.svelte';

const { check } = vi.hoisted(() => ({ check: vi.fn() }));
vi.mock('./project-creation-recovery', () => ({ checkProjectCreation: check }));

describe('ProjectCreationRecovery', () => {
	beforeEach(() => vi.clearAllMocks());
	afterEach(() => {
		cleanup();
		vi.useRealTimers();
	});
	it('reveals a saved result once, including when mounted after a reload', async () => {
		check.mockResolvedValue({ status: 'saved', projectIds: ['project'] });
		const onCreated = vi.fn();
		render(ProjectCreationRecovery, {
			sessionId: 'saved-session',
			onCreated,
			onResume: vi.fn()
		});
		await waitFor(() => expect(onCreated).toHaveBeenCalledExactlyOnceWith(['project']));
	});
	it('resumes the original conversation when a question or failure needs review', async () => {
		check.mockResolvedValue({ status: 'review' });
		const onResume = vi.fn();
		const onCreated = vi.fn();
		render(ProjectCreationRecovery, { sessionId: 'session', onCreated, onResume });
		await screen.findByText(/No saved project was found yet/);
		await fireEvent.click(screen.getByRole('button', { name: 'Resume setup chat' }));
		expect(onResume).toHaveBeenCalledOnce();
		expect(onCreated).not.toHaveBeenCalled();
	});
	it('offers a retry after an unavailable status check', async () => {
		check.mockRejectedValueOnce(new Error('offline')).mockResolvedValue({ status: 'review' });
		render(ProjectCreationRecovery, {
			sessionId: 'session',
			onCreated: vi.fn(),
			onResume: vi.fn()
		});
		await screen.findByText(/status check couldn’t connect/);
		await fireEvent.click(screen.getByRole('button', { name: 'Check status' }));
		await screen.findByText(/No saved project was found yet/);
		expect(check).toHaveBeenCalledTimes(2);
	});
	it('polls active work and stops after a saved result', async () => {
		vi.useFakeTimers();
		check
			.mockResolvedValueOnce({ status: 'working' })
			.mockResolvedValue({ status: 'saved', projectIds: ['project'] });
		const onCreated = vi.fn();
		render(ProjectCreationRecovery, { sessionId: 'session', onCreated, onResume: vi.fn() });
		await tick();
		await vi.advanceTimersByTimeAsync(5_000);
		expect(onCreated).toHaveBeenCalledExactlyOnceWith(['project']);
		await vi.advanceTimersByTimeAsync(30_000);
		expect(check).toHaveBeenCalledTimes(2);
	});
	it('does no background reads while the chat is open', async () => {
		render(ProjectCreationRecovery, {
			sessionId: 'session',
			paused: true,
			onCreated: vi.fn(),
			onResume: vi.fn()
		});
		await tick();
		expect(check).not.toHaveBeenCalled();
	});
	it('aborts and ignores late completion when unmounted', async () => {
		let resolve!: (result: unknown) => void;
		check.mockImplementation(
			() =>
				new Promise((done) => {
					resolve = done;
				})
		);
		const onCreated = vi.fn();
		const view = render(ProjectCreationRecovery, {
			sessionId: 'session',
			onCreated,
			onResume: vi.fn()
		});
		await tick();
		const signal = check.mock.calls[0][1] as AbortSignal;
		view.unmount();
		resolve({ status: 'saved', projectIds: ['project'] });
		await tick();
		expect(signal.aborted).toBe(true);
		expect(onCreated).not.toHaveBeenCalled();
	});
});
