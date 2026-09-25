<!-- apps/web/src/lib/components/layout/AnimatedBrainBolt.svelte -->
<script lang="ts">
	import { onMount } from 'svelte';

	type Props = {
		class?: string;
	};

	type IdleWindow = Window & {
		requestIdleCallback?: (callback: () => void, options?: { timeout?: number }) => number;
		cancelIdleCallback?: (handle: number) => void;
	};

	type NavigatorWithConnection = Navigator & {
		connection?: { saveData?: boolean };
	};

	const POSTER_SRC = '/brain-bolt-electric-poster.webp';
	// Safari (every iOS browser) plays VP9 WebM but drops its alpha, painting a black square, so
	// it gets HEVC-with-alpha first. Chrome and Firefox report no QuickTime support and fall
	// through to the WebM.
	const ANIMATION_HEVC_SRC = '/onboarding-assets/animations/brain-bolt-electric-icon.mov';
	const ANIMATION_WEBM_SRC = '/onboarding-assets/animations/brain-bolt-electric-icon.webm';

	let { class: className = '' }: Props = $props();
	let animationRequested = $state(false);
	let animationVisible = $state(false);
	let videoElement = $state<HTMLVideoElement>();
	let reduceMotion = false;

	function startPlayback() {
		if (!videoElement || reduceMotion) return;

		void videoElement
			.play()
			.then(() => {
				if (!reduceMotion) animationVisible = true;
			})
			.catch(() => {
				// Keep the exact-frame poster visible if autoplay is unavailable.
				animationVisible = false;
			});
	}

	function handleVideoError() {
		animationVisible = false;
		animationRequested = false;
	}

	onMount(() => {
		const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
		const idleWindow = window as IdleWindow;
		const saveData = (navigator as NavigatorWithConnection).connection?.saveData === true;
		let cancelScheduledLoad = () => {};

		function cancelLoad() {
			cancelScheduledLoad();
			cancelScheduledLoad = () => {};
		}

		function requestAnimation() {
			if (motionPreference.matches || saveData) return;
			animationRequested = true;
		}

		function scheduleLoad() {
			cancelLoad();
			if (motionPreference.matches || saveData || animationRequested) return;

			if (typeof idleWindow.requestIdleCallback === 'function') {
				const handle = idleWindow.requestIdleCallback(requestAnimation, { timeout: 2500 });
				cancelScheduledLoad = () => idleWindow.cancelIdleCallback?.(handle);
				return;
			}

			const handle = window.setTimeout(requestAnimation, 1200);
			cancelScheduledLoad = () => window.clearTimeout(handle);
		}

		function syncMotionPreference() {
			reduceMotion = motionPreference.matches;
			if (reduceMotion) {
				cancelLoad();
				animationVisible = false;
				videoElement?.pause();
				animationRequested = false;
				return;
			}

			scheduleLoad();
		}

		syncMotionPreference();
		motionPreference.addEventListener('change', syncMotionPreference);

		return () => {
			cancelLoad();
			motionPreference.removeEventListener('change', syncMotionPreference);
		};
	});
</script>

<span
	class={`relative block aspect-square shrink-0 overflow-hidden rounded-md ${className}`}
	aria-hidden="true"
>
	<img
		src={POSTER_SRC}
		alt=""
		class="block h-full w-full object-contain"
		width="160"
		height="160"
		decoding="async"
		fetchpriority="high"
	/>

	{#if animationRequested}
		<video
			bind:this={videoElement}
			class={`pointer-events-none absolute inset-0 block h-full w-full object-contain ${animationVisible ? 'visible' : 'invisible'}`}
			poster={POSTER_SRC}
			width="192"
			height="192"
			preload="auto"
			autoplay
			loop
			muted
			playsinline
			oncanplay={startPlayback}
			onerror={handleVideoError}
		>
			<source src={ANIMATION_HEVC_SRC} type={'video/quicktime; codecs="hvc1"'} />
			<source src={ANIMATION_WEBM_SRC} type="video/webm" />
		</video>
	{/if}
</span>
