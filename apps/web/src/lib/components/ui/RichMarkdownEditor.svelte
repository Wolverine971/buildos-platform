<!-- apps/web/src/lib/components/ui/RichMarkdownEditor.svelte -->
<script module lang="ts">
	let richMarkdownIdCounter = 0;
</script>

<script lang="ts">
	import { onDestroy, tick, untrack } from 'svelte';
	import CodeMirrorEditor from './codemirror/CodeMirrorEditor.svelte';
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
		Image as ImageIcon,
		Eye,
		Edit3,
		MoreHorizontal,
		ChevronUp,
		Sparkles
	} from 'lucide-svelte';
	import { renderMarkdown, getProseClasses } from '$lib/utils/markdown';
	import VoiceMicButton from '$lib/components/voice/VoiceMicButton.svelte';
	import VoiceStatusLine from '$lib/components/voice/VoiceStatusLine.svelte';
	import { VoiceDictation } from '$lib/voice/dictation-session.svelte';
	import {
		createVoiceNoteSink,
		scheduleVoiceDraftCleanup,
		type SavedRecording
	} from '$lib/voice/voice-note-sink';
	import type { VoiceNote } from '$lib/types/voice-notes';
	import { browser } from '$app/environment';
	import { haptic } from '$lib/utils/haptic';
	import { spliceDictationIntoMarkdown, type DictationRange } from './rich-markdown-editor-voice';

	type EditorSize = 'sm' | 'base' | 'lg';
	type ToolbarAction =
		| 'bold'
		| 'italic'
		| 'h1'
		| 'h2'
		| 'ul'
		| 'ol'
		| 'quote'
		| 'code'
		| 'link'
		| 'image';
	type EditorViewState = {
		anchor: number;
		head: number;
		scrollTop: number;
		scrollLeft: number;
		hadFocus: boolean;
	};

	interface Props {
		value?: string;
		id?: string;
		label?: string;
		helpText?: string;
		placeholder?: string;
		required?: boolean;
		disabled?: boolean;
		maxLength?: number;
		/** @deprecated No longer used with CodeMirror editor */
		rows?: number;
		size?: EditorSize;
		/** When true, the editor expands to fill its parent container height */
		fillHeight?: boolean;
		class?: string;
		// Voice recording props
		enableVoice?: boolean;
		voiceBlocked?: boolean;
		voiceBlockedLabel?: string;
		transcriptionEndpoint?: string;
		vocabularyTerms?: string;
		// Voice note storage props
		voiceNoteSource?: string;
		voiceNoteLinkedEntityType?: string;
		voiceNoteLinkedEntityId?: string;
		voiceNoteGroupId?: string | null;
		onVoiceNoteGroupReady?: (groupId: string) => void;
		onVoiceNoteSegmentSaved?: (voiceNote: VoiceNote) => void;
		onVoiceNoteSegmentError?: (error: string) => void;
		/** Callback on Cmd/Ctrl+S */
		onSave?: () => void;
		/** Optional handler to launch image insert picker */
		onInsertImageRequested?: () => void;
		/** Called on every document change (replaces onchange/oninput) */
		onDocChange?: (value: string) => void;
		/** Launch an agent proposal for the currently selected Markdown. */
		onProposeSelection?: (selection: {
			from: number;
			to: number;
			markdown: string;
		}) => void | Promise<void>;
		// Bindable voice state
		isRecording?: boolean;
		isTranscribing?: boolean;
		voiceError?: string;
		recordingDuration?: number;
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
		rows: _rows = 12,
		size = 'base',
		fillHeight = false,
		class: className = '',
		// Voice props
		enableVoice = true,
		voiceBlocked = false,
		voiceBlockedLabel = 'Recording unavailable right now',
		transcriptionEndpoint = '/api/transcribe',
		vocabularyTerms = '',
		// Voice note storage
		voiceNoteSource = '',
		voiceNoteLinkedEntityType = '',
		voiceNoteLinkedEntityId = '',
		voiceNoteGroupId = $bindable(null),
		onVoiceNoteGroupReady,
		onVoiceNoteSegmentSaved,
		onVoiceNoteSegmentError,
		onSave,
		onInsertImageRequested,
		onDocChange,
		onProposeSelection,
		// Bindable voice state
		isRecording = $bindable(false),
		isTranscribing = $bindable(false),
		voiceError = $bindable(''),
		recordingDuration = $bindable(0)
	}: Props = $props();

	let mode = $state<'edit' | 'preview'>('edit');
	let editorRef = $state<CodeMirrorEditor | null>(null);
	let showMoreTools = $state(false);
	let currentSelection = $state({ from: 0, to: 0 });
	const generatedId = `rich-markdown-${++richMarkdownIdCounter}`;
	const editorId = $derived(id ?? generatedId);

	// ============================================
	// Voice Dictation
	// ============================================
	// Words land inline at the insertion point while the user talks (see
	// codemirror/voice-widget.ts). The widget's position maps through edits,
	// so the final transcript lands where dictation started.
	let isVoiceButtonHovered = $state(false);
	let isVoiceButtonFocused = $state(false);
	let savedRecording: SavedRecording | null = null;
	let isDestroyed = false;
	/** Last known dictation range, so a commit while in Preview still lands in place. */
	let dictationRange: DictationRange | null = null;

	const isTouchDevice = $derived(
		browser &&
			typeof navigator !== 'undefined' &&
			('ontouchstart' in window || navigator.maxTouchPoints > 0)
	);

	const sink = createVoiceNoteSink({
		source: () => voiceNoteSource || 'rich-markdown-editor',
		getGroupId: () => voiceNoteGroupId,
		setGroupId: (groupId) => {
			voiceNoteGroupId = groupId;
			onVoiceNoteGroupReady?.(groupId);
		},
		// Linked recordings are created "attached" so the 24h draft cleanup keeps them.
		linkedEntity: () =>
			voiceNoteLinkedEntityType && voiceNoteLinkedEntityId
				? { type: voiceNoteLinkedEntityType, id: voiceNoteLinkedEntityId }
				: null,
		onSaved: (note) => onVoiceNoteSegmentSaved?.(note),
		onError: (message) => onVoiceNoteSegmentError?.(message)
	});

	const dictation = new VoiceDictation({
		vocabulary: () => vocabularyTerms,
		endpoint: () => transcriptionEndpoint,
		onAudio: ({ audio, durationSeconds }) => {
			savedRecording = sink.save(audio, durationSeconds);
		},
		onCommit: (result) => {
			commitDictationText(result.text);
			savedRecording?.complete(result);
			savedRecording = null;
		}
	});

	// ============================================
	// Derived State
	// ============================================
	const stats = $derived({
		words: value.trim() ? value.trim().split(/\s+/).length : 0,
		chars: value.length
	});
	const hasProposalSelection = $derived(currentSelection.to > currentSelection.from);

	function handleSelectionChange(selection: { from: number; to: number }) {
		currentSelection = selection;
	}

	function handleProposeSelection() {
		if (!onProposeSelection || !hasProposalSelection) return;
		void onProposeSelection({
			...currentSelection,
			markdown: value.slice(currentSelection.from, currentSelection.to)
		});
	}

	const labelSizeClass = $derived(size === 'lg' ? 'text-base' : 'text-sm');

	const proseSize = $derived(size === 'sm' ? 'sm' : size === 'lg' ? 'lg' : 'base');
	const proseClasses = $derived(getProseClasses(proseSize));

	// Primary toolbar buttons (always visible)
	const primaryToolbarButtons: Array<{ id: ToolbarAction; icon: typeof Bold; label: string }> = [
		{ id: 'bold', icon: Bold, label: 'Bold' },
		{ id: 'italic', icon: Italic, label: 'Italic' },
		{ id: 'h1', icon: Heading1, label: 'Heading 1' },
		{ id: 'h2', icon: Heading2, label: 'Heading 2' },
		{ id: 'ul', icon: List, label: 'Bulleted list' },
		{ id: 'ol', icon: ListOrdered, label: 'Numbered list' }
	];

	// Secondary toolbar buttons (overflow on mobile)
	const secondaryToolbarButtons = $derived.by(() => {
		const buttons: Array<{ id: ToolbarAction; icon: typeof Bold; label: string }> = [
			{ id: 'quote', icon: Quote, label: 'Quote' },
			{ id: 'code', icon: Code, label: 'Code' },
			{ id: 'link', icon: LinkIcon, label: 'Link' }
		];

		if (onInsertImageRequested) {
			buttons.push({ id: 'image', icon: ImageIcon, label: 'Image' });
		}

		return buttons;
	});

	const shouldShowVoiceInsertHint = $derived(
		Boolean(editorRef) &&
			(isVoiceButtonHovered || isVoiceButtonFocused) &&
			mode === 'edit' &&
			enableVoice &&
			dictation.supported &&
			!voiceBlocked &&
			!disabled &&
			!dictation.isBusy
	);

	// Mirror engine state into the host bindings.
	$effect(() => {
		isRecording = dictation.phase === 'recording';
		isTranscribing = dictation.phase === 'finishing';
		voiceError =
			dictation.error && dictation.error.code !== 'draft-fallback'
				? dictation.error.message
				: '';
		recordingDuration = Math.floor(dictation.elapsedMs / 1000);
	});

	// Show/hide the inline dictation widget with the dictation lifecycle, including
	// when the editor remounts (Preview → Edit) while dictation is still finishing.
	$effect(() => {
		const editor = editorRef;
		const busy = dictation.isBusy;
		if (!editor) return;
		const showing = untrack(() => editor.getDictationTarget()) !== null;
		if (busy && !showing) {
			const range = untrack(() => clampRange(dictationRange ?? endRange()));
			editor.beginDictation(range);
		} else if (!busy && showing) {
			editor.cancelDictation();
		}
	});

	// Words land inline as they arrive.
	$effect(() => {
		const confirmed = dictation.confirmedText;
		const draft = dictation.draftText;
		const listening = dictation.phase === 'recording';
		if (!editorRef || !dictation.isBusy) return;
		editorRef.updateDictation(confirmed, draft, listening);
		rememberDictationRange();
	});

	$effect(() => {
		if (!editorRef) return;
		if (shouldShowVoiceInsertHint) {
			editorRef.showVoiceInsertHint();
			return;
		}
		editorRef.hideVoiceInsertHint();
	});

	// ============================================
	// Toolbar Commands (delegated to CodeMirror)
	// ============================================
	function handleToolbar(action: ToolbarAction) {
		if (disabled || !editorRef) return;

		switch (action) {
			case 'bold':
				editorRef.execBold();
				break;
			case 'italic':
				editorRef.execItalic();
				break;
			case 'h1':
				editorRef.execH1();
				break;
			case 'h2':
				editorRef.execH2();
				break;
			case 'ul':
				editorRef.execBulletList();
				break;
			case 'ol':
				editorRef.execOrderedList();
				break;
			case 'quote':
				editorRef.execBlockquote();
				break;
			case 'code':
				editorRef.execCodeBlock();
				break;
			case 'link':
				editorRef.execLink();
				break;
			case 'image':
				onInsertImageRequested?.();
				break;
		}
	}

	function toggleMode(nextMode: 'edit' | 'preview') {
		if (nextMode === 'preview') {
			// The editor unmounts in Preview; remember where dictation lands first.
			rememberDictationRange();
			if (dictation.phase === 'recording') requestStop();
			editorRef?.hideVoiceInsertHint();
		}
		mode = nextMode;
		if (nextMode === 'edit') {
			editorRef?.focus();
		}
	}

	function handleVoiceButtonMouseEnter() {
		isVoiceButtonHovered = true;
	}

	function handleVoiceButtonMouseLeave() {
		isVoiceButtonHovered = false;
	}

	function handleVoiceButtonFocus() {
		isVoiceButtonFocused = true;
	}

	function handleVoiceButtonBlur() {
		isVoiceButtonFocused = false;
	}

	// ============================================
	// Voice Dictation Functions
	// ============================================
	function endRange(): DictationRange {
		return { from: value.length, to: value.length };
	}

	function clampRange(range: DictationRange): DictationRange {
		const clamp = (offset: number) => Math.min(Math.max(offset, 0), value.length);
		return { from: clamp(range.from), to: clamp(range.to) };
	}

	function rememberDictationRange() {
		const target = editorRef?.getDictationTarget();
		if (!target) return;
		dictationRange =
			target.replaceFrom !== null &&
			target.replaceTo !== null &&
			target.replaceTo === target.pos
				? { from: target.replaceFrom, to: target.replaceTo }
				: { from: target.pos, to: target.pos };
	}

	function commitDictationText(text: string) {
		if (!isDestroyed && editorRef?.getView()) {
			const landed = editorRef.commitDictation(text, { focus: !isTouchDevice });
			if (landed) {
				dictationRange = null;
				return;
			}
		}
		// The editor is unmounted (Preview, or closed mid-transcription): splice
		// straight into the markdown so the words are never lost.
		const next = spliceDictationIntoMarkdown(value, dictationRange, text);
		dictationRange = null;
		if (next !== value) {
			value = next;
			onDocChange?.(next);
		}
	}

	async function startDictation() {
		if (!enableVoice || voiceBlocked || disabled || mode === 'preview' || dictation.isBusy) {
			return;
		}
		editorRef?.hideVoiceInsertHint();
		const selection = editorRef?.getSelection();
		dictationRange = selection ? { from: selection.from, to: selection.to } : endRange();
		editorRef?.beginDictation(dictationRange);
		const started = await dictation.start();
		if (!started) {
			editorRef?.cancelDictation();
			dictationRange = null;
		}
	}

	function requestStop() {
		void dictation.stop();
	}

	function toggleVoice() {
		haptic('light');
		if (dictation.phase === 'recording') requestStop();
		else if (dictation.phase === 'idle') void startDictation();
	}

	// Enter outside text inputs finishes recording. Inside the editor, Enter and
	// Space keep typing (the editor stays editable while dictating).
	function handleGlobalKeyDown(event: KeyboardEvent) {
		if (dictation.phase !== 'recording' || event.key !== 'Enter') return;
		const active = document.activeElement;
		const typing =
			active instanceof HTMLInputElement ||
			active instanceof HTMLTextAreaElement ||
			(active instanceof HTMLElement && active.isContentEditable);
		if (typing) return;
		event.preventDefault();
		requestStop();
	}

	$effect(() => {
		if (!browser || dictation.phase !== 'recording') return;
		document.addEventListener('keydown', handleGlobalKeyDown);
		return () => document.removeEventListener('keydown', handleGlobalKeyDown);
	});

	// ============================================
	// Lifecycle
	// ============================================
	$effect(() => {
		if ((voiceBlocked || disabled || !enableVoice) && dictation.isCapturing) {
			requestStop();
		}
	});

	$effect(() => {
		if (enableVoice) scheduleVoiceDraftCleanup();
	});

	onDestroy(() => {
		rememberDictationRange();
		isDestroyed = true;
		// A recording in progress is finished and saved, not thrown away.
		dictation.destroy();
	});

	// ============================================
	// Exported Functions
	// ============================================
	/** Stop and wait until the transcript is in the document. */
	export async function stopRecording() {
		if (dictation.phase === 'starting') dictation.cancel();
		else await dictation.stop();
	}

	export async function cleanup() {
		await stopRecording();
	}

	export async function insertAtCursor(markdown: string) {
		if (!markdown.trim()) return;
		if (mode !== 'edit') {
			mode = 'edit';
			await tick();
		}
		editorRef?.insertAtCursor(markdown);
		editorRef?.focus();
	}

	export function captureViewState(): EditorViewState | null {
		return editorRef?.captureViewState() ?? null;
	}

	export function focus() {
		editorRef?.focus();
	}

	export async function restoreViewState(snapshot: EditorViewState | null): Promise<void> {
		if (!snapshot || mode !== 'edit') return;
		await tick();
		editorRef?.restoreViewState(snapshot);
	}

	export function getSelection(): { from: number; to: number; markdown: string } {
		const selection = editorRef?.getSelection() ?? currentSelection;
		return { ...selection, markdown: value.slice(selection.from, selection.to) };
	}
