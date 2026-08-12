// apps/web/src/lib/components/layout/AnimatedBrainBolt.test.ts
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/svelte';
import AnimatedBrainBolt from './AnimatedBrainBolt.svelte';

type IdleCallback = () => void;

let idleCallback: IdleCallback | undefined;

function stubMotionPreference(matches: boolean) {
	vi.stubGlobal(
		'matchMedia',
		vi.fn(() => ({
			matches,
			media: '(prefers-reduced-motion: reduce)',
			onchange: null,
			addEventListener: vi.fn(),
			removeEventListener: vi.fn(),
			addListener: vi.fn(),
			removeListener: vi.fn(),
			dispatchEvent: vi.fn()
		}))
	);
}

describe('AnimatedBrainBolt', () => {
	beforeEach(() => {
		idleCallback = undefined;
		stubMotionPreference(false);
		vi.stubGlobal(
			'requestIdleCallback',
			vi.fn((callback: IdleCallback) => {
				idleCallback = callback;
				return 1;
			})
		);
		vi.stubGlobal('cancelIdleCallback', vi.fn());
		vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
	});

	afterEach(() => {
		cleanup();
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
	});

	it('shows the exact-frame poster first, then loads the animation while idle', async () => {
		const view = render(AnimatedBrainBolt, { props: { class: 'w-10' } });
		const poster = view.container.querySelector('img');

		expect(poster).toHaveAttribute('src', '/brain-bolt-electric-poster.webp');
		expect(poster).toHaveAttribute('width', '160');
		expect(view.container.querySelector('video')).not.toBeInTheDocument();

		idleCallback?.();

		await waitFor(() => expect(view.container.querySelector('video')).toBeInTheDocument());
		const video = view.container.querySelector('video');
		expect(video).toHaveAttribute('poster', '/brain-bolt-electric-poster.webp');
		expect(video).toHaveAttribute('width', '624');
		expect(video).toHaveAttribute('height', '624');
		expect(video).toHaveClass('invisible');
		expect(video?.querySelector('source')).toHaveAttribute(
			'src',
			'/onboarding-assets/animations/brain-bolt-electric-transparent.webm'
		);

		if (video) await fireEvent(video, new Event('canplay'));
		await waitFor(() => expect(video).toHaveClass('visible'));
	});

	it('keeps the static poster and skips the video for reduced motion', () => {
		stubMotionPreference(true);
		const view = render(AnimatedBrainBolt);

		expect(view.container.querySelector('img')).toBeInTheDocument();
		expect(view.container.querySelector('video')).not.toBeInTheDocument();
		expect(requestIdleCallback).not.toHaveBeenCalled();
	});
});
