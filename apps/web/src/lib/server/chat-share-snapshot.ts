// apps/web/src/lib/server/chat-share-snapshot.ts
import { Lexer, Marked, type Token, type Tokens } from 'marked';
import sanitizeHtml from 'sanitize-html';
import TurndownService from 'turndown';
import { z } from 'zod';
import type { ChatSessionRestore } from '$lib/types/chat-session-restore';
import type { ChatSharePreviewMessage, SharedChatSnapshotV1 } from '$lib/types/chat-share';
import { buildAgentTimeline } from '$lib/components/agent/agent-chat-timeline';
import { isPublicExternalLink } from '$lib/components/agent/shared-chat-markdown';

// Production sizing, 2026-10-19: 1,603 sessions; p99 = 14 messages / 17,004 bytes;
// maxima = 22 messages / 127,481 bytes. Both caps exceed p99; never cut a message.
export const CHAT_SHARE_MAX_MESSAGES = 100;
export const CHAT_SHARE_MAX_BYTES = 128 * 1024;
const count = z.number().int().nonnegative();
const publicSnapshot = z.object({
	version: z.literal(1),
	title: z.string(),
	messages: z
		.array(
			z.object({
				role: z.enum(['user', 'assistant']),
				markdown: z.string(),
				at: z.string().datetime(),
				work: z.object({ seconds: count, steps: count }).optional(),
				made: z.array(z.object({ kind: z.string(), label: z.string() })).optional(),
				withheld: z
					.object({
						images: count.optional(),
						files: count.optional(),
						voice: count.optional()
					})
					.optional()
			})
		)
		.min(1)
		.max(CHAT_SHARE_MAX_MESSAGES)
});

/** Strip unknown fields again at the public boundary, including future stored metadata. */
export function parseSharedChatSnapshot(value: unknown): SharedChatSnapshotV1 | null {
	const result = publicSnapshot.safeParse(value);
	return result.success ? result.data : null;
}
// Structural identifier redaction, never classification of natural language.
// No word boundaries: `task_<uuid>`, `task\_<uuid>` and `id<uuid>` must not slip through.
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
// Hyphenless UUIDs and longer hex IDs. A run with no hex letter is an ordinary number.
const HEX_ID = /[0-9a-f]{32,}/gi;
const ID_PLACEHOLDER = '[identifier removed]';
export const removeShareIds = (value: string) =>
	value
		.replace(UUID, ID_PLACEHOLDER)
		.replace(HEX_ID, (match) => (/[a-f]/i.test(match) ? ID_PLACEHOLDER : match));
const escapeHtml = (s: string) =>
	s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export { isPublicExternalLink };

/** Relative paths and BuildOS/local hosts: links that point into someone's workspace. */
function isWorkspaceLink(href: string): boolean {
	try {
		const host = new URL(href).hostname.toLowerCase().replace(/\.$/, '');
		return (
			host === 'build-os.com' ||
			host.endsWith('.build-os.com') ||
			host === 'localhost' ||
			host.endsWith('.localhost') ||
			host === '127.0.0.1' ||
			host === '[::1]'
		);
	} catch {
		return true;
	}
}

/**
 * Visible text for a link that will not stay a link. A bare workspace URL
 * (`https://build-os.com/projects/x`, GFM's `www.build-os.com/...`) becomes
 * "Workspace link"; any other link keeps its label as plain text.
 */
function unlinkedLabel(token: Tokens.Link, label: string): string {
	const bare = token.text === token.href || token.raw === token.text;
	return bare && isWorkspaceLink(token.href) ? 'Workspace link' : label;
}

const SHARED_HTML_TAGS = [
	'p',
	'br',
	'strong',
	'em',
	'del',
	'blockquote',
	'ul',
	'ol',
	'li',
	'pre',
	'code',
	'h1',
	'h2',
	'h3',
	'h4',
	'h5',
	'h6',
	'hr',
	'a',
	'table',
	'thead',
	'tbody',
	'tr',
	'th',
	'td'
];

