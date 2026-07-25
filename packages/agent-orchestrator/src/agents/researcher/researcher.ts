import { z } from 'zod';

import {
	AgentResultSchema,
	ContextPacketSchema,
	type AgentResult,
	type ContextPacket
} from '../../contracts';
import type { ModelUsageEvent, ResearchModelPort, WebResearchPort } from '../../ports';
import {
	buildResearchUserPrompt,
	RESEARCH_MODEL_MAX_TOKENS,
	RESEARCH_MODEL_TEMPERATURE,
	RESEARCH_PROMPT_VERSION,
	RESEARCH_SYSTEM_PROMPT
} from './prompts';

const SearchResponseSchema = z
	.object({
		results: z
			.array(
				z
					.object({
						title: z.string().optional(),
						url: z.string().url(),
						snippet: z.string().optional()
					})
					.passthrough()
			)
			.default([]),
		info: z
			.object({
				billing: z
					.object({
						cost_usd: z.number().finite().nonnegative()
					})
					.passthrough()
					.optional()
			})
			.passthrough()
			.optional()
	})
	.passthrough();

const VisitResponseSchema = z
	.object({
		url: z.string().url(),
		final_url: z.string().url().optional(),
		title: z.string().optional(),
		content: z.string().min(1),
		excerpt: z.string().optional()
	})
	.passthrough();

export interface ResearcherInput {
	objective: string;
	focus?: string;
	contextPacket?: ContextPacket | null;
	suppliedUrls?: string[];
	minimumCitations?: number;
	maxVisits?: number;
	maxModelCostUsd?: number;
	web: WebResearchPort;
	model: ResearchModelPort;
}

export interface ResearcherWebCall {
	operation: 'search' | 'visit';
	arguments: Record<string, unknown>;
	succeeded: boolean;
	error: string | null;
}

export interface ResearcherExecution {
	result: AgentResult;
	usage: ModelUsageEvent[];
	webCalls: ResearcherWebCall[];
	toolCostUsd: number;
	observedSourceUrls: string[];
	citedUrls: string[];
}

interface VisitedEvidence {
	title: string;
	url: string;
	aliases: string[];
	content: string;
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function canonicalUrl(value: string): string | null {
	try {
		const url = new URL(value.trim());
		if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
		url.hash = '';
		for (const key of Array.from(url.searchParams.keys())) {
			if (/^(utm_|fbclid$|gclid$)/i.test(key)) url.searchParams.delete(key);
		}
		if (url.pathname !== '/') url.pathname = url.pathname.replace(/\/+$/, '');
		return url.toString();
	} catch {
		return null;
	}
}

export function extractHttpUrls(value: string): string[] {
	const matches = value.match(/https?:\/\/[^\s<>()\]]+/gi) ?? [];
	return Array.from(
		new Set(
			matches.flatMap((match) => {
				const canonical = canonicalUrl(match.replace(/[.,;:!?]+$/, ''));
				return canonical ? [canonical] : [];
			})
		)
	);
}

function deduplicateUrls(values: string[]): string[] {
	return Array.from(new Set(values.flatMap((value) => canonicalUrl(value) ?? [])));
}

function bounded(value: string, maxCharacters: number): string {
	if (value.length <= maxCharacters) return value;
	return `${value.slice(0, maxCharacters - 1).trimEnd()}…`;
}

function searchQuery(params: {
	objective: string;
	focus: string;
	contextPacket: ContextPacket | null;
}): string {
	const contextTerms = params.contextPacket
		? [
				...params.contextPacket.facts.slice(0, 3).map((fact) => fact.statement),
				...params.contextPacket.excerpts.slice(0, 2).map((excerpt) => excerpt.text)
			]
				.join(' ')
				.slice(0, 800)
		: '';
	return bounded(`${params.objective} ${params.focus} ${contextTerms}`.replace(/\s+/g, ' ').trim(), 1_000);
}

function failedResult(params: {
	summary: string;
	details: string;
	residualRisks: string[];
}): AgentResult {
	return AgentResultSchema.parse({
		schema_version: 1,
		status: 'failed',
		summary: params.summary,
		artifact_drafts: [],
		acceptance_results: [
			{
				criterion_id: 'research.citations.valid',
				status: 'failed',
				evaluation_source: 'runtime',
				validator_id: 'research.citations.observed_urls',
				details: params.details,
				evidence_artifact_ids: []
			}
		],
		open_questions: [],
		assumptions: [],
		residual_risks: params.residualRisks,
		confidence: 0,
		capability_gaps: []
	});
}

