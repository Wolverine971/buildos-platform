// apps/worker/src/workers/agent-run/agentRunPageEvidence.ts
import type { Database } from '@buildos/shared-types';
import {
	NATIVE_SEARCH_EVIDENCE_MAX_CONTENT_CHARS,
	type NativeSearchEvidenceRpcClient,
	hashNativeSearchPageContent,
	isGlobalWebPageCacheEligible,
	normalizeWebPageCacheUrl,
	persistNativeSearchPageEvidence
} from '@buildos/shared-agent-ops/web/native-search';
import type { AgentRunFetchedPageEvidence } from './webResearchPort';
import { supabase } from '../../lib/supabase';

function isMissingScopedWebCacheColumn(error: unknown): boolean {
	if (!error || typeof error !== 'object' || Array.isArray(error)) return false;
	const record = error as { code?: unknown; message?: unknown };
	return (
		record.code === '42703' ||
		record.code === 'PGRST204' ||
		(typeof record.message === 'string' && record.message.includes('web_page_visits.user_id'))
	);
}

export async function persistAgentRunPageEvidence(
	page: AgentRunFetchedPageEvidence,
	userId: string,
	signal?: AbortSignal
) {
	if (signal?.aborted) throw signal.reason ?? new Error('Page evidence persistence aborted');
	if (![page.requestedUrl, page.finalUrl].every((url) => isGlobalWebPageCacheEligible(url))) {
		return undefined;
	}

	const content = Array.from(page.content)
		.slice(0, NATIVE_SEARCH_EVIDENCE_MAX_CONTENT_CHARS)
		.join('')
		.trim();
	if (!content) return undefined;
	const normalizedUrl = normalizeWebPageCacheUrl(page.finalUrl);
	const contentHash = hashNativeSearchPageContent(content);
	const excerpt = content.length > 280 ? `${content.slice(0, 280)}...` : content;
	const { data: existing, error: selectError } = await supabase
		.from('web_page_visits')
		.select('id, visit_count')
		.eq('user_id', userId)
		.eq('normalized_url', normalizedUrl)
		.abortSignal(signal ?? new AbortController().signal)
		.maybeSingle();
	// Rolling-deploy safety: research still returns live evidence if the worker
	// reaches production before the account-scope migration.
	if (selectError && isMissingScopedWebCacheColumn(selectError)) return undefined;
	if (selectError) throw selectError;

	const mutableSnapshot: Database['public']['Tables']['web_page_visits']['Insert'] & {
		user_id: string;
	} = {
		user_id: userId,
		url: page.requestedUrl,
		final_url: page.finalUrl,
		canonical_url: null,
		normalized_url: normalizedUrl,
		status_code: page.statusCode,
		content_type: page.contentType ?? null,
		title: page.title ?? null,
		meta: null,
		structured_data: null,
		markdown: content,
		excerpt,
		content_hash: contentHash,
		last_visited_at: page.fetchedAt,
		last_fetched_at: page.fetchedAt,
		etag: page.etag ?? null,
		last_modified: page.lastModified ?? null,
		last_fetch_ms: page.fetchMs,
		bytes: page.bytes,
		error_message: null
	};

	const updateExisting = async (id: string, visitCount: number) => {
		const { data, error } = await supabase
			.from('web_page_visits')
			.update({
				...mutableSnapshot,
				visit_count: visitCount + 1
			})
			.eq('id', id)
			.eq('user_id', userId)
			.select('id')
			.abortSignal(signal ?? new AbortController().signal)
			.maybeSingle();
		if (error) throw error;
		return data?.id;
	};

	let pageVisitId: string | undefined;
	if (existing?.id) {
		pageVisitId = await updateExisting(existing.id, existing.visit_count ?? 0);
	} else {
		const { data, error } = await supabase
			.from('web_page_visits')
			.insert({
				...mutableSnapshot,
				visit_count: 1,
				first_visited_at: page.fetchedAt
			})
			.select('id')
			.abortSignal(signal ?? new AbortController().signal)
			.maybeSingle();
		if (error?.code === '23505') {
			const { data: raced, error: raceError } = await supabase
				.from('web_page_visits')
				.select('id, visit_count')
				.eq('user_id', userId)
				.eq('normalized_url', normalizedUrl)
				.abortSignal(signal ?? new AbortController().signal)
				.maybeSingle();
			if (raceError || !raced?.id) throw raceError ?? error;
			pageVisitId = await updateExisting(raced.id, raced.visit_count ?? 0);
		} else {
			if (error) throw error;
			pageVisitId = data?.id;
		}
	}
	if (!pageVisitId) throw new Error('Web page cache did not return a visit identity');
	if (signal?.aborted) throw signal.reason ?? new Error('Page evidence persistence aborted');

	return persistNativeSearchPageEvidence(supabase as unknown as NativeSearchEvidenceRpcClient, {
		pageVisitId,
		content,
		contentFormat: 'text',
		requestedUrl: page.requestedUrl,
		finalUrl: page.finalUrl,
		statusCode: page.statusCode,
		contentType: page.contentType,
		title: page.title,
		excerpt,
		bytes: page.bytes,
		fetchedAt: page.fetchedAt,
		etag: page.etag,
		lastModified: page.lastModified,
		extractionMethod: 'text',
		extractionVersion: 'agent-run-web-visit-v1',
		parser: page.parser,
		extractionStrategy: page.parser
	});
}
