// apps/worker/src/workers/knowledge/knowledgeEnrichWorker.ts
//
// knowledge_enrich: "find more about these entries" (tasker 160). For each target, two at a
// time: web search (paid, Tavily) → read up to three pages → one cheap model call that cites
// an exact quote per fact → keep only facts whose quote is on the page → save them privately
// through KnowledgeStore with the page as the source. YouTube videos and channels also get
// YouTube's free oEmbed metadata. The run's budget covers search and model spend together;
// once it is used up the remaining targets are skipped, never overspent.

import {
	KNOWLEDGE_UUID_PATTERN,
	KnowledgeStore,
	fetchYouTubeOEmbed,
	oembedBatch,
	youtubeVideoId,
	type KnowledgeDataClient,
	type KnowledgeWriteBatch
} from '@buildos/shared-agent-ops/knowledge';
import type { JSONRequestOptions } from '@buildos/smart-llm';
import type { ProcessingJob } from '../../lib/supabaseQueue';
import { SmartLLMService } from '../../lib/services/smart-llm-service';
import { supabase as defaultSupabase } from '../../lib/supabase';
import { createAgentRunWebResearchPort, type PaidToolCharge } from '../agent-run/webResearchPort';
import {
	choosePages,
	enrichContextFrom,
	enrichQueries,
	enrichUserPrompt,
	KNOWLEDGE_ENRICH_OPERATION,
	KNOWLEDGE_ENRICH_SYSTEM_PROMPT,
	PAGE_CHARS,
	validateEnrichment,
	type EnrichPage
} from './knowledgeEnrichPlan';

export const KNOWLEDGE_ENRICH_JOB_TYPE = 'knowledge_enrich';
const CONCURRENCY = 2;
const MAX_LLM_COST_PER_TARGET_USD = 0.01;

type JsonCaller = { getJSONResponse<T>(options: JSONRequestOptions): Promise<T> };
type SearchPort = {
	search?: (args: Record<string, unknown>, signal?: AbortSignal) => Promise<unknown>;
	visit?: (args: Record<string, unknown>, signal?: AbortSignal) => Promise<unknown>;
};

export interface KnowledgeEnrichDeps {
	db: KnowledgeDataClient;
	llm: JsonCaller;
	makePort: (onCharge: (charge: PaidToolCharge) => void) => SearchPort;
	fetchFn: typeof fetch;
	now: () => Date;
}

export interface KnowledgeEnrichResult {
	runId: string;
	status: 'completed' | 'partial' | 'failed' | 'cancelled' | 'skipped';
	done: number;
	failed: number;
	skipped: number;
	facts: number;
	costUsd: number;
}

const UUID = KNOWLEDGE_UUID_PATTERN;
let sharedLlm: SmartLLMService | null = null;

function readJob(data: unknown): { runId: string; userId: string } {
	const meta = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>;
	const runId = typeof meta.runId === 'string' ? meta.runId : '';
	const userId = typeof meta.userId === 'string' ? meta.userId : '';
	if (!UUID.test(runId) || !UUID.test(userId))
		throw new Error('knowledge_enrich needs runId and userId');
	return { runId, userId };
}

interface TargetRow {
	id: string;
	entity_id: string;
	fields: string[];
	status: string;
}

