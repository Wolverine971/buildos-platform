// apps/web/src/lib/components/project/TaskBraindumpSection.test.ts
// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/svelte';
import { tick } from 'svelte';
import TaskBraindumpSection from './TaskBraindumpSection.svelte';

// Mock fetch globally
global.fetch = vi.fn();

describe('TaskBraindumpSection', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('should auto-load braindumps on mount and display them', async () => {
		const mockBraindumps = [
			{
				id: 'bd1',
				title: 'Test Braindump',
				content: 'Test content',
				ai_summary: 'Test summary',
				status: 'processed',
				created_at: new Date().toISOString(),
				updated_at: new Date().toISOString(),
				linked_at: new Date().toISOString()
			}
		];

		(global.fetch as any).mockResolvedValue({
			ok: true,
			json: async () => ({ braindumps: mockBraindumps })
		});

		render(TaskBraindumpSection, { props: { taskId: 'test-task-id' } });

		// Wait for auto-load
		await tick();
		await waitFor(
			() => {
				expect(global.fetch).toHaveBeenCalledWith('/api/tasks/test-task-id/braindumps');
			},
			{ timeout: 2000 }
		);

		// Should display the braindump
		await waitFor(
			() => {
				expect(screen.getByText('Test Braindump')).toBeInTheDocument();
			},
			{ timeout: 2000 }
		);

		expect(screen.getByText('1 braindump')).toBeInTheDocument();
	});

	it('should show loading state', async () => {
		(global.fetch as any).mockImplementation(
			() =>
				new Promise((resolve) =>
					setTimeout(
						() =>
							resolve({
								ok: true,
								json: async () => ({ braindumps: [] })
							}),
						100
					)
				)
		);

		render(TaskBraindumpSection, { props: { taskId: 'test-task-id' } });

		await tick();
		await waitFor(
			() => {
				expect(screen.getByText('Loading...')).toBeInTheDocument();
			},
			{ timeout: 2000 }
		);
	});

	it('should show empty state when no braindumps exist', async () => {
		(global.fetch as any).mockResolvedValue({
			ok: true,
			json: async () => ({ braindumps: [] })
		});

		render(TaskBraindumpSection, { props: { taskId: 'test-task-id' } });

		await tick();
		await waitFor(
			() => {
				expect(screen.getByText(/No braindumps associated/i)).toBeInTheDocument();
			},
			{ timeout: 2000 }
		);
	});

	it('should show error state with retry button on fetch failure', async () => {
		(global.fetch as any).mockRejectedValue(new Error('Network error'));

		render(TaskBraindumpSection, { props: { taskId: 'test-task-id' } });

		await tick();
		await waitFor(
			() => {
				expect(screen.getByText(/Failed to load/i)).toBeInTheDocument();
				expect(screen.getByText('Retry')).toBeInTheDocument();
			},
			{ timeout: 2000 }
		);
	});

	it('should retry fetch when retry button is clicked', async () => {
		// First call fails
		(global.fetch as any).mockRejectedValueOnce(new Error('Network error'));

		render(TaskBraindumpSection, { props: { taskId: 'test-task-id' } });

		await tick();
		await waitFor(
			() => {
				expect(screen.getByText('Retry')).toBeInTheDocument();
			},
			{ timeout: 2000 }
		);

		// Second call succeeds
		(global.fetch as any).mockResolvedValueOnce({
			ok: true,
			json: async () => ({
				braindumps: [
					{
						id: 'bd1',
						title: 'Recovered Braindump',
						content: 'Content',
						ai_summary: null,
						status: 'processed',
						created_at: new Date().toISOString(),
						updated_at: new Date().toISOString(),
						linked_at: new Date().toISOString()
					}
				]
			})
		});

		const retryButton = screen.getByText('Retry');
		await fireEvent.click(retryButton);
		await tick();

		await waitFor(
			() => {
				expect(screen.getByText('Recovered Braindump')).toBeInTheDocument();
			},
			{ timeout: 2000 }
		);

		expect(global.fetch).toHaveBeenCalledTimes(2);
	});

	it('should only fetch braindumps once', async () => {
		(global.fetch as any).mockResolvedValue({
			ok: true,
			json: async () => ({ braindumps: [] })
		});

		const { rerender } = render(TaskBraindumpSection, { props: { taskId: 'test-task-id' } });

		await tick();
		await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1), { timeout: 2000 });

		// Force a re-render
		rerender({ taskId: 'test-task-id' });
		await tick();
		await new Promise((resolve) => setTimeout(resolve, 100));

		// Should not fetch again
		expect(global.fetch).toHaveBeenCalledTimes(1);
	});

	it('should expand and collapse individual cards', async () => {
		const mockBraindumps = [
			{
				id: 'bd1',
				title: 'Test Braindump',
				content: 'This is the full content that should appear when expanded',
				ai_summary: 'Test summary',
				status: 'processed',
				created_at: new Date().toISOString(),
				updated_at: new Date().toISOString(),
				linked_at: new Date().toISOString()
			}
		];

		(global.fetch as any).mockResolvedValue({
			ok: true,
			json: async () => ({ braindumps: mockBraindumps })
		});

		render(TaskBraindumpSection, { props: { taskId: 'test-task-id' } });

		await tick();
		await waitFor(
			() => {
				expect(screen.getByText('Test Braindump')).toBeInTheDocument();
			},
			{ timeout: 2000 }
		);

		// Find and click the card button
		const cardButton = screen.getByRole('button', { name: /Test Braindump/i });
		await fireEvent.click(cardButton);
		await tick();

		// Should show full content
		await waitFor(
			() => {
				expect(
					screen.getByText(/full content that should appear when expanded/i)
				).toBeInTheDocument();
			},
			{ timeout: 2000 }
		);

		// Should show history link
		expect(screen.getByText('View in History')).toBeInTheDocument();

		// Collapse
		await fireEvent.click(cardButton);
		await tick();

		// Full content should disappear
		await waitFor(
			() => {
				expect(
					screen.queryByText(/full content that should appear when expanded/i)
				).not.toBeInTheDocument();
			},
			{ timeout: 2000 }
		);
	});

	it('should format timestamps correctly', async () => {
		const now = new Date();
		const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);

		const mockBraindumps = [
			{
				id: 'bd1',
				title: 'Recent Braindump',
				content: 'Content',
				ai_summary: null,
				status: 'processed',
				created_at: twoHoursAgo.toISOString(),
				updated_at: twoHoursAgo.toISOString(),
				linked_at: twoHoursAgo.toISOString()
			}
		];

		(global.fetch as any).mockResolvedValue({
			ok: true,
			json: async () => ({ braindumps: mockBraindumps })
		});

		render(TaskBraindumpSection, { props: { taskId: 'test-task-id' } });

		await tick();
		await waitFor(
			() => {
				// Should show relative time for recent timestamps
				expect(screen.getByText(/ago/i)).toBeInTheDocument();
			},
			{ timeout: 2000 }
		);
	});
});
