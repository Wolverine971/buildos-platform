// apps/web/src/lib/services/agentic-chat/tools/core/executors/external-executor.ts
/**
 * External Executor
 *
 * Handles external service tool operations:
 * - web_search: BuildOS live-web discovery plus fetched source evidence
 * - web_visit: Fetch and summarize a specific URL
 * - list/call Corsair MCP tools
 * - get_buildos_overview: BuildOS documentation overview
 * - get_buildos_usage_guide: BuildOS usage guide
 */

import type { Json } from '@buildos/shared-types';
import {
	createSupabaseNativeSearchDiscoveryCacheStore,
	enrichNativeSearchCandidates,
	hashNativeSearchPageContent,
	isGlobalWebPageCacheEligible,
	loadCurrentNativeSearchPageEvidence,
	normalizeWebPageCacheUrl,
	persistNativeSearchPageEvidence,
	type NativeSearchCacheRpcClient,
	type NativeSearchEvidenceChunkReference,
	type NativeSearchEvidenceRpcClient,
	type NativeSearchPageEvidenceReceipt
} from '@buildos/shared-agent-ops/web/native-search';
import { env } from '$env/dynamic/private';
import { BaseExecutor } from './base-executor';
import {
	getBuildosOverviewDocument,
	getBuildosUsageGuide
} from '$lib/services/agentic-chat/tools/buildos';
import {
	performWebSearch,
	type WebSearchArgs,
	type WebSearchResultPayload
} from '$lib/services/agentic-chat/tools/websearch';
import {
	type QueryLibriLibraryArgs,
	type ResolveLibriResourceArgs,
	type LibriLibraryQueryToolResult,
	type LibriResolveToolResult
} from '$lib/services/agentic-chat/tools/libri';
import {
	queryLibriLibrary,
	resolveLibriResource
} from '$lib/services/agentic-chat/tools/libri/client';
import {
	callCorsairMcpTool,
	listCorsairMcpTools,
	type CallCorsairMcpToolArgs
} from '$lib/services/agentic-chat/tools/corsair-mcp';
import { executeDynamicLibriTool } from '$lib/services/agentic-chat/tools/libri';
import {
	buildExcerpt,
	clampMaxChars,
	performWebVisit,
	type WebVisitArgs,
	type WebVisitContentFormat,
	type WebVisitFetchPayload,
	type WebVisitMode,
	type WebVisitOutputFormat,
	type WebVisitResultPayload
} from '$lib/services/agentic-chat/tools/webvisit';
import { convertHtmlToMarkdown } from '$lib/services/agentic-chat/tools/webvisit/markdown';
import { isSameRegistrableDomain } from '$lib/services/agentic-chat/tools/webvisit/parser';
import type { ExecutorContext } from './types';
import { createLogger } from '$lib/utils/logger';

const logger = createLogger('ExternalExecutor');
const DEFAULT_WEB_VISIT_LLM_TIMEOUT_MS = 25000;
const DEFAULT_WEB_VISIT_CACHE_TTL_MS = 15 * 60 * 1000;
const SEARCH_PAGE_MAX_CHARS = 4_000;

interface CachedVisitEntry {
	payload: WebVisitResultPayload;
	id: string;
	visitCount: number;
	etag?: string;
	lastModified?: string;
	lastFetchedAt?: string;
	isFresh: boolean;
}

function parseNumber(value: string | undefined, fallback: number): number {
	if (!value) return fallback;
	const parsed = Number.parseInt(value, 10);
	return Number.isFinite(parsed) ? parsed : fallback;
}

function structuredDataForStorage(
	structuredData: WebVisitFetchPayload['structured_data']
): Json | null {
	if (!structuredData || structuredData.length === 0) return null;
	return structuredData as unknown as Json;
}

function truncateByUnicodeCodePoints(
	content: string,
	maxChars: number
): { content: string; truncated: boolean } {
	const codePoints = Array.from(content);
	return codePoints.length > maxChars
		? { content: codePoints.slice(0, maxChars).join(''), truncated: true }
		: { content, truncated: false };
}

/**
 * Executor for external service tool operations.
 *
 * Provides web search and BuildOS documentation access.
 */
export class ExternalExecutor extends BaseExecutor {
	constructor(context: ExecutorContext) {
		super(context);
	}

