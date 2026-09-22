// packages/shared-agent-ops/src/web/tavily-extract.ts
//
// Escalation tier for pages a plain fetch cannot read (bot walls, JS apps):
// Tavily's own crawler returns the page as markdown. Paid per success:
// "advanced" costs 2 credits per 5 successful URLs (docs.tavily.com, Extract).
import { decodeHtmlEntities, normalizeReadableText, type PageLink } from './page-reader';

export const TAVILY_EXTRACT_URL = 'https://api.tavily.com/extract';

export interface TavilyExtractedPage {
	url: string;
	text: string;
	links: PageLink[];
	credits: number;
	/** Tavily may omit usage; 2 credits per 5 successful advanced URLs = 0.4 each. */
	creditsSource: 'provider_reported' | 'estimate';
	requestId?: string;
}

export const TAVILY_EXTRACT_ADVANCED_CREDITS_PER_URL = 0.4;

export class TavilyExtractError extends Error {
	constructor(
		message: string,
		readonly code: 'configuration' | 'http' | 'failed_url' | 'invalid_response' | 'request'
	) {
		super(message);
		this.name = 'TavilyExtractError';
	}
}

function siteOf(hostname: string): string {
	return hostname
		.toLowerCase()
		.replace(/^www\./, '')
		.split('.')
		.slice(-2)
		.join('.');
}

/** Markdown links → PageLinks; link syntax → plain text for reading. */
export function readTavilyMarkdown(
	markdown: string,
	pageUrl: string
): { text: string; links: PageLink[] } {
	const site = siteOf(new URL(pageUrl).hostname);
	const links = new Map<string, PageLink>();
	// Structured-format parsing of markdown link syntax, not language.
	const linkPattern = /!?\[([^\]\n]{0,300})\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g;
	for (const match of markdown.matchAll(linkPattern)) {
		if (match[0].startsWith('!')) continue;
		let resolved: URL;
		try {
			resolved = new URL(match[2]!, pageUrl);
		} catch {
			continue;
		}
		if (resolved.protocol !== 'http:' && resolved.protocol !== 'https:') continue;
		resolved.hash = '';
		const url = resolved.toString();
		const label = decodeHtmlEntities(match[1] ?? '')
			.replace(/[*_`]/g, '')
			.replace(/\s+/g, ' ')
			.trim()
			.slice(0, 90);
		const existing = links.get(url);
		if (existing) {
			if (label && !existing.label.includes(label))
				existing.label = `${existing.label} | ${label}`.slice(0, 180);
			continue;
		}
		const before = markdown
			.slice(Math.max(0, (match.index ?? 0) - 200), match.index ?? 0)
			.replace(linkPattern, '$1')
			.replace(/\s+/g, ' ')
			.trim()
			.slice(-90);
		links.set(url, {
			url,
			label,
			context: before,
			sameSite: siteOf(resolved.hostname) === site
		});
	}
	const text = normalizeReadableText(
		markdown.replace(/!\[[^\]]*\]\([^)]*\)/g, '').replace(linkPattern, '$1')
	);
	const all = [...links.values()];
	return { text, links: [...all.filter((l) => l.sameSite), ...all.filter((l) => !l.sameSite)] };
}

export async function extractWithTavily(options: {
	apiKey: string;
	url: string;
	fetchFn?: typeof fetch;
	timeoutMs?: number;
	signal?: AbortSignal;
}): Promise<TavilyExtractedPage> {
	const apiKey = options.apiKey.trim();
	if (!apiKey) throw new TavilyExtractError('Tavily API key is not configured', 'configuration');
	const timeoutMs = Math.max(1_000, options.timeoutMs ?? 20_000);
	const controller = new AbortController();
	const onAbort = () => controller.abort(options.signal?.reason);
	options.signal?.addEventListener('abort', onAbort, { once: true });
	const timer = setTimeout(
		() => controller.abort(new Error('Tavily extract timed out')),
		timeoutMs
	);
	let response: Response;
	try {
		response = await (options.fetchFn ?? fetch)(TAVILY_EXTRACT_URL, {
			method: 'POST',
			headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
			body: JSON.stringify({
				urls: [options.url],
				extract_depth: 'advanced',
				format: 'markdown',
				include_images: false,
				include_usage: true,
				timeout: Math.max(1, Math.min(60, Math.floor(timeoutMs / 1_000) - 1))
			}),
			signal: controller.signal
		});
	} catch (error) {
		clearTimeout(timer);
		options.signal?.removeEventListener('abort', onAbort);
		if (options.signal?.aborted) throw options.signal.reason ?? error;
		throw new TavilyExtractError(
			`Tavily extract failed: ${error instanceof Error ? error.message : String(error)}`,
			'request'
		);
	}
	try {
		if (!response.ok) {
			throw new TavilyExtractError(`Tavily extract failed (${response.status})`, 'http');
		}
		const payload = (await response.json()) as Record<string, unknown>;
		const results = Array.isArray(payload.results) ? payload.results : [];
		const first = results[0] as Record<string, unknown> | undefined;
		const raw = typeof first?.raw_content === 'string' ? first.raw_content : '';
		const usage = payload.usage as Record<string, unknown> | undefined;
		const reported =
			typeof usage?.credits === 'number' &&
			Number.isFinite(usage.credits) &&
			usage.credits > 0
				? usage.credits
				: null;
		if (!raw.trim()) {
			throw new TavilyExtractError('Tavily could not extract this page', 'failed_url');
		}
		const pageUrl = typeof first?.url === 'string' ? first.url : options.url;
		const { text, links } = readTavilyMarkdown(raw, pageUrl);
		return {
			url: pageUrl,
			text,
			links,
			credits: reported ?? TAVILY_EXTRACT_ADVANCED_CREDITS_PER_URL,
			creditsSource: reported === null ? 'estimate' : 'provider_reported',
			...(typeof payload.request_id === 'string' ? { requestId: payload.request_id } : {})
		};
	} catch (error) {
		if (error instanceof TavilyExtractError) throw error;
		throw new TavilyExtractError(
			'Tavily extract returned an invalid response',
			'invalid_response'
		);
	} finally {
		clearTimeout(timer);
		options.signal?.removeEventListener('abort', onAbort);
	}
}
