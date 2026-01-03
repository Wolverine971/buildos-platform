<!-- apps/web/src/lib/components/ui/RichMarkdownEditor.svelte -->
<script module lang="ts">
	let richMarkdownIdCounter = 0;
</script>

<script lang="ts">
	import type { HTMLTextareaAttributes } from 'svelte/elements';
	import {
		Bold,
		Italic,
		Heading1,
		Heading2,
		List,
		ListOrdered,
		Quote,
		Code,
		Link as LinkIcon,
		Eye,
		Edit3
	} from 'lucide-svelte';
	import { renderMarkdown, getProseClasses } from '$lib/utils/markdown';

	type EditorSize = 'sm' | 'base' | 'lg';
	type ToolbarAction = 'bold' | 'italic' | 'h1' | 'h2' | 'ul' | 'ol' | 'quote' | 'code' | 'link';

	interface Props extends Omit<HTMLTextareaAttributes, 'value'> {
		value?: string;
		label?: string;
		helpText?: string;
		maxLength?: number;
		rows?: number;
		size?: EditorSize;
	}

	let {
		value = $bindable(''),
		id,
		label,
		helpText,
		placeholder = 'Write in Markdown...',
		required = false,
		disabled = false,
		maxLength = 8000,
		rows = 12,
		size = 'base',
		class: className = '',
		oninput,
		...restProps
	}: Props = $props();

	let mode = $state<'edit' | 'preview'>('edit');
	let textareaElement = $state<HTMLTextAreaElement | null>(null);
	const generatedId = `rich-markdown-${++richMarkdownIdCounter}`;
	const textareaId = $derived(id ?? generatedId);

	const stats = $derived({
		words: value.trim() ? value.trim().split(/\s+/).length : 0,
		chars: value.length
	});

	const sizeConfig = {
		sm: {
			label: 'text-sm',
			textarea: 'text-sm',
			toolbar: 'text-sm'
		},
		base: {
			label: 'text-sm',
			textarea: 'text-base',
			toolbar: 'text-sm'
		},
		lg: {
			label: 'text-base',
			textarea: 'text-lg',
			toolbar: 'text-base'
		}
	} as const;

	const proseSize = size === 'sm' ? 'sm' : size === 'lg' ? 'lg' : 'base';
	const proseClasses = $derived(getProseClasses(proseSize));

	const toolbarButtons: Array<{ id: ToolbarAction; icon: typeof Bold; label: string }> = [
		{ id: 'bold', icon: Bold, label: 'Bold' },
		{ id: 'italic', icon: Italic, label: 'Italic' },
		{ id: 'h1', icon: Heading1, label: 'Heading 1' },
		{ id: 'h2', icon: Heading2, label: 'Heading 2' },
		{ id: 'ul', icon: List, label: 'Bulleted list' },
		{ id: 'ol', icon: ListOrdered, label: 'Numbered list' },
		{ id: 'quote', icon: Quote, label: 'Quote' },
		{ id: 'code', icon: Code, label: 'Code' },
		{ id: 'link', icon: LinkIcon, label: 'Link' }
	];

	function handleInput(event: Event) {
		if (disabled) return;
		const nextValue = (event.target as HTMLTextAreaElement).value;
		if (maxLength && nextValue.length > maxLength) {
			value = nextValue.slice(0, maxLength);
		} else {
			value = nextValue;
		}

		// Forward native handler if provided
		oninput?.(event as InputEvent);
	}

	function setValue(next: string) {
		const normalized = maxLength ? next.slice(0, maxLength) : next;
		value = normalized;
	}

	function surroundSelection(prefix: string, suffix: string = prefix) {
		if (!textareaElement) return;
		const start = textareaElement.selectionStart ?? 0;
		const end = textareaElement.selectionEnd ?? 0;
		const selection = value.slice(start, end) || '';
		const replacement = `${prefix}${selection || 'text'}${suffix}`;
		const next = value.slice(0, start) + replacement + value.slice(end);
		setValue(next);
		queueMicrotask(() => {
			const cursorStart = start + prefix.length;
			const cursorEnd = cursorStart + (selection || 'text').length;
			textareaElement?.focus();
			textareaElement?.setSelectionRange(cursorStart, cursorEnd);
		});
	}

	function insertAtLineStart(token: string) {
		if (!textareaElement) return;
		const start = textareaElement.selectionStart ?? 0;
		const before = value.slice(0, start);
		const lineStart = before.lastIndexOf('\n') + 1;
		const next = value.slice(0, lineStart) + token + value.slice(lineStart);
		setValue(next);
		queueMicrotask(() => {
			const cursor = start + token.length;
			textareaElement?.focus();
			textareaElement?.setSelectionRange(cursor, cursor);
		});
	}

	function prefixSelectedLines(prefix: string, ordered = false) {
		if (!textareaElement) return;
		const start = textareaElement.selectionStart ?? 0;
		const end = textareaElement.selectionEnd ?? 0;
		const selection = value.slice(start, end);

		if (!selection) {
			insertAtLineStart(prefix);
			return;
		}

		const lines = selection.split('\n');
		const updated = lines
			.map((line, index) => {
				if (!line.trim()) return line;
				return ordered ? `${index + 1}. ${line}` : `${prefix}${line}`;
			})
			.join('\n');

		const next = value.slice(0, start) + updated + value.slice(end);
		setValue(next);
		queueMicrotask(() => {
			const cursor = start + updated.length;
			textareaElement?.focus();
			textareaElement?.setSelectionRange(cursor, cursor);
		});
	}

	function insertCodeBlock() {
		if (!textareaElement) return;
		const start = textareaElement.selectionStart ?? 0;
		const end = textareaElement.selectionEnd ?? 0;
		const selection = value.slice(start, end);
		const isMultiline = selection.includes('\n');
		const replacement = isMultiline
			? `\`\`\`\n${selection || 'code'}\n\`\`\``
			: `\`${selection || 'code'}\``;

		const next = value.slice(0, start) + replacement + value.slice(end);
		setValue(next);
		queueMicrotask(() => {
			const cursor = start + replacement.length;
			textareaElement?.focus();
			textareaElement?.setSelectionRange(cursor, cursor);
		});
	}

	function insertLink() {
		if (typeof window === 'undefined') return;
		const url = window.prompt('Enter URL');
		if (!url) return;

		if (!textareaElement) return;
		const start = textareaElement.selectionStart ?? 0;
		const end = textareaElement.selectionEnd ?? 0;
		const selection = value.slice(start, end) || 'link text';
		const replacement = `[${selection}](${url})`;
		const next = value.slice(0, start) + replacement + value.slice(end);
		setValue(next);
		queueMicrotask(() => {
			const cursor = start + replacement.length;
			textareaElement?.focus();
			textareaElement?.setSelectionRange(cursor, cursor);
		});
	}

	function handleToolbar(action: ToolbarAction) {
		if (disabled) return;

		switch (action) {
			case 'bold':
				surroundSelection('**');
				break;
			case 'italic':
				surroundSelection('*');
				break;
			case 'h1':
				insertAtLineStart('# ');
				break;
			case 'h2':
				insertAtLineStart('## ');
				break;
			case 'ul':
				prefixSelectedLines('- ');
				break;
			case 'ol':
				prefixSelectedLines('', true);
				break;
			case 'quote':
				prefixSelectedLines('> ');
				break;
			case 'code':
				insertCodeBlock();
				break;
			case 'link':
				insertLink();
				break;
		}
	}

	function toggleMode(nextMode: 'edit' | 'preview') {
		mode = nextMode;
		if (nextMode === 'edit') {
			textareaElement?.focus();
		}
	}
