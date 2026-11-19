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
	gatherKnowledgeAnchors,
	oembedBatch,
	resolveCircles,
	youtubeVideoId,
	type IdentityDecider,
	type KnowledgeAnchors,
	type KnowledgeCircle,
	type KnowledgeDataClient,
	type KnowledgeWriteBatch
} from '@buildos/shared-agent-ops/knowledge';
import { JevClient, LLMUsageLogger } from '@buildos/smart-llm';
import type { ProcessingJob } from '../../lib/supabaseQueue';
import { SmartLLMService } from '../../lib/services/smart-llm-service';
import { supabase as defaultSupabase } from '../../lib/supabase';
import { createAgentRunWebResearchPort, type PaidToolCharge } from '../agent-run/webResearchPort';
import { enrichContextFrom } from './knowledgeEnrichPlan';
import { promoteOrgFacts, publicOrgFacts } from './publicOrgLayer';
import {
	researchEntity,
	researchSummary,
	type JsonCaller,
	type ResearchPhase,
	type SearchPort
} from './knowledgeResearch';

export const KNOWLEDGE_ENRICH_JOB_TYPE = 'knowledge_enrich';
const CONCURRENCY = 2;
/** A `running` target with no phase change for this long was left by a dead attempt. */
const STALE_TARGET_MS = 10 * 60_000;

export interface KnowledgeEnrichDeps {
	db: KnowledgeDataClient;
	llm: JsonCaller;
	makePort: (onCharge: (charge: PaidToolCharge) => void) => SearchPort;
	fetchFn: typeof fetch;
	now: () => Date;
	/**
	 * The cheap structured decision model for circles and "same one?" checks. Undefined → the
	 * worker's own (needs PRIVATE_OPENROUTER_API_KEY); null → none (pages it can't confirm by
	 * rules keep their findings as suggestions).
	 */
	decider: IdentityDecider | null;
}

let knowledgeJev: JevClient | null | undefined;