/** Parse links structurally; a second HTML allowlist prevents re-embedding media. */
export function cleanSharedMarkdown(content: string): { markdown: string; images: number } {
	let images = 0;
	const marked = new Marked({
		// Match the chat transcript: a single newline is a line break.
		breaks: true,
		renderer: {
			link(token) {
				const label = this.parser.parseInline(token.tokens);
				if (!isPublicExternalLink(token.href)) return unlinkedLabel(token, label);
				return `<a href="${escapeHtml(token.href)}">${label}</a>`;
			},
			image() {
				images += 1;
				return '';
			},
			html({ text }) {
				// HTML is structured syntax; count media without preserving markup, attributes or URLs.
				sanitizeHtml(text, {
					allowedTags: [],
					transformTags: {
						img() {
							images += 1;
							return { tagName: 'span', attribs: {} };
						}
					}
				});
				return '';
			}
		}
	});
	const html = marked.parse(removeShareIds(content), { async: false });
	const safe = sanitizeHtml(html, {
		allowedTags: SHARED_HTML_TAGS,
		allowedAttributes: { a: ['href'] },
		allowedSchemes: ['https'],
		allowProtocolRelative: false
	});
	const turndown = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced' });
	// Text nodes are already HTML-decoded, so entity-encoded markup (`&lt;img src=…&gt;`)
	// arrives here as literal `<img …>`. Re-encode angle brackets so the stored markdown can
	// never contain raw HTML. Code spans and fences bypass escape() and stay literal code.
	const escapeMarkdown = turndown.escape.bind(turndown);
	turndown.escape = (text: string) =>
		escapeMarkdown(text.replace(/</g, '&lt;').replace(/>/g, '&gt;'));
	// Retain GFM table structure so the existing transcript renderer can scroll wide tables.
	turndown.addRule('table-row', {
		filter: 'tr',
		replacement(content, node) {
			const row = `| ${content.trim()}`;
			const header = node.parentNode?.nodeName === 'THEAD';
			const separator = header
				? `\n| ${Array.from(node.childNodes)
						.filter((cell) => cell.nodeName === 'TH')
						.map(() => '--- |')
						.join(' ')}`
				: '';
			return `\n${row}${separator}\n`;
		}
	});
	turndown.addRule('table-cell', {
		filter: ['th', 'td'],
		replacement(content) {
			return `${content.trim().replace(/\r?\n/g, ' ')} | `;
		}
	});
	turndown.addRule('strikethrough', {
		filter: 'del',
		replacement: (content) => `~~${content}~~`
	});
	return { markdown: removeShareIds(turndown.turndown(safe)).trim(), images };
}

const BLOCK_TOKENS = new Set([
	'paragraph',
	'heading',
	'code',
	'blockquote',
	'list',
	'list_item',
	'table',
	'hr'
]);

/** What a reader sees, as plain text: markup, media and raw HTML removed; link targets optional. */
function tokensToText(tokens: Token[] | undefined, withHrefs: boolean): string {
	let out = '';
	for (const token of tokens ?? []) {
		switch (token.type) {
			case 'image':
			case 'html':
			case 'def':
				break;
			case 'space':
			case 'br':
			case 'hr':
				out += '\n';
				break;
			case 'link': {
				const link = token as Tokens.Link;
				const label = tokensToText(link.tokens, withHrefs);
				out += isPublicExternalLink(link.href) ? label : unlinkedLabel(link, label);
				if (withHrefs) out += ` ${link.href}`;
				break;
			}
			case 'codespan':
			case 'code':
			case 'escape':
				out += (token as Tokens.Codespan).text;
				break;
			case 'list':
				for (const item of (token as Tokens.List).items)
					out += `${tokensToText(item.tokens, withHrefs)}\n`;
				break;
			case 'table': {
				const table = token as Tokens.Table;
				for (const row of [table.header, ...table.rows])
					out += `${row.map((cell) => tokensToText(cell.tokens, withHrefs)).join(' ')}\n`;
				break;
			}
			default:
				if ('tokens' in token && Array.isArray(token.tokens))
					out += tokensToText(token.tokens as Token[], withHrefs);
				else if ('text' in token && typeof token.text === 'string') out += token.text;
		}
		if (BLOCK_TOKENS.has(token.type) && !out.endsWith('\n')) out += '\n';
	}
	return out;
}

const blockLexer = () => new Lexer({ gfm: true, breaks: true });

/**
 * Plain-text views of cleaned share markdown for the fixed-format secret scan:
 * `unescaped` is the markdown with backslash escapes and the cleaner's angle
 * bracket entities undone (so `sk\_live\_…` reads `sk_live_…`); `plain` is
 * the rendered text plus link targets (so markup can't split a secret).
 */
