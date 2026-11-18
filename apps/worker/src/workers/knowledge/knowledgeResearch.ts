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
	choosePages,
	enrichContextFrom,
	enrichQueries,
	enrichUserPrompt,
	KNOWLEDGE_ENRICH_OPERATION,
	KNOWLEDGE_ENRICH_SYSTEM_PROMPT,
	knowledgePanelPage,
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

export type ResearchPhase = 'searching' | 'reading' | 'extracting' | 'saving';

export interface ResearchInput {
	detail: KnowledgeEntityDetail;
	anchors: KnowledgeAnchors | null;
	fields: string[];
	instructions: string | null;
	userId: string;
	/** Rename context (oEmbed title for bare YouTube links). */
	context?: EnrichContext;
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
		verdicts: [],
		differentPages: 0,
		unanchored: !hasKnowledgeAnchors(anchors),
		batch: empty,
		dropped: [],
		raw: null
	};

	// 1. Search (paid). The port reserves the most a search can cost before dispatch; settle to
	// what the provider that answered actually billed.
	const queries = enrichQueries(context, instructions, fields, anchors);
	const results: Array<{ url: string; title: string; content: string | null }> = [];
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
			results.push({ url: r.url, title: r.title, content: r.page_content ?? null });
		}
	}

	// 2. Read. The panel's website goes first (whether the panel is about this entity is the
	// identity check's call, as for any page); rejected pages and domains are never read.
	const panelSite = panel?.website ?? null;
	if (panelSite) results.unshift({ url: panelSite, title: panel!.title, content: null });
	const chosen = choosePages(results, context.homepage ?? panelSite, undefined, {
		ownDomains: anchors?.domains ?? [],
		exclude: anchors?.not ?? []
	});
	if (chosen.length) await deps.advance?.('reading');
	const read: EnrichPage[] = [];
	for (const result of chosen) {
		let content = result.content;
		let title: string | null = result.title || null;
		if (!content && deps.port.visit) {
			try {
				const page = (await deps.port.visit(
					{ url: result.url, max_chars: PAGE_CHARS },
					deps.signal
				)) as { content?: string; title?: string };
				content = page.content ?? null;
				title = page.title ?? title;
			} catch {
				continue; // unreadable page: skip it
			}
		}
		if (content?.trim())
			read.push({ url: result.url, title, content: content.slice(0, PAGE_CHARS) });
	}
	outcome.pagesRead = read.length;
	const panelPage = knowledgePanelPage(panel, detail.entity.kind);
	const candidates = panelPage ? [...read, panelPage] : read;
	if (!candidates.length) return outcome;

	// 3. Same one? Rules first, one structured decision for the rest. Skipped when nothing is
	// known (no anchors): then everything found is a suggestion for the user to check.
	let pages: EnrichPage[] = candidates;
	const suggestPages = new Set<number>();
	if (anchors && !outcome.unanchored) {
		const check = await checkIdentityBatch(
			{ anchors },
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
	const raw = await deps.llm.getJSONResponse<unknown>({
		systemPrompt: KNOWLEDGE_ENRICH_SYSTEM_PROMPT,
		userPrompt: enrichUserPrompt(context, fields, pages, instructions, anchors),
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
		fields,
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