</script>

<div class={`${fillHeight ? 'flex flex-col h-full' : 'space-y-2'} ${className}`}>
	{#if label}
		<div class="flex items-center justify-between">
			<label for={editorId} class="font-medium text-foreground {labelSizeClass}">
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
		class="rounded-xl border border-border bg-card shadow-ink overflow-hidden tx tx-frame tx-weak {fillHeight
			? 'flex-1 flex flex-col min-h-0'
			: ''}"
	>
		<!-- Header: Unified toolbar row -->
		<div class="border-b border-border bg-muted/30 shrink-0">
			<div class="flex items-center px-2 py-1.5 sm:px-3">
				<!-- Segmented Control for Edit/Preview -->
				<div
					class="inline-flex rounded-lg bg-muted/60 p-0.5 border border-border/50 shrink-0"
					role="tablist"
				>
					<button
						type="button"
						role="tab"
						aria-label="Edit"
						aria-selected={mode === 'edit'}
						class="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-all duration-150 {mode ===
						'edit'
							? 'bg-card text-foreground shadow-ink'
							: 'text-muted-foreground hover:text-foreground'}"
						onclick={() => toggleMode('edit')}
					>
						<Edit3 class="w-3.5 h-3.5" />
						<span class="hidden xs:inline">Edit</span>
					</button>
					<button
						type="button"
						role="tab"
						aria-label="Preview"
						aria-selected={mode === 'preview'}
						class="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-all duration-150 {mode ===
						'preview'
							? 'bg-card text-foreground shadow-ink'
							: 'text-muted-foreground hover:text-foreground'}"
						onclick={() => toggleMode('preview')}
					>
						<Eye class="w-3.5 h-3.5" />
						<span class="hidden xs:inline">Preview</span>
					</button>
				</div>

				<!-- Formatting toolbar inline (edit mode only) -->
				{#if mode === 'edit'}
					<div class="w-px h-5 bg-border/50 mx-1.5 shrink-0"></div>
					<div
						class="flex items-center gap-0.5 overflow-x-auto scrollbar-hide flex-1 min-w-0"
					>
						{#if onProposeSelection}
							<button
								type="button"
								onmousedown={(event) => event.preventDefault()}
								onclick={handleProposeSelection}
								class="mr-0.5 inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-accent/30 bg-accent/10 px-2 text-xs font-semibold text-accent transition-colors hover:bg-accent/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-40 sm:h-7"
								title={hasProposalSelection
									? 'Ask the agent to revise this selection'
									: 'Select text to ask the agent'}
								aria-label="Ask the agent to revise selected text"
								disabled={disabled || !hasProposalSelection}
							>
								<Sparkles class="h-3.5 w-3.5" />
								<span>Ask</span>
							</button>
							<div class="mx-0.5 h-5 w-px shrink-0 bg-border/50"></div>
						{/if}
						{#each primaryToolbarButtons as action (action.id)}
							{@const ActionIcon = action.icon}
							<button
								type="button"
								onmousedown={(e) => e.preventDefault()}
								onclick={() => handleToolbar(action.id)}
								class="flex items-center justify-center w-8 h-8 sm:w-7 sm:h-7 rounded-md text-muted-foreground hover:bg-accent/10 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40 disabled:cursor-not-allowed transition-colors active:scale-95 shrink-0"
								title={action.label}
								aria-label={action.label}
								{disabled}
							>
								<ActionIcon class="w-4 h-4" />
							</button>
						{/each}

						<div class="w-px h-5 bg-border/50 mx-0.5 hidden sm:block shrink-0"></div>

						{#each secondaryToolbarButtons as action (action.id)}
							{@const ActionIcon = action.icon}
							<button
								type="button"
								onmousedown={(e) => e.preventDefault()}
								onclick={() => handleToolbar(action.id)}
								class="hidden sm:flex items-center justify-center w-7 h-7 rounded-md text-muted-foreground hover:bg-accent/10 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40 disabled:cursor-not-allowed transition-colors active:scale-95 shrink-0"
								title={action.label}
								aria-label={action.label}
								{disabled}
							>
								<ActionIcon class="w-4 h-4" />
							</button>
						{/each}

						<!-- More button (mobile only) -->
						<button
							type="button"
							onclick={() => (showMoreTools = !showMoreTools)}
							class="sm:hidden flex items-center justify-center w-8 h-8 rounded-md transition-colors active:scale-95 shrink-0 {showMoreTools
								? 'bg-accent/20 text-accent'
								: 'text-muted-foreground hover:bg-accent/10 hover:text-foreground'}"
							title="More formatting"
							aria-label="More formatting options"
							aria-expanded={showMoreTools}
						>
							{#if showMoreTools}
								<ChevronUp class="w-4 h-4" />
							{:else}
								<MoreHorizontal class="w-4 h-4" />
							{/if}
						</button>
					</div>
				{/if}

				<!-- Stats (hidden on mobile in edit mode to save space) -->
				<div
					class="{mode === 'edit'
						? 'hidden sm:flex'
						: 'flex'} items-center gap-2 text-2xs sm:text-xs text-muted-foreground ml-auto pl-2 shrink-0"
				>
					<span class="tabular-nums">{stats.words}w</span>
					<span class="hidden sm:inline text-border">·</span>
					<span class="hidden sm:inline tabular-nums">{stats.chars}c</span>
					{#if maxLength}
						<span class="hidden md:inline text-border">·</span>
						<span class="hidden md:inline tabular-nums"
							>{Math.max(0, maxLength - stats.chars)} left</span
						>
					{/if}
				</div>
			</div>

			<!-- Expanded tools (mobile only, edit mode) -->
			{#if mode === 'edit' && showMoreTools}
				<div
					class="sm:hidden flex items-center gap-0.5 px-1.5 py-1.5 border-t border-border/30 bg-muted/10"
				>
					{#each secondaryToolbarButtons as action (action.id)}
						{@const ActionIcon = action.icon}
						<button
							type="button"
							onmousedown={(e) => e.preventDefault()}
							onclick={() => {
								handleToolbar(action.id);
								showMoreTools = false;
							}}
							class="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium text-muted-foreground hover:bg-accent/10 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40 transition-colors active:scale-95"
							title={action.label}
							aria-label={action.label}
							{disabled}
						>
							<ActionIcon class="w-3.5 h-3.5" />
							<span>{action.label}</span>
						</button>
					{/each}
				</div>
			{/if}
		</div>

		<!-- Content area -->
		{#if mode === 'edit'}
			<CodeMirrorEditor
				bind:this={editorRef}
				bind:value
				{placeholder}
				readOnly={disabled}
				{disabled}
				{maxLength}
				{fillHeight}
				{onSave}
				onDocChange={(next: string) => {
					if (dictation.isBusy) rememberDictationRange();
					onDocChange?.(next);
				}}
				onSelectionChange={handleSelectionChange}
				class={fillHeight ? 'flex-1' : ''}
			/>
		{:else}
			<div
				class="px-4 py-4 bg-card overflow-y-auto {fillHeight
					? 'flex-1 min-h-0'
					: 'min-h-[200px]'}"
			>
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

		<!-- Footer with voice controls: status readable at every width -->
		{#if enableVoice}
			<div
				class="shrink-0 flex items-center justify-between gap-2 px-2 py-1.5 sm:px-3 sm:py-2 border-t border-border bg-muted/30 text-xs text-muted-foreground"
			>
				<div class="min-w-0 flex-1" aria-live="polite">
					{#if dictation.isBusy || dictation.error}
						<VoiceStatusLine
							{dictation}
							listeningLabel="Recording"
							preparingLabel="Preparing mic…"
							showKeyHint={false}
						/>
					{:else if mode === 'preview'}
						<span class="text-2xs text-muted-foreground/60 hidden sm:inline">
							Switch to Edit to record
						</span>
					{:else}
						<span class="text-2xs text-muted-foreground/60 hidden sm:inline">
							Tap mic to dictate at the cursor
						</span>
					{/if}
				</div>

				<span
					class="shrink-0"
					role="presentation"
					onmouseenter={handleVoiceButtonMouseEnter}
					onmouseleave={handleVoiceButtonMouseLeave}
					onfocusin={handleVoiceButtonFocus}
					onfocusout={handleVoiceButtonBlur}
				>
					<VoiceMicButton
						{dictation}
						{disabled}
						blocked={voiceBlocked || mode === 'preview'}
						blockedLabel={mode === 'preview'
							? 'Switch to edit mode to record'
							: voiceBlockedLabel}
						label="Dictate at cursor"
						onclick={toggleVoice}
					/>
				</span>
			</div>
		{/if}
	</div>

	{#if helpText}
		<p class="text-xs text-muted-foreground">{helpText}</p>
	{/if}
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
</style>
