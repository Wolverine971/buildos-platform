// apps/web/src/lib/services/agentic-chat/tools/core/executors/external-executor.ts
/**
 * External Executor
 *
 * Handles external service tool operations:
 * - web_search: Web search via Tavily API
 * - web_visit: Fetch and summarize a specific URL
 * - list/call Corsair MCP tools
 * - get_buildos_overview: BuildOS documentation overview
 * - get_buildos_usage_guide: BuildOS usage guide
 */

import { createHash } from 'node:crypto';
import type { Json } from '@buildos/shared-types';
import { env } from '$env/dynamic/private';
import { BaseExecutor } from './base-executor';
import {
	getBuildosOverviewDocument,
	getBuildosUsageGuide
} from '$lib/services/agentic-chat/tools/buildos';
import { performWebSearch, type WebSearchArgs } from '$lib/services/agentic-chat/tools/websearch';
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
import type { ExecutorContext } from './types';
import { createLogger } from '$lib/utils/logger';

const logger = createLogger('ExternalExecutor');
const DEFAULT_WEB_VISIT_LLM_TIMEOUT_MS = 25000;

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
	 * Perform a web search using Tavily API.
	 */
	async webSearch(args: WebSearchArgs): Promise<any> {
		return performWebSearch(args, this.fetchFn);
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

		// Only the default 'markdown' format serves from cache. 'llm_markdown'
		// is the escape hatch for pages where the cached deterministic markdown
		// rendered poorly — serving that same cached markdown back would make
		// the escape hatch a no-op.
		if (persist && !forceRefresh && outputFormat === 'markdown') {
			const cached = await this.loadCachedVisit(args.url, maxChars, args.mode);
			if (cached) {
				return cached;
			}
		}

		const fetched = await performWebVisit(args, this.fetchFn);
		const responseContent = await this.convertToMarkdownIfNeeded(fetched, outputFormat);

		const trimmedOutput = responseContent.content.trim();
		const truncated = trimmedOutput.length > maxChars;
		const finalContent = truncated ? trimmedOutput.slice(0, maxChars) : trimmedOutput;

		const stored = persist ? await this.persistWebVisit(fetched, responseContent) : undefined;

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
		const parsed = new URL(url);
		parsed.hash = '';
		parsed.hostname = parsed.hostname.toLowerCase();
		parsed.protocol = parsed.protocol.toLowerCase();

		if (
			(parsed.protocol === 'http:' && parsed.port === '80') ||
			(parsed.protocol === 'https:' && parsed.port === '443')
		) {
			parsed.port = '';
		}

		const params = new URLSearchParams(parsed.search);
		const sorted = [...params.entries()].sort((a, b) => {
			const keyCompare = a[0].localeCompare(b[0]);
			if (keyCompare !== 0) return keyCompare;
			return a[1].localeCompare(b[1]);
		});
		const nextParams = new URLSearchParams();
		for (const [key, value] of sorted) {
			nextParams.append(key, value);
		}
		const query = nextParams.toString();
		parsed.search = query ? `?${query}` : '';

		return parsed.toString();
	}

	private async loadCachedVisit(
		url: string,
		maxChars: number,
		mode?: WebVisitMode
	): Promise<WebVisitResultPayload | null> {
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
					'bytes',
					'last_llm_model',
					'last_llm_ms',
					'llm_prompt_tokens',
					'llm_completion_tokens',
					'llm_total_tokens',
					'visit_count'
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

		const trimmedOutput = data.markdown.trim();
		const truncated = trimmedOutput.length > maxChars;
		const finalContent = truncated ? trimmedOutput.slice(0, maxChars) : trimmedOutput;
		const now = new Date().toISOString();

		await admin
			.from('web_page_visits')
			.update({
				visit_count: (data.visit_count ?? 0) + 1,
				last_visited_at: now
			})
			.eq('id', data.id);

		return {
			url: data.url ?? url,
			final_url: data.final_url ?? data.url ?? url,
			status_code: data.status_code ?? 200,
			content_type: data.content_type ?? null,
			title: data.title ?? undefined,
			canonical_url: data.canonical_url ?? undefined,
			content_format: 'markdown',
			content: finalContent,
			excerpt: buildExcerpt(finalContent),
			truncated,
			links: undefined,
			meta: (data.meta as Record<string, string>) ?? undefined,
			structured_data: Array.isArray(data.structured_data)
				? (data.structured_data as WebVisitResultPayload['structured_data'])
				: undefined,
			visit_id: data.id,
			stored: true,
			message: `Web visit content loaded from cache for "${data.final_url ?? data.url ?? url}".`,
			info: {
				fetched_at: now,
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
				cache_hit: true
			}
		};
	}

	private async persistWebVisit(
		fetched: WebVisitFetchPayload,
		responseContent: {
			markdown?: string;
			llmModel?: string;
			llmMs?: number;
			llmPromptTokens?: number;
			llmCompletionTokens?: number;
			llmTotalTokens?: number;
			errorMessage?: string;
		}
	): Promise<{ id?: string; stored: boolean } | undefined> {
		const admin = this.getAdminSupabase();
		const canonicalUrl = fetched.canonical_url ?? fetched.final_url;
		const normalizedUrl = this.normalizeUrlForStorage(canonicalUrl);
		const markdown = responseContent.markdown ?? fetched.text;
		const excerpt = buildExcerpt(markdown ?? '');
		const contentHash = markdown
			? createHash('sha256').update(markdown).digest('hex')
			: undefined;
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
						last_fetch_ms: fetched.info.fetch_ms,
						last_llm_ms: responseContent.llmMs ?? null,
						last_llm_model: responseContent.llmModel ?? null,
						llm_prompt_tokens: responseContent.llmPromptTokens ?? null,
						llm_completion_tokens: responseContent.llmCompletionTokens ?? null,
						llm_total_tokens: responseContent.llmTotalTokens ?? null,
						bytes: fetched.info.bytes,
						error_message: responseContent.errorMessage ?? null
					})
					.eq('id', existing.id)
					.select('id')
					.maybeSingle();

				if (error) throw error;
				return { id: data?.id, stored: true };
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
					last_fetch_ms: fetched.info.fetch_ms,
					last_llm_ms: responseContent.llmMs ?? null,
					last_llm_model: responseContent.llmModel ?? null,
					llm_prompt_tokens: responseContent.llmPromptTokens ?? null,
					llm_completion_tokens: responseContent.llmCompletionTokens ?? null,
					llm_total_tokens: responseContent.llmTotalTokens ?? null,
					bytes: fetched.info.bytes,
					error_message: responseContent.errorMessage ?? null
				})
				.select('id')
				.maybeSingle();

			if (error) throw error;
			return { id: data?.id, stored: true };
		} catch (error) {
			logger.error('[ExternalExecutor] Failed to persist web visit', {
				url: fetched.url,
				error: error instanceof Error ? error.message : String(error)
			});
			return { stored: false };
		}
	}
}