/** The decision model for research identity checks, built once; null without an OpenRouter key. */
export function getKnowledgeDecider(): IdentityDecider | null {
	if (knowledgeJev !== undefined) return knowledgeJev as IdentityDecider | null;
	const apiKey = process.env.PRIVATE_OPENROUTER_API_KEY?.trim();
	knowledgeJev = apiKey
		? new JevClient({
				apiKey,
				timeoutMs: 8_000,
				maxRequestBytes: 96_000,
				retryOnce: false,
				// Jev latency is bimodal; one hedge rescues most slow calls.
				hedgeAfterMs: 2_000,
				title: 'BuildOS Knowledge (same one?)',
				usage: new LLMUsageLogger({ supabase: defaultSupabase as never })
			})
		: null;
	return knowledgeJev as IdentityDecider | null;
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
	const decider = deps.decider === undefined ? getKnowledgeDecider() : deps.decider;
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

	// Only a run still waiting or running: a cancel that landed since the load stays cancelled.
	await db
		.from('knowledge_runs')
		.update({ status: 'running', started_at: iso(), updated_at: iso() })
		.eq('id', runId)
		.in('status', ['queued', 'running']);

	// A retry of this job picks up targets an earlier attempt left `running` only once they have
	// gone quiet (every phase change refreshes updated_at). One still moving belongs to a live
	// attempt; claiming it again would pay for the same research twice.
	const { error: requeueError } = await db
		.from('knowledge_run_targets')
		.update({ status: 'queued', phase: null, updated_at: iso() })
		.eq('run_id', runId)
		.eq('status', 'running')
		.lt('updated_at', new Date(now().getTime() - STALE_TARGET_MS).toISOString());
	if (requeueError) throw new Error(`Requeue stalled targets: ${requeueError.message}`);

	const { data: targetData, error: targetError } = await db
		.from('knowledge_run_targets')
		.select('id, entity_id, fields, status, instructions')
		.eq('run_id', runId)
		.eq('status', 'queued')
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

	/** Circle (signals, the decision model only if ambiguous) + anchors. Never throws. */
	async function knowFirst(
		detail: NonNullable<Awaited<ReturnType<KnowledgeStore['getEntity']>>>,
		charge: (usd: number) => void
	): Promise<KnowledgeAnchors | null> {
		let circle: KnowledgeCircle = 'unknown';
		if (detail.entity.scope === 'private') {
			try {
				const resolved = await resolveCircles(db, userId, [detail.entity.id], {
					decider: budget - spent > 0.003 ? decider : null,
					signal: job.signal
				});
				charge(resolved.costUsd);
				circle = resolved.decisions[0]?.circle ?? 'unknown';
			} catch {
				// circles are context; research goes on without one
			}
		}
		try {
			return await gatherKnowledgeAnchors(store, db, detail, { circle, signal: job.signal });
		} catch {
			return null;
		}
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
			.eq('status', 'queued')
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

			// Organizations: what BuildOS already verified on the org's own site (tasker 168),
			// matched by its exact domain. Copied into this entry with the original sources; the
			// web search then only looks for what is still missing, or is skipped.
			const lent = await publicOrgFacts(db, detail, target.fields);
			mergeBatch(free, lent.batch);
			const stillWanted = target.fields.filter((field) => !lent.covered.includes(field));
			if (lent.covered.length && !stillWanted.length && !instructions) {
				const receipt = await store.record(free, { via: 'enrichment', runId });
				counts.done++;
				counts.facts += receipt.facts.added;
				await db
					.from('knowledge_run_targets')
					.update({
						status: 'done',
						phase: null,
						updated_at: iso(),
						facts_added: receipt.facts.added,
						cost_usd: Number(targetCost.toFixed(6)),
						summary: `Already known from its website, no search needed: ${receipt.facts.added} new detail${receipt.facts.added === 1 ? '' : 's'}`,
						finished_at: iso()
					})
					.eq('id', target.id)
					.eq('status', 'running');
				await db
					.from('knowledge_entities')
					.update({ enriched_at: iso() })
					.eq('id', target.entity_id)
					.eq('owner_user_id', userId);
				return;
			}

			// Know first (free reads): the entry's circle and what the user's graph and work
			// already say about it. Neither may fail the research.
			const anchors = await knowFirst(detail, (usd) => charge(usd));

			let reservedUsd = 0;
			const port = makePort((c) => {
				reservedUsd += c.cost_usd;
				charge(c.cost_usd);
			});
			const outcome = await researchEntity(
				{
					detail,
					anchors,
					fields: lent.covered.length && stillWanted.length ? stillWanted : target.fields,
					instructions,
					userId,
					context
				},
				{
					llm,
					port,
					decider,
					charge,
					takeReserved: () => {
						const r = reservedUsd;
						reservedUsd = 0;
						return r;
					},
					budgetLeft: () => budget - spent,
					advance: (phase) => advance(target, phase),
					signal: job.signal
				}
			);
			const batch = mergeBatch(free, outcome.batch);

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
					summary: researchSummary(
						outcome,
						added,
						receipt.facts.suggested,
						outcome.dropped.length
					),
					finished_at: iso()
				})
				.eq('id', target.id)
				.eq('status', 'running');
			await db
				.from('knowledge_entities')
				.update({ enriched_at: iso() })
				.eq('id', target.entity_id)
				.eq('owner_user_id', userId);
			// What this research confirmed on the organization's own site joins the public
			// organization layer, so the next person's research can skip the search.
			if (added && detail.entity.kind === 'org') {
				const saved = await store.getEntity(target.entity_id);
				if (saved)
					await promoteOrgFacts(db, saved, {
						runId,
						borrowed: lent.batch.facts.map((f) => ({
							predicate: f.predicate,
							value: String(f.value ?? '')
						}))
					});
			}
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
	// A lane that throws (a failed claim) stops the other one from taking more targets, and the
	// job fails only after both lanes have stopped: a retry never overlaps a lane still paying.
	let laneError: unknown = null;
	await Promise.all(
		Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
			try {
				// Take the next target before awaiting anything: two lanes waiting on the cancel
				// check could otherwise both pass `queue.length` and one would get undefined.
				for (let next = queue.shift(); next; next = queue.shift()) {
					if (cancelled || (await isCancelled())) {
						cancelled = true; // `next` is still queued; the sweep below cancels it
						return;
					}
					await research(next);
				}
			} catch (error) {
				laneError ??= error;
				queue.length = 0;
			}
		})
	);
	if (laneError) throw laneError;
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
