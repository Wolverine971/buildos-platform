// apps/worker/src/workers/knowledge/knowledgeResearch.ts
//
// One entry's web research, without saving anything (tasker 164, part A "Get it right"). Shared
// by the knowledge_enrich worker (which saves the result) and the eval runner (which scores it).
//
//   anchors (what the user's graph and work already know; free)
//   → searches built from the anchors (own site first; rejected domains excluded)
//   → read up to three pages (own site first, rejected pages never)
//   → identity check: rules, then one cheap structured decision for the rest. Pages about a
//     different same-name entity are dropped before extraction; pages it can't confirm keep
//     their findings as suggestions; with no anchors at all every finding is a suggestion.
//   → one fast-model extraction with exact quotes → validation
//
// Spend goes through `charge` (search, decision, model) so the caller's budget holds.

import {
	checkIdentityBatch,
	hasKnowledgeAnchors,
	type IdentityCheckResult,
	type IdentityDecider,
	type KnowledgeAnchors,
	type KnowledgeEntityDetail,
	type KnowledgeWriteBatch
} from '@buildos/shared-agent-ops/knowledge';
import type { JSONRequestOptions } from '@buildos/smart-llm';
import { readPaidToolCharge } from '../agent-run/webResearchPort';
import {
	alsoWorthSaving,
	choosePages,
	enrichContextFrom,
	enrichQueries,
	enrichUserPrompt,
	KNOWLEDGE_ENRICH_OPERATION,
	KNOWLEDGE_ENRICH_SYSTEM_PROMPT,
	knowledgePanelPage,
	MAX_PAGES_PER_TARGET,
	PAGE_CHARS,
	validateEnrichment,
	type EnrichContext,
	type EnrichKnowledgePanel,
	type EnrichPage
} from './knowledgeEnrichPlan';

export const MAX_LLM_COST_PER_TARGET_USD = 0.01;

export type JsonCaller = { getJSONResponse<T>(options: JSONRequestOptions): Promise<T> };
export type SearchPort = {
	search?: (args: Record<string, unknown>, signal?: AbortSignal) => Promise<unknown>;
	visit?: (args: Record<string, unknown>, signal?: AbortSignal) => Promise<unknown>;
};

/** A search preview shorter than this says nothing worth reading. */
const MIN_PREVIEW_CHARS = 60;

export type ResearchPhase = 'searching' | 'reading' | 'extracting' | 'saving';

export interface ResearchInput {
	detail: KnowledgeEntityDetail;
	anchors: KnowledgeAnchors | null;
	fields: string[];
	instructions: string | null;
	userId: string;
	/** Rename context (oEmbed title for bare YouTube links). */
	context?: EnrichContext;
	/** Planned searches for this round; without them the fixed recipe (enrichQueries) runs. */
	queries?: string[];
	/** The focus brief as text (contact details removed), for the extraction prompt. */
	brief?: string | null;
	/** Pages an earlier round already read: never fetched or paid for twice. */
	skipUrls?: ReadonlySet<string>;
}

export interface ResearchDeps {
	llm: JsonCaller;
	port: SearchPort;
	decider: IdentityDecider | null;
	/** Record spend (search reservations, settlements, decisions, model). */
	charge: (usd: number) => void;
	/** Reserved by the search port before dispatch for the current search, reset per search. */
	takeReserved: () => number;
	/** Budget left for this target, after spend so far. */
	budgetLeft: () => number;
	advance?: (phase: ResearchPhase) => Promise<void>;
	signal?: AbortSignal;
}

export interface PageVerdict {
	url: string;
	verdict: IdentityCheckResult['verdict'];
	reason: IdentityCheckResult['reason'];
	reasonText: string;
	decidedBy: IdentityCheckResult['decidedBy'];
}

export interface ResearchOutcome {
	queries: string[];
	/** Pages read from the web (excludes the knowledge panel). */
	pagesRead: number;
	/** Every page considered this round, for the trace the user sees. */
	pages: Array<{ url: string; title: string | null }>;
	/** Search results that could not be opened or came back empty. */
	unread: string[];
	/** Pages that would not open, read from the search engine's preview of them instead. */
	previews: string[];
	/** What the identity check said about each page considered. */
	verdicts: PageVerdict[];
	/** Pages dropped as a different same-name entity. */
	differentPages: number;
	/** Nothing known to confirm the entity: findings saved as suggestions. */
	unanchored: boolean;
	batch: KnowledgeWriteBatch;
	dropped: Array<{ predicate: string; reason: string }>;
	/** The model's raw answer, for replays. */
	raw: unknown;
}

