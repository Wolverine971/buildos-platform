<!-- apps/web/src/lib/components/ontology/DocumentEditor.svelte -->
<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import {
		Type,
		Bold,
		Italic,
		List,
		ListOrdered,
		Heading1,
		Heading2,
		Link as LinkIcon,
		Image as ImageIcon,
		AlignLeft,
		AlignCenter,
		AlignRight,
		Save,
		Sparkles,
		FileText
	} from 'lucide-svelte';
	import { Editor } from '@tiptap/core';
	import StarterKit from '@tiptap/starter-kit';
	import Image from '@tiptap/extension-image';
	import Link from '@tiptap/extension-link';
	import TextAlign from '@tiptap/extension-text-align';
	import Color from '@tiptap/extension-color';
	import { TextStyle } from '@tiptap/extension-text-style';
	import Button from '$lib/components/ui/Button.svelte';
	import type { ResolvedTemplate } from '$lib/services/ontology/template-resolver.service';

	interface DocumentEditorProps {
		outputId?: string | null;
		templateKey: string;
		resolvedTemplate: ResolvedTemplate;
		initialContent?: string;
		initialTitle?: string;
		initialProps?: Record<string, unknown>;
		projectId: string;
		onSave: (data: {
			title: string;
			content: string;
			props: Record<string, unknown>;
		}) => Promise<void>;
	}

	let propsData: DocumentEditorProps = $props();

	let editor: Editor | null = $state(null);
	let editorElement: HTMLElement;
	let title = $state(propsData.initialTitle ?? '');
	let content = $state(propsData.initialContent ?? '');
	let props = $state<Record<string, unknown>>({ ...(propsData.initialProps ?? {}) });
	let wordCount = $state(0);
	let isSaving = $state(false);
	let saveError = $state<string | null>(null);
	let saveSuccess = $state(false);
	let isDirty = $state(false);

	// AI generation state
	let showAIPanel = $state(false);
	let aiInstructions = $state('');
	let isGenerating = $state(false);

	// ✅ FIX: Store timeout ID for cleanup
	let successTimeoutId: number | null = null;

	// ✅ FIX: Use derived state instead of direct mutation
	const currentProps = $derived({
		...props,
		content,
		word_count: wordCount,
		content_type: 'html'
	});

	onMount(() => {
		if (!editorElement) {
			console.error('Editor element not found');
			return;
		}

		try {
			editor = new Editor({
				element: editorElement,
				extensions: [
					StarterKit,
					Image.configure({
						inline: true,
						allowBase64: true
					}),
					Link.configure({
						openOnClick: false,
						HTMLAttributes: {
							class: 'text-blue-600 underline dark:text-blue-400'
						}
					}),
					TextAlign.configure({
						types: ['heading', 'paragraph']
					}),
					Color,
					TextStyle
				],
				content: propsData.initialContent ?? '',
				onUpdate: ({ editor }) => {
					content = editor.getHTML();
					wordCount = editor.getText().trim().split(/\s+/).filter(Boolean).length;
					isDirty = true;
				},
				editorProps: {
					attributes: {
						class: 'prose dark:prose-invert prose-sm max-w-none focus:outline-none min-h-[400px] p-4'
					}
				}
			});

			// ✅ FIX: Verify editor was created successfully
			if (!editor) {
				console.error('Failed to create Tiptap editor');
			}
		} catch (err) {
			console.error('Error initializing editor:', err);
			saveError = 'Failed to initialize editor';
		}
	});

	onDestroy(() => {
		// ✅ FIX: Clear timeout to prevent memory leak
		if (successTimeoutId !== null) {
			clearTimeout(successTimeoutId);
			successTimeoutId = null;
		}

		// Destroy editor
		if (editor) {
			editor.destroy();
			editor = null;
		}
	});

	async function handleSave() {
		if (!editor) return;

		isSaving = true;
		saveError = null;
		saveSuccess = false;

		// ✅ FIX: Clear any existing success timeout
		if (successTimeoutId !== null) {
			clearTimeout(successTimeoutId);
			successTimeoutId = null;
		}

		try {
			await propsData.onSave({
				title,
				content: editor.getHTML(),
				props: currentProps
			});

			saveSuccess = true;
			isDirty = false;

			// ✅ FIX: Store timeout ID for cleanup
			successTimeoutId = window.setTimeout(() => {
				saveSuccess = false;
				successTimeoutId = null;
			}, 3000);
		} catch (err) {
			saveError = err instanceof Error ? err.message : 'Failed to save document';
		} finally {
			isSaving = false;
		}
	}

	async function generateWithAI() {
		if (!editor || !aiInstructions.trim()) return;

		isGenerating = true;
		saveError = null; // Clear previous errors

		try {
			const response = await fetch('/api/onto/outputs/generate', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					template_key: propsData.templateKey,
					instructions: aiInstructions,
					project_id: propsData.projectId,
					current_props: currentProps
				})
			});

			// ✅ FIX: Better error handling for non-200 responses
			if (!response.ok) {
				let errorMessage = 'AI generation failed';
				try {
					const errorData = await response.json();
					errorMessage = errorData.error || errorData.message || errorMessage;
				} catch {
					// Failed to parse error JSON, use status text
					errorMessage = `${errorMessage} (${response.status}: ${response.statusText})`;
				}
				throw new Error(errorMessage);
			}

			// ✅ FIX: Safely parse JSON response
			let data;
			try {
				data = await response.json();
			} catch (parseErr) {
				throw new Error('Invalid response from server');
			}

			// ✅ Extract from ApiResponse.data wrapper
			const generatedContent = data.data?.content;
			if (!generatedContent || typeof generatedContent !== 'string') {
				throw new Error('No content generated by AI');
			}

			editor.commands.setContent(generatedContent);
			showAIPanel = false;
			aiInstructions = '';
			isDirty = true; // Mark as dirty after AI generation
		} catch (err) {
			saveError = err instanceof Error ? err.message : 'AI generation failed';
			console.error('AI generation error:', err);
		} finally {
			isGenerating = false;
		}
	}

	function toggleBold() {
		editor?.chain().focus().toggleBold().run();
	}

	function toggleItalic() {
		editor?.chain().focus().toggleItalic().run();
	}

	function toggleBulletList() {
		editor?.chain().focus().toggleBulletList().run();
	}

	function toggleOrderedList() {
		editor?.chain().focus().toggleOrderedList().run();
	}

	function setHeading(level: 1 | 2) {
		editor?.chain().focus().toggleHeading({ level }).run();
	}

	function setTextAlign(alignment: 'left' | 'center' | 'right') {
		editor?.chain().focus().setTextAlign(alignment).run();
	}

	function addLink() {
		const url = window.prompt('Enter URL:');
		if (url) {
			editor?.chain().focus().setLink({ href: url }).run();
		}
	}

	function addImage() {
		const url = window.prompt('Enter image URL:');
		if (url) {
			editor?.chain().focus().setImage({ src: url }).run();
		}
	}
