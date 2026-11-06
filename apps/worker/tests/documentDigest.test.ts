// apps/worker/tests/documentDigest.test.ts
import { describe, expect, it } from 'vitest';
import {
	extractOutline,
	hashDocumentContent
} from '@buildos/shared-agent-ops/utils/document-outline';
import {
	cleanSummary,
	digestDue,
	digestInput,
	runDocumentDigestSweep,
	type DigestCandidate,
	type DigestClient
} from '../src/workers/document-digest/documentDigest';

const NOW = Date.parse('2026-11-05T12:00:00Z');
const minutesAgo = (m: number) => new Date(NOW - m * 60_000).toISOString();
const LONG = `## Budget\n${'We spend on venues and travel. '.repeat(12)}\n## Team\nBoard of five.`;

function doc(over: Partial<DigestCandidate> = {}, text = LONG): DigestCandidate {
	return {
		id: over.id ?? 'd1',
		project_id: 'p1',
		title: 'Launch',
		description: null,
		type_key: 'document.default',
		content_hash: hashDocumentContent(text),
		digest: null,
		outline: extractOutline(text),
		created_by: 'a1',
		updated_at: minutesAgo(10),
		...over
	};
}

describe('digestDue', () => {
	it('summarizes changed docs once they are quiet, never described/START HERE/table ones', () => {
		expect(digestDue(doc(), NOW)).toBe(true);
		expect(digestDue(doc({ updated_at: minutesAgo(1) }), NOW)).toBe(false); // still editing
		expect(digestDue(doc({ description: 'Mine' }), NOW)).toBe(false);
		expect(digestDue(doc({ type_key: 'document.context.project' }), NOW)).toBe(false);
		expect(digestDue(doc({ type_key: 'document.table' }), NOW)).toBe(false);
	});

	it('is done while the summary matches the text, and retries failures later', () => {
		const hash = hashDocumentContent(LONG);
		expect(digestDue(doc({ digest: { summary: 'x', content_hash: hash } }), NOW)).toBe(false);
		expect(digestDue(doc({ digest: { summary: 'x', content_hash: 'old' } }), NOW)).toBe(true);
		expect(digestDue(doc({ digest: { short: true, content_hash: hash } }), NOW)).toBe(false);
		expect(
			digestDue(doc({ digest: { failed_at: minutesAgo(30), content_hash: hash } }), NOW)
		).toBe(false);
		expect(
			digestDue(doc({ digest: { failed_at: minutesAgo(7 * 60), content_hash: hash } }), NOW)
		).toBe(true);
	});
});

describe('digestInput', () => {
	it('sends short text whole and long text in whole sections plus every heading', () => {
		expect(digestInput(LONG, extractOutline(LONG), 'Launch')).toBe(LONG);
		const sections = Array.from(
			{ length: 30 },
			(_, i) => `## Part ${i}\n${'word '.repeat(300)}`
		).join('\n');
		const input = digestInput(sections, extractOutline(sections), 'Big');
		expect(input.length).toBeLessThan(26_000);
		expect(input).toContain('## Part 0');
		expect(input).toMatch(/all its headings: .*Part 29/);
		// Cut on a section boundary: the last included section is complete.
		const body = input.split('\n[The document continues')[0]!;
		expect(body.trimEnd().endsWith('word')).toBe(true);
	});
});

it('cleanSummary trims, folds whitespace and caps length', () => {
	expect(cleanSummary({ summary: '  Plan  for\nlaunch. ' })).toBe('Plan for launch.');
	expect(cleanSummary({ summary: '' })).toBeNull();
	expect(cleanSummary(null)).toBeNull();
	expect(cleanSummary({ summary: 'x'.repeat(400) })!.length).toBe(280);
});

function fakeDb(listing: DigestCandidate[], texts: Record<string, string>) {
	const writes: { id: string; digest: Record<string, unknown>; guard: unknown }[] = [];
	const client = {
		from(table: string) {
			const filters: Record<string, unknown> = {};
			let update: Record<string, unknown> | null = null;
			let selected = '';
			const builder: Record<string, unknown> = {};
			for (const m of ['is', 'gt', 'lt', 'order', 'limit', 'not', 'in'])
				builder[m] = () => builder;
			builder.select = (cols: string) => ((selected = cols), builder);
			builder.update = (v: Record<string, unknown>) => ((update = v), builder);
			builder.eq = (c: string, v: unknown) => ((filters[c] = v), builder);
			builder.then = (ok: (v: unknown) => unknown) => {
				let data: unknown = [];
				if (update) {
					writes.push({
						id: filters.id as string,
						digest: update.digest as Record<string, unknown>,
						guard: filters.content_hash
					});
					data = null;
				} else if (table === 'onto_actors') data = [{ id: 'a1', user_id: 'u1' }];
				else if (selected.startsWith('content,')) {
					const text = texts[filters.id as string] ?? '';
					data = [
						{
							content: text,
							content_hash: hashDocumentContent(text),
							description: null,
							deleted_at: null
						}
					];
				} else data = listing;
				return Promise.resolve({ data, error: null }).then(ok);
			};
			return builder;
		}
	} as unknown as DigestClient;
	return { client, writes };
}

describe('runDocumentDigestSweep', () => {
	it('writes summaries guarded by the hash, marks short text, caps per owner', async () => {
		const short = 'call Sam re: venue';
		const listing = [
			...Array.from({ length: 7 }, (_, i) => doc({ id: `d${i}` })),
			doc({ id: 'short', created_by: 'a2' }, short)
		];
		const texts: Record<string, string> = { short };
		for (let i = 0; i < 7; i++) texts[`d${i}`] = LONG;
		const { client, writes } = fakeDb(listing, texts);
		const prompts: string[] = [];
		const llm = {
			getJSONResponse: async (o: { userPrompt: string; userId?: string }) => {
				prompts.push(o.userPrompt);
				expect(o.userId).toBe('u1');
				return { summary: 'Venue and travel budget, five-person board.' } as never;
			}
		};
		const result = await runDocumentDigestSweep({ db: client, llm, now: NOW });
		expect(result.outcomes).toMatchObject({ written: 5, short: 1 });
		expect(prompts).toHaveLength(5); // per-owner cap; the short note needs no call
		const written = writes.find((w) => w.id === 'd0')!;
		expect(written.guard).toBe(hashDocumentContent(LONG));
		expect(written.digest).toMatchObject({
			summary: 'Venue and travel budget, five-person board.',
			content_hash: hashDocumentContent(LONG)
		});
		expect(writes.find((w) => w.id === 'short')!.digest).toMatchObject({ short: true });
	});

	it('records a failure instead of throwing when the model fails', async () => {
		const { client, writes } = fakeDb([doc()], { d1: LONG });
		const llm = {
			getJSONResponse: async () => {
				throw new Error('provider down');
			}
		};
		const result = await runDocumentDigestSweep({ db: client, llm, now: NOW });
		expect(result.outcomes.failed).toBe(1);
		expect(writes[0]!.digest).toHaveProperty('failed_at');
	});
});
