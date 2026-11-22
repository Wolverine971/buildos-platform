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
	KNOWLEDGE_KIND_DEFINITIONS,
	KNOWLEDGE_UUID_PATTERN,
	KnowledgeStore,
	enrichFieldsFor,
	getKnowledgePredicate,
	loadKnowledgeFocusBrief,
	renderKnowledgeFocusBrief,
	fetchYouTubeOEmbed,
	gatherKnowledgeAnchors,
	oembedBatch,
	resolveCircles,
	youtubeVideoId,
	type IdentityDecider,
	type KnowledgeAnchors,
	type KnowledgeCircle,
	type KnowledgeDataClient,
	type KnowledgeFocusBrief,
	type KnowledgeKind,
	type KnowledgeWriteBatch
} from '@buildos/shared-agent-ops/knowledge';
import { fetchPublicUrl } from '@buildos/shared-agent-ops/web/safe-fetch';
import { JevClient, LLMUsageLogger } from '@buildos/smart-llm';
import type { ProcessingJob } from '../../lib/supabaseQueue';
import { SmartLLMService } from '../../lib/services/smart-llm-service';
import { supabase as defaultSupabase } from '../../lib/supabase';
import { createAgentRunWebResearchPort, type PaidToolCharge } from '../agent-run/webResearchPort';
import {
	alsoWorthSaving,
	describeFields,
	enrichContextFrom,
	profilesForPlanner,
	KNOWLEDGE_PLAN_OPERATION,
	KNOWLEDGE_PLAN_SYSTEM_PROMPT,
	MAX_PLANNED_QUERIES,
	MAX_RESEARCH_ROUNDS,
	researchPlanUserPrompt,
	validateResearchPlan,
	type ResearchPlan,
	type ResearchPlanInput
} from './knowledgeEnrichPlan';
import { promoteOrgFacts, publicOrgFacts } from './publicOrgLayer';
import { platformStatus, WANTED_PLATFORMS } from './socialProfiles';
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
	/**
	 * Raw HTML of a page on an entry's own website, for reading the account links in its
	 * header and footer (free). Undefined → a guarded public fetch.
	 */
	fetchHtml?: (url: string, signal?: AbortSignal) => Promise<string | null>;
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
	const fetchHtml =
		deps.fetchHtml ??
		(async (url: string, signal?: AbortSignal) => {
			const page = await fetchPublicUrl(url, {
				fetchFn,
				timeoutMs: 6_000,
				maxBytes: 700_000,
				...(signal ? { signal } : {})
			});
			return page.status < 400 ? page.body : null;
		});
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

	/** The fields the run asked for (before fitting them to each entry's kind). */
	const rawRunFields =
		run.input && typeof run.input === 'object'
			? (run.input as Record<string, unknown>).fields
			: null;
	const runFields = Array.isArray(rawRunFields)
		? rawRunFields.filter((field): field is string => typeof field === 'string')
		: [];
	/** What each entry's research did (searches, pages, finds), kept on the run for the UI and chat. */
	const traces: Record<string, unknown> = {};

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

			// Everything BuildOS already holds on the entry, for free: copies saved under another
			// kind, their employer and website, and the work that names it across projects.
			let brief = await loadKnowledgeFocusBrief(store, db, userId, target.entity_id).catch(
				() => null
			);
			let briefText = brief
				? renderKnowledgeFocusBrief(brief, { audience: 'research' })
				: null;
			const labelsOf = (keys: readonly string[]) =>
				keys.map((key) => getKnowledgePredicate(key)?.label ?? key);

			// Account links on the entry being researched, kept current as rounds find more.
			let profileUrls = context.existing
				.filter((e) => e.predicate === 'profile_url')
				.map((e) => e.value);

			/** One small structured call: what this really is, and the searches worth running. */
			const planRound = async (
				subjectEntity: { name: string; kind: KnowledgeKind },
				lookingFor: readonly string[],
				previous?: ResearchPlanInput['previous']
			): Promise<ResearchPlan | null> => {
				if (!briefText || budget - spent < 0.004) return null;
				try {
					const raw = await llm.getJSONResponse<unknown>({
						systemPrompt: KNOWLEDGE_PLAN_SYSTEM_PROMPT,
						userPrompt: researchPlanUserPrompt({
							name: subjectEntity.name,
							filedKind: subjectEntity.kind,
							brief: briefText,
							instructions,
							lookingFor: describeFields(lookingFor),
							...(lookingFor.includes('profile_url')
								? {
										profiles: profilesForPlanner(
											platformStatus(subjectEntity.kind, profileUrls)
										)
									}
								: {}),
							...(previous
								? {}
								: {
										alsoWorthSaving: labelsOf(
											alsoWorthSaving(subjectEntity.kind, lookingFor)
										)
									}),
							...(previous ? { previous } : {})
						}),
						userId,
						profile: 'fast',
						temperature: 0.1,
						reasoning: { enabled: false },
						maxTokens: 400,
						timeoutMs: 15_000,
						operationType: KNOWLEDGE_PLAN_OPERATION,
						signal: job.signal,
						spendLimit: { maxCostUsd: 0.003 },
						onUsage: (usage) => charge(usage.totalCost ?? 0)
					});
					return validateResearchPlan(raw, {
						filedKind: subjectEntity.kind,
						alreadyRun: previous?.queries ?? [],
						limit: previous ? 2 : MAX_PLANNED_QUERIES
					});
				} catch {
					return null; // planning is an upgrade; the fixed search recipe still runs
				}
			};

			let plan = await planRound(detail.entity, target.fields);

			// The planner says the entry is filed under the wrong kind (a person read out of a
			// list of companies). With a same-name entry of the right kind, that one is the real
			// entry: research it and save there. Otherwise the type is corrected, but only when
			// the user said something for this run; an unprompted bulk run just reports it.
			let subject = detail;
			let subjectContext = context;
			let subjectFields = lent.covered.length && stillWanted.length ? stillWanted : target.fields;
			let kindNote = '';
			if (
				plan &&
				plan.kind !== detail.entity.kind &&
				detail.entity.scope === 'private' &&
				!detail.entity.is_self
			) {
				const from = KNOWLEDGE_KIND_DEFINITIONS[detail.entity.kind].pluralLabel;
				const to = KNOWLEDGE_KIND_DEFINITIONS[plan.kind].pluralLabel;
				const twin = brief?.twins.find(
					(t) => t.kind === plan!.kind && t.why === 'same_name'
				);
				const twinDetail = twin ? await store.getEntity(twin.id).catch(() => null) : null;
				if (twinDetail) {
					subject = twinDetail;
					kindNote = ` It is filed under ${from}, but you already have ${twinDetail.entity.name} under ${to}, so what was found is saved there. Merge the two from the card.`;
				} else if (instructions) {
					await store.changeEntityKind(detail.entity.id, plan.kind);
					const changed = await store.getEntity(detail.entity.id);
					if (changed) {
						subject = changed;
						kindNote = ` Moved from ${from} to ${to}, going by what you said.`;
					}
				} else {
					kindNote = ` This looks like it belongs under ${to}, not ${from}: change its type on the card, then research again.`;
				}
				if (subject !== detail) {
					subjectContext = enrichContextFrom(subject);
					subjectFields = enrichFieldsFor(subject.entity.kind, runFields);
					// The brief is told from the entry being researched: its own details and
					// what is missing for its type, with the misfiled copy listed as a copy.
					profileUrls = subjectContext.existing
						.filter((e) => e.predicate === 'profile_url')
						.map((e) => e.value);
					const subjectBrief = await loadKnowledgeFocusBrief(
						store,
						db,
						userId,
						subject.entity.id
					).catch(() => null);
					if (subjectBrief) {
						brief = subjectBrief;
						briefText = renderKnowledgeFocusBrief(subjectBrief, { audience: 'research' });
					}
					// Searches for the right kind, with its own playbook.
					plan = (await planRound(subject.entity, subjectFields)) ?? plan;
				}
			}

			// Know first (free reads): the entry's circle and what the user's graph and work
			// already say about it, plus leads from its copies. Neither may fail the research.
			const anchors = await knowFirst(subject, (usd) => charge(usd));
			if (anchors && brief) addBriefLeads(anchors, brief, subject.entity.id);

			let reservedUsd = 0;
			const port = makePort((c) => {
				reservedUsd += c.cost_usd;
				charge(c.cost_usd);
			});
			const trace: ResearchTrace = { queries: [], pages: [], rounds: 0 };
			const readUrls = new Set<string>();
			const found: string[] = [];
			// Details already on the entry are not missing: a second round is not spent on them.
			const foundPredicates = new Set<string>(subjectContext.existing.map((e) => e.predicate));
			const totals = { pagesRead: 0, differentPages: 0, unanchored: false, dropped: 0 };
			let added = 0;
			let suggested = 0;
			let roundPlan = plan;
			for (let round = 1; round <= MAX_RESEARCH_ROUNDS; round++) {
				if (round > 1) {
					// A second round only for what is still missing, and only with budget left.
					// One account does not finish "profiles": a person's LinkedIn or Instagram, or a
					// company's, may still be worth a search.
					const wanted = platformStatus(subject.entity.kind, profileUrls).want;
					const mainPlatforms = (WANTED_PLATFORMS[subject.entity.kind] ?? []).slice(0, 2);
					const missing = subjectFields.filter(
						(field) =>
							!foundPredicates.has(field) ||
							(field === 'profile_url' && mainPlatforms.some((p) => wanted.includes(p)))
					);
					if (!missing.length || budget - spent < 0.012) break;
					roundPlan = await planRound(subject.entity, missing, {
						queries: trace.queries,
						pages: trace.pages,
						found,
						stillMissing: labelsOf(missing)
					});
					if (!roundPlan?.queries.length) break;
					await advance(target, 'searching');
				}
				const outcome = await researchEntity(
					{
						detail: subject,
						anchors,
						fields: subjectFields,
						instructions,
						userId,
						context: subjectContext,
						...(roundPlan?.queries.length ? { queries: roundPlan.queries } : {}),
						brief: briefText,
						skipUrls: readUrls
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
						fetchHtml: (url) => fetchHtml(url, job.signal),
						signal: job.signal
					}
				);
				trace.rounds = round;
				trace.queries.push(...outcome.queries);
				for (const page of outcome.pages) {
					readUrls.add(page.url);
					const verdict =
						outcome.verdicts.find((v) => v.url === page.url)?.verdict ?? 'read';
					trace.pages.push({
						url: page.url,
						title: page.title,
						verdict: outcome.previews.includes(page.url)
							? `${verdict} (search preview only)`
							: verdict
					});
				}
				// Pages that would not open are part of what happened: "LinkedIn could not be read".
				for (const url of outcome.unread) {
					readUrls.add(url);
					trace.pages.push({ url, title: null, verdict: 'unreadable' });
				}
				totals.pagesRead += outcome.pagesRead;
				totals.differentPages += outcome.differentPages;
				totals.unanchored ||= outcome.unanchored;
				totals.dropped += outcome.dropped.length;
				for (const fact of outcome.batch.facts) {
					// A person a page names at this organization: their fact, pointing here.
					const person = outcome.batch.entities.find((e) => e.ref === fact.subject);
					if (person) {
						const title = (fact.qualifiers as { title?: string } | undefined)?.title;
						found.push(`${person.name}${title ? `, ${title}` : ''} works here`);
						continue;
					}
					foundPredicates.add(fact.predicate);
					if (fact.predicate === 'profile_url') profileUrls.push(String(fact.value ?? ''));
					const object = outcome.batch.entities.find((e) => e.ref === fact.object);
					found.push(
						`${getKnowledgePredicate(fact.predicate)?.label ?? fact.predicate}: ${object?.name ?? String(fact.value ?? '')}`
					);
				}
				trace.socials = [...(trace.socials ?? []), ...outcome.socials].slice(0, 12);
				// Each round is saved as it lands (free finds ride with the first).
				const batch = round === 1 ? mergeBatch(free, outcome.batch) : outcome.batch;
				if (batch.facts.length) {
					await advance(target, 'saving');
					const receipt = await store.record(batch, { via: 'enrichment', runId });
					added += receipt.facts.added;
					suggested += receipt.facts.suggested;
					// The next round reads the entry as it now stands, so it lists these as
					// known and does not report them again in other words.
					if (round < MAX_RESEARCH_ROUNDS) {
						const saved = await store.getEntity(subject.entity.id).catch(() => null);
						if (saved) {
							subject = saved;
							subjectContext = enrichContextFrom(saved);
						}
					}
				}
			}
			traces[target.entity_id] = {
				...trace,
				queries: trace.queries.slice(0, 8),
				pages: trace.pages.slice(0, 10),
				saved_on: subject.entity.id,
				found: found.slice(0, 20)
			};

			counts.done++;
			counts.facts += added;
			const searched = trace.queries.length
				? ` Searched: ${trace.queries
						.slice(0, 5)
						.map((q) => `“${q}”`)
						.join('; ')}.`
				: '';
			await db
				.from('knowledge_run_targets')
				.update({
					status: 'done',
					phase: null,
					updated_at: iso(),
					facts_added: added,
					cost_usd: Number(targetCost.toFixed(6)),
					summary: (
						researchSummary(totals, added, suggested, totals.dropped) +
						'.' +
						searched +
						kindNote
					).slice(0, 1500),
					finished_at: iso()
				})
				.eq('id', target.id)
				.eq('status', 'running');
			await db
				.from('knowledge_entities')
				.update({ enriched_at: iso() })
				.in('id', [...new Set([target.entity_id, subject.entity.id])])
				.eq('owner_user_id', userId);
			// What this research confirmed on the organization's own site joins the public
			// organization layer, so the next person's research can skip the search.
			if (added && subject.entity.kind === 'org') {
				const saved = await store.getEntity(subject.entity.id);
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
					stats: { targets: targets.length, ...counts, trace: traces },
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
			stats: { targets: targets.length, ...counts, trace: traces },
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

/** What one entry's research did, for the run's record. */
interface ResearchTrace {
	queries: string[];
	pages: Array<{ url: string; title: string | null; verdict: string }>;
	/** Social accounts taken as the entry's own, and the ground each was taken on. */
	socials?: Array<{ url: string; platform: string; ground: string; from: string }>;
	rounds: number;
}

/** Contact details and the user's own notes never become leads for a search or a model. */
const PRIVATE_LEAD_PREDICATES = new Set([
	'email',
	'phone',
	'address',
	'birthday',
	'note',
	'knows',
	'alias',
	'related_to'
]);

/**
 * Leads from the focus brief that the entry's own facts don't carry: what its copies know
 * (an employer, a place) and the words around its name in linked work. Mutates `anchors`.
 */
export function addBriefLeads(
	anchors: KnowledgeAnchors,
	brief: KnowledgeFocusBrief,
	subjectId: string
): void {
	for (const twin of brief.twins) {
		if (twin.id === subjectId) continue;
		for (const fact of twin.facts) {
			if (fact.status !== 'active' || PRIVATE_LEAD_PREDICATES.has(fact.predicate)) continue;
			const line = `${fact.label}: ${fact.value}`;
			if (anchors.facts.length < 10 && !anchors.facts.includes(line)) anchors.facts.push(line);
			if (fact.predicate === 'works_at' && !anchors.employer) anchors.employer = fact.value;
			if (
				fact.predicate === 'located_in' &&
				anchors.places.length < 4 &&
				!anchors.places.includes(fact.value)
			)
				anchors.places.push(fact.value);
		}
	}
	for (const record of brief.records) {
		if (anchors.mentions.length >= 5) break;
		if (!record.snippet || anchors.mentions.some((m) => m.text === record.snippet)) continue;
		anchors.mentions.push({
			record_kind: record.record_kind,
			title: record.title,
			text: record.snippet
		});
	}
}
