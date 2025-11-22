<!-- apps/web/src/lib/components/ui/Textarea.svelte -->
<script lang="ts">
	import type { HTMLTextareaAttributes } from 'svelte/elements';
	import { twMerge } from 'tailwind-merge';

	type TextareaSize = 'sm' | 'md' | 'lg';

	// Svelte 5 runes: Use $props() with rest syntax
	let {
		value = $bindable(''),
		size = 'md',
		error = false,
		required = false,
		disabled = false,
		autoResize = false,
		rows = 4,
		maxRows = 10,
		errorMessage = undefined,
		helperText = undefined,
		enterkeyhint = undefined,
		class: className = '',
		oninput,
		...restProps
	}: {
		value?: string;
		size?: TextareaSize;
		error?: boolean;
		required?: boolean;
		disabled?: boolean;
		autoResize?: boolean;
		rows?: number;
		maxRows?: number;
		errorMessage?: string;
		helperText?: string;
		enterkeyhint?: 'enter' | 'done' | 'go' | 'next' | 'previous' | 'search' | 'send';
		class?: string;
		oninput?: (event: Event) => void;
	} & HTMLTextareaAttributes = $props();

	// Default enterkeyhint to 'enter' for textareas (can be overridden)
	let computedEnterkeyhint = $derived(enterkeyhint || 'enter');

	let textareaElement = $state<HTMLTextAreaElement>();

	// Size classes with consistent padding and minimum 16px font for mobile
	const sizeClasses = {
		sm: 'px-3 py-2 text-sm min-h-[44px]',
		md: 'px-4 py-2.5 text-base min-h-[44px]',
		lg: 'px-4 py-3 text-lg min-h-[48px]'
	};

	let textareaClasses = $derived(
		twMerge(
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
				: 'border-gray-300 focus:ring-blue-500 dark:border-gray-600',

			// Background
			'bg-white dark:bg-gray-800',

			// Text color
			'text-gray-900 dark:text-gray-100',

			// Custom classes (these will override conflicts)
			className
		)
	);

	function handleInput(event: Event) {
		const target = event.target as HTMLTextAreaElement;
		value = target.value;

		// Call custom oninput handler if provided
		if (oninput) {
			oninput(event);
		}

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

	// Adjust height on mount if autoResize is enabled (Svelte 5 effect)
	$effect(() => {
		if (autoResize && textareaElement && value) {
			adjustHeight();
		}
	});
</script>

<textarea
	bind:this={textareaElement}
	bind:value
	{disabled}
	{rows}
	enterkeyhint={computedEnterkeyhint}
	aria-invalid={error}
	aria-required={required}
	aria-describedby={error && errorMessage
		? 'textarea-error'
		: helperText
			? 'textarea-helper'
			: undefined}
	class={textareaClasses}
	oninput={handleInput}
	{...restProps}
></textarea>
{#if error && errorMessage}
	<p
		id="textarea-error"
		role="alert"
		aria-live="polite"
		class="mt-1 text-sm text-red-600 dark:text-red-400"
	>
		{errorMessage}
	</p>
{:else if helperText}
	<p id="textarea-helper" class="mt-1 text-sm text-gray-500 dark:text-gray-400">
		{helperText}
	</p>
{/if}

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
