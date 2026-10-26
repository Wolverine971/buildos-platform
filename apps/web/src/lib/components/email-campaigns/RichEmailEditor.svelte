<!-- apps/web/src/lib/components/email-campaigns/RichEmailEditor.svelte -->
<!--
	TipTap editor for email bodies. Emits HTML on every change. Parents can call
	`insertText` (merge fields) and `insertImage` through bind:this.
-->
<script lang="ts">
	import { onDestroy, onMount, untrack } from 'svelte';
	import { Editor } from '@tiptap/core';
	import StarterKit from '@tiptap/starter-kit';
	import Image from '@tiptap/extension-image';
	import {
		Bold,
		Italic,
		Heading2,
		List,
		ListOrdered,
		Link,
		ImagePlus,
		Unlink
	} from 'lucide-svelte';

	let {
		value = '',
		editable = true,
		placeholder = 'Write your email…',
		minHeight = 280,
		ariaLabel = 'Email body',
		onchange,
		onrequestimage,
		onfocus
	}: {
		value?: string;
		editable?: boolean;
		placeholder?: string;
		minHeight?: number;
		ariaLabel?: string;
		onchange?: (html: string) => void;
		onrequestimage?: () => void;
		onfocus?: () => void;
	} = $props();

	let element = $state<HTMLDivElement>();
	let editor = $state<Editor | null>(null);
	// Bumped on every transaction so toolbar active states re-derive.
	let revision = $state(0);
	let lastEmitted = '';
	let showLinkInput = $state(false);
	let linkUrl = $state('');
	let linkInput = $state<HTMLInputElement>();

	onMount(() => {
		if (!element) return;
		const initial = untrack(() => value);
		lastEmitted = initial;
		editor = new Editor({
			element,
			editable: untrack(() => editable),
			extensions: [
				StarterKit.configure({
					heading: { levels: [2, 3] },
					link: { openOnClick: false, autolink: true, defaultProtocol: 'https' }
				}),
				Image.configure({ HTMLAttributes: { style: 'max-width:100%;height:auto;' } })
			],
			content: initial,
			editorProps: {
				attributes: {
					class: 'campaign-editor prose prose-sm max-w-none px-3 py-3 text-foreground focus:outline-none',
					role: 'textbox',
					'aria-multiline': 'true',
					'aria-label': ariaLabel,
					style: `min-height: ${minHeight}px`
				}
			},
			onUpdate: ({ editor: instance }) => {
				const html = instance.isEmpty ? '' : instance.getHTML();
				lastEmitted = html;
				onchange?.(html);
			},
			onTransaction: () => {
				revision += 1;
			},
			onFocus: () => onfocus?.()
		});
	});

	onDestroy(() => {
		editor?.destroy();
		editor = null;
	});

	// Outside changes (reset to template, switching person) replace the content.
	$effect(() => {
		const next = value;
		const instance = editor;
		if (!instance) return;
		if (next === lastEmitted) return;
		untrack(() => {
			lastEmitted = next;
			instance.commands.setContent(next || '', { emitUpdate: false });
		});
	});

	$effect(() => {
		const instance = editor;
		const canEdit = editable;
		if (instance && instance.isEditable !== canEdit) {
			instance.setEditable(canEdit);
		}
	});

	function isActive(name: string, attrs?: Record<string, unknown>): boolean {
		void revision;
		return editor?.isActive(name, attrs) ?? false;
	}

	export function insertText(text: string) {
		if (!editor) return;
		editor.chain().focus().insertContent(text).run();
	}

	export function insertImage(url: string, alt = '') {
		if (!editor) return;
		editor.chain().focus().setImage({ src: url, alt }).run();
	}

	export function focus() {
		editor?.commands.focus();
	}

	function openLinkInput() {
		if (!editor) return;
		linkUrl = (editor.getAttributes('link').href as string | undefined) ?? '';
		showLinkInput = true;
		queueMicrotask(() => linkInput?.focus());
	}

	function applyLink() {
		if (!editor) return;
		const url = linkUrl.trim();
		if (!url) {
			editor.chain().focus().extendMarkRange('link').unsetLink().run();
		} else {
			const href = /^(https?:|mailto:)/i.test(url) ? url : `https://${url}`;
			editor.chain().focus().extendMarkRange('link').setLink({ href }).run();
		}
		showLinkInput = false;
		linkUrl = '';
	}

	const toolButton =
		'inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-card hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40 sm:h-8 sm:w-8';
	const toolActive = 'bg-card text-foreground shadow-ink-inner';
</script>

<div
	class="overflow-hidden rounded-lg border border-border-strong bg-background shadow-ink-inner focus-within:border-accent"
