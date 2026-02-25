// apps/web/src/lib/components/ui/codemirror/voice-widget.test.ts
// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import {
	voiceWidgetExtension,
	showVoiceWidget,
	showVoiceInsertHint,
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
		expect(parent.querySelector('.cm-voice-insert-hint')).not.toBeNull();

		view.dispatch({ effects: hideVoiceInsertHint.of(null) });
		expect(parent.querySelector('.cm-voice-insert-hint')).toBeNull();
	});

	it('does not remove transcribing widget when hideVoiceInsertHint is dispatched', () => {
		const { view, parent } = createTestEditor();
		view.dispatch({ effects: showVoiceWidget.of({ pos: 5 }) });
		expect(parent.querySelector('.cm-voice-transcribing')).not.toBeNull();

		view.dispatch({ effects: hideVoiceInsertHint.of(null) });
		expect(parent.querySelector('.cm-voice-transcribing')).not.toBeNull();
	});

	it('replaces insert hint with transcribing widget when recording starts', () => {
		const { view, parent } = createTestEditor();
		view.dispatch({ effects: showVoiceInsertHint.of({ pos: 5 }) });
		expect(parent.querySelector('.cm-voice-insert-hint')).not.toBeNull();

		view.dispatch({ effects: showVoiceWidget.of({ pos: 5 }) });
		expect(parent.querySelector('.cm-voice-insert-hint')).toBeNull();
		expect(parent.querySelector('.cm-voice-transcribing')).not.toBeNull();
	});

	it('does not remove insert hint when hideVoiceWidget is dispatched', () => {
		const { view, parent } = createTestEditor();
		view.dispatch({ effects: showVoiceInsertHint.of({ pos: 5 }) });
		expect(parent.querySelector('.cm-voice-insert-hint')).not.toBeNull();

		view.dispatch({ effects: hideVoiceWidget.of(null) });
		expect(parent.querySelector('.cm-voice-insert-hint')).not.toBeNull();
	});
});
