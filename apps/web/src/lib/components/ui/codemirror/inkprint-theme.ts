// apps/web/src/lib/components/ui/codemirror/inkprint-theme.ts
/**
 * Inkprint CodeMirror 6 Themes
 *
 * Light and dark themes using CSS custom properties from the BuildOS
 * Inkprint design system. These themes read from the same semantic tokens
 * used throughout the app (--foreground, --card, --muted, etc.) so they
 * automatically adapt when the user toggles dark mode.
 */

import { EditorView } from '@codemirror/view';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags } from '@lezer/highlight';

// ---------------------------------------------------------------------------
// Editor chrome theme (backgrounds, gutters, cursor, selection)
// ---------------------------------------------------------------------------

export const inkprintEditorTheme = EditorView.theme({
	'&': {
		backgroundColor: 'hsl(var(--card))',
		color: 'hsl(var(--foreground))',
		fontSize: '14px',
		lineHeight: '1.6'
	},
	// iOS Safari zooms the page when a focused editable's font-size is below
	// 16px; .cm-content is contenteditable and inherits this size.
	'@media (max-width: 639px)': {
		'&': {
			fontSize: '16px'
		},
		// Same rule for the find/replace fields.
		'&.cm-editor .cm-panel.cm-search .cm-textfield': {
			fontSize: '16px',
			height: '36px',
			width: '100%'
		},
		'&.cm-editor .cm-panel.cm-search .cm-button': {
			height: '36px'
		}
	},
	'&.cm-focused': {
		outline: 'none'
	},
	'.cm-content': {
		caretColor: 'hsl(var(--foreground))',
		padding: '12px 16px',
		fontFamily:
			'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace'
	},
	'.cm-cursor, .cm-dropCursor': {
		borderLeftColor: 'hsl(var(--foreground))',
		borderLeftWidth: '2px'
	},
	'&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground':
		{
			backgroundColor: 'hsl(var(--accent) / 0.15)'
		},
	'.cm-activeLine': {
		backgroundColor: 'hsl(var(--muted) / 0.3)'
	},
	'.cm-gutters': {
		backgroundColor: 'hsl(var(--muted))',
		color: 'hsl(var(--muted-foreground))',
		borderRight: '1px solid hsl(var(--border))',
		fontSize: '12px'
	},
	'.cm-activeLineGutter': {
		backgroundColor: 'hsl(var(--muted) / 0.6)',
		color: 'hsl(var(--foreground))'
	},
	'.cm-foldPlaceholder': {
		backgroundColor: 'hsl(var(--muted))',
		color: 'hsl(var(--muted-foreground))',
		border: '1px solid hsl(var(--border))',
		borderRadius: '4px',
		padding: '0 4px'
	},
	'.cm-tooltip': {
		backgroundColor: 'hsl(var(--card))',
		color: 'hsl(var(--foreground))',
		border: '1px solid hsl(var(--border))',
		borderRadius: '8px',
		boxShadow: 'var(--shadow-ink, 0 1px 3px rgba(0,0,0,.1))'
	},
	'.cm-tooltip-autocomplete': {
		'& > ul > li': {
			padding: '4px 8px'
		},
		'& > ul > li[aria-selected]': {
			backgroundColor: 'hsl(var(--accent) / 0.15)',
			color: 'hsl(var(--foreground))'
		}
	},
	// Panels (sticky-scroll on top, find/replace on the bottom).
	// CodeMirror's base theme ships `&light .cm-panels` / `&light .cm-button`
	// rules (light gradients, #f5f5f5, black text) at higher specificity than a
	// plain `.cm-panels` selector, and this editor never declares itself dark —
	// so in dark mode those defaults showed through as white-on-light-grey
	// buttons. Every rule below is anchored on `&.cm-editor` to outrank them.
	'&.cm-editor .cm-panels': {
		backgroundColor: 'hsl(var(--card))',
		color: 'hsl(var(--foreground))'
	},
	'&.cm-editor .cm-panels.cm-panels-top': {
		borderBottom: '1px solid hsl(var(--border))'
	},
	'&.cm-editor .cm-panels.cm-panels-bottom': {
		borderTop: '1px solid hsl(var(--border))'
	},
	'&.cm-editor .cm-panel.cm-search': {
		padding: '8px 40px 8px 12px',
		fontFamily: 'inherit',
		fontSize: '13px',
		lineHeight: '1'
	},
	'&.cm-editor .cm-panel.cm-search input, &.cm-editor .cm-panel.cm-search button, &.cm-editor .cm-panel.cm-search label':
		{
			margin: '3px 6px 3px 0',
			verticalAlign: 'middle'
		},
	// Find / Replace text fields
	'&.cm-editor .cm-panel.cm-search .cm-textfield': {
		boxSizing: 'border-box',
		height: '30px',
		width: '240px',
		maxWidth: '100%',
		padding: '0 10px',
		backgroundColor: 'hsl(var(--background))',
		color: 'hsl(var(--foreground))',
		border: '1px solid hsl(var(--border-strong))',
		borderRadius: '6px',
		fontFamily: 'inherit',
		fontSize: '13px',
		outline: 'none',
		transition: 'border-color 0.12s, box-shadow 0.12s'
	},
	'&.cm-editor .cm-panel.cm-search .cm-textfield::placeholder': {
		color: 'hsl(var(--muted-foreground))',
		opacity: '1'
	},
	'&.cm-editor .cm-panel.cm-search .cm-textfield:focus': {
		borderColor: 'hsl(var(--ring))',
		boxShadow: '0 0 0 2px hsl(var(--ring) / 0.25)'
	},
	// Next / Previous / Select all / Replace / Replace all
	'&.cm-editor .cm-panel.cm-search .cm-button': {
		boxSizing: 'border-box',
		height: '30px',
		padding: '0 12px',
		backgroundImage: 'none',
		backgroundColor: 'hsl(var(--muted))',
		color: 'hsl(var(--foreground))',
		border: '1px solid hsl(var(--border-strong) / 0.6)',
		borderRadius: '6px',
		fontFamily: 'inherit',
		fontSize: '12.5px',
		fontWeight: '500',
		cursor: 'pointer',
		transition: 'background-color 0.12s, border-color 0.12s'
	},
	'&.cm-editor .cm-panel.cm-search .cm-button:hover': {
		backgroundColor: 'hsl(var(--border))',
		borderColor: 'hsl(var(--border-strong))'
	},
	'&.cm-editor .cm-panel.cm-search .cm-button:active': {
		backgroundImage: 'none',
		backgroundColor: 'hsl(var(--border-strong) / 0.35)'
	},
	'&.cm-editor .cm-panel.cm-search .cm-button:focus-visible, &.cm-editor .cm-panel.cm-search button[name=close]:focus-visible':
		{
			outline: '2px solid hsl(var(--ring))',
			outlineOffset: '1px'
		},
	// Match case / Regex / Whole word
	'&.cm-editor .cm-panel.cm-search label': {
		display: 'inline-flex',
		alignItems: 'center',
		gap: '6px',
		height: '30px',
		padding: '0 4px',
		color: 'hsl(var(--muted-foreground))',
		fontSize: '12.5px',
		whiteSpace: 'nowrap',
		cursor: 'pointer',
		userSelect: 'none'
	},
	'&.cm-editor .cm-panel.cm-search label:hover': {
		color: 'hsl(var(--foreground))'
	},
	'&.cm-editor .cm-panel.cm-search input[type=checkbox]': {
		width: '14px',
		height: '14px',
		margin: '0',
		accentColor: 'hsl(var(--accent))',
		cursor: 'pointer'
	},
	// Close (×)
	'&.cm-editor .cm-panel.cm-search button[name=close]': {
		position: 'absolute',
		top: '11px',
		right: '10px',
		width: '26px',
		height: '26px',
		margin: '0',
		padding: '0',
		display: 'inline-flex',
		alignItems: 'center',
		justifyContent: 'center',
		backgroundColor: 'transparent',
		color: 'hsl(var(--muted-foreground))',
		border: 'none',
		borderRadius: '6px',
		fontSize: '18px',
		lineHeight: '1',
		cursor: 'pointer'
	},
	'&.cm-editor .cm-panel.cm-search button[name=close]:hover': {
		backgroundColor: 'hsl(var(--muted))',
		color: 'hsl(var(--foreground))'
	},
	// Match highlights: goldenrod for every hit, accent underline for the current
	// one, so the current match stays distinguishable from the others without
	// relying on hue alone.
	'&.cm-editor .cm-searchMatch': {
		backgroundColor: 'hsl(var(--warning) / 0.28)',
		borderRadius: '2px'
	},
	'&.cm-editor .cm-searchMatch.cm-searchMatch-selected': {
		backgroundColor: 'hsl(var(--accent) / 0.32)',
		boxShadow: 'inset 0 -2px 0 hsl(var(--accent))'
	},
	// Placeholder
	'.cm-placeholder': {
		color: 'hsl(var(--muted-foreground))',
		fontStyle: 'italic'
	},
	// Scrollbar styling
	'.cm-scroller': {
		overflow: 'auto',
		scrollbarWidth: 'thin',
		scrollbarColor: 'hsl(var(--border)) transparent'
	},
	// Sticky scroll heading panel
	'.cm-sticky-scroll': {
		backgroundColor: 'hsl(var(--card))',
		borderBottom: '1px solid hsl(var(--border))',
		fontFamily:
			'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace',
		fontSize: '13px',
		lineHeight: '1.4',
		overflow: 'hidden',
		zIndex: '5'
	},
	'.cm-sticky-scroll-line': {
		display: 'block',
		width: '100%',
		padding: '2px 12px',
		minHeight: '24px',
		margin: '0',
		border: 'none',
		background: 'none',
		textAlign: 'left',
		whiteSpace: 'nowrap',
		overflow: 'hidden',
		textOverflow: 'ellipsis',
		color: 'hsl(var(--muted-foreground))',
		cursor: 'pointer',
		transition: 'background-color 0.1s, color 0.1s',
		fontFamily: 'inherit',
		fontSize: 'inherit',
		lineHeight: 'inherit',
		touchAction: 'manipulation',
		WebkitTapHighlightColor: 'transparent'
	},
	'.cm-sticky-scroll-line:hover': {
		backgroundColor: 'hsl(var(--muted) / 0.5)',
		color: 'hsl(var(--foreground))'
	},
	'.cm-sticky-scroll-line:active': {
		backgroundColor: 'hsl(var(--muted) / 0.65)',
		color: 'hsl(var(--foreground))'
	},
	'.cm-sticky-scroll-line:focus-visible': {
		outline: '2px solid hsl(var(--ring))',
		outlineOffset: '-2px',
		color: 'hsl(var(--foreground))'
	},
	// Level-based indentation
	'.cm-sticky-scroll-h2': { paddingLeft: '24px' },
	'.cm-sticky-scroll-h3': { paddingLeft: '36px', fontSize: '12px', opacity: '0.85' },
	'.cm-sticky-scroll-h4': { paddingLeft: '48px', fontSize: '12px', opacity: '0.85' },
	'.cm-sticky-scroll-h5': { paddingLeft: '60px', fontSize: '12px', opacity: '0.8' },
	'.cm-sticky-scroll-h6': { paddingLeft: '72px', fontSize: '12px', opacity: '0.8' },
	'@media (max-width: 768px)': {
		'.cm-sticky-scroll': {
			fontSize: '12px'
		},
		'.cm-sticky-scroll-line': {
			padding: '4px 10px',
			minHeight: '30px'
		},
		'.cm-sticky-scroll-h2': { paddingLeft: '18px' },
		'.cm-sticky-scroll-h3': { paddingLeft: '26px', fontSize: '11px', opacity: '0.9' },
		'.cm-sticky-scroll-h4': { paddingLeft: '34px', fontSize: '11px', opacity: '0.9' },
		'.cm-sticky-scroll-h5': { paddingLeft: '42px', fontSize: '11px', opacity: '0.85' },
		'.cm-sticky-scroll-h6': { paddingLeft: '50px', fontSize: '11px', opacity: '0.85' }
	},
	'@media (pointer: coarse)': {
		'.cm-sticky-scroll-line': {
			minHeight: '34px',
			paddingTop: '6px',
			paddingBottom: '6px'
		}
	}
});

