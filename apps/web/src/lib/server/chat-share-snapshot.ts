// apps/web/src/lib/server/chat-share-snapshot.ts
import { Marked } from 'marked';
import sanitizeHtml from 'sanitize-html';
import TurndownService from 'turndown';
import { z } from 'zod';
import type { ChatSessionRestore } from '$lib/types/chat-session-restore';
import type { ChatSharePreviewMessage, SharedChatSnapshotV1 } from '$lib/types/chat-share';
import { buildAgentTimeline } from '$lib/components/agent/agent-chat-timeline';

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
const UUID = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;
export const removeShareIds = (value: string) => value.replace(UUID, '[identifier removed]');
const escapeHtml = (s: string) =>
	s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function isPublicExternalLink(value: string): boolean {
	try {
		const url = new URL(value);
		const host = url.hostname.toLowerCase().replace(/\.$/, '');
		return (
			url.protocol === 'https:' &&
			!url.username &&
			!url.password &&
			host !== 'build-os.com' &&
			!host.endsWith('.build-os.com') &&
			host !== 'localhost' &&
			host !== '127.0.0.1' &&
			host !== '[::1]'
		);
	} catch {
		return false;
	}
}

/** Parse links structurally; a second HTML allowlist prevents re-embedding media. */
export function cleanSharedMarkdown(content: string): { markdown: string; images: number } {
	let images = 0;
	const marked = new Marked({
		renderer: {
			link({ href, tokens, text }) {
				const label = this.parser.parseInline(tokens);
				if (!isPublicExternalLink(href)) return text === href ? 'Workspace link' : label;
				return `<a href="${escapeHtml(href)}">${label}</a>`;
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
		allowedTags: [
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
		],
		allowedAttributes: { a: ['href'] },
		allowedSchemes: ['https'],
		allowProtocolRelative: false
	});
	const turndown = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced' });
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

export function cleanSharedLabel(value: string, fallback = 'Shared chat', limit = 500): string {
	const text = sanitizeHtml(cleanSharedMarkdown(value).markdown, {
		allowedTags: [],
		allowedAttributes: {}
	});
	return text.trim().slice(0, limit) || fallback;
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
