<!-- apps/web/src/lib/components/ui/ProgressiveImage.svelte -->
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
	class="relative overflow-hidden bg-gray-100 dark:bg-gray-700 rounded-lg {className}"
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
			class="w-full h-full transition-opacity transition-[filter] duration-300 ease-out opacity-0 blur-sm {isLoaded
				? 'loaded'
				: ''} {hasError ? 'error' : ''}"
			style="object-fit: {objectFit};"
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
			class="w-full h-full transition-opacity transition-[filter] duration-300 ease-out opacity-0 blur-sm {isLoaded
				? 'loaded'
				: ''} {hasError ? 'error' : ''}"
			style="object-fit: {objectFit};"
			on:load={handleLoad}
			on:error={handleError}
		/>
	{/if}

	<!-- Loading overlay -->
	{#if !isLoaded && !hasError}
		<div
			class="absolute inset-0 flex items-center justify-center bg-gray-100/80 dark:bg-gray-700/80 backdrop-blur-sm"
		>
			<div
				class="w-6 h-6 border-2 border-gray-200 dark:border-gray-600 border-t-blue-500 dark:border-t-blue-400 rounded-full animate-spin"
			></div>
		</div>
	{/if}

	<!-- Error overlay -->
	{#if hasError}
		<div
			class="absolute inset-0 flex items-center justify-center bg-red-500/10 dark:bg-red-500/20 text-red-600 dark:text-red-400"
		>
			<div class="flex flex-col items-center gap-2 text-center p-4">
				<svg class="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor">
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z"
					/>
				</svg>
				<span class="text-sm font-medium">Failed to load image</span>
			</div>
		</div>
	{/if}
</div>

<style>
	/* Image state transitions */
	:global(.loaded) {
		@apply opacity-100 blur-none !important;
	}

	:global(.error) {
		@apply opacity-0 !important;
	}

	/* Accessibility: Reduce motion */
	@media (prefers-reduced-motion: reduce) {
		:global(img) {
			transition: none !important;
		}
	}
</style>