// ---------------------------------------------------------------------------
// Syntax highlighting (markdown-focused)
// ---------------------------------------------------------------------------

export const inkprintHighlightStyle = HighlightStyle.define([
	// Headings
	{
		tag: tags.heading1,
		fontWeight: '700',
		fontSize: '1.35em',
		color: 'hsl(var(--foreground))'
	},
	{
		tag: tags.heading2,
		fontWeight: '600',
		fontSize: '1.2em',
		color: 'hsl(var(--foreground))'
	},
	{
		tag: tags.heading3,
		fontWeight: '600',
		fontSize: '1.1em',
		color: 'hsl(var(--foreground))'
	},
	{
		tag: tags.heading4,
		fontWeight: '600',
		color: 'hsl(var(--foreground))'
	},
	// Emphasis
	{ tag: tags.emphasis, fontStyle: 'italic', color: 'hsl(var(--foreground))' },
	{ tag: tags.strong, fontWeight: '700', color: 'hsl(var(--foreground))' },
	{ tag: tags.strikethrough, textDecoration: 'line-through' },
	// Code
	{
		tag: tags.monospace,
		fontFamily:
			'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace',
		backgroundColor: 'hsl(var(--muted) / 0.5)',
		borderRadius: '3px',
		// No horizontal padding: the backticks and any search-match/mention
		// decoration split this token into several spans, and per-span padding
		// opened visible gaps inside the code ("docs/founder/ sam os-…").
		padding: '1px 0',
		fontSize: '0.9em'
	},
	// Links
	{
		tag: tags.link,
		color: 'hsl(var(--accent))',
		textDecoration: 'underline',
		textUnderlineOffset: '2px'
	},
	{ tag: tags.url, color: 'hsl(var(--accent) / 0.7)' },
	// Quotes
	{
		tag: tags.quote,
		fontStyle: 'italic',
		color: 'hsl(var(--muted-foreground))'
	},
	// Lists
	{ tag: tags.list, color: 'hsl(var(--accent))' },
	// Markdown meta characters (syntax chars like **, ##, >, -)
	{
		tag: tags.processingInstruction,
		color: 'hsl(var(--muted-foreground) / 0.5)'
	},
	{ tag: tags.meta, color: 'hsl(var(--muted-foreground) / 0.5)' },
	// HTML/content
	{ tag: tags.content, color: 'hsl(var(--foreground))' },
	// Misc
	{ tag: tags.comment, color: 'hsl(var(--muted-foreground))' },
	{ tag: tags.invalid, color: 'hsl(var(--destructive))' }
]);

// ---------------------------------------------------------------------------
// Combined theme export
// ---------------------------------------------------------------------------

/** Complete Inkprint theme: editor chrome + syntax highlighting */
export const inkprintTheme = [inkprintEditorTheme, syntaxHighlighting(inkprintHighlightStyle)];
