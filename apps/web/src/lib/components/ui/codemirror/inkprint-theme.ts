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
	// Search panel styling
	'.cm-panels': {
		backgroundColor: 'hsl(var(--muted))',
		borderBottom: '1px solid hsl(var(--border))',
		color: 'hsl(var(--foreground))'
	},
	'.cm-panels button': {
		cursor: 'pointer',
		backgroundColor: 'hsl(var(--card))',
		color: 'hsl(var(--foreground))',
		border: '1px solid hsl(var(--border))',
		borderRadius: '4px',
		padding: '2px 8px',
		fontSize: '12px'
	},
	'.cm-panels input, .cm-panels select': {
		backgroundColor: 'hsl(var(--card))',
		color: 'hsl(var(--foreground))',
		border: '1px solid hsl(var(--border))',
		borderRadius: '4px',
		padding: '2px 6px',
		fontSize: '12px'
	},
	'.cm-searchMatch': {
		backgroundColor: 'hsl(var(--accent) / 0.25)',
		borderRadius: '2px'
	},
	'.cm-searchMatch.cm-searchMatch-selected': {
		backgroundColor: 'hsl(var(--accent) / 0.45)'
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
		padding: '1px 4px',
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
