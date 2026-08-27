// apps/web/src/lib/components/ui/codemirror/CodeMirrorEditor.voice.test.ts
// @vitest-environment jsdom

import { cleanup, render } from '@testing-library/svelte';
import { tick } from 'svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { shouldInsertCapturedVoiceFallback } from '../rich-markdown-editor-voice';
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

describe('CodeMirrorEditor voice insertion behavior', () => {
	it('inserts a no-position fallback at the active cursor instead of the document end', async () => {
		const { component, view } = await renderEditor('Alpha omega');
		view.dispatch({ selection: { anchor: 6 } });

		component.insertAtCursor('bravo');

		expect(view.state.doc.toString()).toBe('Alpha bravo omega');
	});

	it('does not append the captured live transcript after the final transcript inserted', async () => {
		const { component, view } = await renderEditor('Alpha omega');
		const inserted = component.insertTextAt(6, 'bravo');

		if (shouldInsertCapturedVoiceFallback('bravo', inserted)) {
			component.insertAtCursor('bravo');
		}

		expect(view.state.doc.toString()).toBe('Alpha bravo omega');
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
