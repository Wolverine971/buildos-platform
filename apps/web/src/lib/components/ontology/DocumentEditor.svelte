<!-- apps/web/src/lib/components/ontology/DocumentEditor.svelte -->
<!--
	Rich Document Editor - Mobile-First Design

	Features:
	- TipTap-based WYSIWYG editing
	- Mobile-optimized touch toolbar (44px targets)
	- Collapsible toolbar groups on mobile
	- AI content generation
	- Inkprint design language
	- High information density

	Documentation: /apps/web/docs/technical/components/INKPRINT_DESIGN_SYSTEM.md
-->
<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import {
		Bold,
		Italic,
		List,
		ListOrdered,
		Heading1,
		Heading2,
		Heading3,
		Link as LinkIcon,
		Unlink,
		Image as ImageIcon,
		AlignLeft,
		AlignCenter,
		AlignRight,
		Save,
		Sparkles,
		FileText,
		ChevronDown,
		ChevronUp,
		Type,
		Minus,
		Quote,
		Code,
		MoreHorizontal,
		X,
		Undo,
		Redo,
		Strikethrough
	} from 'lucide-svelte';
	import { Editor } from '@tiptap/core';
	import StarterKit from '@tiptap/starter-kit';
	import Image from '@tiptap/extension-image';
	import Link from '@tiptap/extension-link';
	import TextAlign from '@tiptap/extension-text-align';
	import Color from '@tiptap/extension-color';
	import { TextStyle } from '@tiptap/extension-text-style';
	import Placeholder from '@tiptap/extension-placeholder';
	import Button from '$lib/components/ui/Button.svelte';

	interface DocumentEditorProps {
		outputId?: string | null;
		typeKey?: string;
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
	let charCount = $state(0);
	let isSaving = $state(false);
	let saveError = $state<string | null>(null);
	let saveSuccess = $state(false);
	let isDirty = $state(false);

	// AI generation state
	let showAIPanel = $state(false);
	let aiInstructions = $state('');
	let isGenerating = $state(false);

	// Mobile toolbar state
	let showMoreTools = $state(false);
	let isMobile = $state(false);

	// Timeout ID for cleanup
	let successTimeoutId: number | null = null;

	// Derived state for props
	const currentProps = $derived({
		...props,
		content,
		word_count: wordCount,
		content_type: 'html'
	});

	// Check for mobile viewport
	function checkMobile() {
		if (typeof window !== 'undefined') {
			isMobile = window.innerWidth < 640;
		}
	}

	onMount(() => {
		checkMobile();
		window.addEventListener('resize', checkMobile);

		if (!editorElement) {
			console.error('Editor element not found');
			return;
		}

		try {
			editor = new Editor({
				element: editorElement,
				extensions: [
					StarterKit.configure({
						heading: {
							levels: [1, 2, 3]
						}
					}),
					Image.configure({
						inline: true,
						allowBase64: true
					}),
					Link.configure({
						openOnClick: false,
						HTMLAttributes: {
							class: 'text-accent underline hover:text-accent/80'
						}
					}),
					TextAlign.configure({
						types: ['heading', 'paragraph']
					}),
					Color,
					TextStyle,
					Placeholder.configure({
						placeholder: 'Start writing your document...'
					})
				],
				content: propsData.initialContent ?? '',
				onUpdate: ({ editor }) => {
					content = editor.getHTML();
					const text = editor.getText();
					wordCount = text.trim() ? text.trim().split(/\s+/).filter(Boolean).length : 0;
					charCount = text.length;
					isDirty = true;
				},
				editorProps: {
					attributes: {
						class: 'prose dark:prose-invert prose-sm sm:prose-base max-w-none focus:outline-none min-h-[200px] sm:min-h-[300px]'
					}
				}
			});

			if (!editor) {
				console.error('Failed to create Tiptap editor');
			}
		} catch (err) {
			console.error('Error initializing editor:', err);
			saveError = 'Failed to initialize editor';
		}
	});

	onDestroy(() => {
		window.removeEventListener('resize', checkMobile);

		if (successTimeoutId !== null) {
			clearTimeout(successTimeoutId);
			successTimeoutId = null;
		}

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
		saveError = null;

		try {
			const response = await fetch('/api/onto/outputs/generate', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					type_key: propsData.typeKey,
					instructions: aiInstructions,
					project_id: propsData.projectId,
					current_props: currentProps
				})
			});

			if (!response.ok) {
				let errorMessage = 'AI generation failed';
				try {
					const errorData = await response.json();
					errorMessage = errorData.error || errorData.message || errorMessage;
				} catch {
					errorMessage = `${errorMessage} (${response.status}: ${response.statusText})`;
				}
				throw new Error(errorMessage);
			}

			let data;
			try {
				data = await response.json();
			} catch (parseErr) {
				throw new Error('Invalid response from server');
			}

			const generatedContent = data.data?.content;
			if (!generatedContent || typeof generatedContent !== 'string') {
				throw new Error('No content generated by AI');
			}

			editor.commands.setContent(generatedContent);
			showAIPanel = false;
			aiInstructions = '';
			isDirty = true;
		} catch (err) {
			saveError = err instanceof Error ? err.message : 'AI generation failed';
			console.error('AI generation error:', err);
		} finally {
			isGenerating = false;
		}
	}

	// Editor commands
	function toggleBold() {
		editor?.chain().focus().toggleBold().run();
	}
	function toggleItalic() {
		editor?.chain().focus().toggleItalic().run();
	}
	function toggleStrikethrough() {
		editor?.chain().focus().toggleStrike().run();
	}
	function toggleBulletList() {
		editor?.chain().focus().toggleBulletList().run();
	}
	function toggleOrderedList() {
		editor?.chain().focus().toggleOrderedList().run();
	}
	function setHeading(level: 1 | 2 | 3) {
		editor?.chain().focus().toggleHeading({ level }).run();
	}
	function setParagraph() {
		editor?.chain().focus().setParagraph().run();
	}
	function setTextAlign(alignment: 'left' | 'center' | 'right') {
		editor?.chain().focus().setTextAlign(alignment).run();
	}
	function toggleBlockquote() {
		editor?.chain().focus().toggleBlockquote().run();
	}
	function toggleCodeBlock() {
		editor?.chain().focus().toggleCodeBlock().run();
	}
	function setHorizontalRule() {
		editor?.chain().focus().setHorizontalRule().run();
	}
	function addLink() {
		const url = window.prompt('Enter URL:');
		if (url) {
			editor?.chain().focus().setLink({ href: url }).run();
		}
	}
	function removeLink() {
		editor?.chain().focus().unsetLink().run();
	}
	function addImage() {
		const url = window.prompt('Enter image URL:');
		if (url) {
			editor?.chain().focus().setImage({ src: url }).run();
		}
	}
	function undo() {
		editor?.chain().focus().undo().run();
	}
	function redo() {
		editor?.chain().focus().redo().run();
	}
	function canUndo() {
		return editor?.can().undo() ?? false;
	}
	function canRedo() {
		return editor?.can().redo() ?? false;
	}

	// Toolbar button component helper
	// Supports both: isActive('bold') and isActive({ textAlign: 'left' })
	const isActive = (nameOrAttrs: string | Record<string, unknown>, attrs?: Record<string, unknown>) => {
		if (typeof nameOrAttrs === 'string') {
			return editor?.isActive(nameOrAttrs, attrs) ?? false;
		}
		return editor?.isActive(nameOrAttrs) ?? false;
	};
