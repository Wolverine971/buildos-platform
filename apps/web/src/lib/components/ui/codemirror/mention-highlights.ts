// apps/web/src/lib/components/ui/codemirror/mention-highlights.ts
//
// Tagged names (people, organizations) shown while editing (tasker 167): a soft underline on
// each tag, set once when editing starts and then mapped through every change, so a tag follows
// its name as text is typed around it. Decorations only: the stored text never changes. A tag
// whose characters are all deleted disappears; the server re-reads the text after the save and
// decides what the edit meant (moved, corrected, deleted).

import { type Extension, StateEffect, StateField } from '@codemirror/state';
import { Decoration, type DecorationSet, EditorView } from '@codemirror/view';

export type MentionHighlight = { from: number; to: number; title: string };

export const setMentionHighlights = StateEffect.define<MentionHighlight[]>();

function build(highlights: MentionHighlight[], length: number): DecorationSet {
	const ranges = highlights
		.filter((h) => h.from >= 0 && h.to > h.from && h.to <= length)
		.sort((a, b) => a.from - b.from)
		.map((h) =>
			Decoration.mark({
				class: 'cm-entity-mention',
				attributes: { title: h.title }
			}).range(h.from, h.to)
		);
	return Decoration.set(ranges, true);
}

const field = StateField.define<DecorationSet>({
	create: () => Decoration.none,
	update(value, tr) {
		let next = value.map(tr.changes);
		for (const effect of tr.effects) {
			if (effect.is(setMentionHighlights)) next = build(effect.value, tr.state.doc.length);
		}
		return next;
	},
	provide: (f) => EditorView.decorations.from(f)
});

const theme = EditorView.baseTheme({
	'.cm-entity-mention': {
		textDecorationLine: 'underline',
		textDecorationStyle: 'dotted',
		textDecorationColor: 'hsl(var(--accent) / 0.7)',
		textUnderlineOffset: '3px',
		backgroundColor: 'hsl(var(--accent) / 0.08)',
		borderRadius: '2px'
	}
});

export const mentionHighlightsExtension: Extension = [field, theme];