export function sharedMarkdownScanViews(markdown: string): { unescaped: string; plain: string } {
	// CommonMark backslash escapes and HTML entities are structured syntax, not prose.
	const unescaped = markdown
		.replace(/\\([!-/:-@[-`{-~])/g, '$1')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&quot;/g, '"')
		.replace(/&#0*39;/g, "'")
		.replace(/&amp;/g, '&');
	let plain = '';
	try {
		plain = tokensToText(blockLexer().lex(markdown), true);
	} catch {
		plain = unescaped;
	}
	return { unescaped, plain };
}

/** A decoded, unescaped plain-text label (title, byline, created-item label), IDs removed. */
export function cleanSharedLabel(value: string, fallback = 'Shared chat', limit = 500): string {
	let text: string;
	try {
		text = tokensToText(Lexer.lexInline(removeShareIds(value), { gfm: true }), false);
	} catch {
		text = value;
	}
	return removeShareIds(text).replace(/\s+/g, ' ').trim().slice(0, limit).trim() || fallback;
}

type ShareMessage = ChatSessionRestore['messages'][number] & {
	attachments?: Array<{ media_type?: string | null }>;
};
export type ChatShareSource = Omit<ChatSessionRestore, 'messages'> & {
	title: string;
	messages: ShareMessage[];
	totalMessages?: number;
};

/** Owner-only candidates keep selection IDs; publication uses buildSharedChatSnapshot below. */
export function buildChatShareCandidates(source: ChatShareSource) {
	const eligible = source.messages.filter((m) => m.role === 'user' || m.role === 'assistant');
	const chosen: ShareMessage[] = [];
	let bytes = 0;
	for (const message of [...eligible].reverse()) {
		const next = Buffer.byteLength(message.content ?? '', 'utf8');
		if (chosen.length >= CHAT_SHARE_MAX_MESSAGES || bytes + next > CHAT_SHARE_MAX_BYTES) break;
		chosen.unshift(message);
		bytes += next;
	}
	const timeline = buildAgentTimeline({ sessionId: '', ...source, includeToolDetails: false });
	const messages: ChatSharePreviewMessage[] = chosen.map((message) => {
		const clean = cleanSharedMarkdown(message.content ?? '');
		const metadata =
			message.metadata &&
			typeof message.metadata === 'object' &&
			!Array.isArray(message.metadata)
				? (message.metadata as Record<string, unknown>)
				: {};
		const run = source.turnRuns.find((run) => run.assistant_message_id === message.id);
		const tools = source.toolExecutions.filter((t) =>
			run ? t.turn_run_id === run.id : t.message_id === message.id
		);
		const duration =
			run?.started_at && run.finished_at
				? Date.parse(run.finished_at) - Date.parse(run.started_at)
				: NaN;
		const changes = timeline.filter(
			(item) =>
				item.kind === 'change' &&
				(run ? item.turnRunId === run.id : item.messageId === message.id)
		);
		const made = changes.flatMap((item) =>
			item.entityRefs
				.filter((ref) => ref.operation === 'created' && ref.title)
				.map((ref) => ({
					kind: cleanSharedLabel(ref.kind, 'item', 40),
					label: cleanSharedLabel(ref.title!, 'Untitled', 300)
				}))
		);
		const images = Math.max(
			clean.images,
			message.attachments?.filter((a) => a.media_type === 'image').length ?? 0
		);
		const files =
			message.attachments?.filter((a) => a.media_type !== 'image' && a.media_type !== 'audio')
				.length ?? 0;
		const voice = Math.max(
			message.attachments?.filter((a) => a.media_type === 'audio').length ?? 0,
			typeof metadata.voice_note_group_id === 'string' ? 1 : 0
		);
		return {
			id: message.id,
			role: message.role as 'user' | 'assistant',
			markdown: clean.markdown,
			at: new Date(
				message.created_at && Number.isFinite(Date.parse(message.created_at))
					? message.created_at
					: 0
			).toISOString(),
			...(message.role === 'assistant' && Number.isFinite(duration)
				? {
						work: {
							seconds: Math.max(0, Math.round(duration / 1000)),
							steps: tools.length
						}
					}
				: {}),
			...(made.length
				? {
						made: Array.from(
							new Map(made.map((m) => [`${m.kind}:${m.label}`, m])).values()
						)
					}
				: {}),
			...(images || files || voice
				? {
						withheld: {
							...(images ? { images } : {}),
							...(files ? { files } : {}),
							...(voice ? { voice } : {})
						}
					}
				: {})
		};
	});
	const omittedMessages = Math.max(0, (source.totalMessages ?? eligible.length) - chosen.length);
	return {
		title: cleanSharedLabel(source.title),
		messages,
		truncated: omittedMessages ? { omittedMessages } : null
	};
}

export function buildSharedChatSnapshot(
	source: ChatShareSource,
	includedMessageIds: string[]
): SharedChatSnapshotV1 {
	const candidates = buildChatShareCandidates(source);
	const included = new Set(includedMessageIds);
	return {
		version: 1,
		title: candidates.title,
		messages: candidates.messages
			.filter((m) => included.has(m.id))
			.map(({ role, markdown, at, work, made, withheld }) => ({
				role,
				markdown,
				at,
				...(work ? { work } : {}),
				...(made ? { made } : {}),
				...(withheld ? { withheld } : {})
			}))
	};
}
