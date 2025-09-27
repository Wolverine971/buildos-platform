<!-- src/lib/components/ui/MarkdownToggleField.svelte -->
<script lang="ts">
	import { Eye, Edit } from 'lucide-svelte';
	import { renderMarkdown, getProseClasses } from '$lib/utils/markdown';
	import Textarea from './Textarea.svelte';
	import Button from './Button.svelte';

	export let value: string = '';
	export let onUpdate: (newValue: string) => void;
	export let placeholder: string = 'Enter content...';
	export let rows: number = 4;
	export let disabled: boolean = false;
	export let size: 'sm' | 'base' | 'lg' = 'sm';
	export let autoFocus: boolean = false;

	let isEditMode = false;
	let textareaElement: HTMLTextAreaElement;

	// Use internal state that syncs with the prop
	let internalValue = value;

	// Update internal value when prop changes
	$: internalValue = value;

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
	$: showToggle = !disabled && (value?.trim() || isEditMode);

	// Get the display value - show N/A for empty content in preview mode
	$: displayValue = value?.trim() || '';
	$: showPlaceholder = !displayValue && !isEditMode;
</script>

<div class="markdown-toggle-field">
	<!-- Toggle Button -->
	{#if showToggle}
		<div class="flex justify-end mb-2">
			<Button
				type="button"
				on:click={toggleMode}
				{disabled}
				variant="ghost"
				size="sm"
				class="text-xs"
			>
				{#if isEditMode}
					<Eye class="w-3 h-3 mr-1" />
					Preview
				{:else}
					<Edit class="w-3 h-3 mr-1" />
					Edit
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
				on:change={handleInput}
				on:blur={handleBlur}
				on:keydown={handleKeydown}
				{rows}
				{disabled}
				{placeholder}
				autofocus={autoFocus}
				size="md"
			/>
			<!-- Helper text for edit mode -->
			<div class="mt-1 text-xs text-gray-500 dark:text-gray-400">
				Press Ctrl+Enter to save • ESC to cancel
			</div>
		{:else}
			<!-- Preview Mode -->
			<div
				class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-800 min-h-[2.5rem] cursor-pointer transition-colors hover:bg-gray-100 dark:hover:bg-gray-700 {showPlaceholder
					? 'flex items-center'
					: ''}"
				on:click={toggleMode}
				on:keydown={(e) => (e.key === 'Enter' || e.key === ' ') && toggleMode()}
				role="button"
				tabindex={disabled ? -1 : 0}
				aria-label="Click to edit content"
			>
				{#if showPlaceholder}
					<span class="text-gray-400 italic text-sm">
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
