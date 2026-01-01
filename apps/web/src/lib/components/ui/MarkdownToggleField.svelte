<!-- apps/web/src/lib/components/ui/MarkdownToggleField.svelte -->
<!--
	Inkprint MarkdownToggleField Component (Svelte 5)
	- Migrated to Svelte 5 runes
	- Responsive mobile design
	- Uses Inkprint semantic tokens
-->
<script lang="ts">
	import { Eye, Edit } from 'lucide-svelte';
	import { renderMarkdown, getProseClasses } from '$lib/utils/markdown';
	import Textarea from './Textarea.svelte';
	import Button from './Button.svelte';

	interface Props {
		value?: string;
		onUpdate: (newValue: string) => void;
		placeholder?: string;
		rows?: number;
		disabled?: boolean;
		size?: 'sm' | 'base' | 'lg';
		autoFocus?: boolean;
		ariaLabelledby?: string;
	}

	let {
		value = '',
		onUpdate,
		placeholder = 'Enter content...',
		rows = 4,
		disabled = false,
		size = 'sm',
		autoFocus = false,
		ariaLabelledby
	}: Props = $props();

	let isEditMode = $state(false);
	let textareaElement = $state<HTMLTextAreaElement | null>(null);
	let internalValue = $state(value);

	// Sync internal value when prop changes
	$effect(() => {
		internalValue = value;
	});

	function toggleMode() {
		if (disabled) return;

		isEditMode = !isEditMode;

		// Focus textarea when switching to edit mode
		if (isEditMode && textareaElement) {
			setTimeout(() => {
				textareaElement?.focus();
				// Set cursor to end of text
				if (textareaElement) {
					textareaElement.setSelectionRange(
						textareaElement.value.length,
						textareaElement.value.length
					);
				}
			}, 10);
		}
	}

	function handleBlur() {
		// Don't auto-close on blur - let user decide when to switch modes
		// This prevents accidental mode switches
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

<div class="markdown-toggle-field">
	<!-- Toggle Button - responsive sizing -->
	{#if showToggle}
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
				onchange={handleInput}
				onblur={handleBlur}
				onkeydown={handleKeydown}
				{rows}
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
			<div
				class="w-full px-2.5 py-1.5 sm:px-3 sm:py-2 border border-border rounded-lg bg-card shadow-ink-inner min-h-[2.25rem] sm:min-h-[2.5rem] cursor-pointer transition-colors hover:bg-muted/50 tx tx-frame tx-weak {showPlaceholder
					? 'flex items-center'
					: ''}"
				onclick={toggleMode}
				onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && toggleMode()}
				role="button"
				tabindex={disabled ? -1 : 0}
				aria-label="Click to edit content"
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
			</div>
		{/if}
	</div>
</div>

<style>
	.markdown-toggle-field {
		width: 100%;
	}

	/* Make preview area look clickable when not disabled */
	.markdown-toggle-field [role='button']:not([tabindex='-1']):hover {
		cursor: pointer;
	}

	/* Ensure consistent min-height for empty content */
	.markdown-toggle-field .prose:empty::before {
		content: ' ';
		white-space: pre;
	}
</style>
