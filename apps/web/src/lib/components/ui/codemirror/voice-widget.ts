// apps/web/src/lib/components/ui/codemirror/voice-widget.ts
/**
 * Voice Transcription Widget for CodeMirror 6
 *
 * Shows an inline "Transcribing..." indicator at the cursor position
 * during voice recording. Displays a live transcript preview that updates
 * as the Web Speech API produces partial results.
 *
 * Usage:
 *   - Add `voiceWidgetField` to your editor extensions
 *   - Dispatch `showVoiceWidget` / `updateVoicePreview` / `hideVoiceWidget` effects
 */

import { type Extension, StateField, StateEffect, type Range } from '@codemirror/state';
import { Decoration, type DecorationSet, EditorView, WidgetType } from '@codemirror/view';

// ---------------------------------------------------------------------------
// Effects
// ---------------------------------------------------------------------------

/** Show the transcribing widget at a specific position */
export const showVoiceWidget = StateEffect.define<{ pos: number }>();

/** Update the live transcript preview text */
export const updateVoicePreview = StateEffect.define<{ text: string }>();

/** Remove the transcribing widget */
export const hideVoiceWidget = StateEffect.define<null>();

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

// ---------------------------------------------------------------------------
// State field
// ---------------------------------------------------------------------------

interface VoiceWidgetState {
	pos: number | null;
	previewText: string;
}

const voiceWidgetStateField = StateField.define<VoiceWidgetState>({
	create() {
		return { pos: null, previewText: '' };
	},
	update(state, tr) {
		let { pos, previewText } = state;

		// Map position through document changes
		if (pos !== null) {
			pos = tr.changes.mapPos(pos, 1);
		}

		for (const effect of tr.effects) {
			if (effect.is(showVoiceWidget)) {
				pos = effect.value.pos;
				previewText = '';
			} else if (effect.is(updateVoicePreview)) {
				previewText = effect.value.text;
			} else if (effect.is(hideVoiceWidget)) {
				pos = null;
				previewText = '';
			}
		}

		return { pos, previewText };
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

		const widget = Decoration.widget({
			widget: new TranscribingWidget(state.previewText),
			side: 1 // after cursor
		});

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
	'@keyframes cm-voice-pulse': {
		'0%, 100%': { opacity: '1', transform: 'scale(1)' },
		'50%': { opacity: '0.4', transform: 'scale(0.8)' }
	},
	'@keyframes cm-voice-fadein': {
		from: { opacity: '0', transform: 'translateX(-4px)' },
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
