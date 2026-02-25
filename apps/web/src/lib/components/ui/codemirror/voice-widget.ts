// apps/web/src/lib/components/ui/codemirror/voice-widget.ts
/**
 * Voice Transcription Widget for CodeMirror 6
 *
 * Supports two inline cursor widgets:
 * - Insert hint: shown on mic hover/focus ("Voice inserts here")
 * - Transcribing indicator: shown during active voice recording
 *
 * The transcribing widget can display a live transcript preview that updates
 * as the Web Speech API produces partial results.
 *
 * Usage:
 *   - Add `voiceWidgetField` to your editor extensions
 *   - Dispatch `showVoiceInsertHint` / `hideVoiceInsertHint` for hover/focus hinting
 *   - Dispatch `showVoiceWidget` / `updateVoicePreview` / `hideVoiceWidget` for recording UI
 */

import { type Extension, StateField, StateEffect, type Range } from '@codemirror/state';
import { Decoration, type DecorationSet, EditorView, WidgetType } from '@codemirror/view';

// ---------------------------------------------------------------------------
// Effects
// ---------------------------------------------------------------------------

/** Show the transcribing widget at a specific position */
export const showVoiceWidget = StateEffect.define<{ pos: number }>();

/** Show the insert hint widget at a specific position */
export const showVoiceInsertHint = StateEffect.define<{ pos: number }>();

/** Update the live transcript preview text */
export const updateVoicePreview = StateEffect.define<{ text: string }>();

/** Remove the transcribing widget */
export const hideVoiceWidget = StateEffect.define<null>();

/** Remove the insert hint widget */
export const hideVoiceInsertHint = StateEffect.define<null>();

// ---------------------------------------------------------------------------
// Widget
// ---------------------------------------------------------------------------

class TranscribingWidget extends WidgetType {
	constructor(readonly previewText: string) {
		super();
	}

	eq(other: TranscribingWidget) {
		return this.previewText === other.previewText;
	}

	toDOM() {
		const wrapper = document.createElement('span');
		wrapper.className = 'cm-voice-transcribing';
		wrapper.setAttribute('aria-label', 'Voice transcription in progress');

		// Pulsing dot
		const dot = document.createElement('span');
		dot.className = 'cm-voice-dot';
		wrapper.appendChild(dot);

		// Label
		const label = document.createElement('span');
		label.className = 'cm-voice-label';
		label.textContent = this.previewText ? '' : 'Transcribing\u2026';
		wrapper.appendChild(label);

		// Preview text
		if (this.previewText) {
			const preview = document.createElement('span');
			preview.className = 'cm-voice-preview';
			preview.textContent = this.previewText;
			wrapper.appendChild(preview);
		}

		return wrapper;
	}

	ignoreEvent() {
		return true;
	}
}

class InsertHintWidget extends WidgetType {
	toDOM() {
		const wrapper = document.createElement('span');
		wrapper.className = 'cm-voice-insert-hint';
		wrapper.setAttribute('aria-label', 'Voice transcription inserts at this cursor position');

		const dot = document.createElement('span');
		dot.className = 'cm-voice-insert-dot';
		wrapper.appendChild(dot);

		const label = document.createElement('span');
		label.className = 'cm-voice-insert-label';
		label.textContent = 'Voice inserts here';
		wrapper.appendChild(label);

		return wrapper;
	}

	eq(other: InsertHintWidget) {
		return other instanceof InsertHintWidget;
	}

	ignoreEvent() {
		return true;
	}
}

// ---------------------------------------------------------------------------
// State field
// ---------------------------------------------------------------------------

interface VoiceWidgetState {
	pos: number | null;
	previewText: string;
	mode: 'none' | 'insert-hint' | 'transcribing';
}

const voiceWidgetStateField = StateField.define<VoiceWidgetState>({
	create() {
		return { pos: null, previewText: '', mode: 'none' };
	},
	update(state, tr) {
		let { pos, previewText, mode } = state;

		// Map position through document changes
		if (pos !== null) {
			pos = tr.changes.mapPos(pos, 1);
		}

		for (const effect of tr.effects) {
			if (effect.is(showVoiceWidget)) {
				pos = effect.value.pos;
				previewText = '';
				mode = 'transcribing';
			} else if (effect.is(showVoiceInsertHint)) {
				pos = effect.value.pos;
				previewText = '';
				mode = 'insert-hint';
			} else if (effect.is(updateVoicePreview)) {
				if (mode === 'transcribing') {
					previewText = effect.value.text;
				}
			} else if (effect.is(hideVoiceWidget)) {
				if (mode === 'transcribing') {
					pos = null;
					previewText = '';
					mode = 'none';
				}
			} else if (effect.is(hideVoiceInsertHint)) {
				if (mode === 'insert-hint') {
					pos = null;
					previewText = '';
					mode = 'none';
				}
			}
		}

		return { pos, previewText, mode };
	}
});

