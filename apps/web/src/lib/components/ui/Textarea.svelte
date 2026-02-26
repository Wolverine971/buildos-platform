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

	// Wrapper classes - Inkprint design with GRID texture
	// Per Inkprint Design System: "Grid = Input, editable, writable"
	let wrapperClasses = 'relative overflow-hidden tx tx-grid tx-weak bg-card';

	let textareaClasses = $derived(
		twMerge(
			// Base classes - Inkprint design
			'w-full rounded resize-y',
			'border transition-all duration-200',
			'focus:outline-none',
			'disabled:cursor-not-allowed disabled:opacity-50 disabled:resize-none',

			// Placeholder - muted
			'placeholder:text-muted-foreground',

			// Size classes
			sizeClasses[size],

			// Auto resize
			autoResize && 'resize-none overflow-hidden',

			// State classes - clean borders
			error
				? 'border-destructive'
				: 'border-border focus:border-b-accent',

			// Background - card
			'bg-card',

			// Text color
			'text-foreground',

			// Position relative for proper stacking (above GRID texture)
			'relative z-10',

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

	// Expose setSelectionRange for cursor manipulation (e.g., voice transcription)
	export function setSelectionRange(start: number, end: number) {
		textareaElement?.setSelectionRange(start, end);
	}

	// Get current selection/cursor position
	export function getSelectionRange(): { start: number; end: number } | null {
		if (!textareaElement) return null;
		return {
			start: textareaElement.selectionStart ?? 0,
			end: textareaElement.selectionEnd ?? 0
		};
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
		class="mt-1 sm:mt-1.5 text-xs sm:text-sm text-destructive"
	>
		{errorMessage}
	</p>
{:else if helperText}
	<p id="textarea-helper" class="mt-1 sm:mt-1.5 text-xs sm:text-sm text-muted-foreground">
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

	/* Bottom-only focus indicator */
	textarea:focus {
		box-shadow: 0 2px 0 0 hsl(var(--ring)), var(--tw-shadow, 0 0 #0000);
	}

	textarea[aria-invalid='true']:focus {
		box-shadow: 0 2px 0 0 hsl(var(--destructive)), var(--tw-shadow, 0 0 #0000);
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
