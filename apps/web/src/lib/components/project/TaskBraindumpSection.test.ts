// apps/web/src/lib/components/project/TaskBraindumpSection.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/svelte';
import TaskBraindumpSection from './TaskBraindumpSection.svelte';

// Mock fetch globally
global.fetch = vi.fn();

describe('TaskBraindumpSection', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('renders collapsed by default', () => {
		render(TaskBraindumpSection, { props: { taskId: 'test-task-id' } });

		expect(screen.getByText('Braindumps')).toBeInTheDocument();
		expect(screen.getByText('Click to load')).toBeInTheDocument();
	});

	it('shows loading state when section is expanded', async () => {
		// Mock fetch to return after a delay
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

		const { getByRole } = render(TaskBraindumpSection, { props: { taskId: 'test-task-id' } });

		// Click to expand
		const button = getByRole('button');
		await fireEvent.click(button);

		// Should show loading
		await waitFor(() => {
			expect(screen.getByText(/Loading/i)).toBeInTheDocument();
		});
	});

	it('displays braindumps when loaded', async () => {
		const mockBraindumps = [
			{
				id: 'bd1',
				title: 'Test Braindump',
				content: 'This is test content',
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

		const { getByRole } = render(TaskBraindumpSection, { props: { taskId: 'test-task-id' } });

		// Click to expand
		const button = getByRole('button');
		await fireEvent.click(button);

		// Wait for braindumps to load
		await waitFor(() => {
			expect(screen.getByText('Test Braindump')).toBeInTheDocument();
		});

		// Should show count
		expect(screen.getByText('1 braindump')).toBeInTheDocument();
	});

	it('shows empty state when no braindumps', async () => {
		(global.fetch as any).mockResolvedValue({
			ok: true,
			json: async () => ({ braindumps: [] })
		});

		const { getByRole } = render(TaskBraindumpSection, { props: { taskId: 'test-task-id' } });

		const button = getByRole('button');
		await fireEvent.click(button);

		await waitFor(() => {
			expect(screen.getByText(/No braindumps associated/i)).toBeInTheDocument();
		});
	});

	it('shows error state when fetch fails', async () => {
		(global.fetch as any).mockRejectedValue(new Error('Network error'));

		const { getByRole } = render(TaskBraindumpSection, { props: { taskId: 'test-task-id' } });

		const button = getByRole('button');
		await fireEvent.click(button);

		await waitFor(() => {
			expect(screen.getByText(/Failed to load/i)).toBeInTheDocument();
		});
	});

	it('can expand and collapse individual braindump cards', async () => {
		const mockBraindumps = [
			{
				id: 'bd1',
				title: 'Test Braindump',
				content: 'This is the full content of the braindump',
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

		const { getByRole, getAllByRole } = render(TaskBraindumpSection, {
			props: { taskId: 'test-task-id' }
		});

		// Expand section
		const sectionButton = getByRole('button');
		await fireEvent.click(sectionButton);

		// Wait for braindumps to load
		await waitFor(() => {
			expect(screen.getByText('Test Braindump')).toBeInTheDocument();
		});

		// Get all buttons (section button + card buttons)
		const buttons = getAllByRole('button');
		const cardButton = buttons.find((btn) => btn.textContent?.includes('Test Braindump'));

		expect(cardButton).toBeDefined();

		// Click to expand card
		if (cardButton) {
			await fireEvent.click(cardButton);

			// Should show full content
			await waitFor(() => {
				expect(screen.getByText(/full content of the braindump/i)).toBeInTheDocument();
			});

			// Should show history link
			const link = screen.getByText('View in History');
			expect(link).toBeInTheDocument();
			expect(link.closest('a')).toHaveAttribute('href', '/history?braindump=bd1');
		}
	});

	it('only fetches braindumps once', async () => {
		(global.fetch as any).mockResolvedValue({
			ok: true,
			json: async () => ({ braindumps: [] })
		});

		const { getByRole } = render(TaskBraindumpSection, { props: { taskId: 'test-task-id' } });

		const button = getByRole('button');

		// Expand
		await fireEvent.click(button);
		await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));

		// Collapse
		await fireEvent.click(button);

		// Expand again
		await fireEvent.click(button);

		// Should not fetch again
		expect(global.fetch).toHaveBeenCalledTimes(1);
	});

	it('formats timestamps correctly', async () => {
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

		const { getByRole } = render(TaskBraindumpSection, { props: { taskId: 'test-task-id' } });

		const button = getByRole('button');
		await fireEvent.click(button);

		// Should show relative time for recent braindumps
		await waitFor(() => {
			expect(screen.getByText(/ago/i)).toBeInTheDocument();
		});
	});
});