const voiceWidgetDecorations = StateField.define<DecorationSet>({
	create() {
		return Decoration.none;
	},
	update(_, tr) {
		const state = tr.state.field(voiceWidgetStateField);
		if (state.pos === null) {
			return Decoration.none;
		}

		if (state.mode === 'none') {
			return Decoration.none;
		}

		const widget = Decoration.widget(
			state.mode === 'transcribing'
				? {
						widget: new TranscribingWidget(state.previewText),
						side: 1 // after cursor
					}
				: {
						widget: new InsertHintWidget(),
						side: 1 // after cursor
					}
		);

		const decorations: Range<Decoration>[] = [widget.range(state.pos)];
		return Decoration.set(decorations);
	},
	provide: (field) => EditorView.decorations.from(field)
});

// ---------------------------------------------------------------------------
// Theme for the widget
// ---------------------------------------------------------------------------

const voiceWidgetTheme = EditorView.baseTheme({
	'.cm-voice-transcribing': {
		display: 'inline-flex',
		alignItems: 'center',
		gap: '4px',
		padding: '1px 6px',
		marginLeft: '4px',
		borderRadius: '4px',
		backgroundColor: 'hsl(var(--accent) / 0.1)',
		borderLeft: '2px solid hsl(var(--accent))',
		fontSize: '0.8em',
		lineHeight: '1.4',
		verticalAlign: 'baseline',
		animation: 'cm-voice-fadein 200ms ease-out'
	},
	'.cm-voice-dot': {
		display: 'inline-block',
		width: '6px',
		height: '6px',
		borderRadius: '50%',
		backgroundColor: 'hsl(var(--accent))',
		flexShrink: '0',
		animation: 'cm-voice-pulse 1.5s ease-in-out infinite'
	},
	'.cm-voice-label': {
		color: 'hsl(var(--muted-foreground))',
		fontStyle: 'italic',
		fontSize: '0.85em',
		whiteSpace: 'nowrap'
	},
	'.cm-voice-preview': {
		color: 'hsl(var(--accent))',
		fontStyle: 'normal',
		maxWidth: '300px',
		overflow: 'hidden',
		textOverflow: 'ellipsis',
		whiteSpace: 'nowrap'
	},
	'.cm-voice-insert-hint': {
		display: 'inline-flex',
		alignItems: 'center',
		gap: '4px',
		padding: '1px 6px',
		marginLeft: '4px',
		borderRadius: '999px',
		backgroundColor: 'hsl(var(--accent) / 0.08)',
		border: '1px solid hsl(var(--accent) / 0.35)',
		fontSize: '0.8em',
		lineHeight: '1.4',
		verticalAlign: 'baseline',
		animation: 'cm-voice-hint-fadein 180ms ease-out'
	},
	'.cm-voice-insert-dot': {
		display: 'inline-block',
		width: '6px',
		height: '6px',
		borderRadius: '50%',
		backgroundColor: 'hsl(var(--accent))',
		flexShrink: '0',
		animation: 'cm-voice-hint-pulse 1.1s ease-in-out infinite'
	},
	'.cm-voice-insert-label': {
		color: 'hsl(var(--accent))',
		fontStyle: 'normal',
		fontSize: '0.85em',
		whiteSpace: 'nowrap'
	},
	'@keyframes cm-voice-pulse': {
		'0%, 100%': { opacity: '1', transform: 'scale(1)' },
		'50%': { opacity: '0.4', transform: 'scale(0.8)' }
	},
	'@keyframes cm-voice-fadein': {
		from: { opacity: '0', transform: 'translateX(-4px)' },
		to: { opacity: '1', transform: 'translateX(0)' }
	},
	'@keyframes cm-voice-hint-pulse': {
		'0%, 100%': { opacity: '0.9', transform: 'scale(1)' },
		'50%': { opacity: '0.45', transform: 'scale(0.75)' }
	},
	'@keyframes cm-voice-hint-fadein': {
		from: { opacity: '0', transform: 'translateX(-3px)' },
		to: { opacity: '1', transform: 'translateX(0)' }
	}
});

// ---------------------------------------------------------------------------
// Public extension
// ---------------------------------------------------------------------------

/** Extension that enables the voice transcription widget. Add to editor extensions. */
export const voiceWidgetExtension: Extension = [
	voiceWidgetStateField,
	voiceWidgetDecorations,
	voiceWidgetTheme
];
