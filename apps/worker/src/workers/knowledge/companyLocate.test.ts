// apps/worker/src/workers/knowledge/companyLocate.test.ts
//
// One organization's free lookup. Failures a user would feel, and what triggers them:
//   - a company never found again after a source had an outage → a failed request must not be
//     cached as "no such company"
//   - the same company looked up from scratch for every user → answers are cached by name
//   - a company with a known website filed under a namesake → the entry's own website decides
//   - the free APIs blocking BuildOS → requests to one host are spaced, and a "slow down" is
//     retried once
// No network: every request is answered from a table in the test.

import { describe, expect, it, vi } from 'vitest';
import type { CompanyCandidate, CompanySource } from '@buildos/shared-agent-ops/knowledge';
import { type CompanyLocateDeps, createPacedJsonFetch, locateCompany } from './companyLocate';

const SUMMIT_ROW = {
	name: 'summit consulting',
	website: 'summitllc.com',
	locality: 'washington',
	region: 'district of columbia',
	country: 'united states',
	industry: 'management consulting',
	size: '51-200',
	founded: 2003,
	linkedin_url: 'linkedin.com/company/summit-consulting-llc'
};

function harness(over: {
	directory?: CompanyLocateDeps['directory'];
	routes?: Array<[string, unknown | Error]>;
	html?: Record<string, string | null>;
}) {
	const cached = new Map<string, CompanyCandidate[]>();
	const asked: string[] = [];
	const pages: string[] = [];
	const deps: CompanyLocateDeps = {
		directory: over.directory ?? (async () => []),
		cache: {
			get: async (source, key) => cached.get(`${source}:${key}`) ?? null,
			set: async (source, key, candidates) => {
				cached.set(`${source}:${key}`, candidates);
			}
		},
		fetchJson: async (url) => {
			asked.push(url);
			const hit = (over.routes ?? []).find(([fragment]) => url.includes(fragment));
			if (hit?.[1] instanceof Error) throw hit[1];
			return hit ? hit[1] : [];
		},
		fetchHtml: async (url) => {
			pages.push(url);
			return over.html?.[url] ?? null;
		}
	};
	const keys = () => [...cached.keys()].sort();
	return { deps, asked, pages, cached, keys };
}

const hostsOf = (urls: string[]) => [...new Set(urls.map((url) => new URL(url).hostname))].sort();

describe('locateCompany', () => {
	it('asks every free source by the company name and nothing else', async () => {
		const h = harness({});
		const result = await locateCompany('Summit Consulting', null, h.deps);
		expect(result.verdict.outcome).toBe('none');
		expect(hostsOf(h.asked)).toEqual([
			'api.gleif.org',
			'api.usaspending.gov',
			'autocomplete.clearbit.com',
			'www.wikidata.org'
		]);
		// The only free text in any request is the name itself.
		for (const url of h.asked.filter((u) => !u.includes('usaspending'))) {
			expect(decodeURIComponent(url)).toContain('Summit Consulting');
		}
	});

	it('remembers what each source said, so a second lookup of the name asks nobody', async () => {
		const h = harness({ directory: async () => [SUMMIT_ROW] });
		const first = await locateCompany('Summit Consulting', null, h.deps);
		expect(first.verdict.outcome).toBe('unconfirmed');
		expect(first.sources).toMatchObject({
			clearbit: 'asked',
			gleif: 'asked',
			wikidata: 'asked',
			usaspending: 'asked'
		});
		const askedOnce = h.asked.length;
		expect(askedOnce).toBeGreaterThan(0);

		const second = await locateCompany('SUMMIT CONSULTING LLC', null, h.deps);
		expect(h.asked.length).toBe(askedOnce);
		expect(second.sources).toMatchObject({
			clearbit: 'cached',
			gleif: 'cached',
			wikidata: 'cached',
			usaspending: 'cached'
		});
		expect(second.verdict.chosen?.place?.name).toBe('Washington, DC');
	});

	it('does not remember an outage as "nobody has this name"', async () => {
		const h = harness({ routes: [['api.gleif.org', new Error('timeout')]] });
		const result = await locateCompany('Summit Consulting', null, h.deps);
		expect(result.sources.gleif).toBe('failed');
		expect(result.sources.clearbit).toBe('asked');
		expect(h.keys()).toEqual([
			'clearbit:summitconsulting',
			'usaspending:summitconsulting',
			'wikidata:summitconsulting'
		]);
	});

	it('places a company when the directory and Clearbit name the same website', async () => {
		const h = harness({
			directory: async () => [SUMMIT_ROW],
			routes: [
				[
					'autocomplete.clearbit.com',
					[{ name: 'Summit Consulting', domain: 'summitllc.com' }]
				]
			]
		});
		const { verdict } = await locateCompany('Summit Consulting', null, h.deps);
		expect(verdict.outcome).toBe('placed');
		expect(verdict.chosen).toMatchObject({
			domain: 'summitllc.com',
			industry: 'Management Consulting'
		});
		// It already has a town: its website is not fetched.
		expect(h.pages).toEqual([]);
	});

	it("reads a lone candidate's own website for its address, and keeps the result unconfirmed", async () => {
		const h = harness({
			routes: [
				[
					'autocomplete.clearbit.com',
					[{ name: 'Summit Consulting', domain: 'summitllc.com' }]
				]
			],
			html: {
				'https://summitllc.com':
					'<script type="application/ld+json">{"@type":"Organization","address":{"addressLocality":"Washington","addressRegion":"DC","addressCountry":"US"}}</script>'
			}
		});
		const { verdict, sources } = await locateCompany('Summit Consulting', null, h.deps);
		expect(h.pages).toEqual(['https://summitllc.com']);
		expect(sources.website).toBe('asked');
		expect(verdict.outcome).toBe('unconfirmed');
		expect(verdict.chosen?.place?.name).toBe('Washington, DC');
		expect(h.keys()).toContain('website:summitllc.com');
	});

	it('leaves a website with no published address as a lead only', async () => {
		const h = harness({
			routes: [
				[
					'autocomplete.clearbit.com',
					[{ name: 'Summit Consulting', domain: 'summitllc.com' }]
				]
			],
			html: { 'https://summitllc.com': '<html><body>Offices in Denver.</body></html>' }
		});
		const { verdict } = await locateCompany('Summit Consulting', null, h.deps);
		expect(verdict.outcome).toBe('none');
		expect(verdict.chosen?.domain).toBe('summitllc.com');
	});

	it("lets the entry's own website decide between same-name companies", async () => {
		const denver = {
			...SUMMIT_ROW,
			website: 'summitcg.com',
			locality: 'denver',
			region: 'colorado',
			size: '11-50'
		};
		const h = harness({ directory: async () => [SUMMIT_ROW, denver] });
		const without = await locateCompany('Summit Consulting', null, h.deps);
		expect(without.verdict.outcome).toBe('ask');

		const withSite = await locateCompany('Summit Consulting', 'summitcg.com', h.deps);
		expect(withSite.verdict.outcome).toBe('placed');
		expect(withSite.verdict.chosen?.place?.name).toBe('Denver, CO');
	});

	it('does not look up a name too short to mean one company', async () => {
		const h = harness({ directory: async () => [SUMMIT_ROW] });
		const { verdict } = await locateCompany('AB', null, h.deps);
		expect(verdict.outcome).toBe('none');
		expect(h.asked).toEqual([]);
	});

	it('still answers from the other sources when the directory cannot be read', async () => {
		const h = harness({
			directory: async () => {
				throw new Error('relation "company_directory" does not exist');
			},
			routes: [
				[
					'api.gleif.org',
					{
						data: [
							{
								attributes: {
									lei: 'LEI1',
									entity: {
										legalName: { name: 'SUMMIT CONSULTING LLC' },
										status: 'ACTIVE',
										headquartersAddress: {
											city: 'Washington',
											region: 'US-DC',
											country: 'US'
										}
									}
								}
							}
						]
					}
				]
			]
		});
		const { verdict } = await locateCompany('Summit Consulting', null, h.deps);
		expect(verdict.outcome).toBe('unconfirmed');
		expect(verdict.chosen?.sources.map((s) => s.source as CompanySource)).toEqual(['gleif']);
	});
});

