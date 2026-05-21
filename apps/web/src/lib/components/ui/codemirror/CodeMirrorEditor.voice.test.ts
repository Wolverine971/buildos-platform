// apps/web/src/lib/components/ui/codemirror/CodeMirrorEditor.voice.test.ts
// @vitest-environment jsdom

import { cleanup, render } from '@testing-library/svelte';
import { tick } from 'svelte';
import { afterEach, describe, expect, it } from 'vitest';
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
});
