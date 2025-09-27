<!-- src/lib/components/ui/ProgressiveImage.svelte -->
<script lang="ts">
	import { onMount } from 'svelte';
	import { createImageLazyLoader } from '$lib/utils/performance-optimization';

	export let src: string;
	export let alt: string = '';
	export let placeholder: string = '';
	export let className: string = '';
	export let width: number | string = 'auto';
	export let height: number | string = 'auto';
	export let objectFit: 'cover' | 'contain' | 'fill' | 'scale-down' | 'none' = 'cover';
	export let loading: 'lazy' | 'eager' = 'lazy';
	export let decoding: 'sync' | 'async' | 'auto' = 'async';

	let imageElement: HTMLImageElement;
	let isLoaded = false;
	let hasError = false;
	let observer: IntersectionObserver | null = null;

	// Generate a simple placeholder if none provided
	$: defaultPlaceholder = `data:image/svg+xml;base64,${btoa(`
		<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300">
			<rect width="100%" height="100%" fill="#f3f4f6"/>
			<text x="50%" y="50%" text-anchor="middle" dy=".3em" fill="#9ca3af" font-family="sans-serif" font-size="14">
				Loading...
			</text>
		</svg>
	`)}`;

	$: actualPlaceholder = placeholder || defaultPlaceholder;

	function handleLoad() {
		isLoaded = true;
		hasError = false;
	}

	function handleError() {
		hasError = true;
		isLoaded = false;
	}

	onMount(() => {
		if (loading === 'lazy' && 'IntersectionObserver' in window) {
			observer = createImageLazyLoader();
			if (observer && imageElement) {
				// Set up lazy loading with data-src
				imageElement.dataset.src = src;
				imageElement.src = actualPlaceholder;
				observer.observe(imageElement);
			}
		}

		return () => {
			if (observer && imageElement) {
				observer.unobserve(imageElement);
			}
		};
	});
</script>

<div
	class="progressive-image-container {className}"
	style="width: {typeof width === 'number' ? width + 'px' : width}; height: {typeof height ===
	'number'
		? height + 'px'
		: height};"
>
	{#if loading === 'lazy'}
		<!-- Lazy loaded image -->
		<img
			bind:this={imageElement}
			{alt}
			{decoding}
			loading="lazy"
			class="optimized-image progressive-image {isLoaded ? 'loaded' : ''} {hasError
				? 'error'
				: ''}"
			style="object-fit: {objectFit}; width: 100%; height: 100%;"
			on:load={handleLoad}
			on:error={handleError}
		/>
	{:else}
		<!-- Eager loaded image -->
		<img
			bind:this={imageElement}
			{src}
			{alt}
			{decoding}
			loading="eager"
			class="optimized-image progressive-image {isLoaded ? 'loaded' : ''} {hasError
				? 'error'
				: ''}"
			style="object-fit: {objectFit}; width: 100%; height: 100%;"
			on:load={handleLoad}
			on:error={handleError}
		/>
	{/if}

	<!-- Loading overlay -->
	{#if !isLoaded && !hasError}
		<div class="loading-overlay">
			<div class="loading-spinner"></div>
		</div>
	{/if}

	<!-- Error overlay -->
	{#if hasError}
		<div class="error-overlay">
			<div class="error-content">
				<svg class="error-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z"
					/>
				</svg>
				<span class="error-text">Failed to load image</span>
			</div>
		</div>
	{/if}
</div>

<style>
	.progressive-image-container {
		position: relative;
		overflow: hidden;
		background-color: #f3f4f6;
		border-radius: 8px;
		contain: layout style paint;
	}

	.dark .progressive-image-container {
		background-color: #374151;
	}

	.progressive-image {
		transition:
			opacity 0.3s ease,
			filter 0.3s ease;
		opacity: 0;
		filter: blur(4px);
		will-change: opacity, filter;
	}

	.progressive-image.loaded {
		opacity: 1;
		filter: blur(0);
	}

	.progressive-image.error {
		opacity: 0;
	}

	.loading-overlay {
		position: absolute;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		background: rgba(243, 244, 246, 0.8);
		backdrop-filter: blur(2px);
	}

	.dark .loading-overlay {
		background: rgba(55, 65, 81, 0.8);
	}

	.loading-spinner {
		width: 24px;
		height: 24px;
		border: 2px solid #e5e7eb;
		border-top: 2px solid #3b82f6;
		border-radius: 50%;
		animation: spin 1s linear infinite;
	}

	.dark .loading-spinner {
		border: 2px solid #4b5563;
		border-top: 2px solid #60a5fa;
	}

	@keyframes spin {
		0% {
			transform: rotate(0deg);
		}
		100% {
			transform: rotate(360deg);
		}
	}

	.error-overlay {
		position: absolute;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		background: rgba(239, 68, 68, 0.1);
		color: #dc2626;
	}

	.dark .error-overlay {
		background: rgba(239, 68, 68, 0.2);
		color: #f87171;
	}

	.error-content {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.5rem;
		text-align: center;
		padding: 1rem;
	}

	.error-icon {
		width: 24px;
		height: 24px;
	}

	.error-text {
		font-size: 0.875rem;
		font-weight: 500;
	}

	/* Accessibility */
	@media (prefers-reduced-motion: reduce) {
		.progressive-image {
			transition: none !important;
		}

		.loading-spinner {
			animation: none !important;
		}
	}

	/* Mobile optimizations */
	@media (max-width: 768px) {
		.progressive-image-container {
			border-radius: 6px;
		}

		.loading-spinner {
			width: 20px;
			height: 20px;
		}

		.error-icon {
			width: 20px;
			height: 20px;
		}

		.error-text {
			font-size: 0.75rem;
		}
	}
</style>
