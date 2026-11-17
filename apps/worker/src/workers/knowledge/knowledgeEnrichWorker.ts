// apps/worker/src/workers/knowledge/knowledgeEnrichWorker.ts
//
// knowledge_enrich: "find more about these entries" (tasker 160). For each target, two at a
// time: web search (paid; Serper first, Tavily if Serper fails or has no key; see
// WEB_SEARCH_PROVIDER_ORDER) → read up to three pages with our own fetcher, the knowledge
// panel's website first → one cheap model call that cites
// an exact quote per fact → keep only facts whose quote is on the page → save them privately
// through KnowledgeStore with the page as the source. YouTube videos and channels also get
// YouTube's free oEmbed metadata. The run's budget covers search and model spend together;
// once it is used up the remaining targets are skipped, never overspent.
//
// Tasker 164: each target carries its own instructions (falling back to the run's), reports its
// phase (searching → reading → extracting → saving) for the research tray, and can be cancelled
// on its own: the worker claims a target only while it is still queued and checks it is still
// running at every phase change, so a cancelled target stops before the next paid step.

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
import {
	createAgentRunWebResearchPort,
	readPaidToolCharge,
	type PaidToolCharge
} from '../agent-run/webResearchPort';
import {
	choosePages,
	enrichContextFrom,
	knowledgePanelPage,
	enrichQueries,
	enrichUserPrompt,
	KNOWLEDGE_ENRICH_OPERATION,
	KNOWLEDGE_ENRICH_SYSTEM_PROMPT,
	PAGE_CHARS,
	validateEnrichment,
	type EnrichKnowledgePanel,
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
	cancelled: number;
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
	instructions?: string | null;
}

type ResearchPhase = 'searching' | 'reading' | 'extracting' | 'saving';

