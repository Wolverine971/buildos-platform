// apps/web/src/lib/components/ui/codemirror/extensions.ts
/**
 * CodeMirror 6 Extensions for the Rich Markdown Editor
 *
 * Bundles markdown language support, keyboard shortcuts for formatting,
 * and toolbar command helpers.
 */

import { type Extension } from '@codemirror/state';
import { type Command, EditorView, keymap, placeholder as cmPlaceholder } from '@codemirror/view';
import { markdown } from '@codemirror/lang-markdown';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { searchKeymap } from '@codemirror/search';
import { inkprintTheme } from './inkprint-theme';
import { stickyScroll, type StickyScrollConfig } from './sticky-scroll';

// ---------------------------------------------------------------------------
// Toolbar Commands (used by both keybindings and external toolbar buttons)
// ---------------------------------------------------------------------------

/** Wrap the selection (or insert placeholder) with a prefix/suffix */
function surroundWith(prefix: string, suffix: string = prefix): Command {
	return (view) => {
		const { from, to } = view.state.selection.main;
		const selected = view.state.sliceDoc(from, to);
		const inner = selected || 'text';
		const replacement = `${prefix}${inner}${suffix}`;
		view.dispatch({
			changes: { from, to, insert: replacement },
			selection: { anchor: from + prefix.length, head: from + prefix.length + inner.length }
		});
		view.focus();
		return true;
	};
}

/** Insert a token at the start of the current line */
function insertLinePrefix(token: string): Command {
	return (view) => {
		const { from } = view.state.selection.main;
		const line = view.state.doc.lineAt(from);
		const lineText = line.text;

		// If line already starts with this token, remove it (toggle)
		if (lineText.startsWith(token)) {
			view.dispatch({
				changes: { from: line.from, to: line.from + token.length, insert: '' }
			});
		} else {
			view.dispatch({
				changes: { from: line.from, to: line.from, insert: token }
			});
		}
		view.focus();
		return true;
	};
}

/** Prefix each selected line (or current line) with a token */
function prefixLines(prefix: string, ordered = false): Command {
	return (view) => {
		const { from, to } = view.state.selection.main;
		const startLine = view.state.doc.lineAt(from);
		const endLine = view.state.doc.lineAt(to);

		// If no selection, just insert at line start
		if (from === to) {
			return insertLinePrefix(prefix)(view);
		}

		const changes: Array<{ from: number; to: number; insert: string }> = [];
		let counter = 1;
		for (let i = startLine.number; i <= endLine.number; i++) {
			const line = view.state.doc.line(i);
			if (line.text.trim()) {
				const token = ordered ? `${counter}. ` : prefix;
				changes.push({ from: line.from, to: line.from, insert: token });
				counter++;
			}
		}

		if (changes.length > 0) {
			view.dispatch({ changes });
		}
		view.focus();
		return true;
	};
}

// Exported commands for use by toolbar buttons
export const toggleBold: Command = surroundWith('**');
export const toggleItalic: Command = surroundWith('*');
export const insertH1: Command = insertLinePrefix('# ');
export const insertH2: Command = insertLinePrefix('## ');
export const insertBulletList: Command = prefixLines('- ');
export const insertOrderedList: Command = prefixLines('', true);
export const insertBlockquote: Command = insertLinePrefix('> ');

export const insertCodeBlock: Command = (view) => {
	const { from, to } = view.state.selection.main;
	const selected = view.state.sliceDoc(from, to);
	const isMultiline = selected.includes('\n');
	const replacement = isMultiline
		? `\`\`\`\n${selected || 'code'}\n\`\`\``
		: `\`${selected || 'code'}\``;
	view.dispatch({
		changes: { from, to, insert: replacement },
		selection: { anchor: from + replacement.length }
	});
	view.focus();
	return true;
};

export const insertLink: Command = (view) => {
	const { from, to } = view.state.selection.main;
	const selected = view.state.sliceDoc(from, to);
	const linkText = selected || 'link text';
	const replacement = `[${linkText}](url)`;
	// Place cursor inside the url portion
	const urlStart = from + linkText.length + 3; // [linkText](
	const urlEnd = urlStart + 3; // url
	view.dispatch({
		changes: { from, to, insert: replacement },
		selection: { anchor: urlStart, head: urlEnd }
	});
	view.focus();
	return true;
};

// ---------------------------------------------------------------------------
// Keybindings
// ---------------------------------------------------------------------------

/**
 * Create formatting keybindings.
 * @param onSave - callback invoked when Cmd/Ctrl+S is pressed
 */
export function formattingKeymap(onSave?: () => void): Extension {
	const bindings = [
		{ key: 'Mod-b', run: toggleBold },
		{ key: 'Mod-i', run: toggleItalic },
		{ key: 'Mod-k', run: insertLink }
	];

	if (onSave) {
		bindings.push({
			key: 'Mod-s',
			run: () => {
				onSave();
				return true;
			}
		});
	}

	return keymap.of(bindings);
}

// ---------------------------------------------------------------------------
// Base extension bundle
// ---------------------------------------------------------------------------

export interface EditorExtensionOptions {
	/** Placeholder text when editor is empty */
	placeholder?: string;
	/** Callback for Cmd/Ctrl+S */
	onSave?: () => void;
	/** Enable sticky scroll heading navigation. Pass false to disable, or a config object. Default: enabled */
	stickyScroll?: boolean | StickyScrollConfig;
	/** Additional extensions to append (editable state, voice widget, etc.) */
	additionalExtensions?: Extension[];
}

/**
 * Build the standard set of extensions for the markdown editor.
 * Returns an array that can be passed directly to EditorState.create().
 *
 * Note: Editable state should be managed via a Compartment in the calling
 * component (for dynamic toggling) and passed in additionalExtensions.
 */
export function buildExtensions(options: EditorExtensionOptions = {}): Extension[] {
	const {
		placeholder = '',
		onSave,
		stickyScroll: stickyScrollOpt = true,
		additionalExtensions = []
	} = options;

	const extensions: Extension[] = [
		// Theme
		inkprintTheme,
		// Markdown language
		markdown(),
		// History (undo/redo)
		history(),
		// Line wrapping
		EditorView.lineWrapping,
		// Sticky scroll heading navigation
		...(stickyScrollOpt !== false
			? [stickyScroll(typeof stickyScrollOpt === 'object' ? stickyScrollOpt : undefined)]
			: []),
		// Keymaps
		keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap, indentWithTab]),
		// Formatting shortcuts
		formattingKeymap(onSave),
		// Consumer-provided extensions (editable compartment, voice widget, listeners)
		...additionalExtensions
	];

	if (placeholder) {
		extensions.push(cmPlaceholder(placeholder));
	}

	return extensions;
}
