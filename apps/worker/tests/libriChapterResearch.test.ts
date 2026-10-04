import { describe, it, expect, vi } from 'vitest';
import {
	CHAPTER_RESEARCH_FIELDS,
	createChapterSearchProvider,
	createChapterExtractionProvider,
	validateChapterResearch,
	type ChapterResearchInput
} from '../src/workers/libri/chapterResearch';
import { loadLibriResearchRuntimeConfig } from '../src/config/libriWorkerProfile';
const fields = Object.fromEntries(
	CHAPTER_RESEARCH_FIELDS.map((k) => [
		k,
		['summary', 'coreArgument'].includes(k) ? 'Grounded statement.' : ['Grounded idea']
	])
) as ChapterResearchInput['dataset']['chapter']['fields'];
const input: ChapterResearchInput = {
	fingerprint: 'a'.repeat(64),
	searchFingerprint: 'a'.repeat(64),
	searchOutcome: 'complete',
	dataset: {
		book: {
			id: '00000000-0000-4000-8000-000000000001',
			title: 'Offline Book',
			subtitle: null,
			authors: ['Fixture Author']
		},
		chapter: {
			id: '00000000-0000-4000-8000-000000000002',
			number: '1',
			title: 'Practice',
			fields: { ...fields, summary: 'This library summary must not be sent to web search.' }
		},
		requestedFields: [...CHAPTER_RESEARCH_FIELDS],
		evidence: {
			query: 'offline',
			answer: null,
			results: [
				{
					url: 'https://example.invalid/chapter',
					title: 'Chapter',
					content: 'Grounded content'
				}
			],
			credits: 2,
			creditMicrousd: '10',
			costBasis: 'configured_credit_rate',
			truncated: false
		}
	}
};
const output = {
	status: 'complete',
	...fields,
	sourceUrls: ['https://example.invalid/chapter'],
	confidence: 0.8,
	notes: ''
};
const response = () => ({
	request_id: 'offline-request',
	answer: 'Grounded answer',
	results: [
		{
			url: 'https://example.invalid/chapter',
			title: 'Chapter',
			content: 'Grounded content',
			score: 0.9
		}
	],
	usage: { credits: 2 }
});
const signal = new AbortController().signal;
describe('bounded chapter research providers', () => {
	it('searches only catalog identity, requests explicit usage, and accounts using the configured credit rate', async () => {
		const fetchImpl = vi.fn(async () => Response.json(response()));
		const result = await createChapterSearchProvider({
			apiKey: 'offline',
			creditMicrousd: 8000n,
			fetchImpl
		}).execute(input, signal);
		expect(result).toMatchObject({
			provider: 'tavily',
			model: 'advanced',
			costMicrousd: 16000n,
			output: {
				credits: 2,
				costBasis: 'configured_credit_rate',
				creditMicrousd: '8000',
				truncated: false
			}
		});
		const [url, request] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
		expect(url).toBe('https://api.tavily.com/search');
		expect(request.redirect).toBe('error');
		const body = JSON.parse(String(request.body));
		expect(body).toMatchObject({
			search_depth: 'advanced',
			auto_parameters: false,
			max_results: 8,
			include_usage: true,
			include_raw_content: false,
			include_images: false
		});
		expect(body.query).toContain('Offline Book');
		expect(body.query).toContain('Fixture Author');
		expect(String(request.body)).not.toContain('library summary');
		expect(fetchImpl).toHaveBeenCalledTimes(1);
	});
	it.each([undefined, NaN, -1, 3, 1.5])(
		'refuses unknown or unexpected billed credits %s',
		async (credits) => {
			await expect(
				createChapterSearchProvider({
					apiKey: 'offline',
					creditMicrousd: 10n,
					fetchImpl: async () => Response.json({ ...response(), usage: { credits } })
				}).execute(input, signal)
			).rejects.toThrow('credit usage');
		}
	);
	it('bounds saved evidence in bytes and labels excerpts when truncated', async () => {
		const long = {
			...response(),
			answer: '中'.repeat(12000),
			results: Array.from({ length: 8 }, (_, i) => ({
				url: `https://example.invalid/${i}`,
				title: 'Source',
				content: '中'.repeat(10000)
			}))
		};
		const result = await createChapterSearchProvider({
			apiKey: 'offline',
			creditMicrousd: 10n,
			fetchImpl: async () => Response.json(long)
		}).execute(input, signal);
		expect(result.output.truncated).toBe(true);
		expect(Buffer.byteLength(JSON.stringify(result.output))).toBeLessThanOrEqual(90000);
		expect(result.output.results).toHaveLength(8);
	});
	it('rejects unsafe URLs, duplicate sources and HTTP errors without retrying', async () => {
		for (const results of [
			[{ url: 'file:///private/secret', title: 'bad', content: 'bad' }],
			Array(2).fill(response().results[0])
		]) {
			const fetchImpl = vi.fn(async () => Response.json({ ...response(), results }));
			await expect(
				createChapterSearchProvider({
					apiKey: 'offline',
					creditMicrousd: 10n,
					fetchImpl
				}).execute(input, signal)
			).rejects.toThrow();
			expect(fetchImpl).toHaveBeenCalledTimes(1);
		}
		const fetchImpl = vi.fn(
			async () => new Response('private provider error', { status: 500 })
		);
		await expect(
			createChapterSearchProvider({
				apiKey: 'offline',
				creditMicrousd: 10n,
				fetchImpl
			}).execute(input, signal)
		).rejects.toThrow('HTTP 500');
		expect(fetchImpl).toHaveBeenCalledTimes(1);
	});
	it('uses private routing and only saved evidence for extraction', async () => {
		const fetchImpl = vi.fn(async () =>
			Response.json({
				id: 'offline-model-request',
				model: 'offline/chapter',
				choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(output) } }],
				usage: { cost: 0.00003, prompt_tokens: 10, completion_tokens: 5 }
			})
		);
		const result = await createChapterExtractionProvider({
			apiKey: 'offline',
			allowedModels: ['offline/chapter'],
			fetchImpl
		}).execute(input, 'offline/chapter', signal);
		expect(result.output.status).toBe('complete');
		const [, request] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit],
			body = JSON.parse(String(request.body));
		expect(body.max_tokens).toBe(2200);
		expect(body.provider).toMatchObject({
			allow_fallbacks: false,
			require_parameters: true,
			data_collection: 'deny'
		});
		expect(body.messages[0].content).toContain('untrusted source data');
		expect(body.messages[1].content).toContain('Grounded content');
	});
	it('refuses invented citations and reports missing evidence/fields without padding', () => {
		expect(() =>
			validateChapterResearch(
				{ ...output, sourceUrls: ['https://example.invalid/invented'] },
				input
			)
		).toThrow('unknown source');
		expect(validateChapterResearch({ ...output, peopleMentioned: [] }, input).status).toBe(
			'insufficient_evidence'
		);
		expect(validateChapterResearch({ ...output, sourceUrls: [] }, input).status).toBe(
			'insufficient_evidence'
		);
		expect(() =>
			validateChapterResearch({ ...output, summary: 'x'.repeat(2201) }, input)
		).toThrow();
	});
});
describe('explicit chapter activation', () => {
	const environment = {
		PRIVATE_OPENROUTER_API_KEY: 'offline',
		LIBRI_RESEARCH_MODEL: 'offline/chapter',
		LIBRI_RESEARCH_RESERVED_MICROUSD: '100'
	};
	it('keeps chapter processing off until explicitly configured with a search key and accounting rate', () => {
		expect(loadLibriResearchRuntimeConfig(environment).chapter).toBeUndefined();
		expect(() =>
			loadLibriResearchRuntimeConfig({
				...environment,
				LIBRI_CHAPTER_RESEARCH_ENABLED: 'true'
			})
		).toThrow();
		expect(() =>
			loadLibriResearchRuntimeConfig({
				...environment,
				LIBRI_CHAPTER_RESEARCH_ENABLED: 'true',
				PRIVATE_TAVILY_API_KEY: 'offline'
			})
		).toThrow();
		expect(
			loadLibriResearchRuntimeConfig({
				...environment,
				LIBRI_CHAPTER_RESEARCH_ENABLED: 'true',
				PRIVATE_TAVILY_API_KEY: 'offline',
				LIBRI_TAVILY_CREDIT_MICROUSD: '10'
			}).chapter
		).toEqual({ tavilyApiKey: 'offline', creditMicrousd: 10n });
	});
});