	// ============================================
	// WEB SEARCH
	// ============================================

	/**
	 * Perform live-web discovery and enrich the best source pages.
	 */
	async webSearch(args: WebSearchArgs): Promise<WebSearchResultPayload> {
		const durableStore = ['1', 'true', 'yes'].includes(
			(env.NATIVE_SEARCH_DURABLE_CACHE_ENABLED ?? '').trim().toLowerCase()
		)
			? createSupabaseNativeSearchDiscoveryCacheStore(
					this.getAdminSupabase() as unknown as NativeSearchCacheRpcClient
				)
			: undefined;
		const search = await performWebSearch(args, this.fetchFn, durableStore);
		const enriched = await enrichNativeSearchCandidates(search.results, async (result) => {
			const visit = await this.webVisit({
				url: result.url,
				mode: 'auto',
				max_chars: SEARCH_PAGE_MAX_CHARS,
				output_format: 'markdown',
				persist: true
			});
			return {
				title: visit.title,
				content: visit.content,
				finalUrl: visit.final_url,
				fetchedAt: visit.info.fetched_at,
				cacheHit: visit.info.cache_hit ?? false,
				visitId: visit.visit_id,
				versionId: visit.page_version_id,
				versionNumber: visit.page_version_number,
				contentHash: visit.content_hash,
				evidenceChunks: visit.evidence_chunks
			};
		});

		return {
			...search,
			results: enriched.results,
			info: {
				...search.info,
				pages_requested: enriched.pagesRequested,
				pages_fetched: enriched.pagesFetched
			}
		};
	}

	async resolveLibriResource(args: ResolveLibriResourceArgs): Promise<LibriResolveToolResult> {
		return resolveLibriResource(args, {
			fetchFn: this.fetchFn,
			sessionId: this.sessionId
		});
	}

	async queryLibriLibrary(args: QueryLibriLibraryArgs): Promise<LibriLibraryQueryToolResult> {
		return queryLibriLibrary(args, {
			fetchFn: this.fetchFn,
			sessionId: this.sessionId
		});
	}

	async executeDynamicLibriTool(
		toolName: string,
		args: Record<string, any>
	): Promise<Record<string, unknown>> {
		return executeDynamicLibriTool(toolName, args, {
			fetchFn: this.fetchFn
		});
	}

	async listCorsairMcpTools(): Promise<any> {
		return listCorsairMcpTools({
			fetchFn: this.fetchFn
		});
	}

	async callCorsairMcpTool(args: CallCorsairMcpToolArgs): Promise<any> {
		return callCorsairMcpTool(args, {
			fetchFn: this.fetchFn
		});
	}

