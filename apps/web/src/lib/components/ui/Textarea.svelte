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

	// Wrapper classes - Inkprint design
	let wrapperClasses = $derived(twMerge('relative rounded-lg overflow-hidden', 'bg-card'));

	let textareaClasses = $derived(
		twMerge(
			// Base classes - Inkprint design
			'w-full rounded-lg resize-y',
			'border transition-all duration-200',
			'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1',
			'disabled:cursor-not-allowed disabled:opacity-50 disabled:resize-none',

			// Placeholder - muted
			'placeholder:text-muted-foreground',

			// Size classes
			sizeClasses[size],

			// Auto resize
			autoResize && 'resize-none overflow-hidden',

			// State classes - clean borders
			error ? 'border-red-600 focus:ring-red-500' : 'border-border focus:border-accent',

			// Background - card
			'bg-card',

			// Text color
			'text-foreground',

			// Position relative for proper stacking
			'relative',

			// Shadow
			'shadow-ink-inner',

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

	// Expose focus method for parent components
	export function focus() {
		textareaElement?.focus();
	}

	// Expose blur method for parent components
	export function blur() {
		textareaElement?.blur();
	}
</script>

<!-- Outer wrapper -->
<div class={wrapperClasses}>
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
</div>
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
	<p id="textarea-helper" class="mt-1 text-sm text-muted-foreground">
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
		--tw-ring-offset-color: hsl(var(--background));
	}

	/* Custom scrollbar - Inkprint aesthetic */
	textarea::-webkit-scrollbar {
		width: 6px;
	}

	textarea::-webkit-scrollbar-track {
		background: hsl(var(--muted));
		border-radius: 3px;
	}

	textarea::-webkit-scrollbar-thumb {
		background: hsl(var(--border));
		border-radius: 3px;
	}

	textarea::-webkit-scrollbar-thumb:hover {
		background: hsl(var(--muted-foreground) / 0.5);
	}
</style>