>
	{#if editable}
		<div
			class="flex flex-wrap items-center gap-0.5 border-b border-border bg-muted/50 px-1.5 py-1"
			role="toolbar"
			aria-label="Formatting"
		>
			<button
				type="button"
				class="{toolButton} {isActive('bold') ? toolActive : ''}"
				aria-pressed={isActive('bold')}
				title="Bold"
				onclick={() => editor?.chain().focus().toggleBold().run()}
			>
				<Bold class="h-4 w-4" /><span class="sr-only">Bold</span>
			</button>
			<button
				type="button"
				class="{toolButton} {isActive('italic') ? toolActive : ''}"
				aria-pressed={isActive('italic')}
				title="Italic"
				onclick={() => editor?.chain().focus().toggleItalic().run()}
			>
				<Italic class="h-4 w-4" /><span class="sr-only">Italic</span>
			</button>
			<button
				type="button"
				class="{toolButton} {isActive('heading', { level: 2 }) ? toolActive : ''}"
				aria-pressed={isActive('heading', { level: 2 })}
				title="Heading"
				onclick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}
			>
				<Heading2 class="h-4 w-4" /><span class="sr-only">Heading</span>
			</button>
			<span class="mx-1 h-4 w-px bg-border" aria-hidden="true"></span>
			<button
				type="button"
				class="{toolButton} {isActive('bulletList') ? toolActive : ''}"
				aria-pressed={isActive('bulletList')}
				title="Bulleted list"
				onclick={() => editor?.chain().focus().toggleBulletList().run()}
			>
				<List class="h-4 w-4" /><span class="sr-only">Bulleted list</span>
			</button>
			<button
				type="button"
				class="{toolButton} {isActive('orderedList') ? toolActive : ''}"
				aria-pressed={isActive('orderedList')}
				title="Numbered list"
				onclick={() => editor?.chain().focus().toggleOrderedList().run()}
			>
				<ListOrdered class="h-4 w-4" /><span class="sr-only">Numbered list</span>
			</button>
			<span class="mx-1 h-4 w-px bg-border" aria-hidden="true"></span>
			<button
				type="button"
				class="{toolButton} {isActive('link') ? toolActive : ''}"
				aria-pressed={isActive('link')}
				title="Link"
				onclick={openLinkInput}
			>
				<Link class="h-4 w-4" /><span class="sr-only">Link</span>
			</button>
			{#if isActive('link')}
				<button
					type="button"
					class={toolButton}
					title="Remove link"
					onclick={() =>
						editor?.chain().focus().extendMarkRange('link').unsetLink().run()}
				>
					<Unlink class="h-4 w-4" /><span class="sr-only">Remove link</span>
				</button>
			{/if}
			{#if onrequestimage}
				<button
					type="button"
					class={toolButton}
					title="Image"
					onclick={() => onrequestimage?.()}
				>
					<ImagePlus class="h-4 w-4" /><span class="sr-only">Insert image</span>
				</button>
			{/if}
		</div>
		{#if showLinkInput}
			<form
				class="flex flex-wrap items-center gap-2 border-b border-border bg-card px-2 py-2"
				onsubmit={(event) => {
					event.preventDefault();
					applyLink();
				}}
			>
				<label class="sr-only" for="campaign-link-url">Link address</label>
				<input
					id="campaign-link-url"
					bind:this={linkInput}
					bind:value={linkUrl}
					type="url"
					inputmode="url"
					placeholder="https://build-os.com/s/start"
					class="min-w-0 flex-1 rounded-md border border-border-strong bg-background px-2.5 py-1.5 text-base text-foreground shadow-ink-inner outline-none focus:border-accent sm:text-sm"
					onkeydown={(event) => {
						if (event.key === 'Escape') {
							event.preventDefault();
							showLinkInput = false;
						}
					}}
				/>
				<button
					type="submit"
					class="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-accent-foreground pressable focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
				>
					{linkUrl.trim() ? 'Apply' : 'Remove'}
				</button>
				<button
					type="button"
					class="rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					onclick={() => (showLinkInput = false)}
				>
					Cancel
				</button>
			</form>
		{/if}
	{/if}
	<div class="relative">
		<div bind:this={element}></div>
		{#if editable && !value}
			<p
				class="pointer-events-none absolute left-3 top-3 text-sm text-muted-foreground"
				aria-hidden="true"
			>
				{placeholder}
			</p>
		{/if}
	</div>
</div>

<style>
	:global(.campaign-editor p) {
		margin: 0 0 0.75rem;
	}
	:global(.campaign-editor img) {
		border-radius: 0.375rem;
	}
	:global(.campaign-editor a) {
		color: hsl(var(--accent));
		text-decoration: underline;
	}
</style>