export async function runResearcher(input: ResearcherInput): Promise<ResearcherExecution> {
	const contextPacket = input.contextPacket
		? ContextPacketSchema.parse(input.contextPacket)
		: null;
	const focus = input.focus?.trim() || input.objective;
	const maxVisits = Math.max(1, Math.min(input.maxVisits ?? 3, 5));
	const minimumCitations = Math.max(1, Math.min(input.minimumCitations ?? 1, maxVisits));
	const suppliedUrls = deduplicateUrls([
		...(input.suppliedUrls ?? []),
		...extractHttpUrls(input.objective)
	]);
	const webCalls: ResearcherWebCall[] = [];
	let toolCostUsd = 0;
	let urlsToVisit = suppliedUrls;

	if (urlsToVisit.length === 0) {
		if (!input.web.search) {
			return {
				result: failedResult({
					summary: 'External research could not start because web search is unavailable.',
					details: 'No supplied URL or web-search capability was available.',
					residualRisks: ['No current external evidence was collected.']
				}),
				usage: [],
				webCalls,
				toolCostUsd,
				observedSourceUrls: [],
				citedUrls: []
			};
		}
		const arguments_ = {
			query: searchQuery({ objective: input.objective, focus, contextPacket }),
			search_depth: 'basic',
			max_results: 5,
			include_answer: false
		};
		try {
			const raw = await input.web.search(arguments_);
			webCalls.push({ operation: 'search', arguments: arguments_, succeeded: true, error: null });
			const search = SearchResponseSchema.parse(raw);
			toolCostUsd += search.info?.billing?.cost_usd ?? 0;
			urlsToVisit = deduplicateUrls(search.results.map((result) => result.url));
		} catch (error) {
			webCalls.push({
				operation: 'search',
				arguments: arguments_,
				succeeded: false,
				error: errorMessage(error)
			});
		}
	}

	const evidence: VisitedEvidence[] = [];
	if (input.web.visit) {
		for (const url of urlsToVisit.slice(0, maxVisits)) {
			const arguments_ = { url, max_chars: 8_000 };
			try {
				const visited = VisitResponseSchema.parse(await input.web.visit(arguments_));
				webCalls.push({ operation: 'visit', arguments: arguments_, succeeded: true, error: null });
				const finalUrl = canonicalUrl(visited.final_url ?? visited.url) ?? url;
				evidence.push({
					title: visited.title?.trim() || new URL(finalUrl).hostname,
					url: finalUrl,
					aliases: deduplicateUrls([url, visited.url, visited.final_url ?? visited.url]),
					content: bounded(visited.content, 8_000)
				});
			} catch (error) {
				webCalls.push({
					operation: 'visit',
					arguments: arguments_,
					succeeded: false,
					error: errorMessage(error)
				});
			}
		}
	}

	if (evidence.length === 0) {
		return {
			result: failedResult({
				summary: 'External research produced no visitable evidence.',
				details: 'No web source was successfully visited, so a cited memo was not generated.',
				residualRisks: webCalls.flatMap((call) => (call.error ? [call.error] : []))
			}),
			usage: [],
			webCalls,
			toolCostUsd,
			observedSourceUrls: [],
			citedUrls: []
		};
	}

	const modelResponse = await input.model.generateText({
		promptVersion: RESEARCH_PROMPT_VERSION,
		systemPrompt: RESEARCH_SYSTEM_PROMPT,
		userPrompt: buildResearchUserPrompt({
			objective: input.objective,
			focus,
			contextPacket,
			evidence
		}),
		temperature: RESEARCH_MODEL_TEMPERATURE,
		maxTokens: RESEARCH_MODEL_MAX_TOKENS,
		maxCostUsd: Math.max(0, input.maxModelCostUsd ?? 0.03)
	});
	const memo = modelResponse.text.trim();
	const citedUrls = extractHttpUrls(memo);
	const observedUrls = new Set(evidence.flatMap((item) => [item.url, ...item.aliases]));
	const unknownCitations = citedUrls.filter((url) => !observedUrls.has(url));
	const validCitations = citedUrls.filter((url) => observedUrls.has(url));
	const requiredSuppliedUrlsMissing = suppliedUrls.filter(
		(url) => !validCitations.includes(url) && !evidence.some((item) => item.url === url && validCitations.includes(item.url))
	);
	const citationChecksPassed =
		memo.length > 0 &&
		validCitations.length >= minimumCitations &&
		unknownCitations.length === 0 &&
		requiredSuppliedUrlsMissing.length === 0;
	const citationDetails = citationChecksPassed
		? `${validCitations.length} citations all resolve to sources visited by this step.`
		: `Citation validation failed: ${validCitations.length}/${minimumCitations} required observed citations; ${unknownCitations.length} unknown; ${requiredSuppliedUrlsMissing.length} supplied URLs missing.`;

	const citedEvidence = evidence.filter((item) =>
		[item.url, ...item.aliases].some((url) => validCitations.includes(url))
	);
	const result = AgentResultSchema.parse({
		schema_version: 1,
		status: citationChecksPassed ? 'completed' : 'partial',
		summary: citationChecksPassed
			? `Completed bounded research with ${validCitations.length} validated citations.`
			: 'Research memo was generated but failed the code-level citation gate.',
		artifact_drafts: [
			{
				schema_version: 1,
				artifact_type: 'research_packet',
				summary: bounded(`Research evidence for: ${focus}`, 900),
				payload: {
					format: 'markdown',
					content: memo,
					citations: validCitations,
					sources: evidence.map((item) => ({ title: item.title, url: item.url }))
				},
				provenance: citedEvidence.map((item) => ({
					relationship: 'summarized_from',
					source: {
						source_type: 'web',
						source_id: item.url,
						source_uri: item.url,
						project_id: contextPacket?.project_scope[0]?.project_id ?? null,
						captured_at: new Date().toISOString()
					}
				}))
			}
		],
		acceptance_results: [
			{
				criterion_id: 'research.citations.valid',
				status: citationChecksPassed ? 'passed' : 'failed',
				evaluation_source: 'runtime',
				validator_id: 'research.citations.observed_urls',
				details: citationDetails,
				evidence_artifact_ids: []
			}
		],
		open_questions: [],
		assumptions: [],
		residual_risks: [
			...unknownCitations.map((url) => `The model cited an unobserved URL: ${url}`),
			...requiredSuppliedUrlsMissing.map((url) => `The supplied source was not cited: ${url}`),
			...webCalls.flatMap((call) => (call.error ? [`Web ${call.operation} failed: ${call.error}`] : []))
		].slice(0, 50),
		confidence: citationChecksPassed ? 0.85 : 0.45,
		capability_gaps: []
	});

	return {
		result,
		usage: modelResponse.usage,
		webCalls,
		toolCostUsd,
		observedSourceUrls: Array.from(observedUrls).sort(),
		citedUrls
	};
}