</script>

<div class={`space-y-2 ${className}`}>
	{#if label}
		<div class="flex items-center justify-between">
			<label for={textareaId} class="font-medium text-foreground {sizeConfig[size].label}">
				{label}{#if required}<span class="text-destructive ml-1">*</span>{/if}
			</label>
			{#if maxLength}
				<span class="text-xs text-muted-foreground">
					{stats.chars}/{maxLength} characters
				</span>
			{/if}
		</div>
	{/if}

	<div
		class="rounded-xl border border-border bg-card shadow-ink overflow-hidden tx tx-frame tx-weak"
	>
		<!-- Toolbar -->
		<div
			class="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2 bg-muted/50"
		>
			<div class="flex flex-wrap items-center gap-1">
				{#each toolbarButtons as action}
					{@const ActionIcon = action.icon}
					<button
						type="button"
						onclick={() => handleToolbar(action.id)}
						class="p-1.5 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50 transition-colors"
						title={action.label}
						{disabled}
					>
						<ActionIcon class="w-4 h-4" />
					</button>
				{/each}
			</div>

			<div class="flex items-center gap-2">
				<button
					type="button"
					class="flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium transition-colors {mode ===
					'edit'
						? 'bg-accent text-accent-foreground shadow-ink'
						: 'bg-card border border-border text-muted-foreground hover:text-foreground'}"
					onclick={() => toggleMode('edit')}
					disabled={mode === 'edit'}
				>
					<Edit3 class="w-3 h-3" />
					Edit
				</button>
				<button
					type="button"
					class="flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium transition-colors {mode ===
					'preview'
						? 'bg-accent text-accent-foreground shadow-ink'
						: 'bg-card border border-border text-muted-foreground hover:text-foreground'}"
					onclick={() => toggleMode('preview')}
					disabled={mode === 'preview'}
				>
					<Eye class="w-3 h-3" />
					Preview
				</button>
			</div>
		</div>

		<!-- Content area -->
		{#if mode === 'edit'}
			<textarea
				id={textareaId}
				bind:this={textareaElement}
				class="w-full border-0 resize-none focus:ring-0 px-4 py-3 bg-card text-foreground placeholder:text-muted-foreground {sizeConfig[
					size
				].textarea}"
				{placeholder}
				{required}
				{disabled}
				{rows}
				aria-required={required}
				aria-disabled={disabled}
				{value}
				oninput={handleInput}
				{...restProps}
			></textarea>
		{:else}
			<div class="px-4 py-4 min-h-[200px] bg-card">
				{#if value.trim()}
					<div class={`${proseClasses} text-foreground`}>
						{@html renderMarkdown(value)}
					</div>
				{:else}
					<p class="text-muted-foreground text-sm">
						Nothing to preview yet. Switch back to edit mode to start writing.
					</p>
				{/if}
			</div>
		{/if}

		<!-- Footer stats -->
		<div
			class="flex flex-wrap items-center justify-between gap-3 px-4 py-2 border-t border-border bg-muted/50 text-xs text-muted-foreground"
		>
			<div class="flex items-center gap-4">
				<span>{stats.words} words</span>
				<span>{stats.chars} characters</span>
			</div>
			{#if maxLength}
				<div class="flex items-center gap-2 text-[11px] uppercase tracking-wide">
					<span>Remaining: {Math.max(0, maxLength - stats.chars)}</span>
					<div class="w-20 h-1.5 bg-muted rounded-full overflow-hidden">
						<div
							class="h-full bg-accent transition-all"
							style={`width: ${Math.min(100, Math.round((stats.chars / maxLength) * 100))}%`}
						></div>
					</div>
				</div>
			{/if}
		</div>
	</div>

	{#if helpText}
		<p class="text-xs text-muted-foreground">{helpText}</p>
	{/if}
</div>