	/**
	 * Fetch and summarize a specific URL.
	 */
	async webVisit(args: WebVisitArgs): Promise<WebVisitResultPayload> {
		const outputFormat = this.normalizeOutputFormat(args.output_format);
		const persist = args.persist ?? true;
		const maxChars = clampMaxChars(args.max_chars);
		const forceRefresh = args.force_refresh ?? false;
		const cacheEligible = isGlobalWebPageCacheEligible(args.url);

		// Only the default 'markdown' format serves from cache. 'llm_markdown'
		// is the escape hatch for pages where the cached deterministic markdown
		// rendered poorly — serving that same cached markdown back would make
		// the escape hatch a no-op.
		let staleCache: CachedVisitEntry | null = null;
		if (persist && cacheEligible && !forceRefresh && outputFormat === 'markdown') {
			const cached = await this.loadCachedVisit(args.url, maxChars, args.mode);
			if (cached?.isFresh) {
				await this.recordCachedVisitUse(cached);
				return cached.payload;
			}
			staleCache = cached;
		}

		let fetched: WebVisitFetchPayload;
		try {
			fetched = await performWebVisit(args, this.fetchFn, {
				ifNoneMatch: staleCache?.etag,
				ifModifiedSince: staleCache?.lastModified
			});
		} catch (error) {
			if (!staleCache) throw error;
			logger.warn('Page cache revalidation failed; serving stale content', {
				url: args.url,
				error: error instanceof Error ? error.message : String(error)
			});
			await this.recordCachedVisitUse(staleCache);
			return {
				...staleCache.payload,
				message: `Stale cached web visit content served for "${staleCache.payload.final_url}" after revalidation failed.`,
				info: {
					...staleCache.payload.info,
					cache_hit: true,
					cache_stale: true,
					cache_revalidation_failed: true
				}
			};
		}

		if (fetched.info.not_modified) {
			if (!staleCache) {
				throw new Error('Page returned 304 but no cached content was available.');
			}
			await this.recordCachedVisitUse(staleCache, {
				revalidatedAt: fetched.info.fetched_at,
				etag: fetched.info.etag,
				lastModified: fetched.info.last_modified
			});
			return {
				...staleCache.payload,
				message: `Cached web visit content revalidated for "${staleCache.payload.final_url}".`,
				info: {
					...staleCache.payload.info,
					fetched_at: fetched.info.fetched_at,
					fetch_ms: fetched.info.fetch_ms,
					etag: fetched.info.etag ?? staleCache.etag,
					last_modified: fetched.info.last_modified ?? staleCache.lastModified,
					cache_hit: true,
					cache_revalidated: true,
					cache_stale: false
				}
			};
		}

		const responseContent = await this.convertToMarkdownIfNeeded(fetched, outputFormat);

		const trimmedOutput = responseContent.content.trim();
		const { content: finalContent, truncated } = truncateByUnicodeCodePoints(
			trimmedOutput,
			maxChars
		);

		const stored =
			persist && this.isFetchedVisitCacheEligible(fetched)
				? await this.persistWebVisit(fetched, responseContent)
				: undefined;

		return {
			url: fetched.url,
			final_url: fetched.final_url,
			status_code: fetched.status_code,
			content_type: fetched.content_type ?? null,
			title: fetched.title,
			canonical_url: fetched.canonical_url,
			content_format: responseContent.format,
			content: finalContent,
			excerpt: buildExcerpt(finalContent),
			truncated,
			links: fetched.links,
			meta: fetched.meta,
			structured_data: fetched.structured_data,
			visit_id: stored?.id,
			page_version_id: stored?.evidence?.page_version_id,
			page_version_number: stored?.evidence?.version_number,
			content_hash: stored?.evidence?.content_hash ?? stored?.contentHash,
			evidence_chunks: this.evidenceReferencesForContent(
				stored?.evidence?.chunks,
				finalContent
			),
			stored: stored?.stored ?? false,
			message: fetched.message,
			info: {
				...fetched.info,
				html_chars: fetched.info.html_chars,
				markdown_chars: responseContent.markdownChars,
				conversion: responseContent.conversion,
				conversion_ms: responseContent.conversionMs,
				llm_model: responseContent.llmModel,
				llm_ms: responseContent.llmMs,
				llm_prompt_tokens: responseContent.llmPromptTokens,
				llm_completion_tokens: responseContent.llmCompletionTokens,
				llm_total_tokens: responseContent.llmTotalTokens,
				cache_hit: false
			}
		};
	}

	// ============================================
	// BUILDOS DOCS
	// ============================================

	/**
	 * Get BuildOS overview documentation.
	 */
	getBuildosOverview(): any {
		return getBuildosOverviewDocument();
	}

	/**
	 * Get BuildOS usage guide documentation.
	 */
	getBuildosUsageGuide(): any {
		return getBuildosUsageGuide();
	}

	private normalizeOutputFormat(format?: WebVisitOutputFormat): WebVisitOutputFormat {
		if (format === 'text' || format === 'markdown' || format === 'llm_markdown') return format;
		return 'markdown';
	}

	private normalizeMode(mode?: WebVisitMode): WebVisitMode {
		if (mode === 'reader' || mode === 'raw' || mode === 'auto') return mode;
		return 'auto';
	}