describe('createPacedJsonFetch', () => {
	function clockedFetch(statuses: number[] = []) {
		let time = 1_000;
		type FetchInit = Parameters<typeof fetch>[1];
		const sent: Array<{ url: string; at: number; init: FetchInit }> = [];
		const fetchFn = vi.fn(async (url: Parameters<typeof fetch>[0], init?: FetchInit) => {
			sent.push({ url: String(url), at: time, init });
			const status = statuses.shift() ?? 200;
			return new Response(JSON.stringify({ ok: status === 200 }), { status });
		}) as unknown as typeof fetch;
		const sleeps: number[] = [];
		const fetchJson = createPacedJsonFetch({
			fetchFn,
			now: () => time,
			sleep: async (ms) => {
				sleeps.push(ms);
				time += ms;
			},
			minIntervalMs: { 'api.gleif.org': 1_100, 'www.wikidata.org': 200 }
		});
		return { fetchJson, sent, sleeps };
	}

	it('spaces requests to one host and lets other hosts go at once', async () => {
		const { fetchJson, sent } = clockedFetch();
		await Promise.all([
			fetchJson('https://api.gleif.org/a'),
			fetchJson('https://api.gleif.org/b'),
			fetchJson('https://www.wikidata.org/c')
		]);
		const at = (path: string) => sent.find((s) => s.url.endsWith(path))!.at;
		expect(at('/b') - at('/a')).toBeGreaterThanOrEqual(1_100);
		expect(sent.map((s) => new URL(s.url).pathname).sort()).toEqual(['/a', '/b', '/c']);
	});

	it('sends a body as JSON and names the client without any user detail', async () => {
		const { fetchJson, sent } = clockedFetch();
		await fetchJson('https://api.usaspending.gov/api/v2/recipient/', {
			method: 'POST',
			body: { keyword: 'Acme' }
		});
		const { init } = sent[0]!;
		expect(init?.method).toBe('POST');
		expect(init?.body).toBe('{"keyword":"Acme"}');
		expect((init?.headers as Record<string, string>)['user-agent']).toBe(
			'BuildOS-CompanyLookup/1.0 (+https://build-os.com)'
		);
	});

	it('waits and retries once when told to slow down, then gives up on a second refusal', async () => {
		const ok = clockedFetch([429, 200]);
		await expect(ok.fetchJson('https://api.gleif.org/a')).resolves.toEqual({ ok: true });
		expect(ok.sent).toHaveLength(2);
		expect(ok.sleeps).toContain(5_000);

		const refused = clockedFetch([429, 429]);
		await expect(refused.fetchJson('https://api.gleif.org/a')).rejects.toThrow(
			'api.gleif.org answered 429'
		);
	});

	it('a failed request does not block the next one to that host', async () => {
		const { fetchJson } = clockedFetch([500, 200]);
		await expect(fetchJson('https://www.wikidata.org/a')).rejects.toThrow('answered 500');
		await expect(fetchJson('https://www.wikidata.org/b')).resolves.toEqual({ ok: true });
	});
});