/** The user cancelled this target while it was being researched. */
class ResearchCancelled extends Error {}

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
	const empty = { runId, done: 0, failed: 0, skipped: 0, cancelled: 0, facts: 0, costUsd: 0 };
	if (!run) return { ...empty, status: 'skipped' };
	if (run.status !== 'queued' && run.status !== 'running') {
		return { ...empty, status: run.status === 'cancelled' ? 'cancelled' : 'skipped' };
	}

	const budget = Math.max(Number(run.budget_usd ?? 0), 0);
	let spent = Number(run.cost_usd ?? 0);
	const runInstructions =
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
		.select('id, entity_id, fields, status, instructions')
		.eq('run_id', runId)
		.in('status', ['queued', 'running'])
		.order('created_at');
	if (targetError) throw new Error(`Load targets: ${targetError.message}`);
	const targets = (targetData ?? []) as TargetRow[];

	const store = new KnowledgeStore(db, userId);
	const counts = { done: 0, failed: 0, skipped: 0, cancelled: 0, facts: 0 };
	const makePort =
		deps.makePort ??
		((onCharge) =>
			createAgentRunWebResearchPort({
				purpose: 'knowledge_research',
				onSearchDispatched: onCharge
			}) as SearchPort);

	async function isCancelled(): Promise<boolean> {
		const { data } = await db
			.from('knowledge_runs')
			.select('status')
			.eq('id', runId)
			.maybeSingle();
		return data?.status === 'cancelled';
	}

	/** Record the target's phase; throws ResearchCancelled when it is no longer running. */
	async function advance(target: TargetRow, phase: ResearchPhase): Promise<void> {
		const { data, error } = await db
			.from('knowledge_run_targets')
			.update({ phase, updated_at: iso() })
			.eq('id', target.id)
			.eq('status', 'running')
			.select('id');
		if (error) return; // progress is cosmetic; a blip must not fail the research
		if (!((data ?? []) as unknown[]).length) throw new ResearchCancelled();
	}

	async function research(target: TargetRow): Promise<void> {
		if (spent >= budget - 0.002) {
			counts.skipped++;
			await db
				.from('knowledge_run_targets')
				.update({
					status: 'skipped',
					phase: null,
					error: 'Research budget used up',
					finished_at: iso(),
					updated_at: iso()
				})
				.eq('id', target.id)
				.in('status', ['queued', 'running']);
			return;
		}
		let targetCost = 0;
		const charge = (usd: number) => {
			targetCost += usd;
			spent += usd;
		};
		// Claim it only if it is still waiting: a target cancelled from the tray stays cancelled.
		const { data: claimed, error: claimError } = await db
			.from('knowledge_run_targets')
			.update({ status: 'running', phase: 'searching', started_at: iso(), updated_at: iso() })
			.eq('id', target.id)
			.in('status', ['queued', 'running'])
			.select('id');
		if (claimError) throw new Error(`Claim target: ${claimError.message}`);
		if (!((claimed ?? []) as unknown[]).length) {
			counts.cancelled++;
			return;
		}
		const instructions = target.instructions?.trim() || runInstructions;
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

			// Web search (paid) unless the budget is too thin for it. The port reserves the most a
			// search can cost (Tavily, if Serper fails over) before dispatch; settle to what the
			// provider that answered actually billed.
			let reservedUsd = 0;
			const port = makePort((c) => {
				reservedUsd += c.cost_usd;
				charge(c.cost_usd);
			});
			const queries = enrichQueries(context, instructions, target.fields);
			const results: Array<{ url: string; title: string; content: string | null }> = [];
			let panel: EnrichKnowledgePanel | null = null;
			for (const query of queries) {
				if (!port.search || spent >= budget - 0.01) break;
				reservedUsd = 0;
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
					knowledge_panel?: EnrichKnowledgePanel;
				};
				const billed = readPaidToolCharge(response);
				if (billed && reservedUsd > 0) charge(billed.cost_usd - reservedUsd);
				panel ??= response.knowledge_panel ?? null;
				for (const r of response.results ?? []) {
					results.push({ url: r.url, title: r.title, content: r.page_content ?? null });
				}
			}
			// Serper's knowledge panel names the entity's website: read it first. Whether the
			// panel is about this entity at all is the model's per-page call, as for any page.
			const panelSite = panel?.website ?? null;
			if (panelSite) results.unshift({ url: panelSite, title: panel!.title, content: null });
			const chosen = choosePages(results, context.homepage ?? panelSite);
			if (chosen.length) await advance(target, 'reading');
			for (const result of chosen) {
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
			const pagesRead = pages.length;
			// The panel itself is evidence only through a verbatim quote, like any page.
			const panelPage = knowledgePanelPage(panel, detail.entity.kind);
			if (panelPage) pages.push(panelPage);

			let batch: KnowledgeWriteBatch = free;
			let dropped = 0;
			if (pages.length && spent < budget - 0.001) {
				await advance(target, 'extracting');
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

			if (batch.facts.length) await advance(target, 'saving');
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
					phase: null,
					updated_at: iso(),
					facts_added: added,
					cost_usd: Number(targetCost.toFixed(6)),
					summary:
						`${pagesRead} page${pagesRead === 1 ? '' : 's'} read, ${added} new detail${added === 1 ? '' : 's'}` +
						(receipt.facts.suggested ? `, ${receipt.facts.suggested} to check` : '') +
						(dropped ? `, ${dropped} unsupported dropped` : ''),
					finished_at: iso()
				})
				.eq('id', target.id)
				.eq('status', 'running');
			await db
				.from('knowledge_entities')
				.update({ enriched_at: iso() })
				.eq('id', target.entity_id)
				.eq('owner_user_id', userId);
		} catch (error) {
			if (error instanceof ResearchCancelled) {
				// Already marked cancelled by the user; just record what it cost so far.
				counts.cancelled++;
				await db
					.from('knowledge_run_targets')
					.update({ cost_usd: Number(targetCost.toFixed(6)) })
					.eq('id', target.id);
				return;
			}
			counts.failed++;
			await db
				.from('knowledge_run_targets')
				.update({
					status: 'failed',
					phase: null,
					error: (error instanceof Error ? error.message : String(error)).slice(0, 500),
					cost_usd: Number(targetCost.toFixed(6)),
					finished_at: iso(),
					updated_at: iso()
				})
				.eq('id', target.id)
				.eq('status', 'running');
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
			// Take the next target before awaiting anything: two lanes waiting on the cancel
			// check could otherwise both pass `queue.length` and one would get undefined.
			for (let next = queue.shift(); next; next = queue.shift()) {
				if (cancelled || (await isCancelled())) {
					cancelled = true; // `next` is still queued; the sweep below cancels it
					return;
				}
				await research(next);
			}
		})
	);
	if (cancelled) {
		await db
			.from('knowledge_run_targets')
			.update({ status: 'cancelled', phase: null, finished_at: iso(), updated_at: iso() })
			.eq('run_id', runId)
			.in('status', ['queued']);
	}
	// The whole run may have been cancelled while its last target was being researched.
	if (!cancelled) cancelled = await isCancelled();

	const status: KnowledgeEnrichResult['status'] = cancelled
		? 'cancelled'
		: counts.failed === targets.length && targets.length > 0
			? 'failed'
			: counts.cancelled === targets.length && targets.length > 0
				? 'cancelled'
				: counts.failed || counts.skipped || counts.cancelled
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
