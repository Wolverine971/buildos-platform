// apps/web/src/lib/services/agentic-chat/tools/webvisit/index.ts
import { env } from '$env/dynamic/private';
import { fetchUrl } from './url-client';
import { normalizePlainText, parseHtmlToText } from './parser';
import type { WebVisitArgs, WebVisitMode, WebVisitParser, WebVisitResultPayload } from './types';

const DEFAULT_MAX_CHARS = parseNumber(env.WEB_VISIT_MAX_CHARS, 6000);
const MAX_CHARS_CAP = 12000;
const EXCERPT_LIMIT = 280;

function parseNumber(value: string | undefined, fallback: number): number {
	if (!value) return fallback;
	const parsed = Number.parseInt(value, 10);
	return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeUrlInput(url?: string): string {
	const trimmed = url?.trim();
	if (!trimmed) {
		throw new Error('url is required for web_visit');
	}
	const parsed = new URL(trimmed);
	parsed.hash = '';
	return parsed.toString();
}

function normalizeMode(mode?: WebVisitMode): WebVisitMode {
	if (mode === 'reader' || mode === 'raw' || mode === 'auto') return mode;
	return 'auto';
}

function clampMaxChars(value?: number): number {
	const raw = value && !Number.isNaN(value) ? Math.floor(value) : DEFAULT_MAX_CHARS;
	return Math.min(Math.max(raw, 1), MAX_CHARS_CAP);
}

function normalizeContentType(contentType?: string | null): string | undefined {
	if (!contentType) return undefined;
	const primary = contentType.split(';')[0] ?? '';
	const normalized = primary.trim().toLowerCase();
	return normalized.length > 0 ? normalized : undefined;
}

function isHtmlContent(contentType: string | undefined, body: string): boolean {
	if (contentType?.includes('text/html')) return true;
	const snippet = body.trim().slice(0, 200).toLowerCase();
	return snippet.startsWith('<!doctype html') || snippet.startsWith('<html');
}

function isTextContentType(contentType: string | undefined): boolean {
	if (!contentType) return false;
	if (contentType.startsWith('text/')) return true;
	return contentType.includes('json') || contentType.includes('xml');
}

function buildExcerpt(content: string): string | undefined {
	if (!content) return undefined;
	if (content.length <= EXCERPT_LIMIT) return content;
	return `${content.slice(0, EXCERPT_LIMIT)}...`;
}

export async function performWebVisit(
	args: WebVisitArgs,
	fetchFn?: typeof fetch
): Promise<WebVisitResultPayload> {
	const url = normalizeUrlInput(args.url);
	const mode = normalizeMode(args.mode);
	const maxChars = clampMaxChars(args.max_chars);
	const includeLinks = args.include_links ?? false;
	const allowRedirects = args.allow_redirects ?? true;
	const preferLanguage = args.prefer_language?.trim() || undefined;

	const response = await fetchUrl(url, {
		fetchFn,
		allowRedirects,
		preferLanguage
	});

	const contentType = normalizeContentType(response.headers.get('content-type'));
	const isHtml = isHtmlContent(contentType, response.body);

	let content = '';
	let title: string | undefined;
	let links: WebVisitResultPayload['links'];
	let parser: WebVisitParser = 'text';
	let resolvedMode = mode;

	if (isHtml) {
		resolvedMode = mode === 'auto' ? 'reader' : mode;
		const parsed = parseHtmlToText(response.body, {
			mode: resolvedMode === 'raw' ? 'raw' : 'reader',
			includeLinks,
			baseUrl: response.finalUrl
		});
		content = parsed.content;
		title = parsed.title;
		links = parsed.links;
		parser = parsed.parser;
	} else if (isTextContentType(contentType)) {
		resolvedMode = 'raw';
		content = normalizePlainText(response.body);
		parser = 'text';
	} else {
		throw new Error(`Unsupported content type: ${contentType ?? 'unknown'}.`);
	}

	const trimmed = content.trim();
	const truncated = trimmed.length > maxChars;
	const finalContent = truncated ? trimmed.slice(0, maxChars) : trimmed;

	return {
		url,
		final_url: response.finalUrl,
		status_code: response.status,
		content_type: contentType ?? null,
		title,
		content: finalContent,
		excerpt: buildExcerpt(finalContent),
		truncated,
		links: includeLinks ? links : undefined,
		message: `Web visit content fetched from "${response.finalUrl}".`,
		info: {
			fetched_at: new Date().toISOString(),
			mode: resolvedMode,
			bytes: response.bytes,
			fetch_ms: response.fetchMs,
			parser
		}
	};
}

export type { WebVisitArgs, WebVisitMode, WebVisitResultPayload, WebVisitParser } from './types';
