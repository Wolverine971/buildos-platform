// apps/web/src/lib/components/ui/codemirror/voice-widget.ts
/**
 * Voice dictation widgets for CodeMirror 6.
 *
 * - Insert hint: shown on mic hover/focus ("Voice inserts here").
 * - Dictation: while the user talks, the words appear inline at the insertion
 *   point — server-confirmed words solid, live draft words muted, a pulsing
 *   caret where new words arrive. A selection being dictated over is struck
 *   through until the final text replaces it.
 *
 * Positions map through edits, so the user can keep typing elsewhere and the
 * final transcript still lands where dictation started.
 *
 * Usage:
 *   - Add `voiceWidgetExtension` to your editor extensions
 *   - Dispatch `showVoiceInsertHint` / `hideVoiceInsertHint` for hover/focus hinting
 *   - Dispatch `showVoiceWidget` / `updateVoiceDictation` / `hideVoiceWidget` for dictation
 *   - Read `getVoiceDictationTarget(state)` for the current mapped insertion point
 */

import { type EditorState, type Extension, StateField, StateEffect, type Range } from '@codemirror/state';
import { Decoration, type DecorationSet, EditorView, WidgetType } from '@codemirror/view';
import { spliceDictation } from '$lib/voice/dictation-text';

// ---------------------------------------------------------------------------
// Effects
// ---------------------------------------------------------------------------

/**
 * Start inline dictation at `pos`. When `replaceFrom < replaceTo`, that range
 * (the user's selection) is replaced by the final text.
 */
export const showVoiceWidget = StateEffect.define<{
	pos: number;
	replaceFrom?: number;
	replaceTo?: number;
}>();

/** Show the insert hint widget at a specific position */
export const showVoiceInsertHint = StateEffect.define<{ pos: number }>();

/** Update the dictated words shown inline. */
export const updateVoiceDictation = StateEffect.define<{
	confirmed: string;
	draft: string;
	listening: boolean;
}>();

/** Remove the dictation widget */
export const hideVoiceWidget = StateEffect.define<null>();

/** Remove the insert hint widget */
export const hideVoiceInsertHint = StateEffect.define<null>();

// ---------------------------------------------------------------------------
// Widgets
// ---------------------------------------------------------------------------

class DictationWidget extends WidgetType {
	constructor(
		readonly confirmed: string,
		readonly draft: string,
		readonly listening: boolean,
		readonly leadingSpace: boolean,
		readonly trailingSpace: boolean
	) {
		super();
	}

	eq(other: DictationWidget) {
		return (
			this.confirmed === other.confirmed &&
			this.draft === other.draft &&
			this.listening === other.listening &&
			this.leadingSpace === other.leadingSpace &&
			this.trailingSpace === other.trailingSpace
		);
	}