export async function processKnowledgeEnrichJob(
	job: ProcessingJob,
	deps: Partial<KnowledgeEnrichDeps> = {}
): Promise<KnowledgeEnrichResult> {
	const { runId, userId } = readJob(job.data);
	const db = deps.db ?? (defaultSupabase as unknown as KnowledgeDataClient);
	const llm = deps.llm ?? (sharedLlm ??= new SmartLLMService());
	const fetchFn = deps.fetchFn ?? fetch;
	const now = deps.now ?? (() => new Date());
	const iso = () => now().toISOString();

	const { data: run, error: runError } = await db
		.from('knowledge_runs')
		.select('id, owner_user_id, status, budget_usd, cost_usd, input')
		.eq('id', runId)
		.eq('owner_user_id', userId)
		.maybeSingle();
	if (runError) throw new Error(`Load run: ${runError.message}`);
	const empty = { runId, done: 0, failed: 0, skipped: 0, facts: 0, costUsd: 0 };
	if (!run) return { ...empty, status: 'skipped' };
	if (run.status !== 'queued' && run.status !== 'running') {
		return { ...empty, status: run.status === 'cancelled' ? 'cancelled' : 'skipped' };
	}

	const budget = Math.max(Number(run.budget_usd ?? 0), 0);
	let spent = Number(run.cost_usd ?? 0);
	const instructions =
		run.input &&
		typeof run.input === 'object' &&
		typeof (run.input as Record<string, unknown>).instructions === 'string'
			? ((run.input as Record<string, unknown>).instructions as string)
			: null;

	await db
		.from('knowledge_runs')
		.update({ status: 'running', started_at: iso(), updated_at: iso() })
		.eq('id', runId);

	const { data: targetData, error: targetError } = await db
		.from('knowledge_run_targets')
		.select('id, entity_id, fields, status')
		.eq('run_id', runId)
		.in('status', ['queued', 'running'])
		.order('created_at');
	if (targetError) throw new Error(`Load targets: ${targetError.message}`);
	const targets = (targetData ?? []) as TargetRow[];

	const store = new KnowledgeStore(db, userId);
	const counts = { done: 0, failed: 0, skipped: 0, facts: 0 };
	const makePort =
		deps.makePort ??
		((onCharge) =>
			createAgentRunWebResearchPort({ onSearchDispatched: onCharge }) as SearchPort);

	async function isCancelled(): Promise<boolean> {
		const { data } = await db
			.from('knowledge_runs')
			.select('status')
			.eq('id', runId)
			.maybeSingle();
		return data?.status === 'cancelled';
	}

	async function research(target: TargetRow): Promise<void> {
		if (spent >= budget - 0.002) {
			counts.skipped++;
			await db
				.from('knowledge_run_targets')
				.update({ status: 'skipped', error: 'Research budget used up', finished_at: iso() })
				.eq('id', target.id);
			return;
		}
		let targetCost = 0;
		const charge = (usd: number) => {
			targetCost += usd;
			spent += usd;
		};
		await db
			.from('knowledge_run_targets')
			.update({ status: 'running', started_at: iso() })
			.eq('id', target.id);
		try {
			const detail = await store.getEntity(target.entity_id);
			if (!detail) throw new Error('Entry not found');
			const context = enrichContextFrom(detail);
			const pages: EnrichPage[] = [];
			const free: KnowledgeWriteBatch = { entities: [], facts: [], sources: [] };

			// YouTube: free metadata first.
			if (context.youtubeUrl) {
				const oembed = await fetchYouTubeOEmbed(context.youtubeUrl, fetchFn, job.signal);
				if (oembed) {
					mergeBatch(
						free,
						oembedBatch(
							target.entity_id,
							detail.entity.kind,
							context.youtubeUrl,
							oembed
						)
					);
					// An entry added as a bare link takes the video's real title.
					const named = detail.entity.name;
					const isBareLink = Boolean(youtubeVideoId(named)) || named.includes('youtu');
					if (oembed.title && detail.entity.scope === 'private' && isBareLink) {
						await store.updateEntity(target.entity_id, {
							name: oembed.title.slice(0, 300)
						});
						context.name = oembed.title;
					}
				}
			}

			// Web search (paid) unless the budget is too thin for it.
			const port = makePort((c) => charge(c.cost_usd));
			const queries = enrichQueries(context, instructions);
			const results: Array<{ url: string; title: string; content: string | null }> = [];
			for (const query of queries) {
				if (!port.search || spent >= budget - 0.01) break;
				const response = (await port.search(
					{ query, max_results: 5, search_depth: 'basic' },
					job.signal
				)) as {
					results?: Array<{
						url: string;
						title: string;
						snippet?: string;
						page_content?: string;
					}>;
				};
				for (const r of response.results ?? []) {
					results.push({ url: r.url, title: r.title, content: r.page_content ?? null });
				}
			}
			for (const result of choosePages(results, context.homepage)) {
				let content = result.content;
				let title: string | null = result.title || null;
				if (!content && port.visit) {
					try {
						const page = (await port.visit(
							{ url: result.url, max_chars: PAGE_CHARS },
							job.signal
						)) as {
							content?: string;
							title?: string;
							final_url?: string;
						};
						content = page.content ?? null;
						title = page.title ?? title;
					} catch {
						continue; // unreadable page: skip it
					}
				}
				if (content?.trim())
					pages.push({ url: result.url, title, content: content.slice(0, PAGE_CHARS) });
			}

			let batch: KnowledgeWriteBatch = free;
			let dropped = 0;
			if (pages.length && spent < budget - 0.001) {
				const raw = await llm.getJSONResponse<unknown>({
					systemPrompt: KNOWLEDGE_ENRICH_SYSTEM_PROMPT,
					userPrompt: enrichUserPrompt(context, target.fields, pages, instructions),
					userId,
					profile: 'fast',
					temperature: 0.1,
					reasoning: { enabled: false },
					maxTokens: 1_800,
					timeoutMs: 45_000,
					operationType: KNOWLEDGE_ENRICH_OPERATION,
					signal: job.signal,
					spendLimit: {
						maxCostUsd: Math.min(
							MAX_LLM_COST_PER_TARGET_USD,
							Math.max(budget - spent, 0.001)
						)
					},
					onUsage: (usage) => charge(usage.totalCost ?? 0)
				});
				const validated = validateEnrichment(raw, {
					entityId: target.entity_id,
					kind: detail.entity.kind,
					fields: target.fields,
					pages,
					existing: context.existing
				});
				dropped = validated.dropped.length;
				batch = mergeBatch(free, validated.batch);
			}

			const receipt = batch.facts.length
				? await store.record(batch, { via: 'enrichment', runId })
				: { facts: { added: 0, suggested: 0 } };
			const added = receipt.facts.added;
			counts.done++;
			counts.facts += added;
			await db
				.from('knowledge_run_targets')
				.update({
					status: 'done',
					facts_added: added,
					cost_usd: Number(targetCost.toFixed(6)),
					summary:
						`${pages.length} page${pages.length === 1 ? '' : 's'} read, ${added} new detail${added === 1 ? '' : 's'}` +
						(receipt.facts.suggested ? `, ${receipt.facts.suggested} to check` : '') +
						(dropped ? `, ${dropped} unsupported dropped` : ''),
					finished_at: iso()
				})
				.eq('id', target.id);
			await db
				.from('knowledge_entities')
				.update({ enriched_at: iso() })
				.eq('id', target.entity_id)
				.eq('owner_user_id', userId);
		} catch (error) {
			counts.failed++;
			await db
				.from('knowledge_run_targets')
				.update({
					status: 'failed',
					error: (error instanceof Error ? error.message : String(error)).slice(0, 500),
					cost_usd: Number(targetCost.toFixed(6)),
					finished_at: iso()
				})
				.eq('id', target.id);
		} finally {
			await db
				.from('knowledge_runs')
				.update({
					cost_usd: Number(spent.toFixed(6)),
					stats: { targets: targets.length, ...counts },
					updated_at: iso()
				})
				.eq('id', runId);
		}
	}

	// Two at a time; check for cancellation between targets.
	let cancelled = false;
	const queue = [...targets];
	await Promise.all(
		Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
			while (queue.length) {
				if (cancelled || (await isCancelled())) {
					cancelled = true;
					return;
				}
				const next = queue.shift()!;
				await research(next);
			}
		})
	);
	if (cancelled) {
		await db
			.from('knowledge_run_targets')
			.update({ status: 'cancelled', finished_at: iso() })
			.eq('run_id', runId)
			.in('status', ['queued']);
	}

	const status: KnowledgeEnrichResult['status'] = cancelled
		? 'cancelled'
		: counts.failed === targets.length && targets.length > 0
			? 'failed'
			: counts.failed || counts.skipped
				? 'partial'
				: 'completed';
	await db
		.from('knowledge_runs')
		.update({
			status,
			cost_usd: Number(spent.toFixed(6)),
			stats: { targets: targets.length, ...counts },
			finished_at: iso(),
			updated_at: iso(),
			...(status === 'failed' ? { error: 'No entry could be researched.' } : {})
		})
		.eq('id', runId);

	return { runId, status, ...counts, costUsd: Number(spent.toFixed(6)) };
}

function mergeBatch(into: KnowledgeWriteBatch, from: KnowledgeWriteBatch): KnowledgeWriteBatch {
	into.entities.push(...from.entities);
	into.facts.push(...from.facts);
	into.sources = [...(into.sources ?? []), ...(from.sources ?? [])];
	return into;
}
