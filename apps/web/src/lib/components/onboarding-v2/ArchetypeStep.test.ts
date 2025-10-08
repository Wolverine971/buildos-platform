// apps/web/src/lib/components/onboarding-v2/ArchetypeStep.test.ts
/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import ArchetypeStep from './ArchetypeStep.svelte';
import { onboardingV2Service } from '$lib/services/onboarding-v2.service';
import { toastService } from '$lib/stores/toast.store';

// Mock services
vi.mock('$lib/services/onboarding-v2.service');
vi.mock('$lib/stores/toast.store');

describe('ArchetypeStep', () => {
	const mockUserId = 'test-user-id';
	const mockOnNext = vi.fn();
	const mockOnArchetypeSelected = vi.fn();

	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('renders all three archetype options', () => {
		render(ArchetypeStep, {
			props: {
				userId: mockUserId,
				onNext: mockOnNext,
				onArchetypeSelected: mockOnArchetypeSelected
			}
		});

		expect(screen.getByText('Second Brain')).toBeTruthy();
		expect(screen.getByText('AI Task Manager')).toBeTruthy();
		expect(screen.getByText('Project To-Do List')).toBeTruthy();
	});

	it('shows the continue button as disabled when no archetype is selected', () => {
		render(ArchetypeStep, {
			props: {
				userId: mockUserId,
				onNext: mockOnNext
			}
		});

		const continueButton = screen.getByRole('button', { name: /continue/i });
		expect(continueButton.getAttribute('disabled')).toBe('');
	});

	it('enables continue button after selecting an archetype', async () => {
		render(ArchetypeStep, {
			props: {
				userId: mockUserId,
				onNext: mockOnNext
			}
		});

		// Click on Second Brain archetype
		const archetypeButton = screen.getByRole('button', { name: /Second Brain/i });
		await fireEvent.click(archetypeButton);

		const continueButton = screen.getByRole('button', { name: /continue/i });
		expect(continueButton.getAttribute('disabled')).toBeNull();
	});

	it('calls onboardingV2Service.saveArchetype when continuing', async () => {
		vi.mocked(onboardingV2Service.saveArchetype).mockResolvedValue({ data: null, error: null });

		render(ArchetypeStep, {
			props: {
				userId: mockUserId,
				onNext: mockOnNext
			}
		});

		// Select archetype
		const archetypeButton = screen.getByRole('button', { name: /AI Task Manager/i });
		await fireEvent.click(archetypeButton);

		// Click continue
		const continueButton = screen.getByRole('button', { name: /continue/i });
		await fireEvent.click(continueButton);

		expect(onboardingV2Service.saveArchetype).toHaveBeenCalledWith(
			mockUserId,
			'ai_task_manager'
		);
	});

	it('calls onNext callback after successful save', async () => {
		vi.mocked(onboardingV2Service.saveArchetype).mockResolvedValue({ data: null, error: null });

		render(ArchetypeStep, {
			props: {
				userId: mockUserId,
				onNext: mockOnNext
			}
		});

		// Select and continue
		await fireEvent.click(screen.getByRole('button', { name: /Project To-Do List/i }));
		await fireEvent.click(screen.getByRole('button', { name: /continue/i }));

		// Wait for async operations
		await new Promise((resolve) => setTimeout(resolve, 100));

		expect(mockOnNext).toHaveBeenCalled();
	});

	it('shows error toast when save fails', async () => {
		const mockError = new Error('Save failed');
		vi.mocked(onboardingV2Service.saveArchetype).mockRejectedValue(mockError);

		render(ArchetypeStep, {
			props: {
				userId: mockUserId,
				onNext: mockOnNext
			}
		});

		// Select and continue
		await fireEvent.click(screen.getByRole('button', { name: /Second Brain/i }));
		await fireEvent.click(screen.getByRole('button', { name: /continue/i }));

		// Wait for async operations
		await new Promise((resolve) => setTimeout(resolve, 100));

		expect(toastService.error).toHaveBeenCalledWith(
			'Failed to save profile. Please try again.'
		);
		expect(mockOnNext).not.toHaveBeenCalled();
	});
});
