<!-- apps/web/src/lib/components/ui/Textarea.svelte -->
<script lang="ts">
	import type { HTMLTextareaAttributes } from 'svelte/elements';
	import { createEventDispatcher } from 'svelte';
	import { twMerge } from 'tailwind-merge';

	type TextareaSize = 'sm' | 'md' | 'lg';

	interface $$Props extends HTMLTextareaAttributes {
		size?: TextareaSize;
		error?: boolean;
		autoResize?: boolean;
		maxRows?: number;
		class?: string;
	}

	export let value = '';
	export let size: TextareaSize = 'md';
	export let error = false;
	export let disabled = false;
	export let autoResize = false;
	export let rows = 4;
	export let maxRows = 10;

	// Allow class prop to be passed through
	let className = '';
	export { className as class };

	const dispatch = createEventDispatcher();
	let textareaElement: HTMLTextAreaElement;

	// Size classes with consistent padding
	const sizeClasses = {
		sm: 'px-3 py-2 text-sm',
		md: 'px-4 py-2.5 text-base',
		lg: 'px-4 py-3 text-lg'
	};

	$: textareaClasses = twMerge(
		// Base classes
		'w-full rounded-lg resize-y',
		'border transition-colors duration-200',
		'focus:outline-none focus:ring-2 focus:ring-offset-2',
		'disabled:cursor-not-allowed disabled:opacity-50 disabled:resize-none',
		'placeholder:text-gray-400 dark:placeholder:text-gray-500',

		// Size classes
		sizeClasses[size],

		// Auto resize
		autoResize && 'resize-none overflow-hidden',

		// State classes
		error
			? 'border-red-500 focus:ring-red-500 dark:border-red-400'
			: 'border-gray-300 focus:ring-primary-500 dark:border-gray-600',

		// Background
		'bg-white dark:bg-gray-800',

		// Text color
		'text-gray-900 dark:text-gray-100',

		// Custom classes (these will override conflicts)
		className
	);

	function handleInput(event: Event) {
		const target = event.target as HTMLTextAreaElement;
		value = target.value;
		dispatch('input', value);

		if (autoResize) {
			adjustHeight();
		}
	}

	function adjustHeight() {
		if (!textareaElement) return;

		// Reset height to recalculate
		textareaElement.style.height = 'auto';

		// Calculate new height
		const scrollHeight = textareaElement.scrollHeight;
		const lineHeight = parseInt(window.getComputedStyle(textareaElement).lineHeight);
		const maxHeight = lineHeight * maxRows;

		// Set new height
		if (scrollHeight > maxHeight) {
			textareaElement.style.height = `${maxHeight}px`;
			textareaElement.style.overflowY = 'auto';
		} else {
			textareaElement.style.height = `${scrollHeight}px`;
			textareaElement.style.overflowY = 'hidden';
		}
	}

	// Adjust height on mount if autoResize is enabled
	$: if (autoResize && textareaElement && value) {
		adjustHeight();
	}
</script>

<textarea
	bind:this={textareaElement}
	{value}
	{disabled}
	{rows}
	class={textareaClasses}
	on:input={handleInput}
	on:change
	on:focus
	on:blur
	on:keydown
	on:keyup
	on:keypress
	{...$$restProps}
></textarea>

<style>
	/* Ensure consistent rendering across browsers */
	textarea {
		-webkit-appearance: none;
		-moz-appearance: none;
		appearance: none;
	}

	/* Smooth height transitions for auto-resize */
	textarea {
		transition: height 0.1s ease-out;
	}

	/* Dark mode focus ring offset */
	:global(.dark) textarea:focus {
		--tw-ring-offset-color: rgb(31 41 55);
	}

	/* Custom scrollbar for textarea */
	textarea::-webkit-scrollbar {
		width: 8px;
	}

	textarea::-webkit-scrollbar-track {
		background: rgb(243 244 246);
		border-radius: 4px;
	}

	:global(.dark) textarea::-webkit-scrollbar-track {
		background: rgb(55 65 81);
	}

	textarea::-webkit-scrollbar-thumb {
		background: rgb(209 213 219);
		border-radius: 4px;
	}

	:global(.dark) textarea::-webkit-scrollbar-thumb {
		background: rgb(75 85 99);
	}

	textarea::-webkit-scrollbar-thumb:hover {
		background: rgb(156 163 175);
	}

	:global(.dark) textarea::-webkit-scrollbar-thumb:hover {
		background: rgb(107 114 128);
	}
</style>