	private async convertToMarkdownIfNeeded(
		fetched: WebVisitFetchPayload,
		outputFormat: WebVisitOutputFormat
	): Promise<{
		content: string;
		format: WebVisitContentFormat;
		markdown?: string;
		markdownChars?: number;
		conversion?: 'turndown' | 'llm';
		conversionMs?: number;
		llmModel?: string;
		llmMs?: number;
		llmPromptTokens?: number;
		llmCompletionTokens?: number;
		llmTotalTokens?: number;
		errorMessage?: string;
	}> {
		if (!fetched.trimmed_html || outputFormat === 'text') {
			return {
				content: fetched.text,
				format: 'text'
			};
		}

		if (outputFormat === 'llm_markdown' && this.llmService) {
			const llmResult = await this.convertHtmlToMarkdownViaLlm(fetched);
			if (llmResult) {
				return llmResult;
			}
			// LLM conversion failed — fall through to the deterministic path so
			// the caller still gets markdown instead of a degraded text payload.
		}

		try {
			const { markdown, conversionMs } = convertHtmlToMarkdown(fetched.trimmed_html);
			if (!markdown) {
				return { content: fetched.text, format: 'text' };
			}
			return {
				content: markdown,
				format: 'markdown',
				markdown,
				markdownChars: markdown.length,
				conversion: 'turndown',
				conversionMs
			};
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			logger.warn('[ExternalExecutor] Deterministic markdown conversion failed', {
				url: fetched.url,
				error: errorMessage
			});
			return {
				content: fetched.text,
				format: 'text',
				errorMessage
			};
		}
	}

	private async convertHtmlToMarkdownViaLlm(fetched: WebVisitFetchPayload): Promise<{
		content: string;
		format: WebVisitContentFormat;
		markdown: string;
		markdownChars: number;
		conversion: 'llm';
		llmModel?: string;
		llmMs?: number;
		llmPromptTokens?: number;
		llmCompletionTokens?: number;
		llmTotalTokens?: number;
	} | null> {
		if (!this.llmService) return null;

		const systemPrompt =
			'You convert HTML into clean Markdown for reading. Preserve headings, lists, tables, code blocks, and meaningful links. Remove navigation, footers, ads, and UI chrome. Return Markdown only.';
		const userPrompt = `Convert the following HTML into Markdown. Return Markdown only.\n\nHTML:\n\`\`\`html\n${fetched.trimmed_html}\n\`\`\``;

		try {
			const llmTimeoutMs = parseNumber(
				env.WEB_VISIT_LLM_TIMEOUT_MS,
				DEFAULT_WEB_VISIT_LLM_TIMEOUT_MS
			);
			const start = Date.now();
			const result = await this.llmService.generateTextDetailed({
				prompt: userPrompt,
				systemPrompt,
				profile: 'balanced',
				temperature: 0.2,
				operationType: 'web_visit_markdown',
				chatSessionId: this.sessionId,
				timeoutMs: llmTimeoutMs
			});
			const markdown = result.text.trim();
			if (!markdown) return null;

			return {
				content: markdown,
				format: 'markdown',
				markdown,
				markdownChars: markdown.length,
				conversion: 'llm',
				llmModel: result.model,
				llmMs: Date.now() - start,
				llmPromptTokens: result.usage?.promptTokens,
				llmCompletionTokens: result.usage?.completionTokens,
				llmTotalTokens: result.usage?.totalTokens
			};
		} catch (error) {
			logger.warn('[ExternalExecutor] LLM markdown conversion failed; falling back', {
				url: fetched.url,
				error: error instanceof Error ? error.message : String(error)
			});
			return null;
		}
	}

	private normalizeUrlForStorage(url: string): string {
		return normalizeWebPageCacheUrl(url);
	}

	private isFetchedVisitCacheEligible(fetched: WebVisitFetchPayload): boolean {
		return [fetched.url, fetched.final_url, fetched.canonical_url]
			.filter((url): url is string => Boolean(url))
			.every((url) => isGlobalWebPageCacheEligible(url));
	}

