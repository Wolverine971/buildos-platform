<!-- apps/web/src/lib/components/ui/MarkdownToggleField.svelte -->
<!--
	Inkprint MarkdownToggleField Component (Svelte 5)
	- Migrated to Svelte 5 runes
	- Responsive mobile design
	- Uses Inkprint semantic tokens
-->
<script lang="ts">
	import { tick } from 'svelte';
	import { Eye, Edit } from 'lucide-svelte';
	import { renderMarkdown, getProseClasses } from '$lib/utils/markdown';
	import Textarea from './Textarea.svelte';
	import Button from './Button.svelte';

	type TextareaHandle = {
		focus: (options?: FocusOptions) => void;
		setSelectionRange: (start: number, end: number) => void;
	};

	interface Props {
		value?: string;
		onUpdate: (newValue: string) => void;
		placeholder?: string;
		rows?: number;
		maxRows?: number;
		disabled?: boolean;
		size?: 'sm' | 'base' | 'lg';
		autoFocus?: boolean;
		ariaLabelledby?: string;
		class?: string;
		/** Hide the built-in Edit/Preview toggle so a parent can render its own (control via bind:isEditMode). */
		hideToggle?: boolean;
		/** Bindable edit-mode state, lets a parent drive the toggle from outside. */
		isEditMode?: boolean;
	}

	let {
		value = '',
		onUpdate,
		placeholder = 'Enter content...',
		rows = 4,
		maxRows,
		disabled = false,
		size = 'sm',
		autoFocus = false,
		ariaLabelledby,
		class: className = '',
		hideToggle = false,
		isEditMode = $bindable(false)
	}: Props = $props();

	function getInitialValue(): string {
		return value;
	}

	let textareaElement = $state<TextareaHandle | null>(null);
	let internalValue = $state(getInitialValue());

	// Sync internal value when the parent's prop changes — but ONLY in preview mode.
	// Why: parents commonly debounce-save and feed the saved value back in. If we
	// overwrite while the user is mid-typing, in-flight characters get wiped.
	$effect(() => {
		if (!isEditMode) {
			internalValue = value;
		}
	});

	// Focus the textarea whenever we transition into edit mode — works for both the
	// built-in toggle and a parent driving `isEditMode` via binding. Plain (non-$state)
	// tracker so this only fires on the false→true edge, never on keystrokes.
	let wasEditMode = false;
	$effect(() => {
		const entering = isEditMode && !wasEditMode;
		wasEditMode = isEditMode;
		if (entering) {
			tick().then(() => {
				textareaElement?.focus();
				textareaElement?.setSelectionRange(internalValue.length, internalValue.length);
			});
		}
	});

	function toggleMode() {
		if (disabled) return;
		isEditMode = !isEditMode;
	}

	function handleInput(event: Event) {
		const target = event.target as HTMLTextAreaElement;
		internalValue = target.value;
		onUpdate(target.value);
	}

	function handleKeydown(event: KeyboardEvent) {
		// Allow Ctrl+Enter or Cmd+Enter to save and exit
		if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
			event.preventDefault();
			onUpdate(internalValue);
			isEditMode = false;
			return;
		}

		// ESC to cancel and revert to original value
		if (event.key === 'Escape') {
			event.preventDefault();
			internalValue = value; // Revert to prop value
			isEditMode = false;
			return;
		}
	}

	// Determine if we should show the toggle button
	let showToggle = $derived(!disabled && (value?.trim() || isEditMode));

	// Get the display value - show N/A for empty content in preview mode
	let displayValue = $derived(value?.trim() || '');
	let showPlaceholder = $derived(!displayValue && !isEditMode);
</script>

<div class="markdown-toggle-field {className}">
	<!-- Toggle Button - responsive sizing -->
	{#if showToggle && !hideToggle}
		<div class="flex justify-end mb-1.5 sm:mb-2">
			<Button
				type="button"
				onclick={toggleMode}
				{disabled}
				variant="ghost"
				size="sm"
				class="text-xs px-2 py-1 sm:px-3 sm:py-1.5"
			>
				{#if isEditMode}
					<Eye class="w-3 h-3 sm:w-3.5 sm:h-3.5 sm:mr-1" />
					<span class="hidden sm:inline">Preview</span>
				{:else}
					<Edit class="w-3 h-3 sm:w-3.5 sm:h-3.5 sm:mr-1" />
					<span class="hidden sm:inline">Edit</span>
				{/if}
			</Button>
		</div>
	{/if}

	<!-- Content Area -->
	<div class="relative">
		{#if isEditMode}
			<!-- Edit Mode -->
			<Textarea
				bind:this={textareaElement}
				value={internalValue}
				oninput={handleInput}
				onkeydown={handleKeydown}
				{rows}
				{maxRows}
				{disabled}
				{placeholder}
				autofocus={autoFocus}
				size="md"
				aria-labelledby={ariaLabelledby}
			/>
			<!-- Helper text for edit mode - responsive -->
			<div class="mt-1 text-[10px] sm:text-xs text-muted-foreground">
				<span class="hidden sm:inline">Press Ctrl+Enter to save • ESC to cancel</span>
				<span class="sm:hidden">Ctrl+↵ save • ESC cancel</span>
			</div>
		{:else}
			<!-- Preview Mode - Inkprint styling with responsive padding -->
			<button
				type="button"
				class="w-full text-left px-2.5 py-1.5 sm:px-3 sm:py-2 border border-border rounded-lg bg-card shadow-ink-inner min-h-[2.25rem] sm:min-h-[2.5rem] transition-colors hover:bg-muted/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-60 tx tx-frame tx-weak {showPlaceholder
					? 'flex items-center'
					: ''}"
				onclick={toggleMode}
				{disabled}
				aria-labelledby={ariaLabelledby}
			>
				{#if showPlaceholder}
					<span class="text-muted-foreground italic text-xs sm:text-sm">
						{disabled ? 'N/A' : placeholder || 'Click to add content'}
					</span>
				{:else}
					<div class={getProseClasses(size)}>
						{@html renderMarkdown(displayValue)}
					</div>
				{/if}
			</button>
		{/if}
	</div>
</div>

<style>
	.markdown-toggle-field {
		width: 100%;
	}

	/* Ensure consistent min-height for empty content */
	.markdown-toggle-field .prose:empty::before {
		content: ' ';
		white-space: pre;
	}
</style>
