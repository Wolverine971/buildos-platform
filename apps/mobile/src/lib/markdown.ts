// apps/mobile/src/lib/markdown.ts
import { lexer, type Token, type Tokens } from 'marked';

/**
 * Markdown for the phone's reader, as a small block model the native renderer draws with
 * Inkprint styles. Parsing uses the same `marked` the website uses, so a doc reads the same on
 * both. Raw HTML is shown as its text, never interpreted.
 */

export type Inline =
	| { kind: 'text'; text: string }
	| { kind: 'strong' | 'em' | 'del'; children: Inline[] }
	| { kind: 'code'; text: string }
	| { kind: 'link'; href: string; children: Inline[] }
	| { kind: 'break' };

export type ListItem = { checked: boolean | null; blocks: Block[] };

export type Block =
	| { kind: 'heading'; depth: number; inline: Inline[] }
	| { kind: 'paragraph'; inline: Inline[] }
	| { kind: 'list'; ordered: boolean; start: number; items: ListItem[] }
	| { kind: 'quote'; blocks: Block[] }
	| { kind: 'code'; text: string; lang: string | null }
	| { kind: 'rule' }
	| { kind: 'table'; header: Inline[][]; rows: Inline[][][] };

function decode(text: string): string {
	return text
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'")
		.replace(/&amp;/g, '&');
}

function inlineFrom(tokens: Token[] | undefined): Inline[] {
	const out: Inline[] = [];
	for (const token of tokens ?? []) {
		switch (token.type) {
			case 'text': {
				const t = token as Tokens.Text;
				if (t.tokens?.length) out.push(...inlineFrom(t.tokens));
				else out.push({ kind: 'text', text: decode(t.text) });
				break;
			}
			case 'escape':
				out.push({ kind: 'text', text: decode((token as Tokens.Escape).text) });
				break;
			case 'strong':
			case 'em':
			case 'del':
				out.push({
					kind: token.type,
					children: inlineFrom((token as Tokens.Strong).tokens)
				});
				break;
			case 'codespan':
				out.push({ kind: 'code', text: decode((token as Tokens.Codespan).text) });
				break;
			case 'link': {
				const link = token as Tokens.Link;
				out.push({ kind: 'link', href: link.href, children: inlineFrom(link.tokens) });
				break;
			}
			case 'image': {
				const image = token as Tokens.Image;
				out.push({
					kind: 'link',
					href: image.href,
					children: [{ kind: 'text', text: image.text || 'Image' }]
				});
				break;
			}
			case 'br':
				out.push({ kind: 'break' });
				break;
			default:
				if ('raw' in token && typeof token.raw === 'string') {
					out.push({ kind: 'text', text: token.raw });
				}
		}
	}
	return out;
}

function blocksFrom(tokens: Token[]): Block[] {
	const out: Block[] = [];
	for (const token of tokens) {
		switch (token.type) {
			case 'space':
				break;
			case 'heading': {
				const h = token as Tokens.Heading;
				out.push({ kind: 'heading', depth: h.depth, inline: inlineFrom(h.tokens) });
				break;
			}
			case 'paragraph':
				out.push({
					kind: 'paragraph',
					inline: inlineFrom((token as Tokens.Paragraph).tokens)
				});
				break;
			case 'text': {
				// Loose text at block level (inside tight list items).
				const t = token as Tokens.Text;
				out.push({
					kind: 'paragraph',
					inline: t.tokens?.length
						? inlineFrom(t.tokens)
						: [{ kind: 'text', text: decode(t.text) }]
				});
				break;
			}
			case 'list': {
				const list = token as Tokens.List;
				out.push({
					kind: 'list',
					ordered: list.ordered,
					start: typeof list.start === 'number' ? list.start : 1,
					items: list.items.map((item) => ({
						checked: item.task ? Boolean(item.checked) : null,
						blocks: blocksFrom(item.tokens.filter((child) => child.type !== 'checkbox'))
					}))
				});
				break;
			}
			case 'blockquote':
				out.push({
					kind: 'quote',
					blocks: blocksFrom((token as Tokens.Blockquote).tokens)
				});
				break;
			case 'code': {
				const code = token as Tokens.Code;
				out.push({ kind: 'code', text: code.text, lang: code.lang || null });
				break;
			}
			case 'hr':
				out.push({ kind: 'rule' });
				break;
			case 'table': {
				const table = token as Tokens.Table;
				out.push({
					kind: 'table',
					header: table.header.map((cell) => inlineFrom(cell.tokens)),
					rows: table.rows.map((row) => row.map((cell) => inlineFrom(cell.tokens)))
				});
				break;
			}
			default:
				if ('raw' in token && typeof token.raw === 'string' && token.raw.trim()) {
					out.push({
						kind: 'paragraph',
						inline: [{ kind: 'text', text: token.raw.trim() }]
					});
				}
		}
	}
	return out;
}

export function parseMarkdown(source: string | null | undefined): Block[] {
	if (!source?.trim()) return [];
	try {
		return blocksFrom(lexer(source, { gfm: true }));
	} catch {
		return [{ kind: 'paragraph', inline: [{ kind: 'text', text: source }] }];
	}
}

/** Plain text of some inline content, for accessibility labels and previews. */
export function inlineText(inline: Inline[]): string {
	return inline
		.map((node) => {
			if (node.kind === 'text' || node.kind === 'code') return node.text;
			if (node.kind === 'break') return '\n';
			return inlineText(node.children);
		})
		.join('');
}
