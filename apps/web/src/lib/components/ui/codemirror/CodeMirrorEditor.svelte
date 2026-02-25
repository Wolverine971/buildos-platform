<!-- apps/web/src/lib/components/ui/codemirror/CodeMirrorEditor.svelte -->
<!--
	CodeMirrorEditor - Svelte 5 wrapper for CodeMirror 6

	Features:
	- Bidirectional value binding with loop prevention
	- Markdown syntax highlighting with Inkprint theme
	- Toolbar command methods (bold, italic, headings, lists, etc.)
	- Voice transcription widget at cursor position
	- Keyboard shortcuts (Cmd+B, Cmd+I, Cmd+K, Cmd+S)
	- Fill-height mode for use inside flex containers
-->
<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { EditorView } from '@codemirror/view';
	import { Compartment, EditorState, type Extension } from '@codemirror/state';
	import {
		buildExtensions,
		toggleBold,
		toggleItalic,
		insertH1,
		insertH2,
		insertBulletList,
		insertOrderedList,
		insertBlockquote,
		insertCodeBlock,
		insertLink
	} from './extensions';
	import {
		voiceWidgetExtension,
		showVoiceWidget as showVoiceWidgetEffect,
		showVoiceInsertHint as showVoiceInsertHintEffect,
		updateVoicePreview,
		hideVoiceWidget as hideVoiceWidgetEffect,
		hideVoiceInsertHint as hideVoiceInsertHintEffect
	} from './voice-widget';

	interface Props {
		/** The markdown text content (two-way bindable) */
		value?: string;
		/** Placeholder text when editor is empty */
		placeholder?: string;
		/** Whether the editor is read-only */
		readOnly?: boolean;
		/** Whether the editor is disabled (same as readOnly visually) */
		disabled?: boolean;
		/** Max character length. Enforced on input. */
		maxLength?: number;
		/** Expand to fill parent container */
		fillHeight?: boolean;
		/** Callback when Cmd/Ctrl+S is pressed */
		onSave?: () => void;
		/** Called on every document change */
		onDocChange?: (value: string) => void;
		/** Additional CSS classes for the wrapper */
		class?: string;
	}

	let {
		value = $bindable(''),
		placeholder = 'Write in Markdown...',
		readOnly = false,
		disabled = false,
		maxLength,
		fillHeight = false,
		onSave,
		onDocChange,
		class: className = ''
	}: Props = $props();

	let containerElement = $state<HTMLDivElement | null>(null);
	let view = $state<EditorView | null>(null);

	// Compartment for dynamic editable toggling
	const editableCompartment = new Compartment();

	// Guard to prevent update loops: when we update value from the editor,
	// we don't want the $effect to push it back into the editor.
	let updatingFromEditor = false;

	// ---------------------------------------------------------------------------
	// Lifecycle
	// ---------------------------------------------------------------------------

	onMount(() => {
		if (!containerElement) return;

		const updateListener = EditorView.updateListener.of((update) => {
			if (update.docChanged) {
				updatingFromEditor = true;
				let newValue = update.state.doc.toString();
				// Enforce maxLength
				if (maxLength && newValue.length > maxLength) {
					newValue = newValue.slice(0, maxLength);
					// Truncate in the editor too
					view?.dispatch({
						changes: {
							from: maxLength,
							to: update.state.doc.length,
							insert: ''
						}
					});
				}
				value = newValue;
				onDocChange?.(newValue);
				// Reset on next microtask to allow the $effect to see our flag
				queueMicrotask(() => {
					updatingFromEditor = false;
				});
			}
		});

		const isEditable = !(readOnly || disabled);

		const extensions: Extension[] = buildExtensions({
			placeholder,
			onSave,
			additionalExtensions: [
				updateListener,
				voiceWidgetExtension,
				editableCompartment.of(EditorView.editable.of(isEditable))
			]
		});

		const state = EditorState.create({
			doc: value,
			extensions
		});

		view = new EditorView({
			state,
			parent: containerElement
		});
	});

	onDestroy(() => {
		view?.destroy();
		view = null;
	});

	// ---------------------------------------------------------------------------
	// Sync external value changes into the editor
	// ---------------------------------------------------------------------------

	$effect(() => {
		// Read value to track it as a dependency
		const currentValue = value;
		if (!view || updatingFromEditor) return;

		const editorContent = view.state.doc.toString();
		if (currentValue !== editorContent) {
			view.dispatch({
				changes: {
					from: 0,
					to: view.state.doc.length,
					insert: currentValue
				}
			});
		}
	});

	// Sync readOnly/disabled changes via compartment
	$effect(() => {
		const isEditable = !(readOnly || disabled);
		if (!view) return;
		view.dispatch({
			effects: editableCompartment.reconfigure(EditorView.editable.of(isEditable))
		});
	});

	// ---------------------------------------------------------------------------
	// Public API: Toolbar commands
	// ---------------------------------------------------------------------------

	export function execBold() {
		if (view) toggleBold(view);
	}
	export function execItalic() {
		if (view) toggleItalic(view);
	}
	export function execH1() {
		if (view) insertH1(view);
	}
	export function execH2() {
		if (view) insertH2(view);
	}
	export function execBulletList() {
		if (view) insertBulletList(view);
	}
	export function execOrderedList() {
		if (view) insertOrderedList(view);
	}
	export function execBlockquote() {
		if (view) insertBlockquote(view);
	}
	export function execCodeBlock() {
		if (view) insertCodeBlock(view);
	}
	export function execLink() {
		if (view) insertLink(view);
	}

	// ---------------------------------------------------------------------------
	// Public API: Cursor and focus
	// ---------------------------------------------------------------------------

	export function focus() {
		view?.focus();
	}

	/** Get the current cursor position (head of main selection) */
	export function getCursorPos(): number {
		return view?.state.selection.main.head ?? 0;
	}

	/** Get the full selection range */
	export function getSelection(): { from: number; to: number } {
		const sel = view?.state.selection.main;
		return { from: sel?.from ?? 0, to: sel?.to ?? 0 };
	}

	// ---------------------------------------------------------------------------
	// Public API: Voice widget
	// ---------------------------------------------------------------------------

	/** Show the voice transcription indicator at the current cursor position */
	export function showTranscribing() {
		if (!view) return;
		const pos = view.state.selection.main.head;
		view.dispatch({ effects: showVoiceWidgetEffect.of({ pos }) });
	}

	/** Show the voice insertion hint at the current cursor position */
	export function showVoiceInsertHint() {
		if (!view) return;
		const pos = view.state.selection.main.head;
		view.dispatch({ effects: showVoiceInsertHintEffect.of({ pos }) });
	}

	/** Update the live transcript preview inside the widget */
	export function updateTranscriptPreview(text: string) {
		if (!view) return;
		view.dispatch({ effects: updateVoicePreview.of({ text }) });
	}

	/** Hide the voice transcription widget */
	export function hideTranscribing() {
		if (!view) return;
		view.dispatch({ effects: hideVoiceWidgetEffect.of(null) });
	}

	/** Hide the voice insertion hint widget */
	export function hideVoiceInsertHint() {
		if (!view) return;
		view.dispatch({ effects: hideVoiceInsertHintEffect.of(null) });
	}

	// ---------------------------------------------------------------------------
	// Public API: Text insertion (for voice transcription result)
	// ---------------------------------------------------------------------------

	/**
	 * Insert text at a specific position with smart spacing.
	 * Used after voice transcription completes to insert the final text.
	 */
	export function insertTextAt(pos: number, text: string, replaceEnd?: number) {
		if (!view) return;
		const doc = view.state.doc.toString();
		const end = replaceEnd ?? pos;
		const trimmed = text.trim();

		// Smart spacing
		let finalText = trimmed;
		if (pos === end) {
			const needsSpaceBefore = pos > 0 && !/\s/.test(doc[pos - 1] || '');
			const needsSpaceAfter = pos < doc.length && !/\s/.test(doc[pos] || '');
			finalText = (needsSpaceBefore ? ' ' : '') + trimmed + (needsSpaceAfter ? ' ' : '');
		}

		const newCursorPos = pos + finalText.length;
		view.dispatch({
			changes: { from: pos, to: end, insert: finalText },
			selection: { anchor: newCursorPos }
		});
		view.focus();
	}

	/**
	 * Insert text at the current cursor position.
	 */
	export function insertAtCursor(text: string) {
		if (!view) return;
		const pos = view.state.selection.main.head;
		insertTextAt(pos, text);
	}

	/** Get the underlying EditorView instance (for advanced operations) */
	export function getView(): EditorView | null {
		return view;
	}
</script>

<div
	bind:this={containerElement}
	class="cm-editor-wrapper {fillHeight ? 'cm-fill-height' : ''} {className}"
	class:cm-disabled={disabled}
></div>

<style>
	.cm-editor-wrapper {
		width: 100%;
		overflow: hidden;
	}
	.cm-editor-wrapper :global(.cm-editor) {
		height: 100%;
	}
	.cm-fill-height {
		flex: 1;
		min-height: 0;
		display: flex;
		flex-direction: column;
	}
	.cm-fill-height :global(.cm-editor) {
		flex: 1;
		min-height: 0;
	}
	.cm-fill-height :global(.cm-scroller) {
		flex: 1;
		min-height: 0;
	}
	.cm-disabled {
		opacity: 0.6;
		pointer-events: none;
	}
</style>