	toDOM() {
		const wrapper = document.createElement('span');
		wrapper.className = 'cm-voice-dictation';
		wrapper.setAttribute(
			'aria-label',
			this.listening ? 'Voice dictation in progress' : 'Finishing voice dictation'
		);

		const hasWords = Boolean(this.confirmed || this.draft);
		if (hasWords && this.leadingSpace) wrapper.append(' ');

		if (this.confirmed) {
			const confirmed = document.createElement('span');
			confirmed.className = 'cm-voice-confirmed';
			confirmed.textContent = this.confirmed;
			wrapper.appendChild(confirmed);
		}
		if (this.confirmed && this.draft) wrapper.append(' ');
		if (this.draft) {
			const draft = document.createElement('span');
			draft.className = 'cm-voice-draft';
			draft.textContent = this.draft;
			wrapper.appendChild(draft);
		}

		const caret = document.createElement('span');
		caret.className = this.listening ? 'cm-voice-caret cm-voice-caret-live' : 'cm-voice-caret';
		wrapper.appendChild(caret);

		if (hasWords && this.trailingSpace) wrapper.append(' ');
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
	/** Insertion point; follows text typed at it (assoc 1). */
	pos: number | null;
	/** Selection being dictated over, mapped so edits around it stay outside it. */
	replaceFrom: number | null;
	replaceTo: number | null;
	confirmed: string;
	draft: string;
	listening: boolean;
	mode: 'none' | 'insert-hint' | 'dictating';
}

const EMPTY_STATE: VoiceWidgetState = {
	pos: null,
	replaceFrom: null,
	replaceTo: null,
	confirmed: '',
	draft: '',
	listening: false,
	mode: 'none'
};

const voiceWidgetStateField = StateField.define<VoiceWidgetState>({
	create() {
		return EMPTY_STATE;
	},
	update(state, tr) {
		let next = state;
		if (tr.docChanged && next.pos !== null) {
			next = {
				...next,
				pos: tr.changes.mapPos(next.pos, 1),
				replaceFrom:
					next.replaceFrom === null ? null : tr.changes.mapPos(next.replaceFrom, 1),
				replaceTo: next.replaceTo === null ? null : tr.changes.mapPos(next.replaceTo, -1)
			};
		}

		for (const effect of tr.effects) {
			if (effect.is(showVoiceWidget)) {
				const { pos, replaceFrom, replaceTo } = effect.value;
				const hasRange =
					replaceFrom !== undefined && replaceTo !== undefined && replaceFrom < replaceTo;
				next = {
					...EMPTY_STATE,
					pos,
					replaceFrom: hasRange ? replaceFrom : null,
					replaceTo: hasRange ? replaceTo : null,
					listening: true,
					mode: 'dictating'
				};
			} else if (effect.is(showVoiceInsertHint)) {
				if (next.mode !== 'dictating') {
					next = { ...EMPTY_STATE, pos: effect.value.pos, mode: 'insert-hint' };
				}
			} else if (effect.is(updateVoiceDictation)) {
				if (next.mode === 'dictating') next = { ...next, ...effect.value };
			} else if (effect.is(hideVoiceWidget)) {
				if (next.mode === 'dictating') next = EMPTY_STATE;
			} else if (effect.is(hideVoiceInsertHint)) {
				if (next.mode === 'insert-hint') next = EMPTY_STATE;
			}
		}

		return next;
	}
});

function neighbors(state: EditorState, pos: number): { previous: string; next: string } {
	return {
		previous: pos > 0 ? state.doc.sliceString(pos - 1, pos) : '',
		next: state.doc.sliceString(pos, pos + 1)
	};
}

const voiceWidgetDecorations = StateField.define<DecorationSet>({
	create() {
		return Decoration.none;
	},
	update(_, tr) {
		const state = tr.state.field(voiceWidgetStateField);
		if (state.pos === null || state.mode === 'none') return Decoration.none;

		if (state.mode === 'insert-hint') {
			return Decoration.set([
				Decoration.widget({ widget: new InsertHintWidget(), side: 1 }).range(state.pos)
			]);
		}

		const words = [state.confirmed, state.draft].filter(Boolean).join(' ');
		const replacingAdjacent =
			state.replaceFrom !== null &&
			state.replaceTo !== null &&
			state.replaceFrom < state.replaceTo &&
			state.pos === state.replaceTo;
		const { previous } = neighbors(tr.state, replacingAdjacent ? state.replaceFrom! : state.pos);
		const { next } = neighbors(tr.state, state.pos);
		const spacing = spliceDictation(previous, words || 'x', next);
		const leadingSpace = spacing.start > previous.length;
		const trailingSpace = spacing.value.length - spacing.end > next.length;

		const decorations: Range<Decoration>[] = [];
		if (state.replaceFrom !== null && state.replaceTo !== null && state.replaceFrom < state.replaceTo) {
			decorations.push(
				Decoration.mark({ class: 'cm-voice-replaced' }).range(state.replaceFrom, state.replaceTo)
			);
		}
		decorations.push(
			Decoration.widget({
				widget: new DictationWidget(
					state.confirmed,
					state.draft,
					state.listening,
					leadingSpace,
					trailingSpace
				),
				side: 1
			}).range(state.pos)
		);
		return Decoration.set(decorations, true);
	},
	provide: (field) => EditorView.decorations.from(field)
});

// ---------------------------------------------------------------------------
// Reading the dictation target
// ---------------------------------------------------------------------------

export interface VoiceDictationTarget {
	pos: number;
	replaceFrom: number | null;
	replaceTo: number | null;
}

/** Current (mapped) dictation insertion point, or null when not dictating. */
export function getVoiceDictationTarget(state: EditorState): VoiceDictationTarget | null {
	const field = state.field(voiceWidgetStateField, false);
	if (!field || field.mode !== 'dictating' || field.pos === null) return null;
	return { pos: field.pos, replaceFrom: field.replaceFrom, replaceTo: field.replaceTo };
}

/**
 * The changes that land final dictated text at the target: replace the dictated-over
 * selection (if any) and insert at the mapped point with natural spacing.
 * Returns null when there is nothing to insert.
 */
export function buildDictationCommit(
	state: EditorState,
	target: VoiceDictationTarget,
	text: string
): { changes: Array<{ from: number; to?: number; insert: string }>; caret: number } | null {
	const words = text.trim();
	if (!words) return null;
	const docLength = state.doc.length;
	const clamp = (offset: number) => Math.min(Math.max(offset, 0), docLength);
	const pos = clamp(target.pos);
	const replaceFrom =
		target.replaceFrom !== null ? Math.min(clamp(target.replaceFrom), pos) : pos;
	const replaceTo = target.replaceTo !== null ? Math.min(clamp(target.replaceTo), pos) : pos;
	const deleting = replaceFrom < replaceTo;
	const adjacent = deleting && replaceTo === pos;

	const previousAt = adjacent ? replaceFrom : pos;
	const previous = previousAt > 0 ? state.doc.sliceString(previousAt - 1, previousAt) : '';
	const next = state.doc.sliceString(pos, pos + 1);
	const spliced = spliceDictation(previous, words, next);
	const insert = spliced.value.slice(previous.length, spliced.value.length - next.length);
	const caretOffset = spliced.end - previous.length;

	if (adjacent) {
		return {
			changes: [{ from: replaceFrom, to: pos, insert }],
			caret: replaceFrom + caretOffset
		};
	}
	const changes: Array<{ from: number; to?: number; insert: string }> = [];
	if (deleting) changes.push({ from: replaceFrom, to: replaceTo, insert: '' });
	changes.push({ from: pos, insert });
	const removed = deleting ? replaceTo - replaceFrom : 0;
	return { changes, caret: pos - removed + caretOffset };
}

// ---------------------------------------------------------------------------
// Theme for the widgets
// ---------------------------------------------------------------------------

const voiceWidgetTheme = EditorView.baseTheme({
	'.cm-voice-dictation': {
		borderRadius: '3px',
		backgroundColor: 'hsl(var(--accent) / 0.07)',
		boxDecorationBreak: 'clone',
		WebkitBoxDecorationBreak: 'clone'
	},
	'.cm-voice-confirmed': {
		color: 'hsl(var(--foreground))'
	},
	'.cm-voice-draft': {
		color: 'hsl(var(--muted-foreground))'
	},
	'.cm-voice-caret': {
		display: 'inline-block',
		width: '2px',
		height: '1.05em',
		marginLeft: '2px',
		verticalAlign: 'text-bottom',
		borderRadius: '1px',
		backgroundColor: 'hsl(var(--muted-foreground) / 0.5)'
	},
	'.cm-voice-caret-live': {
		backgroundColor: 'hsl(var(--destructive))',
		animation: 'cm-voice-caret-pulse 1.1s ease-in-out infinite'
	},
	'.cm-voice-replaced': {
		textDecoration: 'line-through',
		color: 'hsl(var(--muted-foreground))'
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
	'@keyframes cm-voice-caret-pulse': {
		'0%, 100%': { opacity: '1' },
		'50%': { opacity: '0.25' }
	},
	'@keyframes cm-voice-hint-pulse': {
		'0%, 100%': { opacity: '0.9', transform: 'scale(1)' },
		'50%': { opacity: '0.45', transform: 'scale(0.75)' }
	},
	'@keyframes cm-voice-hint-fadein': {
		from: { opacity: '0', transform: 'translateX(-3px)' },
		to: { opacity: '1', transform: 'translateX(0)' }
	},
	'@media (prefers-reduced-motion: reduce)': {
		'.cm-voice-caret-live': { animation: 'none' },
		'.cm-voice-insert-dot': { animation: 'none' },
		'.cm-voice-insert-hint': { animation: 'none' }
	}
});

// ---------------------------------------------------------------------------
// Public extension
// ---------------------------------------------------------------------------

/** Extension that enables the voice dictation widgets. Add to editor extensions. */
export const voiceWidgetExtension: Extension = [
	voiceWidgetStateField,
	voiceWidgetDecorations,
	voiceWidgetTheme
];
