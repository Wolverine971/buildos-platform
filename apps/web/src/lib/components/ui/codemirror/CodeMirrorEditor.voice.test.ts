// apps/web/src/lib/components/ui/codemirror/CodeMirrorEditor.voice.test.ts
// @vitest-environment jsdom

import { cleanup, render } from '@testing-library/svelte';
import { tick } from 'svelte';
import { undo } from '@codemirror/commands';
import { afterEach, describe, expect, it, vi } from 'vitest';
import CodeMirrorEditor from './CodeMirrorEditor.svelte';

afterEach(() => {
	cleanup();
});

async function renderEditor(value: string) {
	const result = render(CodeMirrorEditor, {
		props: {
			value,
			placeholder: 'Write in Markdown...'
		}
	});
	await tick();
	const component = result.component;
	const view = component.getView();
	if (!view) {
		throw new Error('CodeMirror editor did not mount');
	}
	return { component, view };
}

describe('CodeMirrorEditor inline dictation', () => {
	it('inserts a no-position fallback at the active cursor instead of the document end', async () => {
		const { component, view } = await renderEditor('Alpha omega');
		view.dispatch({ selection: { anchor: 6 } });

		component.insertAtCursor('bravo');

		expect(view.state.doc.toString()).toBe('Alpha bravo omega');
	});

	it('lands the transcript where dictation started even after edits elsewhere', async () => {
		const { component, view } = await renderEditor('Alpha omega');
		view.dispatch({ selection: { anchor: 5 } });
		component.beginDictation();
		component.updateDictation('bravo', 'charlie', true);

		// The user keeps typing before the dictation point.
		view.dispatch({ changes: { from: 0, insert: 'Note: ' } });

		expect(component.commitDictation('bravo charlie')).toBe(true);
		expect(view.state.doc.toString()).toBe('Note: Alpha bravo charlie omega');
		expect(view.state.selection.main.head).toBe(25);
		expect(component.getDictationTarget()).toBeNull();
	});

	it('does not throw when the document shrank below the original offset', async () => {
		const { component, view } = await renderEditor('A long paragraph of text');
		view.dispatch({ selection: { anchor: 24 } });
		component.beginDictation();
		view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: 'Short' } });

		expect(() => component.commitDictation('tail words')).not.toThrow();
		expect(view.state.doc.toString()).toBe('Short tail words');
	});

	it('commits as a single undo step', async () => {
		const { component, view } = await renderEditor('Alpha omega');
		view.dispatch({ selection: { anchor: 5 } });
		component.beginDictation();
		component.commitDictation('bravo');
		expect(view.state.doc.toString()).toBe('Alpha bravo omega');

		undo(view);
		expect(view.state.doc.toString()).toBe('Alpha omega');
	});

	it('replaces a selection dictated over', async () => {
		const { component, view } = await renderEditor('Alpha beta omega');
		view.dispatch({ selection: { anchor: 6, head: 10 } });
		component.beginDictation();
		component.commitDictation('gamma');
		expect(view.state.doc.toString()).toBe('Alpha gamma omega');
	});

	it('removes the widget without inserting when nothing was transcribed', async () => {
		const { component, view } = await renderEditor('Alpha');
		component.beginDictation({ from: 5, to: 5 });
		expect(component.commitDictation('  ')).toBe(true);
		expect(view.state.doc.toString()).toBe('Alpha');
		expect(component.getDictationTarget()).toBeNull();
	});

	it('restores selection and scroll state after an external value refresh', async () => {
		const { component, view } = await renderEditor('Alpha omega');
		view.dispatch({ selection: { anchor: 2, head: 8 } });
		view.scrollDOM.scrollTop = 37;
		view.scrollDOM.scrollLeft = 5;
		const snapshot = component.captureViewState();

		view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: 'Updated text' } });
		component.restoreViewState(snapshot);

		expect(view.state.selection.main).toMatchObject({ anchor: 2, head: 8 });
		expect(view.scrollDOM.scrollTop).toBe(37);
		expect(view.scrollDOM.scrollLeft).toBe(5);
	});

	it('publishes UTF-16 selection offsets for the proposal interaction', async () => {
		const onSelectionChange = vi.fn();
		const result = render(CodeMirrorEditor, {
			props: { value: 'A😀B selection', onSelectionChange }
		});
		await tick();
		const view = result.component.getView();
		if (!view) throw new Error('CodeMirror editor did not mount');

		view.dispatch({ selection: { anchor: 1, head: 3 } });

		expect(onSelectionChange).toHaveBeenLastCalledWith({ from: 1, to: 3 });
		expect(result.component.getSelection()).toEqual({ from: 1, to: 3 });
	});
});
