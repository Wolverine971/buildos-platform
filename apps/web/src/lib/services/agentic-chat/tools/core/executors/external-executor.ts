// apps/web/src/lib/services/agentic-chat/tools/core/executors/external-executor.ts
/**
 * External Executor
 *
 * Handles external service tool operations:
 * - web_search: Web search via Tavily API
 * - web_visit: Fetch and summarize a specific URL
 * - get_buildos_overview: BuildOS documentation overview
 * - get_buildos_usage_guide: BuildOS usage guide
 */

import { createHash } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { BaseExecutor } from './base-executor';
import {
	getBuildosOverviewDocument,
	getBuildosUsageGuide
} from '$lib/services/agentic-chat/tools/buildos';
import { performWebSearch, type WebSearchArgs } from '$lib/services/agentic-chat/tools/websearch';
import {
	buildExcerpt,
	clampMaxChars,
	performWebVisit,
	type WebVisitArgs,
	type WebVisitContentFormat,
	type WebVisitFetchPayload,
	type WebVisitMode,
	type WebVisitResultPayload
} from '$lib/services/agentic-chat/tools/webvisit';
import type { ExecutorContext } from './types';

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

	/**
	 * Fetch and summarize a specific URL.
	 */
	async webVisit(args: WebVisitArgs): Promise<WebVisitResultPayload> {
		const outputFormat = this.normalizeOutputFormat(args.output_format);
		const persist = args.persist ?? true;
		const maxChars = clampMaxChars(args.max_chars);
		const forceRefresh = args.force_refresh ?? false;

		if (persist && !forceRefresh && outputFormat === 'markdown') {
			const cached = await this.loadCachedVisit(args.url, maxChars, args.mode);
			if (cached) {
				return cached;
			}
		}

		const fetched = await performWebVisit(args, this.fetchFn);
		const responseContent = await this.convertToMarkdownIfNeeded(
			fetched,
			outputFormat,
			persist
		);

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
			visit_id: stored?.id,
			stored: stored?.stored ?? false,
			message: fetched.message,
			info: {
				...fetched.info,
				html_chars: fetched.info.html_chars,
				markdown_chars: responseContent.markdownChars,
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

	private normalizeOutputFormat(format?: WebVisitContentFormat): WebVisitContentFormat {
		if (format === 'text' || format === 'markdown') return format;
		return 'markdown';
	}

	private normalizeMode(mode?: WebVisitMode): WebVisitMode {
		if (mode === 'reader' || mode === 'raw' || mode === 'auto') return mode;
		return 'auto';
	}

	private async convertToMarkdownIfNeeded(
		fetched: WebVisitFetchPayload,
		outputFormat: WebVisitContentFormat,
		shouldPersist: boolean
	): Promise<{
		content: string;
		format: WebVisitContentFormat;
		markdown?: string;
		markdownChars?: number;
		llmModel?: string;
		llmMs?: number;
		llmPromptTokens?: number;
		llmCompletionTokens?: number;
		llmTotalTokens?: number;
		errorMessage?: string;
	}> {
		const shouldConvert =
			Boolean(fetched.trimmed_html) && (outputFormat === 'markdown' || shouldPersist);
		if (!shouldConvert || !this.llmService) {
			return {
				content: fetched.text,
				format: 'text'
			};
		}

		const systemPrompt =
			'You convert HTML into clean Markdown for reading. Preserve headings, lists, tables, code blocks, and meaningful links. Remove navigation, footers, ads, and UI chrome. Return Markdown only.';
		const userPrompt = `Convert the following HTML into Markdown. Return Markdown only.\n\nHTML:\n\`\`\`html\n${fetched.trimmed_html}\n\`\`\``;

		try {
			const start = Date.now();
			const result = await this.llmService.generateTextDetailed({
				prompt: userPrompt,
				systemPrompt,
				profile: 'balanced',
				temperature: 0.2,
				operationType: 'web_visit_markdown',
				chatSessionId: this.sessionId
			});
			const markdown = result.text.trim();
			const llmMs = Date.now() - start;

			return {
				content: outputFormat === 'markdown' ? markdown : fetched.text,
				format: outputFormat === 'markdown' ? 'markdown' : 'text',
				markdown,
				markdownChars: markdown.length,
				llmModel: result.model,
				llmMs,
				llmPromptTokens: result.usage?.promptTokens,
				llmCompletionTokens: result.usage?.completionTokens,
				llmTotalTokens: result.usage?.totalTokens
			};
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			return {
				content: fetched.text,
				format: 'text',
				errorMessage
			};
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
		const admin = this.getAdminSupabase() as unknown as SupabaseClient;
		const normalizedUrl = this.normalizeUrlForStorage(url);

		const { data, error } = await admin
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
			.maybeSingle();

		if (error) {
			console.warn('[ExternalExecutor] Failed to load cached visit:', {
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
		const admin = this.getAdminSupabase() as unknown as SupabaseClient;
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
			console.error('[ExternalExecutor] Failed to persist web visit:', {
				url: fetched.url,
				error: error instanceof Error ? error.message : String(error)
			});
			return { stored: false };
		}
	}
}