</script>

<div
	class="document-editor flex flex-col h-full bg-card border border-border rounded-lg shadow-ink overflow-hidden tx tx-frame tx-weak"
>
	<!-- Compact Header -->
	<div class="editor-header border-b border-border px-3 py-2 bg-muted/30">
		<!-- Title Row -->
		<div class="flex items-center gap-2">
			<FileText class="w-4 h-4 text-muted-foreground shrink-0" />
			<input
				type="text"
				inputmode="text"
				enterkeyhint="done"
				bind:value={title}
				placeholder="Document title..."
				class="flex-1 text-base sm:text-lg font-semibold border-none focus:outline-none focus:ring-0 bg-transparent text-foreground placeholder:text-muted-foreground min-w-0"
				oninput={() => (isDirty = true)}
				aria-label="Document title"
			/>
			<div class="flex items-center gap-1.5 shrink-0">
				{#if isDirty}
					<span
						class="text-[10px] sm:text-xs text-amber-600 dark:text-amber-400 font-medium"
					>
						Unsaved
					</span>
				{/if}
				{#if saveSuccess}
					<span
						class="text-[10px] sm:text-xs text-emerald-600 dark:text-emerald-400 font-medium"
					>
						✓ Saved
					</span>
				{/if}
				<Button
					onclick={handleSave}
					loading={isSaving}
					disabled={!isDirty}
					size="sm"
					variant="primary"
					class="pressable h-8 px-2.5 text-xs"
				>
					<Save class="w-3.5 h-3.5" />
					<span class="hidden sm:inline ml-1">{isSaving ? 'Saving...' : 'Save'}</span>
				</Button>
			</div>
		</div>

		<!-- Type key info (compact) -->
		{#if propsData.typeKey}
			<div class="mt-1 text-[10px] text-muted-foreground font-mono truncate">
				{propsData.typeKey}
			</div>
		{/if}

		<!-- Errors -->
		{#if saveError}
			<div
				class="mt-2 text-xs text-red-600 dark:text-red-400 bg-red-500/10 border border-red-500/30 px-2.5 py-1.5 rounded-md tx tx-static tx-weak"
				role="alert"
			>
				{saveError}
			</div>
		{/if}
	</div>

	<!-- Comprehensive Toolbar - Mobile & Desktop Optimized -->
	<div
		class="editor-toolbar border-b border-border bg-muted/50 sticky top-0 z-10"
		role="toolbar"
		aria-label="Text formatting toolbar"
	>
		<!-- Primary toolbar row -->
		<div class="flex items-center gap-0.5 px-1.5 py-1 overflow-x-auto scrollbar-hide">
			<!-- Undo/Redo -->
			<div class="flex items-center gap-0.5">
				<button
					onclick={undo}
					class="toolbar-btn"
					class:disabled={!canUndo()}
					disabled={!canUndo()}
					title="Undo (Cmd+Z)"
					aria-label="Undo"
				>
					<Undo class="w-4 h-4" />
				</button>
				<button
					onclick={redo}
					class="toolbar-btn"
					class:disabled={!canRedo()}
					disabled={!canRedo()}
					title="Redo (Cmd+Shift+Z)"
					aria-label="Redo"
				>
					<Redo class="w-4 h-4" />
				</button>
			</div>

			<div class="toolbar-divider"></div>

			<!-- Core formatting (always visible) -->
			<div class="flex items-center gap-0.5">
				<button
					onclick={toggleBold}
					class="toolbar-btn"
					class:active={isActive('bold')}
					title="Bold (Cmd+B)"
					aria-label="Bold"
					aria-pressed={isActive('bold')}
				>
					<Bold class="w-4 h-4" />
				</button>
				<button
					onclick={toggleItalic}
					class="toolbar-btn"
					class:active={isActive('italic')}
					title="Italic (Cmd+I)"
					aria-label="Italic"
					aria-pressed={isActive('italic')}
				>
					<Italic class="w-4 h-4" />
				</button>
				<button
					onclick={toggleStrikethrough}
					class="toolbar-btn hidden sm:flex"
					class:active={isActive('strike')}
					title="Strikethrough"
					aria-label="Strikethrough"
				>
					<Strikethrough class="w-4 h-4" />
				</button>
			</div>

			<div class="toolbar-divider"></div>

			<!-- Headings -->
			<div class="flex items-center gap-0.5">
				<button
					onclick={() => setHeading(1)}
					class="toolbar-btn"
					class:active={isActive('heading', { level: 1 })}
					title="Heading 1"
					aria-label="Heading 1"
				>
					<Heading1 class="w-4 h-4" />
				</button>
				<button
					onclick={() => setHeading(2)}
					class="toolbar-btn"
					class:active={isActive('heading', { level: 2 })}
					title="Heading 2"
					aria-label="Heading 2"
				>
					<Heading2 class="w-4 h-4" />
				</button>
				<button
					onclick={() => setHeading(3)}
					class="toolbar-btn hidden sm:flex"
					class:active={isActive('heading', { level: 3 })}
					title="Heading 3"
					aria-label="Heading 3"
				>
					<Heading3 class="w-4 h-4" />
				</button>
				<button
					onclick={setParagraph}
					class="toolbar-btn hidden md:flex"
					class:active={isActive('paragraph') && !isActive('heading')}
					title="Paragraph"
					aria-label="Paragraph"
				>
					<Type class="w-4 h-4" />
				</button>
			</div>

			<div class="toolbar-divider"></div>

			<!-- Lists & Blocks -->
			<div class="flex items-center gap-0.5">
				<button
					onclick={toggleBulletList}
					class="toolbar-btn"
					class:active={isActive('bulletList')}
					title="Bullet List"
					aria-label="Bullet list"
				>
					<List class="w-4 h-4" />
				</button>
				<button
					onclick={toggleOrderedList}
					class="toolbar-btn"
					class:active={isActive('orderedList')}
					title="Numbered List"
					aria-label="Numbered list"
				>
					<ListOrdered class="w-4 h-4" />
				</button>
				<button
					onclick={toggleBlockquote}
					class="toolbar-btn hidden sm:flex"
					class:active={isActive('blockquote')}
					title="Quote Block"
					aria-label="Quote"
				>
					<Quote class="w-4 h-4" />
				</button>
				<button
					onclick={toggleCodeBlock}
					class="toolbar-btn hidden sm:flex"
					class:active={isActive('codeBlock')}
					title="Code Block"
					aria-label="Code block"
				>
					<Code class="w-4 h-4" />
				</button>
			</div>

			<div class="toolbar-divider hidden md:block"></div>

			<!-- Alignment (visible on md+) -->
			<div class="hidden md:flex items-center gap-0.5">
				<button
					onclick={() => setTextAlign('left')}
					class="toolbar-btn"
					class:active={isActive({ textAlign: 'left' })}
					title="Align Left"
					aria-label="Align left"
				>
					<AlignLeft class="w-4 h-4" />
				</button>
				<button
					onclick={() => setTextAlign('center')}
					class="toolbar-btn"
					class:active={isActive({ textAlign: 'center' })}
					title="Align Center"
					aria-label="Align center"
				>
					<AlignCenter class="w-4 h-4" />
				</button>
				<button
					onclick={() => setTextAlign('right')}
					class="toolbar-btn"
					class:active={isActive({ textAlign: 'right' })}
					title="Align Right"
					aria-label="Align right"
				>
					<AlignRight class="w-4 h-4" />
				</button>
			</div>

			<div class="toolbar-divider hidden sm:block"></div>

			<!-- Media & Links -->
			<div class="hidden sm:flex items-center gap-0.5">
				{#if isActive('link')}
					<button
						onclick={removeLink}
						class="toolbar-btn !text-destructive hover:!bg-destructive/10"
						title="Remove Link"
						aria-label="Remove link"
					>
						<Unlink class="w-4 h-4" />
					</button>
				{:else}
					<button
						onclick={addLink}
						class="toolbar-btn"
						title="Add Link (Cmd+K)"
						aria-label="Add link"
					>
						<LinkIcon class="w-4 h-4" />
					</button>
				{/if}
				<button
					onclick={addImage}
					class="toolbar-btn"
					title="Add Image"
					aria-label="Add image"
				>
					<ImageIcon class="w-4 h-4" />
				</button>
				<button
					onclick={setHorizontalRule}
					class="toolbar-btn hidden lg:flex"
					title="Horizontal Rule"
					aria-label="Horizontal rule"
				>
					<Minus class="w-4 h-4" />
				</button>
			</div>

			<!-- Spacer -->
			<div class="flex-1 min-w-2"></div>

			<!-- More tools button (mobile/tablet) -->
			<button
				onclick={() => (showMoreTools = !showMoreTools)}
				class="toolbar-btn md:hidden"
				class:active={showMoreTools}
				title="More formatting options"
				aria-label="More formatting options"
				aria-expanded={showMoreTools}
			>
				{#if showMoreTools}
					<ChevronUp class="w-4 h-4" />
				{:else}
					<MoreHorizontal class="w-4 h-4" />
				{/if}
			</button>

			<!-- AI Generate button -->
			<button
				onclick={() => (showAIPanel = !showAIPanel)}
				class="toolbar-btn-ai pressable"
				class:active={showAIPanel}
				title="AI Generate"
				aria-label="AI generate content"
				aria-expanded={showAIPanel}
			>
				<Sparkles class="w-4 h-4" />
				<span class="hidden sm:inline text-xs ml-1">AI</span>
			</button>
		</div>

		<!-- Expanded tools row (mobile/tablet) -->
		{#if showMoreTools}
			<div
				class="md:hidden flex items-center gap-0.5 px-1.5 py-1.5 border-t border-border/50 bg-muted/30 overflow-x-auto scrollbar-hide"
			>
				<!-- Strikethrough (mobile) -->
				<button
					onclick={toggleStrikethrough}
					class="toolbar-btn sm:hidden"
					class:active={isActive('strike')}
					aria-label="Strikethrough"
				>
					<Strikethrough class="w-4 h-4" />
				</button>

				<!-- H3 (mobile) -->
				<button
					onclick={() => setHeading(3)}
					class="toolbar-btn sm:hidden"
					class:active={isActive('heading', { level: 3 })}
					aria-label="Heading 3"
				>
					<Heading3 class="w-4 h-4" />
				</button>

				<!-- Paragraph (mobile/tablet) -->
				<button
					onclick={setParagraph}
					class="toolbar-btn md:hidden"
					class:active={isActive('paragraph') && !isActive('heading')}
					aria-label="Paragraph"
				>
					<Type class="w-4 h-4" />
				</button>

				<div class="toolbar-divider"></div>

				<!-- Quote & Code (mobile) -->
				<button
					onclick={toggleBlockquote}
					class="toolbar-btn sm:hidden"
					class:active={isActive('blockquote')}
					aria-label="Quote"
				>
					<Quote class="w-4 h-4" />
				</button>
				<button
					onclick={toggleCodeBlock}
					class="toolbar-btn sm:hidden"
					class:active={isActive('codeBlock')}
					aria-label="Code block"
				>
					<Code class="w-4 h-4" />
				</button>

				<!-- Horizontal Rule -->
				<button
					onclick={setHorizontalRule}
					class="toolbar-btn lg:hidden"
					aria-label="Horizontal rule"
				>
					<Minus class="w-4 h-4" />
				</button>

				<div class="toolbar-divider"></div>

				<!-- Alignment (mobile/tablet) -->
				<button
					onclick={() => setTextAlign('left')}
					class="toolbar-btn"
					class:active={isActive({ textAlign: 'left' })}
					aria-label="Align left"
				>
					<AlignLeft class="w-4 h-4" />
				</button>
				<button
					onclick={() => setTextAlign('center')}
					class="toolbar-btn"
					class:active={isActive({ textAlign: 'center' })}
					aria-label="Align center"
				>
					<AlignCenter class="w-4 h-4" />
				</button>
				<button
					onclick={() => setTextAlign('right')}
					class="toolbar-btn"
					class:active={isActive({ textAlign: 'right' })}
					aria-label="Align right"
				>
					<AlignRight class="w-4 h-4" />
				</button>

				<div class="toolbar-divider sm:hidden"></div>

				<!-- Media (mobile) -->
				<div class="sm:hidden flex items-center gap-0.5">
					{#if isActive('link')}
						<button
							onclick={removeLink}
							class="toolbar-btn !text-destructive hover:!bg-destructive/10"
							aria-label="Remove link"
						>
							<Unlink class="w-4 h-4" />
						</button>
					{:else}
						<button onclick={addLink} class="toolbar-btn" aria-label="Add link">
							<LinkIcon class="w-4 h-4" />
						</button>
					{/if}
					<button onclick={addImage} class="toolbar-btn" aria-label="Add image">
						<ImageIcon class="w-4 h-4" />
					</button>
				</div>
			</div>
		{/if}
	</div>

	<!-- AI Generation Panel -->
	{#if showAIPanel}
		<div
			class="ai-panel border-b border-accent/30 px-3 py-3 bg-gradient-to-r from-accent/5 via-accent/10 to-accent/5 tx tx-bloom tx-weak"
			role="region"
			aria-label="AI content generation"
		>
			<div class="flex items-start gap-3">
				<div
					class="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/20 text-accent shrink-0"
				>
					<Sparkles class="w-4 h-4" />
				</div>
				<div class="flex-1 min-w-0">
					<label
						for="ai-instructions"
						class="block text-sm font-semibold text-foreground mb-1.5"
					>
						AI Writing Assistant
					</label>
					<p class="text-xs text-muted-foreground mb-2">
						Describe what you want to write. Be specific about tone, length, and key
						points.
					</p>
					<textarea
						id="ai-instructions"
						enterkeyhint="done"
						bind:value={aiInstructions}
						placeholder="E.g., 'Write a compelling introduction about our product launch strategy, focusing on market opportunity and unique value proposition. Keep it professional but engaging, around 200 words.'"
						class="w-full border border-border rounded-lg px-3 py-2.5 text-sm resize-none bg-card text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent/50 shadow-ink-inner transition-all"
						rows="3"
					></textarea>
					<div class="flex items-center justify-end gap-2 mt-3">
						<Button
							onclick={() => (showAIPanel = false)}
							variant="ghost"
							size="sm"
							class="h-8 px-3 text-xs"
						>
							Cancel
						</Button>
						<Button
							onclick={generateWithAI}
							disabled={!aiInstructions.trim() || isGenerating}
							size="sm"
							variant="primary"
							loading={isGenerating}
							class="h-8 px-4 text-xs pressable shadow-ink"
						>
							<Sparkles class="w-3.5 h-3.5 mr-1.5" />
							{isGenerating ? 'Generating...' : 'Generate Content'}
						</Button>
					</div>
				</div>
				<button
					onclick={() => (showAIPanel = false)}
					class="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-all"
					aria-label="Close AI panel"
				>
					<X class="w-4 h-4" />
				</button>
			</div>
		</div>
	{/if}

	<!-- Editor Content -->
	<div class="editor-content flex-1 overflow-y-auto bg-background">
		<div bind:this={editorElement} class="editor px-4 py-4 sm:px-5 sm:py-5 lg:px-6"></div>
	</div>

	<!-- Footer Stats Bar -->
	<div
		class="editor-footer border-t border-border px-3 py-2 bg-muted/30 flex items-center justify-between text-[10px] sm:text-xs text-muted-foreground"
	>
		<div class="flex items-center gap-2 sm:gap-3">
			<span class="font-medium tabular-nums">
				{wordCount.toLocaleString()}
				{wordCount === 1 ? 'word' : 'words'}
			</span>
			<span class="hidden sm:inline text-muted-foreground/60">|</span>
			<span class="hidden sm:inline tabular-nums"
				>{charCount.toLocaleString()} characters</span
			>
			{#if props.target_word_count}
				<span class="hidden md:inline text-muted-foreground/60">|</span>
				<span class="hidden md:flex items-center gap-1">
					<span>Target: {(props.target_word_count as number).toLocaleString()}</span>
					{#if wordCount > 0}
						{@const progress = Math.round(
							(wordCount / (props.target_word_count as number)) * 100
						)}
						<span
							class="px-1.5 py-0.5 rounded-full text-[9px] font-medium {progress >=
							100
								? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
								: progress >= 75
									? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
									: 'bg-muted text-muted-foreground'}"
						>
							{progress}%
						</span>
					{/if}
				</span>
			{/if}
		</div>
		{#if propsData.typeKey}
			<div
				class="font-mono text-[9px] sm:text-[10px] truncate max-w-[100px] sm:max-w-[200px] opacity-60 bg-muted/50 px-1.5 py-0.5 rounded"
			>
				{propsData.typeKey}
			</div>
		{/if}
	</div>
</div>

<style>
	/* Hide scrollbar but allow scroll */
	.scrollbar-hide {
		-ms-overflow-style: none;
		scrollbar-width: none;
	}
	.scrollbar-hide::-webkit-scrollbar {
		display: none;
	}

	/* Toolbar button base - touch-friendly 36px min */
	.toolbar-btn {
		@apply flex items-center justify-center
			w-9 h-9 sm:w-8 sm:h-8
			rounded-md
			text-muted-foreground
			transition-all duration-150
			hover:bg-accent/10 hover:text-foreground
			focus:outline-none focus-visible:ring-2 focus-visible:ring-ring
			active:scale-95;
	}

	.toolbar-btn.active {
		@apply bg-accent/20 text-accent font-medium;
	}

	.toolbar-btn.disabled,
	.toolbar-btn:disabled {
		@apply opacity-40 cursor-not-allowed hover:bg-transparent hover:text-muted-foreground active:scale-100;
	}

	/* Destructive variant for unlink button - using inline styles to avoid @apply circular dependency */

	/* AI button - special styling */
	.toolbar-btn-ai {
		@apply flex items-center justify-center
			h-9 sm:h-8 px-2.5
			rounded-md
			text-accent
			font-medium
			transition-all duration-150
			hover:bg-accent/10
			focus:outline-none focus-visible:ring-2 focus-visible:ring-ring
			active:scale-95;
	}

	.toolbar-btn-ai.active {
		@apply bg-accent/20;
	}

	/* Toolbar divider */
	.toolbar-divider {
		@apply w-px h-5 bg-border/50 mx-0.5;
	}

	/* Editor container styles */
	:global(.editor) {
		@apply min-h-[200px] sm:min-h-[300px];
	}

	/* Prose styles for editor content */
	:global(.editor p) {
		@apply my-2 text-foreground leading-relaxed;
	}

	:global(.editor h1) {
		@apply text-2xl sm:text-3xl font-bold my-3 text-foreground;
	}

	:global(.editor h2) {
		@apply text-xl sm:text-2xl font-bold my-2.5 text-foreground;
	}

	:global(.editor h3) {
		@apply text-lg sm:text-xl font-semibold my-2 text-foreground;
	}

	:global(.editor ul),
	:global(.editor ol) {
		@apply pl-6 my-2 text-foreground;
	}

	:global(.editor li) {
		@apply my-1;
	}

	:global(.editor blockquote) {
		@apply border-l-4 border-accent/50 pl-4 my-3 italic text-muted-foreground;
	}

	:global(.editor pre) {
		@apply bg-muted rounded-md p-3 my-3 overflow-x-auto text-sm;
	}

	:global(.editor code) {
		@apply bg-muted px-1.5 py-0.5 rounded text-sm font-mono;
	}

	:global(.editor pre code) {
		@apply bg-transparent p-0;
	}

	:global(.editor a) {
		@apply text-accent underline hover:text-accent/80;
	}

	:global(.editor img) {
		@apply max-w-full h-auto rounded-lg my-3;
	}

	:global(.editor hr) {
		@apply border-border my-4;
	}

	/* Selection colors */
	:global(.editor ::selection) {
		background-color: hsl(var(--accent) / 0.2);
	}

	/* Prosemirror focus */
	:global(.editor .ProseMirror) {
		@apply outline-none;
	}

	/* Placeholder styling */
	:global(.editor .ProseMirror p.is-editor-empty:first-child::before) {
		@apply text-muted-foreground pointer-events-none;
		content: attr(data-placeholder);
		float: left;
		height: 0;
	}

	/* Touch optimization */
	.editor-toolbar {
		-webkit-tap-highlight-color: transparent;
	}
</style>