	private async loadCachedVisit(
		url: string,
		maxChars: number,
		mode?: WebVisitMode
	): Promise<CachedVisitEntry | null> {
		if (!isGlobalWebPageCacheEligible(url)) return null;
		const admin = this.getAdminSupabase();
		const normalizedUrl = this.normalizeUrlForStorage(url);

		const { data, error } = (await admin
			.from('web_page_visits')
			.select(
				[
					'id',
					'url',
					'final_url',
					'canonical_url',
					'status_code',
					'content_type',
					'title',
					'meta',
					'structured_data',
					'markdown',
					'content_hash',
					'bytes',
					'last_llm_model',
					'last_llm_ms',
					'llm_prompt_tokens',
					'llm_completion_tokens',
					'llm_total_tokens',
					'visit_count',
					'etag',
					'last_modified',
					'last_fetched_at'
				].join(', ')
			)
			.eq('normalized_url', normalizedUrl)
			.maybeSingle()) as any;

		if (error) {
			logger.warn('Failed to load cached visit', {
				url,
				error: error.message
			});
			return null;
		}

		if (!data?.markdown) return null;
		const cachedUrls = [data.url, data.final_url, data.canonical_url].filter(
			(candidate): candidate is string =>
				typeof candidate === 'string' && candidate.length > 0
		);
		if (!cachedUrls.every((candidate) => isGlobalWebPageCacheEligible(candidate))) {
			logger.warn('Ignoring ineligible global page cache entry', { visitId: data.id });
			return null;
		}

		const trimmedOutput = data.markdown.trim();
		const { content: finalContent, truncated } = truncateByUnicodeCodePoints(
			trimmedOutput,
			maxChars
		);
		const lastFetchedAt =
			typeof data.last_fetched_at === 'string' ? data.last_fetched_at : undefined;
		const lastFetchedMs = lastFetchedAt ? Date.parse(lastFetchedAt) : Number.NaN;
		const cacheTtlMs = parseNumber(env.WEB_VISIT_CACHE_TTL_MS, DEFAULT_WEB_VISIT_CACHE_TTL_MS);
		const evidence = await this.loadVisitEvidence(data.id);
		const payload: WebVisitResultPayload = {
			url: data.url ?? url,
			final_url: data.final_url ?? data.url ?? url,
			status_code: data.status_code ?? 200,
			content_type: data.content_type ?? null,
			title: data.title ?? undefined,
			canonical_url: data.canonical_url ?? undefined,
			content_format: evidence?.content_format ?? 'markdown',
			content: finalContent,
			excerpt: buildExcerpt(finalContent),
			truncated,
			links: undefined,
			meta: (data.meta as Record<string, string>) ?? undefined,
			structured_data: Array.isArray(data.structured_data)
				? (data.structured_data as WebVisitResultPayload['structured_data'])
				: undefined,
			visit_id: data.id,
			page_version_id: evidence?.page_version_id,
			page_version_number: evidence?.version_number,
			content_hash: evidence?.content_hash ?? data.content_hash ?? undefined,
			evidence_chunks: this.evidenceReferencesForContent(evidence?.chunks, finalContent),
			stored: true,
			message: `Web visit content loaded from cache for "${data.final_url ?? data.url ?? url}".`,
			info: {
				fetched_at: lastFetchedAt ?? new Date().toISOString(),
				mode: this.normalizeMode(mode),
				bytes: data.bytes ?? 0,
				fetch_ms: 0,
				parser: 'text',
				markdown_chars: trimmedOutput.length,
				llm_model: data.last_llm_model ?? undefined,
				llm_ms: data.last_llm_ms ?? undefined,
				llm_prompt_tokens: data.llm_prompt_tokens ?? undefined,
				llm_completion_tokens: data.llm_completion_tokens ?? undefined,
				llm_total_tokens: data.llm_total_tokens ?? undefined,
				etag: data.etag ?? undefined,
				last_modified: data.last_modified ?? undefined,
				cache_hit: true
			}
		};

		return {
			payload,
			id: data.id,
			visitCount: data.visit_count ?? 0,
			etag: data.etag ?? undefined,
			lastModified: data.last_modified ?? undefined,
			lastFetchedAt,
			isFresh:
				Number.isFinite(lastFetchedMs) &&
				Date.now() - lastFetchedMs < Math.max(1, cacheTtlMs)
		};
	}

	private async recordCachedVisitUse(
		cached: CachedVisitEntry,
		revalidation?: { revalidatedAt: string; etag?: string; lastModified?: string }
	): Promise<void> {
		const admin = this.getAdminSupabase();
		const update = {
			visit_count: cached.visitCount + 1,
			last_visited_at: new Date().toISOString(),
			...(revalidation
				? {
						last_fetched_at: revalidation.revalidatedAt,
						etag: revalidation.etag ?? cached.etag ?? null,
						last_modified: revalidation.lastModified ?? cached.lastModified ?? null
					}
				: {})
		};
		const { error } = await admin
			.from('web_page_visits')
			.update(update as any)
			.eq('id', cached.id);
		if (error) {
			logger.warn('Failed to record cached web visit use', {
				visitId: cached.id,
				error: error.message
			});
		}
	}

