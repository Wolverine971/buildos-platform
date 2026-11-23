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
	type IdentityCheckResult,
	type IdentityDecider,
	type KnowledgeAnchors,
	type KnowledgeEntityDetail,
	type KnowledgeWriteBatch,
	checkIdentityBatch,
	domainOf,
	hasKnowledgeAnchors,
	hostMatchesDomain
} from '@buildos/shared-agent-ops/knowledge';
import type { JSONRequestOptions } from '@buildos/smart-llm';
import {
	SOCIAL_PLATFORM_LABELS,
	type SocialFinding,
	type SocialPage,
	accountKey,
	findSocialProfiles,
	parseSocialProfile,
	platformStatus,
	profileFitsKind
} from './socialProfiles';
import { readPaidToolCharge } from '../agent-run/webResearchPort';
import {
	type EnrichContext,
	type EnrichKnowledgePanel,
	type EnrichPage,
	KNOWLEDGE_ENRICH_OPERATION,
	KNOWLEDGE_ENRICH_SYSTEM_PROMPT,
	MAX_PAGES_PER_TARGET,
	PAGE_CHARS,
	alsoWorthSaving,
	choosePages,
	enrichContextFrom,
	enrichQueries,
	enrichUserPrompt,
	knowledgePanelPage,
	validateEnrichment
} from './knowledgeEnrichPlan';

export const MAX_LLM_COST_PER_TARGET_USD = 0.01;

export type JsonCaller = { getJSONResponse<T>(options: JSONRequestOptions): Promise<T> };
export type SearchPort = {
	search?: (args: Record<string, unknown>, signal?: AbortSignal) => Promise<unknown>;
	visit?: (args: Record<string, unknown>, signal?: AbortSignal) => Promise<unknown>;
};

/** A search preview shorter than this says nothing worth reading. */
const MIN_PREVIEW_CHARS = 60;
/** Account pages checked beside the pages read, and how much of each is kept (its bio). */
const MAX_PROFILE_CANDIDATES = 2;
const PROFILE_CANDIDATE_CHARS = 1_500;

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
	/** A second round of the same run: single details it already found are not replaced. */
	laterRound?: boolean;
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
	/**
	 * Raw HTML of a page on the entry's own website (free). Footer icons link to a company's
	 * accounts, and those links are not in the page's text. Null when it cannot be fetched.
	 */
	fetchHtml?: (url: string) => Promise<string | null>;
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
	/** Social accounts taken as the entry's own this round, and on what ground. */
	socials: Array<{
		url: string;
		platform: string;
		ground: SocialFinding['ground'];
		from: string;
	}>;
	/** Profiles that matched on the name alone and were not saved. */
	nameOnlyProfiles: string[];
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
		socials: [],
		nameOnlyProfiles: [],
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
	// Profiles get their own lane. A search for someone's Instagram returns accounts, and each
	// is short (a bio) and must be checked against what is known, so up to two of them ride
	// along without taking a page's place. None is opened: the search engine's text is enough.
	if (fields.includes('profile_url')) {
		const wanted = new Set(
			platformStatus(
				detail.entity.kind,
				context.existing.filter((e) => e.predicate === 'profile_url').map((e) => e.value)
			).want
		);
		const taken = new Set(read.map((page) => page.url));
		let lane = 0;
		for (const result of fresh) {
			if (lane >= MAX_PROFILE_CANDIDATES) break;
			if (taken.has(result.url)) continue;
			const profile = parseSocialProfile(result.url);
			if (!profile || !wanted.has(profile.platform)) continue;
			if (!profileFitsKind(profile, detail.entity.kind)) continue;
			const text = result.content?.trim() || result.preview;
			if (!text || text.length < MIN_PREVIEW_CHARS) continue;
			taken.add(result.url);
			read.push({
				url: result.url,
				title: result.title || null,
				content: result.content?.trim()
					? result.content.slice(0, PROFILE_CANDIDATE_CHARS)
					: `[Search preview only: the page itself could not be opened.]\n${result.preview}`
			});
			if (!result.content?.trim()) outcome.previews.push(result.url);
			lane++;
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
	// What the check said about each kept page, for deciding whose social accounts are whose.
	const checked = new Map<string, { verdict: 'same' | 'ask'; ownSite: boolean }>();
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
			checked.set(page.url, {
				verdict: result.verdict === 'same' ? 'same' : 'ask',
				ownSite: result.reason === 'own_site'
			});
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
		suggestPages,
		keepExistingSingles: Boolean(input.laterRound),
		ownDomains: [
			...(anchors?.domains ?? []),
			...(context.homepage ? [domainOf(context.homepage)] : [])
		].filter((d): d is string => Boolean(d))
	});
	outcome.batch = validated.batch;
	outcome.dropped = validated.dropped;

	// 5. Social accounts, decided by rules and never by a name match: what the entry's own
	// website declares or links, a profile that was itself confirmed and what its bio links.
	const wantsProfiles = fields.includes('profile_url') || also.includes('profile_url');
	const siteUrls = [
		context.homepage,
		...validated.batch.facts
			.filter((f) => f.predicate === 'homepage' && f.status !== 'suggested')
			.map((f) => String(f.value ?? ''))
	].filter((url): url is string => Boolean(url));
	const confirmedSite = siteUrls
		.map((url) => domainOf(url))
		.filter((d): d is string => Boolean(d));
	const socialPages: SocialPage[] = [];
	let htmlFetches = 0;
	for (const page of pages) {
		if (page.site !== undefined) continue; // the knowledge panel is not a page of theirs
		const state = checked.get(page.url) ?? { verdict: 'ask' as const, ownSite: false };
		const host = domainOf(page.url);
		const ownSite =
			state.ownSite ||
			(state.verdict === 'same' &&
				Boolean(host) &&
				confirmedSite.some((d) => hostMatchesDomain(host!, d)));
		let html: string | null = null;
		// A company's own pages (footer links), and for a person any confirmed page that is not
		// itself an account: an employer's page about them may declare their accounts.
		const worthReading =
			ownSite ||
			(detail.entity.kind === 'person' &&
				state.verdict === 'same' &&
				!parseSocialProfile(page.url) &&
				!outcome.previews.includes(page.url));
		if (worthReading && wantsProfiles && deps.fetchHtml && htmlFetches < MAX_PAGES_PER_TARGET) {
			htmlFetches++;
			html = await deps.fetchHtml(page.url).catch(() => null);
		}
		socialPages.push({
			url: page.url,
			title: page.title,
			text: page.content,
			verdict: state.verdict,
			ownSite,
			html
		});
	}
	// The website is known (or was just confirmed) but none of its pages was read this round:
	// its home page is the surest place for its accounts, and reading its links is free.
	if (wantsProfiles && deps.fetchHtml && siteUrls[0] && !socialPages.some((p) => p.ownSite)) {
		const html = await deps.fetchHtml(siteUrls[0]).catch(() => null);
		if (html)
			socialPages.push({
				url: siteUrls[0],
				title: null,
				text: '',
				verdict: 'same',
				ownSite: true,
				html
			});
	}
	const social = findSocialProfiles({
		kind: detail.entity.kind,
		name: detail.entity.name,
		pages: socialPages,
		known: context.existing.filter((e) => e.predicate === 'profile_url').map((e) => e.value)
	});
	outcome.nameOnlyProfiles = social.nameOnly;
	if (wantsProfiles) applySocialFindings(outcome, social, detail.entity.id);
	return outcome;
}

