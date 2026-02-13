<!-- apps/web/src/lib/components/ontology/DocumentEditor.svelte -->
<!--
	Rich Document Editor - Mobile-First Design

	Features:
	- TipTap-based WYSIWYG editing
	- Mobile-optimized touch toolbar (44px targets)
	- Collapsible toolbar groups on mobile
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
		FileText,
		ChevronDown,
		ChevronUp,
		Type,
		Minus,
		Quote,
		Code,
		MoreHorizontal,
		Undo,
		Redo,
		Strikethrough,
		Mic,
		MicOff,
		LoaderCircle,
		X
	} from 'lucide-svelte';
	import {
		voiceRecordingService,
		type TranscriptionService
	} from '$lib/services/voiceRecording.service';
	import { liveTranscript } from '$lib/utils/voice';
	import { browser } from '$app/environment';
	import { haptic } from '$lib/utils/haptic';
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

	// Mobile toolbar state
	let showMoreTools = $state(false);
	let isMobile = $state(false);

	// Voice recording state
	let isVoiceSupported = $state(false);
	let isRecording = $state(false);
	let isInitializingRecording = $state(false);
	let isTranscribing = $state(false);
	let voiceError = $state('');
	let recordingDuration = $state(0);
	let canUseLiveTranscript = $state(false);
	let liveTranscriptPreview = $state('');
	let voiceInitialized = $state(false);
	let microphonePermissionGranted = $state(false);
	let durationUnsubscribe: (() => void) | null = null;
	let transcriptUnsubscribe: (() => void) | null = null;

	// Timeout ID for cleanup
	let successTimeoutId: number | null = null;
	let voiceErrorTimeoutId: number | null = null;

	// Auto-dismiss voice error after 5 seconds
	$effect(() => {
		if (voiceError) {
			if (voiceErrorTimeoutId !== null) {
				clearTimeout(voiceErrorTimeoutId);
			}
			voiceErrorTimeoutId = window.setTimeout(() => {
				voiceError = '';
				voiceErrorTimeoutId = null;
			}, 5000);
		}
		return () => {
			if (voiceErrorTimeoutId !== null) {
				clearTimeout(voiceErrorTimeoutId);
				voiceErrorTimeoutId = null;
			}
		};
	});

	// Dismiss voice error manually
	function dismissVoiceError() {
		voiceError = '';
		if (voiceErrorTimeoutId !== null) {
			clearTimeout(voiceErrorTimeoutId);
			voiceErrorTimeoutId = null;
		}
	}

	// Derived state for props
	const currentProps = $derived({
		...props,
		content,
		word_count: wordCount,
		content_type: 'html'
	});

	// Voice button state types
	type VoiceButtonVariant = 'muted' | 'loading' | 'recording' | 'ready';
	type VoiceButtonState = {
		icon: typeof Mic;
		label: string;
		disabled: boolean;
		isLoading: boolean;
		variant: VoiceButtonVariant;
	};

	// Voice button state machine
	const voiceButtonState = $derived.by((): VoiceButtonState => {
		if (!isVoiceSupported) {
			return {
				icon: MicOff,
				label: 'Voice unavailable',
				disabled: true,
				isLoading: false,
				variant: 'muted'
			};
		}

		if (isRecording) {
			return {
				icon: MicOff,
				label: 'Stop recording',
				disabled: false,
				isLoading: false,
				variant: 'recording'
			};
		}

		if (isInitializingRecording) {
			return {
				icon: LoaderCircle,
				label: 'Preparing microphone...',
				disabled: true,
				isLoading: true,
				variant: 'loading'
			};
		}

		if (isTranscribing) {
			return {
				icon: LoaderCircle,
				label: 'Transcribing...',
				disabled: true,
				isLoading: true,
				variant: 'loading'
			};
		}

		return {
			icon: Mic,
			label: 'Record voice note',
			disabled: false,
			isLoading: false,
			variant: 'ready'
		};
	});

	// Voice button CSS classes based on state
	const voiceButtonClasses = $derived.by(() => {
		const base =
			'flex items-center justify-center h-12 w-12 rounded-full transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 dark:focus-visible:ring-offset-background';

		switch (voiceButtonState.variant) {
			case 'recording':
				return `${base} border-2 border-destructive bg-destructive text-destructive-foreground shadow-ink-strong pressable hover:bg-destructive/90`;
			case 'loading':
				return `${base} border border-border bg-muted text-muted-foreground shadow-ink cursor-wait`;
			case 'muted':
				return `${base} border border-border bg-muted text-muted-foreground/40 cursor-not-allowed`;
			default:
				return `${base} border border-foreground/20 bg-card text-foreground shadow-ink pressable hover:border-foreground/40 hover:bg-muted dark:border-foreground/15 dark:hover:border-foreground/30`;
		}
	});

	// Custom transcription service that inserts at cursor position
	const transcriptionService: TranscriptionService = {
		async transcribeAudio(audioFile: File, vocabTerms?: string) {
			const formData = new FormData();
			formData.append('audio', audioFile);
			if (vocabTerms) {
				formData.append('vocabularyTerms', vocabTerms);
			}

			const response = await fetch('/api/transcribe', {
				method: 'POST',
				body: formData
			});

			if (!response.ok) {
				let errorMessage = `Transcription failed: ${response.status}`;
				try {
					const errorPayload = await response.json();
					if (errorPayload?.error) {
						errorMessage = errorPayload.error;
					}
				} catch {
					// Ignore JSON parse errors
				}
				throw new Error(errorMessage);
			}

			const result = await response.json();
			const payload = result?.success && result?.data ? result.data : result;

			if (payload?.transcript) {
				const transcript = payload.transcript.trim();
				// Insert at cursor position in TipTap editor
				insertTranscriptionAtCursor(transcript);

				return {
					transcript,
					transcriptionModel: payload.transcription_model ?? null,
					transcriptionService: payload.transcription_service ?? null
				};
			}

			throw new Error('No transcript returned from transcription service');
		}
	};

	// Insert transcribed text at current cursor position
	function insertTranscriptionAtCursor(text: string) {
		if (!editor || !text.trim()) return;

		// Focus and insert at cursor position
		// If there's existing content, add a space before the transcription
		const { from } = editor.state.selection;
		const textBefore = editor.state.doc.textBetween(Math.max(0, from - 1), from);
		const needsSpace = textBefore && !/\s/.test(textBefore);

		editor
			.chain()
			.focus()
			.insertContent(needsSpace ? ' ' + text : text)
			.run();

		isDirty = true;
	}

	// Initialize voice recording service
	function initializeVoice() {
		if (voiceInitialized || !browser) return;

		isVoiceSupported = voiceRecordingService.isVoiceSupported();
		canUseLiveTranscript = voiceRecordingService.isLiveTranscriptSupported();

		if (!isVoiceSupported) {
			voiceInitialized = true;
			return;
		}

		voiceRecordingService.initialize(
			{
				onTextUpdate: (_text: string) => {
					// We don't use this callback - we handle insertion ourselves via transcriptionService
					// This is designed for textarea replacement, not cursor insertion
				},
				onError: (errorMessage: string) => {
					voiceError = errorMessage;
					isRecording = false;
					isInitializingRecording = false;
				},
				onPhaseChange: (phase: 'idle' | 'transcribing') => {
					isTranscribing = phase === 'transcribing';
				},
				onPermissionGranted: () => {
					microphonePermissionGranted = true;
					voiceError = '';
				},
				onCapabilityUpdate: (update: { canUseLiveTranscript: boolean }) => {
					canUseLiveTranscript = update.canUseLiveTranscript;
				}
			},
			transcriptionService
		);

		// Subscribe to recording duration
		const durationStore = voiceRecordingService.getRecordingDuration();
		durationUnsubscribe = durationStore.subscribe((newDuration) => {
			recordingDuration = newDuration;
		});

		// Subscribe to live transcript
		transcriptUnsubscribe = liveTranscript.subscribe((text) => {
			liveTranscriptPreview = text;
		});

		voiceInitialized = true;
	}

	// Start voice recording
	async function startVoiceRecording() {
		if (!isVoiceSupported || isInitializingRecording || isRecording || isTranscribing) {
			return;
		}

		voiceError = '';
		isInitializingRecording = true;

		try {
			// Pass empty string since we're inserting at cursor, not appending to existing text
			await voiceRecordingService.startRecording('');
			isInitializingRecording = false;
			isRecording = true;
			microphonePermissionGranted = true;
		} catch (error) {
			console.error('Failed to start voice recording:', error);
			const message =
				error instanceof Error
					? error.message
					: 'Unable to access microphone. Please check permissions.';
			voiceError = message;
			microphonePermissionGranted = false;
			isInitializingRecording = false;
			isRecording = false;
		}
	}

	// Stop voice recording
	async function stopVoiceRecording() {
		if (!isRecording && !isInitializingRecording) {
			return;
		}

		try {
			// Pass empty string since we handle insertion via transcriptionService
			await voiceRecordingService.stopRecording('');
		} catch (error) {
			console.error('Failed to stop voice recording:', error);
			const message =
				error instanceof Error ? error.message : 'Failed to stop recording. Try again.';
			voiceError = message;
		} finally {
			liveTranscriptPreview = '';
			isRecording = false;
			isInitializingRecording = false;
		}
	}

	// Toggle voice recording
	async function toggleVoiceRecording() {
		if (!isVoiceSupported) return;

		// Haptic feedback for mobile
		haptic('light');

		if (isRecording || isInitializingRecording) {
			await stopVoiceRecording();
		} else {
			await startVoiceRecording();
		}
	}

	// Cleanup voice resources
	function cleanupVoice() {
		if (!voiceInitialized) return;

		durationUnsubscribe?.();
		transcriptUnsubscribe?.();
		durationUnsubscribe = null;
		transcriptUnsubscribe = null;

		voiceRecordingService.cleanup();

		isRecording = false;
		isInitializingRecording = false;
		isTranscribing = false;
		recordingDuration = 0;
		liveTranscriptPreview = '';
		voiceInitialized = false;
	}

	// Format duration for display
	function formatDuration(seconds: number): string {
		const mins = Math.floor(seconds / 60);
		const secs = seconds % 60;
		return `${mins}:${secs.toString().padStart(2, '0')}`;
	}

	// Keyboard handler for stopping recording with Escape
	function handleGlobalKeyDown(event: KeyboardEvent) {
		if (isRecording && event.key === 'Escape') {
			event.preventDefault();
			stopVoiceRecording();
		}
	}

	// Set up global keydown listener when recording starts
	$effect(() => {
		if (browser && isRecording) {
			document.addEventListener('keydown', handleGlobalKeyDown);
			return () => {
				document.removeEventListener('keydown', handleGlobalKeyDown);
			};
		}
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

		// Initialize voice recording
		initializeVoice();

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

		// Stop any active recording and cleanup voice resources
		if (isRecording || isInitializingRecording) {
			stopVoiceRecording();
		}
		cleanupVoice();

		if (successTimeoutId !== null) {
			clearTimeout(successTimeoutId);
			successTimeoutId = null;
		}

		if (voiceErrorTimeoutId !== null) {
			clearTimeout(voiceErrorTimeoutId);
			voiceErrorTimeoutId = null;
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
	const isActive = (
		nameOrAttrs: string | Record<string, unknown>,
		attrs?: Record<string, unknown>
	) => {
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
	<div class="editor-header border-b border-border px-3 py-2 bg-muted">
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
		class="editor-toolbar border-b border-border bg-muted sticky top-0 z-10"
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
		</div>

		<!-- Expanded tools row (mobile/tablet) -->
		{#if showMoreTools}
			<div
				class="md:hidden flex items-center gap-0.5 px-1.5 py-1.5 border-t border-border/50 bg-muted overflow-x-auto scrollbar-hide"
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

	<!-- Editor Content -->
	<div class="editor-content relative flex-1 overflow-y-auto bg-background">
		<div bind:this={editorElement} class="editor p-4 sm:p-5"></div>

		<!-- Live Transcript Overlay (floating above FAB) -->
		{#if isRecording && liveTranscriptPreview.trim() && canUseLiveTranscript}
			<div
				class="absolute bottom-20 right-4 z-20 max-w-[280px] sm:max-w-[320px]"
				aria-live="polite"
				aria-atomic="true"
			>
				<div
					class="rounded-lg border border-accent/30 bg-accent/5 px-3 py-2 text-sm shadow-ink backdrop-blur-sm dark:bg-accent/10 tx tx-bloom tx-weak"
				>
					<div class="flex items-center gap-2 mb-1.5">
						<span class="relative flex h-2 w-2">
							<span
								class="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent/60"
							></span>
							<span class="relative inline-flex h-1.5 w-1.5 rounded-full bg-accent"
							></span>
						</span>
						<span class="text-xs font-semibold text-accent">Live Preview</span>
					</div>
					<p
						class="m-0 line-clamp-4 whitespace-pre-wrap leading-snug text-foreground text-sm"
					>
						{liveTranscriptPreview}
					</p>
				</div>
			</div>
		{/if}

		<!-- Voice Recording FAB -->
		{#if isVoiceSupported}
			<div class="absolute bottom-4 right-4 z-20 flex flex-col-reverse items-end gap-1.5">
				<button
					type="button"
					onclick={toggleVoiceRecording}
					class={voiceButtonClasses}
					disabled={voiceButtonState.disabled}
					aria-label={voiceButtonState.label}
					title={voiceButtonState.label}
					aria-pressed={isRecording}
					style="-webkit-tap-highlight-color: transparent;"
				>
					{#if voiceButtonState.isLoading}
						<LoaderCircle class="h-5 w-5 animate-spin" />
					{:else if isRecording}
						<!-- Recording indicator with pulse animation -->
						<span class="relative flex items-center justify-center">
							<span
								class="absolute inline-flex h-8 w-8 animate-ping rounded-full bg-destructive-foreground/30"
							></span>
							<MicOff class="relative h-5 w-5" />
						</span>
					{:else}
						<voiceButtonState.icon class="h-5 w-5" />
					{/if}
				</button>
				<!-- Keyboard hint when recording -->
				{#if isRecording}
					<span
						class="text-[10px] text-muted-foreground/70 bg-muted px-1.5 py-0.5 rounded backdrop-blur-sm hidden sm:block"
					>
						Press <kbd class="font-mono font-medium text-foreground/70">Esc</kbd> to stop
					</span>
				{/if}
			</div>
		{/if}

		<!-- Voice Error Toast -->
		{#if voiceError}
			<div
				class="absolute right-4 z-30 max-w-[280px] sm:max-w-[320px] transition-all duration-200"
				class:bottom-36={isRecording &&
					liveTranscriptPreview.trim() &&
					canUseLiveTranscript}
				class:bottom-20={!(
					isRecording &&
					liveTranscriptPreview.trim() &&
					canUseLiveTranscript
				)}
				role="alert"
				aria-live="assertive"
			>
				<div
					class="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 shadow-ink backdrop-blur-sm tx tx-static tx-weak"
				>
					<p class="flex-1 text-sm font-medium text-destructive">{voiceError}</p>
					<button
						type="button"
						onclick={dismissVoiceError}
						class="shrink-0 rounded p-0.5 text-destructive/70 hover:text-destructive hover:bg-destructive/10 transition-colors"
						aria-label="Dismiss error"
					>
						<X class="h-4 w-4" />
					</button>
				</div>
			</div>
		{/if}
	</div>

	<!-- Footer Stats Bar -->
	<div
		class="editor-footer border-t border-border px-3 py-2 bg-muted flex items-center justify-between text-[10px] sm:text-xs text-muted-foreground"
	>
		<div class="flex items-center gap-2 sm:gap-3">
			<!-- Recording status indicator -->
			{#if isRecording}
				<span class="flex items-center gap-1.5 text-destructive">
					<span class="relative flex h-2 w-2 items-center justify-center">
						<span
							class="absolute inline-flex h-full w-full animate-ping rounded-full bg-destructive/60"
						></span>
						<span class="relative inline-flex h-1.5 w-1.5 rounded-full bg-destructive"
						></span>
					</span>
					<span class="text-xs font-semibold tabular-nums"
						>{formatDuration(recordingDuration)}</span
					>
				</span>
				<span class="text-muted-foreground/60">|</span>
			{:else if isTranscribing}
				<span class="flex items-center gap-1.5 text-accent">
					<LoaderCircle class="h-3 w-3 animate-spin" />
					<span class="text-xs font-semibold">Transcribing...</span>
				</span>
				<span class="text-muted-foreground/60">|</span>
			{/if}

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
				class="font-mono text-[9px] sm:text-[10px] truncate max-w-[100px] sm:max-w-[200px] opacity-60 bg-muted px-1.5 py-0.5 rounded"
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
