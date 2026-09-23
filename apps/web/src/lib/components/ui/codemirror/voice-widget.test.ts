// apps/web/src/lib/components/ui/codemirror/voice-widget.test.ts
// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import {
	voiceWidgetExtension,
	buildDictationCommit,
	getVoiceDictationTarget,
	showVoiceWidget,
	showVoiceInsertHint,
	updateVoiceDictation,
	hideVoiceWidget,
	hideVoiceInsertHint
} from './voice-widget';

type TestEditor = {
	view: EditorView;
	parent: HTMLDivElement;
	destroy: () => void;
};

const activeEditors: TestEditor[] = [];

function createTestEditor(doc = 'Hello world'): TestEditor {
	const parent = document.createElement('div');
	document.body.appendChild(parent);
	const state = EditorState.create({
		doc,
		extensions: [voiceWidgetExtension]
	});
	const view = new EditorView({ state, parent });

	const editor: TestEditor = {
		view,
		parent,
		destroy: () => {
			view.destroy();
			parent.remove();
		}
	};

	activeEditors.push(editor);
	return editor;
}

afterEach(() => {
	for (const editor of activeEditors.splice(0)) {
		editor.destroy();
	}
});

describe('voice-widget insert hint mode', () => {
	it('renders insert hint widget when showVoiceInsertHint is dispatched', () => {
		const { view, parent } = createTestEditor();
		view.dispatch({ effects: showVoiceInsertHint.of({ pos: 5 }) });

		const hint = parent.querySelector('.cm-voice-insert-hint');
		expect(hint).not.toBeNull();
		expect(hint?.textContent).toContain('Voice inserts here');
	});

	it('removes insert hint widget when hideVoiceInsertHint is dispatched', () => {
		const { view, parent } = createTestEditor();
		view.dispatch({ effects: showVoiceInsertHint.of({ pos: 5 }) });
		view.dispatch({ effects: hideVoiceInsertHint.of(null) });
		expect(parent.querySelector('.cm-voice-insert-hint')).toBeNull();
	});

	it('replaces the insert hint with dictation, and the hint cannot displace dictation', () => {
		const { view, parent } = createTestEditor();
		view.dispatch({ effects: showVoiceInsertHint.of({ pos: 5 }) });
		view.dispatch({ effects: showVoiceWidget.of({ pos: 5 }) });
		expect(parent.querySelector('.cm-voice-insert-hint')).toBeNull();
		expect(parent.querySelector('.cm-voice-dictation')).not.toBeNull();

		view.dispatch({ effects: showVoiceInsertHint.of({ pos: 2 }) });
		view.dispatch({ effects: hideVoiceInsertHint.of(null) });
		expect(parent.querySelector('.cm-voice-dictation')).not.toBeNull();
	});
});

describe('voice-widget inline dictation', () => {
	it('renders confirmed words solid, draft words muted, and a live caret', () => {
		const { view, parent } = createTestEditor('Hello world');
		view.dispatch({ effects: showVoiceWidget.of({ pos: 5 }) });
		view.dispatch({
			effects: updateVoiceDictation.of({
				confirmed: 'there,',
				draft: 'my friend',
				listening: true
			})
		});

		expect(parent.querySelector('.cm-voice-confirmed')?.textContent).toBe('there,');
		expect(parent.querySelector('.cm-voice-draft')?.textContent).toBe('my friend');
		expect(parent.querySelector('.cm-voice-caret-live')).not.toBeNull();
		// "Hello" + " there, my friend" + " world": a space before, none doubled after.
		expect(parent.querySelector('.cm-voice-dictation')?.textContent).toBe(' there, my friend');

		view.dispatch({
			effects: updateVoiceDictation.of({ confirmed: 'there,', draft: '', listening: false })
		});
		expect(parent.querySelector('.cm-voice-caret-live')).toBeNull();
		expect(parent.querySelector('.cm-voice-caret')).not.toBeNull();
	});

	it('follows the insertion point through edits made while dictating', () => {
		const { view } = createTestEditor('Alpha omega');
		view.dispatch({ effects: showVoiceWidget.of({ pos: 6 }) });
		view.dispatch({ changes: { from: 0, insert: 'Say: ' } });
		expect(getVoiceDictationTarget(view.state)?.pos).toBe(11);

		view.dispatch({ changes: { from: 0, to: 11, insert: '' } });
		expect(getVoiceDictationTarget(view.state)?.pos).toBe(0);
	});

	it('removes dictation on hideVoiceWidget', () => {
		const { view, parent } = createTestEditor();
		view.dispatch({ effects: showVoiceWidget.of({ pos: 5 }) });
		view.dispatch({ effects: hideVoiceWidget.of(null) });
		expect(parent.querySelector('.cm-voice-dictation')).toBeNull();
		expect(getVoiceDictationTarget(view.state)).toBeNull();
	});

	it('strikes through a selection being dictated over', () => {
		const { view, parent } = createTestEditor('Alpha beta omega');
		view.dispatch({ effects: showVoiceWidget.of({ pos: 10, replaceFrom: 6, replaceTo: 10 }) });
		expect(parent.querySelector('.cm-voice-replaced')?.textContent).toBe('beta');
	});
});

describe('buildDictationCommit', () => {
	function commit(
		doc: string,
		target: { pos: number; replaceFrom?: number; replaceTo?: number },
		text: string
	) {
		const state = EditorState.create({ doc });
		const result = buildDictationCommit(
			state,
			{
				pos: target.pos,
				replaceFrom: target.replaceFrom ?? null,
				replaceTo: target.replaceTo ?? null
			},
			text
		);
		if (!result) return null;
		const next = state.update({ changes: result.changes }).state.doc.toString();
		return { doc: next, caret: result.caret };
	}

	it('inserts with natural spacing and puts the caret after the words', () => {
		expect(commit('Alpha omega', { pos: 5 }, 'bravo')).toEqual({
			doc: 'Alpha bravo omega',
			caret: 11
		});
		expect(commit('Alpha', { pos: 5 }, 'bravo.')).toEqual({ doc: 'Alpha bravo.', caret: 12 });
	});

	it('replaces the selection it was dictated over', () => {
		expect(
			commit('Alpha beta omega', { pos: 10, replaceFrom: 6, replaceTo: 10 }, 'gamma')
		).toEqual({ doc: 'Alpha gamma omega', caret: 11 });
	});

	it('keeps text typed after the selection and replaces only the selection', () => {
		// Selection "beta" (6..10); user typed "!" at 10, so the point moved to 11.
		expect(
			commit('Alpha beta! omega', { pos: 11, replaceFrom: 6, replaceTo: 10 }, 'gamma')
		).toEqual({ doc: 'Alpha ! gamma omega', caret: 13 });
	});

	it('clamps a stale point instead of throwing and ignores empty text', () => {
		expect(commit('Hi', { pos: 40 }, 'there')).toEqual({ doc: 'Hi there', caret: 8 });
		expect(commit('Hi', { pos: 1 }, '   ')).toBeNull();
	});
});