	private async persistWebVisit(
		fetched: WebVisitFetchPayload,
		responseContent: {
			content: string;
			format: WebVisitContentFormat;
			markdown?: string;
			conversion?: 'turndown' | 'llm';
			llmModel?: string;
			llmMs?: number;
			llmPromptTokens?: number;
			llmCompletionTokens?: number;
			llmTotalTokens?: number;
			errorMessage?: string;
		}
	): Promise<
		| {
				id?: string;
				stored: boolean;
				contentHash?: string;
				evidence?: NativeSearchPageEvidenceReceipt;
		  }
		| undefined
	> {
		if (!this.isFetchedVisitCacheEligible(fetched)) return { stored: false };
		const admin = this.getAdminSupabase();
		// SECURITY: web_page_visits is a GLOBAL cross-user cache keyed by
		// normalized_url. Only key/store by the page's declared canonical_url when
		// it shares the final_url's registrable domain; otherwise a page could
		// claim another site's canonical and poison that URL's cache entry for
		// every user. (parser.ts already strips cross-site canonicals — this is
		// defense-in-depth at the cache-key boundary.)
		const cacheKeyUrl =
			fetched.canonical_url &&
			isSameRegistrableDomain(fetched.canonical_url, fetched.final_url)
				? fetched.canonical_url
				: fetched.final_url;
		const normalizedUrl = this.normalizeUrlForStorage(cacheKeyUrl);
		const markdown = (responseContent.markdown ?? fetched.text).trim();
		const excerpt = buildExcerpt(markdown ?? '');
		const contentHash = markdown ? hashNativeSearchPageContent(markdown) : undefined;
		const now = new Date().toISOString();

		try {
			const { data: existing, error: selectError } = await admin
				.from('web_page_visits')
				.select('id, visit_count, first_visited_at')
				.eq('normalized_url', normalizedUrl)
				.maybeSingle();

			if (selectError) {
				throw selectError;
			}

			if (existing?.id) {
				const { data, error } = await admin
					.from('web_page_visits')
					.update({
						url: fetched.url,
						final_url: fetched.final_url,
						canonical_url: fetched.canonical_url ?? null,
						normalized_url: normalizedUrl,
						status_code: fetched.status_code,
						content_type: fetched.content_type ?? null,
						title: fetched.title ?? null,
						meta: fetched.meta ?? null,
						structured_data: structuredDataForStorage(fetched.structured_data),
						markdown,
						excerpt: excerpt ?? null,
						content_hash: contentHash ?? null,
						visit_count: (existing.visit_count ?? 0) + 1,
						last_visited_at: now,
						last_fetched_at: fetched.info.fetched_at,
						etag: fetched.info.etag ?? null,
						last_modified: fetched.info.last_modified ?? null,
						last_fetch_ms: fetched.info.fetch_ms,
						last_llm_ms: responseContent.llmMs ?? null,
						last_llm_model: responseContent.llmModel ?? null,
						llm_prompt_tokens: responseContent.llmPromptTokens ?? null,
						llm_completion_tokens: responseContent.llmCompletionTokens ?? null,
						llm_total_tokens: responseContent.llmTotalTokens ?? null,
						bytes: fetched.info.bytes,
						error_message: responseContent.errorMessage ?? null
					} as any)
					.eq('id', existing.id)
					.select('id')
					.maybeSingle();

				if (error) throw error;
				const evidence = data?.id
					? await this.persistVisitEvidence(data.id, fetched, responseContent, markdown)
					: undefined;
				return { id: data?.id, stored: true, contentHash, evidence };
			}

			const { data, error } = await admin
				.from('web_page_visits')
				.insert({
					url: fetched.url,
					final_url: fetched.final_url,
					canonical_url: fetched.canonical_url ?? null,
					normalized_url: normalizedUrl,
					status_code: fetched.status_code,
					content_type: fetched.content_type ?? null,
					title: fetched.title ?? null,
					meta: fetched.meta ?? null,
					structured_data: structuredDataForStorage(fetched.structured_data),
					markdown,
					excerpt: excerpt ?? null,
					content_hash: contentHash ?? null,
					visit_count: 1,
					first_visited_at: now,
					last_visited_at: now,
					last_fetched_at: fetched.info.fetched_at,
					etag: fetched.info.etag ?? null,
					last_modified: fetched.info.last_modified ?? null,
					last_fetch_ms: fetched.info.fetch_ms,
					last_llm_ms: responseContent.llmMs ?? null,
					last_llm_model: responseContent.llmModel ?? null,
					llm_prompt_tokens: responseContent.llmPromptTokens ?? null,
					llm_completion_tokens: responseContent.llmCompletionTokens ?? null,
					llm_total_tokens: responseContent.llmTotalTokens ?? null,
					bytes: fetched.info.bytes,
					error_message: responseContent.errorMessage ?? null
				} as any)
				.select('id')
				.maybeSingle();

			if (error) throw error;
			const evidence = data?.id
				? await this.persistVisitEvidence(data.id, fetched, responseContent, markdown)
				: undefined;
			return { id: data?.id, stored: true, contentHash, evidence };
		} catch (error) {
			logger.error('[ExternalExecutor] Failed to persist web visit', {
				url: fetched.url,
				error: error instanceof Error ? error.message : String(error)
			});
			return { stored: false };
		}
	}