export async function researchEntity(
	input: ResearchInput,
	deps: ResearchDeps
): Promise<ResearchOutcome> {
	const { detail, anchors, fields, instructions } = input;
	const context = input.context ?? enrichContextFrom(detail);
	const empty: KnowledgeWriteBatch = { entities: [], facts: [], sources: [] };
	const outcome: ResearchOutcome = {
		queries: [],
		pagesRead: 0,
		pages: [],
		unread: [],
		previews: [],
		verdicts: [],
		differentPages: 0,
		// What the user just said about the entry counts as something known to check pages
		// against, exactly like a recorded fact.
		unanchored: !hasKnowledgeAnchors(anchors) && !instructions?.trim(),
		batch: empty,
		dropped: [],
		raw: null
	};

	// 1. Search (paid). The port reserves the most a search can cost before dispatch; settle to
	// what the provider that answered actually billed.
	const queries = input.queries?.length
		? input.queries
		: enrichQueries(context, instructions, fields, anchors);
	const results: Array<{
		url: string;
		title: string;
		content: string | null;
		/** What the search engine shows for the page: title and a few lines of its text. */
		preview: string | null;
	}> = [];
	let panel: EnrichKnowledgePanel | null = null;
	for (const query of queries) {
		if (!deps.port.search || deps.budgetLeft() < 0.01) break;
		outcome.queries.push(query);
		deps.takeReserved();
		const response = (await deps.port.search(
			{ query, max_results: 5, search_depth: 'basic' },
			deps.signal
		)) as {
			results?: Array<{
				url: string;
				title: string;
				snippet?: string;
				page_content?: string;
			}>;
			knowledge_panel?: EnrichKnowledgePanel;
		};
		const reserved = deps.takeReserved();
		const billed = readPaidToolCharge(response);
		if (billed && reserved > 0) deps.charge(billed.cost_usd - reserved);
		panel ??= response.knowledge_panel ?? null;
		for (const r of response.results ?? []) {
			results.push({
				url: r.url,
				title: r.title,
				content: r.page_content ?? null,
				preview: r.snippet?.trim() ? `${r.title}\n${r.snippet.trim()}` : null
			});
		}
	}

	// 2. Read. The panel's website goes first (whether the panel is about this entity is the
	// identity check's call, as for any page); rejected pages and domains are never read.
	const panelSite = panel?.website ?? null;
	if (panelSite)
		results.unshift({ url: panelSite, title: panel!.title, content: null, preview: null });
	const fresh = input.skipUrls?.size
		? results.filter((r) => !input.skipUrls!.has(r.url))
		: results;
	// Ranked deeper than we read: a page that will not open (LinkedIn, a login wall) must not
	// use up one of the few reads. Fetches are still capped.
	const ranked = choosePages(fresh, context.homepage ?? panelSite, MAX_PAGES_PER_TARGET * 3, {
		ownDomains: anchors?.domains ?? [],
		exclude: anchors?.not ?? []
	});
	if (ranked.length) await deps.advance?.('reading');
	const read: EnrichPage[] = [];
	let fetches = 0;
	for (const result of ranked) {
		if (read.length >= MAX_PAGES_PER_TARGET) break;
		let content = result.content;
		let title: string | null = result.title || null;
		if (!content && deps.port.visit) {
			if (fetches >= MAX_PAGES_PER_TARGET) continue;
			fetches++;
			try {
				const page = (await deps.port.visit(
					{ url: result.url, max_chars: PAGE_CHARS },
					deps.signal
				)) as { content?: string; title?: string };
				content = page.content ?? null;
				title = page.title ?? title;
			} catch {
				content = null; // unreadable page (LinkedIn, a login wall)
			}
		}
		if (content?.trim()) {
			read.push({ url: result.url, title, content: content.slice(0, PAGE_CHARS) });
		} else if (result.preview && result.preview.length >= MIN_PREVIEW_CHARS) {
			// The page would not open, but the search engine quotes it: a profile's preview
			// carries the role, employer and city. Read that, and say it was only a preview.
			read.push({
				url: result.url,
				title,
				content: `[Search preview only: the page itself could not be opened.]\n${result.preview}`
			});
			outcome.previews.push(result.url);
		} else {
			outcome.unread.push(result.url);
		}
	}
	outcome.pagesRead = read.length;
	outcome.pages = read.map((page) => ({ url: page.url, title: page.title }));
	const panelPage = knowledgePanelPage(panel, detail.entity.kind);
	const candidates = panelPage ? [...read, panelPage] : read;
	if (!candidates.length) return outcome;

	// 3. Same one? Rules first, one structured decision for the rest. Skipped when nothing is
	// known (no anchors): then everything found is a suggestion for the user to check.
	let pages: EnrichPage[] = candidates;
	const suggestPages = new Set<number>();
	if (anchors && !outcome.unanchored) {
		const check = await checkIdentityBatch(
			// What the user typed for this research is the best lead there is about who this is.
			{ anchors, userNote: instructions },
			candidates.map((page, i) => ({
				type: 'page' as const,
				id: `p${i + 1}`,
				url: page.url,
				title: page.title,
				text: page.content,
				site: page.site ?? null
			})),
			{
				decider: deps.budgetLeft() > 0.002 ? deps.decider : null,
				userId: input.userId,
				signal: deps.signal
			}
		);
		deps.charge(check.costUsd);
		pages = [];
		check.results.forEach((result, i) => {
			const page = candidates[i]!;
			outcome.verdicts.push({
				url: page.url,
				verdict: result.verdict,
				reason: result.reason,
				reasonText: result.reasonText,
				decidedBy: result.decidedBy
			});
			if (result.verdict === 'different') {
				outcome.differentPages++;
				return;
			}
			pages.push(page);
			if (result.verdict === 'ask') suggestPages.add(pages.length);
		});
	}
	if (!pages.length || deps.budgetLeft() < 0.001) return outcome;

	// 4. Extract with exact quotes, then validate.
	await deps.advance?.('extracting');
	// Asked-for details first; anything else the entry can hold is saved when a page states it.
	const also = alsoWorthSaving(detail.entity.kind, fields);
	const raw = await deps.llm.getJSONResponse<unknown>({
		systemPrompt: KNOWLEDGE_ENRICH_SYSTEM_PROMPT,
		userPrompt: enrichUserPrompt(
			context,
			fields,
			pages,
			instructions,
			anchors,
			input.brief,
			also
		),
		userId: input.userId,
		profile: 'fast',
		temperature: 0.1,
		reasoning: { enabled: false },
		maxTokens: 1_800,
		timeoutMs: 45_000,
		operationType: KNOWLEDGE_ENRICH_OPERATION,
		signal: deps.signal,
		spendLimit: {
			maxCostUsd: Math.min(MAX_LLM_COST_PER_TARGET_USD, Math.max(deps.budgetLeft(), 0.001))
		},
		onUsage: (usage) => deps.charge(usage.totalCost ?? 0)
	});
	outcome.raw = raw;
	const validated = validateEnrichment(raw, {
		entityId: detail.entity.id,
		kind: detail.entity.kind,
		fields: [...fields, ...also],
		pages,
		existing: context.existing,
		suggestOnly: outcome.unanchored,
		suggestPages
	});
	outcome.batch = validated.batch;
	outcome.dropped = validated.dropped;
	return outcome;
}

/** "3 pages read, 2 new details, 1 to check" plus what the identity check did. */
export function researchSummary(
	outcome: Pick<ResearchOutcome, 'pagesRead' | 'differentPages' | 'unanchored'>,
	added: number,
	suggested: number,
	dropped: number
): string {
	return (
		`${outcome.pagesRead} page${outcome.pagesRead === 1 ? '' : 's'} read, ${added} new detail${added === 1 ? '' : 's'}` +
		(suggested ? `, ${suggested} to check` : '') +
		(dropped ? `, ${dropped} unsupported dropped` : '') +
		(outcome.differentPages
			? `, ${outcome.differentPages} page${outcome.differentPages === 1 ? '' : 's'} about a different one skipped`
			: '') +
		(outcome.unanchored && added + suggested > 0
			? ' (nothing known yet to confirm it, so check them)'
			: '')
	);
}