</script>

<div class="document-editor flex flex-col h-full">
	<!-- Header - Responsive with dark mode support -->
	<div
		class="editor-header border-b border-gray-200 dark:border-gray-700 p-4 sm:p-6 bg-white dark:bg-gray-800"
	>
		<div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-3">
			<div class="flex items-center gap-2 flex-1 min-w-0">
				<FileText class="w-5 h-5 text-gray-500 dark:text-gray-400 flex-shrink-0" />
				<input
					type="text"
					inputmode="text"
					enterkeyhint="done"
					bind:value={title}
					placeholder="Document title..."
					class="flex-1 text-xl sm:text-2xl font-bold border-none focus:outline-none focus:ring-2 focus:ring-purple-500 dark:focus:ring-purple-400 rounded px-2 py-1 -ml-2 bg-transparent text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500"
					oninput={() => (isDirty = true)}
					aria-label="Document title"
				/>
			</div>
			<div class="flex items-center gap-2 flex-shrink-0">
				{#if isDirty}
					<span class="text-sm text-amber-600 dark:text-amber-500" aria-live="polite">
						Unsaved changes
					</span>
				{/if}
				{#if saveSuccess}
					<span
						class="text-sm text-emerald-600 dark:text-emerald-500"
						role="status"
						aria-live="polite"
					>
						✓ Saved
					</span>
				{/if}
				<Button onclick={handleSave} loading={isSaving} disabled={!isDirty}>
					<Save class="w-4 h-4 mr-1" />
					{isSaving ? 'Saving...' : 'Save'}
				</Button>
			</div>
		</div>

		<!-- Template info with dark mode -->
		<div class="text-sm text-gray-600 dark:text-gray-400 mb-2">
			<span class="font-medium">{propsData.resolvedTemplate.name}</span>
			{#if propsData.resolvedTemplate.inheritance_chain.length > 1}
				<span class="text-gray-400 dark:text-gray-500 ml-2">
					({propsData.resolvedTemplate.inheritance_chain.join(' → ')})
				</span>
			{/if}
		</div>

		<!-- Errors with proper ARIA and dark mode -->
		{#if saveError}
			<div
				class="text-sm text-rose-700 dark:text-rose-400 bg-gradient-to-r from-rose-50 to-red-50 dark:from-rose-900/20 dark:to-red-900/20 border border-rose-200 dark:border-rose-800 p-3 rounded-lg dither-soft"
				role="alert"
				aria-live="assertive"
			>
				{saveError}
			</div>
		{/if}
	</div>

	<!-- Toolbar - Responsive with dark mode and proper ARIA -->
	<div
		class="editor-toolbar border-b border-gray-200 dark:border-gray-700 p-2 bg-gray-50 dark:bg-gray-800 flex items-center gap-1 overflow-x-auto"
		role="toolbar"
		aria-label="Text formatting toolbar"
	>
		<!-- Text formatting group -->
		<div
			class="toolbar-group flex items-center gap-1 border-r border-gray-300 dark:border-gray-600 pr-2 mr-2"
		>
			<button
				onclick={toggleBold}
				class="toolbar-btn p-1.5 rounded transition-colors duration-200 hover:bg-gray-200 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-purple-500 dark:focus:ring-purple-400 {editor?.isActive(
					'bold'
				)
					? 'bg-gray-300 dark:bg-gray-600'
					: ''} text-gray-700 dark:text-gray-300"
				title="Bold (Cmd+B)"
				aria-label="Bold"
				aria-pressed={editor?.isActive('bold')}
			>
				<Bold class="w-4 h-4" />
			</button>
			<button
				onclick={toggleItalic}
				class="toolbar-btn p-1.5 rounded transition-colors duration-200 hover:bg-gray-200 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-purple-500 dark:focus:ring-purple-400 {editor?.isActive(
					'italic'
				)
					? 'bg-gray-300 dark:bg-gray-600'
					: ''} text-gray-700 dark:text-gray-300"
				title="Italic (Cmd+I)"
				aria-label="Italic"
				aria-pressed={editor?.isActive('italic')}
			>
				<Italic class="w-4 h-4" />
			</button>
		</div>

		<!-- Heading group -->
		<div
			class="toolbar-group flex items-center gap-1 border-r border-gray-300 dark:border-gray-600 pr-2 mr-2"
		>
			<button
				onclick={() => setHeading(1)}
				class="toolbar-btn p-1.5 rounded transition-colors duration-200 hover:bg-gray-200 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-purple-500 dark:focus:ring-purple-400 {editor?.isActive(
					'heading',
					{ level: 1 }
				)
					? 'bg-gray-300 dark:bg-gray-600'
					: ''} text-gray-700 dark:text-gray-300"
				title="Heading 1"
				aria-label="Heading 1"
				aria-pressed={editor?.isActive('heading', { level: 1 })}
			>
				<Heading1 class="w-4 h-4" />
			</button>
			<button
				onclick={() => setHeading(2)}
				class="toolbar-btn p-1.5 rounded transition-colors duration-200 hover:bg-gray-200 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-purple-500 dark:focus:ring-purple-400 {editor?.isActive(
					'heading',
					{ level: 2 }
				)
					? 'bg-gray-300 dark:bg-gray-600'
					: ''} text-gray-700 dark:text-gray-300"
				title="Heading 2"
				aria-label="Heading 2"
				aria-pressed={editor?.isActive('heading', { level: 2 })}
			>
				<Heading2 class="w-4 h-4" />
			</button>
		</div>

		<!-- List group -->
		<div
			class="toolbar-group flex items-center gap-1 border-r border-gray-300 dark:border-gray-600 pr-2 mr-2"
		>
			<button
				onclick={toggleBulletList}
				class="toolbar-btn p-1.5 rounded transition-colors duration-200 hover:bg-gray-200 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-purple-500 dark:focus:ring-purple-400 {editor?.isActive(
					'bulletList'
				)
					? 'bg-gray-300 dark:bg-gray-600'
					: ''} text-gray-700 dark:text-gray-300"
				title="Bullet List"
				aria-label="Bullet list"
				aria-pressed={editor?.isActive('bulletList')}
			>
				<List class="w-4 h-4" />
			</button>
			<button
				onclick={toggleOrderedList}
				class="toolbar-btn p-1.5 rounded transition-colors duration-200 hover:bg-gray-200 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-purple-500 dark:focus:ring-purple-400 {editor?.isActive(
					'orderedList'
				)
					? 'bg-gray-300 dark:bg-gray-600'
					: ''} text-gray-700 dark:text-gray-300"
				title="Numbered List"
				aria-label="Numbered list"
				aria-pressed={editor?.isActive('orderedList')}
			>
				<ListOrdered class="w-4 h-4" />
			</button>
		</div>

		<!-- Alignment group - Hidden on mobile -->
		<div
			class="toolbar-group hidden sm:flex items-center gap-1 border-r border-gray-300 dark:border-gray-600 pr-2 mr-2"
		>
			<button
				onclick={() => setTextAlign('left')}
				class="toolbar-btn p-1.5 rounded transition-colors duration-200 hover:bg-gray-200 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-purple-500 dark:focus:ring-purple-400 text-gray-700 dark:text-gray-300"
				title="Align Left"
				aria-label="Align left"
			>
				<AlignLeft class="w-4 h-4" />
			</button>
			<button
				onclick={() => setTextAlign('center')}
				class="toolbar-btn p-1.5 rounded transition-colors duration-200 hover:bg-gray-200 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-purple-500 dark:focus:ring-purple-400 text-gray-700 dark:text-gray-300"
				title="Align Center"
				aria-label="Align center"
			>
				<AlignCenter class="w-4 h-4" />
			</button>
			<button
				onclick={() => setTextAlign('right')}
				class="toolbar-btn p-1.5 rounded transition-colors duration-200 hover:bg-gray-200 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-purple-500 dark:focus:ring-purple-400 text-gray-700 dark:text-gray-300"
				title="Align Right"
				aria-label="Align right"
			>
				<AlignRight class="w-4 h-4" />
			</button>
		</div>

		<!-- Media group -->
		<div
			class="toolbar-group flex items-center gap-1 border-r border-gray-300 dark:border-gray-600 pr-2 mr-2"
		>
			<button
				onclick={addLink}
				class="toolbar-btn p-1.5 rounded transition-colors duration-200 hover:bg-gray-200 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-purple-500 dark:focus:ring-purple-400 text-gray-700 dark:text-gray-300"
				title="Add Link"
				aria-label="Add link"
			>
				<LinkIcon class="w-4 h-4" />
			</button>
			<button
				onclick={addImage}
				class="toolbar-btn p-1.5 rounded transition-colors duration-200 hover:bg-gray-200 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-purple-500 dark:focus:ring-purple-400 text-gray-700 dark:text-gray-300"
				title="Add Image"
				aria-label="Add image"
			>
				<ImageIcon class="w-4 h-4" />
			</button>
		</div>

		<div class="toolbar-group flex-1"></div>

		<!-- AI Generate button with gradient on hover -->
		<button
			onclick={() => (showAIPanel = !showAIPanel)}
			class="toolbar-btn p-1.5 px-3 rounded transition-all duration-200 hover:bg-gradient-to-r hover:from-blue-50 hover:to-indigo-50 dark:hover:from-blue-900/30 dark:hover:to-indigo-900/30 text-blue-600 dark:text-blue-400 flex items-center gap-1 focus:outline-none focus:ring-2 focus:ring-purple-500 dark:focus:ring-purple-400 dither-fade-hover"
			title="AI Generate"
			aria-label="AI generate content"
			aria-expanded={showAIPanel}
		>
			<Sparkles class="w-4 h-4" />
			<span class="text-sm hidden sm:inline">AI Generate</span>
			<span class="text-sm sm:hidden">AI</span>
		</button>
	</div>

	<!-- AI Generation Panel - Responsive with dark mode -->
	{#if showAIPanel}
		<div
			class="ai-panel border-b border-gray-200 dark:border-gray-700 p-4 sm:p-6 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 dither-soft"
			role="region"
			aria-label="AI content generation"
		>
			<div class="flex flex-col sm:flex-row items-start gap-3">
				<div class="flex-1 w-full sm:w-auto">
					<label
						for="ai-instructions"
						class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
					>
						Describe what you want to write:
					</label>
					<textarea
						id="ai-instructions"
						enterkeyhint="done"
						bind:value={aiInstructions}
						placeholder="E.g., 'Write an opening paragraph about the importance of user experience in web design'"
						class="w-full border border-gray-300 dark:border-gray-600 rounded-lg p-3 text-sm resize-none bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500 dark:focus:ring-purple-400"
						rows="3"
						aria-describedby="ai-help-text"
					></textarea>
					<p id="ai-help-text" class="mt-1 text-xs text-gray-600 dark:text-gray-400">
						Be specific about tone, length, and key points to include.
					</p>
				</div>
				<div class="flex sm:flex-col gap-2 w-full sm:w-auto">
					<Button
						onclick={generateWithAI}
						disabled={!aiInstructions.trim() || isGenerating}
						size="sm"
						class="flex-1 sm:flex-none"
					>
						{isGenerating ? 'Generating...' : 'Generate'}
					</Button>
					<Button
						onclick={() => (showAIPanel = false)}
						variant="ghost"
						size="sm"
						class="flex-1 sm:flex-none"
					>
						Cancel
					</Button>
				</div>
			</div>
		</div>
	{/if}

	<!-- Editor Content - Dark mode support -->
	<div class="editor-content flex-1 overflow-y-auto bg-white dark:bg-gray-900">
		<div bind:this={editorElement} class="editor"></div>
	</div>

	<!-- Footer Stats - Responsive with dark mode -->
	<div
		class="editor-footer border-t border-gray-200 dark:border-gray-700 p-2 sm:p-3 bg-gray-50 dark:bg-gray-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-0 text-sm text-gray-600 dark:text-gray-400"
	>
		<div class="flex items-center gap-3 sm:gap-4 flex-wrap">
			<span class="font-medium">{wordCount} words</span>
			{#if props.target_word_count}
				<span class="text-gray-500 dark:text-gray-500 text-xs sm:text-sm">
					Target: {props.target_word_count} words
					{#if wordCount > 0}
						<span
							class="inline-block ml-1 {wordCount >=
							(props.target_word_count as number)
								? 'text-emerald-600 dark:text-emerald-500'
								: 'text-amber-600 dark:text-amber-500'}"
						>
							({Math.round((wordCount / (props.target_word_count as number)) * 100)}%)
						</span>
					{/if}
				</span>
			{/if}
		</div>
		<div class="text-xs text-gray-400 dark:text-gray-500 font-mono">
			{propsData.templateKey}
		</div>
	</div>
</div>

<style>
	/* Editor base styles - responsive and dark mode support with Tailwind colors */
	:global(.editor) {
		@apply min-h-[400px] p-4 sm:p-6 lg:p-8;
	}

	/* Paragraph styles */
	:global(.editor p) {
		@apply my-2 text-gray-900 dark:text-gray-200;
	}

	/* Heading 1 styles */
	:global(.editor h1) {
		@apply text-4xl font-bold my-4 text-gray-900 dark:text-gray-50;
	}

	/* Heading 2 styles */
	:global(.editor h2) {
		@apply text-3xl font-bold my-3 text-gray-900 dark:text-gray-50;
	}

	/* List styles */
	:global(.editor ul) {
		@apply pl-8 my-2 text-gray-900 dark:text-gray-200;
	}

	:global(.editor ol) {
		@apply pl-8 my-2 text-gray-900 dark:text-gray-200;
	}

	/* Link styles */
	:global(.editor a) {
		@apply text-blue-600 dark:text-blue-400 underline;
	}

	/* Image styles */
	:global(.editor img) {
		@apply max-w-full h-auto rounded-lg;
	}

	/* Selection colors for better visibility with Tailwind colors */
	:global(.editor ::selection) {
		background-color: rgb(147, 51, 234, 0.2); /* purple-600 with opacity */
	}

	:global(.dark .editor ::selection) {
		background-color: rgb(192, 132, 252, 0.3); /* purple-400 with opacity */
	}

	/* Prosemirror focus outline */
	:global(.editor .ProseMirror:focus) {
		outline: none;
	}

	/* Placeholder styling with Tailwind colors */
	:global(.editor .ProseMirror p.is-editor-empty:first-child::before) {
		@apply text-gray-400 dark:text-gray-500;
		content: attr(data-placeholder);
		float: left;
		height: 0;
		pointer-events: none;
	}
</style>