	private evidenceRpcClient(): NativeSearchEvidenceRpcClient {
		return this.getAdminSupabase() as unknown as NativeSearchEvidenceRpcClient;
	}

	private async loadVisitEvidence(
		pageVisitId: string
	): Promise<NativeSearchPageEvidenceReceipt | undefined> {
		try {
			return (
				(await loadCurrentNativeSearchPageEvidence(
					this.evidenceRpcClient(),
					pageVisitId
				)) ?? undefined
			);
		} catch (error) {
			// Deploy-safe: page caching remains available while the evidence
			// migration rolls out or during a transient RPC failure.
			logger.warn('Failed to load immutable web-page evidence', {
				pageVisitId,
				error: error instanceof Error ? error.message : String(error)
			});
			return undefined;
		}
	}

	private async persistVisitEvidence(
		pageVisitId: string,
		fetched: WebVisitFetchPayload,
		responseContent: {
			format: WebVisitContentFormat;
			conversion?: 'turndown' | 'llm';
		},
		content: string
	): Promise<NativeSearchPageEvidenceReceipt | undefined> {
		if (!content) return undefined;
		try {
			return await persistNativeSearchPageEvidence(this.evidenceRpcClient(), {
				pageVisitId,
				content,
				contentFormat: responseContent.format,
				requestedUrl: fetched.url,
				finalUrl: fetched.final_url,
				canonicalUrl: fetched.canonical_url,
				statusCode: fetched.status_code,
				contentType: fetched.content_type ?? undefined,
				title: fetched.title,
				meta: fetched.meta,
				structuredData: fetched.structured_data,
				excerpt: buildExcerpt(content),
				bytes: fetched.info.bytes,
				fetchedAt: fetched.info.fetched_at,
				etag: fetched.info.etag,
				lastModified: fetched.info.last_modified,
				extractionMethod: fetched.content_type?.includes('pdf') ? 'pdf' : 'static',
				extractionVersion:
					responseContent.conversion === 'llm' ? 'web-visit-llm-v1' : 'web-visit-v1',
				parser: fetched.info.parser,
				extractionStrategy: fetched.info.extraction_strategy
			});
		} catch (error) {
			// The mutable cache write already succeeded. Evidence persistence is
			// additive and must not turn a successful user-facing visit into a
			// failed tool call during rollout.
			logger.warn('Failed to persist immutable web-page evidence', {
				pageVisitId,
				error: error instanceof Error ? error.message : String(error)
			});
			return undefined;
		}
	}

	private evidenceReferencesForContent(
		chunks: NativeSearchEvidenceChunkReference[] | undefined,
		content: string
	): NativeSearchEvidenceChunkReference[] | undefined {
		if (!chunks?.length || !content) return undefined;
		const visibleEndOffset = Array.from(content).length;
		const visible = chunks.filter((chunk) => chunk.start_offset < visibleEndOffset);
		return visible.length > 0 ? visible : undefined;
	}
}
