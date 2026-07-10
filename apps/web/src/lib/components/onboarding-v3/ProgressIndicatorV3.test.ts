// apps/web/src/lib/components/onboarding-v3/ProgressIndicatorV3.test.ts
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import ProgressIndicatorV3 from './ProgressIndicatorV3.svelte';

describe('ProgressIndicatorV3', () => {
	afterEach(() => {
		cleanup();
	});

	it('uses compact step labels and gives the progress rail the full container width', () => {
		const { container } = render(ProgressIndicatorV3, {
			props: {
				currentStep: 1,
				totalSteps: 4,
				maxStepReached: 1
			}
		});

		expect(screen.getByText('Capture')).toBeInTheDocument();
		expect(screen.queryByText('Project Capture')).not.toBeInTheDocument();
		expect(container.querySelector('.relative.min-w-0')).toBeInTheDocument();
		expect(container.querySelector('.grid.grid-cols-4')).toBeInTheDocument();
		expect(container.querySelector('.w-16, .w-20')).not.toBeInTheDocument();
	});

	it('keeps completed steps navigable', async () => {
		const onStepClick = vi.fn();
		render(ProgressIndicatorV3, {
			props: {
				currentStep: 2,
				totalSteps: 4,
				maxStepReached: 2,
				onStepClick
			}
		});

		await fireEvent.click(screen.getByRole('button', { name: 'Go to Capture (completed)' }));

		expect(onStepClick).toHaveBeenCalledWith(1);
	});
});