/**
 * Put the rule-decided accounts into the round's batch. They replace whatever the model said
 * about the same account, and a profile that matched on the name alone is taken out.
 */
function applySocialFindings(
	outcome: ResearchOutcome,
	social: ReturnType<typeof findSocialProfiles>,
	entityId: string
): void {
	const decided = new Set([
		...social.findings.map((f) => f.profile.url),
		...social.nameOnly,
		...social.superseded
	]);
	const taken = new Set(social.findings.map((f) => accountKey(f.profile)));
	const facts = outcome.batch.facts.filter((fact) => {
		if (fact.predicate !== 'profile_url') return true;
		const profile = parseSocialProfile(String(fact.value ?? ''));
		// The model's word on an account the rules decided (or the same account under another
		// address) is dropped: the rule-decided fact below is the one that is saved.
		if (!profile || (!decided.has(profile.url) && !taken.has(accountKey(profile)))) return true;
		if (social.nameOnly.includes(profile.url))
			outcome.dropped.push({ predicate: 'profile_url', reason: 'matched on the name only' });
		return false;
	});
	const sources = [...(outcome.batch.sources ?? [])];
	social.findings.forEach((finding, i) => {
		const ref = `social${i}`;
		sources.push({
			ref,
			type: 'web',
			url: finding.pageUrl,
			...(finding.pageTitle ? { title: finding.pageTitle.slice(0, 500) } : {})
		});
		facts.push({
			subject: entityId,
			predicate: 'profile_url',
			value: finding.profile.url,
			qualifiers: { platform: SOCIAL_PLATFORM_LABELS[finding.profile.platform] },
			sources: [ref],
			quote: finding.evidence.slice(0, 1000),
			confidence: finding.confirmed ? 0.95 : 0.5,
			status: finding.confirmed && !outcome.unanchored ? 'active' : 'suggested'
		});
		outcome.socials.push({
			url: finding.profile.url,
			platform: finding.profile.platform,
			ground: finding.ground,
			from: finding.pageUrl
		});
	});
	outcome.batch = { ...outcome.batch, facts, sources };
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
